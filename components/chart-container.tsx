"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface LevelsData {
  upper1: number
  lower1: number
  upper2: number
  lower2: number
}

export function ChartContainer() {
  const [symbol, setSymbol] = useState("AAPL")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [levels, setLevels] = useState<LevelsData | null>(null)
  const [loading, setLoading] = useState(false)
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

  // Initialize TradingView chart
  useEffect(() => {
    if (typeof window !== "undefined" && chartContainerRef.current) {
      import("lightweight-charts").then(({ createChart }) => {
        const colors = getChartColors()

        const chart = createChart(chartContainerRef.current!, {
          width: chartContainerRef.current!.clientWidth,
          height: Math.max(500, window.innerHeight * 0.7),
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

        const candlestickSeries = chart.addCandlestickSeries({
          upColor: colors.upColor,
          downColor: colors.downColor,
          borderDownColor: colors.downColor,
          borderUpColor: colors.upColor,
          wickDownColor: colors.downColor,
          wickUpColor: colors.upColor,
        })

        // Sample candlestick data
        const sampleData = generateSampleData()
        candlestickSeries.setData(sampleData)

        chartRef.current = { chart, candlestickSeries, lineSeries: [] }

        // Handle resize
        const handleResize = () => {
          if (chartContainerRef.current) {
            chart.applyOptions({
              width: chartContainerRef.current.clientWidth,
            })
          }
        }

        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
      })
    }

    return () => {
      if (chartRef.current?.chart) {
        chartRef.current.chart.remove()
      }
    }
  }, [])

  // Fetch levels data
  const fetchLevels = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/levels/by-symbol?symbol=${symbol}&date=${date}`)
      if (response.ok) {
        const data = await response.json()
        setLevels(data)
        drawLevels(data)
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

  // Draw levels on chart
  const drawLevels = (levelsData: LevelsData) => {
    if (!chartRef.current?.chart) return

    // Clear existing levels
    clearLevels()

    const { chart } = chartRef.current
    const colors = getChartColors()

    // Add horizontal lines for levels
    const lines = [
      { price: levelsData.upper2, color: colors.level2Color, title: "+2σ" },
      { price: levelsData.upper1, color: colors.level1Color, title: "+1σ" },
      { price: levelsData.lower1, color: colors.level1Color, title: "-1σ" },
      { price: levelsData.lower2, color: colors.level2Color, title: "-2σ" },
    ]

    const newLineSeries: any[] = []

    lines.forEach(({ price, color, title }) => {
      const lineSeries = chart.addLineSeries({
        color,
        lineWidth: 2,
        lineStyle: 1, // Dashed
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
  }

  const clearLevels = () => {
    if (chartRef.current?.lineSeries) {
      chartRef.current.lineSeries.forEach((series: any) => {
        chartRef.current.chart.removeSeries(series)
      })
      chartRef.current.lineSeries = []
    }
  }

  const handleSearch = () => {
    if (symbol.trim()) {
      fetchLevels()
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
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
              <Input
                id="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="Enter symbol (e.g., AAPL)"
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={loading} className="w-full sm:w-auto">
                {loading ? "Loading..." : "Load Levels"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardContent className="p-0">
          <div ref={chartContainerRef} className="w-full min-h-[500px] lg:min-h-[70vh]" />
        </CardContent>
      </Card>

      {/* Levels Info */}
      {levels && (
        <Card>
          <CardHeader>
            <CardTitle>Current Levels for {symbol}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">+2σ</div>
                <div className="text-lg font-bold">{levels.upper2.toFixed(2)}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">+1σ</div>
                <div className="text-lg font-bold">{levels.upper1.toFixed(2)}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">-1σ</div>
                <div className="text-lg font-bold">{levels.lower1.toFixed(2)}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">-2σ</div>
                <div className="text-lg font-bold">{levels.lower2.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Generate sample candlestick data
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
      time: date.toISOString().split("T")[0],
      open,
      high,
      low,
      close,
    })

    price = close
  }

  return data
}
