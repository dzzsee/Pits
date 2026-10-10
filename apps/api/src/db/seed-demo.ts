import { hashPassword } from '../lib/password.js'
import type { Db } from './connection.js'
import {
  createOrder,
  addItem,
  applyTransition,
  issueInvoice,
  updateOrder,
} from '../modules/repairs/service.js'
import { resolveState } from '../modules/repairs/states.js'
import { ensureAccount, grantReward, readLoyaltyConfig } from '../modules/loyalty/service.js'

interface DemoVehicle {
  plate: string
  brand: string
  model: string
  year: number
  mileage: number
}

const DEMO_CLIENTS = [
  {
    email: 'ana@demo.local',
    password: 'demo1234',
    name: 'Ana Rivera',
    phone: '+1 809 555 0101',
    vehicles: [
      { plate: 'ABC-123', brand: 'Toyota', model: 'Corolla', year: 2019, mileage: 84200 },
      { plate: 'XYZ-987', brand: 'Honda', model: 'Civic', year: 2021, mileage: 31500 },
    ],
  },
  {
    email: 'carlos@demo.local',
    password: 'demo1234',
    name: 'Carlos Medina',
    phone: '+1 809 555 0202',
    vehicles: [
      { plate: 'MNO-456', brand: 'Ford', model: 'Ranger', year: 2017, mileage: 156800 },
    ] as DemoVehicle[],
  },
  {
    email: 'luis@demo.local',
    password: 'demo1234',
    name: 'Luis Fernandez',
    phone: '+1 809 555 0303',
    vehicles: [
      { plate: 'QRS-222', brand: 'Mazda', model: 'CX-5', year: 2022, mileage: 21000 },
      { plate: 'TUV-888', brand: 'Hyundai', model: 'Elantra', year: 2018, mileage: 97300 },
      { plate: 'WXY-333', brand: 'Kia', model: 'Rio', year: 2020, mileage: 60450 },
    ],
  },
]

const DEMO_MECHANICS = [
  { email: 'mecanico@pits.local', password: 'demo1234', name: 'Javier Santos' },
  { email: 'mecanico2@pits.local', password: 'demo1234', name: 'Rosa Diaz' },
]

async function insertUser(
  db: Db,
  values: {
    role: 'client' | 'mechanic'
    email: string
    name: string
    phone?: string
    hash: string
  },
): Promise<number> {
  const existing = await db
    .prepare<[string], { id: number }>('SELECT id FROM users WHERE email = ?')
    .get(values.email)
  if (existing) return existing.id

  const info = await db
    .prepare(`INSERT INTO users (role, email, phone, name, password_hash) VALUES (?, ?, ?, ?, ?)`)
    .run(values.role, values.email, values.phone ?? null, values.name, values.hash)
  return Number(info.lastInsertRowid)
}

