const ALIASES: Record<string, string> = {
  // Metals & forex
  gold: "XAUUSD.FOREX",
  xau: "XAUUSD.FOREX",
  xauusd: "XAUUSD.FOREX",
  silver: "XAGUSD.FOREX",
  xag: "XAGUSD.FOREX",
  xagusd: "XAGUSD.FOREX",
  eurusd: "EURUSD.FOREX",
  gbpusd: "GBPUSD.FOREX",
  usdjpy: "USDJPY.FOREX",
  usdcad: "USDCAD.FOREX",
  audusd: "AUDUSD.FOREX",
  nzdusd: "NZDUSD.FOREX",
  usdchf: "USDCHF.FOREX",
  eurgbp: "EURGBP.FOREX",
  eurjpy: "EURJPY.FOREX",

  // Crypto
  btc: "BTC-USD.CC",
  bitcoin: "BTC-USD.CC",
  btcusd: "BTC-USD.CC",
  eth: "ETH-USD.CC",
  ethereum: "ETH-USD.CC",
  ethusd: "ETH-USD.CC",
  xrp: "XRP-USD.CC",
  xrpusd: "XRP-USD.CC",
  sol: "SOL-USD.CC",
  solusd: "SOL-USD.CC",
  ada: "ADA-USD.CC",
  adausd: "ADA-USD.CC",
  dot: "DOT-USD.CC",
  dotusd: "DOT-USD.CC",
  ltc: "LTC-USD.CC",
  litecoin: "LTC-USD.CC",
  ltcusd: "LTC-USD.CC",
  bch: "BCH-USD.CC",
  bchusd: "BCH-USD.CC",
  link: "LINK-USD.CC",
  linkusd: "LINK-USD.CC",
}

export function resolveAlias(input: string): string | null {
  const k = input.toLowerCase().replace(/[^a-z0-9]/g, "")
  return ALIASES[k] ?? null
}

/**
 * Default mapping rules:
 * - If input already includes a suffix (.US/.FOREX/.CC) → return as-is.
 * - If input looks like US equity ticker (A–Z, 1–5 chars) → append ".US".
 * - Otherwise return null and let search endpoint handle it.
 */
export function mapToProviderSymbol(raw: string): string | null {
  if (/\.(US|FOREX|CC)$/i.test(raw)) {
    return raw.toUpperCase()
  }

  const alias = resolveAlias(raw)
  if (alias) return alias

  if (/^[A-Z]{1,5}$/.test(raw.toUpperCase()) && !raw.includes("-")) {
    return `${raw.toUpperCase()}.US`
  }

  return null
}

export function validateSymbol(symbol: string): string {
  // Remove any duplicate suffixes that might have been added
  const cleaned = symbol
    .replace(/(-USD)?(-USD)+(\.CC)$/i, "-USD.CC")
    .replace(/(\.US)+(\.US)+$/i, ".US")
    .replace(/(\.FOREX)+(\.FOREX)+$/i, ".FOREX")

  return cleaned.toUpperCase()
}
