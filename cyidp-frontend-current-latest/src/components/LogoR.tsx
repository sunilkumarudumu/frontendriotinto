import logoR from '../assets/logo-r.png'

/** CY logo component */
export default function LogoR({ className = '' }: { className?: string }) {
  return (
    <img
      src={logoR}
      alt="CYIDP Logo"
      className={className}
      draggable={false}
    />
  )
}
