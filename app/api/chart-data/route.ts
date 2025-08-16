export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { TIMEFRAME_CONFIGS, isIntraday } from "@/lib/timeframe"

const cache = new Map<string, { data: any; timestamp: number; ttl: number }>()
const CACHE_DURATION = 60 * 1000 // 1 minute

interface EODHDCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")
    const resolution = searchParams.get("resolution") || "daily"
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    if (!symbol) {
      return NextResponse.json({ error: "Missing required parameter: symbol" }, { status: 400 })
    }

    const cleanSymbol = symbol
      .replace(/(-USD)?(-USD)+(\.CC)$/i, "-USD.CC")
      .replace(/(\.US)+(\.US)+$/i, ".US")
      .replace(/(\.FOREX)+(\.FOREX)+$/i, ".FOREX")
      .toUpperCase()

    console.log("[v0] Processing symbol:", symbol, "-> cleaned:", cleanSymbol)

    const cacheKey = `${cleanSymbol}-${resolution}-${from}-${to}`
    const cached = cache.get(cacheKey)
    const ttl = isIntraday(resolution) ? 15 * 1000 : 60 * 1000 // 15s for intraday, 60s for EOD

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return NextResponse.json(cached.data)
    }

    const apiKey = process.env.EODHD_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "EODHD API key not configured" }, { status: 500 })
    }

    const timeframeConfig = TIMEFRAME_CONFIGS[resolution]
    if (!timeframeConfig) {
      return NextResponse.json({ error: `Unsupported resolution: ${resolution}` }, { status: 400 })
    }

    let chartData: any[] = []
    let lastPrice: number | undefined

    if (timeframeConfig.eodhd.type === "intraday") {
      try {
        const result = await fetchIntradayData(cleanSymbol, timeframeConfig.eodhd.interval!, apiKey)
        chartData = result.candles
        lastPrice = result.last
        console.log("[v0] Intraday data fetched:", chartData.length, "candles")
      } catch (error) {
        console.log(
          "[v0] Intraday failed, falling back to daily:",
          error instanceof Error ? error.message : "Unknown error",
        )
        // Fallback to daily data
        const result = await fetchDailyData(cleanSymbol, "d", from, to, apiKey)
        chartData = result.candles
        lastPrice = result.last
      }
    } else {
      const result = await fetchDailyData(cleanSymbol, timeframeConfig.eodhd.period!, from, to, apiKey)
      chartData = result.candles
      lastPrice = result.last
      console.log("[v0] EOD data fetched:", chartData.length, "candles")
    }

    if (chartData.length === 0) {
      return NextResponse.json({ error: `No data available for ${cleanSymbol}` }, { status: 404 })
    }

    const responseData = {
      candles: chartData,
      last: lastPrice,
      meta: {
        symbol: cleanSymbol,
        resolution,
        from: from || "auto",
        to: to || "auto",
      },
    }

    console.log("[v0] Processed chart data:", chartData.length, "candles")

    cache.set(cacheKey, { data: responseData, timestamp: Date.now(), ttl })

    return NextResponse.json(responseData)
  } catch (error) {
    console.error("Error fetching chart data:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch chart data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

async function fetchIntradayData(
  cleanSymbol: string,
  interval: string,
  apiKey: string,
): Promise<{ candles: any[]; last?: number }> {
  const url = `https://eodhd.com/api/intraday/${cleanSymbol}?interval=${interval}&api_token=${apiKey}&fmt=json`

  console.log("[v0] Fetching intraday from EODHD:", url.replace(apiKey, "***"))

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`EODHD intraday API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  console.log("[v0] Raw intraday response:", Array.isArray(data) ? `${data.length} items` : typeof data)

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No intraday data available for ${cleanSymbol}`)
  }

  const processedData = processIntradayCandles(data)
  console.log("[v0] Processed intraday candles:", processedData.length)

  if (processedData.length === 0) {
    throw new Error(`Failed to process intraday data for ${cleanSymbol}`)
  }

  const lastPrice = processedData.length > 0 ? processedData[processedData.length - 1].close : undefined

  return { candles: processedData, last: lastPrice }
}

async function fetchDailyData(
  cleanSymbol: string,
  period: string,
  from: string | null,
  to: string | null,
  apiKey: string,
): Promise<{ candles: any[]; last?: number }> {
  const daysBack = period === "w" ? 90 : period === "m" ? 365 : 30
  const fromParam = from || new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  const toParam = to || new Date().toISOString().split("T")[0]

  const url = `https://eodhd.com/api/eod/${cleanSymbol}?from=${fromParam}&to=${toParam}&period=${period}&api_token=${apiKey}&fmt=json`

  console.log("[v0] Fetching daily from EODHD:", url.replace(apiKey, "***"))

  const response = await fetch(url)

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Symbol ${cleanSymbol} not found`)
    }
    throw new Error(`EODHD daily API error: ${response.status} ${response.statusText}`)
  }

  const data: EODHDCandle[] = await response.json()
  console.log("[v0] Raw daily response:", Array.isArray(data) ? `${data.length} items` : typeof data)

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No daily data available for ${cleanSymbol}`)
  }

  const processedData = processCandles(data, true)
  const lastPrice = processedData.length > 0 ? processedData[processedData.length - 1].close : undefined

  return { candles: processedData.map(({ date, ...candle }) => candle), last: lastPrice }
}

