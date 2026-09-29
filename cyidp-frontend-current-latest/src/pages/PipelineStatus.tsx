import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { getJobStatus, downloadDuplicatesReport, getApiBaseUrl } from '../api/client'
import { useJob } from '../context/JobContext'

type PipelineStage = 'basic' | 'review' | 'advanced' | 'docint' | 'post_ocr' | 'llm'

type StageStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

interface StageInfo {
  id: PipelineStage
  label: string
  shortName: string
  description: string
  icon: 'code' | 'gear' | 'layers' | 'cloud' | 'filter' | 'sparkles'
}

const STAGES: StageInfo[] = [
  { id: 'basic', label: 'Basic Duplicate Detection', shortName: 'Basic', description: 'Identifying duplicate files', icon: 'code' },
  { id: 'review', label: 'Review & PDF Validation', shortName: 'Review', description: 'Converting and validating documents', icon: 'gear' },
  { id: 'advanced', label: 'Advanced Duplicate Detection', shortName: 'Advanced', description: 'Deep content analysis', icon: 'layers' },
  { id: 'docint', label: 'Document Intelligence', shortName: 'DocInt', description: 'Azure Document Intelligence processing', icon: 'cloud' },
  { id: 'post_ocr', label: 'Post-OCR Duplicate Detection', shortName: 'Post-OCR', description: 'Finding duplicate OCR results', icon: 'filter' },
  { id: 'llm', label: 'AI Classification', shortName: 'AI', description: 'Classifying documents with AI', icon: 'sparkles' },
]

interface ExcelData {
  headers: string[]
  rows: any[]
}

