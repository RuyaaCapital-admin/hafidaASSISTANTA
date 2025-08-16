"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Search, AlertCircle, Target, Save, Eye, EyeOff, RotateCcw, ChevronRight, ChevronDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SymbolSearch } from "@/components/symbol-search"
import { markLevels } from "@/lib/mark-levels"

interface LevelsData {
  upper1: number
  lower1: number
  upper2: number
  lower2: number
}

interface ChartData {
  time: string | number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

interface LevelGroup {
  timeframe: "daily" | "weekly" | "monthly"
  levels: LevelsData
  visible: boolean
  lineSeries: any[]
}

interface Snapshot {
  id: number
  snapshot_name: string
  note: string
  timeframes: string[]
  levels_data: any
  created_at: string
}

export function ChartContainer() {
  const [symbol, setSymbol] = useState("AAPL.US")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [interval, setInterval] = useState("daily")
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoMarkLoading, setAutoMarkLoading] = useState(false)

  const [levelGroups, setLevelGroups] = useState<Record<string, LevelGroup>>({})
  const [showZones, setShowZones] = useState(false)
  const [focusMode, setFocusMode] = useState<string | null>(null)

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [snapshotName, setSnapshotName] = useState("")
  const [snapshotNote, setSnapshotNote] = useState("")

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const { toast } = useToast()

