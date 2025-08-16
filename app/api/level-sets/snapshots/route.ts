import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 })
    }

    try {
      const result = await sql`
        SELECT * FROM level_snapshots 
        WHERE symbol = ${symbol}
        ORDER BY created_at DESC
      `
      return NextResponse.json({ success: true, data: result })
    } catch (dbError: any) {
      // Handle case where table doesn't exist yet
      if (dbError.message?.includes('relation "level_snapshots" does not exist')) {
        console.log("[v0] level_snapshots table not found, returning empty result")
        return NextResponse.json({ success: true, data: [] })
      }
      throw dbError
    }
  } catch (error) {
    console.error("Error fetching snapshots:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Snapshot ID is required" }, { status: 400 })
    }

    try {
      await sql`DELETE FROM level_snapshots WHERE id = ${id}`
      return NextResponse.json({ success: true })
    } catch (dbError: any) {
      // Handle case where table doesn't exist yet
      if (dbError.message?.includes('relation "level_snapshots" does not exist')) {
        console.log("[v0] level_snapshots table not found, cannot delete")
        return NextResponse.json({ error: "Database not initialized. Please run migration script." }, { status: 400 })
      }
      throw dbError
    }
  } catch (error) {
    console.error("Error deleting snapshot:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
