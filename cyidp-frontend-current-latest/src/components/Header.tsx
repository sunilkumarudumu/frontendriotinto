import type { ReactNode } from 'react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useAdmin } from '../admin/context/AdminContext'

function HeaderIconButton({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-[32px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-cy-teal text-white transition-colors hover:bg-cy-teal-hover"
    >
      {children}
    </button>
  )
}

type HeaderProps = {
  title?: string
}

export default function Header({ title = 'Intelligence Classification' }: HeaderProps) {
  const navigate = useNavigate()
  const { user, setUser } = useUser()
  const { setAdmin } = useAdmin()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => {
    setIsProfileMenuOpen(false)
    setAdmin(null)
    setUser(null)
    navigate('/login')
  }

  const goTo = (path: string) => {
    setIsProfileMenuOpen(false)
    navigate(path)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false)
      }
    }

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isProfileMenuOpen])

  return (
    <header className="relative z-20 flex h-16 w-full shrink-0 items-center justify-between bg-white pr-4 pl-3 shadow-[0_3px_12px_rgba(0,0,0,0.10)]">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center rounded-[4px] bg-[#169DA5] px-3 py-1">
          <span className="font-ui text-[16px] leading-none font-bold tracking-[0.02em] text-white">CY-IDP</span>
        </div>
        <h1 className="font-ui text-[19px] leading-none font-semibold text-[#252525]">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-[8px]">
          <HeaderIconButton label="Compose">
            <svg className="h-[16px] w-[16px]" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
              <path d="M471.6 21.7c-28.9-28.9-75.7-28.9-104.6 0L339.8 48.9l123.3 123.3 27.2-27.2c28.9-28.9 28.9-75.7 0-104.6L471.6 21.7zM317.1 71.6 118.6 270.1c-11.8 11.8-20.6 26.3-25.5 42.3L64.9 405.5c-2.8 9.2-.3 19.2 6.5 26s16.8 9.3 26 6.5l93.1-28.2c16-4.9 30.5-13.7 42.3-25.5l198.5-198.5L317.1 71.6zM80 64C35.8 64 0 99.8 0 144v288c0 44.2 35.8 80 80 80h288c44.2 0 80-35.8 80-80V304c0-17.7-14.3-32-32-32s-32 14.3-32 32v128c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V144c0-8.8 7.2-16 16-16h128c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z" />
            </svg>
          </HeaderIconButton>

          <HeaderIconButton label="Favorites">
            <svg className="h-[16px] w-[16px]" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true">
              <path d="M287.9 17.8 354 150.2l148.2 21.3c26.2 3.8 36.7 35.9 17.7 54.4L412.6 329.7l25.3 146.6c4.5 26.3-23.2 46-46.4 33.7L288 441.2 184.5 510c-23.2 12.3-50.9-7.4-46.4-33.7l25.3-146.6L56.1 225.9c-19-18.5-8.5-50.6 17.7-54.4L222 150.2l66-132.4z" />
            </svg>
          </HeaderIconButton>

          <HeaderIconButton label="Notifications">
            <svg className="h-[16px] w-[15px]" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
              <path d="M224 0c-17.7 0-32 14.3-32 32v19.2C119 66 64 130.6 64 208v72.4c0 43.7-16.4 85.8-46.1 117.9L5.1 412.1c-8.6 9.3-6.3 23.9 4.8 30 47.5 26.3 102.4 41.9 160.1 46.9 7.3 13.7 21.7 23 38.2 23h31.6c16.5 0 30.9-9.3 38.2-23 57.7-5 112.6-20.6 160.1-46.9 11.1-6.1 13.4-20.7 4.8-30l-12.8-13.8C400.4 366.2 384 324.1 384 280.4V208c0-77.4-55-142-128-156.8V32c0-17.7-14.3-32-32-32z" />
            </svg>
          </HeaderIconButton>
        </div>

        <div ref={popupRef} className="relative">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex cursor-pointer items-center gap-3 border-0 bg-transparent p-0"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cy-red font-ui text-[14px] font-semibold tracking-[0.01em] text-white">
              {user?.initials || 'N/A'}
            </div>
            <div className="text-left leading-[1.05]">
              <div className="flex items-center gap-1.5">
                <p className="font-ui text-[13px] font-normal text-[#333333]">
                  {user?.username || 'Guest'}
                </p>
                <svg className="h-[12px] w-[12px] text-[#999999]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </div>
              <p className="font-ui text-[13px] font-bold text-[#111111]">{user?.email || 'No email'}</p>
            </div>
            <svg
              className="ml-1.5 h-[14px] w-[14px] shrink-0 text-[#333333]"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.2 4.4 6 8.1l3.8-3.7"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {isProfileMenuOpen && (
            <div className="absolute top-full right-0 z-50 mt-2 w-48 overflow-hidden rounded-[6px] border border-[#e0e0e0] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <button
                type="button"
                onClick={() => goTo('/profile')}
                className="w-full cursor-pointer border-0 border-b border-[#eeeeee] bg-transparent px-4 py-3 text-left font-ui text-[13px] font-normal text-[#333333] transition-colors hover:bg-[#f5f5f5]"
              >
                Profile
              </button>
              <button
                type="button"
                onClick={() => goTo('/reset-password')}
                className="w-full cursor-pointer border-0 border-b border-[#eeeeee] bg-transparent px-4 py-3 text-left font-ui text-[13px] font-normal text-[#333333] transition-colors hover:bg-[#f5f5f5]"
              >
                Reset Password
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full cursor-pointer border-0 bg-transparent px-4 py-3 text-left font-ui text-[13px] font-normal text-[#333333] transition-colors hover:bg-[#f5f5f5]"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
