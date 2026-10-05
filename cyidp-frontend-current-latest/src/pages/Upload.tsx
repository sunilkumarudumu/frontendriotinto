import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import PipelineProgressTracker from '../components/PipelineProgressTracker'
import { startJob, getJobStatus, downloadAdvancedDuplicatesReport, getApiBaseUrl } from '../api/client'
import { useJob } from '../context/JobContext'

const getDisplayHeader = (header: string): string => {
  if (header === 'Original Document') return 'File name'
  if (header === 'Duplicate File Name') return 'duplicate with'
  return header
}

type DuplicateColumn = {
  label: string
  keys: string[]
}

const DUPLICATE_COLUMNS: DuplicateColumn[] = [
  { label: 'Filename', keys: ['Original Document', 'File name', 'filename'] },
  { label: 'Duplicate With', keys: ['Duplicate File Name', 'duplicate with'] },
  { label: 'Reason', keys: ['Reason', 'reason'] },
  { label: 'Stage', keys: ['Stage', 'stage'] },
  { label: 'Pages Matched Source', keys: ['Pages Matched Source', 'pages matched source', 'pages_matched_source'] },
  { label: 'Pages Matched Duplicate', keys: ['Pages Matched Duplicate', 'pages matched duplicate', 'pages_matched_duplicate'] },
  { label: 'Confirm Duplicate', keys: ['Confirm Duplicate', 'confirm duplicate', 'confirm_duplicate'] },
]

const getColumnValue = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value)
    }
  }
  return '-'
}

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

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2 GB
const UPLOAD_BATCH_SIZE = 8

const UPLOAD_FLOW_STEPS = [
  { id: 'select', label: 'Select Files' },
  { id: 'upload', label: 'Upload' },
  { id: 'process', label: 'Start Processing' },
  { id: 'complete', label: 'Complete' },
] as const

// User-facing pipeline steps (plain language)
const STAGES = [
  { id: 'detect', label: 'Find duplicates', shortName: 'Find duplicates' },
  { id: 'read', label: 'Read content', shortName: 'Read content' },
  { id: 'review', label: 'Review pairs', shortName: 'Review pairs' },
  { id: 'classify', label: 'Classify', shortName: 'Classify' },
]

type FlowStepStatus = 'disabled' | 'active' | 'completed'

