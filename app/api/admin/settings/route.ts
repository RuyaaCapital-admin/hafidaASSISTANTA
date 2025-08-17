export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"

export async function GET() {
  try {
    return NextResponse.json({
      eodhApiKey: !!process.env.EODHD_API_KEY,
      openaiApiKey: !!process.env.OPENAI_API_KEY,
    })
  } catch (error) {
    console.error("Error checking API keys:", error)
    return NextResponse.json({ error: "Failed to check API keys" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { eodhApiKey, openaiApiKey } = await request.json()

    // Read existing .env.local or create new content
    const envPath = join(process.cwd(), ".env.local")
    let envContent = ""
    
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf8")
    }

    // Parse existing env vars
    const envVars = new Map<string, string>()
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=")
        if (key && valueParts.length > 0) {
          envVars.set(key.trim(), valueParts.join("=").trim())
        }
      }
    })

    // Update API keys if provided
    if (eodhApiKey && typeof eodhApiKey === "string") {
      envVars.set("EODHD_API_KEY", eodhApiKey)
    }
    if (openaiApiKey && typeof openaiApiKey === "string") {
      envVars.set("OPENAI_API_KEY", openaiApiKey)
    }

    // Generate new .env.local content
    const newEnvContent = Array.from(envVars.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")

    // Write to .env.local
    writeFileSync(envPath, newEnvContent)

    // Also set environment variables for immediate use
    if (eodhApiKey && typeof eodhApiKey === "string") {
      process.env.EODHD_API_KEY = eodhApiKey
    }
    if (openaiApiKey && typeof openaiApiKey === "string") {
      process.env.OPENAI_API_KEY = openaiApiKey
    }

    return NextResponse.json({ 
      success: true, 
      message: "API keys saved successfully. Restart may be required for all changes to take effect." 
    })
  } catch (error) {
    console.error("Error saving API keys:", error)
    return NextResponse.json({ error: "Failed to save API keys" }, { status: 500 })
  }
}
