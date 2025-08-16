import { Navigation } from "@/components/navigation"
import { AgentChat } from "@/components/agent-chat"

export default function AgentPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">AI Agent</h1>
            <p className="text-muted-foreground">Upload or paste weekly levels sheets for AI-powered analysis</p>
          </div>
          <AgentChat />
        </div>
      </main>
    </div>
  )
}
