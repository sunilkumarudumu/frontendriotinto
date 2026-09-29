import { useNavigate, Link } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { useUser } from '../context/UserContext'

type AppCredential = {
  username: string
  password: string
  role: 'user'
}

const APP_CREDENTIALS: AppCredential[] = [
  { username: 'veerashivudu', password: 'Helpingnature@123', role: 'user' },
  { username: 'test1', password: 'test123', role: 'user' },
  { username: 'test2', password: 'test123', role: 'user' },
  { username: 'test3', password: 'test123', role: 'user' },
  { username: 'test4', password: 'test123', role: 'user' },
]

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M10.6 10.7a2 2 0 0 0 2.7 2.7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M9.9 5.5A10.4 10.4 0 0 1 12 5.3c5.2 0 9.1 4.2 10.2 5.7a1.2 1.2 0 0 1 0 1.5c-.5.7-1.6 2-3.2 3.2M6.1 6.4C4.3 7.7 3 9.2 2.3 10.2a1.2 1.2 0 0 0 0 1.5C3.4 13.2 7.3 17.4 12 17.4c1.1 0 2.2-.2 3.2-.6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <svg className="size-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.3 11.2a1.2 1.2 0 0 0 0 1.5C3.4 14.2 7.3 18.4 12 18.4s8.6-4.2 9.7-5.7a1.2 1.2 0 0 0 0-1.5C20.6 9.7 16.7 5.5 12 5.5S3.4 9.7 2.3 11.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

function Login() {
  const navigate = useNavigate()
  const { setUser } = useUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')

    const enteredUsername = email.trim()
    const enteredPassword = password

    if (!enteredUsername || !enteredPassword) {
      setError('Please enter a valid Username and Password')
      return
    }

    const matchedCredential = APP_CREDENTIALS.find(
      (credential) =>
        credential.username.toLowerCase() === enteredUsername.toLowerCase() &&
        credential.password === enteredPassword,
    )

    if (!matchedCredential) {
      setError('Invalid username or password')
      return
    }

    const matchedUsername = matchedCredential.username
    const initials = matchedUsername.substring(0, 2).toUpperCase()

    setUser({
      username: matchedUsername,
      email: `${matchedUsername}@cyidp.local`,
      initials,
      role: matchedCredential.role,
    })

    navigate('/duplicate')
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white px-3 py-6">
      <div className="flex min-h-[460px] w-full max-w-[400px] flex-col justify-center rounded-[2px] border border-rt-card-border bg-rt-card px-5 py-10 sm:px-7 sm:py-12">
        <p className="mb-5 text-center font-logo text-[28px] leading-none font-bold tracking-[-0.8px] text-[#169DA5]">
          CYIDP
        </p>

        <h1 className="mb-8 text-center font-ui text-[22px] leading-none font-bold tracking-[-0.2px] text-rt-title">
          User Portal
        </h1>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-[5px] text-left">
            <label
              htmlFor="email"
              className="font-ui text-[13px] leading-none font-normal text-rt-label"
            >
              Username
            </label>
            <input
              id="email"
              name="email"
              type="text"
              autoComplete="username"
              placeholder="Username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-[38px] w-full rounded-[5px] border border-rt-input-border bg-rt-input px-[11px] font-ui text-[13.5px] text-black outline-none placeholder:text-rt-placeholder focus:border-[#c5ced8]"
            />
          </div>

          <div className="flex flex-col gap-[5px] text-left">
            <label
              htmlFor="password"
              className="font-ui text-[13px] leading-none font-normal text-rt-label"
            >
              Password
            </label>
            <div className="relative flex items-center">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-[38px] w-full rounded-[5px] border border-rt-input-border bg-rt-input py-0 pr-12 pl-[11px] font-ui text-[13.5px] text-black outline-none placeholder:text-rt-placeholder focus:border-[#c5ced8]"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center border-0 bg-transparent text-[#169DA5] before:absolute before:top-[9px] before:bottom-[9px] before:left-0 before:w-px before:bg-rt-divider hover:text-[#12848b]"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-1 rounded-[5px] bg-red-50 px-3 py-2.5 font-ui text-[13px] font-normal text-red-600 border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="mt-1.5 h-10 w-full cursor-pointer rounded-[5px] border-0 bg-[#169DA5] font-ui text-[14.5px] font-semibold text-white transition-colors hover:bg-[#12848b] active:bg-[#0f6f75]"
          >
            Login
          </button>
        </form>

        <p className="mt-6 text-center font-ui text-[12px] text-[#666666]">
          Admin user?{' '}
          <Link to="/admin/login" className="text-[#169DA5] underline underline-offset-2 hover:text-[#12848b]">
            Go to admin login
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Login
