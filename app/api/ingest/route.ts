export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { resolveSymbol } from "@/lib/symbols"

function createOpenAIClient(): OpenAI | null {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error("[v0] OpenAI API key not found in environment variables")
      return null
    }

    const trimmedKey = apiKey.trim()
    if (!trimmedKey || trimmedKey.length === 0) {
      console.error("[v0] OpenAI API key is empty or contains only whitespace")
      return null
    }

    if (!trimmedKey.startsWith("sk-")) {
      console.error("[v0] OpenAI API key appears to have invalid format (should start with 'sk-')")
      return null
    }

    if (trimmedKey.length < 20) {
      console.error("[v0] OpenAI API key appears too short to be valid")
      return null
    }

    console.log("[v0] OpenAI API key validation passed, creating client...")
    return new OpenAI({
      apiKey: trimmedKey,
      dangerouslyAllowBrowser: true,
    })
  } catch (error) {
    console.error("[v0] Error creating OpenAI client:", error)
    return null
  }
}

function parseIntent(message: string): {
  type: "price" | "switch" | "mark" | "analyze" | "chat"
  symbol?: string
  timeframe?: string
} {
  if (!message || typeof message !== "string") {
    return { type: "chat" }
  }

  const msg = message.toLowerCase().trim()

  // Enhanced price patterns - more flexible
  const pricePatterns = [
    /(?:^price\s+([A-Za-z.\-\u0600-\u06FF]+))/i,
    /(?:^([A-Za-z.\-\u0600-\u06FF]+)\s+price$)/i,
    /(?:what'?s\s+([A-Za-z.\-\u0600-\u06FF]+)\s+(?:price|cost|value))/i,
    /(?:^([A-Za-z.\-\u0600-\u06FF]+)\s+now$)/i,
    /(?:how\s+much\s+(?:is\s+)?([A-Za-z.\-\u0600-\u06FF]+))/i,
    /(?:current\s+price\s+(?:of\s+)?([A-Za-z.\-\u0600-\u06FF]+))/i,
    /(?:^([A-Za-z.\-\u0600-\u06FF]+)\s+\$)/i,
  ]

  for (const pattern of pricePatterns) {
    const match = msg.match(pattern)
    if (match) {
      const symbol = match[1]
      return { type: "price", symbol: symbol?.toUpperCase() }
    }
  }

  // Enhanced switch patterns
  const switchPatterns = [
    /(?:switch|load|show|change)\s+(?:chart\s+)?(?:to\s+)?([A-Za-z.\-\u0600-\u06FF]+)/i,
    /(?:open|display)\s+([A-Za-z.\-\u0600-\u06FF]+)(?:\s+chart)?/i,
  ]

  for (const pattern of switchPatterns) {
    const match = msg.match(pattern)
    if (match) {
      return { type: "switch", symbol: match[1]?.toUpperCase() }
    }
  }

  // Enhanced mark levels patterns
  const markPatterns = [
    /(?:mark|draw|add)\s+(?:the\s+)?(?:(daily|weekly|monthly)\s+)?levels(?:\s+(?:for|on)\s+([A-Za-z.\-\u0600-\u06FF]+))?/i,
    /(?:show|display)\s+(?:(daily|weekly|monthly)\s+)?(?:levels|lines)/i,
  ]

  for (const pattern of markPatterns) {
    const match = msg.match(pattern)
    if (match) {
      return {
        type: "mark",
        symbol: match[2]?.toUpperCase(),
        timeframe: match[1]?.toLowerCase() || "daily",
      }
    }
  }

  // Enhanced analyze patterns
  const analyzePatterns = [
    /(?:analy[sz]e)(?:\s+(?:current\s+)?chart)?(?:\s+([A-Za-z.\-\u0600-\u06FF]+))?(?:\s+(daily|weekly|monthly))?/i,
    /(?:what\s+(?:do\s+you\s+)?think\s+about)\s+([A-Za-z.\-\u0600-\u06FF]+)/i,
    /(?:technical\s+analysis)\s+(?:of\s+)?([A-Za-z.\-\u0600-\u06FF]+)/i,
  ]

  for (const pattern of analyzePatterns) {
    const match = msg.match(pattern)
    if (match) {
      return {
        type: "analyze",
        symbol: match[1]?.toUpperCase(),
        timeframe: match[2]?.toLowerCase() || "daily",
      }
    }
  }

  return { type: "chat" }
}

async function switchSymbol(symbol: string) {
  try {
    const resolved = resolveSymbol(symbol)
    if ("error" in resolved) {
      return { type: "chat", message: `Unsupported symbol: ${symbol}` }
    }

    return {
      type: "actions",
      actions: [
        { kind: "switch", payload: { symbol: resolved.provider } },
        { kind: "toast", payload: { text: `Switched to ${resolved.user}` } },
      ],
    }
  } catch (error) {
    console.error("[v0] Switch symbol error:", error)
    return { type: "chat", message: "Sorry, failed to process." }
  }
}

async function getPrice(symbol: string) {
  try {
    const resolved = resolveSymbol(symbol)
    if ("error" in resolved) {
      return { type: "chat", message: `Unsupported symbol: ${symbol}` }
    }

    const response = await fetch(`/api/price?symbol=${encodeURIComponent(resolved.provider)}`)
    const data = await response.json()

    if (!data.success) {
      return { type: "chat", message: `Failed: ${data.error || "price unavailable"}` }
    }

    return {
      type: "actions",
      actions: [
        { kind: "updateHeader", payload: { symbol: resolved.provider, last: data.last, ts: data.ts } },
        { kind: "toast", payload: { text: `${resolved.user} ${data.last}` } },
      ],
      message: `${resolved.user} ${data.last}`,
    }
  } catch (error) {
    console.error("[v0] Get price error:", error)
    return { type: "chat", message: "Sorry, failed to process." }
  }
}

async function markLevels(symbol: string, timeframe = "daily") {
  try {
    const resolved = resolveSymbol(symbol)
    if ("error" in resolved) {
      return { type: "chat", message: `Unsupported symbol: ${symbol}` }
    }

    const response = await fetch(
      `/api/chart-data?symbol=${encodeURIComponent(resolved.provider)}&resolution=${timeframe}`,
    )
    const data = await response.json()

    if (!data.success) {
      return { type: "chat", message: "Could not fetch candles." }
    }

    // Compute sigma lines using existing logic
    const prices = data.candles.map((candle: any) => candle.close)
    const mean = prices.reduce((sum: number, price: number) => sum + price, 0) / prices.length
    const variance = prices.reduce((sum: number, price: number) => sum + Math.pow(price - mean, 2), 0) / prices.length
    const stdDev = Math.sqrt(variance)

    const lines = [
      { price: mean + stdDev, label: "+1σ", color: "#22c55e", width: 1 },
      { price: mean - stdDev, label: "-1σ", color: "#22c55e", width: 1 },
      { price: mean + 2 * stdDev, label: "+2σ", color: "#ef4444", width: 2 },
      { price: mean - 2 * stdDev, label: "-2σ", color: "#ef4444", width: 2 },
    ]

    // Optional persist (best-effort)
    try {
      await fetch("/api/level-sets/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: resolved.provider, timeframe, lines }),
      })
    } catch {}

    return {
      type: "actions",
      actions: [
        { kind: "drawLevels", payload: { symbol: resolved.provider, timeframe, lines } },
        { kind: "toast", payload: { text: `${resolved.user} ${timeframe} levels drawn` } },
      ],
    }
  } catch (error) {
    console.error("[v0] Mark levels error:", error)
    return { type: "chat", message: "Sorry, failed to process." }
  }
}

