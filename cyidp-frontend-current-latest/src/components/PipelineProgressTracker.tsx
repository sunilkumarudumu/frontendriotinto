import { useEffect, useRef, useState } from 'react'
import { getJobStatus, type JobStatus } from '../api/client'

const TEAL = '#169DA5'
const TEAL_SOFT = '#e6f6f7'
const TEAL_BORDER = '#b5dde0'
const TEAL_TEXT = '#0f6b71'
const GREEN = '#029b03'
const AMBER = '#dd7002'
const AMBER_SOFT = '#fff8eb'
const AMBER_BORDER = '#f5d9a8'
const RED = '#ef343f'
const RED_SOFT = '#fff1f2'
const RED_BORDER = '#fecaca'

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

type PhaseState = 'done' | 'active' | 'waiting' | 'pending'

type WorkflowPhase = {
  id: string
  label: string
  hint: string
  state: PhaseState
}

type WorkflowView = {
  title: string
  detail: string
  progress: number
  phases: WorkflowPhase[]
  tone: 'running' | 'waiting' | 'failed' | 'done'
  cta?: 'duplicates' | 'documents' | null
}

function stageRank(stage: string | undefined): number {
  const order = [
    'basic',
    'review',
    'advanced',
    'docint',
    'post_ocr',
    'asset_classification',
    'llm',
    'trpryv',
    'completed',
  ]
  const index = order.indexOf(stage || '')
  return index < 0 ? -1 : index
}

function isPostOcrReviewStatus(jobStatus: JobStatus): boolean {
  if (jobStatus.status !== 'awaiting_duplicate_review') return false
  const stage = String(jobStatus.stage || '').toLowerCase()
  const message = String(jobStatus.message || '')
  // Prefer explicit signals; stage alone is enough after backend fix.
  return (
    stage === 'post_ocr' ||
    /post-?ocr/i.test(message) ||
    /post-ocr document/i.test(message)
  )
}

function isAdvancedReviewStatus(jobStatus: JobStatus): boolean {
  return (
    jobStatus.status === 'awaiting_duplicate_review' && !isPostOcrReviewStatus(jobStatus)
  )
}

/**
 * User-facing steps (order matches when work actually happens):
 * 0 Find duplicates · 1 Read content · 2 Review pairs · 3 Classify · 4 Done
 *
 * "Review pairs" stays pending until a pair actually needs a decision
 * (Advanced or Post-OCR). Skipping Advanced must NOT mark review done —
 * Post-OCR can still surface pairs later.
 */
function resolvePhaseCursor(jobStatus: JobStatus): {
  index: number
  waitingReview: boolean
  readAlongsideReview: boolean
} {
  const status = jobStatus.status
  const stage = String(jobStatus.stage || '').toLowerCase()
  const rank = stageRank(stage)

  if (status === 'completed' || status === 'awaiting_confirmation') {
    return { index: 4, waitingReview: false, readAlongsideReview: false }
  }
  if (status === 'failed') {
    return {
      index: Math.max(
        0,
        Math.min(3, rank <= stageRank('advanced') ? 0 : rank <= stageRank('post_ocr') ? 1 : 3),
      ),
      waitingReview: false,
      readAlongsideReview: false,
    }
  }

  if (isPostOcrReviewStatus(jobStatus)) {
    // OCR already finished; hold on review before classify.
    return { index: 2, waitingReview: true, readAlongsideReview: false }
  }
  if (isAdvancedReviewStatus(jobStatus)) {
    // Advanced pairs wait; unique/non-held files can still OCR.
    return { index: 2, waitingReview: true, readAlongsideReview: true }
  }

  if (['asset_classification', 'llm', 'trpryv'].includes(stage)) {
    return { index: 3, waitingReview: false, readAlongsideReview: false }
  }
  if (stage === 'docint' || stage === 'post_ocr' || rank >= stageRank('docint')) {
    // Still reading / Post-OCR scanning — review may still be needed later.
    return { index: 1, waitingReview: false, readAlongsideReview: false }
  }
  if (rank >= 0) {
    return { index: 0, waitingReview: false, readAlongsideReview: false }
  }
  return { index: 0, waitingReview: false, readAlongsideReview: false }
}

