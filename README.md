# Pits

Sistema de fidelizacion y control de estados para un taller mecanico. El mecanico
va escribiendo el estado de cada reparacion tal como lo diria en el taller
("desmontando tren delantero", "esperando bujes", "listo para entregar"), el
cliente lo ve en tiempo real en su portal, y cada entrega le suma puntos para un
lavado gratis.

Monorepo: **Vite + React** (PWA) y un API en **Cloudflare Workers + D1** (en local, Node + SQLite).

---

## Como arranca

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001

El seed se corre solo al arrancar el API la primera vez (crea la base, los
estados sugeridos y el admin, sin usuarios ni datos de demo). Para rehacerlo
desde cero:

```bash
rm -rf apps/api/data        # unix
Remove-Item -Recurse -Force apps/api/data   # windows
npm run db:seed
```

El seed crea únicamente la cuenta de administrador configurada en `.env` y la
configuración base del taller. Los usuarios, vehículos y órdenes se agregan
desde la aplicación.

---

## Las dos ideas del sistema

### 1. Los estados los escribe el mecanico

No hay una lista cerrada de estados en el codigo. Cuando el mecanico escribe un
estado que el taller aun no usa, `repair_states` lo crea automaticamente como
estado personalizado (`is_custom = 1`), con un color estable derivado del texto.
Los seis estados sugeridos del seed (Recibido, Diagnostico, En reparacion, Control
de calidad, Listo para entregar, Entregado) son solo una sugerencia: se pueden
renombrar, colorear, reordenar o archivar desde **Taller → Estados**.

El unico flag que importa es **"es entrega"**: al mover una orden a un estado
marcado como entrega, la orden se cierra y se acreditan los puntos. Ese flag lo
pone el taller, no el sistema.

Cada cambio de estado escribe un evento en `state_events` con una **copia** del
label y del color en ese momento (`state_label_snapshot`). Si manana el taller
renombra "En reparacion" a "En el taller", el historial antiguo sigue mostrando
lo que el cliente vio entonces.

### 2. Fidelizacion de regla fija, sin catalogo

```
+5 puntos por cada reparacion entregada
 25 puntos = 1 lavado gratis
```

Al cruzar el umbral, la recompensa se materializa sola como un **canje** con
codigo (`PITS-7K4M-9Q2X`). El cliente lo ve en su app, lo marca como usado y lo
presenta en recepcion; el taller lo verifica en **Taller → Canjes**. El saldo
nunca se edita a mano: todo pasa por `ledger_entries`, que es append-only.

El admin puede cambiar los numeros en **Equipo** (puntos por reparacion, umbral,
nombre y vigencia de la recompensa) sin tocar codigo.

---

## Estructura

```
pits/
├─ apps/
│  ├─ api/                        Workers + D1 (local: Node + SQLite)
│  │  ├─ src/
│  │  │  ├─ config.ts             env tipado (sin Node: entra en el bundle)
│  │  │  ├─ config.node.ts        carga el .env para desarrollo
│  │  │  ├─ app.ts                ensamblado de rutas y despacho
│  │  │  ├─ db/
│  │  │  │  ├─ database.ts        interfaz `Database` (asincrona)
│  │  │  │  ├─ driver.ts          SQLite local: better-sqlite3 / node:sqlite
│  │  │  │  ├─ d1.ts              driver de Cloudflare D1
│  │  │  │  ├─ migrations.ts      esquema (una migracion, append-only)
│  │  │  │  ├─ helpers.ts         settings, contadores, codigos, slug
│  │  │  │  └─ seed.ts            estados sugeridos + admin + demo
│  │  │  ├─ http/router.ts        router sobre fetch + JWT + roles
│  │  │  ├─ lib/                  password (PBKDF2), jwt, webpush (VAPID)
│  │  │  ├─ worker/               entry del Worker + Durable Object
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/              registro, login, refresh, perfil
│  │  │  │  ├─ notifications/     portal del cliente (/me) + feed
│  │  │  │  ├─ loyalty/           ledger, umbral, canjes
│  │  │  │  ├─ repairs/           ordenes, items, facturas, motor de estados
│  │  │  │  ├─ reports/           metricas + export CSV
│  │  │  │  ├─ realtime/          canal SSE /api/stream
│  │  │  │  └─ push/              VAPID y suscripciones
│  │  │  └─ shared/               errores, validacion, colores, bus de eventos
│  │  ├─ tests/                   47 tests (vitest)
│  │  └─ scripts/                 humo, barrido, volcado, hash del seed, carga a D1
│  └─ web/                        Vite + React + PWA
│     ├─ src/
│     │  ├─ app/                   sesion y rutas
│     │  ├─ components/            UI, Timeline, campana, SW
│     │  ├─ features/
│     │  │  ├─ client/             dashboard, reparaciones, vehiculos, puntos, cuenta
│     │  │  ├─ staff/              ordenes, estados, canjes
│     │  │  └─ admin/              equipo, reportes
│     │  ├─ lib/                   api, query-keys, formato, storage, push, tiempo real
│     │  └─ sw.ts                  service worker (workbox, injectManifest)
│     ├─ public/icons/             iconos generados por script
│     └─ tests/                    23 tests (vitest)
```

