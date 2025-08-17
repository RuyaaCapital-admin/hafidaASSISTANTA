export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { resolveSymbol } from "@/lib/symbols"

const cache = new Map<string, { data: any; expires: number }>()

interface EODHDCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const TIMEFRAME_MAP: Record<string, { type: "intraday" | "eod"; interval?: string; period?: string }> = {
  "1m": { type: "intraday", interval: "1m" },
  "5m": { type: "intraday", interval: "5m" },
  "15m": { type: "intraday", interval: "15m" },
  "1h": { type: "intraday", interval: "60m" },
  "4h": { type: "intraday", interval: "240m" },
  daily: { type: "eod", period: "d" },
  weekly: { type: "eod", period: "w" },
  monthly: { type: "eod", period: "m" },
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbolParam = searchParams.get("symbol")
    const resolution = searchParams.get("resolution") || "daily"
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    if (!symbolParam) {
      return NextResponse.json({ success: false, error: "Symbol parameter required" }, { status: 400 })
    }

    const resolved = resolveSymbol(symbolParam)
    if ("error" in resolved) {
      return NextResponse.json({ success: false, error: resolved.error }, { status: 400 })
    }

    const symbol = resolved.provider
    console.log("[v0] Processing symbol:", symbolParam, "-> resolved:", symbol)

    const cacheKey = `${symbol}-${resolution}-${from}-${to}`
    const now = Date.now()
    const cached = cache.get(cacheKey)

    if (cached && cached.expires > now) {
      return NextResponse.json(cached.data)
    }

    const apiKey = process.env.EODHD_API_KEY
    if (!apiKey) {
      console.error("[v0] EODHD_API_KEY missing - returning sample data")
      // Return sample data instead of error for demo purposes
      const sampleData = generateSampleData(symbol, resolution)
      return NextResponse.json({
        success: true,
        meta: { symbol, resolution, isSample: true },
        candles: sampleData,
        last: sampleData[sampleData.length - 1]?.close,
      })
    }

    const timeframeConfig = TIMEFRAME_MAP[resolution]
    if (!timeframeConfig) {
      return NextResponse.json({ success: false, error: `Unsupported resolution: ${resolution}` }, { status: 400 })
    }

    let chartData: any[] = []
    let lastPrice: number | undefined

    try {
      if (timeframeConfig.type === "intraday") {
        const result = await fetchIntradayData(symbol, timeframeConfig.interval!, apiKey)
        chartData = result.candles
        lastPrice = result.last
        console.log("[v0] Intraday data fetched:", chartData.length, "candles")
      } else {
        const result = await fetchDailyData(symbol, timeframeConfig.period!, from, to, apiKey)
        chartData = result.candles
        lastPrice = result.last
        console.log("[v0] EOD data fetched:", chartData.length, "candles")
      }
    } catch (error) {
      console.error("[v0] Error fetching chart data:", error)
      console.log("[v0] Falling back to sample data due to API error")

      // Return sample data as fallback
      const sampleData = generateSampleData(symbol, resolution)
      const responseData = {
        success: true,
        meta: { symbol, resolution, isSample: true },
        candles: sampleData,
        last: sampleData[sampleData.length - 1]?.close,
      }

      return NextResponse.json(responseData)
    }

    if (chartData.length === 0) {
      return NextResponse.json({ success: false, error: `No data available for ${symbol}` }, { status: 404 })
    }

    const responseData = {
      success: true,
      meta: { symbol, resolution },
      candles: chartData,
      last: lastPrice,
    }

    console.log("[v0] Processed chart data:", chartData.length, "candles")

    const ttl = timeframeConfig.type === "intraday" ? 15000 : 60000
    cache.set(cacheKey, { data: responseData, expires: now + ttl })

