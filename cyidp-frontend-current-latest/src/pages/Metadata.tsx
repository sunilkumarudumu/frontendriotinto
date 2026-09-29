import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { getDocuments } from '../api/client'
import { useJob } from '../context/JobContext'
import { useUser } from '../context/UserContext'
import xlsxIcon from '../assets/xlsx-icon.svg'
import * as XLSX from 'xlsx'
import { canUserAccessDocument } from '../utils/duplicateAssignments'

type DocDetails = {
  jobId: string
  reportId: string
  originalFileName: string
  originalFilePath: string
  documentStatus: string
  fileConversion: string
  fileExtensions: string
  duplicateFiles: string
  duplicateClassification: string
  asset: string
  fileName: string
  documentRetain: string
  creationDate: string
  rdsCode: string
  confidenceScore: string
  reviewYear: string
  folder: string
  subFolder: string
  authorCompany: string
  confidential: string
  boxId: string
  discipline: string
  dataType: string
  trigger: string
  library: string
  destinationReply: string
  smeReview: string
}

type DocRow = {
  id: number
  details: DocDetails
}

type OptionalColumnKey =
  | 'originalFileName'
  | 'originalFilePath'
  | 'documentStatus'
  | 'fileConversion'
  | 'fileExtensions'
  | 'duplicateFiles'
  | 'duplicateClassification'
  | 'asset'
  | 'fileName'
  | 'documentRetain'
  | 'creationDate'
  | 'rdsCode'
  | 'confidenceScore'
  | 'reviewYear'
  | 'folder'
  | 'subFolder'
  | 'authorCompany'
  | 'confidential'
  | 'boxId'
  | 'discipline'
  | 'dataType'
  | 'trigger'
  | 'library'
  | 'destinationReply'
  | 'smeReview'

const OPTIONAL_COLUMNS: Array<{ key: OptionalColumnKey; label: string; value: (doc: DocRow) => string }> = [
  { key: 'originalFileName', label: 'Original FileName', value: (doc) => doc.details.originalFileName },
  { key: 'originalFilePath', label: 'Original FilePath', value: (doc) => doc.details.originalFilePath },
  { key: 'documentStatus', label: 'Document status', value: (doc) => doc.details.documentStatus },
  { key: 'fileConversion', label: 'File Conversion', value: (doc) => doc.details.fileConversion },
  { key: 'fileExtensions', label: 'File extensions', value: (doc) => doc.details.fileExtensions },
  { key: 'duplicateFiles', label: 'Duplicate files', value: (doc) => doc.details.duplicateFiles },
  { key: 'duplicateClassification', label: 'Duplicate Classification', value: (doc) => doc.details.duplicateClassification },
  { key: 'asset', label: 'Asset', value: (doc) => doc.details.asset },
  { key: 'fileName', label: 'File Name', value: (doc) => doc.details.fileName },
  { key: 'documentRetain', label: 'Document Retain', value: (doc) => doc.details.documentRetain },
  { key: 'creationDate', label: 'Creation Date', value: (doc) => doc.details.creationDate },
  { key: 'rdsCode', label: 'RDS Code', value: (doc) => doc.details.rdsCode },
  { key: 'confidenceScore', label: 'Confidence score', value: (doc) => doc.details.confidenceScore },
  { key: 'reviewYear', label: 'Review Year', value: (doc) => doc.details.reviewYear },
  { key: 'folder', label: 'Folder', value: (doc) => doc.details.folder },
  { key: 'subFolder', label: 'Subfolder', value: (doc) => doc.details.subFolder },
  { key: 'authorCompany', label: 'Author/Company', value: (doc) => doc.details.authorCompany },
  { key: 'confidential', label: 'Confidential', value: (doc) => doc.details.confidential },
  { key: 'boxId', label: 'Box ID', value: (doc) => doc.details.boxId },
  { key: 'discipline', label: 'Discipline', value: (doc) => doc.details.discipline },
  { key: 'dataType', label: 'Data Type', value: (doc) => doc.details.dataType },
  { key: 'trigger', label: 'trigger', value: (doc) => doc.details.trigger },
  { key: 'library', label: 'Library', value: (doc) => doc.details.library },
  { key: 'destinationReply', label: 'Destination Replied', value: (doc) => doc.details.destinationReply },
  { key: 'smeReview', label: 'SME review', value: (doc) => doc.details.smeReview },
]

function formatFileConversion(value: unknown, extension?: unknown): string {
  const text = String(value ?? '').trim()
  const upper = text.toUpperCase()
  if (upper === 'FAILED') {
    return 'FAILED'
  }
  if (upper === 'YES' || upper === 'NO') {
    return upper
  }

  const extensionText = String(extension ?? '').trim().toLowerCase().replace(/^\./, '')
  if (extensionText) {
    return extensionText === 'pdf' ? 'NO' : 'YES'
  }

  if (!text || upper === 'UNIQUE' || text.toLowerCase().startsWith('converted to')) {
    return 'N/A'
  }

  return text
}

