export type Crumb = {
  label: string
  href?: string
  icon?: 'home' | 'folder'
  current?: boolean
}

function CrumbIcon({ icon }: { icon: Crumb['icon'] }) {
  if (icon === 'folder') {
    return (
      <svg className="h-[11px] w-[13px] shrink-0" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
        <path d="M64 480H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H298.5c-17 0-33.3-6.7-45.3-18.7L226.7 50.7c-12-12-28.3-18.7-45.3-18.7H64C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64z" />
      </svg>
    )
  }

  return (
    <svg className="h-[18px] w-[21px] shrink-0" viewBox="0 0 1792 1792" fill="currentColor" aria-hidden="true">
      <path d="M1408 992v480q0 26-19 45t-45 19h-384v-384H704v384H320q-26 0-45-19t-19-45V992q0-1 .5-3t.5-3l575-474 575 474q1 2 1 6zm223-69-62 74q-8 9-21 11h-3q-13 0-21-7L832 424 140 1001q-12 8-24 7-13-2-21-11l-62-74q-8-10-7-23.5T37 878l719-599q32-26 76-26t76 26l244 204V288q0-14 9-23t23-9h192q14 0 23 9t9 23v408l212 177q10 8 11 21.5t-7 28.5z" />
    </svg>
  )
}

type BreadcrumbsProps = {
  label?: string
  items?: Crumb[]
}

export default function Breadcrumbs({ label = 'Home', items }: BreadcrumbsProps) {
  const trail: Crumb[] = items ?? [{ label, href: '#home', icon: 'home', current: true }]

  return (
    <div className="relative z-10 flex h-[26px] w-full shrink-0 items-center justify-between bg-[#169DA5] pr-5 pl-4 shadow-[0_2px_6px_rgba(0,0,0,0.12)]">
      <nav className="flex items-center gap-1.5" aria-label="Breadcrumb">
        {trail.map((crumb, index) => (
          <span key={crumb.label} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden="true" className="font-ui text-[11px] leading-none font-semibold text-white/80">
                /
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 font-ui text-[12px] leading-none font-semibold text-white"
            >
              <CrumbIcon icon={crumb.icon} />
              <span>{crumb.label}</span>
            </span>
          </span>
        ))}
      </nav>

    </div>
  )
}
