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

const AgentChat = dynamic(() => import("@/components/agent-chat").then((mod) => ({ default: mod.AgentChat })), {
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
      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Hafid Assistanta Chart</h1>
            <p className="text-muted-foreground">
              Search and visualize stocks, forex, and crypto with support and resistance levels using ±1σ and ±2σ bands
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Chart takes 2/3 width on large screens */}
            <div className="xl:col-span-2">
              <ChartContainer />
            </div>

            {/* AI Chat takes 1/3 width on large screens, full width on mobile */}
            <div className="xl:col-span-1">
              <AgentChat />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
