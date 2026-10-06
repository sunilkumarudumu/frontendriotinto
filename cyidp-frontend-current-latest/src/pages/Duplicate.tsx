import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Layout from '../components/Layout'
import DuplicateReviewBanner from '../components/DuplicateReviewBanner'
import { useJob } from '../context/JobContext'
import { useUser } from '../context/UserContext'
import { getDocumentFileUrl, getDocuments, getApiBaseUrl, processDuplicateDecision, listJobs, getJobStatus, type JobStatus } from '../api/client'
import { markDocumentListStale, setPrefetchedDocuments, clearDocumentPageCache } from '../utils/documentPageCache'
import { assignDuplicateRecordsToUser, getDuplicateAssignmentForRecord } from '../utils/duplicateAssignments'
import xlsxIcon from '../assets/xlsx-icon.svg'

const EXCEL_EXTENSIONS = /\.(xlsx|xls|xlsm|xltx|csv)(\?|#|$)/i
const WORD_EXTENSIONS = /\.(docx|doc|docm|dotx|dotm|rtf)(\?|#|$)/i
const PDF_EXTENSIONS = /\.pdf(\?|#|$)/i

const isExcelFile = (fileName: string): boolean => EXCEL_EXTENSIONS.test(fileName)
const isWordFile = (fileName: string): boolean => WORD_EXTENSIONS.test(fileName)
const isPdfFile = (fileName: string): boolean => PDF_EXTENSIONS.test(fileName)

const getDisplayHeader = (header: string): string => {
  if (header === 'Original Document') return 'File name'
  if (header === 'Duplicate File Name') return 'duplicate with'
  if (header === 'Confirm Duplicate') return ''
  return header
}

type DuplicateColumn = {
  label: string
  keys: string[]
  tooltip?: string
}

const DUPLICATE_COLUMNS: DuplicateColumn[] = [
  { label: 'Filename', keys: ['Original Document', 'File name', 'filename'], tooltip: 'Source document file name' },
  { label: 'Duplicate Document', keys: ['Duplicate File Name', 'duplicate with'], tooltip: 'Document identified as the duplicate or contained document' },
  { label: 'Reason', keys: ['Reason', 'reason'], tooltip: 'Reason the system classified the pair as duplicate' },
  { label: 'Stage', keys: ['Stage', 'stage'], tooltip: 'Pipeline stage that produced this match' },
  { label: 'Page Count Source', keys: ['Page Count Source', 'page_count_source'], tooltip: 'Total page count for the source document' },
  { label: 'Page Count Duplicate', keys: ['Page Count Duplicate', 'page_count_duplicate'], tooltip: 'Total page count for the duplicate document' },
  { label: 'Page Mapping', keys: ['Page Mapping', 'page_mapping'], tooltip: 'Page-level correspondence between the two documents' },
  { label: 'Confirm Duplicate', keys: ['Confirm Duplicate', 'confirm duplicate', 'confirm_duplicate'], tooltip: 'Mark this duplicate record as confirmed' },
]
const ASSIGNED_TO_COLUMN: DuplicateColumn = {
  label: 'Assigned To',
  keys: [],
  tooltip: 'Assigned user for this duplicate record',
}

const REASON_TOOLTIPS: Record<string, string> = {
  'Exact Duplicate': 'The documents are effectively the same content or have identical file-level fingerprints.',
  'Exact File Match': 'The documents have identical file-level fingerprints, meaning the stored file content is the same.',
  'Exact Text Match': 'The documents have identical extracted text fingerprints, meaning their text content is the same.',
  'Exact Image Match': 'The documents have identical image fingerprints, meaning their page visuals match.',
  'Cross-Format Duplicate': 'The files are duplicates even though they use different file formats.',
  'Same Document Name': 'The documents share the same name but are not necessarily identical in content.',
  'Contained Duplicate': 'One document is fully contained inside the other document’s content.',
  'Full Content Match': 'The OCR content for both documents fully matches across their content.',
  'Partial Content Match': 'The documents share some overlapping content, but not the full document.',
  'Shared Content': 'The documents have overlapping content, but this is not a full duplicate match.',
  'Same Name, Different Format': 'Documents share the same name but differ in extension or file format.',
  'Same Name & Format': 'Documents share the same file name and format, indicating a likely duplicate.',
  'Numbered Copy': 'This appears to be a numbered or sequential copy of the same document.',
  'Draft Superseded by Final': 'An older draft has been replaced by a newer final version.',
  'Older Draft': 'This document looks like an earlier draft compared with another version in the set.',
}

const getReasonTooltip = (reason: string): string | null => {
  const trimmed = reason?.trim()
  if (!trimmed) return null
  const mappedReasonTooltip = REASON_TOOLTIPS[trimmed]
  if (mappedReasonTooltip) return mappedReasonTooltip

  // Fall back to display-value tooltips (for values like token_overlap).
  return getDisplayValueTooltip(formatDisplayValue(trimmed))
}

const DISPLAY_VALUE_TOOLTIPS: Record<string, string> = {
  'Content overlap': 'Content Matching',
  'Page containment': 'Page-level containment match',
  'Exact content match': 'Exact document content match',
  'Content match': 'Document content match',
}

const APP_USER_OPTIONS = [
  'veerashivudu',
  'test1',
  'test2',
  'test3',
  'test4',
]

const getDisplayValueTooltip = (displayValue: string): string | null => {
  const trimmed = displayValue?.trim()
  if (!trimmed || trimmed === '-') return null
  return DISPLAY_VALUE_TOOLTIPS[trimmed] ?? null
}

const PDF_URL_KEYS = [
  'pdf_url',
  'pdfUrl',
  'document_url',
  'documentUrl',
  'source_url',
  'sourceUrl',
  'url',
  'path',
  'file_path',
  'filePath',
]

const GENERIC_DOCUMENT_URL_KEYS = [
  ...PDF_URL_KEYS,
  'download_url',
  'downloadUrl',
  'document_link',
  'documentLink',
  'source_link',
  'sourceLink',
  'duplicate_link',
  'duplicateLink',
  'duplicate_file_url',
  'duplicateFileUrl',
  'word_url',
  'wordUrl',
  'doc_url',
  'docUrl',
  'excel_url',
  'excelUrl',
]

const SOURCE_DOCUMENT_ID_KEYS = [
  'source_document_id',
  'sourceDocumentId',
  'original_document_id',
  'originalDocumentId',
  'source_id',
  'sourceId',
]

const SOURCE_URL_KEYS = [
  'source_pdf_url',
  'sourcePdfUrl',
  'source_document_url',
  'sourceDocumentUrl',
  'original_pdf_url',
  'originalPdfUrl',
  'original_document_url',
  'originalDocumentUrl',
  'original_url',
  'originalUrl',
  'source_file_url',
  'sourceFileUrl',
  'source_download_url',
  'sourceDownloadUrl',
]

const formatDisplayValue = (value: string): string => {
  if (!value || value === '-') return value

  const trimmed = value.trim()
  const normalized = trimmed.toLowerCase()

  if (normalized === 'token_overlap') return 'Content overlap'
  if (normalized === 'page_identity') return 'Page containment'
  if (normalized === 'document-level (exact llm_content hash)') return 'Exact content match'
  if (normalized === 'document-level (llm_content)') return 'Content match'

  return trimmed
}

const compressPageNumbers = (value: string): string => {
  const numbers = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item))

  if (numbers.length < 3) return value.trim()

  const ranges: string[] = []
  let start = numbers[0]
  let previous = numbers[0]

  for (const number of numbers.slice(1)) {
    if (number === previous + 1) {
      previous = number
      continue
    }

    ranges.push(start === previous ? String(start) : `${start}-${previous}`)
    start = number
    previous = number
  }

  ranges.push(start === previous ? String(start) : `${start}-${previous}`)
  return ranges.join(',')
}

const formatPageMapping = (value: string): string => {
  const parts = value.split('<->')
  if (parts.length !== 2) return value

  const first = parts[0].trim().match(/^([AB]):\s*(.*)$/i)
  const second = parts[1].trim().match(/^([AB]):\s*(.*)$/i)
  if (!first || !second) return value

  return `A: ${compressPageNumbers(second[2])} <-> B: ${compressPageNumbers(first[2])}`
}

const getColumnValue = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value)
    }
  }
  return '-'
}

const getRowSelectionKey = (row: Record<string, unknown>, side: 'source' | 'duplicate'): string => {
  return JSON.stringify([
    String(row.source_document_id || '').trim(),
    String(row.document_id || '').trim(),
    side,
  ])
}

