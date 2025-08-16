interface CacheEntry {
  data: any
  timestamp: number
  expiry: number
}

class DataCache {
  private cache = new Map<string, CacheEntry>()
  private pendingRequests = new Map<string, Promise<any>>()
  private readonly CACHE_DURATION = 15 * 60 * 1000 // 15 minutes

  get(key: string): any | null {
    const entry = this.cache.get(key)
    if (entry && Date.now() < entry.expiry) {
      return entry.data
    }
    this.cache.delete(key)
    return null
  }

  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + this.CACHE_DURATION,
    })
  }

  async getOrFetch(key: string, fetchFn: () => Promise<any>): Promise<any> {
    // Check cache first
    const cached = this.get(key)
    if (cached) {
      return cached
    }

    // Check if request is already pending
    const pending = this.pendingRequests.get(key)
    if (pending) {
      return pending
    }

    // Make new request
    const promise = fetchFn()
      .then((data) => {
        this.set(key, data)
        this.pendingRequests.delete(key)
        return data
      })
      .catch((error) => {
        this.pendingRequests.delete(key)
        throw error
      })

    this.pendingRequests.set(key, promise)
    return promise
  }

  clear(): void {
    this.cache.clear()
    this.pendingRequests.clear()
  }

  size(): number {
    return this.cache.size
  }
}

export const priceCache = new DataCache()
