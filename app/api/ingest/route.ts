export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { markLevels } from "@/lib/mark-levels"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

function detectChartInstructions(message: string): { hasInstructions: boolean; symbols: string[]; action?: string } {
  const lowerMessage = message.toLowerCase()

  // Common chart/levels keywords
  const chartKeywords = ["chart", "levels", "mark", "analyze", "em", "expected move", "sigma"]
  const hasInstructions = chartKeywords.some((keyword) => lowerMessage.includes(keyword))

  // Extract potential symbols (simple pattern matching)
  const symbolPatterns = [
    /\b([A-Z]{1,5})\b/g, // Basic ticker pattern
    /\b(btc|bitcoin)\b/gi,
    /\b(eth|ethereum)\b/gi,
    /\b(aapl|apple)\b/gi,
    /\b(tsla|tesla)\b/gi,
    /\b(nvda|nvidia)\b/gi,
    /\b(msft|microsoft)\b/gi,
    /\b(googl|google)\b/gi,
    /\b(amzn|amazon)\b/gi,
    /\b(meta|facebook)\b/gi,
    /\b(spx|spy|sp500)\b/gi,
    /\b(qqq|nasdaq)\b/gi,
  ]

  const symbols: string[] = []
  symbolPatterns.forEach((pattern) => {
    const matches = message.match(pattern)
    if (matches) {
      matches.forEach((match) => {
        const symbol = match.toUpperCase()
        if (!symbols.includes(symbol) && symbol.length <= 5) {
          symbols.push(symbol)
        }
      })
    }
  })

  // Determine action
  let action: string | undefined
  if (lowerMessage.includes("mark") || lowerMessage.includes("levels")) {
    action = "mark_levels"
  } else if (lowerMessage.includes("analyze") || lowerMessage.includes("chart")) {
    action = "analyze_chart"
  }

  return { hasInstructions, symbols, action }
}

async function generateChatResponse(message: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are Hafid Assistanta, a helpful trading assistant. You help users analyze charts, mark trading levels, and discuss market data. Keep responses concise and friendly. If users ask about specific tickers or charts, encourage them to be more specific about what they want to analyze.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    })

    return (
      response.choices[0]?.message?.content ||
      "I'm here to help with your trading analysis. What would you like to explore?"
    )
  } catch (error) {
    console.error("Error generating chat response:", error)
    return "I'm here to help! You can ask me to analyze charts, mark levels, or upload trading data files."
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const message = formData.get("message") as string

    if (!file && message) {
      const chartInstructions = detectChartInstructions(message)

      if (chartInstructions.hasInstructions) {
        // Handle chart/levels function calls
        if (chartInstructions.symbols.length > 0 && chartInstructions.action === "mark_levels") {
          try {
            const firstSymbol = chartInstructions.symbols[0]
            const levelsResult = await markLevels(firstSymbol, "daily")

            return NextResponse.json({
              type: "function",
              message: `Marked levels for ${firstSymbol}. ${levelsResult.success ? "Levels updated successfully!" : "Note: Levels drawn on chart but not saved to database."}`,
              symbols: chartInstructions.symbols,
              levels: levelsResult.success ? ["Levels marked on chart"] : [],
              error: levelsResult.success ? undefined : "Database not set up - levels shown on chart only",
            })
          } catch (error) {
            return NextResponse.json({
              type: "function",
              message: `I can show levels for ${chartInstructions.symbols[0]} on the chart, but they won't be saved without database setup.`,
              symbols: chartInstructions.symbols,
              levels: [],
              error: "Database not configured",
            })
          }
        } else {
          // General chart analysis request
          const chatResponse = await generateChatResponse(message)
          return NextResponse.json({
            type: "function",
            message:
              chatResponse +
              (chartInstructions.symbols.length > 0
                ? ` I see you mentioned ${chartInstructions.symbols.join(", ")}. Would you like me to mark levels for any of these?`
                : ""),
            symbols: chartInstructions.symbols,
            levels: [],
            error: undefined,
          })
        }
      } else {
        // Pure conversational response
        const chatResponse = await generateChatResponse(message)
        return NextResponse.json({
          type: "chat",
          message: chatResponse,
          symbols: [],
          levels: [],
          error: undefined,
        })
      }
    }

    if (!file && !message) {
      return NextResponse.json(
        {
          type: "chat",
          message: "Please send a message or upload a file for me to analyze.",
          symbols: [],
          levels: [],
          error: "No input provided",
        },
        { status: 400 },
      )
    }

    let content: any[] = []
    let symbols: string[] = []

    if (file) {
      if (file.type.startsWith("image/")) {
        // Handle image upload with OpenAI Vision
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")
        const dataUrl = `data:${file.type};base64,${base64}`

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini", // Much cheaper than gpt-4o
          max_tokens: 2000, // Limit tokens to control costs
          temperature: 0.1, // Lower temperature for more consistent results
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract trading levels data from this image for Hafid Assistanta. Return a JSON array of objects with fields: symbol, valid_from (YYYY-MM-DD), close, em1, upper1, lower1, upper2, lower2. If only close and em1 are visible, include those and I will derive the levels. Keep response concise.",
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
            if (jsonMatch) {
              content = JSON.parse(jsonMatch[0])
            } else {
              content = JSON.parse(aiResponse)
            }
          } catch {
            // If not valid JSON, return empty content
            content = []
          }
        }
      } else if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        // Handle CSV upload
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
    }

    symbols = content.map((item: any) => item.symbol).filter((symbol: string) => symbol && symbol !== "UNKNOWN")

    if (symbols.length > 0) {
      try {
        const firstSymbol = symbols[0]
        const levelsResult = await markLevels(firstSymbol, "daily")
        if (levelsResult.success) {
          console.log(`[v0] Auto-refreshed levels for ${firstSymbol} after ingest`)
        } else {
          console.log(`[v0] Could not refresh levels for ${firstSymbol}: ${levelsResult.error}`)
        }
      } catch (error) {
        console.log(`[v0] Levels refresh skipped (database not set up): ${(error as Error).message}`)
      }
    }

    return NextResponse.json({
      type: "function",
      message: `Successfully processed ${file?.name || "your data"}! Found ${symbols.length} symbols: ${symbols.join(", ")}. You can view the levels in the Chart section.`,
      symbols: symbols,
      levels: content.map((item: any) => `${item.symbol}: ${item.close || "N/A"}`),
      error: symbols.length === 0 ? "No valid symbols found in the data" : undefined,
    })
  } catch (error) {
    console.error("Error processing request:", error)
    return NextResponse.json(
      {
        type: "chat",
        message: "Sorry, I encountered an error processing your request. Please try again.",
        symbols: [],
        levels: [],
        error: (error as Error).message,
      },
      { status: 500 },
    )
  }
}
