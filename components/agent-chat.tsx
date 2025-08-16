"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
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
  clientEvent?: { type: string; data: any }
}

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "assistant",
      content:
        "Hello! I'm Hafid Assistanta. Try: 'switch to AAPL', 'price TSLA', 'mark BTC weekly levels', or 'analyze NVDA'",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    const handleChartSwitch = (event: CustomEvent) => {
      console.log("[v0] Chart switch event received:", event.detail)
      // Chart will handle the symbol switch
    }

    const handleChartUpdate = (event: CustomEvent) => {
      console.log("[v0] Chart update event received:", event.detail)
      // Chart will handle the price update
    }

    const handleDrawLevels = (event: CustomEvent) => {
      console.log("[v0] Draw levels event received:", event.detail)
      // Chart will handle drawing levels
    }

    window.addEventListener("chart:switch", handleChartSwitch as EventListener)
    window.addEventListener("chart:updateHeader", handleChartUpdate as EventListener)
    window.addEventListener("chart:drawLevels", handleDrawLevels as EventListener)

    return () => {
      window.removeEventListener("chart:switch", handleChartSwitch as EventListener)
      window.removeEventListener("chart:updateHeader", handleChartUpdate as EventListener)
      window.removeEventListener("chart:drawLevels", handleDrawLevels as EventListener)
    }
  }, [])

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
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
      console.log("[v0] Sending request to /api/ingest...")

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

      console.log("[v0] API response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] API error response:", errorText)
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: AgentResponse = await response.json()
      console.log("[v0] API response data:", result)

      let responseContent = result.message

      if (result.symbols && result.symbols.length > 0) {
        responseContent += `\n\n🎯 Symbols: ${result.symbols.join(", ")}`
      }

      if (result.levels && result.levels.length > 0) {
        responseContent += `\n\n📊 Levels: ${result.levels.slice(0, 3).join(", ")}${result.levels.length > 3 ? `... (${result.levels.length} total)` : ""}`
      }

      if (result.error) {
        responseContent += `\n\n⚠️ ${result.error}`
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: responseContent,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      if (result.clientEvent) {
        console.log("[v0] Emitting client event:", result.clientEvent)
        window.dispatchEvent(new CustomEvent(result.clientEvent.type, { detail: result.clientEvent.data }))
      }

      if (result.type === "function") {
        toast({
          title: "Action completed",
          description: result.symbols?.[0] ? `${result.symbols[0]} · ${result.message}` : result.message,
        })
      }
    } catch (error) {
      console.error("[v0] Chat error:", error)

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, errorMessage])

      toast({
        title: "Error",
        description: "Failed to process request",
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
    <div className="h-full flex flex-col">
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3"
        style={{ overflowAnchor: "none" }}
      >
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
      </div>

      <div className="sticky bottom-0 bg-background border-t p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center space-x-2">
            <input
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
                {file.type.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                <span className="truncate max-w-[120px]">{file.name}</span>
              </div>
            )}
          </div>

          <div className="flex space-x-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Try: 'switch to AAPL', 'price TSLA', 'mark BTC levels'..."
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
      </div>
    </div>
  )
}
