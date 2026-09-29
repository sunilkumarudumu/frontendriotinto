import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getJobStatus, type JobStatus } from '../api/client'

/**
 * Global job context to track the current processing job across pages.
 * This persists the job_id so users don't lose it on page refresh.
 */

type JobContextType = {
  jobId: string | null
  jobStatus: JobStatus | null
  setJobId: (id: string | null) => void
}

const JobContext = createContext<JobContextType | undefined>(undefined)

export function JobProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const urlJobId = new URLSearchParams(location.search).get('job_id')
  const [jobId, setJobIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('job_id') || localStorage.getItem('currentJobId') || null
    }
    return null
  })
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)

  useEffect(() => {
    if (urlJobId) {
      setJobIdState(urlJobId)
      localStorage.setItem('currentJobId', urlJobId)
    }
  }, [location.search])

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
        setJobStatus(status)
        if (status.status === 'processing' || status.status === 'queued' || status.status === 'awaiting_duplicate_review') {
          nextDelay = 1000
        }
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'awaiting_confirmation') {
          return
        }
      } catch {
        nextDelay = 2000
      }

      if (isActive) pollTimeout = setTimeout(poll, nextDelay)
    }

    poll()
    return () => {
      isActive = false
      if (pollTimeout) clearTimeout(pollTimeout)
    }
  }, [jobId])

  const setJobId = (id: string | null) => {
    setJobIdState(id)
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('currentJobId', id)
      } else {
        localStorage.removeItem('currentJobId')
      }
    }

    const params = new URLSearchParams(location.search)
    if (id) params.set('job_id', id)
    else params.delete('job_id')
    navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true })
  }

  return (
    <JobContext.Provider value={{ jobId: urlJobId || jobId, jobStatus, setJobId }}>
      {children}
    </JobContext.Provider>
  )
}

export function useJob() {
  const context = useContext(JobContext)
  if (context === undefined) {
    throw new Error('useJob must be used within a JobProvider')
  }
  return context
}
