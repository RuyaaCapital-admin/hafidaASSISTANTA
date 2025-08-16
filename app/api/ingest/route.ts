export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
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
          ],
        },
      ],
    })
  } catch (error) {
    console.error("Error processing request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
