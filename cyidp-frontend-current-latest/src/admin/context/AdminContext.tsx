import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type AdminUser = {
  username: string
  initials: string
}

type AdminContextType = {
  admin: AdminUser | null
  setAdmin: (admin: AdminUser | null) => void
}

const ADMIN_STORAGE_KEY = 'cyidp_admin_session'

const AdminContext = createContext<AdminContextType | undefined>(undefined)

function loadAdmin(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [admin, setAdminState] = useState<AdminUser | null>(() => loadAdmin())

  useEffect(() => {
    if (admin) {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(admin))
    } else {
      localStorage.removeItem(ADMIN_STORAGE_KEY)
    }
  }, [admin])

  const setAdmin = (next: AdminUser | null) => {
    setAdminState(next)
  }

  const value = useMemo(
    () => ({ admin, setAdmin }),
    [admin],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const context = useContext(AdminContext)
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider')
  }
  return context
}
