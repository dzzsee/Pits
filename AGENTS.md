# AGENTS.md

Sistema de fidelizacion y control de estados para un taller mecanico. Monorepo npm: `@pits/api` (Cloudflare Workers + D1; en local Node + SQLite) y `@pits/web` (Vite + React + PWA). Un solo Worker sirve API y frontend.

## Comandos

```bash
npm install
cp apps/api/.env.example apps/api/.env   # sin .env el API arranca con defaults inseguros
npm run dev                              # API :3001 + web :5173 a la vez
```

Un paquete o un test concreto:

```bash
npm run test -w @pits/api          # 47 tests
npm run test -w @pits/web          # 41 tests
npm run test -w @pits/web -- tests/ItemsPanel.test.tsx   # un archivo
npm run typecheck -w @pits/web
npm run lint -w @pits/api
```

Antes de dar por buena un cambio, el orden que importa es:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

`npm run test` ejecuta api y web en serie (`&&`): si el API falla, el web no corre. Lanza los paquetes por separado si quieres los dos resultados.

**`npm run smoke -w @pits/api` necesita el API arriba y, por defecto, en el puerto 3111** (`SMOKE_PORT`), no en el 3001 que usa `npm run dev`. Contra un despliegue: `SMOKE_BASE=https://<worker>/api npm run smoke -w @pits/api`.

## Despliegue

El orden es obligatorio y no intercambiable:

```bash
npm run build -w @pits/web      # 1. los assets del frontend se compilan PRIMERO
npm run deploy:d1 -w @pits/api  # 2. sube el esquema a D1
npm run deploy -w @pits/api     # 3. publica Worker + assets
```

`wrangler.toml` sirve `apps/web/dist` como assets del Worker. Si despliegas sin el paso 1, subes un `dist` viejo o inexistente.

Los secretos no van en el repo: `npx wrangler secret put JWT_SECRET` (y VAPID si usas push). **Nunca subas datos reales a D1**: `pits.sql` lleva usuarios demo con contraseñas conocidas.

## Base de datos

`apps/api/src/db/migrations.ts` tiene **una** migración (`initial_schema`, id 1). Es append-only: nunca edites una ya aplicada, agrega una al final. La tabla `_migrations` lleva el registro.

El arranque local tiene dos caminos y decide solo: base nueva → importa `pits.sql`; base existente → solo migraciones, para no pisar datos (`getBootstrapSource()` lo refleja).

`apps/api/src/db/database.ts` es la interfaz asíncrona compartida. No importa nada de Node a propósito: el bundle del Worker lo necesita. Por eso la config está partida en `config.ts` (sin Node) y `config.node.ts` (carga `.env`). Si las juntas, `dotenv` y `node:fs` entran al Worker.

**D1 no tiene transacciones interactivas.** `db.transaction()` en el driver D1 ejecuta en orden y sin atomicidad, a propósito: ver el comentario en `d1.ts` sobre por qué no se acumulan en un `batch()`. SQLite local sí transacciona de verdad.

Tests del API: `freshDb()` de `tests/helpers.ts` da una BD `:memory:` con migraciones reales. No hay que mockear SQL.

## Despliegue de datos a D1 (trampa conocida)

`pits.sql` **no se sube tal cual** a D1. Falla por dos motivos: D1 rechaza el envoltorio `BEGIN TRANSACTION` y el `PRAGMA foreign_keys=OFF`, y el volcado inserta por orden de creación, que no respeta las claves foráneas. `scripts/d1-seed.ts` limpia las sentencias de control y calcula el orden de carga desde el grafo de referencias. Genera `.wrangler/d1-seed.sql`; no edites `pits.sql` a mano para D1.

## Web

**Toda clave de React Query se construye en `src/lib/query-keys.ts`.** No escribas una a mano. El motivo es concreto: React Query compara claves elemento a elemento, así que `['repair','8']` (id de `useParams`) y `['repair', 8]` (id de la entidad) son claves distintas y la invalidación no llega a la vista — la pantalla se congela hasta el F5. `keys.*` normaliza con `Number()`.

Las mutaciones que tocan una orden usan `invalidateOrder(client, id)`, con `await`, para que el mensaje de éxito aparezca cuando la pantalla ya cambió.

### Sistema visual

Tema **único oscuro**. La retícula y el grano están en `body::before/after` de `src/index.css`: son el entorno, se aplican una vez, no por pantalla. Los tokens viven en `:root` y `tailwind.config.js` los lee; cambiar un color es editar un sitio.

