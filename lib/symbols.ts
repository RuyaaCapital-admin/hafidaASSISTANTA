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

  // Multi-language crypto name mapping
  const cryptoNameMap: Record<string, string> = {
    // English names
    "BITCOIN": "BTC",
    "ETHEREUM": "ETH",
    "SOLANA": "SOL",
    "RIPPLE": "XRP",
    "CARDANO": "ADA",
    "POLKADOT": "DOT",
    "CHAINLINK": "LINK",
    "AVALANCHE": "AVAX",
    "POLYGON": "MATIC",
    "UNISWAP": "UNI",
    "DOGECOIN": "DOGE",
    "LITECOIN": "LTC",
    "BINANCE": "BNB",
    "BINANCECOIN": "BNB",

    // Arabic names (common crypto terms)
    "بيتكوين": "BTC",
    "إيثريوم": "ETH",
    "ريبل": "XRP",
    "لايتكوين": "LTC",
    "دوجكوين": "DOGE",

    // Alternative spellings
    "ETHERIUM": "ETH", // common misspelling
    "ETHERUM": "ETH",
  }

  // Check for crypto name variations first
  if (cryptoNameMap[cleaned]) {
    const symbol = cryptoNameMap[cleaned]
    return { user: input, provider: `${symbol}-USD.CC`, assetClass: "crypto" }
  }

  // Crypto mapping (USD pairs) - expanded list
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
    DOGE: "DOGE-USD.CC",
    LTC: "LTC-USD.CC",
    BNB: "BNB-USD.CC",
    AXS: "AXS-USD.CC",
    SAND: "SAND-USD.CC",
    MANA: "MANA-USD.CC",
    ALGO: "ALGO-USD.CC",
    ATOM: "ATOM-USD.CC",
    NEAR: "NEAR-USD.CC",
    FTM: "FTM-USD.CC",
  }

  if (cryptoMap[cleaned]) {
    return { user: input, provider: cryptoMap[cleaned], assetClass: "crypto" }
  }

  // Forex/Metals mapping
  const forexMap: Record<string, string> = {
    XAU: "XAUUSD.FOREX",
    XAG: "XAGUSD.FOREX",
    GOLD: "XAUUSD.FOREX",
    SILVER: "XAGUSD.FOREX",
    EURUSD: "EURUSD.FOREX",
    GBPUSD: "GBPUSD.FOREX",
    USDJPY: "USDJPY.FOREX",
    USDCHF: "USDCHF.FOREX",
    AUDUSD: "AUDUSD.FOREX",
    USDCAD: "USDCAD.FOREX",
    NZDUSD: "NZDUSD.FOREX",
    EURGBP: "EURGBP.FOREX",
    EURJPY: "EURJPY.FOREX",
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
