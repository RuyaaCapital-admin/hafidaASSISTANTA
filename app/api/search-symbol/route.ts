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

    const url = `https://eodhd.com/api/search/${encodeURIComponent(query)}?api_token=${apiKey}&fmt=json`

    console.log("[v0] Searching symbols:", query)

    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json({ error: "Search temporarily unavailable" }, { status: 429 })
      }
      throw new Error(`EODHD API error: ${response.status} ${response.statusText}`)
    }

    const data: EODHDSearchResult[] = await response.json()

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

        // Map exchange to proper suffix
        if (exchange === "CC") {
          providerSymbol = `${code}-USD.CC`
          type = "crypto"
        } else if (exchange === "FOREX") {
          providerSymbol = `${code}.FOREX`
          type = "forex"
        } else if (exchange === "US") {
          providerSymbol = `${code}.US`
          type = item.Type === "ETF" ? "etf" : "stock"
        } else {
          // For other exchanges, keep the original format
          providerSymbol = `${code}.${exchange}`
          type = item.Type === "ETF" ? "etf" : "stock"
        }

        return {
          display: item.Name || code,
          providerSymbol,
          type,
          exchange: exchange,
        }
      })

    return NextResponse.json(suggestions)
  } catch (error) {
    console.error("Error searching symbols:", error)
    return NextResponse.json(
      {
        error: "Failed to search symbols",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
