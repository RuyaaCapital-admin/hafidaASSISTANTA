export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"

// Simple in-memory cache with 5-minute expiration for IV data
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

interface EMCalculationRequest {
  symbol: string
  timeframe: "daily" | "weekly" | "monthly" | "custom"
  customDays?: number
}

interface EMResult {
  symbol: string
  close: number
  iv: number
  em: number
  upperEM: number
  lowerEM: number
  upper2Sigma: number
  lower2Sigma: number
  timeframe: string
  tradingDays: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")
    const timeframe = searchParams.get("timeframe") || "weekly"
    const customDays = searchParams.get("customDays")

    if (!symbol) {
      return NextResponse.json({ error: "Missing required parameter: symbol" }, { status: 400 })
    }

    const apiKey = process.env.EODHD_API_TOKEN
    if (!apiKey) {
      return NextResponse.json({ error: "EODHD API token not configured" }, { status: 500 })
    }

    // Check cache first
    const cacheKey = `em-${symbol}-${timeframe}-${customDays}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    // Get current price from EOD data
    const priceUrl = `https://eodhd.com/api/real-time/${symbol}?api_token=${apiKey}&fmt=json`
    const priceResponse = await fetch(priceUrl)

    if (!priceResponse.ok) {
      throw new Error(`Failed to fetch price data: ${priceResponse.status}`)
    }

    const priceData = await priceResponse.json()
    const currentPrice = Number(priceData.close || priceData.previousClose)

    if (!currentPrice || isNaN(currentPrice)) {
      throw new Error(`Invalid price data for ${symbol}`)
    }

    // Get implied volatility from options data
    // Note: This is a simplified approach - in production, you'd want to get ATM options IV
    let impliedVolatility = 0.25 // Default 25% IV as fallback

    try {
      const optionsUrl = `https://eodhd.com/api/options/${symbol}?api_token=${apiKey}&fmt=json`
      const optionsResponse = await fetch(optionsUrl)

      if (optionsResponse.ok) {
        const optionsData = await optionsResponse.json()

        // Find ATM options and get average IV
        if (optionsData.data && Array.isArray(optionsData.data)) {
          const atmOptions = optionsData.data
            .filter((option: any) => Math.abs(option.strike - currentPrice) < currentPrice * 0.05)
            .filter((option: any) => option.impliedVolatility && option.impliedVolatility > 0)

          if (atmOptions.length > 0) {
            const avgIV =
              atmOptions.reduce((sum: number, opt: any) => sum + opt.impliedVolatility, 0) / atmOptions.length
            impliedVolatility = avgIV
          }
        }
      }
    } catch (error) {
      console.log("[v0] Could not fetch IV data, using default:", error)
    }

    // Calculate trading days based on timeframe
    let tradingDays: number
    switch (timeframe) {
      case "daily":
        tradingDays = 1
        break
      case "weekly":
        tradingDays = 5
        break
      case "monthly":
        tradingDays = 21
        break
      case "custom":
        tradingDays = Number(customDays) || 5
        break
      default:
        tradingDays = 5
    }

    // Calculate Expected Move: EM = Price × IV × sqrt(T/252)
    const timeRatio = Math.sqrt(tradingDays / 252)
    const expectedMove = currentPrice * impliedVolatility * timeRatio

    const result: EMResult = {
      symbol,
      close: currentPrice,
      iv: impliedVolatility,
      em: expectedMove,
      upperEM: currentPrice + expectedMove,
      lowerEM: currentPrice - expectedMove,
      upper2Sigma: currentPrice + 2 * expectedMove,
      lower2Sigma: currentPrice - 2 * expectedMove,
      timeframe,
      tradingDays,
    }

    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error calculating expected move:", error)
    return NextResponse.json(
      {
        error: "Failed to calculate expected move",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: { symbols: string[]; timeframe: string; customDays?: number } = await request.json()
    const { symbols, timeframe, customDays } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "Missing or invalid symbols array" }, { status: 400 })
    }

    const results: EMResult[] = []
    const errors: string[] = []

    // Process symbols in parallel but limit concurrency
    const batchSize = 5
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize)
      const batchPromises = batch.map(async (symbol) => {
        try {
          const url = new URL(`${request.nextUrl.origin}/api/expected-move`)
          url.searchParams.set("symbol", symbol)
          url.searchParams.set("timeframe", timeframe)
          if (customDays) url.searchParams.set("customDays", customDays.toString())

          const response = await fetch(url.toString())
          if (response.ok) {
            const result = await response.json()
            results.push(result)
          } else {
            const error = await response.json()
            errors.push(`${symbol}: ${error.error}`)
          }
        } catch (error) {
          errors.push(`${symbol}: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
      })

      await Promise.all(batchPromises)
    }

    return NextResponse.json({ results, errors })
  } catch (error) {
    console.error("Error in batch EM calculation:", error)
    return NextResponse.json({ error: "Failed to process batch calculation" }, { status: 500 })
  }
}
