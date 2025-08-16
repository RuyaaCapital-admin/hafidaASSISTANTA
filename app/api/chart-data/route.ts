export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"

// Simple in-memory cache with 1-minute expiration
const cache = new Map<string, { data: any; timestamp: number }>()
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
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const interval = searchParams.get("interval") || "daily"

    if (!symbol) {
      return NextResponse.json({ error: "Missing required parameter: symbol" }, { status: 400 })
    }

    const cleanSymbol = symbol
      .replace(/(-USD)?(-USD)+(\.CC)$/i, "-USD.CC")
      .replace(/(\.US)+(\.US)+$/i, ".US")
      .replace(/(\.FOREX)+(\.FOREX)+$/i, ".FOREX")
      .toUpperCase()

    console.log("[v0] Processing symbol:", symbol, "-> cleaned:", cleanSymbol)

    // Check cache first
    const cacheKey = `${cleanSymbol}-${from}-${to}-${interval}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    const apiKey = process.env.EODHD_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "EODHD API key not configured" }, { status: 500 })
    }

    let url: string
    let isAggregated = false

    const isForex = cleanSymbol.endsWith(".FOREX")
    const isCrypto = cleanSymbol.endsWith(".CC")
    const isStock = cleanSymbol.endsWith(".US") || (!isForex && !isCrypto)

    if (interval === "weekly" || interval === "monthly") {
      // For weekly/monthly, fetch daily data over a longer period
      const daysBack = interval === "weekly" ? 90 : 365
      const fromParam = from || new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const toParam = to || new Date().toISOString().split("T")[0]
      url = `https://eodhd.com/api/eod/${cleanSymbol}?from=${fromParam}&to=${toParam}&api_token=${apiKey}&fmt=json`
      isAggregated = true
    } else if (interval === "daily") {
      // Daily data - use EOD endpoint
      const fromParam = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const toParam = to || new Date().toISOString().split("T")[0]
      url = `https://eodhd.com/api/eod/${cleanSymbol}?from=${fromParam}&to=${toParam}&api_token=${apiKey}&fmt=json`
    } else {
      // Intraday data - use intraday endpoint with proper interval mapping
      const intervalMap: Record<string, string> = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "1h": "1h",
      }
      const mappedInterval = intervalMap[interval] || "5m"
      url = `https://eodhd.com/api/intraday/${cleanSymbol}?interval=${mappedInterval}&api_token=${apiKey}&fmt=json`
    }

    console.log("[v0] Fetching from EODHD:", url.replace(apiKey, "***"))

    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: `Symbol ${cleanSymbol} not found` }, { status: 404 })
      }
      throw new Error(`EODHD API error: ${response.status} ${response.statusText}`)
    }

    const data: EODHDCandle[] = await response.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: `No data available for ${cleanSymbol}` }, { status: 404 })
    }

    let processedData = data
      .map((candle) => {
        let time: number
        if (interval === "daily" || isAggregated) {
          // For daily data, use date string as Unix timestamp (days since epoch)
          time = Math.floor(new Date(candle.date + "T00:00:00Z").getTime() / 1000)
        } else {
          // For intraday data, convert datetime to Unix timestamp
          time = Math.floor(new Date(candle.date).getTime() / 1000)
        }

        return {
          time,
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: Number(candle.volume || 0),
          date: candle.date,
        }
      })
      .filter(
        (candle) =>
          !isNaN(candle.time) &&
          !isNaN(candle.open) &&
          !isNaN(candle.high) &&
          !isNaN(candle.low) &&
          !isNaN(candle.close),
      )
      .sort((a, b) => a.time - b.time)

    if (isAggregated) {
      const aggregated = aggregateCandles(processedData, interval as "weekly" | "monthly")
      processedData = aggregated
    }

    // Remove the date field from final output
    const chartData = processedData.map(({ date, ...candle }) => candle)

    console.log("[v0] Processed chart data:", chartData.length, "candles")

    // Cache the result
    cache.set(cacheKey, { data: chartData, timestamp: Date.now() })

    return NextResponse.json(chartData)
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
