export const ADMIN_PASSWORD = 'super admin'

export const ADMIN_USERNAMES = ['Suresh', 'Rishee', 'Shiva'] as const

export type AdminUsername = (typeof ADMIN_USERNAMES)[number]

export function isValidAdminLogin(username: string, password: string): boolean {
  const matched = ADMIN_USERNAMES.some(
    (name) => name.toLowerCase() === username.trim().toLowerCase(),
  )
  return matched && password === ADMIN_PASSWORD
}

export function normalizeAdminUsername(username: string): string {
  const found = ADMIN_USERNAMES.find(
    (name) => name.toLowerCase() === username.trim().toLowerCase(),
  )
  return found ?? username.trim()
}