function getPipelineProgress(jobStatus: JobStatus | null): number {
  if (!jobStatus) return 0

  if (jobStatus.status === 'completed' || jobStatus.status === 'awaiting_confirmation') {
    return 100
  }
  if (isPostOcrReviewStatus(jobStatus)) {
    return 72
  }
  if (isAdvancedReviewStatus(jobStatus)) {
    return 48
  }

  const rank = stageRank(jobStatus.stage)
  const stageBased = rank < 0 ? 0 : clampPercent(((rank + 1) / 8) * 100)

  if (typeof jobStatus.progress === 'number' && jobStatus.progress > 0) {
    if (rank >= 0 && rank < stageRank('asset_classification')) {
      return clampPercent(Math.min(Math.max(jobStatus.progress, stageBased * 0.85), 80))
    }
    return clampPercent(Math.max(jobStatus.progress, stageBased * 0.85))
  }
  return stageBased
}

function buildWorkflowView(jobStatus: JobStatus): WorkflowView {
  const status = jobStatus.status
  const stage = jobStatus.stage || ''
  const message = (jobStatus.message || '').trim()
  const progress = getPipelineProgress(jobStatus)
  const cursor = resolvePhaseCursor(jobStatus)

  const isFailed = status === 'failed'
  const isCompleted = status === 'completed'
  const isConfirm = status === 'awaiting_confirmation'
  const isAdvReview = isAdvancedReviewStatus(jobStatus)
  const isPostOcrReview = isPostOcrReviewStatus(jobStatus)

  let title = 'Processing your documents…'
  let detail = message || 'We are working through each step. This can take a few minutes.'
  let tone: WorkflowView['tone'] = 'running'
  let cta: WorkflowView['cta'] = null

  if (isFailed) {
    title = 'Processing stopped'
    detail = message || 'Something went wrong. Try uploading again or contact support.'
    tone = 'failed'
  } else if (isCompleted) {
    title = 'All done'
    detail = message || 'Your documents finished processing. Open the list to review results.'
    tone = 'done'
    cta = 'documents'
  } else if (isConfirm) {
    title = 'Ready for your review'
    detail =
      message ||
      'Classification is ready. Open List of Documents to check folders and retention.'
    tone = 'done'
    cta = 'documents'
  } else if (isAdvReview) {
    title = 'Action needed: review duplicate pairs'
    detail =
      message ||
      'Some files look alike. Open Duplicate Detection to Process or Stop each pair. Other files keep moving in the background.'
    tone = 'waiting'
    cta = 'duplicates'
  } else if (isPostOcrReview) {
    title = 'Action needed: review Post-OCR pairs'
    detail =
      message ||
      'New pairs were found after reading the documents. Process or Stop them so classification can continue.'
    tone = 'waiting'
    cta = 'duplicates'
  } else if (stage === 'docint') {
    title = 'Reading document content'
    detail = message || 'Extracting text from each file so we can classify them accurately.'
  } else if (stage === 'post_ocr') {
    title = 'Checking content for more duplicates'
    detail =
      message ||
      'Comparing extracted text. If a pair is found, you will be asked to review it next.'
  } else if (stage === 'asset_classification' || stage === 'llm') {
    title = 'Classifying documents'
    detail = message || 'Assigning folder, type, and retention suggestions with AI.'
  } else if (stage === 'trpryv') {
    title = 'Mapping retention rules'
    detail = message || 'Applying retention periods from your assigned codes.'
  } else if (stage === 'advanced') {
    title = 'Looking for similar documents'
    detail = message || 'Comparing files for duplicates and contained content.'
  } else if (stage === 'review') {
    title = 'Preparing files for review'
    detail = message || 'Converting and validating documents before deeper checks.'
  } else if (stage === 'basic') {
    title = 'Checking for exact duplicates'
    detail = message || 'Scanning file fingerprints for identical copies.'
  } else if (status === 'queued') {
    title = 'Queued to start'
    detail = message || 'Your job is next in line.'
  }

  const phases: WorkflowPhase[] = [
    {
      id: 'detect',
      label: 'Find duplicates',
      hint: 'Basic + Advanced scan',
      state: isFailed && cursor.index === 0 ? 'active' : cursor.index > 0 ? 'done' : 'active',
    },
    {
      id: 'read',
      label: 'Read content',
      hint: 'OCR & text extract',
      state: isFailed
        ? 'pending'
        : cursor.index > 1 || (cursor.waitingReview && isPostOcrReview)
          ? 'done'
          : cursor.index === 1 || cursor.readAlongsideReview
            ? 'active'
            : 'pending',
    },
    {
      id: 'review',
      label: 'Review pairs',
      hint: 'Only if a pair is found',
      state: isFailed
        ? 'pending'
        : cursor.waitingReview
          ? 'waiting'
          : // Never mark done just because Advanced found nothing —
            // Post-OCR can still create pairs. Done only at classify/finish.
            cursor.index >= 3
            ? 'done'
            : 'pending',
    },
    {
      id: 'classify',
      label: 'Classify',
      hint: 'AI folder & retention',
      state: isFailed
        ? 'pending'
        : cursor.index >= 4
          ? 'done'
          : cursor.index === 3 && !cursor.waitingReview
            ? 'active'
            : 'pending',
    },
  ]

  return { title, detail, progress, phases, tone, cta }
}

