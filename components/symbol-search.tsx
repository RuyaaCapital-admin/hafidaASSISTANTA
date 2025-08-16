"use client"

import { useState, useEffect, useRef } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { validateSymbol } from "@/lib/symbolMap"

interface SearchResult {
  display: string
  providerSymbol: string
  type: "stock" | "etf" | "forex" | "crypto"
  exchange?: string
}

interface AliasSuggestion {
  display: string
  providerSymbol: string
  type: "alias"
}

interface SymbolSearchProps {
  onSymbolSelect: (symbol: string, displayName?: string) => void
  placeholder?: string
}

export function SymbolSearch({ onSymbolSelect, placeholder = "Search symbols..." }: SymbolSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [aliasSuggestion, setAliasSuggestion] = useState<AliasSuggestion | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const [lastQuery, setLastQuery] = useState("")

  useEffect(() => {
    const searchSymbols = async () => {
      if (query.length < 1) {
        setResults([])
        setAliasSuggestion(null)
        return
      }

      if (query === lastQuery) return
      setLastQuery(query)

      setIsLoading(true)
      try {
        const aliasResponse = await fetch(`/api/symbol-resolve?input=${encodeURIComponent(query)}`)
        if (aliasResponse.ok) {
          const aliasData = await aliasResponse.json()
          if (aliasData.providerSymbol) {
            const displayName = getDisplayName(query, aliasData.providerSymbol)
            setAliasSuggestion({
              display: displayName,
              providerSymbol: aliasData.providerSymbol,
              type: "alias",
            })
          } else {
            setAliasSuggestion(null)
          }
        }

        if (query.length >= 2) {
          const response = await fetch(`/api/search-symbol?query=${encodeURIComponent(query)}`)
          if (response.ok) {
            const data = await response.json()
            setResults(data)
          } else if (response.status === 429) {
            toast({
              title: "Search temporarily unavailable",
              description: "Please try again in a moment",
              variant: "destructive",
            })
            setResults([])
          }
        }
      } catch (error) {
        console.error("Search error:", error)
        setResults([])
        setAliasSuggestion(null)
      } finally {
        setIsLoading(false)
      }
    }

    const debounceTimer = setTimeout(searchSymbols, 500)
    return () => clearTimeout(debounceTimer)
  }, [query, toast]) // Remove lastQuery from dependencies to prevent loops

  const getDisplayName = (input: string, providerSymbol: string): string => {
    const inputLower = input.toLowerCase()
    if (inputLower === "btc" || inputLower === "bitcoin") return "Bitcoin (BTC)"
    if (inputLower === "eth" || inputLower === "ethereum") return "Ethereum (ETH)"
    if (inputLower === "xrp") return "XRP"
    if (inputLower === "gold" || inputLower === "xau") return "Gold Spot (XAU/USD)"
    if (inputLower === "silver" || inputLower === "xag") return "Silver Spot (XAG/USD)"
    if (inputLower === "eurusd") return "EUR/USD"
    if (inputLower === "gbpusd") return "GBP/USD"
    return providerSymbol
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (providerSymbol: string, displayName?: string) => {
    const finalDisplayName = displayName || providerSymbol
    setQuery(finalDisplayName)
    setShowResults(false)
    const cleanedSymbol = validateSymbol(providerSymbol)
    console.log("[v0] Symbol selected:", providerSymbol, "-> cleaned:", cleanedSymbol)
    onSymbolSelect(cleanedSymbol, finalDisplayName)
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "crypto":
        return "text-orange-500"
      case "forex":
        return "text-blue-500"
      case "etf":
        return "text-green-500"
      case "alias":
        return "text-purple-500"
      default:
        return "text-foreground"
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "crypto":
        return "CRYPTO"
      case "forex":
        return "FOREX"
      case "etf":
        return "ETF"
      case "stock":
        return "STOCK"
      case "alias":
        return "QUICK"
      default:
        return ""
    }
  }

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
          className="pl-10"
        />
      </div>

      {showResults && query.length >= 1 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Searching...</div>
          ) : (
            <>
              {aliasSuggestion && (
                <button
                  onClick={() => handleSelect(aliasSuggestion.providerSymbol, aliasSuggestion.display)}
                  className="w-full text-left p-3 hover:bg-muted transition-colors border-b bg-muted/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{aliasSuggestion.display}</div>
                    <span className={`text-xs font-semibold ${getTypeColor(aliasSuggestion.type)}`}>
                      {getTypeLabel(aliasSuggestion.type)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">{aliasSuggestion.providerSymbol}</div>
                </button>
              )}

              {results.length > 0 ? (
                results.map((result) => (
                  <button
                    key={result.providerSymbol}
                    onClick={() => handleSelect(result.providerSymbol, result.display)}
                    className="w-full text-left p-3 hover:bg-muted transition-colors border-b last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium truncate">{result.display}</div>
                      <span className={`text-xs font-semibold ${getTypeColor(result.type)}`}>
                        {getTypeLabel(result.type)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">{result.providerSymbol}</div>
                  </button>
                ))
              ) : query.length >= 2 && !aliasSuggestion ? (
                <div className="p-3 text-sm text-muted-foreground">No results found</div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  )
}