---

## Tiempo real: por que antes habia que recargar

Habia un bug silencioso que congelaba la pantalla. React Query compara las
claves de cache elemento por elemento con igualdad estricta, y en el codigo
convivian dos formas de la misma clave:

```
['repair', '8']   <- la vista, el id viene de useParams (string)
['repair',  8 ]  <- la mutacion, el id viene de la entidad (numero)
```

`8 !== '8'`, asi que la invalidacion nunca encontraba a la vista que tenian
delante. La mutacion se ejecutaba bien contra el servidor, pero la pantalla se
quedaba con los datos cacheados; solo el F5, que remonta y vuelve a pedir,
lo resolvia. Afectaba a agregar/quitar trabajos, cambiar el estado, facturar y
asignar mecanico.

La solucion tiene tres capas:

**1. Claves centralizadas** (`apps/web/src/lib/query-keys.ts`). Toda clave se
construye ahi y normaliza el identificador con `Number()`, de modo que ambos
origenes convergen. No se escribe una clave a mano en ningun componente.

**2. Invalidacion coherente.** Las mutaciones de orden usan `invalidateOrder()`,
que refresca el detalle, el listado del taller y las vistas del cliente, con
`await` para que el mensaje de exito aparezca cuando la pantalla ya cambio.

**3. SSE para entre dispositivos.** `GET /api/stream` mantiene una conexion
por pestana. El servidor emite desde el mismo punto que ya notificaba
(`notifyUser`), asi que no hay logica duplicada: toda notificacion nace de un
cambio real. Cuando llega un evento, el web invalida las claves afectadas.
Ademas cada evento se reemite por `BroadcastChannel`, de modo que las demas
pestanas del mismo navegador se actualizan sin abrir su propio stream.

```
mecanico (otra pestana)          cliente (movil)
   transition()                     /api/stream abierto
        |                                  |
        +--> state_events + notifyUser ----+
                     |
              emitToUser(client)
                     |
              order.updated ---> cliente invalida y refresca
```

> El bus de eventos vive en memoria del proceso: con varias instancias del API
> cada una solo emite a sus clientes. Ese es el unico limite conocido; el dia
> que escale se cambia por Redis pub/sub sin tocar el resto.

---

## Roles| | Cliente | Mecanico | Admin |

| --- | :-: | :-: | :-: |
| Ver su reparacion, historial y puntos | x | | |
| Sus vehiculos y sus datos | x | | |
| Mover el estado de una orden | | x | x |
| Anadir trabajos y facturar | | x | x |
| Canjear codigos de lavado | | x | x |
| Gestionar estados del taller | | x | x |
| Crear usuarios, reglas y reportes | | | x |

El servidor es quien aplica el filtro: `getOrderDetail` recibe `staffView` y
omite los eventos con `is_client_visible = 0`. Un cliente que pida la orden de
otro recibe 403, y un cliente en `/api/staff/*` recibe 403.

---

## Notificaciones push

La app es una PWA instalable. Sin configuracion, todo funciona con notificaciones
in-app. Para activar push de verdad:

```bash
npx web-push generate-vapid-keys
```

y pegar las claves en `apps/api/.env`:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu@correo.com
```

Con las claves puestas, el portal del cliente ofrece activar notificaciones y el
servicio worker (`apps/web/src/sw.ts`) recibe los pushes, muestra la notificacion
del sistema y al tocarla enfoca o abre la reparacion correspondiente. Las
suscripciones muertas (404/410) se limpian solas.

> Las notificaciones push requieren contexto seguro: `localhost` funciona, un
> deploy en http plano no. El service worker solo se registra en builds de
> produccion (`vite build`).

---

## Comandos

```bash
npm run dev          # API y web a la vez
npm run build        # compila API y web
npm run typecheck    # TypeScript estricto en ambos
npm run lint
npm test             # 70 tests