function PhaseIcon({ state }: { state: PhaseState }) {
  if (state === 'done') {
    return (
      <span
        className="flex size-[28px] items-center justify-center rounded-full text-white shadow-sm"
        style={{ backgroundColor: GREEN }}
      >
        <svg className="h-[14px] w-[14px]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M6.2 11.2 2.8 7.8l1.1-1.1 2.3 2.3 5-5 1.1 1.1z" />
        </svg>
      </span>
    )
  }
  if (state === 'waiting') {
    return (
      <span
        className="flex size-[28px] items-center justify-center rounded-full border-2 bg-white"
        style={{ borderColor: AMBER, color: AMBER }}
      >
        <svg className="h-[12px] w-[12px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 11H7v-2h4V7h2z" />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span
        className="relative flex size-[28px] items-center justify-center rounded-full border-2 bg-white"
        style={{ borderColor: TEAL }}
      >
        <span
          className="size-[10px] animate-pulse rounded-full"
          style={{ backgroundColor: TEAL }}
        />
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-20"
          style={{ backgroundColor: TEAL }}
        />
      </span>
    )
  }
  return (
    <span className="flex size-[28px] items-center justify-center rounded-full border-2 border-[#d9e0e6] bg-white">
      <span className="size-[8px] rounded-full bg-[#d9e0e6]" />
    </span>
  )
}

type PipelineProgressTrackerProps = {
  jobId: string | null
  /** When provided, the tracker renders this status and does not poll. */
  status?: JobStatus | null
  compact?: boolean
  onStatusChange?: (status: JobStatus) => void
  onOpenDuplicates?: () => void
  onOpenDocuments?: () => void
}

