export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { resolveSymbol } from "@/lib/symbols"

interface EODHDRealTimeData {
  code: string
  timestamp: number
  gmtoffset: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  previousClose: number
  change: number
  change_p: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbolParam = searchParams.get("symbol")

    if (!symbolParam) {
      return NextResponse.json({ success: false, error: "Symbol parameter required" }, { status: 400 })
    }

    const resolved = resolveSymbol(symbolParam)
    if ("error" in resolved) {
      return NextResponse.json({ success: false, error: resolved.error }, { status: 400 })
    }

    const symbol = resolved.provider
    console.log("[v0] Fetching real-time data for:", symbolParam, "-> resolved:", symbol)

    const apiKey = process.env.EODHD_API_KEY
    if (!apiKey) {
      console.error("[v0] EODHD_API_KEY missing")
      return NextResponse.json({ success: false, error: "API key not configured" }, { status: 500 })
    }

    // Use EODHD real-time endpoint
    const url = `https://eodhd.com/api/real-time/${symbol}?api_token=${apiKey}&fmt=json`
    console.log("[v0] Fetching real-time from EODHD:", url.replace(apiKey, "***"))

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error("[v0] EODHD Real-time API Response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 200)
      })
      throw new Error(`EODHD real-time API error: ${response.status} - ${response.statusText}`)
    }

    const data: EODHDRealTimeData = await response.json()
    console.log("[v0] Real-time data received:", data)

    // Format response
    const formattedData = {
      success: true,
      symbol: symbolParam,
      data: {
        price: data.close,
        open: data.open,
        high: data.high,
        low: data.low,
        volume: data.volume,
        previousClose: data.previousClose,
        change: data.change,
        changePercent: data.change_p,
        timestamp: data.timestamp,
        lastUpdate: new Date(data.timestamp * 1000).toISOString(),
      },
      meta: {
        provider: "EODHD",
        symbol: symbol,
        timezone: "UTC",
        delay: "Real-time", // EODHD provides real-time for most symbols
      }
    }

    return NextResponse.json(formattedData)

  } catch (error) {
    console.error("[v0] Real-time data error:", error)
    return NextResponse.json({ 
      success: false, 
      error: "Failed to fetch real-time data",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}
