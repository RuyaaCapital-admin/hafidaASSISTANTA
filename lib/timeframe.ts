export interface TimeframeConfig {
  resolution: string
  eodhd: {
    type: "intraday" | "eod"
    interval?: string
    period?: string
  }
  defaultLookback: number // days
  pollInterval: number // seconds
}

export interface TimeframeOption {
  value: string
  label: string
  realTime?: boolean
}

export const TIMEFRAME_CONFIGS: Record<string, TimeframeConfig> = {
  "1m": {
    resolution: "1m",
    eodhd: { type: "intraday", interval: "1m" },
    defaultLookback: 2,
    pollInterval: 5,
  },
  "5m": {
    resolution: "5m",
    eodhd: { type: "intraday", interval: "5m" },
    defaultLookback: 2,
    pollInterval: 5,
  },
  "15m": {
    resolution: "15m",
    eodhd: { type: "intraday", interval: "15m" },
    defaultLookback: 2,
    pollInterval: 5,
  },
  "1h": {
    resolution: "1h",
    eodhd: { type: "intraday", interval: "60m" },
    defaultLookback: 14,
    pollInterval: 10,
  },
  "4h": {
    resolution: "4h",
    eodhd: { type: "intraday", interval: "240m" },
    defaultLookback: 14,
    pollInterval: 30,
  },
  daily: {
    resolution: "daily",
    eodhd: { type: "eod", period: "d" },
    defaultLookback: 180,
    pollInterval: 60,
  },
  weekly: {
    resolution: "weekly",
    eodhd: { type: "eod", period: "w" },
    defaultLookback: 365,
    pollInterval: 300,
  },
  monthly: {
    resolution: "monthly",
    eodhd: { type: "eod", period: "m" },
    defaultLookback: 730,
    pollInterval: 600,
  },
}

export const TIMEFRAMES: TimeframeOption[] = [
  { value: "1m", label: "1m", realTime: true },
  { value: "5m", label: "5m", realTime: true },
  { value: "15m", label: "15m", realTime: true },
  { value: "1h", label: "1h", realTime: true },
  { value: "4h", label: "4h", realTime: true },
  { value: "daily", label: "1D" },
  { value: "weekly", label: "1W" },
  { value: "monthly", label: "1M" },
]

export function mapResolutionToEodhd(resolution: string): TimeframeConfig["eodhd"] {
  return TIMEFRAME_CONFIGS[resolution]?.eodhd || TIMEFRAME_CONFIGS["daily"].eodhd
}

export function isIntraday(resolution: string): boolean {
  return TIMEFRAME_CONFIGS[resolution]?.eodhd.type === "intraday"
}

export function defaultLookback(resolution: string): number {
  return TIMEFRAME_CONFIGS[resolution]?.defaultLookback || 180
}

export function getPollInterval(resolution: string): number {
  return TIMEFRAME_CONFIGS[resolution]?.pollInterval || 60
}

export function isMarketHours(symbol: string): boolean {
  // For US equities, check if within market hours (9:30 AM - 4:00 PM ET)
  if (symbol.endsWith(".US")) {
    const now = new Date()
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
    const day = et.getDay() // 0 = Sunday, 6 = Saturday
    const hour = et.getHours()
    const minute = et.getMinutes()
    const timeInMinutes = hour * 60 + minute

    // Monday-Friday, 9:30 AM - 4:00 PM ET
    return day >= 1 && day <= 5 && timeInMinutes >= 570 && timeInMinutes <= 960
  }

  // Crypto and Forex are 24/7
  return true
}
