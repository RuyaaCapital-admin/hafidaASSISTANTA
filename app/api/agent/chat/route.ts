export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

interface AgentAction {
  kind: "switch" | "drawLevels" | "analysis" | "toast"
  payload: any
}

export async function POST(request: NextRequest) {
  try {
    const { message, conversationContext } = await request.json()

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    if (!openai.apiKey) {
      return NextResponse.json({
        response: "I need an OpenAI API key to provide intelligent analysis. For now, I can help with basic chart functions.",
        actions: [],
      })
    }

    // Build conversation context
    const contextMessages = conversationContext?.map((msg: any) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })) || []

    // Analyze user intent and generate response
    const systemPrompt = `You are a professional trading assistant with access to real-time market data through EODHD API. You help users analyze charts, mark support/resistance levels, and understand market movements.

PERSONALITY:
- Be conversational and helpful, not robotic
- Use trader terminology naturally
- Be confident about analysis but acknowledge uncertainty when appropriate
- Show enthusiasm for interesting market patterns

CAPABILITIES:
1. Switch chart symbols (stocks: AAPL.US, crypto: BTC-USD.CC, forex: EURUSD.FOREX)
2. Mark technical levels (daily, weekly, monthly timeframes)
3. Analyze price action and trends
4. Provide market insights based on real data

RESPONSE FORMAT:
Respond with natural conversation. If you need to take chart actions, I'll handle that separately.

Current user message: "${message}"

Respond as a knowledgeable trading assistant who understands market psychology and technical analysis.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        ...contextMessages.slice(-4), // Last 4 messages for context
        { role: "user", content: message }
      ],
      max_tokens: 300,
      temperature: 0.7,
    })

    const response = completion.choices[0]?.message?.content || "I'm processing your request..."

    // Analyze intent for chart actions
    const actions: AgentAction[] = []
    const messageAnalysis = await analyzeIntent(message, openai)
    
    if (messageAnalysis.actions) {
      actions.push(...messageAnalysis.actions)
    }

    return NextResponse.json({
      response,
      actions,
      analysisPerformed: actions.length > 0,
    })

  } catch (error) {
    console.error("Agent chat error:", error)
    
    // Fallback response without OpenAI
    const fallbackResponse = generateFallbackResponse(request)
    return NextResponse.json(fallbackResponse)
  }
}

async function analyzeIntent(message: string, openai: OpenAI): Promise<{ actions: AgentAction[] }> {
  try {
    const intentAnalysis = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system",
        content: `Analyze this trading message and determine if any chart actions are needed.

AVAILABLE ACTIONS:
1. switch - Change symbol (extract symbol from message)
2. drawLevels - Mark levels (extract timeframe: daily/weekly/monthly)
3. analysis - General analysis request
4. toast - Show notification

Return JSON with actions array. Examples:
- "switch to AAPL" → [{"kind": "switch", "payload": {"symbol": "AAPL.US"}}]
- "mark daily levels for TSLA" → [{"kind": "switch", "payload": {"symbol": "TSLA.US"}}, {"kind": "drawLevels", "payload": {"timeframe": "daily"}}]
- "analyze BTC" → [{"kind": "switch", "payload": {"symbol": "BTC-USD.CC"}}, {"kind": "analysis", "payload": {"type": "technical"}}]

Message: "${message}"`
      }],
      max_tokens: 200,
      temperature: 0.1,
    })

    const result = intentAnalysis.choices[0]?.message?.content
    if (result) {
      try {
        return JSON.parse(result)
      } catch {
        return { actions: [] }
      }
    }
  } catch (error) {
    console.error("Intent analysis error:", error)
  }
  
  return { actions: [] }
}

function generateFallbackResponse(request: NextRequest): any {
  // Simple pattern matching for basic functionality
  const { message } = request.body

  const actions: AgentAction[] = []
  let response = "I understand you want to "

  // Symbol switching patterns
  const switchPattern = /(?:switch|change|show|load|open)\s+(?:to\s+)?([A-Z]{1,6}(?:\.[A-Z]{2,6})?)/i
  const switchMatch = message.match(switchPattern)
  
  if (switchMatch) {
    const symbol = switchMatch[1].toUpperCase()
    const formattedSymbol = symbol.includes('.') ? symbol : `${symbol}.US`
    actions.push({
      kind: "switch",
      payload: { symbol: formattedSymbol }
    })
    response += `analyze ${symbol}. Let me load that chart for you.`
  }

  // Level marking patterns
  const levelPattern = /mark|level|support|resistance|draw/i
  if (levelPattern.test(message)) {
    actions.push({
      kind: "drawLevels",
      payload: { timeframe: "daily" }
    })
    response += response.includes("analyze") ? " I'll also mark the key levels." : "mark the important levels on the chart."
  }

  if (actions.length === 0) {
    response = "I can help you analyze charts, switch symbols, and mark levels. Try asking me to 'analyze AAPL' or 'mark levels for TSLA'."
  }

  return { response, actions }
}
