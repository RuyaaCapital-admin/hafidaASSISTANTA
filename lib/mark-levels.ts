interface MarkLevelsResult {
  success: boolean
  message: string
  levels?: {
    upper1: number
    lower1: number
    upper2: number
    lower2: number
  }
}

export async function markLevels(symbol: string, timeframe: string): Promise<MarkLevelsResult> {
  try {
    // Fetch latest close price from EODHD
    const params = new URLSearchParams({
      symbol,
      interval: timeframe === "weekly" ? "daily" : timeframe === "monthly" ? "daily" : timeframe,
    })

    // Get recent data for close price and volatility calculation
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - (timeframe === "monthly" ? 90 : timeframe === "weekly" ? 30 : 10))
    params.append("from", fromDate.toISOString().split("T")[0])
    params.append("to", new Date().toISOString().split("T")[0])

    const response = await fetch(`/api/chart-data?${params}`)
    if (!response.ok) {
      throw new Error("Failed to fetch price data")
    }

    const data = await response.json()
    if (!data || data.length === 0) {
      throw new Error("No price data available")
    }

    const latestCandle = data[data.length - 1]
    const close = latestCandle.close

    // Calculate time factor based on timeframe
    let T: number
    switch (timeframe) {
      case "weekly":
      case "w":
        T = 7 / 252
        break
      case "monthly":
      case "m":
        T = 30 / 252
        break
      case "daily":
        T = 1 / 252
        break
      default:
        // For intraday, use fraction of day
        const minutes =
          timeframe === "1m" ? 1 : timeframe === "5m" ? 5 : timeframe === "15m" ? 15 : timeframe === "1h" ? 60 : 1
        T = minutes / (6.5 * 60) / 252 // 6.5 hour trading day
    }

    // Try to get IV from options data (placeholder - would need actual IV API)
    let IV = 0.25 // Default fallback IV

    // If IV not available, calculate from historical volatility
    if (data.length >= 20) {
      const returns = []
      for (let i = 1; i < Math.min(data.length, 21); i++) {
        const dailyReturn = Math.log(data[i].close / data[i - 1].close)
        returns.push(dailyReturn)
      }

      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
      IV = Math.sqrt(variance * 252) // Annualized volatility
    }

    // Calculate Expected Move: EM = Close × IV × sqrt(T/252)
    const EM = close * IV * Math.sqrt(T)

    // Only draw if EM > 0.5% of Close (filter noise)
    if (EM < close * 0.005) {
      return {
        success: false,
        message: "Expected move too small to display (< 0.5% of price)",
      }
    }

    // Calculate levels
    const levels = {
      upper1: close + EM,
      lower1: close - EM,
      upper2: close + 2 * EM,
      lower2: close - 2 * EM,
    }

    return {
      success: true,
      message: `Levels calculated for ${symbol} (${timeframe})`,
      levels,
    }
  } catch (error) {
    console.error("[v0] Error in markLevels:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to calculate levels",
    }
  }
}
