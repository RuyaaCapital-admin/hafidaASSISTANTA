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
    const interval = searchParams.get("interval") || "daily" // changed default to "daily"

    if (!symbol) {
      return NextResponse.json({ error: "Missing required parameter: symbol" }, { status: 400 })
    }

    // Check cache first
    const cacheKey = `${symbol}-${from}-${to}-${interval}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    const apiKey = process.env.EODHD_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "EODHD API key not configured" }, { status: 500 })
    }

    let url: string

    if (interval === "daily") {
      // Daily data - use EOD endpoint
      const fromParam = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const toParam = to || new Date().toISOString().split("T")[0]
      url = `https://eodhd.com/api/eod/${symbol}?from=${fromParam}&to=${toParam}&api_token=${apiKey}&fmt=json`
    } else {
      // Intraday data - use intraday endpoint with proper interval mapping
      const intervalMap: Record<string, string> = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "1h": "1h",
      }
      const mappedInterval = intervalMap[interval] || "5m"
      url = `https://eodhd.com/api/intraday/${symbol}?interval=${mappedInterval}&api_token=${apiKey}&fmt=json`
    }

    console.log("[v0] Fetching from EODHD:", url.replace(apiKey, "***"))

    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: `Symbol ${symbol} not found` }, { status: 404 })
      }
      throw new Error(`EODHD API error: ${response.status} ${response.statusText}`)
    }

    const data: EODHDCandle[] = await response.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: `No data available for ${symbol}` }, { status: 404 })
    }

    const chartData = data
      .map((candle) => {
        let time: number
        if (interval === "daily") {
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
      .sort((a, b) => a.time - b.time) // Sort by time ascending

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