function UploadFlowStepper({
  steps,
  currentStepIndex,
}: {
  steps: readonly { id: string; label: string }[]
  currentStepIndex: number
}) {
  return (
    <div className="my-3 w-full max-w-[900px] self-center px-2">
      <div className="flex w-full items-start">
        {steps.map((step, index) => {
          const status: FlowStepStatus =
            index < currentStepIndex
              ? 'completed'
              : index === currentStepIndex
                ? 'active'
                : 'disabled'
          const isLast = index === steps.length - 1
          const isSelected = status === 'active' || status === 'completed'

          return (
            <div key={step.id} className={`flex items-start ${isLast ? '' : 'flex-1'}`}>
              <div className="flex w-[88px] flex-col items-center">
                <div
                  className={`flex h-[36px] w-[36px] items-center justify-center rounded-full border-2 font-ui text-[14px] font-semibold transition-colors ${
                    status === 'completed'
                      ? 'border-[#169DA5] bg-[#169DA5] text-white'
                      : status === 'active'
                        ? 'border-[#169DA5] bg-white text-[#169DA5] ring-2 ring-[#169DA5]/30 ring-offset-1'
                        : 'border-[#c5d0d6] bg-white text-[#9a9a9a]'
                  }`}
                  aria-current={status === 'active' ? 'step' : undefined}
                >
                  {status === 'completed' ? (
                    <svg className="h-[16px] w-[16px]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M6.2 11.2 2.8 7.8l1.1-1.1 2.3 2.3 5-5 1.1 1.1z" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <p
                  className={`mt-2 text-center font-ui text-[11px] leading-[14px] font-semibold ${
                    isSelected ? 'text-[#169DA5]' : 'text-[#9a9a9a]'
                  }`}
                >
                  {step.label}
                </p>
              </div>

              {!isLast && (
                <div
                  className={`mt-[17px] h-[2px] min-w-[24px] flex-1 transition-colors ${
                    index < currentStepIndex ? 'bg-[#169DA5]' : 'bg-[#d9e0e6]'
                  }`}
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Upload() {
  const navigate = useNavigate()
  const { jobId, setJobId, jobStatus: sharedJobStatus } = useJob()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dragDropRef = useRef<HTMLDivElement>(null)
  const duplicateActionButtonRef = useRef<HTMLDivElement>(null)

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploadedFileCount, setUploadedFileCount] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [site, setSite] = useState('')
  const [batch, setBatch] = useState('')
  const [library, setLibrary] = useState('Project')
  const [jobStatus, setJobStatus] = useState<any | null>(null)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [showPipelineFinished, setShowPipelineFinished] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [duplicateData, setDuplicateData] = useState<any | null>(null)
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false)
  const [duplicateError, setDuplicateError] = useState('')

  useEffect(() => {
    if (!sharedJobStatus) return
    setJobStatus(sharedJobStatus)
  }, [sharedJobStatus])
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    processFiles(files)
  }

  const processFiles = (fileList: FileList | null) => {
    if (!fileList) return

    setUploadError('')
    setUploadSuccess(false)
    const newFiles: File[] = []
    let totalSize = 0

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      totalSize += file.size

      if (totalSize > MAX_FILE_SIZE) {
        setUploadError(`Total file size exceeds 2 GB limit.`)
        return
      }

      newFiles.push(file)
    }

    if (newFiles.length === 0) {
      setUploadError('No files selected')
      return
    }

    setSelectedFiles(newFiles)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const items = e.dataTransfer.items
    const fileList: File[] = []

    if (items) {
      // Use DataTransferItemList interface (more modern, supports directories)
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            fileList.push(file)
          }
        }
      }
    } else {
      // Fallback for older browsers (use dataTransfer.files)
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        fileList.push(e.dataTransfer.files[i])
      }
    }

    if (fileList.length > 0) {
      // Convert File[] to FileList-like object
      const dataTransfer = new DataTransfer()
      fileList.forEach(file => dataTransfer.items.add(file))
      processFiles(dataTransfer.files)
    }
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return

    setIsUploading(true)
    setUploadError('')
    setUploadProgress(0)

    try {
      const jobId = await uploadDocumentsWithProgress(selectedFiles)
      
      setUploadSuccess(true)
      setShowPipelineFinished(false)
      setUploadedFileCount(selectedFiles.length)
      setSelectedFiles([])
      setSite('')
      setBatch('')
      setLibrary('Project')
      setJobId(jobId)

      // Store this jobId in the list of all uploaded jobIds
      const allJobIds = JSON.parse(localStorage.getItem('allUploadedJobIds') || '[]') as string[]
      if (!allJobIds.includes(jobId)) {
        allJobIds.push(jobId)
        localStorage.setItem('allUploadedJobIds', JSON.stringify(allJobIds))
      }

      setUploadProgress(100)
      
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = ''
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const uploadDocumentsWithProgress = async (files: File[]): Promise<string> => {
    let jobId = ''
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    let uploadedBytes = 0

    for (let start = 0; start < files.length; start += UPLOAD_BATCH_SIZE) {
      const fileBatch = files.slice(start, start + UPLOAD_BATCH_SIZE)
      jobId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const batchStartBytes = uploadedBytes

        xhr.timeout = 0
        xhr.upload.addEventListener('progress', (event) => {
          if (!event.lengthComputable) return
          const loaded = batchStartBytes + event.loaded
          const percentComplete = totalBytes
            ? Math.min(99, Math.round((loaded / totalBytes) * 100))
            : Math.round(((start + fileBatch.length) / files.length) * 100)
          setUploadProgress(percentComplete)
        })

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve(response.job_id)
            } catch {
              reject(new Error('Failed to parse upload response'))
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText)
              reject(new Error(error.detail || 'Upload failed'))
            } catch {
              reject(new Error(`Upload failed: ${xhr.statusText}`))
            }
          }
        })

        xhr.addEventListener('error', () => {
          reject(
            new Error(
              'Upload failed due to network/CORS error. Confirm the Function App is healthy and allows this Static Web App origin.',
            ),
          )
        })
        xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled')))
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out. Retry this batch.')))

        const formData = new FormData()
        formData.append('site', site)
        formData.append('batch', batch)
        formData.append('library', library)
        formData.append('uploadedDate', new Date().toISOString())
        if (jobId) {
          formData.append('job_id', jobId)
        }
        for (const file of fileBatch) {
          formData.append('files', file)
        }

        xhr.open('POST', `${getApiBaseUrl()}/api/documents/upload`)
        xhr.send(formData)
      })
      uploadedBytes += fileBatch.reduce((sum, file) => sum + file.size, 0)
      setUploadProgress(
        totalBytes
          ? Math.min(99, Math.round((uploadedBytes / totalBytes) * 100))
          : Math.round(((start + fileBatch.length) / files.length) * 100),
      )
    }

    return jobId
  }

  const handleStartProcessing = async () => {
    if (!uploadSuccess) return

    setIsStarting(true)
    setUploadError('')

    try {
      const jobId = currentJobId || localStorage.getItem('currentJobId')
      if (!jobId) {
        throw new Error('Job ID not found')
      }

      setCurrentJobId(jobId)
      setShowPipelineFinished(false)
      await startJob(jobId)
      setJobStatus({
        status: 'processing',
        stage: 'basic',
        progress: 5,
        message: 'Starting pipeline...',
      })
      setIsPolling(true)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to start processing')
    } finally {
      setIsStarting(false)
    }
  }

  // Poll for job status updates on the Upload page tracker only.
  useEffect(() => {
    if (!isPolling || !currentJobId) return

    let pollTimeout: ReturnType<typeof setTimeout> | null = null
    let isActive = true

    const pollStatus = async () => {
      let nextDelay = 1200

      try {
        const status = await getJobStatus(currentJobId)
        if (!isActive) return
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

        if (status.status === 'failed') {
          setIsPolling(false)
          setUploadError(status.message || 'Pipeline processing failed')
          return
        }

        if (status.status === 'completed') {
          setIsPolling(false)
          setJobStatus(status)
          setShowPipelineFinished(true)
          setTimeout(() => {
            navigate(`/duplicate?job_id=${currentJobId}`)
          }, 1200)
          return
        }

        if (status.status === 'awaiting_confirmation') {
          setIsPolling(false)
          setJobStatus(status)
          setTimeout(() => {
            navigate(`/list-of-documents?job_id=${currentJobId}`)
          }, 400)
          return
        }

        if (
          status.status === 'processing' ||
          status.status === 'awaiting_duplicate_review'
        ) {
          nextDelay = 700
        }
      } catch (err) {
        console.error('Failed to fetch status:', err)
        if (err instanceof Error && err.message === 'Job not found') {
          setIsPolling(false)
          localStorage.removeItem('currentJobId')
          setUploadError('This job is no longer available. Please upload the documents again.')
          return
        }
        nextDelay = 2000
      }

      // Schedule the next poll only after this one finishes, so slow
      // responses can't pile up overlapping requests.
      if (isActive) {
        pollTimeout = setTimeout(pollStatus, nextDelay)
      }
    }

    pollStatus()

    return () => {
      isActive = false
      if (pollTimeout) clearTimeout(pollTimeout)
    }
  }, [isPolling, currentJobId, navigate])

  useEffect(() => {
    if (!uploadSuccess) return
    if (jobStatus?.status !== 'awaiting_duplicate_review') return
    if (showPipelineModal) return

    const timer = window.setTimeout(() => {
      duplicateActionButtonRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 120)

    return () => window.clearTimeout(timer)
  }, [uploadSuccess, jobStatus?.status, showPipelineModal])

  const getStageStatus = (phaseId: string) => {
    if (!jobStatus) return 'pending'

    if (jobStatus.status === 'completed' || jobStatus.status === 'awaiting_confirmation') {
      return 'completed'
    }
    if (jobStatus.status === 'failed') {
      return phaseId === 'detect' ? 'processing' : 'pending'
    }

    const stage = String(jobStatus.stage || '').toLowerCase()
    const message = String(jobStatus.message || '')
    const needsReview = jobStatus.status === 'awaiting_duplicate_review'
    const isPostOcrReview =
      needsReview &&
      (stage === 'post_ocr' || /post-?ocr/i.test(message) || /post-ocr document/i.test(message))

    // Order: Find → Read → Review pairs → Classify
    // Review stays pending during Read so Advanced-miss / Post-OCR-hit does not snap backwards.
    if (phaseId === 'detect') {
      if (['basic', 'review', 'advanced'].includes(stage) && !needsReview) return 'processing'
      return 'completed'
    }
    if (phaseId === 'read') {
      if (needsReview && isPostOcrReview) return 'completed'
      if (needsReview && !isPostOcrReview) return 'processing' // Advanced hold; OCR may continue
      if (['docint', 'post_ocr'].includes(stage)) return 'processing'
      if (['asset_classification', 'llm', 'trpryv'].includes(stage)) return 'completed'
      if (['basic', 'review', 'advanced'].includes(stage)) return 'pending'
      return 'pending'
    }
    if (phaseId === 'review') {
      if (needsReview) return 'processing'
      // Only complete once classification starts — never just because Advanced found nothing.
      if (['asset_classification', 'llm', 'trpryv'].includes(stage)) return 'completed'
      return 'pending'
    }
    if (phaseId === 'classify') {
      if (needsReview) return 'pending'
      if (['asset_classification', 'llm', 'trpryv'].includes(stage)) return 'processing'
      return 'pending'
    }
    return 'pending'
  }

  const closePipelineModal = () => {
    setShowPipelineModal(false)
    setIsPolling(false)
    setJobStatus(null)
    setCurrentJobId(null)
    setShowDuplicates(false)
    setDuplicateData(null)
  }

  const loadDuplicateData = async () => {
    if (!currentJobId || isLoadingDuplicates) return

    setIsLoadingDuplicates(true)
    setDuplicateError('')
    setShowDuplicates(true)

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/jobs/${currentJobId}/reports/advanced-duplicates/data`)
      
      if (!response.ok) {
        throw new Error('Failed to load advanced duplicate report data from server')
      }

      const jsonResponse = await response.json()
      const jsonData = jsonResponse.duplicates as Record<string, unknown>[]

      if (jsonData.length === 0) {
        setDuplicateError('No advanced duplicate data found')
        setIsLoadingDuplicates(false)
        return
      }

      setDuplicateData({
        headers: Object.keys(jsonData[0]),
        rows: jsonData.slice(0, 10), // Show first 10 rows
      })
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : 'Failed to load advanced duplicate report')
    } finally {
      setIsLoadingDuplicates(false)
    }
  }

  const handleDownloadDuplicates = async () => {
    if (!currentJobId) return

    try {
      await downloadAdvancedDuplicatesReport(currentJobId)
    } catch (err) {
      console.error('Download failed:', err)
      setUploadError('Failed to download report: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const isPipelineFinished =
    jobStatus?.status === 'completed' || jobStatus?.status === 'awaiting_confirmation'

  let currentFlowStepIndex = 0
  if (isPipelineFinished) {
    currentFlowStepIndex = UPLOAD_FLOW_STEPS.length
  } else if (isPolling) {
    currentFlowStepIndex = 3
  } else if (uploadSuccess) {
    currentFlowStepIndex = 2
  } else if (selectedFiles.length > 0) {
    currentFlowStepIndex = 1
  }

  return (
    <Layout
      title="Documents Upload"
      activeNavId="upload"
      breadcrumbLabel="Upload"
      breadcrumbItems={[{ label: 'Upload file/folder', href: '#home', icon: 'home' }]}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col gap-3 rounded-[6px] bg-white px-[24px] py-[20px]">
          <UploadFlowStepper steps={UPLOAD_FLOW_STEPS} currentStepIndex={currentFlowStepIndex} />
          <div className="flex flex-1 flex-col items-center justify-center">
            {/* File Inputs (Hidden) */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              disabled={isUploading}
              multiple
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="hidden"
              {...({ webkitdirectory: '' } as any)}
            />

            {/* File Selection Area - Drag & Drop */}
            {selectedFiles.length === 0 && !uploadSuccess && (
              <div
                ref={dragDropRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`mx-auto flex min-h-[300px] w-full max-w-[900px] items-center justify-center rounded-[8px] border-2 border-dashed transition-colors ${
                  isDragging ? 'border-cy-teal bg-cy-teal/5' : 'border-[#d0d0d0] bg-white'
                }`}
              >
                <div className="flex flex-col items-center gap-3 px-6 py-5">
                  <div className="flex items-center justify-center rounded-full bg-[#f5f5f5] p-[20px]">
                    <svg className="h-[40px] w-[40px] text-[#999999]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="text-center whitespace-nowrap">
                    <p className="font-ui text-[13px] leading-[18px] font-bold text-[#272727]">
                      Welcome to the CYIDP Tool!
                    </p>
                    <p className="font-ui text-[13px] leading-[18px] font-bold text-[#272727]">
                      Upload your documents to begin processing with the CYIDP Tool.
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="flex justify-center gap-[20px]">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="inline-flex items-center gap-2 rounded-[6px] bg-cy-teal px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-cy-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                        </svg>
                        Select Files
                      </button>
                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        disabled={isUploading}
                        className="inline-flex items-center gap-2 rounded-[6px] bg-cy-teal px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-cy-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                        </svg>
                        Select Folder
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Files Info & Upload Progress */}
            {selectedFiles.length > 0 && !uploadSuccess && (
              <div className="flex-1 flex flex-col justify-center items-center">
                <div className="w-[850px]">
                  <div className="mb-6 overflow-hidden rounded-[8px] border border-[#e2e8f0] bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-3 bg-[#eee] px-4 py-3">
                      <p className="font-ui text-[13px] font-semibold text-[#272727]">
                        Selected Files:{' '}
                        <span className="text-[20px] font-bold text-[#169DA5]">
                          {selectedFiles.length}
                        </span>
                      </p>
                      {!isUploading && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFiles([])
                              setSite('')
                              setBatch('')
                              setLibrary('Project')
                              if (fileInputRef.current) {
                                fileInputRef.current.value = ''
                              }
                              if (folderInputRef.current) {
                                folderInputRef.current.value = ''
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#d0d0d0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#272727] transition-colors hover:bg-[#f5f5f5]"
                          >
                            <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleUpload}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[6px] bg-cy-teal px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-cy-teal-hover"
                          >
                            <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            Upload {selectedFiles.length} File{selectedFiles.length !== 1 ? 's' : ''}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-6">
                    <div className="mt-0 flex justify-center">
                      <div className="flex w-full gap-4 rounded-[8px] border border-[#e5e7eb] p-4">
                        <div className="flex-1">
                          <label className="block font-ui text-[12px] font-semibold text-[#1f1f1f] mb-2">
                            Site
                          </label>
                          <input
                            type="text"
                            value={site}
                            onChange={(e) => setSite(e.target.value)}
                            placeholder="Enter site name"
                            className="w-full rounded-[6px] border border-[#d0d0d0] bg-white px-3 py-2 text-[12px] text-[#1f1f1f] outline-none focus:border-cy-teal focus:ring-2 focus:ring-cy-teal/20"
                          />
                        </div>

                        <div className="flex-1">
                          <label className="block font-ui text-[12px] font-semibold text-[#1f1f1f] mb-2">
                            Batch
                          </label>
                          <input
                            type="text"
                            value={batch}
                            onChange={(e) => setBatch(e.target.value)}
                            placeholder="Enter batch number"
                            className="w-full rounded-[6px] border border-[#d0d0d0] bg-white px-3 py-2 text-[12px] text-[#1f1f1f] outline-none focus:border-cy-teal focus:ring-2 focus:ring-cy-teal/20"
                          />
                        </div>

                        <div className="flex-1">
                          <label className="block font-ui text-[12px] font-semibold text-[#1f1f1f] mb-2">
                            Library
                          </label>
                          <div className="relative">
                            <select
                              value={library}
                              onChange={(e) => setLibrary(e.target.value)}
                              className="w-full rounded-[6px] border border-[#d0d0d0] bg-white px-3 py-2 pr-8 text-[12px] text-[#1f1f1f] outline-none focus:border-cy-teal focus:ring-2 focus:ring-cy-teal/20 appearance-none cursor-pointer"
                            >
                              <option value="Project">Project</option>
                              <option value="Archive">Archive</option>
                            </select>
                            <svg
                              className="absolute right-2 top-1/2 h-[14px] w-[14px] -translate-y-1/2 transform text-[#666] pointer-events-none"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>

                  {isUploading && (
                    <div className="bg-[#f0fdf4] border border-[#dcfce7] rounded-[8px] p-4 mb-6 shadow-sm">
                      <p className="font-ui text-[13px] font-semibold text-[#059669] mb-3">Uploading {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}...</p>
                      <div className="h-[6px] bg-[#dcfce7] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cy-teal to-[#14b8a6] transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="font-ui text-[12px] font-semibold text-[#059669] mt-2 text-right">{uploadProgress}%</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upload Success State */}
            {uploadSuccess && (
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="-mt-[18px] flex w-[850px] flex-col items-center px-8">
                  <div className="-mt-[8px] flex h-[80px] w-[80px] items-center justify-center rounded-full border-2 border-[#059669]">
                    <svg className="h-[40px] w-[40px] text-[#059669]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                  </div>
                  <div className="mt-[20px] text-center">
                    <p className="font-ui text-[14px] font-bold leading-[22px] text-[#059669]">{uploadedFileCount} file{uploadedFileCount !== 1 ? 's' : ''} successfully uploaded and ready for processing</p>
                  </div>

                  {showPipelineFinished ? (
                    <div className="mt-[30px] flex w-full flex-col items-center gap-2 rounded-[8px] border border-[#b5dde0] bg-[#e6f6f7] p-6">
                      <svg className="h-[32px] w-[32px] text-[#169DA5]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                      <p className="font-ui text-[14px] font-semibold text-[#0f6b71]">Pipeline finished</p>
                      <p className="font-ui text-[12px] text-[#0f6b71]">Opening Duplicate Detection...</p>
                    </div>
                  ) : !isPolling ? (
                    <div className="mt-[30px] flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setUploadSuccess(false)
                          setUploadedFileCount(0)
                          setSelectedFiles([])
                          setSite('')
                          setBatch('')
                          setLibrary('Project')
                          if (fileInputRef.current) {
                            fileInputRef.current.value = ''
                          }
                          if (folderInputRef.current) {
                            folderInputRef.current.value = ''
                          }
                        }}
                        className="inline-flex w-[200px] items-center justify-center gap-1.5 rounded-[6px] border border-[#d0d0d0] bg-white px-4 py-3 text-[13px] font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f5f5f5]"
                      >
                        <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Upload More Files
                      </button>
                      <button
                        type="button"
                        onClick={handleStartProcessing}
                        disabled={isStarting}
                        className="inline-flex w-[200px] items-center justify-center gap-1.5 rounded-[6px] border-0 bg-cy-teal px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-cy-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {isStarting ? 'Starting...' : 'Start Processing'}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-[30px] flex w-full justify-center" ref={duplicateActionButtonRef}>
                      <PipelineProgressTracker
                        jobId={currentJobId}
                        status={jobStatus}
                        onOpenDuplicates={() =>
                          navigate(
                            jobId
                              ? `/duplicate?job_id=${encodeURIComponent(jobId)}`
                              : '/duplicate',
                          )
                        }
                        onOpenDocuments={() =>
                          navigate(
                            currentJobId
                              ? `/list-of-documents?job_id=${encodeURIComponent(currentJobId)}`
                              : '/list-of-documents',
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {uploadError && (
              <div className="mt-[20px] mb-4 rounded-[6px] border border-[#ffcdd2] bg-[#ffebee] p-3">
                <p className="font-ui text-[12px] font-normal text-[#c62828]">{uploadError}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Status Modal */}
      {showPipelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[12px] shadow-2xl w-[90%] max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] px-6 py-4 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-ui text-[18px] font-bold text-[#1f1f1f]">Processing status</h2>
                <p className="font-ui text-[13px] font-normal text-[#666666] mt-1">
                  Follow each step as your documents move through the pipeline
                </p>
              </div>
              <button
                type="button"
                onClick={closePipelineModal}
                className="text-[#999999] hover:text-[#1f1f1f] transition-colors"
                aria-label="Close"
              >
                <svg className="h-[24px] w-[24px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                </svg>
              </button>
            </div>

            <div className="space-y-5 p-6">
              <PipelineProgressTracker
                jobId={currentJobId}
                status={jobStatus}
                onOpenDuplicates={() => {
                  closePipelineModal()
                  navigate(
                    currentJobId
                      ? `/duplicate?job_id=${encodeURIComponent(currentJobId)}`
                      : '/duplicate',
                  )
                }}
                onOpenDocuments={() => {
                  closePipelineModal()
                  navigate(
                    currentJobId
                      ? `/list-of-documents?job_id=${encodeURIComponent(currentJobId)}`
                      : '/list-of-documents',
                  )
                }}
              />

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STAGES.map((stage) => {
                  const stageStatus = getStageStatus(stage.id)
                  const tone =
                    stageStatus === 'completed'
                      ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
                      : stageStatus === 'processing'
                        ? 'border-[#b5dde0] bg-[#e6f6f7] text-[#0f6b71]'
                        : 'border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]'
                  return (
                    <div
                      key={stage.id}
                      className={`rounded-[6px] border px-3 py-2 font-ui text-[11px] font-semibold ${tone}`}
                    >
                      {stage.shortName}
                      <span className="mt-0.5 block text-[10px] font-medium opacity-80">
                        {stageStatus === 'completed'
                          ? 'Done'
                          : stageStatus === 'processing'
                            ? 'In progress'
                            : 'Up next'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {jobStatus?.status === 'awaiting_confirmation' && (
                <div className="rounded-[8px] border border-[#b5dde0] bg-[#e6f6f7] p-4">
                  <p className="font-ui text-[13px] font-semibold text-[#0f6b71]">
                    Classification is ready. Open List of Documents to review folders and retention.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      closePipelineModal()
                      navigate(`/list-of-documents?job_id=${currentJobId}`)
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-[6px] bg-cy-teal px-4 py-2 text-[12px] font-semibold text-white hover:bg-cy-teal-hover transition-colors"
                  >
                    Review Documents
                  </button>
                </div>
              )}

              {jobStatus?.status === 'completed' && (
                <>
                  {!showDuplicates ? (
                    <div className="rounded-[8px] border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                      <p className="font-ui text-[13px] font-semibold text-[#166534] flex items-center gap-2">
                        <svg className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                        Processing completed successfully
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            closePipelineModal()
                            navigate(
                              currentJobId
                                ? `/list-of-documents?job_id=${encodeURIComponent(currentJobId)}`
                                : '/list-of-documents',
                            )
                          }}
                          className="inline-flex items-center gap-2 rounded-[6px] bg-cy-teal px-4 py-2 text-[12px] font-semibold text-white hover:bg-cy-teal-hover transition-colors"
                        >
                          View documents
                        </button>
                        <button
                          type="button"
                          onClick={loadDuplicateData}
                          className="inline-flex items-center gap-2 rounded-[6px] border border-[#169DA5] bg-white px-4 py-2 text-[12px] font-semibold text-[#169DA5] hover:bg-[#e6f6f7] transition-colors"
                        >
                          View duplicates
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => setShowDuplicates(false)}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#169DA5] hover:text-[#12848b] transition-colors"
                      >
                        <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                        </svg>
                        Back
                      </button>

                      {isLoadingDuplicates ? (
                        <div className="flex items-center gap-2 py-4">
                          <svg className="h-[16px] w-[16px] text-[#169DA5] animate-spin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" opacity="0.3" />
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                          </svg>
                          <p className="font-ui text-[12px] font-normal text-[#666666]">Loading duplicate data...</p>
                        </div>
                      ) : duplicateError ? (
                        <p className="font-ui text-[12px] font-normal text-[#c62828]">{duplicateError}</p>
                      ) : duplicateData ? (
                        <div className="space-y-3 border-t-4 border-cy-teal bg-[#f8fafc] p-6 rounded-[8px]">
                          <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="border-b border-[#e2e8f0] bg-[#f0f4f8]">
                                  {DUPLICATE_COLUMNS.map((column) => (
                                    <th
                                      key={column.label}
                                      className="px-4 py-3 text-left font-semibold text-[#1f1f1f]"
                                    >
                                      {getDisplayHeader(column.label)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {duplicateData.rows.map((row: any, idx: number) => (
                                  <tr key={idx} className="border-b border-[#e2e8f0] hover:bg-[#f0fdf4] transition-colors">
                                    {DUPLICATE_COLUMNS.map((column) => (
                                      <td key={column.label} className="px-4 py-3 text-[#475569]">
                                        {column.label === 'Confirm Duplicate' ? (
                                          <div className="flex items-center justify-center">
                                            <input
                                              type="checkbox"
                                              defaultChecked={isConfirmDuplicateChecked(row as Record<string, unknown>, column.keys)}
                                              aria-label="Confirm duplicate"
                                              className="h-4 w-4 cursor-pointer"
                                            />
                                          </div>
                                        ) : (
                                          getColumnValue(row as Record<string, unknown>, column.keys)
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="font-ui text-[11px] font-normal text-[#94a3b8] mt-4">
                            Showing first 10 rows
                          </p>
                          <button
                            type="button"
                            onClick={handleDownloadDuplicates}
                            className="inline-flex items-center gap-2 rounded-[6px] bg-cy-teal px-4 py-2 text-[12px] font-semibold text-white hover:bg-cy-teal-hover transition-colors shadow-md"
                          >
                            <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                            </svg>
                            Download
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}

              {jobStatus?.status === 'failed' && (
                <div className="rounded-[8px] border border-[#fecaca] bg-[#fee2e2] p-4">
                  <p className="font-ui text-[13px] font-semibold text-[#991b1b]">
                    Processing failed. {jobStatus?.message || 'Please try uploading again.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}