const normalizeSearchText = (value: string): string => {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

const cleanMetaValue = (value: unknown): string => String(value ?? '').trim()

const isTruthyValue = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['true', '1', 'yes', 'y', 'checked'].includes(normalized)
  }
  return false
}

const isConfirmDuplicateChecked = (row: Record<string, unknown>, keys: string[]): boolean => {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return isTruthyValue(value)
    }
  }
  return false
}

const toAbsoluteUrl = (value: string): string => {
  if (/^(https?:|blob:|data:)/i.test(value)) return value
  if (value.startsWith('/')) {
    const baseUrl = getApiBaseUrl()
    return `${baseUrl}${value}`
  }
  return value
}

const getFirstNonEmptyValue = (row: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return null
}

const isResolvableWebUrl = (value: string): boolean => {
  return /^(https?:|blob:|data:)/i.test(value) || value.startsWith('/')
}

const isInvalidFileFallbackUrl = (value: string): boolean => {
  return /\/api\/jobs\/[^/]+\/files\//i.test(value)
}

const getFileNameLookupKeys = (value: string): string[] => {
  const trimmed = value.trim()
  if (!trimmed) return []

  const lower = trimmed.toLowerCase()
  let basename = lower
  if (lower.includes('/')) {
    basename = lower.split('/').pop() || lower
  } else if (lower.includes('\\')) {
    basename = lower.split('\\').pop() || lower
  }

  const withoutExt = lower.replace(/\.[^.]+$/, '')
  const basenameWithoutExt = basename.replace(/\.[^.]+$/, '')
  const compact = lower.replace(/[^a-z0-9]/g, '')
  const compactBasename = basename.replace(/[^a-z0-9]/g, '')

  return Array.from(new Set([lower, basename, withoutExt, basenameWithoutExt, compact, compactBasename].filter(Boolean)))
}

const getPreviewFileName = (value: string): string => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed || trimmed === '-') return 'Document Preview'

  const slashNormalized = trimmed.replace(/\\/g, '/')
  const baseName = slashNormalized.split('/').pop() || trimmed
  return baseName.trim() || 'Document Preview'
}

const addFileNameMappings = (target: Record<string, string>, rawFileName: string, documentId: string): void => {
  for (const key of getFileNameLookupKeys(rawFileName)) {
    target[key] = documentId
  }
}

interface ExcelData {
  headers: string[]
  rows: any[]
}

const duplicatePageCache = new Map<string, { data: ExcelData | null; selectedFilenames: string[]; selectedDuplicateDocuments: string[]; currentPage: number }>()

const duplicateDataCache = new Map<string, ExcelData>()
const duplicateDataInFlight = new Map<string, Promise<ExcelData>>()

const clearDuplicateDataCache = (jobId?: string | null) => {
  if (jobId) {
    duplicateDataCache.delete(jobId)
    duplicateDataInFlight.delete(jobId)
    return
  }
  duplicateDataCache.clear()
  duplicateDataInFlight.clear()
}

const fetchDuplicateDataOnce = async (jobId: string, bypassCache = false): Promise<ExcelData> => {
  const cached = duplicateDataCache.get(jobId)
  // For silent/bypass refreshes, prefer serving stale cache until a non-empty
  // payload arrives so the table does not blank during report rebuilds.
  if (bypassCache) {
    const inFlight = duplicateDataInFlight.get(jobId)
    if (inFlight) return inFlight

    const request = (async () => {
      const response = await fetch(
        `${getApiBaseUrl()}/api/jobs/${jobId}/reports/all-stages/data`,
        {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        },
      )

      if (!response.ok) {
        throw new Error('Failed to load duplicate report data from server')
      }

      const jsonResponse = await response.json()
      const pairs = ((jsonResponse.duplicates as Record<string, unknown>[]) || []).filter(
        (row) => !row.inventory_row,
      )
      const inventory = (jsonResponse.documents as Record<string, unknown>[]) || []
      const jsonData = jsonResponse.has_duplicate_pairs ? pairs : (pairs.length ? pairs : inventory)

      if (jsonData.length === 0) {
        // Keep prior cache when the API returns empty mid-refresh.
        if (cached && cached.rows.length > 0) {
          return cached
        }
        const empty: ExcelData = { headers: [], rows: [] }
        return empty
      }

      const result: ExcelData = {
        headers: Object.keys(jsonData[0]),
        rows: jsonData,
      }
      duplicateDataCache.set(jobId, result)
      return result
    })()

    duplicateDataInFlight.set(jobId, request)
    try {
      return await request
    } finally {
      duplicateDataInFlight.delete(jobId)
    }
  }

  if (cached) return cached

  const inFlight = duplicateDataInFlight.get(jobId)
  if (inFlight) return inFlight

  const request = (async () => {
    const response = await fetch(
    `${getApiBaseUrl()}/api/jobs/${jobId}/reports/all-stages/data`,
      {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      },
    )

    if (!response.ok) {
      throw new Error('Failed to load duplicate report data from server')
    }

    const jsonResponse = await response.json()
    const pairs = ((jsonResponse.duplicates as Record<string, unknown>[]) || []).filter(
      (row) => !row.inventory_row,
    )
    const inventory = (jsonResponse.documents as Record<string, unknown>[]) || []
    const jsonData = jsonResponse.has_duplicate_pairs ? pairs : (pairs.length ? pairs : inventory)

    // Show uploaded/inventory rows when there are no duplicate pairs.
    if (jsonData.length === 0) {
      const result: ExcelData = {
        headers: [],
        rows: [],
      }
      return result
    }

    const result: ExcelData = {
      headers: Object.keys(jsonData[0]),
      rows: jsonData,
    }

    duplicateDataCache.set(jobId, result)
    return result
  })()

  duplicateDataInFlight.set(jobId, request)
  try {
    return await request
  } finally {
    duplicateDataInFlight.delete(jobId)
  }
}

