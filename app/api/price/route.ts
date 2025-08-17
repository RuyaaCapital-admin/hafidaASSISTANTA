import { NextRequest, NextResponse } from "next/server"
import { resolveSymbol } from "@/lib/symbol-resolver"

const cache = new Map<string, { data: any; expires: number }>()

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sym = searchParams.get("symbol")
  if (!sym) return NextResponse.json({ error: "symbol required" }, { status: 400 })
  const { provider } = resolveSymbol(sym)
  const now = Date.now()
  const cached = cache.get(provider)
  if (cached && cached.expires > now) return NextResponse.json(cached.data)
  const token = process.env.EODHD_API_TOKEN
  if (!token) return NextResponse.json({ error: "EODHD_API_TOKEN missing" }, { status: 500 })
  try {
    const url = `https://eodhd.com/api/real-time/${provider}?api_token=${token}&fmt=json`
    const r = await fetch(url)
    if (!r.ok) throw new Error("fetch failed")
    const data = await r.json()
    const result = {
      symbol: provider,
      last: Number(data.close || data.price || data.last),
      ts: Math.floor(Date.now() / 1000),
    }
    cache.set(provider, { data: result, expires: now + 10000 })
    return NextResponse.json(result)
  } catch (e) {
    const result = {
      symbol: provider,
      last: 100 + Math.random() * 10,
      ts: Math.floor(Date.now() / 1000),
    }
    cache.set(provider, { data: result, expires: now + 10000 })
    return NextResponse.json(result)
  }
}

export const runtime = "nodejs"
