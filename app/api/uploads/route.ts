export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    const uploads = await sql`
      SELECT id, blob_url, filename, filesize, mime, ingest_summary, created_at
      FROM uploads
      ORDER BY created_at DESC
      LIMIT 100
    `

    return NextResponse.json(uploads)
  } catch (error) {
    console.error("Error fetching uploads:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