async function analyze(symbol: string, timeframe = "daily") {
  try {
    const resolved = resolveSymbol(symbol)
    if ("error" in resolved) {
      return { type: "chat", message: `Unsupported symbol: ${symbol}` }
    }

    // Fetch candles and recent levels
    const response = await fetch(
      `/api/chart-data?symbol=${encodeURIComponent(resolved.provider)}&resolution=${timeframe}`,
    )
    const data = await response.json()

    if (!data.success || !data.candles || data.candles.length === 0) {
      return { type: "chat", message: "No data available for analysis." }
    }

    const candles = data.candles
    const lastCandle = candles[candles.length - 1]
    const prevCandle = candles[candles.length - 2]

    let analysis = `📊 ${resolved.user} Analysis:\n`
    analysis += `Current: $${lastCandle.close.toFixed(2)}\n`

    if (prevCandle) {
      const change = (((lastCandle.close - prevCandle.close) / prevCandle.close) * 100).toFixed(2)
      analysis += `Change: ${Number.parseFloat(change) > 0 ? "+" : ""}${change}%\n`
    }

    analysis += `Range: $${lastCandle.low.toFixed(2)} - $${lastCandle.high.toFixed(2)}\n`
    analysis += `Volume: ${lastCandle.volume?.toLocaleString() || "N/A"}`

    return { type: "chat", message: analysis }
  } catch (error) {
    console.error("[v0] Analyze error:", error)
    return { type: "chat", message: "Sorry, failed to process." }
  }
}

