import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '@/shared/colors'

/* ------------------------------- Button ----------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:opacity-90 active:opacity-80',
  secondary: 'bg-surface-sunken text-ink hover:bg-line/60 active:bg-line',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-xl gap-2',
}

const BASE =
  'inline-flex select-none items-center justify-center font-medium transition-[background-color,opacity,transform] duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  to: string
  variant?: Variant
  size?: Size
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={cx(BASE, VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/* -------------------------------- Card ------------------------------ */

export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card p-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

/* -------------------------------- Badge ----------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-sunken text-ink-muted',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    info: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------- Inputs ------------------------------ */

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label?: string
  error?: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {label ? <label className="label">{label}</label> : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('field', className)} {...rest} />
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('field resize-y', className)} rows={3} {...rest} />
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('field cursor-pointer pr-8', className)} {...rest} />
}

/* ------------------------------ Feedback ---------------------------- */

export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'success' | 'info'
  children: ReactNode
}) {
  const tones = {
    danger: 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 border-rose-200/60 dark:border-rose-900',
    success: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 border-emerald-200/60 dark:border-emerald-900',
    info: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200 border-sky-200/60 dark:border-sky-900',
  }
  return (
    <div role="alert" className={cx('rounded-xl border px-3.5 py-2.5 text-sm', tones[tone])}>
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken">
        <IconEmpty />
      </div>
      <p className="text-[15px] font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-xs text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

function IconEmpty() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-subtle" fill="none" aria-hidden="true">
      <path
        d="M4 8h16M4 8l2-3h12l2 3M4 8v10h16V8M9 18v-5h6v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-surface-sunken', className)} />
}
