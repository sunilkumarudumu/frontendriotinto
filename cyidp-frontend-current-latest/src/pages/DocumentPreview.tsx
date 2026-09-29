import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

const decodeSafe = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const basenameFromLabel = (label: string): string => {
  const trimmed = label.trim()
  if (!trimmed || trimmed === '-') return 'Document Preview'
  const slashNormalized = trimmed.replace(/\\/g, '/')
  const name = slashNormalized.split('/').pop() || trimmed
  return name.trim() || 'Document Preview'
}

export default function DocumentPreview() {
  const [searchParams] = useSearchParams()

  const fileUrl = useMemo(() => {
    const raw = searchParams.get('url') || ''
    return decodeSafe(raw)
  }, [searchParams])

  const fileName = useMemo(() => {
    const rawName = searchParams.get('name') || ''
    const decoded = decodeSafe(rawName)
    return basenameFromLabel(decoded)
  }, [searchParams])

  useEffect(() => {
    document.title = fileName
  }, [fileName])

  if (!fileUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] p-6">
        <div className="rounded-[8px] border border-[#cbd5e1] bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-[14px] font-semibold text-[#1e293b]">Unable to load document</p>
          <p className="mt-1 text-[12px] text-[#64748b]">Missing document URL.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#111827]">
      <div className="flex items-center border-b border-[#1f2937] bg-[#0f172a] px-4 py-2">
        <h1 className="truncate text-[14px] font-semibold text-white" title={fileName}>{fileName}</h1>
      </div>
      <iframe
        src={fileUrl}
        title={fileName}
        className="h-full w-full border-0 bg-[#111827]"
        loading="eager"
      />
    </div>
  )
}
