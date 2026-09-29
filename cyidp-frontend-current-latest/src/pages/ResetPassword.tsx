import { useState, type FormEvent } from 'react'
import Layout from '../components/Layout'

export default function ResetPassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError('All password fields are required.')
      return
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.')
      return
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from the current password.')
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setMessage('Password reset successfully.')
  }

  return (
    <Layout title="Reset Password" activeNavId={null} breadcrumbLabel="Reset Password">
      <div className="flex flex-1 flex-col p-6">
        <div className="mx-auto w-full max-w-[520px] rounded-[8px] border border-[#e0e0e0] bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="font-ui text-[18px] font-semibold text-[#1a1a1a]">Reset Password</h2>
            <p className="mt-1 font-ui text-[13px] text-[#666666]">
              Enter your current password and choose a new one
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-ui text-[12px] font-semibold text-[#333333]">Current Password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-[38px] rounded-[5px] border border-[#d0d0d0] bg-white px-3 font-ui text-[13px] text-[#1f1f1f] outline-none focus:border-cy-teal"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-ui text-[12px] font-semibold text-[#333333]">New Password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-[38px] rounded-[5px] border border-[#d0d0d0] bg-white px-3 font-ui text-[13px] text-[#1f1f1f] outline-none focus:border-cy-teal"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-ui text-[12px] font-semibold text-[#333333]">Confirm New Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              Reset Password
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}