    return NextResponse.json(responseData)
  } catch (error) {
    console.error("[v0] Chart data API error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

async function fetchIntradayData(
  symbol: string,
  interval: string,
  apiKey: string,
): Promise<{ candles: any[]; last?: number }> {
  const url = `https://eodhd.com/api/intraday/${symbol}?interval=${interval}&api_token=${apiKey}&fmt=json`
  console.log("[v0] Fetching intraday from EODHD:", url.replace(apiKey, "***"))

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`EODHD intraday API error: ${response.status}`)
  }

  const data = await response.json()
  console.log("[v0] Raw intraday response:", Array.isArray(data) ? `${data.length} items` : typeof data)

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No intraday data available for ${symbol}`)
  }

  const processedData = processIntradayCandles(data)
  const lastPrice = processedData.length > 0 ? processedData[processedData.length - 1].close : undefined

  return { candles: processedData, last: lastPrice }
}

async function fetchDailyData(
  symbol: string,
  period: string,
  from: string | null,
  to: string | null,
  apiKey: string,
): Promise<{ candles: any[]; last?: number }> {
  const daysBack = period === "w" ? 90 : period === "m" ? 365 : 30
  const fromParam = from || new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  const toParam = to || new Date().toISOString().split("T")[0]

  const url = `https://eodhd.com/api/eod/${symbol}?from=${fromParam}&to=${toParam}&period=${period}&api_token=${apiKey}&fmt=json`
  console.log("[v0] Fetching daily from EODHD:", url.replace(apiKey, "***"))

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`EODHD daily API error: ${response.status}`)
  }

  const data: EODHDCandle[] = await response.json()
  console.log("[v0] Raw daily response:", Array.isArray(data) ? `${data.length} items` : typeof data)

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No daily data available for ${symbol}`)
  }

  const processedData = processCandles(data, true)
  const lastPrice = processedData.length > 0 ? processedData[processedData.length - 1].close : undefined

  return { candles: processedData, last: lastPrice }
}

function processIntradayCandles(data: any[]) {
  return data
    .map((item) => {
      const candle = {
        datetime: item.datetime || item.date || item.timestamp,
        open: item.open || item.o,
        high: item.high || item.h,
        low: item.low || item.l,
        close: item.close || item.c,
        volume: item.volume || item.v || 0,
      }

      if (
        !candle.datetime ||
        candle.open === undefined ||
        candle.high === undefined ||
        candle.low === undefined ||
        candle.close === undefined
      ) {
        return null
      }

      let time: number
      if (typeof candle.datetime === "string") {
        time = Math.floor(new Date(candle.datetime).getTime() / 1000)
      } else if (typeof candle.datetime === "number") {
        time = candle.datetime > 1000000000000 ? Math.floor(candle.datetime / 1000) : candle.datetime
      } else {
        return null
      }

      const open = Number(candle.open)
      const high = Number(candle.high)
      const low = Number(candle.low)
      const close = Number(candle.close)
      const volume = Number(candle.volume)

      if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        return null
      }

      if (high < low || open < 0 || high < 0 || low < 0 || close < 0) {
        return null
      }

      return { time, open, high, low, close, volume }
    })
    .filter((candle): candle is NonNullable<typeof candle> => candle !== null)
    .sort((a, b) => a.time - b.time)
}

function processCandles(data: EODHDCandle[], isDaily: boolean) {
  return data
    .map((candle) => {
      if (
        !candle.date ||
        candle.open === undefined ||
        candle.high === undefined ||
        candle.low === undefined ||
        candle.close === undefined
      ) {
        return null
      }

      let time: number
      if (isDaily) {
        time = Math.floor(new Date(candle.date + "T00:00:00Z").getTime() / 1000)
      } else {
        time = Math.floor(new Date(candle.date).getTime() / 1000)
      }

      const open = Number(candle.open)
      const high = Number(candle.high)
      const low = Number(candle.low)
      const close = Number(candle.close)
      const volume = Number(candle.volume || 0)

      if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        return null
      }

      if (high < low || open < 0 || high < 0 || low < 0 || close < 0) {
        return null
      }

      return { time, open, high, low, close, volume }
    })
    .filter((candle): candle is NonNullable<typeof candle> => candle !== null)
    .sort((a, b) => a.time - b.time)
}

function generateSampleData(symbol: string, resolution: string) {
  const data = []
  let basePrice = symbol.includes("AAPL") ? 150 : symbol.includes("TSLA") ? 250 : 100
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30) // 30 days of data

  const intervalInDays = resolution === "weekly" ? 7 : resolution === "monthly" ? 30 : 1
  const dataPoints = resolution === "monthly" ? 12 : resolution === "weekly" ? 30 : 30

  for (let i = 0; i < dataPoints; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i * intervalInDays)

    const change = (Math.random() - 0.5) * (basePrice * 0.05) // 5% daily volatility
    const open = basePrice
    const close = basePrice + change
    const high = Math.max(open, close) + Math.random() * (basePrice * 0.02)
    const low = Math.min(open, close) - Math.random() * (basePrice * 0.02)
    const volume = Math.floor(Math.random() * 1000000) + 100000

    data.push({
      time: Math.floor(date.getTime() / 1000),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    })

    basePrice = close
  }

  return data.sort((a, b) => a.time - b.time)
}
