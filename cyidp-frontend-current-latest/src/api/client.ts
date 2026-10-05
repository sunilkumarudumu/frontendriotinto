/**
 * API Client for the Document Pipeline Backend
 *
 * This module provides typed functions to interact with the FastAPI backend.
 * All URLs use the VITE_API_BASE_URL environment variable.
 * An empty value uses same-origin requests (Vite dev proxy).
 */

const CONFIGURED_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL === undefined
    ? 'http://localhost:8000'
    : String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')

export function getApiBaseUrl(): string {
  if (CONFIGURED_API_BASE_URL) return CONFIGURED_API_BASE_URL
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'http://localhost:5173'
}


// ============================================================================
// Types
// ============================================================================

export interface UploadResponse {
  job_id: string
  status: string
  message: string
}

export interface JobStatus {
  job_id: string
  status:
    | 'queued'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'awaiting_confirmation'
    | 'awaiting_duplicate_review'
  stage: string
  progress: number | null
  message: string
  error: string | null
  library?: string | null
  site?: string | null
  batch?: string | null
  document_count?: number | null
  pipeline_tracking?: {
    ocr?: { done: number; total: number }
    post_ocr?: { done: number; total: number }
    waiting_review?: { advanced: number; post_ocr: number }
    classification?: { done: number; total: number }
  } | null
}

export interface JobSummary extends JobStatus {
  blob_run_name?: string | null
  document_count?: number
  created_at?: string
  updated_at?: string
}

export interface ConfidentialSummary {
  asset?: string | null
  confidential?: string | null
  confidential_source?: string | null
  confidential_matched_terms?: string[] | string | null
  folder_key?: string | null
}

export interface RetentionInfo {
  version?: string | null
  trigger?: string | null
  retention_period?: string | null
  review_year?: number | string | null
  status?: string | null
  asset?: string | null
  asset_region?: string | null
  retention_region?: string | null
  rds_code?: string | null
  created_date?: string | null
  review_date?: string | null
  selection_basis?: string | null
}

export interface Document extends ConfidentialSummary {
  document_id: string
  file_name: string
  path: string
  score: number | null
  status: string | null
  page_count?: number | null
  folder?: string | null
  sub_folder?: string | null
  data_type?: string | null
  discipline?: string | null
  business_function?: string | null
  content_type?: string | null
  library?: string | null
  subject?: string | null
  date?: string | null
  author_company?: string | null
  retention_period?: string | null
  review_year?: string | number | null
  retention_trigger?: string | null
  rds_code?: string | null
  cyient_remarks?: string | null
  box_id?: string | null
  pipeline_stage?: string | null
  docint_status?: string | null
  post_ocr_status?: string | null
  asset_classification_status?: string | null
  llm_status?: string | null
  trpryv_status?: string | null
  current_status?: string | null
  advanced_release_status?: string | null
  advanced_status?: string | null
  basic_status?: string | null
  error?: string | null
}

export interface DocumentDetails extends ConfidentialSummary {
  document_id: string
  file_name: string | null
  pages: number | null
  folder_structure: string | null
  folder?: string | null
  sub_folder?: string | null
  document_type: string | null
  data_type: string | null
  discipline: string | null
  business_function?: string | null
  content_type?: string | null
  library?: string | null
  subject?: string | null
  date?: string | null
  author_company?: string | null
  classification_status?: string | null
  rds_code?: string | null
  path: string | null
  file_path?: string | null
  folderpath?: string | null
  retention?: RetentionInfo | null
}

export interface TopMatch {
  rank: number
  record_code: string
  record_name: string
  department: string
  confidence: number
  matched_rule_summary: string
  why_selected: string
  evidence: unknown[]
}

export interface ClassificationResult extends ConfidentialSummary {
  filename: string
  classification_status: string
  folder?: string | null
  sub_folder?: string | null
  data_type?: string | null
  discipline?: string | null
  business_function?: string | null
  content_type?: string | null
  library?: string | null
  subject?: string | null
  date?: string | null
  author_company?: string | null
  top_matches: TopMatch[]
  retention?: RetentionInfo | null
  cyient_remarks?: string | null
  box_id?: string | null
}

export interface AssetClassificationResult extends ConfidentialSummary {
  asset?: string | null
  classification?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export interface ReportsResponse {
  duplicates: string | null
  unique: string | null
}

// ============================================================================
// Upload & Job Management
// ============================================================================

export async function listJobs(): Promise<JobSummary[]> {
  const response = await fetch(`${getApiBaseUrl()}/api/jobs`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  })
  if (!response.ok) {
    throw new Error(`Failed to load run history: ${response.statusText}`)
  }
  const data = await response.json()
  return data.jobs || []
}

