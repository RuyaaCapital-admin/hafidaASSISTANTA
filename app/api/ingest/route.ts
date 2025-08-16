export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { put } from "@vercel/blob"
import OpenAI from "openai"

const sql = neon(process.env.DATABASE_URL!)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

interface LevelRow {
  symbol: string
  valid_from: string
  valid_to?: string
  close?: number
  em1?: number
  upper1?: number
  lower1?: number
  upper2?: number
  lower2?: number
  source?: string
}

export async function POST(request: NextRequest) {
  try {
    // Check API key
    const apiKey = request.headers.get("x-api-key")
    if (apiKey !== process.env.INGEST_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    const message = formData.get("message") as string

    let rows: LevelRow[] = []
    let blobUrl = ""
    let filename = ""
    let filesize = 0
    let mime = ""

    if (file) {
      // Upload to Vercel Blob
      const blob = await put(file.name, file, {
        access: "public",
      })

      blobUrl = blob.url
      filename = file.name
      filesize = file.size
      mime = file.type

      if (file.type.startsWith("image/")) {
        // Process image with OpenAI Vision
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract trading levels data from this image. Return a JSON array of objects with fields: symbol, valid_from (YYYY-MM-DD), close, em1, upper1, lower1, upper2, lower2. If only close and em1 are visible, include those and I will derive the levels.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${file.type};base64,${base64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1000,
        })

        try {
          const content = response.choices[0]?.message?.content || ""
          const jsonMatch = content.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            rows = JSON.parse(jsonMatch[0])
          }
        } catch (parseError) {
          console.error("Error parsing OpenAI response:", parseError)
        }
      } else if (file.type === "text/csv" || filename.endsWith(".csv")) {
        // Process CSV
        const text = await file.text()
        rows = parseCSV(text)
      }
    } else if (message) {
      // Try to parse message as JSON or CSV
      try {
        rows = JSON.parse(message)
      } catch {
        rows = parseCSV(message)
      }
    }

    // Process and validate rows
    const results = {
      inserted: 0,
      updated: 0,
      failed: 0,
      symbols: [] as string[],
      errors: [] as string[],
    }

    for (const row of rows) {
      try {
        const processedRow = await processRow(row)
        if (processedRow) {
          const result = await upsertLevel(processedRow)
          if (result.inserted) results.inserted++
          if (result.updated) results.updated++
          if (!results.symbols.includes(processedRow.symbol)) {
            results.symbols.push(processedRow.symbol)
          }
        }
      } catch (error) {
        results.failed++
        results.errors.push(`Row ${JSON.stringify(row)}: ${error}`)
      }
    }

    // Save upload record
    if (file) {
      await sql`
        INSERT INTO uploads (blob_url, filename, filesize, mime, ingest_summary)
        VALUES (${blobUrl}, ${filename}, ${filesize}, ${mime}, ${JSON.stringify(results)})
      `
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error("Ingest error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function parseCSV(text: string): LevelRow[] {
  const lines = text.trim().split("\n")
  if (lines.length < 2) return []

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const rows: LevelRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim())
    const row: any = {}

    headers.forEach((header, index) => {
      const value = values[index]
      if (value && value !== "") {
        if (header.includes("symbol")) {
          row.symbol = value.toUpperCase()
        } else if (header.includes("date") || header.includes("valid_from")) {
          row.valid_from = value
        } else if (header.includes("close")) {
          row.close = Number.parseFloat(value)
        } else if (header.includes("em1")) {
          row.em1 = Number.parseFloat(value)
        } else if (header.includes("upper1")) {
          row.upper1 = Number.parseFloat(value)
        } else if (header.includes("lower1")) {
          row.lower1 = Number.parseFloat(value)
        } else if (header.includes("upper2")) {
          row.upper2 = Number.parseFloat(value)
        } else if (header.includes("lower2")) {
          row.lower2 = Number.parseFloat(value)
        }
      }
    })

    if (row.symbol && row.valid_from) {
      rows.push(row)
    }
  }

  return rows
}

async function processRow(row: LevelRow): Promise<LevelRow | null> {
  // Validate required fields
  if (!row.symbol || !row.valid_from) {
    throw new Error("Missing required fields: symbol, valid_from")
  }

  // Normalize symbol
  row.symbol = row.symbol.toUpperCase().trim()

  // Validate date
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(row.valid_from)) {
    throw new Error("Invalid date format, expected YYYY-MM-DD")
  }

  // Derive levels if missing but close and em1 are present
  if (!row.upper1 && !row.lower1 && !row.upper2 && !row.lower2) {
    if (row.close && row.em1) {
      // Simple derivation: assume em1 is the standard deviation
      row.upper1 = row.close + row.em1
      row.lower1 = row.close - row.em1
      row.upper2 = row.close + row.em1 * 2
      row.lower2 = row.close - row.em1 * 2
    } else {
      throw new Error("Missing levels data and insufficient data to derive (need close + em1)")
    }
  }

  // Validate that we have all required levels
  if (!row.upper1 || !row.lower1 || !row.upper2 || !row.lower2) {
    throw new Error("Missing required level values")
  }

  return row
}

async function upsertLevel(row: LevelRow): Promise<{ inserted: boolean; updated: boolean }> {
  const existing = await sql`
    SELECT id FROM levels 
    WHERE symbol = ${row.symbol} AND valid_from = ${row.valid_from}
  `

  if (existing.length > 0) {
    await sql`
      UPDATE levels SET
        valid_to = ${row.valid_to || null},
        close = ${row.close || null},
        em1 = ${row.em1 || null},
        upper1 = ${row.upper1},
        lower1 = ${row.lower1},
        upper2 = ${row.upper2},
        lower2 = ${row.lower2},
        source = ${row.source || null}
      WHERE symbol = ${row.symbol} AND valid_from = ${row.valid_from}
    `
    return { inserted: false, updated: true }
  } else {
    await sql`
      INSERT INTO levels (symbol, valid_from, valid_to, close, em1, upper1, lower1, upper2, lower2, source)
      VALUES (${row.symbol}, ${row.valid_from}, ${row.valid_to || null}, ${row.close || null}, 
              ${row.em1 || null}, ${row.upper1}, ${row.lower1}, ${row.upper2}, ${row.lower2}, ${row.source || null})
    `
    return { inserted: true, updated: false }
  }
}
