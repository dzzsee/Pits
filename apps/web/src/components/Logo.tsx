export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M10 8v16M22 8v16M10 16h12" stroke="var(--surface)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="22" cy="16" r="3" fill="currentColor" />
    </svg>
  )
}
