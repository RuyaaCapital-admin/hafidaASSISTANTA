export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { markLevels } from "@/lib/mark-levels"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const message = formData.get("message") as string

    if (!file && !message) {
      return NextResponse.json({ error: "No file or message provided" }, { status: 400 })
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
        const levelsResult = await markLevels(firstSymbol, "daily")
        if (levelsResult.success) {
          console.log(`[v0] Auto-refreshed levels for ${firstSymbol} after ingest`)
        }
      } catch (error) {
        console.error("[v0] Error auto-refreshing levels:", error)
      }
    }

    return NextResponse.json({
      inserted: content.length,
      updated: 0,
      failed: 0,
      symbols: symbols,
      errors: symbols.length === 0 ? ["No valid symbols found in the data"] : undefined,
    })
  } catch (error) {
    console.error("Error processing request:", error)
    return NextResponse.json(
      {
        inserted: 0,
        updated: 0,
        failed: 1,
        symbols: [],
        errors: ["Internal server error: " + (error as Error).message],
      },
      { status: 500 },
    )
  }
}