Las familias (Bebas Neue display, DM Sans cuerpo, JetBrains Mono para datos técnicos: códigos, placas, VIN) están declaradas a mano en `src/fonts.css`, solo woff2. Importar `@fontsource/*` reintroduce el `.woff` de respaldo (~140 KB de más).

`components/ui.tsx` es la librería. `Card` aplica su propio padding (`p-6`): las listas lo anulan con `className="p-0"` y `twMerge` lo resuelve.

### Tests del web

`apps/web/tsconfig.json` incluye `tests` en `include`: los tests pasan por typecheck. Si añades un archivo de test fuera de `src/`, queda sin comprobar.

jsdom no carga CSS ni procesa Tailwind, así que los cambios de estilo no rompen tests. Lo que sí ata: **textos exactos, roles y `placeholder`**. Los tests existentes afirman strings literales ("Sin novedades aun.", "Contratiempo", placeholder `Pastillas delanteras`, `getByLabelText('Precio unitario')`). Si cambias ese copy, actualiza el test en el mismo commit.

`tokenStore` se resuelve al importar el módulo y en jsdom cae a memoria: para montar algo autenticado, pasa por el login real (`/auth/login` mockeado) en vez de escribir en el almacen.

### Service worker

`src/sw.ts` (workbox, `injectManifest`). Las navegaciones van en `NetworkFirst` (`pits-html`) y `index.html` está **excluido a propósito** del precache (`vite.config.ts` → `globPatterns` sin `html`). Precachearlo ata la app al despliegue anterior: el F5 sigue sirviendo el bundle viejo y los cambios de estilo no se ven. No lo reintroduzcas.

Tras un despliegue, el botón "Actualizar ahora" desregistra los service workers y borra las cachés antes de recargar. Para saber qué build está cargada, la consola imprime `[pits] build ...` al arrancar.

## Seguridad (estado actual, leer antes de tocar auth)

- `JWT_SECRET` **cae por defecto a `'dev-secret-change-me'`** (`src/config.ts`) y no hay validación al arrancar. Si no está definido en el entorno, los tokens son forjables. No existe `assertSecureConfig`: si lo añades, llámalo desde `loadWorkerConfig` y `loadNodeConfig`.
- **No hay rate limiting** en ningún punto, `/api/auth/login` incluido.
- El access token vive en `localStorage` y el logout es solo cliente: los refresh tokens (30 días) no son revocables. La tabla `sessions` que lo arreglaba quedó en un plan, no implementado.
- `/api/stream` lleva el token por query string (`EventSource` no admite cabeceras) y confía en el `role` del JWT en vez de releer el usuario de la BD, a diferencia de `authenticate`.
- `authenticate` no comprueba `is_active`: una cuenta desactivada conserva el acceso hasta que caduque el token.
- `toPublicUser` (`modules/auth/service.ts`) es la única proyección de usuario hacia el cliente. Si añades un campo que la UI necesita, va **aquí**, y el tipo `User` de `apps/web/src/lib/types.ts` también. No hagas casts para leer campos que el API no envía.
- El objeto de usuario que sale de los endpoints admin no distingue cuentas desactivadas si `is_active` no viaja: ese fue el motivo de que el botón de desactivar pareciera inerte.

## Convenciones

- TypeScript estricto con `noUncheckedIndexedAccess` en ambos paquetes: los accesos a índices dan `T | undefined`.
- `verbatimModuleSyntax` en ambos: los imports de tipos usan `import type` (lo exige eslint).
- Imports con `.js` en el API (ESM, `moduleResolution: bundler`).
- Sin tildes en el texto de los strings de UI ni en los comentarios; el idioma del código es español.
- Prettier: sin semis, comillas simples, ancho 100, `trailingComma: all`. `npm run format` pasa a **todo** el repo; `apps/web/public/` y `dist` están ignorados.
- eslint exige `type-imports`; `_` como prefijo marca parámetros sin usar.

## Cuentas de demo

Sembradas por `seed.ts` solo si la base no viene de `pits.sql` y no hay clientes. Contraseña `demo1234` para `ana@`, `carlos@` y `luis@demo.local` y los mecánicos `mecanico@pits.local` / `mecanico2@pits.local`. Admin desde `.env` (`SEED_ADMIN_*`), por defecto `admin@pits.local` / `admin1234`.

**Un taller real no debe quedar con estas cuentas**: demo se siembra solo cuando el conteo de clientes es 0, así que borra esos usuarios desde Equipo antes de usar el sistema de verdad.
