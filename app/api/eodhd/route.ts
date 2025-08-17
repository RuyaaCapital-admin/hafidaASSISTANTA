import { NextRequest, NextResponse } from "next/server"

const BASE_URL = "https://eodhd.com/api"

export async function GET(req: NextRequest) {
  const token = process.env.EODHD_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: "EODHD_API_TOKEN not set" }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")
  const symbol = searchParams.get("symbol") || ""

  try {
    switch (type) {
      case "quote": {
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 })
        const url = `${BASE_URL}/real-time/${symbol}?api_token=${token}&fmt=json`
        const data = await fetch(url).then((r) => r.json())
        return NextResponse.json(data)
      }
      case "historical": {
        if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 })
        const interval = searchParams.get("interval")?.toLowerCase() || "1d"
        const to = searchParams.get("to") || new Date().toISOString().slice(0, 10)
        const fromParam = searchParams.get("from")
        const fromDefault = new Date()
        fromDefault.setDate(fromDefault.getDate() - 30)
        const from = fromParam || fromDefault.toISOString().slice(0, 10)

        let url: string
        if (interval.endsWith("d")) {
          url = `${BASE_URL}/eod/${symbol}?api_token=${token}&fmt=json&from=${from}&to=${to}`
        } else {
          url = `${BASE_URL}/intraday/${symbol}?api_token=${token}&fmt=json&interval=${interval}`
        }
        const raw = await fetch(url).then((r) => r.json())
        const candles = Array.isArray(raw)
          ? raw.map((c: any) => ({
              time: Math.floor(new Date(c.datetime || c.date).getTime() / 1000),
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close),
            }))
          : []
        const last = candles.length ? candles[candles.length - 1].close : undefined
        return NextResponse.json({ candles, last })
      }
      case "events": {
        const to = searchParams.get("to") || new Date().toISOString().slice(0, 10)
        const fromParam = searchParams.get("from")
        const fromDefault = new Date()
        fromDefault.setDate(fromDefault.getDate() - 7)
        const from = fromParam || fromDefault.toISOString().slice(0, 10)
        const url = `${BASE_URL}/economic-events?api_token=${token}&fmt=json&from=${from}&to=${to}`
        const events = await fetch(url).then((r) => r.json())
        return NextResponse.json(events)
      }
      case "search": {
        const query = searchParams.get("query")
        if (!query) return NextResponse.json({ error: "query required" }, { status: 400 })
        const url = `${BASE_URL}/search/${encodeURIComponent(query)}?api_token=${token}&fmt=json&limit=10&type=all`
        const results = await fetch(url).then((r) => r.json())
        return NextResponse.json(results)
      }
      default:
        return NextResponse.json({ error: "unknown type" }, { status: 400 })
    }
  } catch (e) {
    console.error("EODHD API error", e)
    return NextResponse.json({ error: "failed to fetch" }, { status: 500 })
  }
}
