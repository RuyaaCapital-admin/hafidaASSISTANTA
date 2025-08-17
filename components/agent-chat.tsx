"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, Send, ImageIcon, FileText, Loader2, Activity, Download, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Message {
  id: string
  type: "user" | "assistant"
  content: string
  timestamp: Date
}

interface AgentResponse {
  type: "chat" | "actions"
  message?: string
  actions?: Array<{ kind: string; payload: any }>
}

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load conversation history from localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("agent-chat-history")
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          return parsed.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        } catch {
          // Fall through to default
        }
      }
    }

    return [
      {
        id: "1",
        type: "assistant",
        content: "I'm your trading assistant ready to help! 📈\n\nTry:\n• 'price BTC' or 'Bitcoin price'\n• 'switch to AAPL' \n• 'mark daily levels'\n• 'analyze current chart'\n\nI understand multiple languages and remember our conversation!",
        timestamp: new Date(),
      },
    ]
  })
  const [input, setInput] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ active: boolean; text: string; error: boolean }>({
    active: false,
    text: "",
    error: false,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()

    // Save conversation history to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("agent-chat-history", JSON.stringify(messages.slice(-50))) // Keep last 50 messages
    }
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
    setStatus({ active: true, text: "Processing request...", error: false })

    try {
      console.log("[v0] Sending request to /api/ingest...")

      const formData = new FormData()
      if (file) {
        formData.append("file", file)
      }
      if (input.trim()) {
        formData.append("message", input)
        // Pass recent conversation context
        const recentMessages = messages.slice(-5).map(msg => ({
          role: msg.type === "user" ? "user" : "assistant",
          content: msg.content
        }))
        formData.append("context", JSON.stringify(recentMessages))
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

      if (result.type === "actions" && result.actions) {
        setStatus({ active: true, text: "Executing actions...", error: false })

        // Dispatch actions to chart
        for (const action of result.actions) {
          console.log("[v0] Dispatching action:", action)
          window.dispatchEvent(new CustomEvent("agent:action", { detail: action }))
        }

        // Add response message if provided
        if (result.message) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: "assistant",
            content: result.message,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, assistantMessage])
        }

        setStatus({ active: false, text: "Actions completed", error: false })
      } else {
        // Handle chat response
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          content: result.message || "Assistanta ready.",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMessage])
        setStatus({ active: false, text: "Response generated", error: false })
      }
    } catch (error) {
      console.error("[v0] Chat error:", error)
      setStatus({ active: false, text: "Error occurred", error: true })

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
      // Clear status after 2 seconds
      setTimeout(() => {
        setStatus({ active: false, text: "", error: false })
      }, 2000)
    }
  }

  const exportConversation = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      messages: messages,
      totalMessages: messages.length
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trading-conversation-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: "Conversation exported",
      description: "Downloaded as JSON file"
    })
  }

  const clearConversation = () => {
    const confirmClear = window.confirm("Are you sure you want to clear the conversation history?")
    if (confirmClear) {
      setMessages([
        {
          id: "1",
          type: "assistant",
          content: "I'm your trading assistant ready to help! 📈\n\nTry:\n• 'price BTC' or 'Bitcoin price'\n• 'switch to AAPL' \n• 'mark daily levels'\n• 'analyze current chart'\n\nI understand multiple languages and remember our conversation!",
          timestamp: new Date(),
        },
      ])

      if (typeof window !== "undefined") {
        localStorage.removeItem("agent-chat-history")
      }

      toast({
        title: "Conversation cleared",
        description: "Chat history has been reset"
      })
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Status bar with controls */}
      <div className="px-4 py-2 border-b">
        <div className="flex items-center justify-between">
          {status.active || status.text ? (
            <div
              className={`flex items-center gap-2 text-xs ${
                status.error ? "text-red-700" : "text-green-700"
              }`}
            >
              <Activity className={`h-3 w-3 ${status.active ? "animate-pulse" : ""}`} />
              <span>{status.text}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {messages.length - 1} messages
            </div>
          )}

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={exportConversation}
              className="h-6 px-2 text-xs"
              title="Export conversation"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearConversation}
              className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
              title="Clear conversation"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

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