  useEffect(() => {
    const savedPrefs = localStorage.getItem(`chart-prefs-${symbol}`)
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs)
      setShowZones(prefs.showZones || false)
      // Restore visibility states
      setLevelGroups((prev) => {
        const updated = { ...prev }
        Object.keys(updated).forEach((key) => {
          if (prefs.visibility && prefs.visibility[key] !== undefined) {
            updated[key].visible = prefs.visibility[key]
          }
        })
        return updated
      })
    }
  }, [symbol])

  const savePreferences = () => {
    const visibility: Record<string, boolean> = {}
    Object.entries(levelGroups).forEach(([key, group]) => {
      visibility[key] = group.visible
    })

    localStorage.setItem(
      `chart-prefs-${symbol}`,
      JSON.stringify({
        showZones,
        visibility,
      }),
    )
  }

  useEffect(() => {
    savePreferences()
  }, [levelGroups, showZones, symbol])

  const getChartColors = () => {
    const isDark = document.documentElement.classList.contains("dark")
    return {
      background: "transparent",
      textColor: isDark ? "#e4e4e7" : "#18181b",
      borderColor: isDark ? "#27272a" : "#e4e4e7",
      upColor: "#22c55e",
      downColor: "#ef4444",
      daily: "#3B82F6", // blue
      weekly: "#10B981", // green
      monthly: "#8B5CF6", // purple
    }
  }

  const getLineStyle = (timeframe: string) => {
    switch (timeframe) {
      case "daily":
        return 2 // dashed
      case "weekly":
        return 0 // solid
      case "monthly":
        return 1 // dotted
      default:
        return 0
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && chartContainerRef.current) {
      import("lightweight-charts").then(({ createChart, CandlestickSeries, LineSeries }) => {
        try {
          console.log("[v0] Initializing chart...")
          const colors = getChartColors()

          if (!chartContainerRef.current) return

          const containerWidth = chartContainerRef.current.clientWidth || 800
          const containerHeight = Math.max(500, window.innerHeight * 0.7)

          const chart = createChart(chartContainerRef.current, {
            width: containerWidth,
            height: containerHeight,
            layout: {
              background: { color: colors.background },
              textColor: colors.textColor,
            },
            grid: {
              vertLines: { color: colors.borderColor },
              horzLines: { color: colors.borderColor },
            },
            crosshair: { mode: 1 },
            rightPriceScale: { borderColor: colors.borderColor },
            timeScale: {
              borderColor: colors.borderColor,
              timeVisible: true,
              secondsVisible: false,
            },
          })

          const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: colors.upColor,
            downColor: colors.downColor,
            borderDownColor: colors.downColor,
            borderUpColor: colors.upColor,
            wickDownColor: colors.downColor,
            wickUpColor: colors.upColor,
          })

          chartRef.current = { chart, candlestickSeries, LineSeries }
          fetchChartData()

          const handleResize = () => {
            if (chartContainerRef.current && chart) {
              chart.applyOptions({ width: chartContainerRef.current.clientWidth })
            }
          }

          window.addEventListener("resize", handleResize)
          return () => {
            window.removeEventListener("resize", handleResize)
            if (chart) chart.remove()
          }
        } catch (error) {
          console.error("[v0] Error initializing chart:", error)
        }
      })
    }

    return () => {
      if (chartRef.current?.chart) {
        chartRef.current.chart.remove()
        chartRef.current = null
      }
    }
  }, [])

  const drawLevels = (timeframe: "daily" | "weekly" | "monthly", levelsData: LevelsData, isSnapshot = false) => {
    if (!chartRef.current?.chart || !chartRef.current?.LineSeries) return

    const { chart, LineSeries } = chartRef.current
    const colors = getChartColors()
    const color = colors[timeframe]
    const lineStyle = getLineStyle(timeframe)
    const suffix = isSnapshot ? "·S" : ""

    const groupKey = `levels:${timeframe}${isSnapshot ? ":snapshot" : ""}`
    if (levelGroups[groupKey]) {
      levelGroups[groupKey].lineSeries.forEach((series: any) => {
        chart.removeSeries(series)
      })
    }

    const newLineSeries: any[] = []
    const lines = [
      { price: levelsData.upper2, title: `+2σ·${timeframe.charAt(0).toUpperCase()}${suffix}` },
      { price: levelsData.upper1, title: `+1σ·${timeframe.charAt(0).toUpperCase()}${suffix}` },
      { price: levelsData.lower1, title: `-1σ·${timeframe.charAt(0).toUpperCase()}${suffix}` },
      { price: levelsData.lower2, title: `-2σ·${timeframe.charAt(0).toUpperCase()}${suffix}` },
    ]

    const badgePositions = calculateBadgePositions(lines.map((l) => l.price))

    lines.forEach(({ price, title }, index) => {
      const lineSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1, // thin lines
        lineStyle,
        title,
        priceLineVisible: true,
        lastValueVisible: false, // Remove mid-chart text
        priceFormat: {
          type: "price",
          precision: 2,
          minMove: 0.01,
        },
      })

      lineSeries.setData([
        { time: "2024-01-01", value: price },
        { time: "2024-12-31", value: price },
      ])

      newLineSeries.push(lineSeries)
    })

    if (showZones && !isSnapshot) {
      const zoneSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 0,
        topColor: `${color}26`, // 15% opacity
        bottomColor: `${color}26`,
        lineVisible: false,
        crosshairMarkerVisible: false,
      })

      // Create zone between +1σ and -1σ
      zoneSeries.setData([
        { time: "2024-01-01", value: levelsData.upper1 },
        { time: "2024-12-31", value: levelsData.lower1 },
      ])

      newLineSeries.push(zoneSeries)
    }

    setLevelGroups((prev) => ({
      ...prev,
      [groupKey]: {
        timeframe,
        levels: levelsData,
        visible: true,
        lineSeries: newLineSeries,
      },
    }))
  }

  const calculateBadgePositions = (prices: number[]): number[] => {
    const sorted = [...prices].sort((a, b) => b - a)
    const positions: number[] = []
    const minSpacing = 8 // 8px minimum spacing

    sorted.forEach((price, index) => {
      let position = price

      // Check for overlaps with previous positions
      for (let i = 0; i < positions.length; i++) {
        if (Math.abs(position - positions[i]) < minSpacing) {
          position = positions[i] + (position > positions[i] ? minSpacing : -minSpacing)
        }
      }

      positions.push(position)
    })

    return positions
  }

  const toggleTimeframeVisibility = (timeframe: string) => {
    setLevelGroups((prev) => {
      const updated = { ...prev }
      const groupKey = `levels:${timeframe}`

      if (updated[groupKey]) {
        updated[groupKey].visible = !updated[groupKey].visible

        // Show/hide series
        updated[groupKey].lineSeries.forEach((series: any) => {
          if (updated[groupKey].visible) {
            series.applyOptions({ visible: true })
          } else {
            series.applyOptions({ visible: false })
          }
        })
      }

      return updated
    })
  }

  const toggleFocusMode = (timeframe: string) => {
    if (focusMode === timeframe) {
      // Restore all
      setFocusMode(null)
      Object.keys(levelGroups).forEach((key) => {
        levelGroups[key].lineSeries.forEach((series: any) => {
          series.applyOptions({ visible: levelGroups[key].visible })
        })
      })
    } else {
      // Hide others
      setFocusMode(timeframe)
      Object.keys(levelGroups).forEach((key) => {
        const isTarget = key.includes(timeframe)
        levelGroups[key].lineSeries.forEach((series: any) => {
          series.applyOptions({ visible: isTarget && levelGroups[key].visible })
        })
      })
    }
  }

  const clearAllOverlays = () => {
    Object.values(levelGroups).forEach((group) => {
      group.lineSeries.forEach((series: any) => {
        chartRef.current?.chart?.removeSeries(series)
      })
    })
    setLevelGroups({})
    toast({ title: "Overlays cleared", description: "All level overlays have been removed" })
  }

  const saveSnapshot = async () => {
    if (!snapshotName.trim()) {
      toast({ title: "Error", description: "Snapshot name is required", variant: "destructive" })
      return
    }

    try {
      const activeTimeframes = Object.keys(levelGroups)
        .filter((key) => key.startsWith("levels:") && !key.includes("snapshot"))
        .map((key) => key.split(":")[1])

      const levelsData: Record<string, LevelsData> = {}
      activeTimeframes.forEach((tf) => {
        const group = levelGroups[`levels:${tf}`]
        if (group) {
          levelsData[tf] = group.levels
        }
      })

      const response = await fetch("/api/level-sets/save-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          snapshotName,
          note: snapshotNote,
          timeframes: activeTimeframes,
          levelsData,
        }),
      })

      if (response.ok) {
        toast({ title: "Snapshot saved", description: `"${snapshotName}" saved successfully` })
        setSaveDialogOpen(false)
        setSnapshotName("")
        setSnapshotNote("")
        fetchSnapshots()
      } else {
        throw new Error("Failed to save snapshot")
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.includes("does not exist")
          ? "Database Setup Required: Please run the migration script from Project Settings"
          : "Failed to save snapshot"
      toast({ title: "Error", description: errorMessage, variant: "destructive" })
    }
  }

  const loadSnapshot = (snapshot: Snapshot) => {
    try {
      const levelsData = snapshot.levels_data

      snapshot.timeframes.forEach((timeframe) => {
        if (levelsData[timeframe]) {
          drawLevels(timeframe as any, levelsData[timeframe], true)
        }
      })

      toast({
        title: "Snapshot loaded",
        description: `Loaded "${snapshot.snapshot_name}" with ${snapshot.timeframes.join(", ")} levels`,
      })
    } catch (error) {
      toast({ title: "Error", description: "Failed to load snapshot", variant: "destructive" })
    }
  }

  const fetchSnapshots = async () => {
    try {
      const response = await fetch(`/api/level-sets/snapshots?symbol=${symbol}`)
      if (response.ok) {
        const data = await response.json()
        setSnapshots(data.data || [])
      }
    } catch (error) {
      // Silently handle missing database tables - don't show error to user
      console.log("Snapshots not available yet - database tables may need to be created")
      setSnapshots([])
    }
  }

  useEffect(() => {
    fetchSnapshots()
  }, [symbol])

  const fetchChartData = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ symbol, interval })

      if (interval === "daily") {
        const fromDate = new Date(date)
        fromDate.setDate(fromDate.getDate() - 30)
        params.append("from", fromDate.toISOString().split("T")[0])
        params.append("to", date)
      }

      const response = await fetch(`/api/chart-data?${params}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data: ChartData[] = await response.json()
      if (!data || data.length === 0) {
        throw new Error(`No chart data available for ${symbol}`)
      }

      setChartData(data)
      if (chartRef.current?.candlestickSeries) {
        chartRef.current.candlestickSeries.setData(data)
      }

      toast({ title: "Chart Updated", description: `Loaded ${data.length} data points for ${symbol}` })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch chart data"
      setError(errorMessage)

      const sampleData = generateSampleData()
      setChartData(sampleData)
      if (chartRef.current?.candlestickSeries) {
        chartRef.current.candlestickSeries.setData(sampleData)
      }

      toast({ title: "Using Sample Data", description: errorMessage, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleSymbolSelect = (selectedSymbol: string) => {
    const cleanedSymbol = validateSymbol(selectedSymbol)
    setSymbol(cleanedSymbol)
    setTimeout(() => {
      fetchChartData()
      fetchSnapshots()
    }, 100)
  }

  const handleAutoMarkLevels = async (timeframe: "daily" | "weekly" | "monthly") => {
    if (!symbol.trim()) {
      toast({ title: "Error", description: "Please select a symbol first", variant: "destructive" })
      return
    }

    setAutoMarkLoading(true)
    try {
      const result = await markLevels(symbol, timeframe)

      if (result.success && result.levels) {
        const validatedLevels = validateLevelsData(result.levels)
        if (validatedLevels) {
          drawLevels(timeframe, validatedLevels)

          // Save to database
          await fetch("/api/level-sets/upsert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol,
              timeframe,
              asOfDate: date,
              ...validatedLevels,
            }),
          })

          toast({ title: "Success", description: `Levels marked: ${symbol} · ${timeframe}` })
        }
      } else {
        throw new Error(result.message)
      }
    } catch (error) {
      toast({
        title: "Failed to mark levels",
        description: "Check API connection and try again",
        variant: "destructive",
      })
    } finally {
      setAutoMarkLoading(false)
    }
  }

  const validateLevelsData = (data: any): LevelsData | null => {
    if (!data || typeof data !== "object") return null
    const { upper1, lower1, upper2, lower2 } = data
    const nums = [upper1, lower1, upper2, lower2].map(Number)
    if (nums.some(isNaN)) return null
    return { upper1: nums[0], lower1: nums[1], upper2: nums[2], lower2: nums[3] }
  }

  const validateSymbol = (symbol: string): string => symbol.trim().toUpperCase()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Chart Controls</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="symbol">Symbol</Label>
              <div className="mt-1">
                <SymbolSearch
                  onSymbolSelect={handleSymbolSelect}
                  placeholder="Search symbols (e.g., AAPL, TSLA, NVDA)"
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">Current: {symbol}</div>
            </div>
            <div className="flex-1">
              <Label htmlFor="interval">Interval</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="5m">5 Minutes</SelectItem>
                  <SelectItem value="15m">15 Minutes</SelectItem>
                  <SelectItem value="1h">1 Hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-end">
              <Button onClick={() => fetchChartData()} disabled={loading} className="w-full sm:w-auto">
                {loading ? "Loading..." : "Load Data"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Auto-Mark Levels</h3>
              <p className="text-sm text-muted-foreground">Calculate ±1σ and ±2σ levels for multiple timeframes</p>
            </div>
            <Button onClick={clearAllOverlays} variant="outline" size="sm">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Overlays
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["daily", "weekly", "monthly"] as const).map((timeframe) => (
              <Button
                key={timeframe}
                onClick={() => handleAutoMarkLevels(timeframe)}
                disabled={autoMarkLoading}
                variant="outline"
                className="flex items-center space-x-2"
              >
                <Target className="h-4 w-4" />
                <span>{timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}. Showing sample data instead.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0 relative">
          <div className="absolute top-4 right-4 z-10 flex items-center gap-4 bg-background/80 backdrop-blur-sm rounded-lg p-2 border">
            {/* Timeframe toggles */}
            <div className="flex items-center gap-2">
              {(["daily", "weekly", "monthly"] as const).map((timeframe) => {
                const groupKey = `levels:${timeframe}`
                const group = levelGroups[groupKey]
                const colors = getChartColors()
                const isActive = group?.visible
                const isFocused = focusMode === timeframe

                return (
                  <div key={timeframe} className="flex items-center gap-1">
                    <Button
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleTimeframeVisibility(timeframe)}
                      className="h-6 px-2 text-xs"
                      style={isActive ? { backgroundColor: colors[timeframe], borderColor: colors[timeframe] } : {}}
                    >
                      <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: colors[timeframe] }} />
                      {timeframe.charAt(0).toUpperCase()}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFocusMode(timeframe)}
                      className="h-6 w-6 p-0"
                    >
                      {isFocused ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                )
              })}
            </div>

            {/* Zones toggle */}
            <div className="flex items-center gap-2 border-l pl-4">
              <Label htmlFor="zones-toggle" className="text-xs">
                Zones
              </Label>
              <Switch id="zones-toggle" checked={showZones} onCheckedChange={setShowZones} className="scale-75" />
            </div>

            {/* Save/Load controls */}
            <div className="flex items-center gap-2 border-l pl-4">
              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Levels Snapshot</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="snapshot-name">Snapshot Name *</Label>
                      <Input
                        id="snapshot-name"
                        value={snapshotName}
                        onChange={(e) => setSnapshotName(e.target.value)}
                        placeholder="e.g., TSLA Aug levels"
                      />
                    </div>
                    <div>
                      <Label htmlFor="snapshot-note">Note (optional)</Label>
                      <Textarea
                        id="snapshot-note"
                        value={snapshotNote}
                        onChange={(e) => setSnapshotNote(e.target.value)}
                        placeholder="Optional description..."
                      />
                    </div>
                    <Button onClick={saveSnapshot} className="w-full">
                      Save Snapshot
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" size="sm" onClick={() => setShowSnapshots(!showSnapshots)}>
                {showSnapshots ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Snapshots
              </Button>
            </div>
          </div>

          <div ref={chartContainerRef} className="w-full min-h-[500px] lg:min-h-[70vh]" />
        </CardContent>
      </Card>

      {showSnapshots && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Snapshots for {symbol}</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshots.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No snapshots saved yet</p>
            ) : (
              <div className="space-y-2">
                {snapshots.map((snapshot) => (
                  <div key={snapshot.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{snapshot.snapshot_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {snapshot.timeframes.map((tf) => (
                          <span key={tf} className="inline-block bg-muted px-1 rounded text-xs mr-1">
                            {tf.charAt(0).toUpperCase()}
                          </span>
                        ))}
                        · {new Date(snapshot.created_at).toLocaleDateString()}
                      </div>
                      {snapshot.note && <div className="text-xs text-muted-foreground mt-1">{snapshot.note}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => loadSnapshot(snapshot)}>
                        Load
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await fetch(`/api/level-sets/snapshots?id=${snapshot.id}`, { method: "DELETE" })
                            fetchSnapshots()
                            toast({ title: "Snapshot deleted" })
                          } catch (error) {
                            toast({ title: "Error", description: "Failed to delete snapshot", variant: "destructive" })
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function generateSampleData() {
  const data = []
  let price = 150
  const startDate = new Date("2024-01-01")

  for (let i = 0; i < 100; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)

    const change = (Math.random() - 0.5) * 4
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.random() * 2
    const low = Math.min(open, close) - Math.random() * 2

    data.push({
      time: Math.floor(date.getTime() / 1000),
      open,
      high,
      low,
      close,
    })

    price = close
  }

  return data
}
