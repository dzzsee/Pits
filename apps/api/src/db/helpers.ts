import type { Db } from '../db/connection.js'

export const DEFAULT_SETTINGS = {
  points_per_repair: '5',
  points_per_reward: '25',
  reward_label: 'Lavado gratis',
  reward_valid_days: '180',
} as const

export type SettingKey = keyof typeof DEFAULT_SETTINGS

export function getSettings(db: Db): Record<SettingKey, string> {
  const rows = db
    .prepare<[], { key: string; value: string }>('SELECT key, value FROM settings')
    .all()
  const map = { ...DEFAULT_SETTINGS } as Record<SettingKey, string>
  for (const r of rows) {
    if (r.key in map) map[r.key as SettingKey] = r.value
  }
  return map
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value)
}

export function nextCounter(db: Db, name: string): number {
  db.prepare(
    `INSERT INTO counters (name, value) VALUES (?, 1)
     ON CONFLICT(name) DO UPDATE SET value = value + 1`,
  ).run(name)
  const row = db.prepare<[string], { value: number }>(
    'SELECT value FROM counters WHERE name = ?',
  ).get(name)
  return row?.value ?? 1
}

/** PITS-2026-0007 */
export function nextOrderCode(db: Db): string {
  const n = nextCounter(db, 'order')
  return `PITS-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`
}

export function nextInvoiceNumber(db: Db): string {
  const n = nextCounter(db, 'invoice')
  return `INV-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Codigo de canje legible y sin caracteres ambiguos: PITS-7K4M-9Q2X */
export function nextRedemptionCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return `PITS-${out.slice(0, 4)}-${out.slice(4, 8)}`
}

/**
 * Slug estable para la clave de `repair_states.key`: acentos, mayusculas y
 * espacios repetidos colapsan al mismo valor.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
