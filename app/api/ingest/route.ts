export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { markLevels } from "@/lib/mark-levels"

function createOpenAIClient(): OpenAI | null {
  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      console.error("[v0] OpenAI API key not found in environment variables")
      return null
    }

    // Check for empty string or whitespace-only key
    const trimmedKey = apiKey.trim()
    if (!trimmedKey || trimmedKey.length === 0) {
      console.error("[v0] OpenAI API key is empty or contains only whitespace")
      return null
    }

    // Basic format validation (OpenAI keys typically start with 'sk-')
    if (!trimmedKey.startsWith("sk-")) {
      console.error("[v0] OpenAI API key appears to have invalid format (should start with 'sk-')")
      return null
    }

    // Check minimum length (OpenAI keys are typically longer than 20 characters)
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

function detectChartInstructions(message: string): { hasInstructions: boolean; symbols: string[]; action?: string } {
  if (!message || typeof message !== "string") {
    return { hasInstructions: false, symbols: [] }
  }

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
    if (!message || typeof message !== "string") {
      console.log("[v0] Invalid message parameter:", message)
      return "I'm here to help! You can ask me to analyze charts, mark levels, or upload trading data files."
    }

    console.log("[v0] Generating OpenAI chat response for message:", message.substring(0, 100))

    const openai = createOpenAIClient()
    if (!openai) {
      console.error("[v0] Cannot create OpenAI client - API key validation failed")
      return "I'm having trouble connecting to the AI service. Please check that the OpenAI API key is properly configured."
    }

    console.log("[v0] Making OpenAI API call...")

    const response = (await Promise.race([
      openai.chat.completions.create({
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
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("OpenAI API call timeout")), 30000)),
    ])) as any

    console.log("[v0] OpenAI API call completed, processing response...")

    if (!response || !response.choices || response.choices.length === 0) {
      console.log("[v0] Invalid OpenAI response structure:", response)
      return "I'm here to help with your trading analysis. What would you like to explore?"
    }

    const choice = response.choices[0]
    if (!choice || !choice.message) {
      console.log("[v0] Invalid choice or message in response:", choice)
      return "I'm here to help with your trading analysis. What would you like to explore?"
    }

    const chatResponse =
      choice.message.content || "I'm here to help with your trading analysis. What would you like to explore?"

    const responsePreview = typeof chatResponse === "string" ? chatResponse.substring(0, 100) : "Invalid response type"
    console.log("[v0] OpenAI response generated successfully:", responsePreview)

    return chatResponse
  } catch (error) {
    console.error("[v0] Error generating chat response:", error)
    if (error instanceof Error) {
      console.error("[v0] Error name:", error.name)
      console.error("[v0] Error message:", error.message)
      console.error("[v0] Error stack:", error.stack)
    }
    return "I'm here to help! You can ask me to analyze charts, mark levels, or upload trading data files."
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] ===== INGEST API REQUEST STARTED =====")
    console.log("[v0] Request URL:", request.url)
    console.log("[v0] Request method:", request.method)

    const openai = createOpenAIClient()
    if (!openai) {
      console.error("[v0] OpenAI client not available")
      return NextResponse.json(
        {
          type: "chat",
          message: "OpenAI API key is not configured. Please check your environment variables.",
          symbols: [],
          levels: [],
          error: "Missing API key",
        },
        { status: 500 },
      )
    }

    console.log("[v0] OpenAI client created successfully, proceeding with request processing")

    const formData = await request.formData()
    const file = formData.get("file") as File
    const message = formData.get("message") as string

    console.log("[v0] Request data parsed:", {
      hasFile: !!file,
      fileName: file?.name,
      fileType: file?.type,
      messageLength: message?.length,
      message: message?.substring(0, 100),
    })

    if (!file && message) {
      console.log("[v0] Processing text message:", message.substring(0, 100))

      const chartInstructions = detectChartInstructions(message)
      console.log("[v0] Chart instructions detected:", chartInstructions)

      if (chartInstructions.hasInstructions) {
        // Handle chart/levels function calls
        if (chartInstructions.symbols.length > 0 && chartInstructions.action === "mark_levels") {
          try {
            const firstSymbol = chartInstructions.symbols[0]
            console.log("[v0] Marking levels for symbol:", firstSymbol)
            const levelsResult = await markLevels(firstSymbol, "daily")

            const response = {
              type: "function",
              message: `Marked levels for ${firstSymbol}. ${levelsResult.success ? "Levels updated successfully!" : "Note: Levels drawn on chart but not saved to database."}`,
              symbols: chartInstructions.symbols,
              levels: levelsResult.success ? ["Levels marked on chart"] : [],
              error: levelsResult.success ? undefined : "Database not set up - levels shown on chart only",
            }

            console.log("[v0] Returning function response:", response)
            return NextResponse.json(response)
          } catch (error) {
            console.error("[v0] Error marking levels:", error)
            const response = {
              type: "function",
              message: `I can show levels for ${chartInstructions.symbols[0]} on the chart, but they won't be saved without database setup.`,
              symbols: chartInstructions.symbols,
              levels: [],
              error: "Database not configured",
            }
            console.log("[v0] Returning error response:", response)
            return NextResponse.json(response)
          }
        } else {
          // General chart analysis request
          try {
            console.log("[v0] Generating chat response for chart analysis...")
            const chatResponse = await generateChatResponse(message)
            const response = {
              type: "function",
              message:
                chatResponse +
                (chartInstructions.symbols.length > 0
                  ? ` I see you mentioned ${chartInstructions.symbols.join(", ")}. Would you like me to mark levels for any of these?`
                  : ""),
              symbols: chartInstructions.symbols,
              levels: [],
              error: undefined,
            }
            console.log("[v0] Returning chart analysis response:", response)
            return NextResponse.json(response)
          } catch (error) {
            console.error("[v0] Error generating chat response:", error)
            const response = {
              type: "chat",
              message: "I'm having trouble processing your request right now. Please try again.",
              symbols: [],
              levels: [],
              error: error instanceof Error ? error.message : "Unknown error",
            }
            console.log("[v0] Returning error response:", response)
            return NextResponse.json(response)
          }
        }
      } else {
        // Pure conversational response
        try {
          console.log("[v0] Generating conversational response...")
          const chatResponse = await generateChatResponse(message)
          const response = {
            type: "chat",
            message: chatResponse,
            symbols: [],
            levels: [],
            error: undefined,
          }
          console.log("[v0] Returning conversational response:", response)
          return NextResponse.json(response)
        } catch (error) {
          console.error("[v0] Error in conversational response:", error)
          const response = {
            type: "chat",
            message: "I'm having trouble processing your message right now. Please try again.",
            symbols: [],
            levels: [],
            error: error instanceof Error ? error.message : "Unknown error",
          }
          console.log("[v0] Returning error response:", response)
          return NextResponse.json(response)
        }
      }
    }

    if (!file && !message) {
      console.log("[v0] No file or message provided")
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
        console.log("[v0] Auto-refreshing levels for symbol:", firstSymbol)
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
    console.error("[v0] ===== INGEST API ERROR =====")
    console.error("[v0] Error processing request:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    console.error("[v0] Full error details:", error)

    return NextResponse.json(
      {
        type: "chat",
        message: "Sorry, I encountered an error processing your request. Please try again.",
        symbols: [],
        levels: [],
        error: `${errorMessage} - Check server logs for details`,
      },
      { status: 500 },
    )
  }
}