function PipelineStageRow({ stage, status, message, jobId }: { stage: StageInfo; status: StageStatus; message?: string; jobId?: string }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [isLoadingExcel, setIsLoadingExcel] = useState(false)
  const [excelError, setExcelError] = useState('')

  const getStatusIcon = () => {
    if (status === 'completed') {
      return (
        <svg className="h-[20px] w-[20px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
        </svg>
      )
    }
    if (status === 'processing') {
      return (
        <svg className="h-[20px] w-[20px] text-white animate-spin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" opacity="0.3" />
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
        </svg>
      )
    }
    if (status === 'failed') {
      return (
        <svg className="h-[20px] w-[20px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
        </svg>
      )
    }
    if (status === 'skipped') {
      return (
        <svg className="h-[20px] w-[20px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z" />
        </svg>
      )
    }
    // pending
    return (
      <svg className="h-[20px] w-[20px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z" />
      </svg>
    )
  }

  const getStatusLabel = () => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'processing':
        return 'Processing'
      case 'failed':
        return 'Failed'
      case 'skipped':
        return 'Skipped'
      default:
        return 'Pending'
    }
  }

  const getStatusBackgroundColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-[#10b981]'
      case 'processing':
        return 'bg-[#3b82f6]'
      case 'failed':
        return 'bg-[#ef4444]'
      case 'skipped':
        return 'bg-[#9ca3af]'
      default:
        return 'bg-[#d1d5db]'
    }
  }

  const loadExcelData = async () => {
    if (excelData || !jobId || status !== 'completed') return

    setIsLoadingExcel(true)
    setExcelError('')

    try {
      let response: Response
      
      if (stage.id === 'basic') {
        response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/reports/duplicates/data`)
      } else if (stage.id === 'advanced') {
        response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/reports/advanced-duplicates/data`)
      } else if (stage.id === 'post_ocr') {
        response = await fetch(`${getApiBaseUrl()}/api/jobs/${jobId}/reports/post-ocr-duplicates/data`)
      } else {
        setExcelError('No report available for this stage')
        setIsLoadingExcel(false)
        return
      }

      if (!response.ok) {
        throw new Error('Failed to load report data from server')
      }

      const jsonResponse = await response.json()
      const jsonData = jsonResponse.duplicates as Record<string, unknown>[]

      if (jsonData.length === 0) {
        const emptyMessage =
          stage.id === 'advanced' || stage.id === 'post_ocr'
            ? 'No duplicates found for this stage (all documents are unique).'
            : 'No data found in report'
        setExcelError(emptyMessage)
        setIsLoadingExcel(false)
        return
      }

      const headers = Object.keys(jsonData[0])
      setExcelData({
        headers,
        rows: jsonData.slice(0, 10), // Show first 10 rows
      })
    } catch (err) {
      setExcelError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setIsLoadingExcel(false)
    }
  }

  const handleDownload = () => {
    if (!jobId || status !== 'completed') return

    if (stage.id === 'basic') {
      downloadDuplicatesReport(jobId, 'Duplicate_Report_V1.xlsx').catch((err) => {
        setExcelError(err instanceof Error ? err.message : 'Download failed')
      })
    } else if (stage.id === 'advanced') {
      downloadDuplicatesReport(jobId, 'Duplicates.xlsx').catch((err) => {
        setExcelError(err instanceof Error ? err.message : 'Download failed')
      })
    } else if (stage.id === 'post_ocr') {
      downloadDuplicatesReport(jobId, 'Duplicates_all_stages.xlsx').catch((err) => {
        setExcelError(err instanceof Error ? err.message : 'Download failed')
      })
    }
  }

  const handleExpandClick = async () => {
    if (isExpanded) {
      setIsExpanded(false)
    } else {
      setIsExpanded(true)
      if (!excelData && status === 'completed') {
        await loadExcelData()
      }
    }
  }

  // Determine if this stage has a report file
  const hasReportFile = (stage.id === 'basic' || stage.id === 'advanced' || stage.id === 'post_ocr') && status === 'completed'

  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 mb-3">
        <div className={`flex-shrink-0 flex items-center justify-center h-[44px] w-[44px] rounded-full ${getStatusBackgroundColor()} shadow-md`}>
          {getStatusIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-ui text-[14px] font-semibold text-[#1f1f1f]">{stage.label}</h3>
            <span className={`font-ui text-[12px] font-semibold px-2.5 py-1 rounded-full ${
              status === 'completed' ? 'bg-[#d1fae5] text-[#059669]' :
              status === 'processing' ? 'bg-[#dbeafe] text-[#1e40af]' :
              status === 'failed' ? 'bg-[#fee2e2] text-[#991b1b]' :
              status === 'skipped' ? 'bg-[#f3f4f6] text-[#4b5563]' :
              'bg-[#f3f4f6] text-[#6b7280]'
            }`}>{getStatusLabel()}</span>
          </div>
          <p className="font-ui text-[12px] font-normal text-[#666666]">{stage.description}</p>
          {message && <p className="font-ui text-[12px] font-normal text-[#666666] mt-1">💡 {message}</p>}
        </div>

        {hasReportFile && (
          <button
            onClick={handleExpandClick}
            className="flex-shrink-0 p-2 hover:bg-[#f5f5f5] rounded-lg transition-colors"
            title="View report"
          >
            <svg
              className={`h-[18px] w-[18px] text-[#666666] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="ml-[56px] mb-3">
        <div className="h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden shadow-sm">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === 'completed' ? 'bg-[#10b981]' :
              status === 'processing' ? 'bg-gradient-to-r from-[#3b82f6] to-[#1e40af] animate-pulse' :
              status === 'failed' ? 'bg-[#ef4444]' :
              status === 'skipped' ? 'bg-[#9ca3af]' :
              'bg-[#d1d5db]'
            }`}
            style={{ width: status === 'pending' ? '0%' : status === 'processing' ? '65%' : '100%' }}
          />
        </div>
      </div>

      {isExpanded && hasReportFile && (
        <div className="ml-[56px] border border-[#e2e8f0] rounded-[8px] bg-[#f8fafc] p-4 shadow-sm">
          {isLoadingExcel ? (
            <div className="flex items-center gap-2 py-4">
              <svg className="h-[16px] w-[16px] text-blue-600 animate-spin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" opacity="0.3" />
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
              </svg>
              <p className="font-ui text-[12px] font-normal text-[#666666]">Loading report...</p>
            </div>
          ) : excelError ? (
            <p className="font-ui text-[12px] font-normal text-[#c62828]">⚠️ {excelError}</p>
          ) : excelData ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[#d0d0d0]">
                      {excelData.headers.map((header) => (
                        <th
                          key={header}
                          className="px-3 py-2 text-left font-semibold text-[#1f1f1f] bg-[#f0f0f0] whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelData.rows.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#e6e6e6] hover:bg-[#f5f5f5]">
                        {excelData.headers.map((header) => (
                          <td key={header} className="px-3 py-2 text-[#666666]">
                            {String(row[header] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="font-ui text-[10px] font-normal text-[#999999]">
                Showing first 10 rows
              </p>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1 rounded-[4px] bg-cy-teal px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-cy-teal-hover transition-colors"
              >
                <svg className="h-[12px] w-[12px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                Download
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function PipelineStatus() {
  const navigate = useNavigate()
  const { jobId } = useJob()

  const [jobStatus, setJobStatus] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasCompleted, setHasCompleted] = useState(false)

  useEffect(() => {
    if (!jobId) {
      navigate('/upload')
      return
    }

    let pollTimeout: ReturnType<typeof setTimeout> | null = null
    let isMounted = true

    const pollStatus = async () => {
      let nextDelay = 1200

      try {
        const status = await getJobStatus(jobId)
        if (!isMounted) return

        setJobStatus((prev: any) => {
          if (
            prev &&
            prev.status === status.status &&
            prev.stage === status.stage &&
            prev.progress === status.progress &&
            prev.message === status.message
          ) {
            return prev
          }
          return status
        })
        setError('')
        setIsLoading(false)

        if (status.status === 'completed' || status.status === 'failed') {
          setHasCompleted(true)
          // Do NOT auto-navigate. Only the "View Documents" button should navigate.
          return
        }

        if (
          status.status === 'processing' ||
          status.status === 'awaiting_duplicate_review'
        ) {
          nextDelay = 700
        }
      } catch (err) {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'Failed to fetch status')
        setIsLoading(false)
        nextDelay = 2000
      }

      // Schedule the next poll only after this one finishes, so slow
      // responses can't pile up overlapping requests.
      if (isMounted) {
        pollTimeout = setTimeout(pollStatus, nextDelay)
      }
    }

    pollStatus()

    return () => {
      isMounted = false
      if (pollTimeout) clearTimeout(pollTimeout)
    }
  }, [jobId, navigate])

  const getStageStatus = (stageName: string): StageStatus => {
    if (!jobStatus) return 'pending'

    const currentStage = jobStatus.stage
    const currentStatus = jobStatus.status

    // Map backend stage names to our stage ids
    const stageOrder: PipelineStage[] = ['basic', 'review', 'advanced', 'docint', 'post_ocr', 'llm']
    const currentIndex = stageOrder.indexOf(currentStage as PipelineStage)
    const stageIndex = stageOrder.indexOf(stageName as PipelineStage)

    if (currentStatus === 'failed') {
      return stageName === currentStage ? 'failed' : stageIndex < currentIndex ? 'completed' : 'pending'
    }

    if (currentStatus === 'completed' || currentStatus === 'awaiting_confirmation') {
      return 'completed'
    }

    if (currentStatus === 'awaiting_duplicate_review') {
      if (stageIndex < stageOrder.indexOf('advanced')) return 'completed'
      if (stageName === 'advanced' || stageName === 'docint') return 'processing'
      return 'pending'
    }

    if (stageName === currentStage) {
      return currentStatus === 'processing' || currentStatus === 'awaiting_duplicate_review'
        ? 'processing'
        : 'pending'
    }

    if (stageIndex < currentIndex) {
      return 'completed'
    }

    return 'pending'
  }

  if (isLoading) {
    return (
      <Layout
        title="Pipeline Status"
        activeNavId="pipeline"
        breadcrumbLabel="Pipeline Status"
        breadcrumbItems={[{ label: 'Home', href: '#home', icon: 'home' }]}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <div className="flex flex-1 flex-col gap-4 rounded-[8px] border border-[#e2e8f0] bg-white shadow-sm">
            <div className="w-full border-b border-[#e2e8f0] px-6 py-4">
              <h2 className="font-ui text-[18px] font-bold text-[#1f1f1f]">Processing Pipeline Status</h2>
              <p className="font-ui text-[13px] font-normal text-[#666666] mt-1">Your documents are being processed through our intelligent pipeline</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="relative h-[60px] w-[60px]">
                  <svg className="absolute inset-0 h-full w-full text-blue-600 animate-spin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" opacity="0.3" />
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                  </svg>
                </div>
                <div>
                  <p className="font-ui text-[16px] font-semibold text-[#1f1f1f]">Initializing Pipeline</p>
                  <p className="font-ui text-[13px] font-normal text-[#666666] mt-1">Setting up document processing...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout
      title="Pipeline Status"
      activeNavId="pipeline"
      breadcrumbLabel="Pipeline Status"
      breadcrumbItems={[{ label: 'Home', href: '#home', icon: 'home' }]}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <div className="flex flex-1 flex-col gap-4 rounded-[8px] border border-[#e2e8f0] bg-white shadow-sm">
          {/* Header */}
          <div className="w-full border-b border-[#e2e8f0] px-6 py-4">
            <h2 className="font-ui text-[18px] font-bold text-[#1f1f1f]">Processing Pipeline Status</h2>
            <p className="font-ui text-[13px] font-normal text-[#666666] mt-1">Your documents are being processed through our intelligent pipeline</p>
          </div>

          {/* Visual Progress Stepper */}
          <div className="px-6 py-6 border-b border-[#e2e8f0] bg-gradient-to-r from-[#f8fafc] to-white">
            <div className="flex items-center justify-center gap-0 max-w-full mx-auto">
              {STAGES.map((stage, index) => {
                const stageStatus = getStageStatus(stage.id)
                const isCompleted = stageStatus === 'completed'
                const isProcessing = stageStatus === 'processing'

                return (
                  <div key={stage.id} className="flex items-center flex-1">
                    {/* Circle */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex items-center justify-center h-[40px] w-[40px] rounded-full border-2 transition-all duration-300 flex-shrink-0 ${
                          isCompleted
                            ? 'bg-[#3b82f6] border-[#3b82f6] shadow-md'
                            : isProcessing
                            ? 'bg-white border-[#3b82f6] shadow-md ring-2 ring-[#3b82f6] ring-offset-2'
                            : 'bg-white border-[#d1d5db]'
                        }`}
                      >
                        {isCompleted && (
                          <svg className="h-[20px] w-[20px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                          </svg>
                        )}
                        {isProcessing && (
                          <div className="h-[12px] w-[12px] rounded-full bg-[#3b82f6] animate-pulse" />
                        )}
                        {!isCompleted && !isProcessing && (
                          <div className="h-[8px] w-[8px] rounded-full bg-[#d1d5db]" />
                        )}
                      </div>
                      
                      {/* Label */}
                      <p className="font-ui text-[11px] font-semibold text-[#666666] mt-2 text-center leading-tight max-w-[150px]">
                        {stage.shortName}
                      </p>
                    </div>

                    {/* Connecting Line */}
                    {index < STAGES.length - 1 && (
                      <div className="flex-1 h-[2px] mx-1 transition-all duration-300"
                        style={{
                          backgroundColor: index < STAGES.findIndex(s => s.id === (jobStatus?.stage || 'basic')) ||
                            (jobStatus?.status === 'completed') ? '#3b82f6' : '#d1d5db'
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mx-6 mt-4 rounded-[8px] bg-[#fee2e2] border border-[#fecaca] p-4 flex gap-3">
              <svg className="h-[20px] w-[20px] text-[#991b1b] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
              </svg>
              <p className="font-ui text-[13px] font-normal text-[#991b1b]">{error}</p>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 flex flex-col gap-4 overflow-auto px-6 py-4">
            {/* Status Message */}
            {jobStatus?.message && (
              <div className="p-4 bg-[#eff6ff] rounded-[8px] border border-[#bfdbfe] flex gap-3">
                <svg className="h-[18px] w-[18px] text-[#1e40af] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-.5-13h1v6h-1zm0 8h1v2h-1z" />
                </svg>
                <p className="font-ui text-[13px] font-normal text-[#1e40af]">{jobStatus.message}</p>
              </div>
            )}

            {/* Overall Progress Bar */}
            {jobStatus?.progress !== null && jobStatus?.progress !== undefined && (
              <div className="p-4 bg-gradient-to-r from-[#f0fdf4] to-[#f8fafc] rounded-[8px] border border-[#d1fae5] shadow-sm">
                <div className="flex justify-between mb-3">
                  <p className="font-ui text-[13px] font-semibold text-[#1f1f1f]">Overall Progress</p>
                  <p className="font-ui text-[13px] font-bold text-[#059669]">{jobStatus.progress}%</p>
                </div>
                <div className="h-[8px] bg-[#d1fae5] rounded-full overflow-hidden shadow-sm">
                  <div
                    className="h-full bg-gradient-to-r from-[#10b981] to-[#059669] transition-all duration-500 rounded-full"
                    style={{ width: `${jobStatus.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Pipeline Stages */}
            <div className="space-y-2">
              <p className="font-ui text-[13px] font-semibold text-[#1f1f1f] px-2">Processing Stages</p>
              {STAGES.map((stage) => (
                <PipelineStageRow
                  key={stage.id}
                  stage={stage}
                  status={getStageStatus(stage.id)}
                  message={stage.id === jobStatus?.stage && jobStatus?.message ? jobStatus.message : undefined}
                  jobId={jobId || undefined}
                />
              ))}
            </div>

            {/* Action Buttons */}
            {hasCompleted && (
              <div className="mt-8 flex gap-4 justify-center">
                {jobStatus?.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => navigate('/upload')}
                    className="inline-flex items-center gap-2 rounded-[8px] bg-[#ef4444] px-6 py-3 text-[14px] font-semibold text-white hover:bg-[#dc2626] transition-colors shadow-md"
                  >
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                    </svg>
                    Retry Upload
                  </button>
                )}
                {jobStatus?.status === 'completed' && (
                  <button
                    type="button"
                    onClick={() => navigate(`/list-of-documents?job_id=${jobId}`)}
                    className="inline-flex items-center gap-2 rounded-[8px] bg-[#10b981] px-6 py-3 text-[14px] font-semibold text-white hover:bg-[#059669] transition-colors shadow-md"
                  >
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                    View Documents
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
