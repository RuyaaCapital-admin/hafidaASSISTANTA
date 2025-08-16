"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SymbolSearch } from "@/components/symbol-search"

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

export function ChartContainer() {
  const [symbol, setSymbol] = useState("AAPL.US")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [interval, setInterval] = useState("daily")
  const [levels, setLevels] = useState<LevelsData | null>(null)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const { toast } = useToast()

  const getChartColors = () => {
    const isDark = document.documentElement.classList.contains("dark")

    return {
      background: "transparent",
      textColor: isDark ? "#e4e4e7" : "#18181b",
      borderColor: isDark ? "#27272a" : "#e4e4e7",
      upColor: "#22c55e",
      downColor: "#ef4444",
      level1Color: "#3b82f6",
      level2Color: "#f59e0b",
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && chartContainerRef.current) {
      import("lightweight-charts")
        .then(({ createChart, CandlestickSeries, LineSeries }) => {
          try {
            console.log("[v0] Initializing chart...")
            const colors = getChartColors()

            if (!chartContainerRef.current) {
              console.log("[v0] Chart container ref is null")
              return
            }

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
              crosshair: {
                mode: 1,
              },
              rightPriceScale: {
                borderColor: colors.borderColor,
              },
              timeScale: {
                borderColor: colors.borderColor,
                timeVisible: true,
                secondsVisible: false,
              },
            })

            console.log("[v0] Chart created successfully")

            const candlestickSeries = chart.addSeries(CandlestickSeries, {
              upColor: colors.upColor,
              downColor: colors.downColor,
              borderDownColor: colors.downColor,
              borderUpColor: colors.upColor,
              wickDownColor: colors.downColor,
              wickUpColor: colors.upColor,
            })

            console.log("[v0] Candlestick series created successfully")

            chartRef.current = { chart, candlestickSeries, lineSeries: [], LineSeries }

            fetchChartData()

            const handleResize = () => {
              if (chartContainerRef.current && chart) {
                chart.applyOptions({
                  width: chartContainerRef.current.clientWidth,
                })
              }
            }

            window.addEventListener("resize", handleResize)

            return () => {
              console.log("[v0] Cleaning up chart...")
              window.removeEventListener("resize", handleResize)
              if (chart) {
                chart.remove()
              }
            }
          } catch (error) {
            console.error("[v0] Error initializing chart:", error)
          }
        })
        .catch((error) => {
          console.error("[v0] Error importing lightweight-charts:", error)
        })
    }

    return () => {
      if (chartRef.current?.chart) {
        console.log("[v0] Removing chart on cleanup")
        chartRef.current.chart.remove()
        chartRef.current = null
      }
    }
  }, [])

  const fetchLevels = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/levels/by-symbol?symbol=${symbol}&date=${date}`)
      if (response.ok) {
        const data = await response.json()
        const validatedLevels = validateLevelsData(data)
        if (validatedLevels) {
          setLevels(validatedLevels)
          drawLevels(validatedLevels)
        } else {
          setLevels(null)
          clearLevels()
          toast({
            title: "Invalid levels data",
            description: `Levels data for ${symbol} contains invalid values`,
            variant: "destructive",
          })
        }
      } else {
        setLevels(null)
        clearLevels()
        toast({
          title: "No levels found",
          description: `No levels data found for ${symbol} on ${date}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching levels:", error)
      toast({
        title: "Error",
        description: "Failed to fetch levels data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const drawLevels = (levelsData: LevelsData) => {
    if (!chartRef.current?.chart || !chartRef.current?.LineSeries) {
      console.log("[v0] Chart or LineSeries not available for drawing levels")
      return
    }

    clearLevels()

    const { chart, LineSeries } = chartRef.current
    const colors = getChartColors()

    try {
      const lines = [
        { price: levelsData.upper2, color: colors.level2Color, title: "+2σ" },
        { price: levelsData.upper1, color: colors.level1Color, title: "+1σ" },
        { price: levelsData.lower1, color: colors.level1Color, title: "-1σ" },
        { price: levelsData.lower2, color: colors.level2Color, title: "-2σ" },
      ]

      const newLineSeries: any[] = []

      lines.forEach(({ price, color, title }) => {
        const lineSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          lineStyle: 1,
          title,
          priceLineVisible: true,
          lastValueVisible: true,
        })

        lineSeries.setData([
          { time: "2024-01-01", value: price },
          { time: "2024-12-31", value: price },
        ])

        newLineSeries.push(lineSeries)
      })

      chartRef.current.lineSeries = newLineSeries
      console.log("[v0] Levels drawn successfully")
    } catch (error) {
      console.error("[v0] Error drawing levels:", error)
    }
  }

  const clearLevels = () => {
    if (chartRef.current?.lineSeries && chartRef.current?.chart) {
      try {
        chartRef.current.lineSeries.forEach((series: any) => {
          if (typeof chartRef.current.chart.removeSeries === "function") {
            chartRef.current.chart.removeSeries(series)
          }
        })
        chartRef.current.lineSeries = []
        console.log("[v0] Levels cleared successfully")
      } catch (error) {
        console.error("[v0] Error clearing levels:", error)
      }
    }
  }

  const fetchChartData = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        symbol,
        interval,
      })

      if (interval === "daily") {
        const fromDate = new Date(date)
        fromDate.setDate(fromDate.getDate() - 30)
        params.append("from", fromDate.toISOString().split("T")[0])
        params.append("to", date)
      }

      console.log("[v0] Fetching chart data with params:", params.toString())

      const response = await fetch(`/api/chart-data?${params}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data: ChartData[] = await response.json()

      if (!data || data.length === 0) {
        throw new Error(`No chart data available for ${symbol}`)
      }

      console.log("[v0] Received chart data:", data.length, "points")
      setChartData(data)

      if (chartRef.current?.candlestickSeries) {
        chartRef.current.candlestickSeries.setData(data)
        console.log("[v0] Chart updated with real data")
      }

      toast({
        title: "Chart Updated",
        description: `Loaded ${data.length} data points for ${symbol}`,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch chart data"
      setError(errorMessage)
      console.error("[v0] Error fetching chart data:", error)

      const sampleData = generateSampleData()
      setChartData(sampleData)
      if (chartRef.current?.candlestickSeries) {
        chartRef.current.candlestickSeries.setData(sampleData)
        console.log("[v0] Fallback to sample data")
      }

      toast({
        title: "Using Sample Data",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    if (symbol.trim()) {
      fetchChartData()
      fetchLevels()
    }
  }

  const handleSymbolSelect = (selectedSymbol: string) => {
    setSymbol(selectedSymbol)
    setTimeout(() => {
      fetchChartData()
      fetchLevels()
    }, 100)
  }

  const validateLevelsData = (data: any): LevelsData | null => {
    if (!data || typeof data !== "object") {
      return null
    }

    const { upper1, lower1, upper2, lower2 } = data

    const numUpper1 = Number(upper1)
    const numLower1 = Number(lower1)
    const numUpper2 = Number(upper2)
    const numLower2 = Number(lower2)

    if (isNaN(numUpper1) || isNaN(numLower1) || isNaN(numUpper2) || isNaN(numLower2)) {
      console.error("[v0] Invalid levels data:", { upper1, lower1, upper2, lower2 })
      return null
    }

    return {
      upper1: numUpper1,
      lower1: numLower1,
      upper2: numUpper2,
      lower2: numLower2,
    }
  }

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
              <Button onClick={handleSearch} disabled={loading} className="w-full sm:w-auto">
                {loading ? "Loading..." : "Load Data"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}. Showing sample data instead.
            {error.includes("not found") && " Try searching for a different symbol."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <div ref={chartContainerRef} className="w-full min-h-[500px] lg:min-h-[70vh]" />
        </CardContent>
      </Card>

      {levels && (
        <Card>
          <CardHeader>
            <CardTitle>Current Levels for {symbol}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">+2σ</div>
                <div className="text-lg font-bold">
                  {typeof levels.upper2 === "number" ? levels.upper2.toFixed(2) : "N/A"}
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">+1σ</div>
                <div className="text-lg font-bold">
                  {typeof levels.upper1 === "number" ? levels.upper1.toFixed(2) : "N/A"}
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">-1σ</div>
                <div className="text-lg font-bold">
                  {typeof levels.lower1 === "number" ? levels.lower1.toFixed(2) : "N/A"}
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">-2σ</div>
                <div className="text-lg font-bold">
                  {typeof levels.lower2 === "number" ? levels.lower2.toFixed(2) : "N/A"}
                </div>
              </div>
            </div>
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
