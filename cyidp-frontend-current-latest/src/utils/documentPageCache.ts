type DocumentPageCacheEntry = {
  documents: unknown[]
  selected: number[]
  expandedRows: number[]
  currentPage: number
}

// Shared so Duplicate Detection can invalidate after Process/Stop and List
// of Documents always loads a fresh view when opened.
const documentPageCache = new Map<string, DocumentPageCacheEntry>()
const prefetchedDocuments = new Map<string, unknown[]>()

const staleKey = (jobId: string) => `cyidp_docs_stale_${jobId}`

export function getDocumentPageCache<T = DocumentPageCacheEntry>(
  jobId: string | null | undefined,
): T | undefined {
  if (!jobId) return undefined
  return documentPageCache.get(jobId) as T | undefined
}

export function setDocumentPageCache(jobId: string, entry: DocumentPageCacheEntry) {
  documentPageCache.set(jobId, entry)
}

export function clearDocumentPageCache(jobId?: string | null) {
  if (!jobId) {
    documentPageCache.clear()
    return
  }
  documentPageCache.delete(jobId)
}

export function hasDocumentPageCache(jobId: string | null | undefined): boolean {
  return Boolean(jobId && documentPageCache.has(jobId))
}

export function setPrefetchedDocuments(jobId: string, documents: unknown[]) {
  prefetchedDocuments.set(jobId, documents)
  // Fresh payload replaces any outdated page cache.
  documentPageCache.delete(jobId)
}

export function peekPrefetchedDocuments(jobId: string | null | undefined): unknown[] | null {
  if (!jobId) return null
  return prefetchedDocuments.get(jobId) ?? null
}

export function takePrefetchedDocuments(jobId: string | null | undefined): unknown[] | null {
  if (!jobId) return null
  const documents = prefetchedDocuments.get(jobId)
  if (!documents) return null
  prefetchedDocuments.delete(jobId)
  return documents
}

export function isDocumentListStale(jobId?: string | null): boolean {
  if (!jobId || typeof sessionStorage === 'undefined') return false
  return Boolean(sessionStorage.getItem(staleKey(jobId)))
}

export function markDocumentListStale(jobId?: string | null) {
  if (!jobId) return
  // Drop outdated rows so List never paints the pre-Process/Stop view.
  clearDocumentPageCache(jobId)
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(staleKey(jobId), String(Date.now()))
}

export function consumeDocumentListStale(jobId?: string | null): boolean {
  if (!jobId || typeof sessionStorage === 'undefined') return false
  const key = staleKey(jobId)
  if (!sessionStorage.getItem(key)) return false
  sessionStorage.removeItem(key)
  return true
}
