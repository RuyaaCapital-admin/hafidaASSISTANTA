"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, TrendingUp } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { SymbolSearch } from "@/components/symbol-search"

interface EMData {
  symbol: string
  close: number
  iv: number
  em: number
  upperEM: number
  lowerEM: number
  upper2Sigma: number
  lower2Sigma: number
  timeframe: string
  tradingDays: number
}

interface ExpectedMoveTableProps {
  onSymbolSelect?: (symbol: string) => void
}

export function ExpectedMoveTable({ onSymbolSelect }: ExpectedMoveTableProps) {
  const [symbols, setSymbols] = useState<string[]>(["AAPL.US", "TSLA.US", "NVDA.US", "MSFT.US", "GOOGL.US"])
  const [timeframe, setTimeframe] = useState("weekly")
  const [customDays, setCustomDays] = useState("5")
  const [emData, setEmData] = useState<EMData[]>([])
  const [loading, setLoading] = useState(false)
  const [newSymbol, setNewSymbol] = useState("")
  const { toast } = useToast()

  useEffect(() => {
    calculateExpectedMoves()
  }, [timeframe, customDays])

  const calculateExpectedMoves = async () => {
    if (symbols.length === 0) return

    setLoading(true)
    try {
      const response = await fetch("/api/expected-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          timeframe,
          customDays: timeframe === "custom" ? Number(customDays) : undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      setEmData(data.results || [])

      if (data.errors && data.errors.length > 0) {
        toast({
          title: "Some symbols failed",
          description: `${data.errors.length} symbols could not be processed`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error calculating expected moves:", error)
      toast({
        title: "Error",
        description: "Failed to calculate expected moves",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const addSymbol = (symbol: string) => {
    const cleanSymbol = symbol.toUpperCase()
    if (!symbols.includes(cleanSymbol)) {
      setSymbols([...symbols, cleanSymbol])
      setNewSymbol("")
    }
  }

  const removeSymbol = (symbolToRemove: string) => {
    setSymbols(symbols.filter((s) => s !== symbolToRemove))
    setEmData(emData.filter((d) => d.symbol !== symbolToRemove))
  }

  const handleSymbolClick = (symbol: string) => {
    if (onSymbolSelect) {
      onSymbolSelect(symbol)
    }
  }

  const formatNumber = (num: number, decimals = 2) => {
    return num.toFixed(decimals)
  }

  const formatPercentage = (num: number) => {
    return (num * 100).toFixed(1) + "%"
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Expected Move Calculator</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label>Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily (1 day)</SelectItem>
                  <SelectItem value="weekly">Weekly (5 days)</SelectItem>
                  <SelectItem value="monthly">Monthly (21 days)</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {timeframe === "custom" && (
              <div>
                <Label>Custom Days</Label>
                <Input
                  type="number"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  min="1"
                  max="252"
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <Label>Add Symbol</Label>
              <div className="flex space-x-2 mt-1">
                <SymbolSearch onSymbolSelect={addSymbol} placeholder="Search symbols..." />
                <Button onClick={calculateExpectedMoves} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calculate"}
                </Button>
              </div>
            </div>
          </div>

          {/* Symbol Tags */}
          <div className="flex flex-wrap gap-2">
            {symbols.map((symbol) => (
              <Badge key={symbol} variant="secondary" className="flex items-center space-x-1">
                <span>{symbol}</span>
                <button onClick={() => removeSymbol(symbol)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Expected Move Table */}
      <Card>
        <CardHeader>
          <CardTitle>Expected Move Analysis</CardTitle>
          <p className="text-sm text-muted-foreground">
            Formula: EM = Price × IV × √(T/252) | Click symbol to view chart
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Calculating expected moves...</span>
            </div>
          ) : emData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Symbol</th>
                    <th className="text-right p-3 font-semibold">Close</th>
                    <th className="text-right p-3 font-semibold">IV</th>
                    <th className="text-right p-3 font-semibold">EM</th>
                    <th className="text-right p-3 font-semibold">Upper EM</th>
                    <th className="text-right p-3 font-semibold">Lower EM</th>
                    <th className="text-right p-3 font-semibold">Upper 2σ</th>
                    <th className="text-right p-3 font-semibold">Lower 2σ</th>
                  </tr>
                </thead>
                <tbody>
                  {emData.map((data) => (
                    <tr key={data.symbol} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <button
                          onClick={() => handleSymbolClick(data.symbol)}
                          className="font-medium text-primary hover:underline"
                        >
                          {data.symbol}
                        </button>
                      </td>
                      <td className="text-right p-3">{formatNumber(data.close)}</td>
                      <td className="text-right p-3">{formatPercentage(data.iv)}</td>
                      <td className="text-right p-3 font-medium">{formatNumber(data.em)}</td>
                      <td className="text-right p-3 text-green-600">{formatNumber(data.upperEM)}</td>
                      <td className="text-right p-3 text-red-600">{formatNumber(data.lowerEM)}</td>
                      <td className="text-right p-3 text-green-700 font-semibold">{formatNumber(data.upper2Sigma)}</td>
                      <td className="text-right p-3 text-red-700 font-semibold">{formatNumber(data.lower2Sigma)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Add symbols and click Calculate to see expected moves
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
