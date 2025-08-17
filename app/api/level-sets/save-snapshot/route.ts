import { type NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const sql = getDb()
    const body = await request.json()
    const { symbol, snapshotName, note, timeframes, levelsData } = body

    // Validate required fields
    if (!symbol || !snapshotName || !timeframes || !levelsData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate timeframes array
    if (!Array.isArray(timeframes) || timeframes.length === 0) {
      return NextResponse.json({ error: "Timeframes must be a non-empty array" }, { status: 400 })
    }

    // Save snapshot
    const result = await sql`
      INSERT INTO level_snapshots (symbol, snapshot_name, note, timeframes, levels_data)
      VALUES (${symbol}, ${snapshotName}, ${note || ""}, ${timeframes}, ${JSON.stringify(levelsData)})
      ON CONFLICT (symbol, snapshot_name)
      DO UPDATE SET 
        note = EXCLUDED.note,
        timeframes = EXCLUDED.timeframes,
        levels_data = EXCLUDED.levels_data,
        created_at = CURRENT_TIMESTAMP
      RETURNING *
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error("Error saving snapshot:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
