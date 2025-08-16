"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Upload, Send, ImageIcon, FileText, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Message {
  id: string
  type: "user" | "assistant"
  content: string
  timestamp: Date
}

interface IngestResult {
  inserted: number
  updated: number
  failed: number
  symbols: string[]
  errors?: string[]
}

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "assistant",
      content:
        "Hello! I can help you analyze weekly levels sheets. Upload an image or CSV file, or paste your data, and I'll extract the trading levels for you.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      toast({
        title: "File selected",
        description: `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`,
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && !file) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: file ? `Uploaded: ${file.name}` : input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setLoading(true)

    try {
      const formData = new FormData()
      if (file) {
        formData.append("file", file)
      }
      if (input.trim()) {
        formData.append("message", input)
      }

      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "x-api-key": process.env.NEXT_PUBLIC_INGEST_API_KEY || "dev-key",
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: IngestResult = await response.json()

      let responseContent = `✅ Processing complete!\n\n`
      responseContent += `📊 **Results:**\n`
      responseContent += `• Inserted: ${result.inserted} rows\n`
      responseContent += `• Updated: ${result.updated} rows\n`
      responseContent += `• Failed: ${result.failed} rows\n\n`

      if (result.symbols.length > 0) {
        responseContent += `🎯 **Symbols processed:** ${result.symbols.join(", ")}\n\n`
      }

      if (result.errors && result.errors.length > 0) {
        responseContent += `⚠️ **Errors:**\n${result.errors.join("\n")}`
      }

      responseContent += `\n\nYou can now view these levels in the [Chart](/chart) section.`

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: responseContent,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      toast({
        title: "Analysis complete",
        description: `Processed ${result.symbols.length} symbols successfully`,
      })
    } catch (error) {
      console.error("Error processing request:", error)

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content:
          "❌ Sorry, there was an error processing your request. Please try again or check that your file format is supported.",
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, errorMessage])

      toast({
        title: "Error",
        description: "Failed to process your request",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setInput("")
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Chat Messages */}
      <Card className="min-h-[400px]">
        <CardHeader>
          <CardTitle>Chat with AI Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.type === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                  <div className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2 flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Processing...</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Input Form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* File Upload */}
            <div>
              <Label htmlFor="file-upload">Upload File (Image or CSV)</Label>
              <div className="mt-1 flex items-center space-x-2">
                <Input
                  ref={fileInputRef}
                  id="file-upload"
                  type="file"
                  accept="image/*,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>Choose File</span>
                </Button>
                {file && (
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span>{file.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Text Input */}
            <div>
              <Label htmlFor="message">Message (optional)</Label>
              <Textarea
                id="message"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message or paste data here..."
                className="mt-1 min-h-[100px]"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading || (!input.trim() && !file)}
              className="w-full sm:w-auto flex items-center space-x-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{loading ? "Processing..." : "Send"}</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
