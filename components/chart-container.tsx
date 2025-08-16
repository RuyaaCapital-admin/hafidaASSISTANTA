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
import { Search, AlertCircle, Target, Save, RotateCcw } from "lucide-react"
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
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [currentPrice, setCurrentPrice] = useState<number>(0)

  const [levelGroups, setLevelGroups] = useState<Record<string, LevelGroup>>({})
  const [showZones, setShowZones] = useState(false)
  const [focusMode, setFocusMode] = useState<string | null>(null)

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [snapshotName, setSnapshotName] = useState("")
  const [snapshotNote, setSnapshotNote] = useState("")

  const [timeframe, setTimeframe] = useState<string>("1d")
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkDarkMode = () => {
        setIsDarkMode(document.documentElement.classList.contains("dark"))
      }

      checkDarkMode()

      const observer = new MutationObserver(checkDarkMode)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      })

      return () => observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const savedPrefs = localStorage.getItem(`chart-prefs-${symbol}`)
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs)
      setShowZones(prefs.showZones || false)
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
    return {
      background: "transparent",
      textColor: isDarkMode ? "#e4e4e7" : "#18181b",
      borderColor: isDarkMode ? "#27272a" : "#e4e4e7",
      upColor: "#22c55e",
      downColor: "#ef4444",
      daily: "#3B82F6", // light blue
      weekly: "#10B981", // green
      monthly: "#F59E0B", // orange
    }
  }

  const getLineStyle = (timeframe: string) => {
    switch (timeframe) {
      case "daily":
        return 2 // dashed - thin line
      case "weekly":
        return 0 // solid - medium thickness
      case "monthly":
        return 1 // dotted - bold line
      default:
        return 0
    }
  }

  const getLineWidth = (timeframe: string) => {
    switch (timeframe) {
      case "daily":
        return 1 // thin
      case "weekly":
        return 2 // medium
      case "monthly":
        return 3 // bold
      default:
        return 1
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && chartContainerRef.current && !chartRef.current) {
      import("lightweight-charts").then(({ createChart, CandlestickSeries, LineSeries }) => {
        try {
          console.log("[v0] Initializing chart...")
          const colors = getChartColors()

          if (!chartContainerRef.current || chartRef.current) return

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
              vertLines: { color: "rgba(42,46,57,0)" }, // disabled vertical lines
              horzLines: { color: "rgba(42,46,57,0.2)" }, // subtle horizontal lines
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

          chartRef.current.cleanup = () => {
            window.removeEventListener("resize", handleResize)
            if (chart) chart.remove()
          }
        } catch (error) {
          console.error("[v0] Error initializing chart:", error)
        }
      })
    }

    return () => {
      if (chartRef.current?.cleanup) {
        chartRef.current.cleanup()
        chartRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (chartRef.current?.chart) {
      const colors = getChartColors()
      chartRef.current.chart.applyOptions({
        layout: {
          background: { color: colors.background },
          textColor: colors.textColor,
        },
        grid: {
          vertLines: { color: "rgba(42,46,57,0)" },
          horzLines: { color: "rgba(42,46,57,0.2)" },
        },
        rightPriceScale: {
          borderColor: colors.borderColor,
          textColor: colors.textColor, // Fix dark mode price text
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: colors.borderColor,
          textColor: colors.textColor, // Fix dark mode time text
          rightOffset: 12,
          barSpacing: 3,
          fixLeftEdge: false,
          lockVisibleTimeRangeOnResize: true,
          rightBarStaysOnScroll: true,
          borderVisible: false,
          visible: true,
          timeVisible: true,
          secondsVisible: false,
        },
      })

      // Force chart redraw to apply new colors
      chartRef.current.chart.timeScale().fitContent()
    }
  }, [isDarkMode])

  const drawLevels = (timeframe: "daily" | "weekly" | "monthly", levelsData: LevelsData, isSnapshot = false) => {
    if (!chartRef.current?.chart || !chartRef.current?.LineSeries) return

    const validatedLevels = validateLevelsData(levelsData)
    if (!validatedLevels) {
      console.warn("[v0] Invalid levels data, skipping draw:", levelsData)
      return
    }

    const { chart, LineSeries } = chartRef.current
    const colors = getChartColors()
    const color = colors[timeframe]
    const lineStyle = getLineStyle(timeframe)
    const lineWidth = getLineWidth(timeframe)
    const suffix = isSnapshot ? "·S" : ""

    const groupKey = `levels:${timeframe}${isSnapshot ? ":snapshot" : ""}`
    if (levelGroups[groupKey]) {
      levelGroups[groupKey].lineSeries.forEach((series: any) => {
        try {
          chart.removeSeries(series)
        } catch (error) {
          console.warn("[v0] Error removing series:", error)
        }
      })
    }

    const newLineSeries: any[] = []
    const lines = [
      { price: validatedLevels.upper2, title: `+2σ-${timeframe.charAt(0).toUpperCase()}${suffix}`, showLabel: true },
      { price: validatedLevels.upper1, title: `+1σ-${timeframe.charAt(0).toUpperCase()}${suffix}`, showLabel: true },
      { price: validatedLevels.lower1, title: `-1σ-${timeframe.charAt(0).toUpperCase()}${suffix}`, showLabel: true },
      { price: validatedLevels.lower2, title: `-2σ-${timeframe.charAt(0).toUpperCase()}${suffix}`, showLabel: true },
    ]

    lines.forEach(({ price, title, showLabel }) => {
      try {
        const lineSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth,
          lineStyle,
          title: showLabel ? title : "",
          priceLineVisible: showLabel,
          lastValueVisible: false,
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
      } catch (error) {
        console.warn("[v0] Error creating line series:", error)
      }
    })

    if (showZones && !isSnapshot) {
      try {
        const supportZone = chart.addSeries(LineSeries, {
          color: "rgba(34, 197, 94, 0.1)", // light green
          lineWidth: 0,
          topColor: "rgba(34, 197, 94, 0.1)",
          bottomColor: "rgba(34, 197, 94, 0.05)",
          lineVisible: false,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
        })

        supportZone.setData([
          { time: "2024-01-01", value: validatedLevels.lower1 },
          { time: "2024-12-31", value: validatedLevels.lower2 },
        ])

        const resistanceZone = chart.addSeries(LineSeries, {
          color: "rgba(239, 68, 68, 0.1)", // light red
          lineWidth: 0,
          topColor: "rgba(239, 68, 68, 0.1)",
          bottomColor: "rgba(239, 68, 68, 0.05)",
          lineVisible: false,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
        })

        resistanceZone.setData([
          { time: "2024-01-01", value: validatedLevels.upper1 },
          { time: "2024-12-31", value: validatedLevels.upper2 },
        ])

        newLineSeries.push(supportZone, resistanceZone)
      } catch (error) {
        console.warn("[v0] Error creating zones:", error)
      }
    }

    setLevelGroups((prev) => ({
      ...prev,
      [groupKey]: {
        timeframe,
        levels: validatedLevels,
        visible: prev[groupKey]?.visible ?? timeframe !== "monthly",
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

        updated[groupKey].lineSeries.forEach((series: any) => {
          try {
            series.applyOptions({ visible: updated[groupKey].visible })
          } catch (error) {
            console.warn("[v0] Error toggling series visibility:", error)
          }
        })
      }

      return updated
    })
  }

  const toggleFocusMode = (timeframe: string) => {
    if (focusMode === timeframe) {
      setFocusMode(null)
      Object.keys(levelGroups).forEach((key) => {
        levelGroups[key].lineSeries.forEach((series: any) => {
          series.applyOptions({ visible: levelGroups[key].visible })
        })
      })
    } else {
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
      console.log("Snapshots not available yet - database tables may need to be created")
      setSnapshots([])
    }
  }

  useEffect(() => {
    fetchSnapshots()
  }, [symbol])

  const fetchChartData = async (timeframe?: string) => {
    if (!symbol) return

    const tf = timeframe || interval
    setLoading(true)
    setError(null)

    try {
      console.log(`[v0] Processing symbol: ${symbol} -> cleaned: ${validateSymbol(symbol)}`)

      const cleanSymbol = validateSymbol(symbol)
      const params = new URLSearchParams({
        symbol: cleanSymbol,
        interval: tf,
      })

      const response = await fetch(`/api/chart-data?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const candles = Array.isArray(data) ? data : data.candles || []

      if (candles.length > 0) {
        console.log(`[v0] Processed chart data: ${candles.length} candles`)
        setChartData(candles)
        setCurrentPrice(candles[candles.length - 1]?.close || 0)

        if (chartRef.current?.candlestickSeries) {
          chartRef.current.candlestickSeries.setData(candles)
        }
      } else {
        throw new Error("No chart data available")
      }
    } catch (error) {
      console.error("[v0] Error fetching chart data:", error)
      setError(error instanceof Error ? error.message : "Failed to fetch chart data")

      // Show sample data as fallback
      const sampleData = generateSampleData()
      setChartData(sampleData)
      if (chartRef.current?.candlestickSeries) {
        chartRef.current.candlestickSeries.setData(sampleData)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSymbolSelect = (selectedSymbol: string) => {
    const cleanedSymbol = validateSymbol(selectedSymbol)
    setSymbol(cleanedSymbol)
    fetchChartData()
    fetchSnapshots()
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

          try {
            const upsertResponse = await fetch("/api/level-sets/upsert", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbol,
                timeframe,
                asOfDate: date,
                ...validatedLevels,
              }),
            })

            if (!upsertResponse.ok) {
              const errorData = await upsertResponse.json()
              if (upsertResponse.status === 503 && errorData.code === "TABLES_NOT_FOUND") {
                console.warn("[v0] Database tables not found, levels drawn but not saved")
              } else {
                console.warn("[v0] Failed to save levels to database:", errorData.error)
              }
            }
          } catch (dbError) {
            console.warn("[v0] Database operation failed, continuing with chart display:", dbError)
          }

          toast({ title: "Success", description: `Levels marked: ${symbol} · ${timeframe}` })
        }
      } else {
        throw new Error(result.message || "Failed to calculate levels")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to mark levels"
      console.warn("[v0] Auto-mark levels error:", errorMessage)
      toast({
        title: "Failed to mark levels",
        description: errorMessage,
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
    if (nums.some(isNaN) || nums.some((n) => !isFinite(n))) return null
    return { upper1: nums[0], lower1: nums[1], upper2: nums[2], lower2: nums[3] }
  }

  const validateSymbol = (symbol: string): string => symbol.trim().toUpperCase()

  const resetChartView = () => {
    if (chartRef.current?.chart && chartData.length > 0) {
      try {
        // Get the latest candle for centering
        const latestCandle = chartData[chartData.length - 1]
        const timeRange = chartData.length > 50 ? 50 : chartData.length

        // Set visible range to show last 50 candles or all available data
        chartRef.current.chart.timeScale().setVisibleRange({
          from: chartData[Math.max(0, chartData.length - timeRange)].time,
          to: latestCandle.time,
        })

        // Fit content to show all price levels
        chartRef.current.chart.timeScale().fitContent()

        toast({
          title: "Chart view reset",
          description: "Centered on current price range",
        })
      } catch (error) {
        console.error("[v0] Error resetting chart view:", error)
      }
    }
  }

  const connectWebSocket = (symbol: string) => {
    console.log("[v0] Real-time WebSocket functionality temporarily disabled for security")
    // WebSocket connections moved to server-side for security
    // This prevents exposing the EODHD API key in client code
    return
  }

  const timeframeOptions = [
    { value: "1m", label: "1m", realTime: true },
    { value: "5m", label: "5m", realTime: true },
    { value: "15m", label: "15m", realTime: true },
    { value: "30m", label: "30m", realTime: true },
    { value: "1h", label: "1h", realTime: true },
    { value: "4h", label: "4h", realTime: false },
    { value: "1d", label: "1d", realTime: false },
    { value: "1w", label: "1w", realTime: false },
    { value: "1M", label: "1M", realTime: false },
  ]

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe)
    fetchChartData(newTimeframe)

    // Real-time functionality will be implemented via server-side API routes
    console.log("[v0] Real-time updates temporarily disabled for security")
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{symbol}</h2>
              <p className="text-sm text-muted-foreground">
                {chartData.length > 0 && (
                  <>
                    Last: ${chartData[chartData.length - 1]?.close?.toFixed(2) || "N/A"} •{chartData.length} data points
                    •{interval} interval
                  </>
                )}
                {loading && "Loading..."}
                {error && "Using sample data"}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">{new Date(date).toLocaleDateString()}</div>
              {chartData.length > 0 && (
                <div className="text-lg font-semibold">
                  ${chartData[chartData.length - 1]?.close?.toFixed(2) || "N/A"}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
              <Button
                onClick={() => fetchChartData()}
                disabled={loading}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                {loading ? "Loading..." : "Refresh"}
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
          {/* Symbol header with current price */}
          <div className="absolute top-2 left-4 right-4 z-20 bg-background/95 backdrop-blur-sm rounded-lg p-3 border shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">{symbol}</h3>
                {chartData.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    ${chartData[chartData.length - 1]?.close?.toFixed(2) || "N/A"}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {chartData.length} candles • {timeframe}
              </div>
            </div>
          </div>

          {/* Main controls bar - positioned lower to avoid overlap */}
          <div className="absolute top-16 left-4 right-4 z-10 bg-background/90 backdrop-blur-sm rounded-lg p-2 border">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Left: Timeframe selector and reset */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  {timeframeOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={timeframe === option.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTimeframeChange(option.value)}
                      className="h-7 px-2 text-xs"
                    >
                      {option.label}
                      {option.realTime && <div className="w-1 h-1 bg-green-500 rounded-full ml-1" />}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetChartView}
                  className="h-7 px-2 text-xs bg-transparent"
                  title="Reset chart view to current price"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </div>

              {/* Right: Level controls and options */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Level toggles */}
                <div className="flex items-center gap-1">
                  {(["daily", "weekly", "monthly"] as const).map((tf) => {
                    const groupKey = `levels:${tf}`
                    const group = levelGroups[groupKey]
                    const colors = getChartColors()
                    const isActive = group?.visible

                    return (
                      <Button
                        key={tf}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleTimeframeVisibility(tf)}
                        className="h-7 px-2 text-xs"
                        style={isActive ? { backgroundColor: colors[tf], borderColor: colors[tf] } : {}}
                      >
                        <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: colors[tf] }} />
                        {tf.charAt(0).toUpperCase()}
                      </Button>
                    )
                  })}
                </div>

                {/* Zones and save controls */}
                <div className="flex items-center gap-2">
                  <Switch checked={showZones} onCheckedChange={setShowZones} className="scale-75" />
                  <span className="text-xs">Zones</span>

                  <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs bg-transparent">
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
                </div>
              </div>
            </div>
          </div>

          {/* Chart container with proper spacing for controls */}
          <div
            ref={chartContainerRef}
            className="w-full h-[600px] pt-24" // Add top padding for controls
            style={{ minHeight: "600px" }}
          />

          {/* Level values display - only when levels are visible */}
          {Object.values(levelGroups).some((group) => group.visible && group.levels) && (
            <div className="absolute bottom-4 left-4 right-4 z-10 bg-background/90 backdrop-blur-sm rounded-lg p-2 border">
              <div className="text-xs space-y-1">
                {Object.entries(levelGroups).map(([key, group]) => {
                  if (!group.visible || !group.levels) return null
                  const timeframe = key.split(":")[1]
                  const colors = getChartColors()
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: colors[timeframe as keyof typeof colors] }}
                      />
                      <span className="font-medium">{timeframe}:</span>
                      <span>
                        {Object.entries(group.levels)
                          .map(([levelKey, levelValue]) => `$${levelValue.toFixed(2)}`)
                          .join(", ")}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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

interface CacheEntry {
  data: any
  timestamp: number
  expiry: number
}

const apiCache = new Map<string, CacheEntry>()
const CACHE_DURATION = 15 * 60 * 1000 // 15 minutes

const getCachedData = (key: string) => {
  const entry = apiCache.get(key)
  if (entry && Date.now() < entry.expiry) {
    return entry.data
  }
  apiCache.delete(key)
  return null
}

const setCachedData = (key: string, data: any) => {
  apiCache.set(key, {
    data,
    timestamp: Date.now(),
    expiry: Date.now() + CACHE_DURATION,
  })
}
