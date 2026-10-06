import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import Breadcrumbs from './Breadcrumbs'
import type { Crumb } from './Breadcrumbs'
import { getApiBaseUrl } from '../api/client'

type LayoutProps = {
  title?: string
  activeNavId?: string | null
  breadcrumbLabel?: string
  breadcrumbItems?: Crumb[]
  children: ReactNode
}

export default function Layout({
  title = 'Intelligence Classification',
  activeNavId = 'duplicates',
  breadcrumbLabel = 'Home',
  breadcrumbItems,
  children,
}: LayoutProps) {
  const apiBase = getApiBaseUrl()
  return (
    <div className="flex min-h-svh w-full bg-cy-page">
      <Sidebar activeId={activeNavId} />

      <div className="flex min-w-0 flex-1 flex-col px-5 pt-0 pb-5">
        <Header title={title} />
        <p className="mt-1 truncate text-[11px] text-[#6b7280]" title={apiBase}>
          Frontend: Azure Static Web App · Backend API: {apiBase || window.location.origin}
        </p>
        <div className="mt-3">
          <Breadcrumbs label={breadcrumbLabel} items={breadcrumbItems} />
        </div>
        <div className="mt-5 flex min-h-0 flex-1 flex-col bg-white shadow-[0_3px_14px_rgba(0,0,0,0.10)]">
          {children}
        </div>
      </div>
    </div>
  )
}
