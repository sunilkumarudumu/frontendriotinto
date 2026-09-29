import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  getAssetClassification,
  getClassification,
  getDocumentDetails,
  getJobStatus,
  getUniqueDocumentFileUrl,
  updateClassification,
  type ClassificationUpdate,
  type JobStatus,
  type TopMatch,
} from '../api/client'
import ClassificationMetadataPanel, {
  type ClassificationReviewValues,
  type ReviewLibraryMode,
} from '../components/ClassificationMetadataPanel'
import MetadataSummaryBar from '../components/MetadataSummaryBar'
import { useJob } from '../context/JobContext'
import { useUser } from '../context/UserContext'
import { buildDocumentMetadataView, type DocumentMetadataView } from '../utils/documentMetadata'
import { isProjectLibrary, subFoldersFor } from '../utils/classificationOptions'
import { canUserAccessDocument } from '../utils/duplicateAssignments'

function resolveLibraryMode(
  job: JobStatus | null,
  library?: string | null,
): ReviewLibraryMode {
  return isProjectLibrary(library ?? job?.library) ? 'Project' : 'Archive'
}

function buildClassificationUpdates(
  values: ClassificationReviewValues,
  libraryMode: ReviewLibraryMode,
): ClassificationUpdate {
  const updates: ClassificationUpdate = {
    classification_status: values.classificationStatus,
    selected_rds_code: values.selectedRdsCode,
    folder: values.folder,
    sub_folder: values.subFolder,
    subject: values.subject,
    date: values.date,
  }

  if (libraryMode === 'Project') {
    updates.business_function = values.businessFunction
    updates.content_type = values.contentType
  } else {
    updates.data_type = values.dataType
    updates.discipline = values.discipline
    updates.author_company = values.authorCompany
  }

  return updates
}

type ClassificationCard = {
  id: string
  label: string
  percentage: number
  percentageColor: string
  recordCode?: string
  recordName?: string
  department?: string
  matchedRuleSummary?: string
  topMatch?: TopMatch
}