/** Datos de arranque: 2 mecanicos, 3 clientes, 6 vehiculos, historial varied. */
export async function seedDemoData(db: Db): Promise<void> {
  const hash = await hashPassword('demo1234')

  const mechanicIds: number[] = []
  for (const m of DEMO_MECHANICS) {
    mechanicIds.push(await insertUser(db, { role: 'mechanic', email: m.email, name: m.name, hash }))
  }

  const clientIds: number[] = []
  const vehicleIdsByClient: number[][] = []

  for (const c of DEMO_CLIENTS) {
    const id = await insertUser(db, {
      role: 'client',
      email: c.email,
      name: c.name,
      phone: c.phone,
      hash,
    })
    clientIds.push(id)
    await db.prepare('INSERT OR IGNORE INTO loyalty_accounts (client_id) VALUES (?)').run(id)

    const ids: number[] = []
    for (const v of c.vehicles) {
      const existing = await db
        .prepare<[string], { id: number }>('SELECT id FROM vehicles WHERE plate = ?')
        .get(v.plate)
      if (existing) {
        ids.push(existing.id)
        continue
      }
      const info = await db
        .prepare(
          `INSERT INTO vehicles (client_id, plate, brand, model, year, mileage)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, v.plate, v.brand, v.model, v.year, v.mileage)
      ids.push(Number(info.lastInsertRowid))
    }
    vehicleIdsByClient.push(ids)
  }

  // `client` es el indice en DEMO_CLIENTS; se resuelve a su id mas abajo.
  const scenarios: {
    client: number
    vehicle: number
    mechanic: number
    flow: { state: string; note?: string; incident?: boolean; notify?: boolean }[]
    items: {
      kind: 'part' | 'labor' | 'service'
      description: string
      qty: number
      unitPriceCents: number
    }[]
    note?: string
  }[] = [
    {
      client: 0,
      vehicle: vehicleIdsByClient[0]![0]!,
      mechanic: mechanicIds[0]!,
      note: 'El carro hace ruido al frenar en baja.',
      flow: [
        { state: 'Recibido', note: 'Kilometraje verificado' },
        { state: 'Diagnóstico', note: 'Pastillas delanteras desgastadas, discos al 40%' },
        {
          state: 'En reparación',
          note: 'Cambio de pastillas y rectificado de discos',
          notify: true,
        },
        { state: 'Control de calidad', note: 'Probado de frenada OK' },
        { state: 'Listo para entregar', note: 'Listo en recepcion', notify: true },
        { state: 'Entregado', note: 'Entregado al cliente. 12 meses de garantia', notify: true },
      ],
      items: [
        {
          kind: 'part',
          description: 'Pastillas de freno delanteras',
          qty: 1,
          unitPriceCents: 8500,
        },
        {
          kind: 'labor',
          description: 'Mano de obra - rectificado de discos',
          qty: 1,
          unitPriceCents: 12000,
        },
        { kind: 'service', description: 'Limpieza deInjectores', qty: 1, unitPriceCents: 3500 },
      ],
    },
    {
      client: 0,
      vehicle: vehicleIdsByClient[0]![1]!,
      mechanic: mechanicIds[0]!,
      note: 'Mantenimiento de 80,000 km.',
      flow: [
        { state: 'Recibido' },
        { state: 'En reparación', note: 'Cambio de aceite y filtros' },
        { state: 'Entregado', notify: true },
      ],
      items: [
        {
          kind: 'part',
          description: 'Aceite sintetico 5W-30 (galon)',
          qty: 1,
          unitPriceCents: 4500,
        },
        { kind: 'part', description: 'Filtro de aceite', qty: 1, unitPriceCents: 1800 },
        { kind: 'part', description: 'Filtro de aire', qty: 1, unitPriceCents: 2200 },
        {
          kind: 'labor',
          description: 'Mano de obra - mantenimiento',
          qty: 1,
          unitPriceCents: 6000,
        },
      ],
    },
    {
      client: 1,
      vehicle: vehicleIdsByClient[1]![0]!,
      mechanic: mechanicIds[1]!,
      note: 'Revison de frenos y sonido en la suspension delantera.',
      flow: [
        { state: 'Recibido' },
        { state: 'Diagnóstico', note: 'Bujes de rueda izq. traseros Destroyed' },
        {
          state: 'En reparación',
          note: 'Pedir bujes: stock agotado',
          incident: true,
          notify: true,
        },
        { state: 'En reparacion', note: 'Bujes llegaron, montando', notify: true },
        { state: 'Control de calidad' },
        { state: 'Entregado', notify: true },
      ],
      items: [
        {
          kind: 'part',
          description: 'Buje de rueda trasera izquierda',
          qty: 2,
          unitPriceCents: 7400,
        },
        { kind: 'labor', description: 'Mano de obra - suspension', qty: 1, unitPriceCents: 18000 },
      ],
    },
    {
      client: 2,
      vehicle: vehicleIdsByClient[2]![0]!,
      mechanic: mechanicIds[0]!,
      note: 'Cambio de aceite y alineacion.',
      flow: [
        { state: 'Recibido' },
        { state: 'En reparacion', note: 'Alineacion y balanceo', notify: true },
        { state: 'Entregado', notify: true },
      ],
      items: [
        {
          kind: 'part',
          description: 'Aceite sintetico 0W-20 (galon)',
          qty: 1,
          unitPriceCents: 5200,
        },
        { kind: 'labor', description: 'Alineacion', qty: 1, unitPriceCents: 9000 },
        { kind: 'labor', description: 'Balanceo', qty: 1, unitPriceCents: 5000 },
      ],
    },
    {
      client: 2,
      vehicle: vehicleIdsByClient[2]![1]!,
      mechanic: mechanicIds[1]!,
      note: 'Se apago el(check engine).',
      flow: [
        { state: 'Recibido' },
        { state: 'Diagnóstico', note: 'Codigo P0420 - catalytic converter' },
        {
          state: 'Esperando repuesto',
          note: 'Catalizador de 5 dias',
          incident: true,
          notify: true,
        },
      ],
      items: [
        { kind: 'labor', description: 'Diagnaneo computarizado', qty: 1, unitPriceCents: 4000 },
      ],
    },
    {
      client: 2,
      vehicle: vehicleIdsByClient[2]![2]!,
      mechanic: mechanicIds[0]!,
      note: 'Revision general de 60,000 km.',
      flow: [
        { state: 'Recibido' },
        { state: 'En reparacion', note: 'Revision general', notify: true },
        { state: 'Control de calidad' },
        { state: 'Entregado', notify: true },
      ],
      items: [
        {
          kind: 'part',
          description: 'Filtro de aceite + filtro de habitaculo',
          qty: 1,
          unitPriceCents: 3600,
        },
        {
          kind: 'labor',
          description: 'Mano de obra - revision general',
          qty: 1,
          unitPriceCents: 7500,
        },
      ],
    },
  ]

  for (const s of scenarios) {
    const orderId = await createOrder(db, {
      clientId: clientIds[s.client]!,
      vehicleId: s.vehicle,
      mechanicId: s.mechanic,
      clientNote: s.note ?? null,
    })

    for (const item of s.items) {
      await addItem(db, orderId, {
        kind: item.kind,
        description: item.description,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
      })
    }

    let first = true
    for (const step of s.flow) {
      await applyTransition(db, {
        orderId,
        toStateLabel: step.state,
        actorId: s.mechanic,
        note: step.note ?? null,
        notifyClient: step.notify ?? false,
        // El "Recibido" automatico ya se registro; el del flujo queda oculto
        // para no duplicarlo en la linea de tiempo del cliente.
        isClientVisible: first ? false : true,
        isIncident: step.incident ?? false,
      })
      first = false
    }

    const delivered = s.flow.some((f) => f.state === 'Entregado')
    if (delivered) {
      await issueInvoice(db, orderId, { paymentMethod: 'tarjeta', markPaid: true })
    }
  }

  // Luis tiene 3 vehiculos y varios historiales: le dejamos una orden en curso
  // con un estado personalizado ya escrito por el mecanico.
  const extraOrder = await createOrder(db, {
    clientId: clientIds[2]!,
    vehicleId: vehicleIdsByClient[2]![0]!,
    mechanicId: mechanicIds[0]!,
    clientNote: 'Vibracion al conducir sobre 100 km/h.',
  })
  await addItem(db, extraOrder, {
    kind: 'labor',
    description: 'Diagnostico de vibracion',
    qty: 1,
    unitPriceCents: 4500,
  })
  await updateOrder(db, extraOrder, { status: 'open' })
  const custom = await resolveState(db, 'EnRevisionDelCliente')
  await applyTransition(db, {
    orderId: extraOrder,
    toStateLabel: custom.label,
    actorId: mechanicIds[0]!,
    note: 'Probando el vehiculo en ruta de prueba',
    notifyClient: true,
  })

  // Ana ya cruzo el umbral en el seed: le damos una recompensa disponible para
  // que el canje se pueda probar sin esperar 5 visitas mas.
  const firstOrder = await db
    .prepare<[number], { id: number }>(
      "SELECT id FROM repair_orders WHERE client_id = ? AND status = 'delivered' ORDER BY id LIMIT 1",
    )
    .get(clientIds[0]!)

  if (firstOrder) {
    const cfg = await readLoyaltyConfig(db)
    const missing = Math.max(
      0,
      cfg.pointsPerReward - ((await ensureAccount(db, clientIds[0]!)).points_balance ?? 0),
    )
    // Solo los puntos que falten, directo en el ledger (sin orden ficticia).
    if (missing > 0) {
      await db.transaction(async () => {
        await db
          .prepare(
            `UPDATE loyalty_accounts
             SET points_balance = points_balance + ?, lifetime_points = lifetime_points + ?
             WHERE client_id = ?`,
          )
          .run(missing, missing, clientIds[0])
        await db
          .prepare(
            `INSERT INTO ledger_entries (client_id, delta, reason, note) VALUES (?, ?, 'adjust', ?)`,
          )
          .run(clientIds[0], missing, 'Ajuste de historico previo al taller')
      })
    }
    await grantReward(db, clientIds[0]!)
  }

  console.log('Datos de demo creados (password: demo1234)')
  console.log(`  Mecanicos: ${DEMO_MECHANICS.map((m) => m.email).join(', ')}`)
  console.log(`  Clientes:  ${DEMO_CLIENTS.map((c) => c.email).join(', ')}`)
}