export default function PipelineProgressTracker({
  jobId,
  status: controlledStatus,
  compact = false,
  onStatusChange,
  onOpenDuplicates,
  onOpenDocuments,
}: PipelineProgressTrackerProps) {
  const [polledStatus, setPolledStatus] = useState<JobStatus | null>(null)
  const highestProgressRef = useRef(0)
  const isControlled = controlledStatus !== undefined

  useEffect(() => {
    highestProgressRef.current = 0
    if (isControlled || !jobId) {
      if (!jobId) setPolledStatus(null)
      return
    }

    let pollTimeout: ReturnType<typeof setTimeout> | null = null
    let isActive = true
    let lastKey = ''

    const poll = async () => {
      let nextDelay = 1200
      try {
        const next = await getJobStatus(jobId)
        if (!isActive) return
        setPolledStatus(next)

        const key = `${next.status}|${next.stage}|${next.progress}|${next.message}`
        if (key !== lastKey) {
          lastKey = key
          onStatusChange?.(next)
        }

        if (
          next.status === 'completed' ||
          next.status === 'failed' ||
          next.status === 'awaiting_confirmation'
        ) {
          return
        }

        if (
          next.status === 'processing' ||
          next.status === 'awaiting_duplicate_review' ||
          next.status === 'queued'
        ) {
          nextDelay = 2000
        }
      } catch {
        nextDelay = 2000
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
  }, [jobId, isControlled, onStatusChange])

  const jobStatus = isControlled ? controlledStatus ?? null : polledStatus
  if (!jobId || !jobStatus) {
    if (!jobId) return null
    // Controlled mode while status is still null — show a calm starting state.
    return (
      <div
        className={`w-full rounded-[8px] border px-5 py-5 ${compact ? 'max-w-none' : 'max-w-[640px]'}`}
        style={{ borderColor: TEAL_BORDER, backgroundColor: TEAL_SOFT }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-block size-[18px] animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: TEAL, borderTopColor: 'transparent' }}
            aria-hidden="true"
          />
          <div>
            <p className="font-ui text-[13px] font-semibold" style={{ color: TEAL_TEXT }}>
              Starting pipeline…
            </p>
            <p className="mt-0.5 font-ui text-[12px] text-[#5e738f]">
              Preparing your documents for processing.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const view = buildWorkflowView(jobStatus)
  highestProgressRef.current = Math.max(highestProgressRef.current, view.progress)
  const progress = highestProgressRef.current

  const panelStyle =
    view.tone === 'waiting'
      ? { borderColor: AMBER_BORDER, backgroundColor: AMBER_SOFT }
      : view.tone === 'failed'
        ? { borderColor: RED_BORDER, backgroundColor: RED_SOFT }
        : view.tone === 'done'
          ? { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }
          : { borderColor: TEAL_BORDER, backgroundColor: TEAL_SOFT }

  const accent =
    view.tone === 'waiting' ? AMBER : view.tone === 'failed' ? RED : view.tone === 'done' ? GREEN : TEAL

  const radius = compact ? 30 : 38
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress / 100)
  const ringSize = compact ? 76 : 92

  return (
    <div
      className={`w-full rounded-[8px] border ${compact ? 'px-4 py-3' : 'px-5 py-5'} ${
        compact ? '' : 'max-w-[640px]'
      }`}
      style={panelStyle}
    >
      <div className={`flex gap-4 ${compact ? 'items-center' : 'flex-col items-center sm:flex-row sm:items-start'}`}>
        <div className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
          <svg className="-rotate-90" width={ringSize} height={ringSize} viewBox="0 0 100 100" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={view.tone === 'waiting' ? '#f5d9a8' : view.tone === 'failed' ? '#fecaca' : '#c5e8eb'}
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={accent}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-ui text-[15px] font-bold leading-none" style={{ color: accent }}>
              {progress}%
            </span>
            <span className="mt-1 font-ui text-[9px] font-medium uppercase tracking-wide text-[#69718f]">
              {view.tone === 'waiting' ? 'Waiting' : view.tone === 'done' ? 'Done' : view.tone === 'failed' ? 'Failed' : 'Running'}
            </span>
          </div>
        </div>

        <div className={`min-w-0 flex-1 ${compact ? '' : 'text-center sm:text-left'}`}>
          <p className="font-ui text-[14px] font-semibold leading-snug" style={{ color: accent === TEAL ? TEAL_TEXT : accent }}>
            {view.title}
          </p>
          <p className="mt-1 font-ui text-[12px] leading-relaxed text-[#475569]">{view.detail}</p>

          {(view.cta === 'duplicates' && onOpenDuplicates) || (view.cta === 'documents' && onOpenDocuments) ? (
            <div className={`mt-3 flex flex-wrap gap-2 ${compact ? '' : 'justify-center sm:justify-start'}`}>
              {view.cta === 'duplicates' && onOpenDuplicates && (
                <button
                  type="button"
                  onClick={onOpenDuplicates}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-3.5 py-2 font-ui text-[12px] font-semibold text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: TEAL }}
                >
                  Open Duplicate Detection
                  <svg className="h-[12px] w-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              {view.cta === 'documents' && onOpenDocuments && (
                <button
                  type="button"
                  onClick={onOpenDocuments}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-3.5 py-2 font-ui text-[12px] font-semibold text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: TEAL }}
                >
                  Open List of Documents
                  <svg className="h-[12px] w-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mt-5 grid grid-cols-4 gap-1 ${compact ? '' : 'max-w-[560px] mx-auto'}`}>
        {view.phases.map((phase, index) => {
          const labelColor =
            phase.state === 'waiting'
              ? AMBER
              : phase.state === 'active'
                ? TEAL_TEXT
                : phase.state === 'done'
                  ? GREEN
                  : '#94a3b8'
          const connectorDone = phase.state === 'done'

          return (
            <div key={phase.id} className="relative flex flex-col items-center gap-1.5 px-0.5">
              {index < view.phases.length - 1 && (
                <span
                  className="absolute left-[calc(50%+16px)] right-[calc(-50%+16px)] top-[13px] h-[2px]"
                  style={{ backgroundColor: connectorDone ? '#86efac' : '#d9e0e6' }}
                  aria-hidden="true"
                />
              )}
              <PhaseIcon state={phase.state} />
              <span className="font-ui text-[11px] font-semibold leading-tight text-center" style={{ color: labelColor }}>
                {phase.label}
              </span>
              {!compact && (
                <span className="hidden font-ui text-[10px] leading-tight text-[#94a3b8] text-center sm:block">
                  {phase.hint}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {view.tone === 'waiting' && (
        <p className="mt-4 rounded-[6px] border border-[#f5d9a8] bg-white/70 px-3 py-2 font-ui text-[11px] leading-relaxed text-[#78716c]">
          Tip: files that are not in a pair continue automatically (read → classify). Only the pairs below need your Process / Stop decision.
        </p>
      )}
    </div>
  )
}
