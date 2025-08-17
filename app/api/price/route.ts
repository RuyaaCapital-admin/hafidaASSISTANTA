import { type NextRequest, NextResponse } from "next/server"
import { resolveSymbol } from "@/lib/symbols"

// In-memory cache with 10s TTL
const priceCache = new Map<string, { data: any; expires: number }>()
const pendingRequests = new Map<string, Promise<any>>()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")

    if (!symbol) {
      return NextResponse.json({ success: false, error: "Symbol parameter required" }, { status: 400 })
    }

    // Resolve symbol
    const resolved = resolveSymbol(symbol)
    if ("error" in resolved) {
      return NextResponse.json({ success: false, error: "Unsupported symbol" }, { status: 400 })
    }

    const provider = resolved.provider
    const now = Date.now()

    // Check cache first
    const cached = priceCache.get(provider)
    if (cached && cached.expires > now) {
      return NextResponse.json(cached.data)
    }

    // Dedupe parallel requests
    if (pendingRequests.has(provider)) {
      const result = await pendingRequests.get(provider)
      return NextResponse.json(result)
    }

    // Check API key
    const apiKey = process.env.EODHD_API_KEY
    if (!apiKey) {
      console.error("[v0] EODHD_API_KEY missing")
      return NextResponse.json({ success: false, error: "EODHD_API_KEY missing" }, { status: 500 })
    }

    // Fetch real-time price
    const fetchPromise = (async () => {
      try {
        const url = `https://eodhd.com/api/real-time/${provider}?api_token=${apiKey}&fmt=json`
        console.log(`[v0] Fetching real-time price: ${url.replace(apiKey, "***")}`)

        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`EODHD API error: ${response.status}`)
        }

        const data = await response.json()

        // Normalize response
        const result = {
          success: true,
          symbol: provider,
          last: Number.parseFloat(data.close || data.price || data.last || 0),
          ts: Math.floor(Date.now() / 1000),
        }

        // Cache for 10 seconds
        priceCache.set(provider, {
          data: result,
          expires: now + 10000,
        })

        return result
      } catch (error) {
        console.error("[v0] Error fetching real-time price:", error)
        return { success: false, error: "Failed to fetch price data" }
      }
    })()

    pendingRequests.set(provider, fetchPromise)
    const result = await fetchPromise
    pendingRequests.delete(provider)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Price API error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
