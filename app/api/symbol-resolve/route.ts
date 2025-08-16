export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { mapToProviderSymbol } from "@/lib/symbolMap"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const input = searchParams.get("input")

    if (!input) {
      return NextResponse.json({ error: "Missing input parameter" }, { status: 400 })
    }

    const providerSymbol = mapToProviderSymbol(input)

    return NextResponse.json({ providerSymbol })
  } catch (error) {
    console.error("Error resolving symbol:", error)
    return NextResponse.json({ error: "Failed to resolve symbol" }, { status: 500 })
  }
}
