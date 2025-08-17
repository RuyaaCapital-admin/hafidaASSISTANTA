"use client"

import { Navigation } from "@/components/navigation"
import dynamic from "next/dynamic"

const ChartContainer = dynamic(
  () => import("@/components/chart-container").then((mod) => ({ default: mod.ChartContainer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96 border rounded-lg">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading chart...</p>
        </div>
      </div>
    ),
  },
)

const Chat = dynamic(() => import("@/components/agent-chat").then((mod) => ({ default: mod.AgentChat })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64 border rounded-lg">
      <div className="text-center space-y-2">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
        <p className="text-sm text-muted-foreground">Loading chat...</p>
      </div>
    </div>
  ),
})

export default function ChartPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto p-4">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-h-[calc(100vh-8rem)]">
          {/* Chart section - takes 2/3 on large screens */}
          <div key="chart-section" className="xl:col-span-2">
            <ChartContainer key="main-chart" symbol="AAPL.US" />
          </div>

          {/* AI Chat section - takes 1/3 on large screens */}
          <div key="chat-section" className="xl:col-span-1">
            <div className="border rounded-lg bg-card">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">AI Assistant</h2>
                <p className="text-sm text-muted-foreground">Ask me to analyze charts or mark levels</p>
              </div>
              <div className="h-[600px]">
                <Chat key="main-chat" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
