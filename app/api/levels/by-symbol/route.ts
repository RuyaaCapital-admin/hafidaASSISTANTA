export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")
    const date = searchParams.get("date")

    if (!symbol || !date) {
      return NextResponse.json({ error: "Missing required parameters: symbol, date" }, { status: 400 })
    }

    const result = await sql`
      SELECT upper1, lower1, upper2, lower2
      FROM levels
      WHERE symbol = ${symbol.toUpperCase()}
        AND valid_from <= ${date}
        AND (valid_to IS NULL OR valid_to >= ${date})
      ORDER BY valid_from DESC
      LIMIT 1
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "No levels found for the specified symbol and date" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error fetching levels:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
