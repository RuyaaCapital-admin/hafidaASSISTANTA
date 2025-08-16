export interface ResolvedSymbol {
  user: string
  provider: string
  assetClass: "equity" | "crypto" | "forex"
  error?: string
}

export function resolveSymbol(input: string): ResolvedSymbol {
  if (!input || typeof input !== "string") {
    return { user: input, provider: input, assetClass: "equity", error: "Invalid symbol input" }
  }

  const cleaned = input.trim().toUpperCase()

  // If already has proper suffix, keep as-is
  if (cleaned.endsWith(".US") || cleaned.endsWith(".CC") || cleaned.endsWith(".FOREX")) {
    return {
      user: cleaned,
      provider: cleaned,
      assetClass: cleaned.endsWith(".FOREX") ? "forex" : cleaned.endsWith(".CC") ? "crypto" : "equity",
    }
  }

  // Crypto mapping
  const cryptoMap: Record<string, string> = {
    BTC: "BTC-USD.CC",
    BITCOIN: "BTC-USD.CC",
    ETH: "ETH-USD.CC",
    ETHEREUM: "ETH-USD.CC",
    SOL: "SOL-USD.CC",
    SOLANA: "SOL-USD.CC",
    ADA: "ADA-USD.CC",
    CARDANO: "ADA-USD.CC",
    DOT: "DOT-USD.CC",
    POLKADOT: "DOT-USD.CC",
  }

  if (cryptoMap[cleaned]) {
    return {
      user: cleaned,
      provider: cryptoMap[cleaned],
      assetClass: "crypto",
    }
  }

  // Forex mapping
  const forexMap: Record<string, string> = {
    XAU: "XAUUSD.FOREX",
    GOLD: "XAUUSD.FOREX",
    EURUSD: "EURUSD.FOREX",
    GBPUSD: "GBPUSD.FOREX",
    USDJPY: "USDJPY.FOREX",
  }

  if (forexMap[cleaned]) {
    return {
      user: cleaned,
      provider: forexMap[cleaned],
      assetClass: "forex",
    }
  }

  // US stocks - add .US suffix
  return {
    user: cleaned,
    provider: `${cleaned}.US`,
    assetClass: "equity",
  }
}