async function generateChatResponse(message: string, context?: any): Promise<string> {
  try {
    if (!message || typeof message !== "string") {
      return "I'm your trading assistant ready to help! Try commands like:\n• 'price BTC' or 'Bitcoin price'\n• 'switch to AAPL'\n• 'mark daily levels'\n• 'analyze current chart'"
    }

    const openai = createOpenAIClient()
    if (!openai) {
      return "I'm having trouble connecting to the AI service. Please check that the OpenAI API key is properly configured."
    }

    // Get current date and time
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const timeStr = now.toLocaleTimeString('en-US')

    const systemPrompt = `You are Assistanta, an intelligent trading assistant with these capabilities:

CURRENT CONTEXT:
- Date: ${dateStr}
- Time: ${timeStr}
- Location: Trading Platform
- I can: analyze charts, get prices, switch symbols, mark levels, handle multiple languages

SYMBOL RECOGNITION:
- I understand: BTC/Bitcoin/بيتكوين, ETH/Ethereum, AAPL, TSLA, NVDA, etc.
- I support: Stocks (.US), Crypto (-USD.CC), Forex (.FOREX)

AVAILABLE COMMANDS:
- "price [symbol]" or "[symbol] price" - Get current price
- "switch to [symbol]" - Change chart symbol
- "mark [timeframe] levels" - Draw support/resistance
- "analyze [symbol]" - Technical analysis
- General chat - I can discuss trading, markets, explain concepts

PERSONALITY:
- Professional but conversational
- Never lie or make up data
- If I don't know something, I'll say so
- I remember our conversation context
- I provide actionable insights

Respond naturally and conversationally. If the user asks about prices or data I cannot access, I'll suggest using the proper commands.`

    // Build conversation history
    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt,
      }
    ]

    // Add conversation context if available
    if (context && Array.isArray(context) && context.length > 0) {
      messages.push(...context.slice(-4)) // Last 4 messages for context
    }

    // Add current message
    messages.push({
      role: "user",
      content: message.trim(),
    })

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      temperature: 0.7,
      messages,
    })

    const aiResponse = response?.choices?.[0]?.message?.content
    if (!aiResponse || typeof aiResponse !== "string") {
      return "I'm ready to help with your trading analysis!"
    }

    return aiResponse
  } catch (error) {
    console.error("[v0] Error generating chat response:", error)
    return "I'm experiencing some technical difficulties. Please try again or use specific commands like 'price BTC' or 'switch to AAPL'."
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const message = formData.get("message") as string
    const contextStr = formData.get("context") as string

    let context = []
    try {
      if (contextStr) {
        context = JSON.parse(contextStr)
      }
    } catch {
      // Ignore context parsing errors
    }

    if (!file && message) {
      const intent = parseIntent(message)

      switch (intent.type) {
        case "switch":
          if (intent.symbol) {
            return NextResponse.json(await switchSymbol(intent.symbol))
          }
          break

        case "price":
          if (intent.symbol) {
            return NextResponse.json(await getPrice(intent.symbol))
          }
          break

        case "mark":
          if (intent.symbol) {
            return NextResponse.json(await markLevels(intent.symbol, intent.timeframe))
          }
          break

        case "analyze":
          if (intent.symbol) {
            return NextResponse.json(await analyze(intent.symbol, intent.timeframe))
          }
          break

        case "chat":
        default:
          const chatResponse = await generateChatResponse(message, context)
          return NextResponse.json({ type: "chat", message: chatResponse })
      }
    }

    if (file) {
      return NextResponse.json({
        success: true,
        type: "function",
        message: `Processed ${file.name}!`,
        symbols: [],
        levels: [],
      })
    }

    return NextResponse.json({ type: "chat", message: "Please send a message or upload a file." }, { status: 400 })
  } catch (error) {
    console.error("[v0] Error processing request:", error)
    return NextResponse.json({ type: "chat", message: "❌ Sorry, I encountered an error. Please try again." })
  }
}
