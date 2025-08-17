"use client"

import { useEffect, useRef, useState } from "react"
import { createChart, CandlestickSeries, IChartApi, ISeriesApi } from "lightweight-charts"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { resolveSymbol } from "@/lib/symbol-resolver"

type Candle = { time: number; open: number; high: number; low: number; close: number }
interface ActionDetail { kind: string; payload: any }

export function ChartContainer({ symbol: initial }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const linesRef = useRef<Record<string, any[]>>({})
  const [symbol, setSymbol] = useState(initial)
  const [resolution, setResolution] = useState("daily")
  const { toast } = useToast()

  const loadCandles = async (sym: string, res: string) => {
    try {
      const r = await fetch(`/api/chart-data?symbol=${encodeURIComponent(sym)}&resolution=${res}`)
      if (!r.ok) throw new Error("bad response")
      const data = await r.json()
      if (!Array.isArray(data.candles) || data.candles.length === 0) throw new Error("empty")
      seriesRef.current?.setData(data.candles as Candle[])
    } catch (e) {
      toast({ description: "Failed to fetch price data" })
    }
  }

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return
    const isDark = document.documentElement.classList.contains("dark")
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: isDark ? "#020617" : "#ffffff" },
        textColor: isDark ? "#f1f5f9" : "#111827",
      },
      grid: { vertLines: { color: "transparent" }, horzLines: { color: "transparent" } },
    })
    const series = chart.addSeries(CandlestickSeries)
    chartRef.current = chart
    seriesRef.current = series
    loadCandles(symbol, resolution)
    const onResize = () => chart.applyOptions({ width: containerRef.current!.clientWidth })
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    loadCandles(symbol, resolution)
  }, [symbol, resolution])

  const drawLevels = async (tf: string) => {
    try {
      const r = await fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&resolution=${tf}`)
      if (!r.ok) throw new Error("bad response")
      const data = await r.json()
      if (!Array.isArray(data.candles) || data.candles.length === 0) throw new Error("empty")
      const last = data.candles[data.candles.length - 1]
      const colors: Record<string, string> = { daily: "#3B82F6", weekly: "#10B981", monthly: "#F59E0B" }
      linesRef.current[tf]?.forEach((l) => seriesRef.current?.removePriceLine(l))
      const l1 = seriesRef.current?.createPriceLine({ price: last.high, color: colors[tf], lineWidth: 2 })
      const l2 = seriesRef.current?.createPriceLine({ price: last.low, color: colors[tf], lineWidth: 2 })
      linesRef.current[tf] = [l1, l2].filter(Boolean)
    } catch (e) {
      toast({ description: "Failed to fetch price data" })
    }
  }

  useEffect(() => {
    const handler = (e: CustomEvent<ActionDetail>) => {
      const { kind, payload } = e.detail
      if (kind === "switch" && payload.symbol) {
        setSymbol(resolveSymbol(payload.symbol).provider)
      } else if (kind === "drawLevels") {
        if (payload.symbol) setSymbol(resolveSymbol(payload.symbol).provider)
        drawLevels(payload.timeframe || "daily")
      } else if (kind === "toast") {
        toast({ description: payload.text })
      }
    }
    window.addEventListener("agent:action", handler as any)
    return () => window.removeEventListener("agent:action", handler as any)
  }, [symbol])

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-96 w-full" />
      <div className="flex gap-2 items-center">
        <Button size="sm" onClick={() => drawLevels("daily")}>Daily</Button>
        <Button size="sm" onClick={() => drawLevels("weekly")}>Weekly</Button>
        <Button size="sm" onClick={() => drawLevels("monthly")}>Monthly</Button>
        <select
          className="ml-auto bg-background border rounded p-1 text-sm"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
        >
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
          <option value="daily">1D</option>
          <option value="weekly">1W</option>
          <option value="monthly">1M</option>
        </select>
      </div>
    </div>
  )
}

export default ChartContainer
