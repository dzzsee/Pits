/** $12,345.60 — los importes viajan como centavos enteros. */
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  // SQLite guarda 'YYYY-MM-DD HH:MM:SS' en UTC; hay que normalizarlo.
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium' }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** "hace 3 h", "ayer", "12 mar" — para el feed de actividad. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return ''
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60_000)

  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`

  const days = Math.round(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} d`

  return formatDate(value)
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function inputToCents(input: string): number {
  const value = Number.parseFloat(input.replace(',', '.'))
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}
