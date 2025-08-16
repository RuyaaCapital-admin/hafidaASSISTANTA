export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"

interface EODHDSearchResult {
  Code: string
  Exchange: string
  Name: string
  Type: string
  Country: string
  Currency: string
}

interface SearchResultItem {
  display: string
  providerSymbol: string
  type: "stock" | "etf" | "forex" | "crypto"
  exchange?: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("query")

    if (!query || query.length < 1) {
      return NextResponse.json({ error: "Missing or invalid query parameter" }, { status: 400 })
    }

    const apiKey = process.env.EODHD_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "EODHD API key not configured" }, { status: 500 })
    }

    const encodedQuery = encodeURIComponent(query.trim())
    const url = `https://eodhd.com/api/search/${encodedQuery}?api_token=${apiKey}&fmt=json&limit=15&type=all`

    console.log("[v0] Searching symbols:", query)
    console.log("[v0] EODHD search URL:", url.replace(apiKey, "***"))

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "HafidAssistanta/1.0",
      },
    })

    console.log("[v0] EODHD search response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] EODHD search error response:", errorText)

      if (response.status === 429) {
        return NextResponse.json({ error: "Search temporarily unavailable" }, { status: 429 })
      }
      if (response.status === 401) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 500 })
      }
      if (response.status === 404) {
        console.warn("[v0] EODHD search returned 404, returning empty results")
        return NextResponse.json([])
      }
      throw new Error(`EODHD API error: ${response.status} ${response.statusText}`)
    }

    const data: EODHDSearchResult[] = await response.json()
    console.log("[v0] EODHD search results count:", Array.isArray(data) ? data.length : 0)

    if (!Array.isArray(data)) {
      return NextResponse.json([])
    }

    const suggestions: SearchResultItem[] = data
      .slice(0, 15) // Limit to 15 results
      .map((item): SearchResultItem => {
        const code = item.Code
        const exchange = item.Exchange
        let providerSymbol: string
        let type: "stock" | "etf" | "forex" | "crypto"

        if (exchange === "CC") {
          // Crypto: ensure proper format like BTC-USD.CC
          if (code.includes("-")) {
            providerSymbol = `${code}.CC`
          } else {
            providerSymbol = `${code}-USD.CC`
          }
          type = "crypto"
        } else if (exchange === "FOREX") {
          providerSymbol = `${code}.FOREX`
          type = "forex"
        } else if (exchange === "US" || exchange === "NYSE" || exchange === "NASDAQ") {
          providerSymbol = `${code}.US`
          type = item.Type === "ETF" ? "etf" : "stock"
        } else {
          // For other exchanges, keep the original format
          providerSymbol = `${code}.${exchange}`
          type = item.Type === "ETF" ? "etf" : "stock"
        }

        return {
          display: `${item.Name || code} (${code})`,
          providerSymbol,
          type,
          exchange: exchange,
        }
      })

    console.log("[v0] Processed search suggestions:", suggestions.length)
    return NextResponse.json(suggestions)
  } catch (error) {
    console.error("Error searching symbols:", error)
    return NextResponse.json([])
  }
}