function normalizeDocumentStatus(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function TruncatedCell({ value }: { value: string }) {
  return (
    <td className="border-b border-[#eeeeee] px-[8px] py-[6px] align-top">
      <div className="whitespace-normal break-all text-[12px] leading-5 text-[#303030]">{value || 'N/A'}</div>
    </td>
  )
}

export default function Metadata() {
  const [searchParams] = useSearchParams()
  const { jobId: contextJobId } = useJob()
  const { user } = useUser()
  const jobId = searchParams.get('job_id') || contextJobId
  const [documents, setDocuments] = useState<DocRow[]>([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedDocumentStatus, setSelectedDocumentStatus] = useState('all')
  const [isLoading, setIsLoading] = useState(false)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [selectedOptionalColumns, setSelectedOptionalColumns] = useState<OptionalColumnKey[]>([
    'originalFileName',
    'originalFilePath',
    'documentStatus',
    'duplicateFiles',
  ])
  const addColumnsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (addColumnsRef.current && !addColumnsRef.current.contains(event.target as Node)) {
        setColumnMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  useEffect(() => {
    async function loadDocuments() {
      setIsLoading(true)
      try {
        const hasDateFilter = Boolean(fromDate || toDate)
        if (!hasDateFilter && !jobId) {
          setDocuments([])
          setIsLoading(false)
          return
        }
        const docs = await getDocuments(jobId || '', {
          view: 'metadata',
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        })

        const docRows: DocRow[] = docs.map((doc, index) => ({
          id: index + 1,
          details: {
            jobId: (doc as any).job_id || jobId || 'N/A',
            reportId: (doc as any).document_id || 'N/A',
            originalFileName: (doc as any).original_file_name || (doc as any).file_name || 'N/A',
            originalFilePath: (doc as any).original_file_path || (doc as any).file_path || 'N/A',
            documentStatus: (doc as any).document_status || (doc as any).status || 'N/A',
            fileConversion: formatFileConversion(
              (doc as any).file_conversion,
              (doc as any).file_extensions || (doc as any).file_ext,
            ),
            fileExtensions: (doc as any).file_extensions || (doc as any).file_ext || 'N/A',
            duplicateFiles: (doc as any).duplicate_files || 'N/A',
            duplicateClassification: (doc as any).duplicate_classification || 'N/A',
            asset: (doc as any).asset || 'N/A',
            fileName: (doc as any).file_name || 'N/A',
            documentRetain: (doc as any).document_retain || (doc as any).document_retention || 'N/A',
            creationDate: (doc as any).date || (doc as any).creation_date || 'N/A',
            rdsCode: (doc as any).rds_code || (doc as any).record_code || 'N/A',
            confidenceScore: (doc as any).score ? `${Math.round(Number((doc as any).score) * 100)}%` : '0%',
            reviewYear: (doc as any).review_year || (doc as any).retention?.review_year || 'N/A',
            folder: (doc as any).folder || 'N/A',
            subFolder: (doc as any).sub_folder || (doc as any).subfolder || 'N/A',
            authorCompany: (doc as any).author_company || 'N/A',
            confidential: (doc as any).confidential || (doc as any).confidentiality || 'N/A',
            boxId: (doc as any).box_id || 'N/A',
            discipline: (doc as any).discipline || 'N/A',
            dataType: (doc as any).data_type || 'N/A',
            trigger: (doc as any).trigger || (doc as any).retention_trigger || (doc as any).retention?.trigger || 'N/A',
            library: (doc as any).library || 'N/A',
            destinationReply: (doc as any).destination_reply || (doc as any).destination_replied || 'N/A',
            smeReview: (doc as any).sme_review || (doc as any).sme_reviewed || 'N/A',
          },
        }))

        const visibleRows =
          user?.role === 'admin'
            ? docRows
            : docRows.filter((row) =>
                canUserAccessDocument(
                  String(row.details.jobId || ''),
                  String(row.details.reportId || ''),
                  user?.username,
                  user?.role,
                ),
              )

        setDocuments(visibleRows)
      } catch {
        // Keep previous state if request fails
      } finally {
        setIsLoading(false)
      }
    }

    loadDocuments()
  }, [jobId, fromDate, toDate, user])

  const documentStatusOptionMap = new Map<string, string>()
  documents.forEach((doc) => {
    const rawStatus = String(doc.details.documentStatus || '').replace(/\s+/g, ' ').trim()
    const normalized = normalizeDocumentStatus(rawStatus)
    if (!normalized) return
    if (!documentStatusOptionMap.has(normalized)) {
      documentStatusOptionMap.set(normalized, rawStatus)
    }
  })

  const documentStatusOptions = Array.from(documentStatusOptionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const filteredDocuments = documents.filter((doc) => {
    if (selectedDocumentStatus === 'all') return true
    return normalizeDocumentStatus(doc.details.documentStatus) === selectedDocumentStatus
  })

  const handleDownloadDocuments = () => {
    const rows = filteredDocuments.map((doc) =>
      Object.fromEntries(
        OPTIONAL_COLUMNS.filter((column) => selectedOptionalColumns.includes(column.key)).map((column) => [
          column.label,
          column.value(doc) || 'N/A',
        ]),
      )
    )

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Metadata')
    XLSX.writeFile(workbook, `metadata-${jobId || 'all'}.xlsx`)
  }

  return (
    <Layout
      title="Metadata"
      activeNavId="metadata"
      breadcrumbLabel="Metadata"
      breadcrumbItems={[
        { label: 'Metadata', href: '#metadata', current: true },
      ]}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-[10px] p-[16px]">
        <div className="flex min-h-[54px] shrink-0 flex-wrap items-center gap-[10px] rounded-[6px] border border-[#d9dfe8] bg-white px-[8px] py-[8px]">
          <span className="text-[12px] text-[#666]">From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value)
            }}
            className="h-[28px] w-[132px] rounded-[3px] border border-[#d9d9d9] px-[8px] text-[12px] text-[#303030] outline-none"
          />

          <span className="text-[12px] text-[#666]">To</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value)
            }}
            className="h-[28px] w-[132px] rounded-[3px] border border-[#d9d9d9] px-[8px] text-[12px] text-[#303030] outline-none"
          />

          <span className="text-[12px] text-[#666]">Document status</span>
          <select
            value={selectedDocumentStatus}
            onChange={(event) => setSelectedDocumentStatus(event.target.value)}
            className="h-[28px] min-w-[160px] rounded-[3px] border border-[#d9d9d9] bg-white px-[8px] text-[12px] text-[#303030] outline-none"
          >
            <option value="all">All</option>
            {documentStatusOptions.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-[8px]">
            <button
              type="button"
              onClick={handleDownloadDocuments}
              className="inline-flex h-[28px] items-center gap-1 rounded-[4px] bg-[#4f5fbf] px-[14px] text-[12px] font-semibold text-white transition-colors hover:bg-[#4452a6]"
            >
              Export
              <img src={xlsxIcon} alt="XLSX" className="h-[10px] w-[10px]" draggable={false} />
            </button>
            <div ref={addColumnsRef} className="relative">
              <button
                type="button"
                onClick={() => setColumnMenuOpen((current) => !current)}
                className="inline-flex h-[32px] items-center gap-2 rounded-[4px] border border-[#c7d3ef] bg-white px-[14px] text-[12px] font-semibold text-[#2f4aa0] transition-colors hover:bg-[#f5f8ff]"
              >
                <span className="leading-none">+</span>
                <span className="text-[12px] leading-none">Add Columns</span>
              </button>

              {columnMenuOpen && (
                <div className="absolute right-0 top-[38px] z-20 w-[520px] max-w-[85vw] rounded-[6px] border border-[#c7d3ef] bg-white p-[10px] shadow-[0_6px_18px_rgba(0,0,0,0.12)]">
                  <div className="grid max-h-[460px] grid-cols-2 gap-1 overflow-y-auto pr-1">
                    {OPTIONAL_COLUMNS.map((column) => {
                      const checked = selectedOptionalColumns.includes(column.key)
                      return (
                        <label
                          key={column.key}
                          className="flex min-w-0 cursor-pointer items-start gap-2 rounded-[4px] px-[6px] py-[5px] text-[12px] text-[#1f2d5a] hover:bg-[#f5f8ff]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedOptionalColumns((current) =>
                                checked
                                  ? current.filter((key) => key !== column.key)
                                  : [...current, column.key],
                              )
                            }}
                            className="mt-[2px] h-[14px] w-[14px] shrink-0"
                          />
                          <span className="whitespace-normal break-words leading-4">{column.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[12px] font-semibold text-[#5e738f]">Loading documents...</p>
          </div>
        ) : (
          <div className="min-h-[375px] overflow-auto rounded-[6px] border border-[#d2d8e3] bg-white p-[8px]">
            <table className="w-full table-auto border-collapse text-left">
              <thead className="bg-[#f6f7fb]">
                <tr className="text-[10px] font-semibold text-[#69718f]">
                  {OPTIONAL_COLUMNS.filter((column) => selectedOptionalColumns.includes(column.key)).map(
                    (column) => (
                      <th key={column.key} className="border-b border-[#d7dff0] px-[8px] py-[9px] align-top whitespace-normal break-words leading-4">
                        {column.label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredDocuments.length === 0 && (
                  <tr>
                    <td
                      colSpan={selectedOptionalColumns.length || 1}
                      className="px-[8px] py-[24px] text-center text-[11px] text-[#8b8b8b]"
                    >
                      No documents found
                    </td>
                  </tr>
                )}
                {filteredDocuments.map((doc, index) => (
                  <tr key={doc.id} className={`${index % 2 === 1 ? 'bg-[#f8f9fc]' : 'bg-white'} hover:bg-[#f3f6fc]`}>
                    {OPTIONAL_COLUMNS.filter((column) => selectedOptionalColumns.includes(column.key)).map(
                      (column) => (
                        <TruncatedCell key={`${doc.id}-${column.key}`} value={column.value(doc)} />
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
