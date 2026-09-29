import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { createPortal } from 'react-dom'
import xlsxIcon from '../assets/xlsx-icon.svg'
import Layout from '../components/Layout'
import {
  getClassification,
  getDocumentFileUrl,
  getDocuments,
  getJobStatus,
  archiveDocuments,
  updateClassification,
  type ClassificationUpdate,
  type TopMatch,
} from '../api/client'
import { useJob } from '../context/JobContext'
import { useUser } from '../context/UserContext'
import {
  formatMetadataValue,
} from '../utils/documentMetadata'
import { isProjectLibrary, subFoldersFor, ARCHIVE_FOLDERS, DATA_TYPE_VALUES, DISCIPLINE_VALUES, BUSINESS_FUNCTION_VALUES, CONTENT_TYPE_VALUES } from '../utils/classificationOptions'
import { canUserAccessDocument } from '../utils/duplicateAssignments'
import {
  clearDocumentPageCache,
  consumeDocumentListStale,
  getDocumentPageCache,
  hasDocumentPageCache,
  isDocumentListStale,
  peekPrefetchedDocuments,
  setDocumentPageCache,
  takePrefetchedDocuments,
} from '../utils/documentPageCache'

type DocDetails = {
  jobId: string
  reportId: string
  fileName: string
  category: string
  fileType: string
  bcsSubCode: string
  confidenceScore: string
  folder: string
  subFolder: string
  date: string
  retentionPeriod: string
  creationYear: string
  reviewYear: string
  documentRet: string
  countryAddress: string
  path: string
  score: string
  asset: string
  discipline: string
  dataType: string
  businessFunction: string
  contentType: string
  confidentiality: string
  authorCompany: string
  trigger: string
  version: string
  cyientRemarks: string
  library: string
  boxId: string
  creationDate: string
  pipelineStage: string
  pipelineStatus: string
}

type DocRow = {
  id: number
  details: DocDetails
  jsonData?: unknown
}

type Viewer = {
  username: string
  role: 'admin' | 'user'
} | null

function filterRowsForViewer(rows: DocRow[], viewer: Viewer): DocRow[] {
  if (!viewer || viewer.role === 'admin') return rows

  return rows.filter((row) => {
    const targetJobId = String(row.details.jobId || '').trim()
    const documentId = String(row.details.reportId || '').trim()
    if (!targetJobId || !documentId || documentId === 'N/A') return true
    return canUserAccessDocument(targetJobId, documentId, viewer.username, viewer.role)
  })
}

function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className={`relative flex size-[16px] shrink-0 items-center justify-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none flex size-[16px] items-center justify-center rounded-[2px] border bg-white ${
          checked ? 'border-[#5a62b5]' : 'border-[#a9a9a9]'
        }`}
      >
        {checked && (
          <svg className="h-[9px] w-[10px]" viewBox="0 0 448 512" fill="#5a62b5" aria-hidden="true">
            <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z" />
          </svg>
        )}
      </span>
    </label>
  )
}

function isProcessedDocument(doc: DocRow): boolean {
  return Boolean(
    typeof doc.jsonData === 'object' &&
      doc.jsonData &&
      'pipeline_stage' in doc.jsonData &&
      String(doc.jsonData.pipeline_stage).toLowerCase() === 'archived',
  )
}

function documentPipelineStatus(doc: Record<string, unknown>): string {
  const stage = String(doc.pipeline_stage || '').toLowerCase()
  const assetStatus = String(doc.asset_classification_status || '').toUpperCase()
  const llmStatus = String(doc.llm_status || '').toUpperCase()
  const trpryvStatus = String(doc.trpryv_status || '').toUpperCase()
  const postOcrStatus = String(doc.post_ocr_status || '').toUpperCase()
  const postOcrRelease = String(doc.post_ocr_release_status || '').toUpperCase()
  const docintStatus = String(doc.docint_status || '').toUpperCase()
  const advancedRelease = String(doc.advanced_release_status || '').toUpperCase()
  const awaitingReview = Boolean(doc.awaiting_duplicate_review)

  if (trpryvStatus === 'COMPLETED' || stage === 'completed' || stage === 'archived') return 'Pipeline completed'
  if (llmStatus === 'PROCESSING' || stage === 'llm') return 'AI classification processing'
  if (llmStatus === 'COMPLETED') return 'AI classification finished'
  if (assetStatus === 'PROCESSING' || stage === 'asset_classification') return 'Asset classification processing'
  if (assetStatus === 'COMPLETED') return 'Asset classification completed'
  // Post-OCR duplicate pair: visible here until Process/Stop on Duplicate Detection.
  // Registry stores release-pending as "PENDING" (not "RELEASE_PENDING").
  if (
    awaitingReview ||
    ((postOcrRelease === 'PENDING' || postOcrRelease === 'RELEASE_PENDING') &&
      (postOcrStatus === 'UNIQUE' || postOcrStatus === 'DUPLICATE')) ||
    postOcrStatus === 'DUPLICATE'
  ) {
    return 'Waiting for duplicate review'
  }
  if (postOcrStatus === 'UNIQUE' || postOcrStatus === 'BYPASSED') return 'Ready for classification'
  if (postOcrStatus === 'PROCESSING' || stage === 'post_ocr') return 'Post-OCR processing'
  if (docintStatus === 'PROCESSING' || stage === 'docint') return 'OCR processing'
  if (docintStatus === 'COMPLETED' && !postOcrStatus) return 'OCR complete — waiting for Post-OCR'
  if (docintStatus === 'PENDING' || (advancedRelease === 'RELEASED' && !docintStatus)) return 'Queued for OCR'
  if (advancedRelease === 'RELEASED') return 'Processing'
  return 'Processing'
}

function documentPipelineProgress(status: string): number {
  if (status === 'Pipeline completed' || status === 'AI classification finished') return 100
  if (status === 'AI classification processing') return 82
  if (status === 'Asset classification completed') return 62
  if (status === 'Asset classification processing') return 52
  if (status === 'Ready for classification') return 38
  if (status === 'Waiting for duplicate review') return 32
  if (status === 'Post-OCR processing') return 28
  if (status === 'OCR complete — waiting for Post-OCR') return 24
  if (status === 'OCR processing') return 18
  if (status === 'Queued for OCR') return 12
  return 16
}

function mapApiDocumentsToRows(
  docs: Array<Record<string, any>>,
  jobId: string,
  uploadLibrary = 'Archive',
): DocRow[] {
  return docs.map((doc, index) => {
    const rawScore = typeof doc.score === 'number' ? doc.score : Number(doc.score ?? 0)
    const scorePercent = Number.isFinite(rawScore) ? Math.round(rawScore * 100) : 0
    const normalizedDate = toIsoDate(doc.date)
    const parsedStructure = parseFolderStructure(
      doc.folder_structure || doc.classification?.folder_structure || doc.metadata?.folder_structure,
    )
    const resolvedFolder =
      cleanText(doc.folder) ||
      cleanText(doc.folder_name) ||
      cleanText(doc.classification?.folder) ||
      cleanText(doc.metadata?.folder) ||
      cleanText(doc.extracted_metadata?.folder) ||
      parsedStructure.folder
    const resolvedSubFolder =
      cleanText(doc.sub_folder) ||
      cleanText(doc.subfolder) ||
      cleanText(doc.sub_folder_name) ||
      cleanText(doc.classification?.sub_folder) ||
      cleanText(doc.metadata?.sub_folder) ||
      cleanText(doc.metadata?.subfolder) ||
      cleanText(doc.extracted_metadata?.sub_folder) ||
      parsedStructure.subFolder
    const normalizedBcsCode = normalizeBcsCode(
      doc.rds_code ||
        doc.bcs_sub_code ||
        doc.bcs_code ||
        doc.record_code ||
        doc.selected_rds_code ||
        doc.retention?.rds_code ||
        doc.top_matches?.[0]?.record_code,
    )
    const sourceJobId = String(doc.sourceJobId || jobId || '')
    const resolvedLibrary = cleanText(doc.library) || uploadLibrary || 'Archive'
    const creationDate =
      toIsoDate(doc.retention?.created_date) || normalizedDate || formatMetadataValue(doc.date)

    return {
      id: index + 1,
      details: {
        jobId: sourceJobId,
        reportId: formatMetadataValue(doc.document_id),
        fileName: formatMetadataValue(doc.file_name),
        category: formatMetadataValue(doc.category || doc.subject),
        fileType: formatMetadataValue(doc.file_type),
        bcsSubCode: normalizedBcsCode || 'N/A',
        confidenceScore: `${scorePercent}%`,
        folder: resolvedFolder || 'N/A',
        subFolder: resolvedSubFolder || 'N/A',
        date: creationDate || 'N/A',
        creationDate: creationDate || 'N/A',
        retentionPeriod: formatMetadataValue(doc.retention_period || doc.retention?.retention_period),
        creationYear: formatMetadataValue(doc.creation_year),
        reviewYear: formatMetadataValue(doc.review_year || doc.retention?.review_year),
        documentRet: resolvedLibrary,
        countryAddress: formatMetadataValue(doc.country_address),
        path: doc.path || '',
        score: `${scorePercent}%`,
        asset: formatMetadataValue(doc.asset),
        dataType: formatMetadataValue(doc.data_type),
        discipline: formatMetadataValue(doc.discipline),
        businessFunction: formatMetadataValue(doc.business_function),
        contentType: formatMetadataValue(doc.content_type),
        confidentiality: formatMetadataValue(doc.confidentiality || doc.confidential),
        authorCompany: formatMetadataValue(doc.author_company),
        trigger: formatMetadataValue(doc.retention_trigger || doc.trigger || doc.retention?.trigger),
        version: formatMetadataValue(doc.retention?.version || doc.version),
        cyientRemarks: formatMetadataValue(doc.cyient_remarks || doc.error),
        library: resolvedLibrary,
        boxId: formatMetadataValue(doc.box_id || doc.batch),
        pipelineStage: formatMetadataValue(doc.pipeline_stage),
        pipelineStatus: documentPipelineStatus(doc),
      },
      jsonData: doc,
    }
  })
}