npm run db:seed                       # resiembra datos de demo
npm run smoke -w @pits/api           # humo end-to-end, incluido el SSE (con el API arriba)
node apps/web/scripts/generate-icons.mjs   # regenera los iconos PNG
```

Para apuntar el humo contra el despliegue en vez de localhost:

```bash
SMOKE_BASE=https://pits.g25vkprcqs.workers.dev/api npm run smoke -w @pits/api
```

---

## Despliegue en Cloudflare

Un solo Worker sirve el API y el frontend: una URL, sin CORS entre las dos
mitades. La base es **D1** y el canal de tiempo real es un **Durable Object**.

```bash
npm run build -w @pits/web      # los assets se compilan primero
npm run deploy:d1 -w @pits/api  # sube pits.sql a D1
npm run deploy -w @pits/api     # publica Worker + assets
```

Los secretos no van en el repositorio:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

`pits.sql` sigue siendo la fuente de verdad del proyecto: es lo que se sube a D1
y lo que importa una maquina local en su primer arranque. Ojo al subirlo, por
dos motivos que hacen fallar la carga si se copia tal cual:

- D1 no acepta el envoltorio `BEGIN TRANSACTION` del volcado, ni
  `PRAGMA foreign_keys=OFF`.
- El volcado inserta tabla por tabla en orden de creacion, que **no respeta las
  claves foraneas** (`order_items` y `ledger_entries` referencian `redemptions`,
  que se inserta despues). En SQLite local lo tapa el `PRAGMA`; D1 las exige.

`scripts/d1-seed.ts` resuelve las dos cosas: limpia las sentencias de control y
calcula el orden de carga a partir del grafo de referencias del propio esquema.
No hay que editar `pits.sql` a mano para D1; se regenera la copia con ese script.

---

## Notas de implementacion

**Un dominio, dos runtimes.** `apps/api` corre en Node para desarrollo y en
Workers para produccion, y el dominio es el mismo. Eso obliga a dos cosas:

- _La base es asincrona._ D1 solo ofrece promesas, asi que `Database` es
  asincrona y los drivers de Node envuelven sus llamadas sincronas. Los tests
  siguen corriendo contra SQLite en local.
- _La configuracion esta partida._ `src/config.ts` no importa nada de Node, y
  `src/config.node.ts` carga el `.env` para desarrollo. Si compartieran
  archivo, el bundler arrastraria `dotenv` y `node:fs` al Worker.

**Contrasenas en PBKDF2, no argon2.** `argon2` es un binario nativo y no existe
en Workers. El hashing es PBKDF2-SHA256 sobre WebCrypto, con comparacion en
tiempo constante. Los hashes de argon2 se rechazan, asi que `pits.sql` se
re-hashea con `npm run db:rehash -w @pits/api`.

**Transacciones en D1.** D1 no tiene transacciones interactivas: no hay
`BEGIN`/`COMMIT` ni lectura dentro de una escritura en curso. El driver ejecuta
las escrituras en orden y sin atomicidad. Acumularlas en un `batch()` al final
daria atomicidad, pero las lecturas intermedias verian datos viejos y
`awardForRepair` consulta el saldo justo despues de sumarle puntos: con el buffer
no cruzaria el umbral de recompensa. Se prefiere ejecucion correcta a
atomicidad aparente. En SQLite local si hay transacciones reales.

**El realtime necesita memoria estable.** Un isolate de Worker es efimero, asi
que el bus de eventos en memoria no serviria. `worker/realtime-do.ts` es un
Durable Object que sostiene las conexiones y reparte los eventos; en local se
usa el mismo bus en memoria a traves de la misma interfaz.

**El token viaja por query string.** `EventSource` no admite cabeceras, asi que
`/api/stream?token=...` es lo unico posible en el navegador. Por eso el
despliegue tiene que ir por HTTPS.

**Nada de trabajo en segundo plano.** En Workers el isolate termina cancelando
las promesas sueltas cuando la respuesta se cierra, asi que `void promesa()` no
vale: todo lo que deba completarse se espera con `await`.

**Importes.** Todo el dinero viaja como centavos enteros (`total_cents`) y solo se
formatea al mostrarlo. La conversion vive en `apps/web/src/lib/format.ts`.

**Fechas.** SQLite guarda `YYYY-MM-DD HH:MM:SS` en UTC. El web lo normaliza a ISO
antes de parsear; sin eso, las fechas cerca de medianoche cambian de dia segun
la zona horaria del navegador. Hay un test que lo cubre.

**Estilos.** Tailwind con variables CSS para el tema: claro y oscuro comparten la
misma estructura de clases, el tema se decide con una clase en `<html>` antes del
primer paint. Las animaciones son cortas (140–220ms) y se desactivan solas con
`prefers-reduced-motion`.
