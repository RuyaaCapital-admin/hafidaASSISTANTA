import { type NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const sql = getDb()
    const body = await request.json()
    const { symbol, timeframe, asOfDate, method = "expected_move", upper1, lower1, upper2, lower2 } = body

    // Validate required fields
    if (!symbol || !timeframe || !asOfDate || !upper1 || !lower1 || !upper2 || !lower2) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate timeframe
    if (!["daily", "weekly", "monthly"].includes(timeframe)) {
      return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 })
    }

    // Validate numeric fields
    const numericFields = { upper1, lower1, upper2, lower2 }
    for (const [key, value] of Object.entries(numericFields)) {
      if (isNaN(Number(value))) {
        return NextResponse.json({ error: `Invalid ${key}: must be numeric` }, { status: 400 })
      }
    }

    // Upsert level set
    const result = await sql`
      INSERT INTO level_sets (symbol, timeframe, as_of_date, method, upper1, lower1, upper2, lower2, updated_at)
      VALUES (${symbol}, ${timeframe}, ${asOfDate}, ${method}, ${upper1}, ${lower1}, ${upper2}, ${lower2}, CURRENT_TIMESTAMP)
      ON CONFLICT (symbol, timeframe, as_of_date, method)
      DO UPDATE SET 
        upper1 = EXCLUDED.upper1,
        lower1 = EXCLUDED.lower1,
        upper2 = EXCLUDED.upper2,
        lower2 = EXCLUDED.lower2,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    if (error instanceof Error && error.message.includes('relation "level_sets" does not exist')) {
      // This is an expected condition when database hasn't been set up yet
      // Don't log as error, just return helpful response
      return NextResponse.json(
        {
          error: "Database tables not initialized. Please run the migration script first.",
          code: "TABLES_NOT_FOUND",
        },
        { status: 503 },
      )
    }

    // Only log unexpected errors
    console.error("Error upserting level set:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