/**
 * Upload a file to the backend and create a processing job.
 * The job starts in 'queued' status and does not process automatically.
 */
export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${getApiBaseUrl()}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(error.detail || `Upload failed: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Start processing for a queued job.
 */
export async function startJob(jobId: string, pipeline?: string): Promise<JobStatus> {
  const url = new URL(`${getApiBaseUrl()}/api/jobs/${jobId}/start`)
  if (pipeline) {
    url.searchParams.append('pipeline', pipeline)
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to start job' }))
    throw new Error(error.detail || `Failed to start job: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get the current status of a processing job.
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/status`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })

    if (response.ok) {
      return response.json()
    }

    lastError = new Error(
      response.status === 404 ? 'Job not found' : `Failed to fetch job status: ${response.statusText}`,
    )
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }

  return {
    job_id: jobId,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    message: lastError?.message
      ? 'Waiting for the Function App / Service Bus worker to pick up this job.'
      : 'Job queued',
    error: null,
  }
}

// ============================================================================
// Documents
// ============================================================================

/**
 * Get the list of documents for a completed job.
 */
export async function getDocuments(
  jobId: string,
  options?: {
    view?: 'classification' | 'metadata'
    fromDate?: string
    toDate?: string
  },
): Promise<Document[]> {
  const view = options?.view || 'classification'
  const hasDateFilter = Boolean(options?.fromDate || options?.toDate)
  const params = new URLSearchParams()
  if (view === 'metadata') {
    params.set('view', 'metadata')
  }
  if (options?.fromDate) {
    params.set('from_date', options.fromDate)
  }
  if (options?.toDate) {
    params.set('to_date', options.toDate)
  }
  const query = params.toString() ? `?${params.toString()}` : ''
  const url =
    view === 'metadata' && hasDateFilter
      ? `${getApiBaseUrl()}/api/documents${query}`
      : `${getApiBaseUrl()}/api/jobs/${encodeURIComponent(jobId)}/documents${query}`

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.statusText}`)
  }

  const data = await response.json()
  return data.documents || []
}

/**
 * Get details for a specific document.
 */
export async function getDocumentDetails(jobId: string, documentId: string): Promise<DocumentDetails> {
  const response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/documents/${documentId}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch document details: ${response.statusText}`)
  }

  return response.json()
}

export async function processDuplicateDecision(
  jobId: string,
  sourceDocumentId: string,
  action: 'process' | 'reject' | 'stop',
  duplicateDocumentId?: string,
  documentIds?: string[],
): Promise<{ status: string; document_ids: string[] }> {
  let response: Response
  try {
    response = await fetch(
      `${getApiBaseUrl()}/api/jobs/${encodeURIComponent(jobId)}/documents/${encodeURIComponent(sourceDocumentId)}/process`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          duplicate_document_id: duplicateDocumentId,
          document_ids: documentIds,
        }),
      },
    )
  } catch {
    throw new Error('Failed to reach API for Process/Stop. Check that the backend is running and CORS allows this origin.')
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update duplicate decision' }))
    const detail = typeof error.detail === 'string' ? error.detail : 'Failed to update duplicate decision'
    throw new Error(detail)
  }
  return response.json()
}

// ============================================================================
// Classification
// ============================================================================

/**
 * Get the AI classification results for a document.
 */
export async function getClassification(jobId: string, documentId: string): Promise<ClassificationResult> {
  const response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/documents/${documentId}/classification`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Classification not found')
    }
    throw new Error(`Failed to fetch classification: ${response.statusText}`)
  }

  return response.json()
}

export type ClassificationUpdate = Partial<
  Pick<
    ClassificationResult,
    | 'asset'
    | 'folder'
    | 'sub_folder'
    | 'data_type'
    | 'discipline'
    | 'business_function'
    | 'content_type'
    | 'classification_status'
    | 'subject'
    | 'date'
    | 'author_company'
    | 'top_matches'
    | 'confidential'
  >
> & {
  selected_rds_code?: string | null
  cyient_remarks?: string | null
  box_id?: string | null
  retention_trigger?: string | null
  retention_period?: string | null
  review_year?: string | number | null
  retention_version?: string | null
}

/**
 * Save reviewed LLM classification fields before retention mapping.
 */
