"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, Send, ImageIcon, FileText, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Message {
  id: string
  type: "user" | "assistant"
  content: string
  timestamp: Date
}

interface AgentResponse {
  type: "chat" | "function"
  message: string
  symbols?: string[]
  levels?: string[]
  error?: string
}

interface CacheEntry {
  data: any
  timestamp: number
  expiry: number
}

const apiCache = new Map<string, CacheEntry>()
const CACHE_DURATION = 15 * 60 * 1000 // 15 minutes

const getCachedData = (key: string) => {
  const entry = apiCache.get(key)
  if (entry && Date.now() < entry.expiry) {
    return entry.data
  }
  apiCache.delete(key)
  return null
}

const setCachedData = (key: string, data: any) => {
  apiCache.set(key, {
    data,
    timestamp: Date.now(),
    expiry: Date.now() + CACHE_DURATION,
  })
}

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "assistant",
      content:
        "Hello! I'm Hafid Assistanta. I can help you analyze charts, mark trading levels, or just chat about markets. Try saying 'hi', 'analyze AAPL chart', 'mark BTC levels', or upload a trading data file!",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
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
      const cacheKey = `ingest-${input}-${file?.name || "no-file"}`
      let result = getCachedData(cacheKey)

      if (!result) {
        const formData = new FormData()
        if (file) {
          formData.append("file", file)
        }
        if (input.trim()) {
          formData.append("message", input)
        }

        const response = await fetch("/api/ingest", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        result = await response.json()
        setCachedData(cacheKey, result)
      }

      let responseContent = result.message

      if (result.type === "function" && result.symbols && result.symbols.length > 0) {
        responseContent += `\n\n🎯 **Symbols:** ${result.symbols.join(", ")}`
      }

      if (result.levels && result.levels.length > 0) {
        const displayLevels = result.levels.slice(0, 50)
        responseContent += `\n\n📊 **Levels:** ${displayLevels.slice(0, 3).join(", ")}${result.levels.length > 3 ? `... (${result.levels.length} total)` : ""}`

        if (result.levels.length > 50) {
          responseContent += `\n\n*Showing first 50 of ${result.levels.length} levels*`
        }
      }

      if (result.error) {
        responseContent += `\n\n⚠️ **Note:** ${result.error}`
      }

      if (result.type === "function" && result.symbols && result.symbols.length > 0) {
        responseContent += `\n\n*Chart updated with live data*`
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: responseContent,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      if (result.type === "function") {
        toast({
          title: result.symbols && result.symbols.length > 0 ? "Function executed" : "Analysis complete",
          description:
            result.symbols && result.symbols.length > 0
              ? `Processed ${result.symbols.length} symbols`
              : "Response generated",
        })
      } else {
        toast({
          title: "Response ready",
          description: "Chat message generated",
        })
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content:
          "❌ Sorry, there was an error processing your request. Please try again or check that your input is valid.",
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
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="h-[400px] xl:h-[500px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">AI Assistant</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="space-y-3 h-[300px] xl:h-[400px] overflow-y-auto pr-2">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
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
                <div className="bg-muted rounded-lg px-3 py-2 flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Processing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* File Upload */}
            <div>
              <div className="flex items-center space-x-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-1"
                >
                  <Upload className="h-3 w-3" />
                  <span className="text-xs">File</span>
                </Button>
                {file && (
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-3 w-3" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    <span className="truncate max-w-[120px]">{file.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex space-x-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about markets, upload files, or say 'hi'..."
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={loading || (!input.trim() && !file)}
                size="sm"
                className="flex items-center space-x-1"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                <span className="hidden sm:inline text-xs">Send</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
