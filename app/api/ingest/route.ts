import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { resolveSymbol } from "@/lib/symbol-resolver"
import { GET as priceHandler } from "@/app/api/price/route"

let client: OpenAI | null = null
try {
  if (process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
} catch {
  client = null
}

const RATE_LIMIT = 10
const WINDOW = 60_000
const rate = new Map<string, { count: number; ts: number }>()

function checkLimit(ip: string) {
  const now = Date.now()
  const entry = rate.get(ip)
  if (!entry || now - entry.ts > WINDOW) {
    rate.set(ip, { count: 1, ts: now })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// simple timeout helper
async function runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ])
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local"
  if (!checkLimit(ip)) return NextResponse.json({ error: "rate limit" }, { status: 429 })
  const { message } = await req.json()
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 })

  let parsed: any
  if (client) {
    try {
      const routerPrompt = `Classify the user message into one of: price, switch, mark, analyze, chat. Respond ONLY with a JSON object {"type":"price|switch|mark|analyze|chat","symbol"?:"SYM","timeframe"?:"daily|weekly|monthly"}. Message: ${message}`
      const intent = await runWithTimeout(
        client!.responses.create({
          model: "gpt-4o-mini",
          input: routerPrompt,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
        30000,
      )
      parsed = JSON.parse(intent.output_text || "{}")
    } catch (e) {
      parsed = undefined
    }
  }
  if (!parsed) {
    const m = message.toLowerCase()
    let match
    if ((match = m.match(/(?:price\s+([a-z0-9.\-]+)|([a-z0-9.\-]+)\s+price)/))) parsed = { type: "price", symbol: match[1] || match[2] }
    else if ((match = m.match(/switch\s+(?:to\s+)?([a-z0-9.\-]+)/))) parsed = { type: "switch", symbol: match[1] }
    else if ((match = m.match(/mark\s+(?:.*\s)?(daily|weekly|monthly)?\s*levels?(?:\s+for\s+([a-z0-9.\-]+))?/))) parsed = { type: "mark", timeframe: match[1] || "daily", symbol: match[2] }
    else if (m.includes("analyze")) parsed = { type: "analyze" }
    else parsed = { type: "chat" }
  }
  const type = parsed.type as string

  if (type === "price" && parsed.symbol) {
    const symbol = resolveSymbol(parsed.symbol).provider
    const priceRes = await priceHandler(new Request(`${req.nextUrl.origin}/api/price?symbol=${symbol}`))
    const price = await priceRes.json()
    return NextResponse.json({ type: "price", symbol: price.symbol, last: price.last })
  }

  if (type === "switch" && parsed.symbol) {
    const symbol = resolveSymbol(parsed.symbol).provider
    return NextResponse.json({ type: "event", kind: "switch", symbol })
  }

  if (type === "mark") {
    const symbol = parsed.symbol ? resolveSymbol(parsed.symbol).provider : undefined
    return NextResponse.json({ type: "event", kind: "drawLevels", symbol, timeframe: parsed.timeframe || "daily" })
  }

  if (type === "analyze" || type === "chat") {
    const prompt = type === "analyze" ? `${message}. Provide analysis only without stating exact prices.` : message
    let text = ""
    if (client) {
      try {
        const ai = await runWithTimeout(
          client.responses.create({ model: "gpt-4o-mini", temperature: 0, input: prompt }),
          30000,
        )
        text = ai.output_text || ""
      } catch {}
    }
    const priceRegex = /\d+(?:\.\d+)?/
    if (!text) {
      text = "I won’t state live prices in chat. Ask: ‘price BTC’ / ‘price AAPL’, or I can switch the chart."
    } else if (priceRegex.test(text)) {
      text = "I won’t state live prices in chat. Ask: ‘price BTC’ / ‘price AAPL’, or I can switch the chart."
    }
    return NextResponse.json({ type: "message", content: text })
  }

  return NextResponse.json({ type: "message", content: "I couldn't understand." })
}

export const runtime = "nodejs"