function ReasonForSelectionModal({ match, isOpen, onClose, allMatches }: { match: TopMatch | null; isOpen: boolean; onClose: () => void; allMatches?: TopMatch[] }) {
  if (!match) return null
  if (!isOpen) return null

  const RANK_COLORS = ['#06A77D', '#F2994A', '#EF2B3B']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="flex flex-col max-w-2xl w-full max-h-[90vh] rounded-[8px] bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#d0d0d0] px-6 py-4 shrink-0">
          <h2 className="font-ui text-[16px] font-bold text-[#1f1f1f]">Reason for Selection</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[32px] w-[32px] items-center justify-center rounded-[4px] border-0 bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 cursor-pointer"
            aria-label="Close modal"
          >
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* All 3 Matched Records with Details */}
          {allMatches && allMatches.length > 0 && (
            <div className="space-y-6">
              {allMatches.slice(0, 3).map((m, idx) => (
                <div key={idx} className="pb-4 border-b border-gray-200 last:border-b-0">
                  {/* Record Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className="flex items-center justify-center h-[28px] w-[28px] rounded-full flex-shrink-0 text-white font-ui text-[11px] font-semibold"
                      style={{ backgroundColor: RANK_COLORS[idx] ?? RANK_COLORS[0] }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-ui text-[12px] font-semibold text-[#1f1f1f]">{m.record_code}</p>
                      <p className="font-ui text-[11px] text-[#666666]">{m.record_name}</p>
                      <p className="font-ui text-[10px] text-[#999999] mt-1">
                        Confidence: {Math.round(m.confidence * 100)}%
                      </p>
                    </div>
                  </div>

                  {/* Matched Rule Summary */}
                  <div className="mb-3">
                    <h4 className="font-ui text-[11px] font-bold text-[#1f1f1f] mb-1.5">Matched Rule Summary</h4>
                    <p className="font-ui text-[10px] text-[#555555] leading-relaxed">
                      {m.matched_rule_summary || 'No summary available'}
                    </p>
                  </div>

                  {/* Why This Was Selected */}
                  <div className="mb-3">
                    <h4 className="font-ui text-[11px] font-bold text-[#1f1f1f] mb-1.5">Why This Was Selected</h4>
                    <p className="font-ui text-[10px] text-[#555555] leading-relaxed">
                      {m.why_selected || 'No explanation available'}
                    </p>
                  </div>

                  {/* Key Evidence */}
                  <div>
                    <h4 className="font-ui text-[11px] font-bold text-[#1f1f1f] mb-1.5">Key Evidence</h4>
                    {m.evidence && Array.isArray(m.evidence) && m.evidence.length > 0 ? (
                      <ul className="space-y-1">
                        {m.evidence.map((item, evidenceIdx) => (
                          <li key={evidenceIdx} className="flex gap-2">
                            <span className="font-ui text-[10px] text-[#666666] flex-shrink-0 mt-0.5">•</span>
                            <span className="font-ui text-[10px] text-[#555555]">{String(item)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="font-ui text-[10px] text-[#999999]">No evidence available</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#d0d0d0] px-6 py-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-[4px] bg-cy-teal text-white px-4 py-2 font-ui text-[12px] font-semibold transition-colors hover:bg-cy-teal-hover cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Badge colour is driven by match rank: 1st green, 2nd yellow, 3rd red.
const RANK_COLORS = ['#06A77D', '#F2994A', '#EF2B3B']

function CompactClassificationCard({
  topMatch,
  onReasonClick,
  allCards,
  selectedRdsCode,
  onRdsSelect,
}: {
  card: ClassificationCard
  topMatch?: TopMatch
  onReasonClick?: (match: TopMatch) => void
  allCards?: ClassificationCard[]
  selectedRdsCode?: string
  onRdsSelect?: (recordCode: string) => void
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const selectedRecordCode = selectedRdsCode ?? topMatch?.record_code ?? allCards?.[0]?.recordCode ?? ''
  const isLocked = selectedIndex !== null

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-[#d0d0d0] bg-white p-3">
      <div className="flex items-start justify-between">
        <span className="font-ui text-[11px] font-normal text-[#999999]">State</span>
        {topMatch && onReasonClick && (
          <button
            type="button"
            onClick={() => onReasonClick(topMatch)}
            className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-white border border-[#999999] text-[#666666] hover:bg-[#f5f5f5] transition-colors cursor-pointer font-bold text-[11px] leading-none"
            aria-label="View reason for selection"
          >
            i
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedRecordCode}
          onChange={(event) => {
            onRdsSelect?.(event.target.value)
            setSelectedIndex(null)
          }}
          disabled={isLocked}
          className="flex-1 rounded-[4px] border border-[#d0d0d0] bg-white px-2 py-1.5 font-ui text-[11px] text-[#999999] focus:border-cy-teal focus:outline-none disabled:opacity-50"
        >
          <option value="">Change the section Name</option>
          {allCards?.filter((c) => c.recordCode).map((c, idx) => (
            <option key={`${c.id}-${idx}`} value={c.recordCode}>{c.recordCode}</option>
          ))}
        </select>
        <select
          disabled={isLocked}
          className="w-[60px] rounded-[4px] border border-[#d0d0d0] bg-white px-2 py-1.5 font-ui text-[11px] text-[#666666] focus:border-cy-teal focus:outline-none disabled:opacity-50"
        >
          <option value="0">0</option>
        </select>
        <select
          disabled={isLocked}
          className="w-[60px] rounded-[4px] border border-[#d0d0d0] bg-white px-2 py-1.5 font-ui text-[11px] text-[#666666] focus:border-cy-teal focus:outline-none disabled:opacity-50"
        >
          <option value="10">10</option>
        </select>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {allCards?.map((c, idx) => {
          if (!c.recordCode) return null
          const isSelected = selectedIndex === idx
          const isDisabled = isLocked && !isSelected

          return (
            <button
              key={c.id}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                const nextValue = c.recordCode || ''
                setSelectedIndex(isSelected ? null : idx)
                onRdsSelect?.(nextValue)
              }}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-white transition-opacity cursor-pointer disabled:cursor-not-allowed"
              style={{
                backgroundColor: RANK_COLORS[idx] ?? RANK_COLORS[0],
                opacity: isDisabled ? 0.4 : 1,
              }}
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              <span className="font-ui text-[11px] font-semibold">{c.recordCode}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function IntelligenceClassification() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { jobId } = useJob()
  const { user } = useUser()
  
  const isEditMode = searchParams.get('edit') === 'true'
  const queryJobId = searchParams.get('job_id')
  const queryDocId = searchParams.get('doc_id')
  const currentJobId = queryJobId || jobId
  const documentId = queryDocId

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false)
  const [classifications, setClassifications] = useState<ClassificationCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedReason, setSelectedReason] = useState<TopMatch | null>(null)
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [previewError, setPreviewError] = useState<string>('')
  const [documentFileName, setDocumentFileName] = useState<string>('')
  const [metadataView, setMetadataView] = useState<DocumentMetadataView | null>(null)
  const [reviewValues, setReviewValues] = useState<ClassificationReviewValues>({
    folder: '',
    subFolder: '',
    dataType: '',
    discipline: '',
    businessFunction: '',
    contentType: '',
    subject: '',
    date: '',
    authorCompany: '',
    classificationStatus: '',
    selectedRdsCode: '',
  })
  const [topMatches, setTopMatches] = useState<TopMatch[]>([])
  const [libraryMode, setLibraryMode] = useState<ReviewLibraryMode>('Archive')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const handleReviewChange = (field: keyof ClassificationReviewValues, value: string) => {
    setReviewValues((current) => {
      const next = { ...current, [field]: value }
      if (field === 'folder' && !subFoldersFor(value).includes(current.subFolder)) {
        next.subFolder = ''
      }
      return next
    })
  }

  useEffect(() => {
    // Load classifications from API for both edit and view modes
    if (!currentJobId || !documentId) {
      navigate('/list-of-documents')
      return
    }

    if (
      user?.role === 'user' &&
      !canUserAccessDocument(currentJobId, documentId, user.username, user.role)
    ) {
      navigate(`/list-of-documents?job_id=${encodeURIComponent(currentJobId)}`, { replace: true })
      return
    }

    async function loadClassification() {
      try {
        setIsLoading(true)
        setError('')
        const [result, details, assetClassification, jobStatus] = await Promise.all([
          getClassification(currentJobId as string, documentId as string),
          getDocumentDetails(currentJobId as string, documentId as string).catch(() => null),
          getAssetClassification(currentJobId as string, documentId as string).catch(() => null),
          getJobStatus(currentJobId as string).catch(() => null),
        ])

        setLibraryMode(resolveLibraryMode(jobStatus, result.library ?? details?.library))

        const view = buildDocumentMetadataView({
          details,
          classification: result,
          assetClassification,
          jobBatch: jobStatus?.batch,
          jobLibrary: jobStatus?.library ?? result.library ?? details?.library,
        })
        setMetadataView(view)
        setTopMatches(result.top_matches || [])
        setReviewValues({
          folder: result.folder || '',
          subFolder: result.sub_folder || '',
          dataType: result.data_type || '',
          discipline: result.discipline || '',
          businessFunction: result.business_function || '',
          contentType: result.content_type || '',
          subject: result.subject || '',
          date: result.date || '',
          authorCompany: result.author_company || '',
          classificationStatus: result.classification_status || '',
          selectedRdsCode: result.top_matches?.[0]?.record_code || '',
        })
        setDocumentFileName(details?.file_name || result.filename || 'Document')
        
        // Map top_matches to classification cards (take first 3)
        const cards: ClassificationCard[] = (result.top_matches || []).slice(0, 3).map((match, index) => ({
          id: `match-${index}`,
          label: match.record_name || 'Unknown',
          percentage: Math.round(match.confidence * 100),
          percentageColor: match.confidence >= 0.8 ? '#06A77D' : match.confidence >= 0.5 ? '#F2994A' : '#999999',
          recordCode: match.record_code,
          recordName: match.record_name,
          department: match.department,
          matchedRuleSummary: match.matched_rule_summary,
          topMatch: match,
        }))
        
        setClassifications(cards)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load classification')
        setClassifications([])
        setMetadataView(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadClassification()
  }, [currentJobId, documentId, navigate, user])

  const handleReasonClick = (match: TopMatch) => {
    setSelectedReason(match)
    setIsReasonModalOpen(true)
  }

  const goToDocumentList = () => {
    if (currentJobId) {
      navigate(`/list-of-documents?job_id=${currentJobId}`)
      return
    }
    navigate('/list-of-documents')
  }

  const handleViewMetadata = () => {
    if (!currentJobId || !documentId) return

    const params = new URLSearchParams({
      job_id: String(currentJobId),
      doc_id: String(documentId),
    })

    if (documentFileName) {
      params.set('file_name', documentFileName)
    }

    navigate(`/metadata?${params.toString()}`)
  }

  const handleSaveClassification = async () => {
    if (!currentJobId || !documentId) return

    setIsSaving(true)
    setSaveError('')

    try {
      const updated = await updateClassification(
        currentJobId,
        documentId,
        buildClassificationUpdates(reviewValues, libraryMode),
      )
      setTopMatches(updated.top_matches || [])
      setReviewValues({
        folder: updated.folder || '',
        subFolder: updated.sub_folder || '',
        dataType: updated.data_type || '',
        discipline: updated.discipline || '',
        businessFunction: updated.business_function || '',
        contentType: updated.content_type || '',
        subject: updated.subject || '',
        date: updated.date || '',
        authorCompany: updated.author_company || '',
        classificationStatus: updated.classification_status || '',
        selectedRdsCode: updated.top_matches?.[0]?.record_code || '',
      })
      const savedCards: ClassificationCard[] = (updated.top_matches || []).slice(0, 3).map((match, index) => ({
        id: `match-${index}`,
        label: match.record_name || 'Unknown',
        percentage: Math.round(match.confidence * 100),
        percentageColor: match.confidence >= 0.8 ? '#06A77D' : match.confidence >= 0.5 ? '#F2994A' : '#999999',
        recordCode: match.record_code,
        recordName: match.record_name,
        department: match.department,
        matchedRuleSummary: match.matched_rule_summary,
        topMatch: match,
      }))
      setClassifications(savedCards)
      setMetadataView(buildDocumentMetadataView({ classification: updated }))
      navigate(`/list-of-documents?job_id=${currentJobId}`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save classification')
    } finally {
      setIsSaving(false)
    }
  }

  // Load the document preview URL and filename when documentId changes
  useEffect(() => {
    if (!currentJobId || !documentId) {
      setPreviewUrl('')
      setPreviewError('')
      setDocumentFileName('')
      return
    }
    
    try {
      // Use unique document URL to pull from duplicatefiles_advanced/unique_docs
      const url = getUniqueDocumentFileUrl(currentJobId as string, documentId as string)
      setPreviewUrl(url)
      setPreviewError('')
    } catch (err) {
      setPreviewError('Unable to load document preview')
      setPreviewUrl('')
    }
  }, [currentJobId, documentId])

  if (isEditMode) {
    return (
      <Layout
        title="Intelligence Classification"
        activeNavId="intelligence"
        breadcrumbLabel="Intelligence Classification"
        breadcrumbItems={[
          { label: 'Home', href: '#home', icon: 'home' },
          { label: 'Intelligence Classification', href: '#classification', icon: 'folder', current: true },
        ]}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 gap-3">
          {/* Document Header with Back Button */}
          <div className="flex items-center justify-between gap-3 rounded-[6px] border border-[#d0d0d0] bg-white px-4 py-2 shrink-0">
            <div className="flex flex-1 items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={goToDocumentList}
                className="flex h-[24px] w-[24px] items-center justify-center rounded hover:bg-[#f5f5f5] transition-colors"
                aria-label="Go back to list of documents"
              >
                <svg className="h-[16px] w-[16px] text-[#666666]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
              </button>
              <div className="flex items-center justify-center h-[24px] w-[24px] border border-[#0d66cc] rounded-[4px] shrink-0">
                <svg className="h-[20px] w-[20px] text-[#0d66cc]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" />
                </svg>
              </div>
              <span className="truncate font-ui text-[13px] font-bold text-[#1f1f1f]">{documentFileName || 'Document'}</span>
            </div>
            <button
              type="button"
              onClick={handleViewMetadata}
              className="inline-flex shrink-0 items-center gap-2 rounded-[4px] border border-[#0d66cc] bg-white px-3 py-2 font-ui text-[11px] font-semibold text-[#0d66cc] transition-colors hover:bg-[#f2f7fd] cursor-pointer"
            >
              <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              <span>View Metadata</span>
            </button>
          </div>

          <MetadataSummaryBar view={metadataView} />

          {/* Classification card: one panel with all top-3 RDS matches */}
          <div className="grid shrink-0 max-w-md grid-cols-1 items-start gap-2">
            {isLoading ? (
              <div className="text-center py-4">
                <p className="font-ui text-[12px] text-[#666666]">Loading classifications...</p>
              </div>
            ) : error ? (
              <div className="text-center py-4">
                <p className="font-ui text-[12px] text-[#E23744]">Error: {error}</p>
              </div>
            ) : classifications.length === 0 ? (
              <div className="text-center py-4">
                <p className="font-ui text-[12px] text-[#999999]">No classifications available</p>
              </div>
            ) : (
              <CompactClassificationCard
                card={classifications[0]}
                topMatch={classifications[0].topMatch}
                onReasonClick={handleReasonClick}
                allCards={classifications}
                selectedRdsCode={reviewValues.selectedRdsCode}
                onRdsSelect={(recordCode) => handleReviewChange('selectedRdsCode', recordCode)}
              />
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
            {/* Document Section */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d0d0d0] bg-white">
              {/* Document Header */}
              <div className="flex h-[42px] shrink-0 items-center justify-between px-4 gap-3 bg-cy-teal text-white">
                <span className="font-ui text-[13px] font-bold truncate">{documentFileName || 'Document'}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setIsModalOpen(true)} className="flex h-[24px] w-[24px] items-center justify-center rounded hover:bg-white/20" aria-label="Fullscreen">
                      <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                      </svg>
                    </button>
                </div>
              </div>

              {/* Document Content */}
              <div className="flex-1 min-h-0 overflow-hidden bg-white border-t border-[#e0e0e0]">
                {previewError ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <p className="font-ui text-[13px] text-[#E23744]">{previewError}</p>
                  </div>
                ) : !previewUrl ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <p className="font-ui text-[13px] text-[#666666]">Loading document preview...</p>
                  </div>
                ) : (
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <p>PDF viewer not available. Please download the PDF to view it.</p>
                  </object>
                )}
              </div>
            </div>

            {/* Right Sidebar - Process Details */}
            <div className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-[6px] border border-[#d0d0d0] bg-white">
              {/* Header */}
              <div className="h-[42px] shrink-0 flex items-center px-4 bg-cy-teal text-white">
                <h3 className="font-ui text-[13px] font-bold">Process Details</h3>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                <ClassificationMetadataPanel
                  values={reviewValues}
                  topMatches={topMatches}
                  readOnly={false}
                  libraryMode={libraryMode}
                  onChange={handleReviewChange}
                  onRdsSelect={(recordCode) => handleReviewChange('selectedRdsCode', recordCode)}
                />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center justify-end gap-3 shrink-0">
            {saveError && (
              <p className="font-ui text-[11px] text-[#E23744]">{saveError}</p>
            )}
            <button
              type="button"
              onClick={handleSaveClassification}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-[4px] bg-cy-teal px-4 py-2 font-ui text-[11px] font-semibold text-white transition-colors hover:bg-cy-teal-hover cursor-pointer disabled:opacity-60"
            >
              <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              <span>{isSaving ? 'Saving...' : 'Save & Return'}</span>
            </button>
          </div>

        </div>

        {/* PDF Preview Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[8px] w-full h-full max-w-6xl max-h-[90vh] flex flex-col shadow-lg">
              {/* Modal Header */}
              <div className="flex h-[50px] shrink-0 items-center justify-between px-6 gap-3 bg-cy-teal text-white">
                <span className="font-ui text-[15px] font-bold truncate">{documentFileName || 'Document'}</span>
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsModalOpen(false)} className="flex h-[24px] w-[24px] items-center justify-center rounded hover:bg-white/20" aria-label="Close">
                      <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 min-h-0 overflow-hidden bg-white border-t border-[#e0e0e0]">
                {previewError ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <p className="font-ui text-[13px] text-[#E23744]">{previewError}</p>
                  </div>
                ) : !previewUrl ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <p className="font-ui text-[13px] text-[#666666]">Loading document preview...</p>
                  </div>
                ) : (
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <p>PDF viewer not available. Please download the PDF to view it.</p>
                  </object>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add New Block Modal */}
        {isAddBlockModalOpen && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[8px] w-full max-w-6xl max-h-[90vh] flex flex-col shadow-lg overflow-hidden">
              {/* Modal Header */}
              <div className="flex h-[50px] shrink-0 items-center justify-between px-6 gap-3 bg-cy-teal text-white">
                <span className="font-ui text-[13px] font-bold truncate">{documentFileName || 'Document'}</span>
                <button
                  onClick={() => setIsAddBlockModalOpen(false)}
                  className="flex h-[24px] w-[24px] items-center justify-center rounded hover:bg-white/20"
                  aria-label="Close"
                >
                  <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>

              {/* Modal Content: compact form matching reference image */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="rounded-[6px] border border-dashed border-[#d8dbe0] bg-[#fbfbfb] p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid grid-cols-4 gap-3 flex-1">
                      <div className="flex flex-col gap-1">
                        <label className="font-ui text-[11px] font-bold text-[#1f1f1f]">Section Name</label>
                        <select className="rounded-[4px] border border-[#e6e6e6] bg-white px-2 py-1.5 font-ui text-[11px] text-[#999999] focus:border-cy-teal focus:outline-none">
                          <option value="">Select the section Name</option>
                        </select>
                        <span className="font-ui text-[10px] text-[#E23744]">Error Message</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-ui text-[11px] font-bold text-[#1f1f1f]">Page From</label>
                        <select className="rounded-[4px] border border-[#e6e6e6] bg-white px-2 py-1.5 font-ui text-[11px] text-[#999999] focus:border-cy-teal focus:outline-none">
                          <option value="">Please select From Page</option>
                        </select>
                        <span className="font-ui text-[10px] text-[#E23744]">Error Message</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-ui text-[11px] font-bold text-[#1f1f1f]">Page To</label>
                        <select className="rounded-[4px] border border-[#e6e6e6] bg-white px-2 py-1.5 font-ui text-[11px] text-[#999999] focus:border-cy-teal focus:outline-none">
                          <option value="">Please select To Page</option>
                        </select>
                        <span className="font-ui text-[10px] text-[#E23744]">Error Message</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-ui text-[11px] font-bold text-[#1f1f1f]">Result</label>
                        <select className="rounded-[4px] border border-[#e6e6e6] bg-white px-2 py-1.5 font-ui text-[11px] text-[#999999] focus:border-cy-teal focus:outline-none">
                          <option value="">Select the percentage</option>
                        </select>
                        <span className="font-ui text-[10px] text-[#E23744]">Error Message</span>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <button
                        onClick={() => setIsAddBlockModalOpen(false)}
                        className="inline-flex items-center gap-2 rounded-[6px] bg-cy-teal px-3 py-2 font-ui text-[11px] font-semibold text-white transition-colors hover:bg-cy-teal-hover cursor-pointer"
                      >
                        <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                        </svg>
                        Add New Block
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cards Grid inside modal */}
                <div className="grid grid-cols-3 gap-3 mt-6">
                  {[0, 1].map((row) =>
                    classifications.map((card: ClassificationCard) => (
                      <div key={`${card.id}-${row}`} className="flex flex-col gap-3 rounded-[8px] border border-[#d0d0d0] bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-ui text-[10px] font-normal text-[#999999]">{card.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-ui text-[16px] font-bold text-[#1f1f1f]">250 Pages</span>
                              <span className="font-ui text-[12px] font-semibold" style={{ color: card.percentageColor }}>{`+${card.percentage}%`}</span>
                            </div>
                          </div>
                          <button className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[6px] bg-cy-teal text-white hover:bg-cy-teal-hover">
                            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M15 16H9v2h6v-2zm0-8H9v2h6V8zm3-6h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 16H5V8h14v12z" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <select className="flex-1 rounded-[4px] border border-[#d0d0d0] bg-white px-2.5 py-1.5 font-ui text-[11px] text-[#666666] focus:border-cy-teal focus:outline-none">
                            <option>Change the section Name</option>
                          </select>
                          <select className="w-[50px] rounded-[4px] border border-[#d0d0d0] bg-white px-2 py-1.5 font-ui text-[11px] text-[#666666] focus:border-cy-teal focus:outline-none">
                            <option>0</option>
                          </select>
                          <select className="w-[50px] rounded-[4px] border border-[#d0d0d0] bg-white px-2 py-1.5 font-ui text-[11px] text-[#666666] focus:border-cy-teal focus:outline-none">
                            <option>10</option>
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reason for Selection Modal */}
        <ReasonForSelectionModal match={selectedReason} isOpen={isReasonModalOpen} onClose={() => setIsReasonModalOpen(false)} allMatches={classifications.map(c => c.topMatch).filter(Boolean) as TopMatch[]} />
      </Layout>
    )
  }

  return (
    <Layout
      title="Intelligence Classification"
      activeNavId="intelligence"
      breadcrumbLabel="Intelligence Classification"
      breadcrumbItems={[
        { label: 'Home', href: '#home', icon: 'home' },
        { label: 'Intelligence Classification', href: '#classification', icon: 'folder', current: true },
      ]}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 gap-3">
        {/* Document Header */}
        <div className="flex items-center justify-between gap-3 rounded-[6px] border border-[#d0d0d0] bg-white px-6 py-2 shrink-0">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={goToDocumentList}
              className="flex h-[24px] w-[24px] items-center justify-center rounded hover:bg-[#f5f5f5] transition-colors"
              aria-label="Go back to list of documents"
            >
              <svg className="h-[16px] w-[16px] text-[#666666]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
            </button>
            <div className="flex items-center justify-center h-[24px] w-[24px] border border-[#0d66cc] rounded-[4px] shrink-0">
              <svg className="h-[20px] w-[20px] text-[#0d66cc]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" />
              </svg>
            </div>
            <span className="truncate font-ui text-[13px] font-bold text-[#1f1f1f]">{documentFileName || 'Document'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/intelligence-classification?job_id=${currentJobId}&doc_id=${documentId}&edit=true`)}
              className="inline-flex shrink-0 items-center gap-2 rounded-[4px] border border-cy-teal bg-cy-teal px-3 py-2 font-ui text-[11px] font-semibold text-white transition-colors hover:bg-cy-teal-hover cursor-pointer"
            >
              <span>Review & Edit</span>
            </button>
            <button
              type="button"
              onClick={handleViewMetadata}
              className="inline-flex shrink-0 items-center gap-2 rounded-[4px] border border-[#0d66cc] bg-white px-3 py-2 font-ui text-[11px] font-semibold text-[#0d66cc] transition-colors hover:bg-[#f2f7fd] cursor-pointer"
            >
              <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              <span>View Metadata</span>
            </button>
          </div>
        </div>

        <MetadataSummaryBar view={metadataView} />

        {/* Classification card: one panel with all top-3 RDS matches */}
        <div className="grid shrink-0 max-w-md grid-cols-1 items-start gap-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <svg className="h-[24px] w-[24px] text-blue-600 animate-spin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" opacity="0.3" />
              </svg>
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <p className="font-ui text-[12px] font-normal text-[#c62828]">{error}</p>
            </div>
          ) : classifications.length === 0 ? (
            <div className="text-center py-4">
              <p className="font-ui text-[12px] font-normal text-[#999999]">No classifications available</p>
            </div>
          ) : (
            <CompactClassificationCard
              card={classifications[0]}
              topMatch={classifications[0].topMatch}
              onReasonClick={handleReasonClick}
              allCards={classifications}
            />
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
          {/* Document Section */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d0d0d0] bg-white">
            {/* Document Header */}
            <div className="flex h-[42px] shrink-0 items-center justify-between px-4 gap-3 bg-cy-teal text-white">
              <span className="font-ui text-[13px] font-bold truncate">{documentFileName || 'Document'}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setIsModalOpen(true)} className="flex h-[24px] w-[24px] items-center justify-center rounded hover:bg-white/20" aria-label="Fullscreen">
                  <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="flex-1 min-h-0 overflow-hidden bg-white border-t border-[#e0e0e0]">
              {previewError ? (
                <div className="flex items-center justify-center w-full h-full">
                  <p className="font-ui text-[13px] text-[#E23744]">{previewError}</p>
                </div>
              ) : !previewUrl ? (
                <div className="flex items-center justify-center w-full h-full">
                  <p className="font-ui text-[13px] text-[#666666]">Loading document preview...</p>
                </div>
              ) : (
                <object
                  data={previewUrl}
                  type="application/pdf"
                  className="w-full h-full"
                >
                  <p>PDF viewer not available. Please download the PDF to view it.</p>
                </object>
              )}
            </div>
          </div>

          {/* Right Sidebar - LLM metadata review */}
          <div className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-[6px] border border-[#d0d0d0] bg-white">
            <div className="h-[42px] shrink-0 flex items-center px-4 bg-cy-teal text-white">
              <h3 className="font-ui text-[13px] font-bold">LLM Classification</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <ClassificationMetadataPanel
                values={reviewValues}
                topMatches={topMatches}
                readOnly
                libraryMode={libraryMode}
              />
            </div>
          </div>
        </div>

        {/* PDF Preview Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[8px] w-full h-full max-w-6xl max-h-[90vh] flex flex-col shadow-lg">
              {/* Modal Header */}
              <div className="flex h-[50px] shrink-0 items-center justify-between px-6 gap-3 bg-cy-teal text-white">
                <span className="font-ui text-[15px] font-bold truncate">{documentFileName || 'Document'}</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsModalOpen(false)} className="flex h-[24px] w-[24px] items-center justify-center rounded hover:bg-white/20" aria-label="Close">
                      <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 min-h-0 overflow-hidden bg-white border-t border-[#e0e0e0]">
                {previewError ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <p className="font-ui text-[13px] text-[#E23744]">{previewError}</p>
                  </div>
                ) : !previewUrl ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <p className="font-ui text-[13px] text-[#666666]">Loading document preview...</p>
                  </div>
                ) : (
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <p>PDF viewer not available. Please download the PDF to view it.</p>
                  </object>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reason for Selection Modal */}
        <ReasonForSelectionModal match={selectedReason} isOpen={isReasonModalOpen} onClose={() => setIsReasonModalOpen(false)} allMatches={classifications.map(c => c.topMatch).filter(Boolean) as TopMatch[]} />
      </div>
    </Layout>
  )
}
