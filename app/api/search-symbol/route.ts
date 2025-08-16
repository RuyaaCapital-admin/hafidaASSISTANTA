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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")

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
      throw new Error(`EODHD API error: ${response.status} ${response.statusText}`)
    }

    const data: EODHDSearchResult[] = await response.json()

    if (!Array.isArray(data)) {
      return NextResponse.json([])
    }

    // Transform and filter results
    const suggestions = data
      .filter((item) => item.Type === "Common Stock" || item.Type === "ETF") // Only stocks and ETFs
      .slice(0, 10) // Limit to 10 results
      .map((item) => ({
        symbol: `${item.Code}.${item.Exchange}`,
        name: item.Name,
        exchange: item.Exchange,
        country: item.Country,
        currency: item.Currency,
        displayText: `${item.Code}.${item.Exchange} - ${item.Name}`,
      }))

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
