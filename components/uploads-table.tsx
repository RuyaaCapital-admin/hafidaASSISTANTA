"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, FileText, ImageIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Upload {
  id: string
  blob_url: string
  filename: string
  filesize: number
  mime: string
  ingest_summary: {
    inserted?: number
    updated?: number
    failed?: number
    symbols?: string[]
    errors?: string[]
  }
  created_at: string
}

export function UploadsTable() {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchUploads()
  }, [])

  const fetchUploads = async () => {
    try {
      const response = await fetch("/api/uploads")
      if (response.ok) {
        const data = await response.json()
        setUploads(data)
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch uploads",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching uploads:", error)
      toast({
        title: "Error",
        description: "Failed to fetch uploads",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const getStatusBadge = (summary: Upload["ingest_summary"]) => {
    if (!summary) return <Badge variant="secondary">No Data</Badge>

    const total = (summary.inserted || 0) + (summary.updated || 0) + (summary.failed || 0)
    if (total === 0) return <Badge variant="secondary">No Rows</Badge>

    if (summary.failed && summary.failed > 0) {
      return <Badge variant="destructive">Partial Success</Badge>
    }

    return <Badge variant="default">Success</Badge>
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Loading uploads...</div>
        </CardContent>
      </Card>
    )
  }

  if (uploads.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 space-y-2">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <div className="text-muted-foreground">No uploads found</div>
          <div className="text-sm text-muted-foreground">Upload files through the Agent to see them here</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload History ({uploads.length} files)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg space-y-2 sm:space-y-0"
            >
              <div className="flex items-center space-x-3">
                {upload.mime?.startsWith("image/") ? (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <div className="font-medium">{upload.filename}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatFileSize(upload.filesize)} • {new Date(upload.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {getStatusBadge(upload.ingest_summary)}

                {upload.ingest_summary?.symbols && upload.ingest_summary.symbols.length > 0 && (
                  <div className="text-sm text-muted-foreground">{upload.ingest_summary.symbols.join(", ")}</div>
                )}

                <div className="flex items-center space-x-1">
                  <Button variant="outline" size="sm" onClick={() => window.open(upload.blob_url, "_blank")}>
                    <ExternalLink className="h-4 w-4" />
                    <span className="sr-only">View file</span>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
