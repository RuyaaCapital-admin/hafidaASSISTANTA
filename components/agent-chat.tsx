"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Send } from "lucide-react"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      role: "assistant",
      content: "I'm your trading assistant. Ask about prices, switch charts or mark levels.",
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
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: input }
    setMessages((m) => [...m, userMessage])
    setInput("")
    setLoading(true)
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      })
      const data = await res.json()
      if (data.type === "price") {
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: "assistant", content: `${data.symbol} ${data.last}` },
        ])
      } else if (data.type === "event") {
        window.dispatchEvent(
          new CustomEvent("agent:action", {
            detail: {
              kind: data.kind,
              payload: { symbol: data.symbol, timeframe: data.timeframe, text: data.text },
            },
          }),
        )
        const ack =
          data.kind === "switch"
            ? `Switching to ${data.symbol}`
            : data.kind === "drawLevels"
              ? `Marking ${data.timeframe} levels`
              : data.kind === "toast"
                ? data.text
                : ""
        if (ack) {
          setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: ack }])
        }
      } else if (data.type === "message") {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: data.content }])
      } else {
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: "assistant", content: "Sorry, I couldn't understand." },
        ])
      }
    } catch (e) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: "Error processing request." }])
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
            <div
              className={`rounded-lg px-3 py-2 max-w-[80%] ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              <span className="text-sm whitespace-pre-wrap">{msg.content}</span>
            </div>
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
            placeholder="Ask about prices, symbols, levels..."
          />
          <Button onClick={sendMessage} disabled={loading} size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AgentChat
