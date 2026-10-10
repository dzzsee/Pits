/**
 * Configuracion de desarrollo y tests: lee el `.env` del paquete y lo vuelca
 * sobre el objeto `config`.
 *
 * Vive aparte de `config.ts` porque usa `node:fs`, `node:path` y `dotenv`. Si
 * estuviera en el mismo archivo, el bundler del Worker arrastraria todo eso al
 * bundle, que no lo necesita y no puede ejecutar.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { applyConfig, type AppConfig } from './config.js'

export async function loadNodeConfig(): Promise<AppConfig> {
  // Este archivo vive en `src/`, asi que la raiz del paquete es un nivel arriba.
  const here = path.dirname(fileURLToPath(import.meta.url))
  loadEnv({ path: path.resolve(here, '..', '.env') })

  const env = process.env as Record<string, string | undefined>
  return applyConfig(readFrom(env))
}

/**
 * Reutiliza el lector de `config.ts` para no duplicar los valores por defecto.
 * Se replica aqui porque `readShared` es privado a proposito: el Worker no
 * deberia poder tocar `process.env`.
 */
function readFrom(env: Record<string, string | undefined>): AppConfig {
  const str = (key: string, fallback: string) => {
    const v = env[key]
    return v === undefined || v === '' ? fallback : v
  }
  const num = (key: string, fallback: number) => {
    const v = env[key]
    if (v === undefined || v === '') return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const list = (key: string, fallback: string[]) => {
    const v = env[key]
    if (!v) return fallback
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  return {
    env: str('NODE_ENV', 'development'),
    port: num('PORT', 3001),
    corsOrigin: list('CORS_ORIGIN', ['http://localhost:5173']),
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
  }
}
