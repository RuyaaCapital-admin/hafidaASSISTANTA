export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

interface AnalysisRequest {
  symbol: string
  timeframe: string
  chartData: any[]
  currentPrice: number
}

export async function POST(request: NextRequest) {
  try {
    const { symbol, timeframe, chartData, currentPrice }: AnalysisRequest = await request.json()

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    if (!openai.apiKey) {
      return NextResponse.json({
        success: false,
        error: "OpenAI API key not configured",
        analysis: "AI analysis requires OpenAI API key configuration."
      })
    }

    // Prepare chart data for analysis
    const recentCandles = chartData.slice(-50) // Last 50 candles
    const priceMovement = calculatePriceMovement(recentCandles)
    const technicalIndicators = calculateTechnicalIndicators(recentCandles)

    const analysisPrompt = `Analyze this market data for ${symbol} on ${timeframe} timeframe:

CURRENT PRICE: $${currentPrice}
RECENT PRICE ACTION:
- 24h Change: ${priceMovement.change24h}%
- Trend: ${priceMovement.trend}
- Volatility: ${priceMovement.volatility}

TECHNICAL INDICATORS:
- RSI: ${technicalIndicators.rsi}
- Moving Averages: ${technicalIndicators.movingAverages}
- Support Level: $${technicalIndicators.support}
- Resistance Level: $${technicalIndicators.resistance}

CHART DATA (last 10 candles):
${recentCandles.slice(-10).map(c => 
  `Open: $${c.open}, High: $${c.high}, Low: $${c.low}, Close: $${c.close}`
).join('\n')}

Provide a concise trading analysis including:
1. Current market sentiment
2. Key levels to watch
3. Potential trading opportunities
4. Risk assessment

Be specific and actionable. Use trader terminology naturally.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional technical analyst. Provide clear, actionable market analysis based on real data."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      max_tokens: 400,
      temperature: 0.3,
    })

    const analysis = completion.choices[0]?.message?.content || "Unable to generate analysis"

    // Generate recommended levels
    const levels = generateTradingLevels(recentCandles, currentPrice)

    return NextResponse.json({
      success: true,
      symbol,
      timeframe,
      analysis,
      levels,
      technicalIndicators,
      priceMovement,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    console.error("AI analysis error:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to generate analysis",
      analysis: "Analysis temporarily unavailable. Please try again later."
    }, { status: 500 })
  }
}

function calculatePriceMovement(candles: any[]) {
  if (candles.length < 2) return { change24h: 0, trend: "neutral", volatility: "normal" }

  const latest = candles[candles.length - 1]
  const previous = candles[candles.length - 2]
  
  const change24h = ((latest.close - previous.close) / previous.close * 100).toFixed(2)
  
  // Determine trend based on last 5 candles
  const recent5 = candles.slice(-5)
  const trendUp = recent5.filter(c => c.close > c.open).length
  const trend = trendUp >= 3 ? "bullish" : trendUp <= 1 ? "bearish" : "sideways"
  
  // Calculate volatility
  const highs = recent5.map(c => c.high)
  const lows = recent5.map(c => c.low)
  const avgHigh = highs.reduce((a, b) => a + b, 0) / highs.length
  const avgLow = lows.reduce((a, b) => a + b, 0) / lows.length
  const volatilityPercent = ((avgHigh - avgLow) / latest.close * 100)
  
  const volatility = volatilityPercent > 5 ? "high" : volatilityPercent < 2 ? "low" : "normal"

  return { change24h: parseFloat(change24h), trend, volatility }
}

function calculateTechnicalIndicators(candles: any[]) {
  if (candles.length < 14) return { rsi: 50, movingAverages: "insufficient data", support: 0, resistance: 0 }

  // Simple RSI calculation
  const rsi = calculateRSI(candles, 14)
  
  // Moving averages
  const ma20 = calculateMA(candles, 20)
  const ma50 = calculateMA(candles, 50)
  
  // Support and resistance (simple high/low of recent period)
  const recent20 = candles.slice(-20)
  const support = Math.min(...recent20.map(c => c.low))
  const resistance = Math.max(...recent20.map(c => c.high))

  return {
    rsi: Math.round(rsi),
    movingAverages: `MA20: $${ma20.toFixed(2)}, MA50: $${ma50.toFixed(2)}`,
    support: support.toFixed(2),
    resistance: resistance.toFixed(2)
  }
}

function calculateRSI(candles: any[], period: number): number {
  if (candles.length < period + 1) return 50

  let gains = 0
  let losses = 0

  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close
    if (change > 0) gains += change
    else losses -= change
  }

  const avgGain = gains / period
  const avgLoss = losses / period
  
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

function calculateMA(candles: any[], period: number): number {
  if (candles.length < period) return candles[candles.length - 1]?.close || 0
  
  const recent = candles.slice(-period)
  const sum = recent.reduce((acc, candle) => acc + candle.close, 0)
  return sum / period
}

function generateTradingLevels(candles: any[], currentPrice: number) {
  const recent20 = candles.slice(-20)
  const highs = recent20.map(c => c.high)
  const lows = recent20.map(c => c.low)
  
  const resistance1 = Math.max(...highs)
  const support1 = Math.min(...lows)
  
  // Calculate additional levels based on price action
  const range = resistance1 - support1
  const resistance2 = resistance1 + (range * 0.618)
  const support2 = support1 - (range * 0.618)

  return {
    resistance: [resistance1.toFixed(2), resistance2.toFixed(2)],
    support: [support1.toFixed(2), support2.toFixed(2)],
    pivot: ((resistance1 + support1 + currentPrice) / 3).toFixed(2)
  }
}
