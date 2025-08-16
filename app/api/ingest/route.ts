export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { markLevels } from "@/lib/mark-levels"
import { priceCache } from "@/lib/cache"

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
    })
  } catch (error) {
    console.error("[v0] Error creating OpenAI client:", error)
    return null
  }
}

function detectFunctionCall(message: string): {
  type: "switch" | "price" | "mark_levels" | "analyze" | "chat"
  symbol?: string
  timeframe?: string
} {
  if (!message || typeof message !== "string") {
    return { type: "chat" }
  }

  const lowerMessage = message.toLowerCase().trim()

  // Switch symbol patterns
  if (lowerMessage.match(/^(switch to|load|show)\s+([a-z0-9]+)/i)) {
    const match = lowerMessage.match(/^(switch to|load|show)\s+([a-z0-9]+)/i)
    return { type: "switch", symbol: match?.[2]?.toUpperCase() }
  }

  // Price query patterns
  if (lowerMessage.match(/^(price|what'?s)\s+([a-z0-9]+)/i)) {
    const match = lowerMessage.match(/^(price|what'?s)\s+([a-z0-9]+)/i)
    return { type: "price", symbol: match?.[2]?.toUpperCase() }
  }

  // Mark levels patterns
  if (lowerMessage.match(/^mark\s+([a-z0-9]+)\s*(daily|weekly|monthly)?/i)) {
    const match = lowerMessage.match(/^mark\s+([a-z0-9]+)\s*(daily|weekly|monthly)?/i)
    return {
      type: "mark_levels",
      symbol: match?.[1]?.toUpperCase(),
      timeframe: match?.[2] || "daily",
    }
  }

  // Analyze patterns
  if (lowerMessage.match(/^(analyze|what do you think of)\s+([a-z0-9]+)/i)) {
    const match = lowerMessage.match(/^(analyze|what do you think of)\s+([a-z0-9]+)/i)
    return { type: "analyze", symbol: match?.[2]?.toUpperCase() }
  }

  return { type: "chat" }
}

async function handleSwitchSymbol(symbol: string) {
  try {
    return {
      success: true,
      type: "function" as const,
      message: `Switched to ${symbol}`,
      symbols: [symbol],
      levels: [],
      clientEvent: { type: "chart:switch", data: { symbol } },
    }
  } catch (error) {
    return {
      success: false,
      type: "function" as const,
      message: `Failed to switch to ${symbol}`,
      symbols: [],
      levels: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function handleGetPrice(symbol: string) {
  try {
    const cacheKey = `${symbol}:daily`

    const data = await priceCache.getOrFetch(cacheKey, async () => {
      const response = await fetch(
        `${process.env.VERCEL_URL || "http://localhost:3000"}/api/chart-data?symbol=${symbol}&interval=daily`,
      )
      if (!response.ok) throw new Error(`Failed to fetch price data: ${response.status}`)
      return response.json()
    })

    if (data && data.length > 0) {
      const lastCandle = data[data.length - 1]
      const price = lastCandle.close

      return {
        success: true,
        type: "function" as const,
        message: `${symbol} current price: $${price}`,
        symbols: [symbol],
        levels: [],
        clientEvent: { type: "chart:updateHeader", data: { symbol, price } },
      }
    } else {
      throw new Error("No price data available")
    }
  } catch (error) {
    return {
      success: false,
      type: "function" as const,
      message: `Failed to get price for ${symbol}`,
      symbols: [],
      levels: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function handleMarkLevels(symbol: string, timeframe = "daily") {
  try {
    const levelsResult = await markLevels(symbol, timeframe)

    return {
      success: levelsResult.success,
      type: "function" as const,
      message: `${symbol} ${timeframe} levels ${levelsResult.success ? "updated" : "drawn on chart"}`,
      symbols: [symbol],
      levels: levelsResult.success ? ["Levels marked"] : [],
      clientEvent: { type: "chart:drawLevels", data: { symbol, timeframe } },
      error: levelsResult.success ? undefined : "Database not set up - levels shown on chart only",
    }
  } catch (error) {
    return {
      success: false,
      type: "function" as const,
      message: `Failed to mark levels for ${symbol}`,
      symbols: [],
      levels: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function handleAnalyze(symbol: string) {
  try {
    // Get recent price data
    const cacheKey = `${symbol}:daily`
    const priceData = await priceCache.getOrFetch(cacheKey, async () => {
      const response = await fetch(
        `${process.env.VERCEL_URL || "http://localhost:3000"}/api/chart-data?symbol=${symbol}&interval=daily`,
      )
      if (!response.ok) throw new Error(`Failed to fetch price data: ${response.status}`)
      return response.json()
    })

    if (!priceData || priceData.length === 0) {
      throw new Error("No price data available for analysis")
    }

    const lastCandle = priceData[priceData.length - 1]
    const prevCandle = priceData[priceData.length - 2]

    let analysis = `${symbol} Analysis:\n`
    analysis += `Current: $${lastCandle.close}\n`

    if (prevCandle) {
      const change = (((lastCandle.close - prevCandle.close) / prevCandle.close) * 100).toFixed(2)
      analysis += `Change: ${change > 0 ? "+" : ""}${change}%\n`
    }

    analysis += `Range: $${lastCandle.low} - $${lastCandle.high}\n`
    analysis += `Volume: ${lastCandle.volume?.toLocaleString() || "N/A"}`

    return {
      success: true,
      type: "function" as const,
      message: analysis,
      symbols: [symbol],
      levels: [],
      clientEvent: { type: "chart:switch", data: { symbol } },
    }
  } catch (error) {
    return {
      success: false,
      type: "function" as const,
      message: `Failed to analyze ${symbol}`,
      symbols: [],
      levels: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function generateChatResponse(message: string): Promise<string> {
  try {
    const openai = createOpenAIClient()
    if (!openai) {
      return "I'm having trouble connecting to the AI service. Please check that the OpenAI API key is properly configured."
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are Hafid Assistanta, a helpful trading assistant. Keep responses concise and friendly. Suggest specific commands like 'switch to AAPL', 'price TSLA', 'mark BTC levels', or 'analyze NVDA'.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    })

    return response.choices[0]?.message?.content || "I'm here to help with trading analysis!"
  } catch (error) {
    console.error("[v0] Error generating chat response:", error)
    return "I'm here to help! Try commands like 'switch to AAPL', 'price TSLA', or 'mark BTC levels'."
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] ===== INGEST API REQUEST STARTED =====")

    const formData = await request.formData()
    const file = formData.get("file") as File
    const message = formData.get("message") as string

    if (!file && message) {
      const functionCall = detectFunctionCall(message)

      switch (functionCall.type) {
        case "switch":
          if (functionCall.symbol) {
            const result = await handleSwitchSymbol(functionCall.symbol)
            return NextResponse.json(result)
          }
          break

        case "price":
          if (functionCall.symbol) {
            const result = await handleGetPrice(functionCall.symbol)
            return NextResponse.json(result)
          }
          break

        case "mark_levels":
          if (functionCall.symbol) {
            const result = await handleMarkLevels(functionCall.symbol, functionCall.timeframe)
            return NextResponse.json(result)
          }
          break

        case "analyze":
          if (functionCall.symbol) {
            const result = await handleAnalyze(functionCall.symbol)
            return NextResponse.json(result)
          }
          break

        case "chat":
        default:
          // Handle as regular chat
          const chatResponse = await generateChatResponse(message)
          return NextResponse.json({
            success: true,
            type: "chat",
            message: chatResponse,
            symbols: [],
            levels: [],
          })
      }
    }

    if (file) {
      const openai = createOpenAIClient()
      if (!openai) {
        return NextResponse.json(
          {
            success: false,
            type: "chat",
            message: "OpenAI API key is not configured.",
            symbols: [],
            levels: [],
            error: "Missing API key",
          },
          { status: 500 },
        )
      }

      let content: any[] = []
      let symbols: string[] = []

      if (file.type.startsWith("image/")) {
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")
        const dataUrl = `data:${file.type};base64,${base64}`

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 2000,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract trading levels data from this image. Return JSON array with: symbol, close, em1, upper1, lower1, upper2, lower2.",
                },
                {
                  type: "image_url",
                  image_url: { url: dataUrl },
                },
              ],
            },
          ],
        })

        const aiResponse = response.choices[0]?.message?.content
        if (aiResponse) {
          try {
            const jsonMatch = aiResponse.match(/\[[\s\S]*\]/)
            content = jsonMatch ? JSON.parse(jsonMatch[0]) : []
          } catch {
            content = []
          }
        }
      } else if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        const text = await file.text()
        const lines = text.split("\n").filter((line) => line.trim())
        if (lines.length > 0) {
          const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
          content = lines.slice(1).map((line) => {
            const values = line.split(",")
            const obj: any = {}
            headers.forEach((header, index) => {
              obj[header] = values[index]?.trim()
            })
            return obj
          })
        }
      }

      symbols = content.map((item: any) => item.symbol).filter((symbol: string) => symbol && symbol !== "UNKNOWN")

      return NextResponse.json({
        success: true,
        type: "function",
        message: `Processed ${file.name}! Found ${symbols.length} symbols: ${symbols.join(", ")}`,
        symbols: symbols,
        levels: content.map((item: any) => `${item.symbol}: ${item.close || "N/A"}`),
        error: symbols.length === 0 ? "No valid symbols found" : undefined,
      })
    }

    // No file or message
    return NextResponse.json(
      {
        success: false,
        type: "chat",
        message: "Please send a message or upload a file.",
        symbols: [],
        levels: [],
        error: "No input provided",
      },
      { status: 400 },
    )
  } catch (error) {
    console.error("[v0] Error processing request:", error)
    return NextResponse.json(
      {
        success: false,
        type: "chat",
        message: "Sorry, I encountered an error. Please try again.",
        symbols: [],
        levels: [],
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
