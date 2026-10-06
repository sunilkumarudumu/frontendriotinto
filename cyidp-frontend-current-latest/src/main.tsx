import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getApiBaseUrl } from './api/client'

const apiBase = getApiBaseUrl()
if (typeof window !== 'undefined') {
  ;(window as Window & { __CYIDP_API_BASE__?: string }).__CYIDP_API_BASE__ = apiBase
  console.info('[CY-IDP] Frontend host', window.location.origin)
  console.info('[CY-IDP] Backend API', apiBase)
  console.info(
    '[CY-IDP] After Start Process the browser calls',
    `${apiBase}/api/jobs/<job_id>/start then ${apiBase}/api/jobs/<job_id>/status`,
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