export default function Duplicate() {
  const { jobId: contextJobId } = useJob()
  const { user } = useUser()
  const [searchParams] = useSearchParams()
  const jobId = searchParams.get('job_id') || contextJobId
  const cachedPage = jobId ? duplicatePageCache.get(jobId) : undefined
  const [duplicateData, setDuplicateData] = useState<ExcelData | null>(() => cachedPage?.data ?? null)
  const [documentIdByFileName, setDocumentIdByFileName] = useState<Record<string, string>>({})
  const [documentIdByJobAndFileName, setDocumentIdByJobAndFileName] = useState<Record<string, Record<string, string>>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [assetOptions, setAssetOptions] = useState<string[]>([])
  const [batchOptions, setBatchOptions] = useState<string[]>([])
  const [selectedAsset, setSelectedAsset] = useState('')
  const [selectedBatch, setSelectedBatch] = useState('')
  const [selectedLibrary, setSelectedLibrary] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [assignmentMessage, setAssignmentMessage] = useState('')
  const [currentJobAsset, setCurrentJobAsset] = useState('')
  const [currentJobBatch, setCurrentJobBatch] = useState('')
  const [currentJobLibrary, setCurrentJobLibrary] = useState('')
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [showReasonFilterMenu, setShowReasonFilterMenu] = useState(false)
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [showStageFilterMenu, setShowStageFilterMenu] = useState(false)
  const [currentPage, setCurrentPage] = useState(() => cachedPage?.currentPage ?? 1)
  const [selectedFilenames, setSelectedFilenames] = useState<string[]>(() => cachedPage?.selectedFilenames ?? [])
  const [selectedDuplicateDocuments, setSelectedDuplicateDocuments] = useState<string[]>(() => cachedPage?.selectedDuplicateDocuments ?? [])
  const [processingRows, setProcessingRows] = useState<Set<number>>(new Set())
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const RECORDS_PER_PAGE = 10
  const reasonFilterMenuRef = useRef<HTMLDivElement | null>(null)
  const stageFilterMenuRef = useRef<HTMLDivElement | null>(null)
  const lastReportReloadKeyRef = useRef('')
  const rowStatusPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hydratedDuplicateJobRef = useRef<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    hydratedDuplicateJobRef.current = jobId
    const cached = duplicatePageCache.get(jobId)
    if (!cached) return
    setDuplicateData(cached.data)
    setSelectedFilenames(cached.selectedFilenames)
    setSelectedDuplicateDocuments(cached.selectedDuplicateDocuments)
    setCurrentPage(cached.currentPage)
  }, [jobId])

  useEffect(() => {
    if (!jobId || hydratedDuplicateJobRef.current !== jobId) return
    if (duplicateData === null) return
    duplicatePageCache.set(jobId, {
      data: duplicateData,
      selectedFilenames,
      selectedDuplicateDocuments,
      currentPage,
    })
  }, [jobId, duplicateData, selectedFilenames, selectedDuplicateDocuments, currentPage])
  
  useEffect(() => {
    localStorage.removeItem('cyidp_stored_duplicates')
  }, [])

  useEffect(() => {
    let isActive = true

    const loadDropdownMetadata = async () => {
      if (!jobId) {
        setAssetOptions([])
        setBatchOptions([])
        setSelectedAsset('')
        setSelectedBatch('')
        setSelectedLibrary('')
        setCurrentJobAsset('')
        setCurrentJobBatch('')
        setCurrentJobLibrary('')
        return
      }

      try {
        const [jobs, currentJob] = await Promise.all([
          listJobs().catch(() => []),
          getJobStatus(jobId).catch(() => null),
        ])

        if (!isActive) return

        const assets = new Set<string>()
        const batches = new Set<string>()
        const libraries = new Set<string>()

        jobs.forEach((job) => {
          const asset = cleanMetaValue(job.site)
          const batch = cleanMetaValue(job.batch)
          const library = cleanMetaValue(job.library)
          if (asset) assets.add(asset)
          if (batch) batches.add(batch)
          if (library) libraries.add(library)
        })

        const currentAsset = cleanMetaValue(currentJob?.site)
        const currentBatch = cleanMetaValue(currentJob?.batch)
        const currentLibrary = cleanMetaValue(currentJob?.library)

        if (currentAsset) assets.add(currentAsset)
        if (currentBatch) batches.add(currentBatch)
        if (currentLibrary) libraries.add(currentLibrary)

        const nextAssets = Array.from(assets).sort((a, b) => a.localeCompare(b))
        const nextBatches = Array.from(batches).sort((a, b) => a.localeCompare(b))
        setAssetOptions(nextAssets)
        setBatchOptions(nextBatches)
        setCurrentJobAsset(currentAsset)
        setCurrentJobBatch(currentBatch)
        setCurrentJobLibrary(currentLibrary)

        setSelectedAsset(currentAsset)
        setSelectedBatch(currentBatch)
        setSelectedLibrary(currentLibrary)
      } catch {
        if (!isActive) return
        setAssetOptions([])
        setBatchOptions([])
      }
    }

    void loadDropdownMetadata()

    return () => {
      isActive = false
    }
  }, [jobId])

  useEffect(() => {
    if (jobId) {
      lastReportReloadKeyRef.current = ''
      clearDuplicateDataCache(jobId)
      loadDuplicateData(false)
    }
    return () => {
      if (rowStatusPollRef.current) {
        clearInterval(rowStatusPollRef.current)
        rowStatusPollRef.current = null
      }
    }
  }, [jobId])

  const startRowStatusPolling = useCallback(() => {
    if (!jobId) return
    if (rowStatusPollRef.current) {
      clearInterval(rowStatusPollRef.current)
    }
    let ticks = 0
    rowStatusPollRef.current = setInterval(() => {
      ticks += 1
      void loadDuplicateData(true, true).then(() => {
        // Stop early once every decided row has finished OCR / Asset→AI.
        setDuplicateData((current) => {
          if (!current) return current
          const stillWorking = current.rows.some((row) => getRowDecisionState(row) === 'processing')
          if (!stillWorking && rowStatusPollRef.current) {
            clearInterval(rowStatusPollRef.current)
            rowStatusPollRef.current = null
          }
          return current
        })
      })
      if (ticks >= 60 && rowStatusPollRef.current) {
        clearInterval(rowStatusPollRef.current)
        rowStatusPollRef.current = null
      }
    }, 2000)
  }, [jobId])

  const handleJobStatusChange = useCallback((status: JobStatus) => {
    if (!jobId) return

    const message = status.message || ''
    const stage = status.stage || ''
    const tracking = status.pipeline_tracking
    const trackingKey = tracking
      ? `${tracking.ocr?.done}/${tracking.ocr?.total}|${tracking.post_ocr?.done}/${tracking.post_ocr?.total}|${tracking.classification?.done}/${tracking.classification?.total}`
      : ''
    const reloadKey = `${status.status}|${stage}|${status.progress}|${message}|${trackingKey}`
    setJobStatus((current) => {
      const currentTracking = current?.pipeline_tracking
      const currentTrackingKey = currentTracking
        ? `${currentTracking.ocr?.done}/${currentTracking.ocr?.total}|${currentTracking.post_ocr?.done}/${currentTracking.post_ocr?.total}|${currentTracking.classification?.done}/${currentTracking.classification?.total}`
        : ''
      const currentKey = current
        ? `${current.status}|${current.stage}|${current.progress}|${current.message || ''}|${currentTrackingKey}`
        : ''
      return currentKey === reloadKey ? current : status
    })

    const shouldReloadReport =
      status.status === 'awaiting_duplicate_review' ||
      status.status === 'processing' ||
      stage === 'advanced' ||
      stage === 'review' ||
      stage === 'docint' ||
      stage === 'post_ocr' ||
      /post-?ocr|pair|awaiting review/i.test(message)

    if (!shouldReloadReport) return
    // Reload report when pair state changes; tracking-only updates skip Excel reload.
    const reportKey = `${status.status}|${stage}|${message}`
    if (reportKey === lastReportReloadKeyRef.current) return
    lastReportReloadKeyRef.current = reportKey

    // Silent refresh so Process/Stop row status and new pairs update live.
    void loadDuplicateData(true, true)
    if (/post-?ocr/i.test(message) || stage === 'post_ocr') {
      window.setTimeout(() => void loadDuplicateData(true, true), 1500)
      window.setTimeout(() => void loadDuplicateData(true, true), 3500)
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) {
      setJobStatus(null)
      return
    }

    let isActive = true
    let pollTimeout: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      let nextDelay = 2000
      try {
        const status = await getJobStatus(jobId)
        if (!isActive) return
        handleJobStatusChange(status)
        if (
          status.status === 'completed' ||
          status.status === 'failed' ||
          status.status === 'awaiting_confirmation'
        ) {
          return
        }
        if (status.status === 'awaiting_duplicate_review') {
          nextDelay = 2500
        }
      } catch {
        nextDelay = 3000
      }
      if (isActive) {
        pollTimeout = setTimeout(poll, nextDelay)
      }
    }

    void poll()
    return () => {
      isActive = false
      if (pollTimeout) clearTimeout(pollTimeout)
    }
  }, [jobId, handleJobStatusChange])

  useEffect(() => {
    if (!showReasonFilterMenu) return

    const handleClickOutside = (event: MouseEvent) => {
      if (reasonFilterMenuRef.current && !reasonFilterMenuRef.current.contains(event.target as Node)) {
        setShowReasonFilterMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showReasonFilterMenu])

  useEffect(() => {
    if (!showStageFilterMenu) return

    const handleClickOutside = (event: MouseEvent) => {
      if (stageFilterMenuRef.current && !stageFilterMenuRef.current.contains(event.target as Node)) {
        setShowStageFilterMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showStageFilterMenu])

  useEffect(() => {
    if (user?.role !== 'admin') return
    if (selectedUser) return
    if (!APP_USER_OPTIONS.length) return
    setSelectedUser(APP_USER_OPTIONS[0])
  }, [user?.role, selectedUser])

  // Load document mappings for the active job only.
  useEffect(() => {
    let isActive = true

    const loadAllDocumentMappings = async () => {
      try {
        if (!jobId) {
          setDocumentIdByFileName({})
          setDocumentIdByJobAndFileName({})
          return
        }

        const mergedMapping: Record<string, string> = {}
        const mappingByJob: Record<string, Record<string, string>> = {}

        const docs = await getDocuments(jobId)
        mappingByJob[jobId] = {}
        for (const doc of docs) {
          const rawFileName = (doc.file_name || '').trim()
          if (!rawFileName || !doc.document_id) continue

          addFileNameMappings(mergedMapping, rawFileName, doc.document_id)
          addFileNameMappings(mappingByJob[jobId], rawFileName, doc.document_id)
        }
        
        if (isActive) {
          setDocumentIdByFileName(mergedMapping)
          setDocumentIdByJobAndFileName(mappingByJob)
        }
      } catch {
        if (isActive) {
          setDocumentIdByFileName({})
          setDocumentIdByJobAndFileName({})
        }
      }
    }

    loadAllDocumentMappings()

    return () => {
      isActive = false
    }
  }, [jobId])

  const loadDuplicateData = async (bypassCache = false, silent = false) => {
    if (!jobId) {
      setError('No job ID available. Please upload and process documents first.')
      return
    }

    if (!silent) {
      setIsLoading(true)
      setError('')
    }

    try {
      // Fetch duplicate data for the active job only.
      const currentJobData = await fetchDuplicateDataOnce(jobId, bypassCache)
      const nextRows = currentJobData.rows.map((row) => ({ ...row, _sourceJobId: jobId }))

      // Never flash an empty table over existing rows during silent polls /
      // transient empty API responses while reports rebuild.
      if (silent && nextRows.length === 0) {
        setDuplicateData((current) => {
          if (current && current.rows.length > 0) {
            return current
          }
          return current
        })
        return
      }

      setDuplicateData({
        headers: DUPLICATE_COLUMNS.map((column) => column.label),
        rows: nextRows,
      })
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load duplicate report')
      }
      // Keep previous rows on silent refresh errors.
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
    }
  }

  const isPostOcrRow = (row: Record<string, unknown>) => {
    const stage = String(row.Stage || row.stage || '').toLowerCase()
    return stage.includes('post') && stage.includes('ocr')
  }

  const getRowDecisionState = (row: Record<string, unknown>) => {
    const rowStatus = String(row.row_status || '').toUpperCase()
    const pairDecision = String(row.pair_decision || '').toUpperCase()
    if (rowStatus === 'DONE' || ['CONFIRMED', 'REJECTED'].includes(pairDecision)) return 'done'
    if (rowStatus === 'PROCESSING') return 'processing'
    return 'pending'
  }

  const getActionBusyLabel = (row: Record<string, unknown>) => {
    return isPostOcrRow(row) ? 'Asset→AI…' : 'OCR…'
  }

  const handleProcessSelection = async (row: Record<string, unknown>, rowIndex: number) => {
    const sourceDocumentId = String(row.source_document_id || '').trim()
    const duplicateDocumentId = String(row.document_id || '').trim()
    const sourceSelectionKey = getRowSelectionKey(row, 'source')
    const duplicateSelectionKey = getRowSelectionKey(row, 'duplicate')
    const sourceSelected = selectedFilenames.includes(sourceSelectionKey)
    const duplicateSelected = selectedDuplicateDocuments.includes(duplicateSelectionKey)
    const selectedDocumentIds = [
      sourceSelected ? sourceDocumentId : '',
      duplicateSelected ? duplicateDocumentId : '',
    ].filter(Boolean)

    if (!selectedDocumentIds.length) {
      setError('Select a document to send to the next stage.')
      return
    }

    const firstSourceId = sourceDocumentId || selectedDocumentIds[0]
    if (!firstSourceId || !selectedDocumentIds.length) return

    setProcessingRows((current) => {
      const next = new Set(current)
      next.add(rowIndex)
      return next
    })
    try {
      await processDuplicateDecision(
        jobId || '',
        firstSourceId,
        'process',
        duplicateDocumentId || undefined,
        selectedDocumentIds,
      )
      markDocumentListStale(jobId)
      // Await + store prefetch so Intelligence Classification paints fresh rows only.
      if (jobId) {
        clearDocumentPageCache(jobId)
        try {
          const docs = await getDocuments(jobId)
          setPrefetchedDocuments(jobId, docs)
        } catch {
          // List page will show a loader and fetch on open if prefetch fails.
        }
      }
      setSelectedFilenames([])
      setSelectedDuplicateDocuments([])
      setDuplicateData((current) => {
        if (!current) return current
        return {
          ...current,
          rows: current.rows.map((currentRow) => {
            const sameSource = String(currentRow.source_document_id || '').trim() === sourceDocumentId
            const sameDuplicate = String(currentRow.document_id || '').trim() === duplicateDocumentId
            if (!sameSource || !sameDuplicate) return currentRow
            return {
              ...currentRow,
              row_status: 'DONE',
              pair_decision: 'CONFIRMED',
              process_status: 'RELEASED',
              row_selected_document_ids: selectedDocumentIds,
            }
          }),
        }
      })
      await loadDuplicateData(true, true)
      startRowStatusPolling()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process selected documents')
    } finally {
      setProcessingRows((current) => {
        const next = new Set(current)
        next.delete(rowIndex)
        return next
      })
    }

  }

  const handleStopRow = async (row: Record<string, unknown>, rowIndex: number) => {
    const sourceDocumentId = String(row.source_document_id || '').trim()
    const duplicateDocumentId = String(row.document_id || '').trim()
    if (!sourceDocumentId || !duplicateDocumentId) {
      setError('Unable to stop this duplicate relationship row.')
      return
    }

    setProcessingRows((current) => new Set(current).add(rowIndex))
    try {
      await processDuplicateDecision(
        jobId || '',
        sourceDocumentId,
        'stop',
        duplicateDocumentId,
      )
      markDocumentListStale(jobId)
      if (jobId) {
        clearDocumentPageCache(jobId)
        try {
          const docs = await getDocuments(jobId)
          setPrefetchedDocuments(jobId, docs)
        } catch {
          // List page will show a loader and fetch on open if prefetch fails.
        }
      }
      setSelectedFilenames((current) => current.filter((selectionKey) => selectionKey !== getRowSelectionKey(row, 'source')))
      setSelectedDuplicateDocuments((current) => current.filter((selectionKey) => selectionKey !== getRowSelectionKey(row, 'duplicate')))
      await loadDuplicateData(true, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop duplicate relationship')
    } finally {
      setProcessingRows((current) => {
        const next = new Set(current)
        next.delete(rowIndex)
        return next
      })
    }
  }

  const handleDownloadDuplicates = () => {
    if (!duplicateData) return

    if (filteredRows.length === 0) {
      alert('No rows available to download.')
      return
    }

    // Insert file path columns after Duplicate Document column
    const baseHeaders = DUPLICATE_COLUMNS.map((column) => getDisplayHeader(column.label))
    const headers = [
      ...baseHeaders.slice(0, 2), // Filename, Duplicate Document
      'Document File Path',
      'Matched Document File Path',
      ...baseHeaders.slice(2) // Rest of columns
    ]

    const rowValues = filteredRows.map((row: Record<string, unknown>) => {
      const baseValues = DUPLICATE_COLUMNS.map((column) => {
        if (column.label === 'Confirm Duplicate') {
          return isConfirmDuplicateChecked(row, column.keys) ? 'TRUE' : 'FALSE'
        }
        return getColumnValue(row, column.keys)
      })

      return [
        ...baseValues.slice(0, 2), // Filename, Duplicate Document
        getFilePdfUrl(row) || '',
        getDuplicateWithPdfUrl(row) || '',
        ...baseValues.slice(2) // Rest of columns
      ]
    })

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowValues])

    // Keep filename and duplicate document clickable in exported Excel.
    filteredRows.forEach((row: Record<string, unknown>, rowIndex: number) => {
      // Add hyperlink for filename column (column 0)
      const fileUrl = getFilePdfUrl(row)
      if (fileUrl) {
        const fileCellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: 0 })
        const fileCell = worksheet[fileCellAddress]
        if (fileCell) {
          fileCell.l = {
            Target: fileUrl,
            Tooltip: 'Open document',
          }
        }
      }

      // Add hyperlink for duplicate document column (column 1)
      const duplicateWithUrl = getDuplicateWithPdfUrl(row)
      if (duplicateWithUrl) {
        const duplicateWithCellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: 1 })
        const duplicateWithCell = worksheet[duplicateWithCellAddress]
        if (duplicateWithCell) {
          duplicateWithCell.l = {
            Target: duplicateWithUrl,
            Tooltip: 'Open document',
          }
        }
      }

      // Add hyperlink for Document File Path column (column 2)
      const filePathUrl = getFilePdfUrl(row)
      if (filePathUrl) {
        const filePathCellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: 2 })
        const filePathCell = worksheet[filePathCellAddress]
        if (filePathCell) {
          filePathCell.l = {
            Target: filePathUrl,
            Tooltip: 'Open document',
          }
        }
      }

      // Add hyperlink for Matched Document File Path column (column 3)
      const matchedFilePathUrl = getDuplicateWithPdfUrl(row)
      if (matchedFilePathUrl) {
        const matchedFilePathCellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: 3 })
        const matchedFilePathCell = worksheet[matchedFilePathCellAddress]
        if (matchedFilePathCell) {
          matchedFilePathCell.l = {
            Target: matchedFilePathUrl,
            Tooltip: 'Open document',
          }
        }
      }
    })

    worksheet['!cols'] = [
      { wch: 34 },
      { wch: 34 },
      { wch: 40 },
      { wch: 40 },
      { wch: 18 },
      { wch: 14 },
      { wch: 24 },
      { wch: 26 },
      { wch: 18 },
      { wch: 8 },
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Duplicate Data')

    const now = new Date()
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    XLSX.writeFile(workbook, `Duplicate_Table_Data_${stamp}.xlsx`)
  }

  const getAssignedToDisplay = (row: Record<string, unknown>): string => {
    if (!jobId) return 'Unassigned'
    const sourceDocumentId = String(row.source_document_id || '').trim()
    const documentId = String(row.document_id || '').trim()
    if (!sourceDocumentId || !documentId) return 'Unassigned'
    const assignment = getDuplicateAssignmentForRecord(jobId, sourceDocumentId, documentId)
    return assignment?.assignedToUser || 'Unassigned'
  }

  const handleAssignSelection = () => {
    if (user?.role !== 'admin') return
    if (!jobId) {
      setError('No job ID available. Please upload and process documents first.')
      return
    }
    if (!selectedUser.trim()) {
      setError('Select a user to assign selected records.')
      setAssignmentMessage('')
      return
    }
    if (!duplicateData?.rows?.length) {
      setError('No records available for assignment.')
      setAssignmentMessage('')
      return
    }

    const selectedRecords = duplicateData.rows
      .map((row: Record<string, unknown>) => {
        const sourceDocumentId = String(row.source_document_id || '').trim()
        const documentId = String(row.document_id || '').trim()
        if (!sourceDocumentId || !documentId) return null

        const sourceSelectionKey = getRowSelectionKey(row, 'source')
        const duplicateSelectionKey = getRowSelectionKey(row, 'duplicate')
        const isRowSelected =
          selectedFilenames.includes(sourceSelectionKey) ||
          selectedDuplicateDocuments.includes(duplicateSelectionKey)
        if (!isRowSelected) return null
        return { sourceDocumentId, documentId }
      })
      .filter((record): record is { sourceDocumentId: string; documentId: string } => Boolean(record))

    if (!selectedRecords.length) {
      setError('Select at least one record to assign.')
      setAssignmentMessage('')
      return
    }

    const uniqueByPair = new Map<string, { sourceDocumentId: string; documentId: string }>()
    selectedRecords.forEach((record) => {
      const key = `${record.sourceDocumentId}::${record.documentId}`
      if (!uniqueByPair.has(key)) {
        uniqueByPair.set(key, record)
      }
    })

    const assignedCount = assignDuplicateRecordsToUser(
      jobId,
      Array.from(uniqueByPair.values()),
      selectedUser,
      user.username,
    )

    if (!assignedCount) {
      setError('No valid records were assigned.')
      setAssignmentMessage('')
      return
    }

    setError('')
    setAssignmentMessage(`Assigned ${assignedCount} record${assignedCount === 1 ? '' : 's'} to ${selectedUser}.`)
    setSelectedFilenames([])
    setSelectedDuplicateDocuments([])
  }

  const getFilePdfUrl = (row: Record<string, unknown>): string | null => {
    // Use the jobId from the row if it's a stored duplicate, otherwise use current jobId
    const rowJobId = (row._sourceJobId as string) || jobId
    if (!rowJobId) return null

    const filename = getColumnValue(row, DUPLICATE_COLUMNS[0].keys)

    // For filename/source column, prioritize source/original fields first.
    const sourceDirectUrl = getFirstNonEmptyValue(row, SOURCE_URL_KEYS)
    if (sourceDirectUrl && isResolvableWebUrl(sourceDirectUrl) && !isInvalidFileFallbackUrl(sourceDirectUrl)) {
      return toAbsoluteUrl(sourceDirectUrl)
    }

    const documentIdFromRow = getFirstNonEmptyValue(row, SOURCE_DOCUMENT_ID_KEYS)
    const lookupKeys = getFileNameLookupKeys(filename)
    const byJobMap = documentIdByJobAndFileName[rowJobId] || {}
    const documentIdFromName = lookupKeys
      .map((key) => byJobMap[key] || documentIdByFileName[key])
      .find(Boolean)
    const documentId = documentIdFromRow || documentIdFromName

    // Prefer stable backend document endpoint over row URLs.
    if (documentId) {
      return getDocumentFileUrl(rowJobId, documentId)
    }

    const directUrl = getFirstNonEmptyValue(row, GENERIC_DOCUMENT_URL_KEYS)

    if (directUrl && isResolvableWebUrl(directUrl) && !isInvalidFileFallbackUrl(directUrl)) {
      return toAbsoluteUrl(directUrl)
    }

    return null
  }

  const getDuplicateWithPdfUrl = (row: Record<string, unknown>): string | null => {
    // Use the jobId from the row if it's a stored duplicate, otherwise use current jobId
    const rowJobId = (row._sourceJobId as string) || jobId
    if (!rowJobId) return null

    // Strategy 1: Try direct URL fields first (most reliable)
    const directUrl = getFirstNonEmptyValue(row, [
      'duplicate_pdf_url',
      'duplicatePdfUrl',
      'duplicate_document_url',
      'duplicateDocumentUrl',
      'duplicate_url',
      'duplicateUrl',
      'matched_pdf_url',
      'matchedPdfUrl',
      'pdf_url',
      'pdfUrl',
      'document_url',
      'documentUrl',
      'url',
      'link',
      'file_url',
      'fileUrl',
      'download_url',
      'downloadUrl',
      'duplicate_file_url',
      'duplicateFileUrl',
      'duplicate_download_url',
      'duplicateDownloadUrl',
      'word_url',
      'wordUrl',
      'doc_url',
      'docUrl',
      'excel_url',
      'excelUrl',
    ])

    if (directUrl && isResolvableWebUrl(directUrl) && !isInvalidFileFallbackUrl(directUrl)) {
      return toAbsoluteUrl(directUrl)
    }

    // Strategy 2: Try direct document ID field
    const directDocumentId = getFirstNonEmptyValue(row, [
      'duplicate_document_id',
      'duplicateDocumentId',
      'matched_document_id',
      'matchedDocumentId',
      'document_id',
      'documentId',
    ])
    if (directDocumentId) {
      return getDocumentFileUrl(rowJobId, directDocumentId)
    }

    // Strategy 3: Try filename-based matching with multiple fallbacks
    const duplicateFilename = getColumnValue(row, DUPLICATE_COLUMNS[1].keys)
    if (!duplicateFilename || duplicateFilename === '-') return null

    const lookupKeys = getFileNameLookupKeys(duplicateFilename)
    const byJobMap = documentIdByJobAndFileName[rowJobId] || {}
    const directNameMatch = lookupKeys
      .map((key) => byJobMap[key] || documentIdByFileName[key])
      .find(Boolean)
    if (directNameMatch) {
      return getDocumentFileUrl(rowJobId, directNameMatch)
    }

    const normalizedDuplicateFilename = duplicateFilename.trim().toLowerCase()

    // Broad partial match - find first document that contains key parts of this name
    const searchTerms = normalizedDuplicateFilename.split(/[._\-\s]+/).filter(t => t.length > 2)
    const entries = [
      ...Object.entries(byJobMap),
      ...Object.entries(documentIdByFileName),
    ]

    for (const [storedName, docId] of entries) {
      let matches = 0
      for (const term of searchTerms) {
        if (storedName.includes(term)) {
          matches++
        }
      }
      if (matches > 0 && matches === searchTerms.length) {
        return getDocumentFileUrl(rowJobId, docId)
      }
    }

    // Fallback: any partial match with filename content
    for (const [storedName, docId] of entries) {
      if (storedName.includes(normalizedDuplicateFilename) || normalizedDuplicateFilename.includes(storedName)) {
        return getDocumentFileUrl(rowJobId, docId)
      }
    }

    // If still no match found, return null instead of constructing invalid URLs
    return null
  }

  const handleDocumentPreview = useCallback((event: React.MouseEvent<HTMLAnchorElement>, fileUrl: string, fileLabel: string) => {
    if (!isExcelFile(fileLabel) && !isWordFile(fileLabel) && !isPdfFile(fileLabel)) {
      return
    }

    event.preventDefault()
    const previewFileName = getPreviewFileName(fileLabel)
    const previewUrl = `/document-preview?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(previewFileName)}`
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }, [])

  // Extract unique reasons from data
  const uniqueReasons = duplicateData
    ? Array.from(
        new Set(
          duplicateData.rows
            .map((row: Record<string, unknown>) =>
              getColumnValue(row, DUPLICATE_COLUMNS[2].keys)
            )
            .filter(reason => reason !== '-')
        )
      ).sort()
    : []

  // Extract unique stages from data
  const uniqueStages = duplicateData
    ? Array.from(
        new Set(
          duplicateData.rows
            .map((row: Record<string, unknown>) =>
              getColumnValue(row, DUPLICATE_COLUMNS[3].keys)
            )
            .filter(stage => stage !== '-')
        )
      ).sort()
    : []

  const normalizedSearchTerm = normalizeSearchText(searchTerm)
  let filteredRows = duplicateData
    ? duplicateData.rows.filter((row: Record<string, unknown>) => {
        if (user?.role !== 'admin' && jobId && user?.username) {
          const sourceDocumentId = String(row.source_document_id || '').trim()
          const documentId = String(row.document_id || '').trim()
          const assignment = getDuplicateAssignmentForRecord(jobId, sourceDocumentId, documentId)
          const assignedToUser = assignment?.assignedToUser?.trim().toLowerCase()
          const currentUsername = user.username.trim().toLowerCase()
          if (assignedToUser && assignedToUser !== currentUsername) return false
        }

        const rowAsset = cleanMetaValue(getFirstNonEmptyValue(row, ['site', 'Site', 'asset', 'Asset']) || currentJobAsset)
        const rowBatch = cleanMetaValue(getFirstNonEmptyValue(row, ['batch', 'Batch', 'box_id', 'boxId']) || currentJobBatch)
        const rowLibrary = cleanMetaValue(getFirstNonEmptyValue(row, ['library', 'Library']) || currentJobLibrary)

        if (selectedAsset && normalizeSearchText(rowAsset) !== normalizeSearchText(selectedAsset)) return false
        if (selectedBatch && normalizeSearchText(rowBatch) !== normalizeSearchText(selectedBatch)) return false
        if (selectedLibrary && normalizeSearchText(rowLibrary) !== normalizeSearchText(selectedLibrary)) return false

        // Filter by search term
        if (normalizedSearchTerm) {
          const matchesSearch = DUPLICATE_COLUMNS.some((column) => {
            if (column.label === 'Confirm Duplicate') {
              const checked = isConfirmDuplicateChecked(row, column.keys)
              return normalizeSearchText(String(checked)).includes(normalizedSearchTerm)
            }
            const value = getColumnValue(row, column.keys)
            return normalizeSearchText(value).includes(normalizedSearchTerm)
          })
          if (!matchesSearch) return false
        }

        // Filter by selected reasons
        if (selectedReasons.length > 0) {
          const rowReason = getColumnValue(row, DUPLICATE_COLUMNS[2].keys)
          if (!selectedReasons.includes(rowReason)) return false
        }

        // Filter by selected stages
        if (selectedStages.length > 0) {
          const rowStage = getColumnValue(row, DUPLICATE_COLUMNS[3].keys)
          if (!selectedStages.includes(rowStage)) return false
        }

        return true
      })
    : []

  // Pagination logic
  const totalPages = Math.ceil(filteredRows.length / RECORDS_PER_PAGE)
  const startIndex = (currentPage - 1) * RECORDS_PER_PAGE
  const endIndex = startIndex + RECORDS_PER_PAGE
  const paginatedRows = filteredRows.slice(startIndex, endIndex)

  const allRows = duplicateData?.rows ?? []
  const reviewPendingCount = allRows.filter((row) => getRowDecisionState(row) === 'pending').length
  const reviewDoneCount = allRows.filter((row) => getRowDecisionState(row) === 'done').length
  const advancedPendingCount = allRows.filter(
    (row) => getRowDecisionState(row) === 'pending' && !isPostOcrRow(row),
  ).length
  const postOcrPendingCount = allRows.filter(
    (row) => getRowDecisionState(row) === 'pending' && isPostOcrRow(row),
  ).length
  const isFindingPairs =
    isLoading ||
    (!allRows.length &&
      Boolean(
        jobStatus &&
          ['queued', 'processing', 'awaiting_duplicate_review'].includes(jobStatus.status) &&
          !['llm', 'trpryv', 'completed'].includes(jobStatus.stage || ''),
      ))
  const tableColumns =
    user?.role === 'admin'
      ? [...DUPLICATE_COLUMNS.slice(0, 2), ASSIGNED_TO_COLUMN, ...DUPLICATE_COLUMNS.slice(2)]
      : DUPLICATE_COLUMNS

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, fromDate, toDate, selectedReasons, selectedStages, selectedAsset, selectedBatch, selectedLibrary])

  return (
    <Layout
      title="Duplicate Detection"
      activeNavId="duplicates"
      breadcrumbLabel="Duplicates"
      breadcrumbItems={[{ label: 'Duplicate Detection', href: '#duplicates', icon: 'home' }]}
    >
      <style>{`
        .hide-scrollbar {
          scrollbar-width: auto;
        }
        .hide-scrollbar::-webkit-scrollbar {
          width: 0px;
          height: 8px;
        }
        .hide-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .hide-scrollbar::-webkit-scrollbar-thumb {
          background: #999;
          border-radius: 4px;
        }
        .hide-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #666;
        }
      `}</style>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-0">
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <div className="px-4 pb-4 pt-[8px] md:px-4 flex-1 flex flex-col">
            {jobId && (
              <div className="mb-3">
                <DuplicateReviewBanner
                  pendingCount={reviewPendingCount}
                  reviewedCount={reviewDoneCount}
                  advancedPending={advancedPendingCount}
                  postOcrPending={postOcrPendingCount}
                  isFinding={isFindingPairs}
                  hasRows={Boolean(duplicateData?.rows.length)}
                  pipelineTracking={jobStatus?.pipeline_tracking}
                />
              </div>
            )}
            {isLoading || (jobId !== null && duplicateData === null) ? (
              <div className="flex items-center justify-center gap-2 rounded-[8px] border border-[#e5e7eb] bg-white py-14">
                <svg className="h-[16px] w-[16px] text-[#2563eb] animate-spin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" opacity="0.3" />
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                </svg>
                <p className="font-ui text-[12px] font-semibold tracking-[0.01em] text-[#5e738f]">Loading duplicate data...</p>
              </div>
            ) : error ? (
              <div className="rounded-[8px] border border-[#fecaca] bg-[#fff7f7] p-4">
                <p className="font-ui text-[13px] font-medium text-[#b42318]">⚠ {error}</p>
                {error.includes('No job ID') && (
                  <button
                    onClick={() => {
                      window.location.href = user?.role === 'admin' ? '/upload' : '/duplicate'
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-[8px] bg-[#dc2626] px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#b91c1c]"
                  >
                    <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {user?.role === 'admin' ? 'Go to Upload' : 'Refresh Duplicate'}
                  </button>
                )}
              </div>
            ) : duplicateData ? (
              <div className="flex flex-1 flex-col overflow-hidden gap-0">
                <div className="mt-0 mb-2 flex items-start justify-between border-b border-[#e5e7eb] pb-2">
                  <div>
                    <p className="font-ui text-[17px] leading-none font-semibold tracking-[0.01em] text-[#1f2937]">Duplicate Results</p>
                    <p className="mt-1 font-ui text-[10px] text-[#64748b]">
                      Choose Process if the files are duplicates. Choose Stop if they are different.
                    </p>
                  </div>
                  <span className="rounded-full border border-[#d7dce6] bg-[#f1f5f9] px-2.5 py-[2px] font-ui text-[11px] font-medium text-[#1f2937]">
                    {reviewPendingCount} to review · {filteredRows.length} shown
                  </span>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[4px] border border-[#d8dce5] bg-white px-2.5 py-1.5">
                  <label className="font-ui text-[12px] font-semibold text-[#334155]">Site</label>
                  <select
                    value={selectedAsset}
                    onChange={(event) => setSelectedAsset(event.target.value)}
                    className="h-[27px] min-w-[140px] cursor-pointer rounded-[4px] border border-[#cfd5df] bg-white px-2 text-[12px] text-[#1f2937] outline-none focus:border-[#8093db]"
                  >
                    {assetOptions.length === 0 ? (
                      <option value="">All</option>
                    ) : (
                      assetOptions.map((asset) => (
                        <option key={asset} value={asset}>{asset}</option>
                      ))
                    )}
                  </select>

                  <label className="font-ui text-[12px] font-semibold text-[#334155]">Batch</label>
                  <select
                    value={selectedBatch}
                    onChange={(event) => setSelectedBatch(event.target.value)}
                    className="h-[27px] min-w-[140px] cursor-pointer rounded-[4px] border border-[#cfd5df] bg-white px-2 text-[12px] text-[#1f2937] outline-none focus:border-[#8093db]"
                  >
                    {batchOptions.length === 0 ? (
                      <option value="">All</option>
                    ) : (
                      batchOptions.map((batch) => (
                        <option key={batch} value={batch}>{batch}</option>
                      ))
                    )}
                  </select>

                  <label className="font-ui text-[12px] font-semibold text-[#334155]">From</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="h-[27px] w-[126px] rounded-[4px] border border-[#cfd5df] bg-white px-2 text-[12px] text-[#303030] outline-none focus:border-[#8093db]"
                  />

                  <label className="font-ui text-[12px] font-semibold text-[#334155]">To</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="h-[27px] w-[126px] rounded-[4px] border border-[#cfd5df] bg-white px-2 text-[12px] text-[#303030] outline-none focus:border-[#8093db]"
                  />

                  {user?.role === 'admin' && (
                    <>
                      <label className="font-ui text-[12px] font-semibold text-[#334155]">User</label>
                      <select
                        value={selectedUser}
                        onChange={(event) => setSelectedUser(event.target.value)}
                        className="h-[27px] min-w-[140px] cursor-pointer rounded-[4px] border border-[#cfd5df] bg-white px-2 text-[12px] text-[#1f2937] outline-none focus:border-[#8093db]"
                      >
                        {APP_USER_OPTIONS.map((username) => (
                          <option key={username} value={username}>
                            {username}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAssignSelection}
                        className="inline-flex h-[27px] items-center rounded-[4px] bg-[#169DA5] px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#12848b]"
                      >
                        Assign
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleDownloadDuplicates}
                    className="ml-auto inline-flex h-[27px] items-center gap-1 rounded-[4px] bg-[#4f5fbf] px-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#4452a6]"
                  >
                    Export
                    <img src={xlsxIcon} alt="XLSX" className="ml-1 h-[14px] w-[14px]" draggable={false} />
                  </button>
                </div>
                {assignmentMessage && (
                  <p className="mb-2 text-[12px] font-medium text-[#0f766e]">{assignmentMessage}</p>
                )}
                <div className="hide-scrollbar flex-1 overflow-auto rounded-[8px] border border-[#e5e7eb] bg-white">
                  <table className="w-full min-w-[800px] text-[12px]">
                    <thead className="relative z-30">
                      <tr className="sticky top-0 border-b border-[#d1d5db] bg-[#f3f4f6]">
                        {tableColumns.map((column) => (
                          <th
                            key={column.label}
                            title={column.tooltip ?? getDisplayHeader(column.label)}
                            className={`group relative overflow-visible border-b border-[#e8e8e8] px-[8px] py-[7px] text-left text-[11px] font-semibold text-[#69718f] whitespace-nowrap ${['Page Count Source', 'Page Count Duplicate'].includes(column.label) ? 'text-center' : ''} ${['Filename', 'Duplicate Document'].includes(column.label) ? 'w-[230px] min-w-[180px] max-w-[230px]' : ''} ${column.label === 'Reason' ? 'max-w-[200px]' : ''}`}
                          >
                            <div className={`relative inline-flex items-center gap-2 cursor-pointer`}>
                              <span>{getDisplayHeader(column.label)}</span>
                              
                              {/* Filter button for Reason column */}
                              {column.label === 'Reason' && (
                                <div ref={reasonFilterMenuRef} className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setShowReasonFilterMenu(!showReasonFilterMenu)}
                                    className="p-1 hover:bg-[#e5e7eb] rounded transition-colors"
                                    title="Filter by reason"
                                  >
                                    <svg className="h-[14px] w-[14px] text-[#374151]" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
                                    </svg>
                                  </button>
                                  
                                  {showReasonFilterMenu && (
                                    <div className="hide-scrollbar absolute top-full mt-1 right-0 z-[70] bg-white border border-[#e5e7eb] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.15)] min-w-[250px] max-h-[300px] overflow-y-auto">
                                      <div className="p-3">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedReasons([])}
                                          className="w-full text-left px-2 py-1 text-[12px] font-medium text-[#2563eb] hover:bg-[#f3f4f6] rounded transition-colors mb-2"
                                        >
                                          Clear All
                                        </button>
                                        <div className="border-t border-[#e5e7eb] pt-2 space-y-1">
                                          {uniqueReasons.map((reason) => (
                                            <label
                                              key={reason}
                                              className="flex items-center gap-2 px-2 py-1 hover:bg-[#f3f4f6] rounded cursor-pointer transition-colors"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={selectedReasons.includes(reason)}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setSelectedReasons([...selectedReasons, reason])
                                                  } else {
                                                    setSelectedReasons(selectedReasons.filter(r => r !== reason))
                                                  }
                                                }}
                                                className="h-3 w-3 rounded border-[#d1d5db] accent-[#2563eb]"
                                              />
                                              <span className="text-[12px] text-[#1f2937]">{reason}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Filter button for Stage column */}
                              {column.label === 'Stage' && (
                                <div ref={stageFilterMenuRef} className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setShowStageFilterMenu(!showStageFilterMenu)}
                                    className="p-1 hover:bg-[#e5e7eb] rounded transition-colors"
                                    title="Filter by stage"
                                  >
                                    <svg className="h-[14px] w-[14px] text-[#374151]" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
                                    </svg>
                                  </button>
                                  
                                  {showStageFilterMenu && (
                                    <div className="hide-scrollbar absolute top-full mt-1 right-0 z-[70] bg-white border border-[#e5e7eb] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.15)] min-w-[250px] max-h-[300px] overflow-y-auto">
                                      <div className="p-3">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedStages([])}
                                          className="w-full text-left px-2 py-1 text-[12px] font-medium text-[#2563eb] hover:bg-[#f3f4f6] rounded transition-colors mb-2"
                                        >
                                          Clear All
                                        </button>
                                        <div className="border-t border-[#e5e7eb] pt-2 space-y-1">
                                          {uniqueStages.map((stage) => (
                                            <label
                                              key={stage}
                                              className="flex items-center gap-2 px-2 py-1 hover:bg-[#f3f4f6] rounded cursor-pointer transition-colors"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={selectedStages.includes(stage)}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setSelectedStages([...selectedStages, stage])
                                                  } else {
                                                    setSelectedStages(selectedStages.filter(s => s !== stage))
                                                  }
                                                }}
                                                className="h-3 w-3 rounded border-[#d1d5db] accent-[#2563eb]"
                                              />
                                              <span className="text-[12px] text-[#1f2937]">{stage}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row: any, idx: number) => {
                        const globalIdx = startIndex + idx
                        return (
                        <tr key={idx} className="border-b border-[#e5e7eb] odd:bg-white even:bg-[#f9fafb] transition-colors hover:bg-[#f3f4f6]">
                          {tableColumns.map((column) => (
                            <td
                              key={column.label}
                              title={column.label === 'Reason' ? (getReasonTooltip(getColumnValue(row as Record<string, unknown>, column.keys)) ?? undefined) : undefined}
                              className={`border-b border-[#eeeeee] px-[8px] py-[6px] text-[11px] ${['Page Count Source', 'Page Count Duplicate'].includes(column.label) ? 'text-center' : ''} ${['Filename', 'Duplicate Document'].includes(column.label) ? 'w-[230px] min-w-[180px] max-w-[230px]' : ''} ${column.label === 'Reason' ? 'max-w-[200px] overflow-visible' : ''}`}
                            >
                              {column.label === 'Assigned To' ? (
                                <span
                                  className={`inline-flex rounded-[6px] px-2 py-[4px] text-[10px] font-semibold ${
                                    getAssignedToDisplay(row as Record<string, unknown>) === 'Unassigned'
                                      ? 'bg-[#f3f4f6] text-[#64748b]'
                                      : 'bg-[#e0f2fe] text-[#075985]'
                                  }`}
                                >
                                  {getAssignedToDisplay(row as Record<string, unknown>)}
                                </span>
                              ) : column.label === 'Confirm Duplicate' ? (
                                (() => {
                                  const decisionState = getRowDecisionState(row as Record<string, unknown>)
                                  const isRequestInFlight = processingRows.has(globalIdx)
                                  const rowStatus = String(row.row_status || '').toUpperCase()
                                  const rowResolved = rowStatus === 'DONE' || decisionState === 'done'
                                  const isBusy =
                                    !rowResolved && (
                                      isRequestInFlight ||
                                      decisionState === 'processing' ||
                                      rowStatus === 'PROCESSING'
                                    )
                                  const isDone = rowResolved
                                  return (
                                <div className="flex items-center justify-center gap-1">
                                  {isDone ? (
                                    <span className="rounded-[6px] bg-[#dcfce7] px-3 py-[6px] text-[11px] font-semibold text-[#166534]">
                                      Done
                                    </span>
                                  ) : (
                                    <>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleProcessSelection(row as Record<string, unknown>, globalIdx)}
                                      disabled={
                                        !row.source_document_id ||
                                        (!selectedFilenames.includes(getRowSelectionKey(row as Record<string, unknown>, 'source')) &&
                                          !selectedDuplicateDocuments.includes(getRowSelectionKey(row as Record<string, unknown>, 'duplicate'))) ||
                                        isBusy ||
                                        rowResolved
                                      }
                                      className="inline-flex items-center gap-1 rounded-[6px] bg-[#0f766e] px-3 py-[6px] text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-colors hover:bg-[#0f5f59] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {!isBusy && (
                                        <svg className="h-[12px] w-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                          <polygon points="5 3 19 12 5 21 5 3" />
                                        </svg>
                                      )}
                                      {isBusy
                                        ? getActionBusyLabel(row as Record<string, unknown>)
                                        : 'Process'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleStopRow(row as Record<string, unknown>, globalIdx)}
                                      disabled={!row.source_document_id || !row.document_id || isBusy || rowResolved}
                                      className="rounded-[6px] border border-[#dc2626] bg-white px-3 py-[6px] text-[11px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Duplicate
                                    </button>
                                  </div>
                                    </>
                                  )}
                                </div>
                                  )
                                })()
                              ) : column.label === 'Reason' ? (
                                (() => {
                                  const reasonValue = getColumnValue(row as Record<string, unknown>, column.keys)
                                  const tooltip = getReasonTooltip(reasonValue)
                                  const displayReason = formatDisplayValue(reasonValue)

                                  if (!tooltip || reasonValue === '-') {
                                    return <span className="block w-full truncate">{displayReason}</span>
                                  }

                                  return <span className="block w-full truncate" title={tooltip}>{displayReason}</span>
                                })()
                              ) : column.label === 'Duplicate Document' ? (
                                (() => {
                                  const duplicateWithValue = getColumnValue(row as Record<string, unknown>, column.keys)
                                  const duplicateWithUrl = getDuplicateWithPdfUrl(row as Record<string, unknown>)
                                  const duplicateSelectionKey = getRowSelectionKey(row as Record<string, unknown>, 'duplicate')
                                  const isChecked = selectedDuplicateDocuments.includes(duplicateSelectionKey)
                                  const isRowResolved = getRowDecisionState(row as Record<string, unknown>) === 'done'
                                  const isRowProcessing = processingRows.has(globalIdx) || String(row.row_status || '').toUpperCase() === 'PROCESSING'

                                  if (!duplicateWithUrl || duplicateWithValue === '-') {
                                    return (
                                      <div className="flex min-w-0 items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          disabled={isRowResolved || isRowProcessing}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSelectedDuplicateDocuments([...selectedDuplicateDocuments, duplicateSelectionKey])
                                            } else {
                                              setSelectedDuplicateDocuments(selectedDuplicateDocuments.filter((selectionKey) => selectionKey !== duplicateSelectionKey))
                                            }
                                          }}
                                          aria-label="Select duplicate document"
                                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#95a9c3] accent-[#0f766e]"
                                        />
                                        <span className="block min-w-0 flex-1 whitespace-normal break-all leading-4 text-[10px]" title={formatDisplayValue(duplicateWithValue)}>
                                          {formatDisplayValue(duplicateWithValue)}
                                        </span>
                                      </div>
                                    )
                                  }

                                  return (
                                    <div className="flex min-w-0 items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={isRowResolved || isRowProcessing}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedDuplicateDocuments([...selectedDuplicateDocuments, duplicateSelectionKey])
                                          } else {
                                            setSelectedDuplicateDocuments(selectedDuplicateDocuments.filter((selectionKey) => selectionKey !== duplicateSelectionKey))
                                          }
                                        }}
                                        aria-label="Select duplicate document"
                                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#95a9c3] accent-[#0f766e]"
                                      />
                                      <a
                                        href={duplicateWithUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(event) => void handleDocumentPreview(event, duplicateWithUrl, duplicateWithValue)}
                                        className="block min-w-0 flex-1 whitespace-normal break-all leading-4 text-[10px] font-semibold text-[#0052cc] transition hover:text-[#003a99]"
                                        title={formatDisplayValue(duplicateWithValue)}
                                      >
                                        {formatDisplayValue(duplicateWithValue)}
                                      </a>
                                    </div>
                                  )
                                })()
                              ) : column.label === 'Filename' ? (
                                (() => {
                                  const fileValue = getColumnValue(row as Record<string, unknown>, column.keys)
                                  const fileUrl = getFilePdfUrl(row as Record<string, unknown>)
                                  const sourceSelectionKey = getRowSelectionKey(row as Record<string, unknown>, 'source')
                                  const isChecked = selectedFilenames.includes(sourceSelectionKey)
                                  const isRowResolved = getRowDecisionState(row as Record<string, unknown>) === 'done'
                                  const isRowProcessing = processingRows.has(globalIdx) || String(row.row_status || '').toUpperCase() === 'PROCESSING'

                                  if (!fileUrl || fileValue === '-') {
                                    return (
                                      <div className="flex min-w-0 items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          disabled={isRowResolved || isRowProcessing}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSelectedFilenames([...selectedFilenames, sourceSelectionKey])
                                            } else {
                                              setSelectedFilenames(selectedFilenames.filter((selectionKey) => selectionKey !== sourceSelectionKey))
                                            }
                                          }}
                                          aria-label="Select file name"
                                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#95a9c3] accent-[#0f766e]"
                                        />
                                        <span className="block min-w-0 flex-1 whitespace-normal break-all leading-4 text-[10px]" title={formatDisplayValue(fileValue)}>
                                          {formatDisplayValue(fileValue)}
                                        </span>
                                      </div>
                                    )
                                  }

                                  return (
                                    <div className="flex min-w-0 items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={isRowResolved || isRowProcessing}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedFilenames([...selectedFilenames, sourceSelectionKey])
                                          } else {
                                            setSelectedFilenames(selectedFilenames.filter((selectionKey) => selectionKey !== sourceSelectionKey))
                                          }
                                        }}
                                        aria-label="Select file name"
                                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#95a9c3] accent-[#0f766e]"
                                      />
                                      <a
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(event) => void handleDocumentPreview(event, fileUrl, fileValue)}
                                        className="block min-w-0 flex-1 whitespace-normal break-all leading-4 text-[10px] font-semibold text-[#0052cc] transition hover:text-[#003a99]"
                                        title={formatDisplayValue(fileValue)}
                                      >
                                        {formatDisplayValue(fileValue)}
                                      </a>
                                    </div>
                                  )
                                })()
                              ) : (
                                (() => {
                                  const rawValue = getColumnValue(row as Record<string, unknown>, column.keys)
                                  if (column.label === 'Page Mapping') {
                                    const normalizedRawValue = rawValue.trim().toLowerCase()
                                    const pageMappingTooltip = normalizedRawValue === 'token_overlap' ? 'Content Matching' : undefined
                                    return <span title={pageMappingTooltip}>{formatPageMapping(rawValue)}</span>
                                  }
                                  const displayValue = formatDisplayValue(rawValue)
                                  const tooltip = getDisplayValueTooltip(displayValue)
                                  
                                  if (!tooltip) {
                                    return <span className="block w-full truncate">{displayValue}</span>
                                  }
                                  
                                  return <span className="block w-full truncate" title={tooltip}>{displayValue}</span>
                                })()
                              )}
                            </td>
                          ))}
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between px-0">
                  <p className="font-ui text-[12px] font-normal text-[#6b7280]">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredRows.length)} of {filteredRows.length} rows
                  </p>
                  <div className="flex items-center gap-1 rounded-[6px] border border-[#d1d5db] bg-white p-1">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="inline-flex items-center gap-1 rounded-[4px] border border-[#d1d5db] px-2 py-1 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:text-[#d1d5db]"
                    >
                      <svg className="h-[12px] w-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`rounded-[4px] px-2 py-1 text-[12px] font-medium transition-colors ${
                          page === currentPage
                            ? 'bg-[#2563eb] text-white'
                            : 'border border-[#d1d5db] text-[#374151] hover:bg-[#f3f4f6]'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="inline-flex items-center gap-1 rounded-[4px] border border-[#d1d5db] px-2 py-1 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:text-[#d1d5db]"
                    >
                      Next
                      <svg className="h-[12px] w-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[12px] border border-[#bfdbfe] bg-[#eff6ff] p-5 shadow-[inset_0_1px_0_#ffffff]">
                <p className="font-ui text-[13px] text-[#1e40af]">
                  No data available. Please process documents to see duplicate detection results.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
