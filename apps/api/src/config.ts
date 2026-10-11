/**
 * Configuracion de la aplicacion, con dos formas de cargarla:
 *
 * - `loadNodeConfig()` para desarrollo y tests, leyendo `.env` con dotenv.
 * - `loadWorkerConfig(env)` en Cloudflare Workers, leyendo los bindings.
 *
 * El resto del codigo siempre lee del objeto `config` en vez de tocar
 * `process.env`, asi que es unaware del runtime en el que corre.
 */

/** El valor de relleno: con el, cualquiera puede firmar tokens de admin. */
const INSECURE_JWT_SECRET = 'dev-secret-change-me'

export interface AppConfig {
  env: string
  port: number
  corsOrigin: string[]
  jwt: {
    secret: string
    accessTtl: string
    refreshTtl: string
  }
  shop: {
    name: string
    currency: string
  }
  seed: {
    adminEmail: string
    adminPassword: string
  }
  vapid: {
    publicKey: string
    privateKey: string
    subject: string
  }
}

function defaults(): AppConfig {
  return {
    env: 'development',
    port: 3001,
    corsOrigin: ['http://localhost:5173'],
    jwt: { secret: INSECURE_JWT_SECRET, accessTtl: '15m', refreshTtl: '30d' },
    shop: { name: 'Pits', currency: 'USD' },
    seed: { adminEmail: 'admin@pits.local', adminPassword: 'admin1234' },
    vapid: { publicKey: '', privateKey: '', subject: 'mailto:admin@pits.local' },
  }
}

/**
 * Objeto vivo: los modulos de dominio lo leen en cada llamada. `loadWorkerConfig`
 * lo rellena una vez por isolate antes de atender la primera peticion.
 */
export const config: AppConfig = defaults()

function str(env: Record<string, string | undefined>, key: string, fallback: string): string {
  const v = env[key]
  return v === undefined || v === '' ? fallback : v
}

function num(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const v = env[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function list(env: Record<string, string | undefined>, key: string, fallback: string[]): string[] {
  const v = env[key]
  if (!v) return fallback
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function readShared(
  env: Record<string, string | undefined>,
  base: Partial<AppConfig> = {},
): AppConfig {
  return {
    ...defaults(),
    ...base,
    env: str(env, 'NODE_ENV', base.env ?? 'development'),
    port: num(env, 'PORT', base.port ?? 3001),
    corsOrigin: list(env, 'CORS_ORIGIN', base.corsOrigin ?? ['http://localhost:5173']),
    jwt: {
      secret: str(env, 'JWT_SECRET', base.jwt?.secret ?? INSECURE_JWT_SECRET),
      accessTtl: str(env, 'JWT_ACCESS_TTL', base.jwt?.accessTtl ?? '15m'),
      refreshTtl: str(env, 'JWT_REFRESH_TTL', base.jwt?.refreshTtl ?? '30d'),
    },
    shop: {
      name: str(env, 'SHOP_NAME', base.shop?.name ?? 'Pits'),
      currency: str(env, 'SHOP_CURRENCY', base.shop?.currency ?? 'USD'),
    },
    seed: {
      adminEmail: str(env, 'SEED_ADMIN_EMAIL', base.seed?.adminEmail ?? 'admin@pits.local'),
      adminPassword: str(env, 'SEED_ADMIN_PASSWORD', base.seed?.adminPassword ?? 'admin1234'),
    },
    vapid: {
      publicKey: str(env, 'VAPID_PUBLIC_KEY', base.vapid?.publicKey ?? ''),
      privateKey: str(env, 'VAPID_PRIVATE_KEY', base.vapid?.privateKey ?? ''),
      subject: str(env, 'VAPID_SUBJECT', base.vapid?.subject ?? 'mailto:admin@pits.local'),
    },
  }
}

/** Vuelca la configuracion leida sobre el objeto vivo que usa el dominio. */
export function applyConfig(next: AppConfig): AppConfig {
  config.env = next.env
  config.port = next.port
  config.corsOrigin = next.corsOrigin
  config.jwt = next.jwt
  config.shop = next.shop
  config.seed = next.seed
  config.vapid = next.vapid
  return config
}

/**
 * Cloudflare Workers: los valores llegan como bindings de texto.
 *
 * Vive sin imports de Node a proposito. `config.node.ts` carga el `.env` para
 * desarrollo, pero si compartiera este archivo el bundler arrastraria `dotenv`
 * y los builtins de Node al Worker, que no los necesita.
 */
export function loadWorkerConfig(env: Record<string, string | undefined>): AppConfig {
  const next = applyConfig(readShared(env, { env: env.NODE_ENV ?? 'production' }))
  assertSecureConfig(next)
  return next
}

export const pushEnabled = () => Boolean(config.vapid.publicKey && config.vapid.privateKey)

/**
 * Falla si la configuracion permite firmar tokens forjables.
 *
 * Sin esto, un despliegue que olvide `wrangler secret put JWT_SECRET` no da
 * ningun error: arranca, responde y emite tokens que cualquiera puede fabricar
 * con el secreto de relleno, incluyendo rol `admin`. El fallo es silencioso
 * hasta que alguien abusa de el.
 *
 * Solo se aplica fuera de desarrollo: en local el valor de relleno es el
 * comportamiento esperado y asi lo documenta `.env.example`.
 *
 * @throws Error con el remedy, para que el fallo sea accionable.
 */
export function assertSecureConfig(cfg: AppConfig = config): void {
  if (cfg.env === 'development' || cfg.env === 'test') return

  const { secret } = cfg.jwt
  if (!secret || secret === INSECURE_JWT_SECRET) {
    throw new Error(
      'JWT_SECRET no esta definido. Sin el, los tokens se firman con un secreto ' +
        'publico y cualquiera puede hacerse administrador. Define JWT_SECRET en el ' +
        'entorno o subelo con: npx wrangler secret put JWT_SECRET',
    )
  }
  if (secret.length < 32) {
    throw new Error(
      `JWT_SECRET es demasiado corto (${secret.length} caracteres). Usa al menos 32.`,
    )
  }
}