export async function updateClassification(
  jobId: string,
  documentId: string,
  updates: ClassificationUpdate,
): Promise<ClassificationResult> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/jobs/${jobId}/documents/${documentId}/classification`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    },
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update classification' }))
    throw new Error(error.detail || `Failed to update classification: ${response.statusText}`)
  }

  return response.json()
}

export async function archiveDocuments(
  jobId: string,
  documentIds: string[],
): Promise<{
  archived: Array<{ document_id: string; blob_path: string }>
  failed: Array<{ document_id: string; error: string }>
}> {
  const response = await fetch(`${getApiBaseUrl()}/api/jobs/${encodeURIComponent(jobId)}/documents/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_ids: documentIds }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to process documents' }))
    const detail =
      typeof error.detail === 'string'
        ? error.detail
        : error.detail
          ? JSON.stringify(error.detail)
          : 'Failed to process documents'
    throw new Error(detail)
  }
  return response.json()
}

/** Classification Process: OCR → AI classification → extraction for selected unique docs. */
export async function processDocumentsBatch(
  jobId: string,
  documentIds: string[],
): Promise<{
  queued: string[]
  skipped: Array<{ document_id: string; reason: string }>
  job_id: string
}> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/jobs/${encodeURIComponent(jobId)}/documents/process-batch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_ids: documentIds }),
    },
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to start Classification Process' }))
    const detail =
      typeof error.detail === 'string'
        ? error.detail
        : error.detail
          ? JSON.stringify(error.detail)
          : 'Failed to start Classification Process'
    throw new Error(detail)
  }
  return response.json()
}

/**
 * @deprecated Retention mapping runs automatically after classification and when asset/RDS code changes.
 */
export async function confirmRetention(jobId: string): Promise<JobStatus> {
  const response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/confirm-retention`, {
    method: 'POST',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to start retention mapping' }))
    throw new Error(error.detail || `Failed to start retention mapping: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get pre-LLM asset classification enrichment for a document.
 */
export async function getAssetClassification(
  jobId: string,
  documentId: string,
): Promise<AssetClassificationResult> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/jobs/${jobId}/documents/${documentId}/asset-classification`,
  )

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Asset classification not found')
    }
    throw new Error(`Failed to fetch asset classification: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get the URL to the actual document file for preview.
 * Returns a URL string that can be used directly in an iframe or object element.
 */
export function getDocumentFileUrl(jobId: string, documentId: string): string {
  return `${getApiBaseUrl()}/api/jobs/${jobId}/documents/${documentId}/file`
}

export function getUniqueDocumentFileUrl(jobId: string, documentId: string): string {
  return `${getApiBaseUrl()}/api/jobs/${jobId}/documents/${documentId}/file/unique`
}

// ============================================================================
// Reports
// ============================================================================

/**
 * Get the list of available reports for a job.
 */
export async function getReports(jobId: string): Promise<ReportsResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/reports`)

  if (!response.ok) {
    throw new Error(`Failed to fetch reports: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Download the duplicates report (Excel file).
 */
export async function downloadDuplicatesReport(jobId: string, filename: string = 'Duplicates.xlsx'): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/reports/duplicates`)

  if (!response.ok) {
    throw new Error('Duplicates report not found')
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Download the unique documents report (Excel file).
 */
export async function downloadUniqueReport(jobId: string, filename: string = 'Unique_Documents.xlsx'): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/reports/unique`)

  if (!response.ok) {
    throw new Error('Unique report not found')
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Download a report by stage (e.g., "basic" stage downloads Duplicate_Report_V1.xlsx)
 */
export async function downloadStageReport(jobId: string, stage: string): Promise<void> {
  // Map stage names to their download endpoints
  if (stage === 'basic') {
    return downloadDuplicatesReport(jobId, 'Duplicate_Report_V1.xlsx')
  }
  
  throw new Error(`No report available for stage: ${stage}`)
}

/**
 * Download the advanced duplicates report (Excel file).
 */
export async function downloadAdvancedDuplicatesReport(jobId: string, filename: string = 'Advanced_Duplicates.xlsx'): Promise<void> {
  const candidateUrls = [
    `${getApiBaseUrl()}/api/jobs/${jobId}/reports/advanced-duplicates`,
    `${getApiBaseUrl()}/api/jobs/${jobId}/reports/advanced-duplicates/download`,
    `${getApiBaseUrl()}/api/jobs/${jobId}/reports/duplicates`,
  ]

  let response: Response | null = null
  for (const url of candidateUrls) {
    response = await fetch(url)
    if (response.ok) {
      break
    }
  }

  if (!response || !response.ok) {
    throw new Error('Advanced duplicates report not found')
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
