import { useState, type FormEvent } from 'react'
import Layout from '../components/Layout'
import { useUser } from '../context/UserContext'

export default function Profile() {
  const { user, setUser } = useUser()
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!username.trim() || !email.trim()) {
      setError('Username and email are required.')
      return
    }

    const trimmedUsername = username.trim()
    const trimmedEmail = email.trim()
    const initials = trimmedUsername.substring(0, 2).toUpperCase()

    setUser({
      username: trimmedUsername,
      email: trimmedEmail,
      initials,
      role: user?.role ?? 'user',
    })
    setMessage('Profile updated successfully.')
  }

  return (
    <Layout title="Profile" activeNavId={null} breadcrumbLabel="Profile">
      <div className="flex flex-1 flex-col p-6">
        <div className="mx-auto w-full max-w-[520px] rounded-[8px] border border-[#e0e0e0] bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-cy-red font-ui text-[22px] font-semibold text-white">
              {user?.initials || 'N/A'}
            </div>
            <div>
              <h2 className="font-ui text-[18px] font-semibold text-[#1a1a1a]">My Profile</h2>
              <p className="font-ui text-[13px] text-[#666666]">View and update your account details</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-ui text-[12px] font-semibold text-[#333333]">Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-[38px] rounded-[5px] border border-[#d0d0d0] bg-white px-3 font-ui text-[13px] text-[#1f1f1f] outline-none focus:border-cy-teal"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-ui text-[12px] font-semibold text-[#333333]">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[38px] rounded-[5px] border border-[#d0d0d0] bg-white px-3 font-ui text-[13px] text-[#1f1f1f] outline-none focus:border-cy-teal"
              />
            </label>

            {error && (
              <p className="font-ui text-[12px] text-[#b91c1c]">{error}</p>
            )}
            {message && (
              <p className="font-ui text-[12px] text-[#047857]">{message}</p>
            )}

            <button
              type="submit"
              className="mt-2 h-[40px] cursor-pointer rounded-[6px] border-0 bg-cy-teal px-4 font-ui text-[13px] font-semibold text-white transition-colors hover:bg-cy-teal-hover"
            >
              Save Changes
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}
