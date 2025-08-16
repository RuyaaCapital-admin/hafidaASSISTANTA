import { Navigation } from "@/components/navigation"
import { ExpectedMoveTable } from "@/components/expected-move-table"

export default function ExpectedMovePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Expected Move Calculator</h1>
            <p className="text-muted-foreground">
              Calculate expected price movements using real market data and implied volatility
            </p>
          </div>
          <ExpectedMoveTable />
        </div>
      </main>
    </div>
  )
}
