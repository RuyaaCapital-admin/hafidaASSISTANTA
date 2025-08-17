"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Save, Eye, EyeOff } from "lucide-react"

export default function AdminSettingsPage() {
  const [eodhApiKey, setEodhApiKey] = useState("")
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [showEodhKey, setShowEodhKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    // Load current API key status
    fetchApiKeyStatus()
  }, [])

  const fetchApiKeyStatus = async () => {
    try {
      const response = await fetch("/api/admin/settings")
      if (response.ok) {
        const data = await response.json()
        setEodhApiKey(data.eodhApiKey ? "••••••••••••••••" : "")
        setOpenaiApiKey(data.openaiApiKey ? "••••••••••••••••" : "")
      }
    } catch (error) {
      console.error("Failed to fetch API key status:", error)
    }
  }

  const handleSave = async () => {
    if (!eodhApiKey.trim()) {
      toast({
        title: "Error",
        description: "EODHD API key is required",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eodhApiKey: eodhApiKey.includes("••") ? undefined : eodhApiKey,
          openaiApiKey: openaiApiKey.includes("••") ? undefined : openaiApiKey,
        }),
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "API keys saved successfully. Restart may be required.",
        })
        fetchApiKeyStatus()
      } else {
        throw new Error("Failed to save API keys")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save API keys",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/chart-data?symbol=AAPL.US&resolution=daily")
      if (response.ok) {
        toast({
          title: "Success",
          description: "API connection test successful",
        })
      } else {
        toast({
          title: "Error",
          description: "API connection test failed",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "API connection test failed",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Settings</h1>
        <p className="text-muted-foreground">Configure API keys and system settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              These API keys are required for the application to fetch live market data and AI features.
              Get your free EODHD API key at{" "}
              <a href="https://eodhd.com/register-api/" target="_blank" className="underline">
                eodhd.com
              </a>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label htmlFor="eodhd-key">EODHD API Key *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="eodhd-key"
                  type={showEodhKey ? "text" : "password"}
                  value={eodhApiKey}
                  onChange={(e) => setEodhApiKey(e.target.value)}
                  placeholder="Enter your EODHD API key"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEodhKey(!showEodhKey)}
                >
                  {showEodhKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Required for real-time market data and historical prices
              </p>
            </div>

            <div>
              <Label htmlFor="openai-key">OpenAI API Key (Optional)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="openai-key"
                  type={showOpenaiKey ? "text" : "password"}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="Enter your OpenAI API key (optional)"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                >
                  {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Required for AI-powered analysis features
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              {loading ? "Saving..." : "Save Settings"}
            </Button>
            <Button onClick={testConnection} disabled={loading} variant="outline">
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
