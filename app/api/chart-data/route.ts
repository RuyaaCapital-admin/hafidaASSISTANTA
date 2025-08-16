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

    let chartData: any[] = []
    let finalInterval = interval

    // Try intraday first if requested
    if (interval !== "daily" && interval !== "weekly" && interval !== "monthly") {
      try {
        chartData = await fetchIntradayData(cleanSymbol, interval, apiKey)
        console.log("[v0] Intraday data fetched:", chartData.length, "candles")
      } catch (error) {
        console.log(
          "[v0] Intraday failed, falling back to daily:",
          error instanceof Error ? error.message : "Unknown error",
        )
        finalInterval = "daily"
      }
    }

    // If intraday failed or daily/weekly/monthly requested, fetch daily data
    if (chartData.length === 0) {
      chartData = await fetchDailyData(cleanSymbol, finalInterval, from, to, apiKey)
      console.log("[v0] Daily/aggregated data fetched:", chartData.length, "candles")
    }

    if (chartData.length === 0) {
      return NextResponse.json({ error: `No data available for ${cleanSymbol}` }, { status: 404 })
    }

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

async function fetchIntradayData(cleanSymbol: string, interval: string, apiKey: string): Promise<any[]> {
  const intervalMap: Record<string, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
  }
  const mappedInterval = intervalMap[interval] || "5m"
  const url = `https://eodhd.com/api/intraday/${cleanSymbol}?interval=${mappedInterval}&api_token=${apiKey}&fmt=json`

  console.log("[v0] Fetching intraday from EODHD:", url.replace(apiKey, "***"))

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`EODHD intraday API error: ${response.status} ${response.statusText}`)
  }

  const data: EODHDCandle[] = await response.json()
  console.log("[v0] Raw intraday response:", Array.isArray(data) ? `${data.length} items` : typeof data)

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No intraday data available for ${cleanSymbol}`)
  }

  return processCandles(data, false)
}

async function fetchDailyData(
  cleanSymbol: string,
  interval: string,
  from: string | null,
  to: string | null,
  apiKey: string,
): Promise<any[]> {
  let url: string
  let isAggregated = false

  if (interval === "weekly" || interval === "monthly") {
    const daysBack = interval === "weekly" ? 90 : 365
    const fromParam = from || new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const toParam = to || new Date().toISOString().split("T")[0]
    url = `https://eodhd.com/api/eod/${cleanSymbol}?from=${fromParam}&to=${toParam}&api_token=${apiKey}&fmt=json`
    isAggregated = true
  } else {
    const fromParam = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const toParam = to || new Date().toISOString().split("T")[0]
    url = `https://eodhd.com/api/eod/${cleanSymbol}?from=${fromParam}&to=${toParam}&api_token=${apiKey}&fmt=json`
  }

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

  let processedData = processCandles(data, true)

  if (isAggregated) {
    processedData = aggregateCandles(processedData, interval as "weekly" | "monthly")
  }

  return processedData.map(({ date, ...candle }) => candle)
}

function processCandles(data: EODHDCandle[], isDaily: boolean) {
  return data
    .map((candle) => {
      let time: number
      if (isDaily) {
        time = Math.floor(new Date(candle.date + "T00:00:00Z").getTime() / 1000)
      } else {
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
        !isNaN(candle.time) && !isNaN(candle.open) && !isNaN(candle.high) && !isNaN(candle.low) && !isNaN(candle.close),
    )
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
