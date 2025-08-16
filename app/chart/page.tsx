import { Navigation } from "@/components/navigation"
import { ChartContainer } from "@/components/chart-container"

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
          <ChartContainer />
        </div>
      </main>
    </div>
  )
}
