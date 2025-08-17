import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function detectIntent(text: string) {
  const msg = text.toLowerCase()
  if (msg.includes("analyze") || msg.includes("analysis") || msg.includes("forecast") || msg.includes("think")) return "analysis"
  if (msg.includes("price") || msg.includes("chart")) return "price"
  if (msg.includes("event") || msg.includes("news")) return "events"
  return "chat"
}

async function resolveSymbol(term: string, baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/eodhd?type=search&query=${encodeURIComponent(term)}`)
  const data = await res.json()
  if (Array.isArray(data) && data[0]) {
    const first = data[0]
    if (first.Code && first.Exchange) return `${first.Code}.${first.Exchange}`
  }
  return term.toUpperCase()
}

export async function POST(req: NextRequest) {
  const { message } = await req.json()
  const baseUrl = req.nextUrl.origin
  const intent = detectIntent(message)
  const symbolMatch = message.match(/([a-zA-Z]{2,10})/)
  const rawSymbol = symbolMatch ? symbolMatch[1] : "AAPL"
  const symbol = await resolveSymbol(rawSymbol, baseUrl)

  const responses: any[] = []

  if (intent === "price") {
    const quote = await fetch(`${baseUrl}/api/eodhd?type=quote&symbol=${symbol}`).then((r) => r.json())
    const price = quote.close || quote.price || quote.last
    responses.push({ type: "text", content: `${symbol} is trading at ${price}` })
    responses.push({ type: "chart", symbol })
  } else if (intent === "analysis") {
    const hist = await fetch(`${baseUrl}/api/eodhd?type=historical&symbol=${symbol}`).then((r) => r.json())
    const candles = hist.candles || []
    const summaryPrompt = `Provide a brief trading insight for ${symbol} based on this data: ${JSON.stringify(candles.slice(-30))}`
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: summaryPrompt }],
    })
    const text = ai.choices[0].message?.content || "No insight available"
    responses.push({ type: "text", content: text })
    responses.push({ type: "chart", symbol })
  } else if (intent === "events") {
    const events = await fetch(`${baseUrl}/api/eodhd?type=events`).then((r) => r.json())
    const rows = Array.isArray(events) ? events.slice(0, 5).map((e: any) => [e.date, e.event, e.country]) : []
    responses.push({ type: "table", headers: ["Date", "Event", "Country"], rows })
  } else {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: message }],
    })
    const text = ai.choices[0].message?.content || ""
    responses.push({ type: "text", content: text })
  }

  return NextResponse.json({ responses })
}
