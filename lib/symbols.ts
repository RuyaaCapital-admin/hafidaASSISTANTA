export interface ResolvedSymbol {
  user: string
  provider: string
  assetClass: "equity" | "crypto" | "forex"
}

export interface SymbolError {
  error: string
}

export function resolveSymbol(input: string): ResolvedSymbol | SymbolError {
  if (!input || typeof input !== "string") {
    return { error: "Invalid symbol input" }
  }

  const cleaned = input.trim().toUpperCase()

  // If already formatted, keep as-is
  if (cleaned.endsWith(".US") || cleaned.endsWith("-USD.CC") || cleaned.endsWith(".FOREX")) {
    const assetClass = cleaned.endsWith(".US") ? "equity" : cleaned.endsWith("-USD.CC") ? "crypto" : "forex"
    return { user: input, provider: cleaned, assetClass }
  }

  // Crypto mapping (USD pairs)
  const cryptoMap: Record<string, string> = {
    BTC: "BTC-USD.CC",
    ETH: "ETH-USD.CC",
    SOL: "SOL-USD.CC",
    XRP: "XRP-USD.CC",
    ADA: "ADA-USD.CC",
    DOT: "DOT-USD.CC",
    LINK: "LINK-USD.CC",
    AVAX: "AVAX-USD.CC",
    MATIC: "MATIC-USD.CC",
    UNI: "UNI-USD.CC",
  }

  if (cryptoMap[cleaned]) {
    return { user: input, provider: cryptoMap[cleaned], assetClass: "crypto" }
  }

  // Forex/Metals mapping
  const forexMap: Record<string, string> = {
    XAU: "XAUUSD.FOREX",
    XAG: "XAGUSD.FOREX",
    EURUSD: "EURUSD.FOREX",
    GBPUSD: "GBPUSD.FOREX",
    USDJPY: "USDJPY.FOREX",
    USDCHF: "USDCHF.FOREX",
    AUDUSD: "AUDUSD.FOREX",
    USDCAD: "USDCAD.FOREX",
  }

  if (forexMap[cleaned]) {
    return { user: input, provider: forexMap[cleaned], assetClass: "forex" }
  }

  // Default to equity (add .US suffix)
  return { user: input, provider: `${cleaned}.US`, assetClass: "equity" }
}

export function isSupported(input: string): boolean {
  const result = resolveSymbol(input)
  return !("error" in result)
}
