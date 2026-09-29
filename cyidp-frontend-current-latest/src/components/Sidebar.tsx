import { Link, useLocation } from 'react-router-dom'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faCopy,
  faBrain,
  faClipboard,
  faUpload,
  faHome,
} from '@fortawesome/free-solid-svg-icons'
import { useJob } from '../context/JobContext'
import { useUser } from '../context/UserContext'

type NavItem = {
  id: string
  lines: string[]
  icon: IconDefinition
}

const navItems: NavItem[] = [
  { id: 'upload', lines: ['Upload'], icon: faUpload },
  { id: 'duplicates', lines: ['Duplicate', 'Detection'], icon: faCopy },
  { id: 'intelligence', lines: ['Intelligence', 'Classification'], icon: faBrain },
  { id: 'metadata', lines: ['Metadata'], icon: faClipboard },
]

function FaIcon({ icon }: { icon: IconDefinition }) {
  const [width, height, , , svgPathData] = icon.icon
  const paths = Array.isArray(svgPathData) ? svgPathData : [svgPathData]

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: 15, height: 15 }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${width} ${height}`}
        width={15}
        height={15}
        style={{ width: 15, height: 15, minWidth: 15, minHeight: 15 }}
        aria-hidden="true"
        role="img"
      >
        {paths.map((d) => (
          <path key={d} fill="currentColor" d={d} />
        ))}
      </svg>
    </span>
  )
}

function HomeIcon({ icon }: { icon: IconDefinition }) {
  const [width, height, , , svgPathData] = icon.icon
  const paths = Array.isArray(svgPathData) ? svgPathData : [svgPathData]

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-[#169DA5]"
      style={{ width: 30, height: 30 }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${width} ${height}`}
        width={30}
        height={30}
        style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}
        aria-hidden="true"
        role="img"
      >
        {paths.map((d) => (
          <path key={d} fill="currentColor" d={d} />
        ))}
      </svg>
    </span>
  )
}

type SidebarProps = {
  activeId?: string | null
}

const routeMap: Record<string, string> = {
  upload: '/upload',
  duplicates: '/duplicate',
  metadata: '/metadata',
  intelligence: '/list-of-documents',
}

export default function Sidebar({ activeId = 'duplicates' }: SidebarProps) {
  const location = useLocation()
  const { jobId } = useJob()
  const { user } = useUser()
  const currentPath = location.pathname
  const canUpload = user?.role === 'admin'
  const visibleNavItems = canUpload ? navItems : navItems.filter((item) => item.id !== 'upload')
  const homeRoute = canUpload ? '/upload' : '/duplicate'

  return (
    <aside className="relative z-30 flex w-[95px] shrink-0 flex-col bg-white shadow-[2px_0_18px_rgba(0,0,0,0.16)]">
      <Link to={homeRoute} className="flex h-[80px] w-full items-center justify-center overflow-hidden bg-[#f5f5f5] hover:bg-[#ebebeb] transition-colors">
        <HomeIcon icon={faHome} />
      </Link>

      <nav className="flex flex-col">
        {visibleNavItems.map((item, index) => {
          const hasRoute = item.id in routeMap
          const active = item.id === activeId || routeMap[item.id] === currentPath

          const baseClassName = `group box-border flex h-[77px] min-h-[77px] max-h-[77px] w-[95px] min-w-[95px] max-w-[95px] cursor-pointer flex-col items-center justify-center gap-2 border-b border-cy-border px-1 ${
            index === 0 ? 'border-t border-cy-border ' : ''
          }${
            active
              ? 'bg-[#169DA5] text-white'
              : 'bg-cy-sidebar text-[#169DA5] hover:bg-[#169DA5] hover:text-white'
          }`

          const content = (
            <>
              <FaIcon icon={item.icon} />
              <span
                className={`font-ui w-full text-center text-[11px] leading-[15px] font-normal ${
                  active ? 'text-white' : 'text-[#272727] group-hover:text-white'
                }`}
              >
                {item.lines.map((line) => (
                  <span key={line} className="block w-full text-center">
                    {line}
                  </span>
                ))}
              </span>
            </>
          )

          const route = routeMap[item.id]
          const target = jobId && item.id !== 'upload'
            ? `${route}?job_id=${encodeURIComponent(jobId)}`
            : route

          if (hasRoute) {
            return (
              <Link key={item.id} to={target} className={baseClassName}>
                {content}
              </Link>
            )
          }

          return (
            <button key={item.id} type="button" className={baseClassName} disabled>
              {content}
            </button>
          )
        })}
      </nav>

      <div className="min-h-0 flex-1 bg-white" />
    </aside>
  )
}
