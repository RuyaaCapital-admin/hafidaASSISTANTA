import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")
    const timeframes = searchParams.get("timeframes")?.split(",") || ["daily", "weekly", "monthly"]
    const asOf = searchParams.get("asOf") || new Date().toISOString().split("T")[0]

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 })
    }

    // Get level sets for the specified symbol and timeframes
    const result = await sql`
      SELECT * FROM level_sets 
      WHERE symbol = ${symbol} 
        AND timeframe = ANY(${timeframes})
        AND as_of_date <= ${asOf}
      ORDER BY timeframe, as_of_date DESC
    `

    // Group by timeframe and get the most recent for each
    const levelsByTimeframe: Record<string, any> = {}
    result.forEach((level) => {
      if (!levelsByTimeframe[level.timeframe]) {
        levelsByTimeframe[level.timeframe] = level
      }
    })

    return NextResponse.json({ success: true, data: levelsByTimeframe })
  } catch (error) {
    console.error("Error fetching level sets:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
