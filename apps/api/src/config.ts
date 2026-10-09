import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.resolve(here, '..')

loadEnv({ path: path.join(apiRoot, '.env') })

function str(key: string, fallback: string): string {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

function num(key: string, fallback: number): number {
  const v = process.env[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function list(key: string, fallback: string[]): string[] {
  const v = process.env[key]
  if (!v) return fallback
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const databasePath = path.isAbsolute(str('DATABASE_PATH', './data/pits.db'))
  ? str('DATABASE_PATH', './data/pits.db')
  : path.join(apiRoot, str('DATABASE_PATH', './data/pits.db'))

export const config = {
  env: str('NODE_ENV', 'development'),
  port: num('PORT', 3001),
  corsOrigin: list('CORS_ORIGIN', ['http://localhost:5173']),
  databasePath,
  jwt: {
    secret: str('JWT_SECRET', 'dev-secret-change-me'),
    accessTtl: str('JWT_ACCESS_TTL', '15m'),
    refreshTtl: str('JWT_REFRESH_TTL', '30d'),
  },
  shop: {
    name: str('SHOP_NAME', 'Pits'),
    currency: str('SHOP_CURRENCY', 'USD'),
  },
  seed: {
    adminEmail: str('SEED_ADMIN_EMAIL', 'admin@pits.local'),
    adminPassword: str('SEED_ADMIN_PASSWORD', 'admin1234'),
  },
  vapid: {
    publicKey: str('VAPID_PUBLIC_KEY', ''),
    privateKey: str('VAPID_PRIVATE_KEY', ''),
    subject: str('VAPID_SUBJECT', 'mailto:admin@pits.local'),
  },
} as const

export const pushEnabled = Boolean(config.vapid.publicKey && config.vapid.privateKey)
