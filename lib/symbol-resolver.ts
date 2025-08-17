export interface ResolvedSymbol {
  user: string
  provider: string
}

const cryptoMap: Record<string, string> = {
  BTC: "BTC-USD.CC",
  BITCOIN: "BTC-USD.CC",
  "BTC-USD": "BTC-USD.CC",
  "BTC.USD": "BTC-USD.CC",
  "BTC.CC": "BTC-USD.CC",
  ETH: "ETH-USD.CC",
  ETHEREUM: "ETH-USD.CC",
  "ETH-USD": "ETH-USD.CC",
  "ETH.USD": "ETH-USD.CC",
  "ETH.CC": "ETH-USD.CC",
}

export function resolveSymbol(input: string): ResolvedSymbol {
  const cleaned = input.trim().toUpperCase()
  if (cleaned.endsWith(".US") || cleaned.endsWith(".CC")) {
    return { user: cleaned, provider: cleaned }
  }
  const mapped = cryptoMap[cleaned]
  if (mapped) {
    return { user: cleaned, provider: mapped }
  }
  return { user: cleaned, provider: `${cleaned}.US` }
}