function documentsSignature(rows: DocRow[]): string {
  return rows
    .map(
      (row) =>
        `${row.details.reportId}|${row.details.pipelineStatus}|${row.details.fileName}|${row.details.confidenceScore}`,
    )
    .join(';')
}

const getPreviewFileName = (value: string): string => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed || trimmed === 'N/A') return 'Document Preview'
  const slashNormalized = trimmed.replace(/\\/g, '/')
  const baseName = slashNormalized.split('/').pop() || trimmed
  return baseName.trim() || 'Document Preview'
}

const BCS_CODES = [
  'AO 05.01', 'AO 05.02', 'AO 05.03', 'AO 05.04', 'AO 10.01', 'AO 15.01', 'AO 20.01', 'AO 20.02', 'AO 20.03', 'AO 20.04',
  'AO 25.01', 'AO 30.01', 'AO 40.01', 'AO 43.01', 'AO 45.01', 'AO 50.01', 'AO 50.02', 'AO 50.03', 'AO 50.04', 'AO 55.01',
  'DE 05.01', 'DE 10.01', 'DE 15.01', 'DE 20.01', 'DE 25.01', 'DE 30.01', 'DE 40.01', 'DE 35.01', 'DE 50.01', 'DE 45.01',
  'DE 55.01', 'DE 60.01', 'DE 60.02', 'DE 60.03', 'DE 65.01', 'DE 70.01', 'DE 75.01', 'DE 80.01',
  'FA 05.01', 'FA 10.01', 'FA 15.01', 'FA 15.02', 'FA 20.01', 'FA 25.01', 'FA 30.01', 'FA 35.01', 'FA 35.02', 'FA 40.01',
  'FA 45.01', 'FA 50.01', 'FA 55.01', 'FA 60.01', 'FA 65.01', 'FA 70.01',
  'LA 02.01', 'LA 08.01', 'LA 08.02', 'LA 10.01', 'LA 12.01', 'LA 18.01', 'LA 18.02', 'LA 20.01', 'LA 21.01', 'LA 21.02',
  'LA 22.01', 'LA 28.01', 'LA 30.01', 'LA 32.01', 'LA 38.01', 'LA 38.02', 'LA 40.01', 'LA 42.01', 'LA 42.02', 'LA 48.01',
  'LA 50.01', 'LA 52.01', 'LA 58.01', 'LA 60.01', 'LA 62.01', 'LA 68.01', 'LA 70.01', 'LA 78.01', 'LA 72.01', 'LA 75.01', 'LA 85.01',
  'JA 05.01', 'JA 10.01', 'JA 10.02', 'JA 15.01', 'JA 20.01', 'JA 20.02', 'JA 25.01', 'JA 30.01', 'JA 30.02', 'JA 35.01',
  'JA 35.02', 'JA 35.03', 'JA 35.04', 'JA 40.01', 'JA 45.01', 'JA 45.02', 'JA 45.03', 'JA 50.01', 'JA 55.01', 'JA 60.01',
  'JA 65.01', 'JA 65.02', 'JA 65.03', 'JA 65.04', 'JA 65.05', 'JA 65.06', 'JA 70.01', 'JA 70.02', 'JA 75.01', 'JA 80.01', 'JA 85.01',
  'ME 05.01', 'ME 10.01', 'ME 15.01', 'ME 15.02', 'ME 15.03', 'ME 20.01', 'ME 25.01', 'ME 30.01', 'ME 35.01', 'ME 40.01',
  'ME 45.01', 'ME 50.01', 'ME 55.01', 'ME 65.01', 'ME 70.01',
  'OT 05.01', 'OT 15.01', 'OT 15.02', 'OT 20.01', 'OT 25.01', 'OT 30.01', 'OT 30.02', 'OT 35.01', 'OT 40.01', 'OT 10.01',
  'OT 10.02', 'OT 10.03', 'OT 10.04', 'OT 45.01', 'OT 50.01',
  'PL 01.01', 'PL 05.01', 'PL 10.01', 'PL 15.01', 'PL 20.01', 'PL 25.01', 'PL 30.01', 'PL 35.01', 'PL 40.01', 'PL 45.01',
  'PL 45.02', 'PL 85.01', 'PL 90.01', 'PL 95.01',
  'QE 05.01', 'QE 10.01', 'QE 20.01', 'QE 23.01', 'QE 30.01', 'QE 62.01', 'QE 35.01', 'QE 40.01', 'QE 65.01', 'QE 65.02',
  'QE 65.03', 'QE 45.01', 'QE 50.01', 'QE 55.01', 'QE 60.01', 'QE 85.01', 'QE 90.01', 'QE 25.01', 'QE 25.02', 'QE 15.01',
  'RH 05.01', 'RH 10.01', 'RH 15.01', 'RH 20.01', 'RH 30.01', 'RH 35.01', 'RH 25.01', 'RH 40.01', 'RH 45.01', 'RH 50.01', 'RH 55.01',
  'SJ 05.01', 'SJ 10.01', 'SJ 15.01', 'SJ 15.02', 'SJ 15.03', 'SJ 20.01', 'SJ 25.01', 'SJ 30.01', 'SJ 35.01', 'SJ 40.01',
  'TK 05.01', 'TK 10.01', 'TK 10.02', 'TK 10.03', 'TK 10.04', 'TK 20.01', 'TK 20.02', 'TK 25.01', 'TK 30.01', 'TK 35.01',
  'TK 40.01', 'TK 40.02', 'TK 45.01', 'TK 50.01', 'TK 55.01', 'TK 60.01', 'TK 70.01', 'TK 70.02', 'TK 70.03', 'TK 75.01', 'TK 80.01', 'TK 90.01',
  'VG 15.01', 'VG 15.02', 'VG 05.01', 'VG 10.01', 'VG 25.01', 'VG 20.01', 'VG 30.01', 'VG 35.01', 'VG 35.02', 'VG 40.01', 'VG 45.01', 'VG 50.01',
  'UB 05.01', 'UB 10.01', 'UB 15.01', 'UB 20.01', 'UB 25.01', 'UB 30.01', 'UB 35.01', 'UB 40.01', 'UB 45.01',
]

const BLANK_ASSET_OPTION = '(Blank)'

