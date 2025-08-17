"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Send } from "lucide-react"
import { ChartContainer } from "@/components/chart-container"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content?: string
  chartSymbol?: string
  table?: { headers: string[]; rows: string[][] }
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      role: "assistant",
      content: "I'm your trading assistant. Ask about prices, charts, or analyses!",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const sendMessage = async () => {
    if (!input.trim()) return
    const userMessage: ChatMessage = { id: Date.now().toString(), role: "user", content: input }
    setMessages((m) => [...m, userMessage])
    setInput("")
    setLoading(true)
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      })
      const data = await res.json()
      const replies: ChatMessage[] = (data.responses || []).map((r: any) => {
        if (r.type === "chart") return { id: crypto.randomUUID(), role: "assistant", chartSymbol: r.symbol }
        if (r.type === "table") return { id: crypto.randomUUID(), role: "assistant", table: r }
        return { id: crypto.randomUUID(), role: "assistant", content: r.content }
      })
      setMessages((m) => [...m, ...replies])
    } catch (e) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: "Sorry, I hit an error." }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.chartSymbol ? (
              <div className="w-72 h-48">
                <ChartContainer symbol={msg.chartSymbol} />
              </div>
            ) : msg.table ? (
              <table className="text-xs border border-border">
                <thead>
                  <tr>
                    {msg.table.headers.map((h) => (
                      <th key={h} className="border px-1 py-0.5 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {msg.table.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="border px-1 py-0.5">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div
                className={`rounded-lg px-3 py-2 max-w-[80%] ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <span className="text-sm whitespace-pre-wrap">{msg.content}</span>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-4 border-t">
        <div className="flex space-x-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about BTC, EURUSD, AAPL..."
          />
          <Button onClick={sendMessage} disabled={loading} size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