function processIntradayCandles(data: any[]) {
  return data
    .map((item) => {
      // Handle different possible formats from EODHD intraday API
      const candle = {
        datetime: item.datetime || item.date || item.timestamp,
        open: item.open || item.o,
        high: item.high || item.h,
        low: item.low || item.l,
        close: item.close || item.c,
        volume: item.volume || item.v || 0,
      }

      // Validate that we have all required fields
      if (
        !candle.datetime ||
        candle.open === undefined ||
        candle.high === undefined ||
        candle.low === undefined ||
        candle.close === undefined
      ) {
        return null
      }

      // Convert datetime to timestamp
      let time: number
      if (typeof candle.datetime === "string") {
        time = Math.floor(new Date(candle.datetime).getTime() / 1000)
      } else if (typeof candle.datetime === "number") {
        // If it's already a timestamp, use it (might be in seconds or milliseconds)
        time = candle.datetime > 1000000000000 ? Math.floor(candle.datetime / 1000) : candle.datetime
      } else {
        return null
      }

      // Convert all values to numbers and validate
      const open = Number(candle.open)
      const high = Number(candle.high)
      const low = Number(candle.low)
      const close = Number(candle.close)
      const volume = Number(candle.volume)

      // Validate all numbers are valid
      if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        return null
      }

      // Validate price logic (high >= low, etc.)
      if (high < low || open < 0 || high < 0 || low < 0 || close < 0) {
        return null
      }

      return {
        time,
        open,
        high,
        low,
        close,
        volume,
      }
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

      // Convert all values to numbers with validation
      const open = Number(candle.open)
      const high = Number(candle.high)
      const low = Number(candle.low)
      const close = Number(candle.close)
      const volume = Number(candle.volume || 0)

      // Validate all numbers are valid and positive
      if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        return null
      }

      // Validate price logic
      if (high < low || open < 0 || high < 0 || low < 0 || close < 0) {
        return null
      }

      return {
        time,
        open,
        high,
        low,
        close,
        volume,
        date: candle.date,
      }
    })
    .filter((candle): candle is NonNullable<typeof candle> => candle !== null)
    .sort((a, b) => a.time - b.time)
}

function aggregateCandles(dailyData: any[], interval: "weekly" | "monthly") {
  if (dailyData.length === 0) return []

  const aggregated: any[] = []
  let currentPeriod: any[] = []
  let currentPeriodStart: Date | null = null

  for (const candle of dailyData) {
    const candleDate = new Date(candle.date)

    // Determine if this candle belongs to a new period
    let newPeriod = false

    if (interval === "weekly") {
      // Start new week on Monday
      const monday = new Date(candleDate)
      monday.setDate(candleDate.getDate() - candleDate.getDay() + 1)
      monday.setHours(0, 0, 0, 0)

      if (!currentPeriodStart || monday.getTime() !== currentPeriodStart.getTime()) {
        newPeriod = true
        currentPeriodStart = monday
      }
    } else if (interval === "monthly") {
      // Start new month on the 1st
      const firstOfMonth = new Date(candleDate.getFullYear(), candleDate.getMonth(), 1)

      if (!currentPeriodStart || firstOfMonth.getTime() !== currentPeriodStart.getTime()) {
        newPeriod = true
        currentPeriodStart = firstOfMonth
      }
    }

    // If new period and we have data from previous period, aggregate it
    if (newPeriod && currentPeriod.length > 0) {
      aggregated.push(aggregatePeriod(currentPeriod))
      currentPeriod = []
    }

    currentPeriod.push(candle)
  }

  // Aggregate the last period
  if (currentPeriod.length > 0) {
    aggregated.push(aggregatePeriod(currentPeriod))
  }

  return aggregated
}

function aggregatePeriod(candles: any[]) {
  if (candles.length === 0) throw new Error("Cannot aggregate empty period")

  const first = candles[0]
  const last = candles[candles.length - 1]

  return {
    time: first.time, // Use the time of the first candle in the period
    open: first.open,
    high: Math.max(...candles.map((c) => c.high)),
    low: Math.min(...candles.map((c) => c.low)),
    close: last.close,
    volume: candles.reduce((sum, c) => sum + c.volume, 0),
  }
}
