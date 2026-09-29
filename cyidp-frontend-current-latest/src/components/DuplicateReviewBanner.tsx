type Count = { done: number; total: number }

export type PipelineTracking = {
  ocr?: Count
  post_ocr?: Count
  waiting_review?: { advanced: number; post_ocr: number }
  classification?: Count
}

type DuplicateReviewBannerProps = {
  pendingCount: number
  reviewedCount: number
  advancedPending: number
  postOcrPending: number
  isFinding: boolean
  hasRows: boolean
  pipelineTracking?: PipelineTracking | null
}

function ProgressChip({
  label,
  done,
  total,
  tone = 'neutral',
}: {
  label: string
  done: number
  total: number
  tone?: 'neutral' | 'active' | 'done' | 'wait'
}) {
  if (total <= 0) return null
  const styles =
    tone === 'active'
      ? 'border-[#b5dde0] bg-[#e6f6f7] text-[#0f6b71]'
      : tone === 'done'
        ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
        : tone === 'wait'
          ? 'border-[#fcd34d] bg-[#fffbeb] text-[#92400e]'
          : 'border-[#d7dce6] bg-white text-[#475569]'
  return (
    <span className={`rounded-full border px-2.5 py-[2px] font-ui text-[11px] font-medium ${styles}`}>
      {label} {done}/{total}
    </span>
  )
}

export default function DuplicateReviewBanner({
  pendingCount,
  reviewedCount,
  advancedPending,
  postOcrPending,
  isFinding,
  hasRows,
  pipelineTracking,
}: DuplicateReviewBannerProps) {
  const ocrDone = pipelineTracking?.ocr?.done ?? 0
  const ocrTotal = pipelineTracking?.ocr?.total ?? 0
  const postOcrDone = pipelineTracking?.post_ocr?.done ?? 0
  const postOcrTotal = pipelineTracking?.post_ocr?.total ?? 0
  const classDone = pipelineTracking?.classification?.done ?? 0
  const classTotal = pipelineTracking?.classification?.total ?? 0

  const hasPipelineProgress = ocrTotal > 0 || postOcrTotal > 0 || classTotal > 0

  const progressRow = hasPipelineProgress ? (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <ProgressChip
        label="OCR unique docs"
        done={ocrDone}
        total={ocrTotal}
        tone={ocrTotal > 0 && ocrDone < ocrTotal ? 'active' : ocrDone >= ocrTotal && ocrTotal > 0 ? 'done' : 'neutral'}
      />
      <ProgressChip
        label="Post-OCR"
        done={postOcrDone}
        total={postOcrTotal}
        tone={
          postOcrTotal > 0 && postOcrDone < postOcrTotal
            ? 'active'
            : postOcrDone >= postOcrTotal && postOcrTotal > 0
              ? 'done'
              : 'neutral'
        }
      />
      <ProgressChip
        label="Classification"
        done={classDone}
        total={classTotal}
        tone={
          classTotal > 0 && classDone < classTotal
            ? 'active'
            : classDone >= classTotal && classTotal > 0
              ? 'done'
              : 'neutral'
        }
      />
    </div>
  ) : null

  if (isFinding && !hasRows) {
    return (
      <div className="rounded-[8px] border border-[#b5dde0] bg-[#e6f6f7] px-4 py-3">
        <p className="font-ui text-[13px] font-semibold text-[#0f6b71]">Looking for duplicate pairs…</p>
        <p className="mt-1 font-ui text-[12px] text-[#0f6b71]/80">
          This page shows pairs that need your decision, and tracks OCR / Post-OCR for unique files.
        </p>
        {progressRow}
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div className="rounded-[8px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-ui text-[13px] font-semibold text-[#92400e]">
              {pendingCount} pair{pendingCount === 1 ? '' : 's'} need your review
            </p>
            <p className="mt-1 font-ui text-[12px] text-[#78350f]">
              Classification results appear on Intelligence Classification Page.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {advancedPending > 0 && (
              <span className="rounded-full border border-[#fcd34d] bg-white px-2.5 py-[2px] font-ui text-[11px] font-medium text-[#92400e]">
                Advanced: {advancedPending} left
              </span>
            )}
            {postOcrPending > 0 && (
              <span className="rounded-full border border-[#fcd34d] bg-white px-2.5 py-[2px] font-ui text-[11px] font-medium text-[#92400e]">
                Post-OCR pairs: {postOcrPending} left
              </span>
            )}
            {reviewedCount > 0 && (
              <span className="rounded-full border border-[#d7dce6] bg-[#f8fafc] px-2.5 py-[2px] font-ui text-[11px] font-medium text-[#475569]">
                Reviewed: {reviewedCount}
              </span>
            )}
          </div>
        </div>
        {progressRow}
      </div>
    )
  }

  if (hasRows || hasPipelineProgress) {
    return (
      <div className="rounded-[8px] border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3">
        <p className="font-ui text-[13px] font-semibold text-[#166534]">
          {hasRows ? 'All current pairs reviewed' : 'No pairs need review right now'}
        </p>
        <p className="mt-1 font-ui text-[12px] text-[#15803d]">
          Unique files run OCR → Post-OCR here. When classification starts, open Intelligence Classification Page.
        </p>
        {progressRow}
      </div>
    )
  }

  return (
    <div className="rounded-[8px] border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
      <p className="font-ui text-[13px] font-semibold text-[#334155]">No duplicates need review</p>
      <p className="mt-1 font-ui text-[12px] text-[#64748b]">
        Unique files are handled automatically. Track OCR / Post-OCR here; classification opens on Intelligence Classification Page.
      </p>
      {progressRow}
    </div>
  )
}
