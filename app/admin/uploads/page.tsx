import { Navigation } from "@/components/navigation"
import { UploadsTable } from "@/components/uploads-table"

export default function AdminUploadsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Upload History</h1>
            <p className="text-muted-foreground">View and manage all uploaded files and their processing status</p>
          </div>
          <UploadsTable />
        </div>
      </main>
    </div>
  )
}
