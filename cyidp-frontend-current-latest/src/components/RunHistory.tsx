import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listJobs, type JobSummary } from '../api/client'
import Layout from './Layout'
import { useUser } from '../context/UserContext'

const formatDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const statusLabel = (job: JobSummary) => {
  if (job.status === 'awaiting_confirmation') return 'Ready for review'
  if (job.status === 'awaiting_duplicate_review') return 'Waiting for review'
  return job.status.charAt(0).toUpperCase() + job.status.slice(1)
}

export default function RunHistory() {
  const navigate = useNavigate()
  const { user } = useUser()
  const canUpload = user?.role === 'admin'
  const [jobs, setJobs] = useState<JobSummary[]>(() => {
    try {
      const cached = sessionStorage.getItem('cyidp_run_history')
      return cached ? (JSON.parse(cached) as JobSummary[]) : []
    } catch {
      return []
    }
  })
  const [isLoading, setIsLoading] = useState(() => {
    try {
      return !sessionStorage.getItem('cyidp_run_history')
    } catch {
      return true
    }
  })
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const nextJobs = await listJobs()
      setJobs(nextJobs)
      try {
        sessionStorage.setItem('cyidp_run_history', JSON.stringify(nextJobs))
      } catch {
        // Session storage is optional; the API remains the source of truth.
      }
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load run history')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(interval)
  }, [])

  const openRun = (job: JobSummary) => {
    navigate(`/list-of-documents?job_id=${encodeURIComponent(job.job_id)}`)
  }

  return (
    <Layout title="Run History" activeNavId={null} breadcrumbLabel="Run History">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white p-6">
        <section className="rounded-[8px] border border-[#e0e0e0] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-ui text-[16px] font-bold text-[#1a1a1a]">Run History</h2>
          <p className="mt-1 text-[12px] text-[#64748b]">Select a run to view its documents, duplicates, and classifications.</p>
        </div>
        <div className="flex items-center gap-2">
          {canUpload && (
            <button
              type="button"
              onClick={() => navigate('/upload')}
              className="rounded-[6px] bg-cy-teal px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-cy-teal-hover"
            >
              Upload
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-[6px] border border-[#d0d0d0] px-3 py-1.5 text-[12px] font-semibold text-[#334155] hover:bg-[#f8fafc]"
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-5 text-[12px] text-[#64748b]">Loading runs...</p>
      ) : error ? (
        <p className="mt-5 text-[12px] text-[#b42318]">{error}</p>
      ) : jobs.length === 0 ? (
        <p className="mt-5 text-[12px] text-[#64748b]">No uploaded runs yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#e5e7eb] text-[#64748b]">
                <th className="px-2 py-2 font-semibold">Run</th>
                <th className="px-2 py-2 font-semibold">Uploaded</th>
                <th className="px-2 py-2 font-semibold">Documents</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Progress</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.job_id} className="border-b border-[#f1f5f9] last:border-b-0">
                  <td className="px-2 py-3 font-medium text-[#1f2937]">{job.blob_run_name || job.job_id}</td>
                  <td className="px-2 py-3 text-[#64748b]">{formatDate(job.created_at)}</td>
                  <td className="px-2 py-3 text-[#64748b]">{job.document_count == null ? '—' : job.document_count}</td>
                  <td className="px-2 py-3 text-[#334155]">{statusLabel(job)}</td>
                  <td className="px-2 py-3 text-[#334155]">{job.progress ?? 0}%</td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openRun(job)}
                      className="rounded-[6px] bg-cy-teal px-3 py-1.5 font-semibold text-white hover:bg-cy-teal-hover"
                    >
                      View run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </section>
      </div>
    </Layout>
  )
}
