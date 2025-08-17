interface CacheEntry<T = any> {
  data: T
  timestamp: number
  expiry: number
  key: string
}

class DataCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize = 1000 // Maximum number of entries
  
  // Default TTL values in milliseconds
  private defaultTTL = {
    price: 30 * 1000,        // 30 seconds for prices
    chartData: 5 * 60 * 1000, // 5 minutes for chart data
    levels: 10 * 60 * 1000,   // 10 minutes for levels
    analysis: 2 * 60 * 1000,  // 2 minutes for analysis
    default: 5 * 60 * 1000    // 5 minutes default
  }

  set<T>(key: string, data: T, category: keyof typeof this.defaultTTL = 'default'): void {
    // Clean up expired entries if cache is getting large
    if (this.cache.size >= this.maxSize) {
      this.cleanup()
    }

    const ttl = this.defaultTTL[category]
    const now = Date.now()
    
    this.cache.set(key, {
      data,
      timestamp: now,
      expiry: now + ttl,
      key
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    const now = Date.now()
    
    // Check if expired
    if (now > entry.expiry) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    
    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      return false
    }
    
    return true
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now()
    const toDelete: string[] = []
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        toDelete.push(key)
      }
    }
    
    toDelete.forEach(key => this.cache.delete(key))
    
    // If still too large, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries())
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
      
      const toRemove = entries.slice(0, Math.floor(this.maxSize * 0.2)) // Remove oldest 20%
      toRemove.forEach(([key]) => this.cache.delete(key))
    }
  }

  // Get cache statistics
  getStats(): { size: number; expired: number; totalEntries: number } {
    const now = Date.now()
    let expired = 0
    
    for (const entry of this.cache.values()) {
      if (now > entry.expiry) {
        expired++
      }
    }
    
    return {
      size: this.cache.size,
      expired,
      totalEntries: this.cache.size
    }
  }

  // Generate cache key for different data types
  static generateKey(type: string, ...params: (string | number)[]): string {
    return `${type}:${params.join(':')}`.toLowerCase()
  }
}

// Export singleton instance
export const dataCache = new DataCache()

// Utility functions for common caching patterns
export const cacheUtils = {
  // Cache chart data
  cacheChartData: (symbol: string, resolution: string, data: any) => {
    const key = DataCache.generateKey('chart', symbol, resolution)
    dataCache.set(key, data, 'chartData')
  },

  getCachedChartData: (symbol: string, resolution: string) => {
    const key = DataCache.generateKey('chart', symbol, resolution)
    return dataCache.get(key)
  },

  // Cache price data
  cachePrice: (symbol: string, data: any) => {
    const key = DataCache.generateKey('price', symbol)
    dataCache.set(key, data, 'price')
  },

  getCachedPrice: (symbol: string) => {
    const key = DataCache.generateKey('price', symbol)
    return dataCache.get(key)
  },

  // Cache levels data
  cacheLevels: (symbol: string, timeframe: string, data: any) => {
    const key = DataCache.generateKey('levels', symbol, timeframe)
    dataCache.set(key, data, 'levels')
  },

  getCachedLevels: (symbol: string, timeframe: string) => {
    const key = DataCache.generateKey('levels', symbol, timeframe)
    return dataCache.get(key)
  },

  // Cache analysis data
  cacheAnalysis: (symbol: string, timeframe: string, data: any) => {
    const key = DataCache.generateKey('analysis', symbol, timeframe)
    dataCache.set(key, data, 'analysis')
  },

  getCachedAnalysis: (symbol: string, timeframe: string) => {
    const key = DataCache.generateKey('analysis', symbol, timeframe)
    return dataCache.get(key)
  }
}

// Auto cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    dataCache.cleanup()
  }, 5 * 60 * 1000)
}