function toIsoDate(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return ''
  const normalized = value.trim().toUpperCase().replace(/\./g, '_')
  if (normalized === 'N_D') return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const yyyy = parsed.getFullYear()
  const mm = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const dd = `${parsed.getDate()}`.padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function normalizeBcsCode(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  return trimmed
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function parseFolderStructure(value: unknown): { folder: string; subFolder: string } {
  const structure = cleanText(value)
  if (!structure) return { folder: '', subFolder: '' }

  const parts = structure
    .split(/[\\/>|]/)
    .map((part) => part.trim())
    .filter(Boolean)

  return {
    folder: parts[0] || '',
    subFolder: parts[1] || '',
  }
}

function formatConfidencePercent(score: number): string {
  return `${Math.round(score * 100)}%`
}

function normalizeBcsCodeForMatch(value: unknown): string {
  return normalizeBcsCode(value).replace(/\s/g, '')
}

function findLlmMatchConfidence(jsonData: unknown, code: string): number | null {
  if (!jsonData || typeof jsonData !== 'object') return null
  const matches = (jsonData as { top_matches?: Array<{ record_code?: string; confidence?: number }> }).top_matches
  if (!Array.isArray(matches)) return null
  const normalized = normalizeBcsCodeForMatch(code)
  const match = matches.find(
    (entry) => entry && normalizeBcsCodeForMatch(entry.record_code) === normalized,
  )
  if (!match) return null
  const raw = typeof match.confidence === 'number' ? match.confidence : Number(match.confidence ?? 0)
  return Number.isFinite(raw) ? raw : 0
}

function InlineTextCell({
  value,
  onSave,
  type = 'text',
  cellClassName = 'max-w-0 border-b border-[#eeeeee] px-[8px] py-[6px]',
  disabled = false,
}: {
  value: string
  onSave: (value: string) => void
  type?: 'text' | 'date'
  cellClassName?: string
  disabled?: boolean
}) {
  const displayValue = value && value !== 'N/A' ? value : ''
  const [localValue, setLocalValue] = useState(displayValue)

  useEffect(() => {
    setLocalValue(displayValue)
  }, [displayValue])

  return (
    <td className={cellClassName}>
      <input
        type={type}
        value={localValue}
        disabled={disabled}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => {
          if (localValue !== displayValue) {
            onSave(localValue)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        className={`w-full min-w-0 rounded-[3px] border px-[6px] py-[4px] text-[11px] outline-none ${
          disabled
            ? 'border-[#d0d0d0] bg-[#f5f5f5] text-[#999999] cursor-not-allowed'
            : 'border-[#d9d9d9] bg-white text-[#303030] hover:border-[#8093db] focus:border-[#8093db]'
        }`}
        title={localValue || 'N/A'}
      />
    </td>
  )
}

function InlineSelectCell({
  value,
  onSave,
  options,
  cellClassName = 'max-w-0 border-b border-[#eeeeee] px-[8px] py-[6px]',
  disabled = false,
}: {
  value: string
  onSave: (value: string) => void
  options: readonly string[]
  cellClassName?: string
  disabled?: boolean
}) {
  const displayValue = value && value !== 'N/A' ? value : ''

  return (
    <td className={cellClassName}>
      <select
        value={displayValue}
        onChange={(event) => onSave(event.target.value)}
        disabled={disabled}
        className={`w-full min-w-0 rounded-[3px] border px-[6px] py-[4px] text-[11px] outline-none ${
          disabled
            ? 'border-[#d0d0d0] bg-[#f5f5f5] text-[#999999] cursor-not-allowed'
            : 'border-[#d9d9d9] bg-white text-[#303030] hover:border-[#8093db] focus:border-[#8093db]'
        }`}
        title={displayValue || 'N/A'}
      >
        <option value="">N/A</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </td>
  )
}

function TruncatedText({
  value,
  className = '',
}: {
  value: string
  className?: string
}) {
  const display = value && value.trim() ? value : 'N/A'

  return (
    <span
      className={`block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${className}`}
      title={display}
    >
      {display}
    </span>
  )
}

function TruncatedCell({
  value,
  className = '',
}: {
  value: string
  className?: string
}) {
  return (
    <td className="max-w-0 border-b border-[#eeeeee] px-[8px] py-[6px]">
      <TruncatedText value={value} className={className} />
    </td>
  )
}

function FolderDropdown({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(searchText.toLowerCase()),
  )

  const updateMenuPosition = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setMenuPosition({
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return

    updateMenuPosition()

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      if (menuRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
      setSearchText('')
    }

    const handleWindowChange = () => {
      updateMenuPosition()
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    window.addEventListener('resize', handleWindowChange)
    window.addEventListener('scroll', handleWindowChange, true)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      window.removeEventListener('resize', handleWindowChange)
      window.removeEventListener('scroll', handleWindowChange, true)
    }
  }, [isOpen, updateMenuPosition])

  const handleSelect = (opt: string) => {
    onChange(opt)
    setIsOpen(false)
    setSearchText('')
  }

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          setSearchText('')
        }}
        className="flex w-full min-w-0 items-center justify-between gap-1 rounded-[3px] border border-[#d9d9d9] bg-white px-[6px] py-[4px] text-left text-[12px] text-[#303030] outline-none hover:border-[#8093db] focus:border-[#8093db]"
        title={value || 'Select Folder'}
      >
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {value || 'Select Folder'}
        </span>
        <svg
          className={`h-[14px] w-[14px] flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="z-[200] rounded-[3px] border border-[#d9d9d9] bg-white shadow-lg"
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
          }}
        >
          <input
            autoFocus
            type="text"
            placeholder="Search folders..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full rounded-t-[3px] border-b border-[#d9d9d9] px-[8px] py-[6px] text-[12px] text-[#303030] outline-none focus:border-[#8093db]"
          />
          <div className="max-h-[200px] overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-[8px] py-[8px] text-center text-[12px] text-[#999]">No folders found</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className="w-full px-[8px] py-[6px] text-left text-[12px] text-[#303030] hover:bg-[#f0f4f8]"
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function getTopMatchesFromJson(jsonData: unknown): TopMatch[] {
  if (!jsonData || typeof jsonData !== 'object') return []
  const matches = (jsonData as { top_matches?: TopMatch[] }).top_matches
  return Array.isArray(matches) ? matches.filter(Boolean).slice(0, 3) : []
}

function BcsCodeDropdown({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const normalizedValue = normalizeBcsCode(value)
  const displayValue = normalizedValue && normalizedValue !== 'N/A' ? normalizedValue : BCS_CODES[0]

  const filteredCodes = BCS_CODES.filter((code) =>
    code.toLowerCase().includes(searchText.toLowerCase())
  )
  const effectiveCodes =
    normalizedValue && normalizedValue !== 'N/A' && !BCS_CODES.includes(normalizedValue)
      ? [normalizedValue, ...filteredCodes]
      : filteredCodes

  const handleSelect = (code: string) => {
    onChange(code)
    setIsOpen(false)
    setSearchText('')
  }

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          setSearchText('')
        }}
        className="flex w-full min-w-0 items-center justify-between gap-1 rounded-[3px] border border-[#d9d9d9] bg-white px-[6px] py-[4px] text-left text-[12px] text-[#303030] outline-none hover:border-[#8093db] focus:border-[#8093db]"
        title={displayValue}
      >
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{displayValue}</span>
        <svg
          className={`h-[14px] w-[14px] flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-[2px] rounded-[3px] border border-[#d9d9d9] bg-white shadow-lg">
          <input
            autoFocus
            type="text"
            placeholder="Search codes..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full rounded-t-[3px] border-b border-[#d9d9d9] px-[8px] py-[6px] text-[12px] text-[#303030] outline-none focus:border-[#8093db]"
          />
          <div className="max-h-[200px] overflow-y-auto">
            {effectiveCodes.length === 0 ? (
              <div className="px-[8px] py-[8px] text-center text-[12px] text-[#999]">No codes found</div>
            ) : (
              effectiveCodes.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleSelect(code)}
                  className="w-full px-[8px] py-[6px] text-left text-[12px] text-[#303030] hover:bg-[#f0f4f8]"
                >
                  {code}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ListOfDocuments() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { jobId: contextJobId } = useJob()
  const { user } = useUser()

  const jobId = searchParams.get('job_id') || contextJobId
  const listIsStaleOnOpen = isDocumentListStale(jobId)
  const prefetchedOnOpen = peekPrefetchedDocuments(jobId)
  const cachedPage =
    listIsStaleOnOpen || (prefetchedOnOpen && prefetchedOnOpen.length > 0)
      ? undefined
      : getDocumentPageCache<{
          documents: DocRow[]
          selected: number[]
          expandedRows: number[]
          currentPage: number
        }>(jobId)
  const initialFromPrefetch =
    prefetchedOnOpen && prefetchedOnOpen.length > 0
      ? mapApiDocumentsToRows(prefetchedOnOpen as Array<Record<string, any>>, jobId || '')
      : null
  const visibleInitialFromPrefetch = initialFromPrefetch
    ? filterRowsForViewer(initialFromPrefetch, user)
    : null

  const [selected, setSelected] = useState<number[]>(() => cachedPage?.selected ?? [])
  const [documents, setDocuments] = useState<DocRow[]>(
    () => visibleInitialFromPrefetch ?? filterRowsForViewer(cachedPage?.documents ?? [], user),
  )
  const [documentsReloadKey, setDocumentsReloadKey] = useState(0)
  const [loadedDocumentJobId, setLoadedDocumentJobId] = useState<string | null>(() =>
    initialFromPrefetch || cachedPage ? jobId : null,
  )

  useEffect(() => {
    setDocumentsReloadKey(0)
  }, [jobId])
  const [expandedRows, setExpandedRows] = useState<number[]>(() => cachedPage?.expandedRows ?? [])
  const [currentPage, setCurrentPage] = useState(() => cachedPage?.currentPage ?? 1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedAsset, setSelectedAsset] = useState('All')
  const [assetSearchInput, setAssetSearchInput] = useState('')
  const [assetDropdownOpen, setAssetDropdownOpen] = useState(false)
  const assetDropdownRef = useRef<HTMLDivElement>(null)
  // Prefer a short loader over flashing outdated rows after Process/Stop.
  const [isLoading, setIsLoading] = useState(
    () => Boolean(jobId && listIsStaleOnOpen && !initialFromPrefetch),
  )
  const [bcsCodeSelection, setBcsCodeSelection] = useState<Record<number, string>>({})
  const [folderSelection, setFolderSelection] = useState<Record<number, string>>({})
  const [viewDocument, setViewDocument] = useState<DocRow | null>(null)
  const [viewMatches, setViewMatches] = useState<TopMatch[]>([])
  const [viewMatchesLoading, setViewMatchesLoading] = useState(false)
  const itemsPerPage = 10
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [pipelineNotice, setPipelineNotice] = useState('')
  const [isArchiving, setIsArchiving] = useState(false)
  const archiveNoticeJobRef = useRef<string | null>(null)
  const hydratedDocumentJobRef = useRef<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    const wasStale = consumeDocumentListStale(jobId)
    archiveNoticeJobRef.current = null
    hydratedDocumentJobRef.current = jobId

    const prefetched = takePrefetchedDocuments(jobId)
    if (prefetched && prefetched.length > 0) {
      const rows = filterRowsForViewer(
        mapApiDocumentsToRows(prefetched as Array<Record<string, any>>, jobId),
        user,
      )
      setDocuments(rows)
      setLoadedDocumentJobId(jobId)
      setIsLoading(false)
      setDocumentPageCache(jobId, {
        documents: rows,
        selected,
        expandedRows,
        currentPage,
      })
      // Quiet reconcile — fresh rows are already on screen.
      setDocumentsReloadKey((key) => key + 1)
      return
    }

    if (wasStale) {
      // After Process/Stop: never paint the old list. Show loader until fresh fetch.
      clearDocumentPageCache(jobId)
      setDocuments([])
      setSelected([])
      setExpandedRows([])
      setCurrentPage(1)
      setLoadedDocumentJobId(null)
      setIsLoading(true)
      setDocumentsReloadKey((key) => key + 1)
      return
    }

    const cached = getDocumentPageCache<{
      documents: DocRow[]
      selected: number[]
      expandedRows: number[]
      currentPage: number
    }>(jobId)
    if (cached?.documents?.length) {
      const visibleCachedDocs = filterRowsForViewer(cached.documents, user)
      setDocuments(visibleCachedDocs)
      setSelected(cached.selected)
      setExpandedRows(cached.expandedRows)
      setCurrentPage(cached.currentPage)
      setLoadedDocumentJobId(jobId)
      setIsLoading(false)
    } else if (documents.length > 0) {
      setLoadedDocumentJobId(jobId)
      setIsLoading(false)
    } else {
      setLoadedDocumentJobId(null)
      setIsLoading(true)
      setDocumentsReloadKey((key) => key + 1)
    }
  }, [jobId, location.key, user])

  useEffect(() => {
    if (!jobId || hydratedDocumentJobRef.current !== jobId) return
    if (documents.length === 0) return
    setDocumentPageCache(jobId, { documents, selected, expandedRows, currentPage })
  }, [jobId, documents, selected, expandedRows, currentPage])

  useEffect(() => {
    const refreshNow = () => {
      if (!jobId) return
      // Skip focus refresh when the job is already finished — keeps the table stable.
      if (
        jobStatus === 'completed' ||
        jobStatus === 'failed' ||
        jobStatus === 'awaiting_confirmation'
      ) {
        return
      }
      // Silent background refresh only — never wipe the visible list.
      setDocumentsReloadKey((key) => key + 1)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshNow()
    }
    window.addEventListener('focus', refreshNow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refreshNow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [jobId, jobStatus])

  const persistClassificationUpdate = useCallback(
    async (doc: DocRow, updates: ClassificationUpdate) => {
      const targetJobId = doc.details.jobId || jobId
      const documentId = doc.details.reportId
      if (!targetJobId || !documentId || documentId === 'N/A') {
        return
      }

      setSaveError('')
      try {
        const updated = await updateClassification(targetJobId, documentId, updates)
        setDocuments((current) =>
          current.map((row) => {
            if (row.id !== doc.id) {
              return row
            }

            const resolvedFolder = cleanText(updated.folder) || row.details.folder
            const resolvedSubFolder = cleanText(updated.sub_folder) || row.details.subFolder
            const resolvedRdsCode =
              normalizeBcsCode(updated.top_matches?.[0]?.record_code) || row.details.bcsSubCode
            const retention = updated.retention
            const rawScore = updated.top_matches?.[0]?.confidence
            const scorePercent =
              typeof rawScore === 'number' && Number.isFinite(rawScore)
                ? Math.round(rawScore * 100)
                : Number.parseInt(row.details.confidenceScore, 10) || 0

            return {
              ...row,
              details: {
                ...row.details,
                folder: resolvedFolder || 'N/A',
                subFolder: resolvedSubFolder || 'N/A',
                dataType: formatMetadataValue(updated.data_type) || row.details.dataType,
                discipline: formatMetadataValue(updated.discipline) || row.details.discipline,
                businessFunction:
                  formatMetadataValue(updated.business_function) || row.details.businessFunction,
                contentType: formatMetadataValue(updated.content_type) || row.details.contentType,
                bcsSubCode: resolvedRdsCode || row.details.bcsSubCode,
                confidenceScore: formatConfidencePercent(scorePercent / 100),
                score: formatConfidencePercent(scorePercent / 100),
                category: formatMetadataValue(updated.subject) || row.details.category,
                date: toIsoDate(updated.date) || row.details.date,
                creationDate: toIsoDate(updated.date) || row.details.creationDate,
                authorCompany: formatMetadataValue(updated.author_company) || row.details.authorCompany,
                asset: formatMetadataValue(updated.asset) || row.details.asset,
                confidentiality: formatMetadataValue(updated.confidential) || row.details.confidentiality,
                boxId: formatMetadataValue(updated.box_id) || row.details.boxId,
                cyientRemarks: formatMetadataValue(updated.cyient_remarks) || row.details.cyientRemarks,
                trigger:
                  formatMetadataValue(retention?.trigger) ||
                  formatMetadataValue(updates.retention_trigger) ||
                  row.details.trigger,
                retentionPeriod:
                  formatMetadataValue(retention?.retention_period) ||
                  formatMetadataValue(updates.retention_period) ||
                  row.details.retentionPeriod,
                reviewYear:
                  formatMetadataValue(retention?.review_year) ||
                  formatMetadataValue(updates.review_year) ||
                  row.details.reviewYear,
                version:
                  formatMetadataValue(retention?.version) ||
                  formatMetadataValue(updates.retention_version) ||
                  row.details.version,
              },
              jsonData: {
                ...(typeof row.jsonData === 'object' && row.jsonData ? row.jsonData : {}),
                ...updated,
              },
            }
          }),
        )
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Failed to save metadata changes')
      }
    },
    [jobId],
  )

  const openDocumentReview = (doc: DocRow, edit = true) => {
    const targetJobId = doc.details.jobId || jobId
    if (!targetJobId) return
    navigate(
      `/intelligence-classification?job_id=${targetJobId}&doc_id=${doc.details.reportId}${edit ? '&edit=true' : ''}`,
      { state: { documentJson: doc.jsonData } },
    )
  }

  const handleEditDocument = (doc: DocRow) => openDocumentReview(doc, true)

  const handleDocumentPreview = useCallback((doc: DocRow) => {
    const targetJobId = String(doc.details.jobId || jobId || '').trim()
    const documentId = String(doc.details.reportId || '').trim()
    if (!targetJobId || !documentId || documentId === 'N/A') return

    const fileUrl = getDocumentFileUrl(targetJobId, documentId)
    const previewFileName = getPreviewFileName(doc.details.fileName)
    const previewUrl = `/document-preview?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(previewFileName)}`
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }, [jobId])

  const handleViewDocument = async (doc: DocRow) => {
    setViewDocument(doc)
    const localMatches = getTopMatchesFromJson(doc.jsonData)
    setViewMatches(localMatches)

    if (localMatches.length > 0) {
      return
    }

    const targetJobId = doc.details.jobId || jobId
    const documentId = doc.details.reportId
    if (!targetJobId || !documentId || documentId === 'N/A') {
      return
    }

    setViewMatchesLoading(true)
    try {
      const classification = await getClassification(targetJobId, documentId)
      setViewMatches(Array.isArray(classification.top_matches) ? classification.top_matches.slice(0, 3) : [])
    } catch {
      setViewMatches([])
    } finally {
      setViewMatchesLoading(false)
    }
  }

  const handleProcessSelected = async () => {
    if (!jobId || selected.length === 0) {
      setSaveError('Select at least one document to process')
      return
    }

    const selectedDocuments = documents.filter((doc) => selected.includes(doc.id))
    setIsArchiving(true)
    setSaveError('')
    try {
      const documentIds = selectedDocuments
        .map((doc) => doc.details.reportId)
        .filter((id) => id && id !== 'N/A')
      const result = await archiveDocuments(jobId, documentIds)
      setSelected((current) => current.filter((id) => !selected.includes(id)))
      if (result.failed.length > 0) {
        setSaveError(
          result.failed.map((item) => `${item.document_id}: ${item.error}`).join('; '),
        )
      }
      if (result.archived.length > 0) {
        archiveNoticeJobRef.current = jobId
        setPipelineNotice(
          `Archived ${result.archived.length} document${
            result.archived.length === 1 ? '' : 's'
          }.`,
        )
        setDocumentsReloadKey((value) => value + 1)
      } else if (result.failed.length === 0) {
        setSaveError('No documents were archived')
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to process documents')
    } finally {
      setIsArchiving(false)
    }
  }

  const toggleSelected = (id: number, next: boolean) => {
    setSelected((current) => (next ? [...current, id] : current.filter((item) => item !== id)))
  }

  const toggleExpandedRow = (id: number) => {
    setExpandedRows((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  useEffect(() => {
    let isActive = true

    async function loadJobStatus() {
      if (!jobId) {
        if (isActive) setJobStatus(null)
        return
      }

      try {
        const status = await getJobStatus(jobId)
        if (!isActive) return
        setJobStatus(status.status)
      } catch {
        if (isActive) setJobStatus(null)
      }
    }

    void loadJobStatus()
    return () => {
      isActive = false
    }
  }, [jobId])

  useEffect(() => {
    let isActive = true
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null

    async function loadDocuments(silent = false) {
      const hasVisibleDocuments = documents.length > 0 || hasDocumentPageCache(jobId)
      // Never flash a full-page loader when we already have rows to show.
      if (!silent && !hasVisibleDocuments) setIsLoading(true)
      try {
        if (!jobId) {
          return
        }
        const [docs, jobStatusForLibrary] = await Promise.all([
          getDocuments(jobId),
          getJobStatus(jobId).catch(() => null),
        ])
        if (!isActive) return
        if (jobStatusForLibrary?.status) setJobStatus(jobStatusForLibrary.status)
        const uploadLibrary = cleanText(jobStatusForLibrary?.library) || 'Archive'
        const allDocs = docs.map((doc) => ({ ...doc, sourceJobId: jobId }))
        const docRows = mapApiDocumentsToRows(allDocs, jobId, uploadLibrary)
        const visibleDocRows = filterRowsForViewer(docRows, user)

        const allVisibleRowsFinished =
          visibleDocRows.length > 0 &&
          visibleDocRows.every((row) =>
            ['Pipeline completed', 'AI classification finished'].includes(row.details.pipelineStatus),
          )
        const hasInFlightRows = visibleDocRows.some((row) =>
          [
            'Waiting for duplicate review',
            'Queued for OCR',
            'OCR processing',
            'OCR complete — waiting for Post-OCR',
            'Post-OCR processing',
            'Ready for classification',
            'Asset classification processing',
            'Asset classification completed',
            'AI classification processing',
            'Processing',
          ].includes(row.details.pipelineStatus),
        )
        const terminalJob =
          jobStatusForLibrary?.status === 'completed' ||
          jobStatusForLibrary?.status === 'failed' ||
          jobStatusForLibrary?.status === 'awaiting_confirmation'
        const shouldRefresh = Boolean(
          !allVisibleRowsFinished &&
            !terminalJob &&
            (hasInFlightRows ||
              !jobStatusForLibrary ||
              ['processing', 'queued', 'awaiting_duplicate_review'].includes(
                jobStatusForLibrary.status,
              )),
        )

        if (isActive) {
          setDocuments((current) => {
            const existingIds = new Map(
              current.map((row) => [row.details.reportId, row.id]),
            )
            const nextId = current.reduce((highest, row) => Math.max(highest, row.id), 0)
            const nextDocuments = visibleDocRows.map((row, index) => ({
              ...row,
              id: existingIds.get(row.details.reportId) ?? nextId + index + 1,
            }))
            if (documentsSignature(current) === documentsSignature(nextDocuments)) {
              return current
            }
            setDocumentPageCache(jobId, {
              documents: nextDocuments,
              selected,
              expandedRows,
              currentPage,
            })
            return nextDocuments
          })
          const waitingReviewCount = visibleDocRows.filter(
            (row) => row.details.pipelineStatus === 'Waiting for duplicate review',
          ).length
          let nextNotice = ''
          if (waitingReviewCount > 0) {
            nextNotice = `${waitingReviewCount} file(s) waiting for duplicate review. Open Duplicate Detection to decide.`
          } else if (jobStatusForLibrary?.status === 'awaiting_duplicate_review') {
            nextNotice =
              'Duplicate review / OCR is tracked on Duplicate Detection. Classification-ready files appear here.'
          } else if (
            allVisibleRowsFinished ||
            jobStatusForLibrary?.status === 'completed'
          ) {
            nextNotice = 'All documents finished. Review classifications below.'
          } else if (jobStatusForLibrary?.status === 'awaiting_confirmation') {
            nextNotice = 'Classification ready for review below.'
          } else if (jobStatusForLibrary?.status === 'failed') {
            nextNotice = 'Processing failed for this job. Check document status below.'
          } else if (
            jobStatusForLibrary?.status === 'processing' ||
            jobStatusForLibrary?.status === 'queued'
          ) {
            nextNotice =
              'Showing documents in asset classification and later stages. OCR / Post-OCR progress is on Duplicate Detection.'
          }
          setPipelineNotice((current) => (current === nextNotice ? current : nextNotice))
          // Keep pagination stable during silent background refreshes.
          if (!silent && !hasVisibleDocuments) setCurrentPage(1)
        }

        if (shouldRefresh && isActive) {
          refreshTimeout = setTimeout(() => loadDocuments(true), 2000)
        }
      } catch {
        // Keep previous state if request fails.
      } finally {
        if (isActive) {
          setLoadedDocumentJobId(jobId)
          if (!silent) setIsLoading(false)
        }
      }
    }

    // If rows are already on screen (cache/prefetch), refresh quietly.
    void loadDocuments(documents.length > 0 || hasDocumentPageCache(jobId))
    return () => {
      isActive = false
      if (refreshTimeout !== null) clearTimeout(refreshTimeout)
    }
  }, [jobId, location.key, documentsReloadKey, user])

  useEffect(() => {
    setSelected((current) => current.filter((id) => documents.some((doc) => doc.id === id)))
  }, [documents])

  const filteredDocuments = documents.filter((doc) => {
    const normalizedAsset = doc.details.asset.trim()
    const isBlankAsset = normalizedAsset.length === 0 || normalizedAsset.toUpperCase() === 'N/A'

    const matchesAsset =
      selectedAsset === 'All' ||
      (selectedAsset === BLANK_ASSET_OPTION
        ? isBlankAsset
        : normalizedAsset.toLowerCase() === selectedAsset.trim().toLowerCase())

    const docDate = doc.details.date
    const matchesFrom = fromDate.length === 0 ? true : docDate !== 'N/A' && docDate >= fromDate
    const matchesTo = toDate.length === 0 ? true : docDate !== 'N/A' && docDate <= toDate

    return matchesAsset && matchesFrom && matchesTo
  })

  const documentStatusCounts = documents.reduce(
    (counts, doc) => {
      const status = doc.details.pipelineStatus
      if (['Pipeline completed', 'AI classification finished'].includes(status)) {
        counts.completed += 1
      } else if (status === 'Ready for classification') {
        counts.ready += 1
      } else if (status === 'Waiting for duplicate review') {
        counts.waitingReview += 1
      } else {
        counts.processing += 1
      }
      return counts
    },
    { ready: 0, processing: 0, completed: 0, waitingReview: 0 },
  )

  const assetOptions = useMemo(
    () => {
      const nonBlankAssets = Array.from(
        new Set(
          documents
            .map((doc) => doc.details.asset.trim())
            .filter((value) => value.length > 0 && value.toUpperCase() !== 'N/A'),
        ),
      ).sort((a, b) => a.localeCompare(b))

      const hasBlankAsset = documents.some((doc) => {
        const value = doc.details.asset.trim()
        return value.length === 0 || value.toUpperCase() === 'N/A'
      })

      return hasBlankAsset ? [BLANK_ASSET_OPTION, ...nonBlankAssets] : nonBlankAssets
    },
    [documents],
  )

  const filteredAssetOptions = useMemo(
    () =>
      assetSearchInput.trim() === ''
        ? assetOptions
        : assetOptions.filter((asset) =>
            asset.toLowerCase().includes(assetSearchInput.toLowerCase()),
          ),
    [assetOptions, assetSearchInput],
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        assetDropdownRef.current &&
        !assetDropdownRef.current.contains(event.target as Node)
      ) {
        setAssetDropdownOpen(false)
      }
    }

    if (assetDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [assetDropdownOpen])

  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / itemsPerPage))
  const folderOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...ARCHIVE_FOLDERS,
          ...documents.map((doc) => doc.details.folder).filter((value) => value && value !== 'N/A'),
        ]),
      ).sort((a, b) => a.localeCompare(b)),
    [documents],
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!viewDocument) {
      setViewMatches([])
      setViewMatchesLoading(false)
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewDocument(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewDocument])

  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedDocuments = filteredDocuments.slice(startIndex, endIndex)

  const selectableDocuments = filteredDocuments.filter((doc) => !isProcessedDocument(doc))
  const allSelected = selectableDocuments.length > 0 && selectableDocuments.every((doc) => selected.includes(doc.id))

  const getPaginationPages = () => {
    const pages: Array<number | string> = []
    if (totalPages <= 10) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i)
      return pages
    }

    pages.push(1)
    if (currentPage > 4) pages.push('...')

    for (let i = Math.max(2, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i += 1) {
      pages.push(i)
    }

    if (currentPage < totalPages - 3) pages.push('...')
    pages.push(totalPages)
    return pages
  }

  const handleDownloadDocuments = () => {
    if (filteredDocuments.length === 0) return

    const rows = filteredDocuments.map((doc) => {
      const common = {
        Filename: doc.details.fileName,
        Asset: doc.details.asset,
        'Creation Date': doc.details.creationDate,
        'BCS Code': bcsCodeSelection[doc.id] || doc.details.bcsSubCode,
        'Project/Archive': doc.details.library,
        Trigger: doc.details.trigger,
        'Retention Period': doc.details.retentionPeriod,
        'Review Year': doc.details.reviewYear,
      }

      if (isProjectLibrary(doc.details.library)) {
        return {
          ...common,
          'Business Function': doc.details.businessFunction,
          'Content Type': doc.details.contentType,
        }
      }

      return {
        ...common,
        Confidential: doc.details.confidentiality,
        Discipline: doc.details.discipline,
        'Data Type': doc.details.dataType,
        'Author/Company': doc.details.authorCompany,
        'Box ID': doc.details.boxId,
      }
    })

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Documents')
    XLSX.writeFile(workbook, `documents-${jobId || 'all'}.xlsx`)
  }

  return (
    <Layout
      title="Intelligence Classification"
      activeNavId="intelligence"
      breadcrumbItems={[
        { label: 'List of Classification', href: '#list-of-documents', current: true },
      ]}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {(pipelineNotice || documents.length > 0) && (
          <div className="mx-[8px] mt-[8px] flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-[#bfdbfe] bg-[#eff6ff] px-4 py-2">
            <div className="min-w-0">
              {pipelineNotice && (
                <p className="font-ui text-[12px] text-[#1e40af]">{pipelineNotice}</p>
              )}
              {documents.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-[#93c5fd] bg-white px-2.5 py-[2px] font-ui text-[11px] font-medium text-[#1d4ed8]">
                    Ready: {documentStatusCounts.ready}
                  </span>
                  <span className="rounded-full border border-[#fcd34d] bg-white px-2.5 py-[2px] font-ui text-[11px] font-medium text-[#b45309]">
                    Processing: {documentStatusCounts.processing}
                  </span>
                  {documentStatusCounts.waitingReview > 0 && (
                    <span className="rounded-full border border-[#f59e0b] bg-[#fffbeb] px-2.5 py-[2px] font-ui text-[11px] font-medium text-[#b45309]">
                      Waiting review: {documentStatusCounts.waitingReview}
                    </span>
                  )}
                  <span className="rounded-full border border-[#86efac] bg-white px-2.5 py-[2px] font-ui text-[11px] font-medium text-[#15803d]">
                    Completed: {documentStatusCounts.completed}
                  </span>
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {jobStatus === 'awaiting_duplicate_review' && (
                <button
                  type="button"
                  onClick={() => navigate(jobId ? `/duplicate?job_id=${encodeURIComponent(jobId)}` : '/duplicate')}
                  className="rounded-[4px] bg-[#0f766e] px-3 py-2 font-ui text-[11px] font-semibold text-white hover:bg-[#0f5f59]"
                >
                  Review duplicates
                </button>
              )}
            </div>
          </div>
        )}
        {saveError && (
          <div className="mx-[8px] mt-[8px] rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-4 py-2">
            <p className="font-ui text-[12px] text-[#b91c1c]">{saveError}</p>
          </div>
        )}
        <div className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-[8px] border-b border-cy-divider px-[8px] py-[6px]">
          <span className="text-[12px] text-[#666]">From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value)
              setCurrentPage(1)
            }}
            className="h-[28px] w-[132px] rounded-[3px] border border-[#d9d9d9] px-[8px] text-[12px] text-[#303030] outline-none"
          />

          <span className="text-[12px] text-[#666]">To</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value)
              setCurrentPage(1)
            }}
            className="h-[28px] w-[132px] rounded-[3px] border border-[#d9d9d9] px-[8px] text-[12px] text-[#303030] outline-none"
          />

          <span className="text-[12px] text-[#666]">Asset</span>
          <div ref={assetDropdownRef} className="relative w-[160px]">
            <button
              type="button"
              onClick={() => setAssetDropdownOpen(!assetDropdownOpen)}
              className="h-[28px] w-full rounded-[3px] border border-[#d9d9d9] bg-white px-[8px] text-left text-[12px] text-[#303030] outline-none hover:border-[#999] flex items-center justify-between"
            >
              <span className="truncate">{selectedAsset}</span>
              <svg
                className={`h-[14px] w-[14px] flex-shrink-0 transition-transform ${
                  assetDropdownOpen ? 'rotate-180' : ''
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {assetDropdownOpen && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-[3px] border border-[#d9d9d9] bg-white shadow-md">
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={assetSearchInput}
                  onChange={(e) => setAssetSearchInput(e.target.value)}
                  className="w-full border-b border-[#e8e8e8] px-[8px] py-[6px] text-[12px] outline-none focus:bg-[#f9f9f9]"
                  autoFocus
                />
                <div className="max-h-[200px] overflow-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAsset('All')
                      setAssetSearchInput('')
                      setAssetDropdownOpen(false)
                      setCurrentPage(1)
                    }}
                    className={`w-full px-[8px] py-[6px] text-left text-[12px] hover:bg-[#f0f0f0] ${
                      selectedAsset === 'All' ? 'bg-[#e8f4f8]' : ''
                    }`}
                  >
                    All
                  </button>
                  {filteredAssetOptions.length > 0 ? (
                    filteredAssetOptions.map((asset) => (
                      <button
                        key={asset}
                        type="button"
                        onClick={() => {
                          setSelectedAsset(asset)
                          setAssetSearchInput('')
                          setAssetDropdownOpen(false)
                          setCurrentPage(1)
                        }}
                        className={`w-full px-[8px] py-[6px] text-left text-[12px] hover:bg-[#f0f0f0] ${
                          selectedAsset === asset ? 'bg-[#e8f4f8]' : ''
                        }`}
                      >
                        {asset}
                      </button>
                    ))
                  ) : (
                    <div className="px-[8px] py-[6px] text-[12px] text-[#999]">No matches found</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-[8px]">
            <button
              type="button"
              onClick={handleDownloadDocuments}
              className="inline-flex h-[28px] items-center gap-1 rounded-[4px] bg-[#4f5fbf] px-[14px] text-[12px] font-semibold text-white transition-colors hover:bg-[#4452a6]"
            >
              Export
              <img src={xlsxIcon} alt="XLSX" className="h-[14px] w-[14px]" draggable={false} />
            </button>
            <button
              type="button"
              onClick={handleProcessSelected}
              disabled={isArchiving || selected.length === 0}
              className="h-[28px] rounded-[4px] bg-[#4f5fbf] px-[14px] text-[12px] font-semibold text-white transition-colors hover:bg-[#4452a6] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isArchiving ? 'Processing...' : 'Process'}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 px-[10px] py-[8px]">
          {documents.length === 0 &&
          (isLoading || (jobId !== null && loadedDocumentJobId !== jobId)) ? (
            <div className="flex h-full items-center justify-center rounded-[4px] border border-[#e5e7eb] bg-white">
              <div className="flex flex-col items-center gap-2">
                <svg className="h-[16px] w-[16px] text-[#2563eb] animate-spin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" opacity="0.3" />
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                </svg>
                <p className="text-[12px] font-semibold text-[#5e738f]">Loading documents...</p>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto rounded-[4px] border border-[#e6e6e6]">
              <table className="w-full min-w-[1100px] table-fixed border-collapse text-left">
              <thead className="bg-[#f6f7fb]">
                <tr className="text-[10px] font-semibold text-[#69718f]">
                  <th className="w-[200px] border-b border-[#e8e8e8] px-[8px] py-[7px]">
                    <div className="flex items-center gap-[6px]">
                      <span className="inline-flex h-[14px] w-[14px] flex-shrink-0" aria-hidden="true" />
                      <Checkbox
                        checked={allSelected}
                        onChange={(next) => setSelected(next ? selectableDocuments.map((doc) => doc.id) : [])}
                        label="Select all documents"
                      />
                      <span>File Name</span>
                    </div>
                  </th>
                  <th className="w-[110px] border-b border-[#e8e8e8] px-[8px] py-[7px]">BCS Code</th>
                  <th className="w-[90px] border-b border-[#e8e8e8] px-[8px] py-[7px]">Confidence score</th>
                  <th className="w-[110px] border-b border-[#e8e8e8] px-[8px] py-[7px]">Creation Date</th>
                  <th className="w-[100px] border-b border-[#e8e8e8] px-[8px] py-[7px]">Discipline</th>
                  <th className="w-[100px] border-b border-[#e8e8e8] px-[8px] py-[7px]">Data Type</th>
                  <th className="w-[120px] border-b border-[#e8e8e8] px-[8px] py-[7px]">Business Function</th>
                  <th className="w-[110px] border-b border-[#e8e8e8] px-[8px] py-[7px]">Content Type</th>
                  <th className="w-[130px] border-b border-[#e8e8e8] px-[8px] py-[7px]">Project Archive Library</th>
                  <th className="w-[130px] whitespace-nowrap border-b border-[#e8e8e8] px-[8px] py-[7px] text-center">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {paginatedDocuments.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-[8px] py-[24px] text-center text-[11px] text-[#8b8b8b]">
                      {pipelineNotice || 'No unique documents found'}
                    </td>
                  </tr>
                )}

                {paginatedDocuments.map((doc, index) => {
                  const isExpanded = expandedRows.includes(doc.id)
                  const isProcessed = isProcessedDocument(doc)
                  const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-[#fafbff]'
                  const projectLibrary = isProjectLibrary(doc.details.library)

                  return (
                    <Fragment key={doc.id}>
                      <tr className={`${rowBg} text-[11px] text-[#2d2d2d]`}>
                        <td className="max-w-0 border-b border-[#eeeeee] px-[8px] py-[6px]">
                          <div className="flex w-full min-w-0 items-center gap-[6px]">
                            <button
                              type="button"
                              onClick={() => toggleExpandedRow(doc.id)}
                              className="inline-flex h-[14px] w-[14px] flex-shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[16px] font-bold leading-none text-[#2f4aa0]"
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                            >
                              {isExpanded ? '−' : '+'}
                            </button>
                            <Checkbox
                              checked={selected.includes(doc.id)}
                              onChange={(next) => toggleSelected(doc.id, next)}
                              disabled={isProcessed}
                              label={`Select ${doc.details.fileName}`}
                            />
                            <div className="min-w-0 flex-1 overflow-hidden p-0 text-left text-[#2f4aa0]">
                              <button
                                type="button"
                                onClick={() => handleDocumentPreview(doc)}
                                className="block max-w-full cursor-pointer overflow-hidden border-0 bg-transparent p-0 text-left text-[#2f4aa0] hover:text-[#1d4ed8]"
                                title={doc.details.fileName}
                              >
                                <TruncatedText value={doc.details.fileName} className="text-[#2f4aa0]" />
                              </button>
                              <span className="mt-[5px] block max-w-[220px] text-[10px] text-[#64748b]">
                                <span className="flex items-center gap-[6px]">
                                  <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]">
                                    <span
                                      className={`block h-full rounded-full transition-all duration-500 ${
                                        documentPipelineProgress(doc.details.pipelineStatus) === 100
                                          ? 'bg-[#10b981]'
                                          : 'bg-[#3b82f6]'
                                      }`}
                                      style={{ width: `${documentPipelineProgress(doc.details.pipelineStatus)}%` }}
                                    />
                                  </span>
                                  <span
                                    className={`shrink-0 text-[9px] font-semibold ${
                                      documentPipelineProgress(doc.details.pipelineStatus) === 100
                                        ? 'text-[#047857]'
                                        : 'text-[#475569]'
                                    }`}
                                  >
                                    {doc.details.pipelineStatus}
                                  </span>
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-0 border-b border-[#eeeeee] px-[8px] py-[6px]">
                          <BcsCodeDropdown
                            value={bcsCodeSelection[doc.id] || doc.details.bcsSubCode}
                            onChange={(code) => {
                              setBcsCodeSelection((prev) => ({ ...prev, [doc.id]: code }))
                              const llmConfidence = findLlmMatchConfidence(doc.jsonData, code)
                              const confidence = llmConfidence !== null ? llmConfidence : 0
                              setDocuments((current) =>
                                current.map((row) =>
                                  row.id === doc.id
                                    ? {
                                        ...row,
                                        details: {
                                          ...row.details,
                                          bcsSubCode: code,
                                          confidenceScore: formatConfidencePercent(confidence),
                                          score: formatConfidencePercent(confidence),
                                        },
                                      }
                                    : row,
                                ),
                              )
                              persistClassificationUpdate(doc, { selected_rds_code: code })
                            }}
                          />
                        </td>
                        <TruncatedCell value={doc.details.confidenceScore} />
                        <InlineTextCell
                          value={doc.details.creationDate}
                          type="date"
                          onSave={(date) => persistClassificationUpdate(doc, { date })}
                        />
                        <InlineSelectCell
                          value={projectLibrary ? 'N/A' : doc.details.discipline}
                          options={DISCIPLINE_VALUES}
                          disabled={projectLibrary}
                          onSave={(discipline) => persistClassificationUpdate(doc, { discipline })}
                        />
                        <InlineSelectCell
                          value={projectLibrary ? 'N/A' : doc.details.dataType}
                          options={DATA_TYPE_VALUES}
                          disabled={projectLibrary}
                          onSave={(dataType) => persistClassificationUpdate(doc, { data_type: dataType })}
                        />
                        <InlineSelectCell
                          value={projectLibrary ? doc.details.businessFunction : 'N/A'}
                          options={BUSINESS_FUNCTION_VALUES}
                          disabled={!projectLibrary}
                          onSave={(businessFunction) =>
                            persistClassificationUpdate(doc, { business_function: businessFunction })
                          }
                        />
                        <InlineSelectCell
                          value={projectLibrary ? doc.details.contentType : 'N/A'}
                          options={CONTENT_TYPE_VALUES}
                          disabled={!projectLibrary}
                          onSave={(contentType) =>
                            persistClassificationUpdate(doc, { content_type: contentType })
                          }
                        />
                        <TruncatedCell value={doc.details.library} />
                        <td className="border-b border-[#eeeeee] px-[8px] py-[6px]">
                          <div className="flex items-center justify-center gap-[8px]">
                            <button
                              type="button"
                              aria-label="Edit document"
                              onClick={() => handleEditDocument(doc)}
                              className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-[4px] bg-[#17a2b8] text-white hover:bg-[#138496] transition-colors"
                            >
                              <svg className="h-[14px] w-[14px]" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
                                <path d="M362.7 19.3c25.2-25.2 65.9-25.2 91.1 0l38.9 38.9c25.2 25.2 25.2 65.9 0 91.1L188.5 453.5c-7.9 7.9-17.9 13.5-28.8 16.1L48 496l26.4-111.8c2.6-10.9 8.2-20.9 16.1-28.8L362.7 19.3zM352 109.3 96 365.3 86.4 406l40.7-9.6L383.1 140.4 352 109.3z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              aria-label="View metadata"
                              onClick={() => {
                                handleViewDocument(doc)
                              }}
                              className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-[4px] bg-[#17a2b8] text-white hover:bg-[#138496] transition-colors"
                            >
                              <svg className="h-[14px] w-[16px]" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true">
                                <path d="M288 32c-80.8 0-145.5 36.8-192.6 80.6C48.6 156 17.3 208 2.5 243.7c-3.3 7.9-3.3 16.7 0 24.6C17.3 304 48.6 356 95.4 399.4 142.5 443.2 207.2 480 288 480s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1C433.5 68.8 368.8 32 288 32zM288 400a144 144 0 1 0 0-288 144 144 0 1 0 0 288zm0-96a48 48 0 1 1 0-96 48 48 0 1 1 0 96z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-white">
                          <td colSpan={10} className="border-b border-[#eeeeee] px-[8px] py-[10px]">
                            <div className="overflow-auto rounded-[3px] border border-[#e8e8e8]">
                              <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
                                <thead className="bg-[#f6f7fb]">
                                  <tr className="text-[10px] font-semibold text-[#69718f]">
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Asset</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Folder</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Subfolder</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Confidentiality</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Author/Company</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Box ID</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Trigger</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Version</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Retention Period</th>
                                    <th className="border-r border-[#e8e8e8] px-[12px] py-[8px]">Review Year</th>
                                    <th className="px-[12px] py-[8px]">Cyient Remarks</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white text-[11px] text-[#303030]">
                                  <tr className="hover:bg-[#fafbff]">
                                    <InlineTextCell
                                      value={doc.details.asset}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(asset) => persistClassificationUpdate(doc, { asset })}
                                    />
                                    <td className="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]">
                                      <FolderDropdown
                                        value={folderSelection[doc.id] || doc.details.folder}
                                        onChange={(folder) => {
                                          setFolderSelection((prev) => ({ ...prev, [doc.id]: folder }))
                                          persistClassificationUpdate(doc, { folder })
                                        }}
                                        options={folderOptions}
                                      />
                                    </td>
                                    <InlineSelectCell
                                      value={doc.details.subFolder}
                                      options={subFoldersFor(folderSelection[doc.id] || doc.details.folder)}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(subFolder) => persistClassificationUpdate(doc, { sub_folder: subFolder })}
                                    />
                                    <InlineTextCell
                                      value={doc.details.confidentiality}
                                      disabled={projectLibrary}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(confidential) => persistClassificationUpdate(doc, { confidential })}
                                    />
                                    <InlineTextCell
                                      value={projectLibrary ? 'N/A' : doc.details.authorCompany}
                                      disabled={projectLibrary}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(authorCompany) =>
                                        persistClassificationUpdate(doc, { author_company: authorCompany })
                                      }
                                    />
                                    <InlineTextCell
                                      value={projectLibrary ? 'N/A' : doc.details.boxId}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(boxId) => persistClassificationUpdate(doc, { box_id: boxId })}
                                    />
                                    <InlineTextCell
                                      value={doc.details.trigger}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(trigger) =>
                                        persistClassificationUpdate(doc, { retention_trigger: trigger })
                                      }
                                    />
                                    <InlineTextCell
                                      value={doc.details.version}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(version) =>
                                        persistClassificationUpdate(doc, { retention_version: version })
                                      }
                                    />
                                    <InlineTextCell
                                      value={doc.details.retentionPeriod}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(retentionPeriod) =>
                                        persistClassificationUpdate(doc, { retention_period: retentionPeriod })
                                      }
                                    />
                                    <InlineTextCell
                                      value={doc.details.reviewYear}
                                      cellClassName="max-w-0 border-r border-[#e8e8e8] px-[12px] py-[8px]"
                                      onSave={(reviewYear) =>
                                        persistClassificationUpdate(doc, { review_year: reviewYear })
                                      }
                                    />
                                    <InlineTextCell
                                      value={doc.details.cyientRemarks}
                                      cellClassName="max-w-0 px-[12px] py-[8px]"
                                      onSave={(cyientRemarks) =>
                                        persistClassificationUpdate(doc, { cyient_remarks: cyientRemarks })
                                      }
                                    />
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                </tbody>
            </table>
            </div>
          )}
        </div>

        {filteredDocuments.length > 0 && (
          <div className="flex h-[42px] shrink-0 items-center justify-end gap-[4px] border-t border-cy-divider bg-white px-[10px]">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-[24px] rounded-[3px] border border-[#d9d9d9] bg-white px-[8px] text-[11px] text-[#666] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            {getPaginationPages().map((page, index) => {
              if (page === '...') {
                return (
                  <span key={`ellipsis-${index}`} className="px-[3px] text-[11px] text-[#999]">
                    ...
                  </span>
                )
              }

              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page as number)}
                  className={`flex h-[24px] w-[24px] items-center justify-center rounded-[3px] text-[11px] ${
                    currentPage === page
                      ? 'bg-[#4f5fbf] text-white'
                      : 'border border-[#d9d9d9] bg-white text-[#666] hover:border-[#4f5fbf]'
                  }`}
                >
                  {page}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-[24px] rounded-[3px] border border-[#d9d9d9] bg-white px-[8px] text-[11px] text-[#666] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {viewDocument && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label="View metadata"
            onClick={() => setViewDocument(null)}
          >
            <div
              className="flex w-full max-w-[980px] max-h-[88vh] flex-col overflow-hidden rounded-[14px] border border-[#dbe4f1] bg-white shadow-[0_22px_50px_rgba(15,23,42,0.28)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#dbe4f1] bg-[linear-gradient(135deg,#f8fbff_0%,#f3f8ff_50%,#eef6ff_100%)] px-6 py-4">
                <div className="min-w-0">
                  <h3 className="mt-1 text-[20px] font-semibold text-[#1f2937]">View Metadata</h3>
                  <p className="mt-1 truncate text-[12px] text-[#64748b]" title={viewDocument.details.fileName}>{viewDocument.details.fileName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewDocument(null)}
                  className="rounded-[8px] border border-[#d7e0ee] bg-white px-3 py-1.5 text-[13px] font-medium text-[#475569] transition-colors hover:bg-[#f4f8ff]"
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fbff] px-6 py-5">
                {(() => {
                  const matches = viewMatches
                  const rankColors = ['#06A77D', '#F2994A', '#EF2B3B']

                  if (viewMatchesLoading) {
                    return (
                      <div className="rounded-[10px] border border-[#dbe4f1] bg-white px-4 py-5 text-[13px] text-[#64748b]">
                        Loading reason data...
                      </div>
                    )
                  }

                  if (matches.length === 0) {
                    return (
                      <div className="rounded-[10px] border border-[#dbe4f1] bg-white px-4 py-5 text-[13px] text-[#64748b]">
                        No reason data available for this document.
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-4">
                      {matches.map((match, index) => (
                        <div
                          key={`${match.record_code || 'match'}-${index}`}
                          className="rounded-[12px] border border-[#dbe4f1] bg-white p-4 shadow-[0_6px_18px_rgba(30,58,138,0.08)]"
                        >
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div
                                className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                                style={{ backgroundColor: rankColors[index] || rankColors[0] }}
                              >
                                {index + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[#1f2937]">{match.record_code || 'N/A'}</p>
                                {match.record_name && (
                                  <p className="mt-[2px] text-[11px] text-[#667085]">{match.record_name}</p>
                                )}
                                {match.department && (
                                  <p className="mt-[2px] text-[10px] uppercase tracking-[0.05em] text-[#8b9bb5]">{match.department}</p>
                                )}
                              </div>
                            </div>
                            <div
                              className="rounded-full border border-[#d8e3f3] bg-[#f4f8ff] px-3 py-1 text-[10px] font-semibold text-[#355c9a]"
                              title="Confidence"
                            >
                              Confidence: {Math.round(Number(match.confidence || 0) * 100)}%
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-[10px] border border-[#ebf1fb] bg-[#f9fbff] p-3">
                              <h4 className="mb-1 text-[11px] font-bold text-[#243b64]">Matched Rule Summary</h4>
                              <p className="text-[11px] leading-relaxed text-[#475569]">{match.matched_rule_summary || 'No summary available'}</p>
                            </div>

                            <div className="rounded-[10px] border border-[#ebf1fb] bg-[#f9fbff] p-3">
                              <h4 className="mb-1 text-[11px] font-bold text-[#243b64]">Why This Was Selected</h4>
                              <p className="text-[11px] leading-relaxed text-[#475569]">{match.why_selected || 'No explanation available'}</p>
                            </div>

                            <div className="rounded-[10px] border border-[#ebf1fb] bg-[#f9fbff] p-3">
                              <h4 className="mb-1 text-[11px] font-bold text-[#243b64]">Key Evidence</h4>
                              {Array.isArray(match.evidence) && match.evidence.length > 0 ? (
                                <ul className="space-y-1">
                                  {match.evidence.map((item, evidenceIndex) => (
                                    <li key={evidenceIndex} className="text-[11px] leading-relaxed text-[#475569]">• {String(item)}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-[11px] text-[#94a3b8]">No evidence available</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
