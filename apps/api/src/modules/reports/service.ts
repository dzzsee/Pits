import type { Db } from '../../db/connection.js'

export interface ReportsSummary {
  range: { from: string | null; to: string | null }
  orders: { total: number; open: number; delivered: number; cancelled: number }
  revenue: { totalCents: number; byMonth: { month: string; cents: number; count: number }[] }
  states: { label: string; color: string; count: number }[]
  mechanics: { id: number; name: string; orders: number; revenueCents: number }[]
  loyalty: {
    clients: number
    pointsIssued: number
    rewardsGranted: number
    rewardsRedeemed: number
    topClients: { id: number; name: string; points: number; repairs: number }[]
  }
  incidents: { orderId: number; code: string; state: string; note: string | null; created_at: string }[]
}

function dateClause(from?: unknown, to?: unknown): { clause: string; values: string[] } {
  const clauses: string[] = []
  const values: string[] = []
  if (typeof from === 'string' && from) {
    clauses.push('date(o.created_at) >= date(?)')
    values.push(from)
  }
  if (typeof to === 'string' && to) {
    clauses.push('date(o.created_at) <= date(?)')
    values.push(to)
  }
  return { clause: clauses.length ? `AND ${clauses.join(' AND ')}` : '', values }
}

export function reportsSummary(
  db: Db,
  range: { from?: unknown; to?: unknown } = {},
): ReportsSummary {
  const { clause, values } = dateClause(range.from, range.to)

  const counts = db
    .prepare<unknown[], { total: number; open: number; delivered: number; cancelled: number }>(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'open'), 0)      AS open,
         COALESCE(SUM(status = 'delivered'), 0) AS delivered,
         COALESCE(SUM(status = 'cancelled'), 0) AS cancelled
       FROM repair_orders o WHERE 1=1 ${clause}`,
    )
    .get(...values)!

  const revenue = db
    .prepare<unknown[], { total: number }>(
      `SELECT COALESCE(SUM(total_cents), 0) AS total FROM repair_orders o
       WHERE o.status = 'delivered' ${clause}`,
    )
    .get(...values)!.total

  const byMonth = db
    .prepare<unknown[], { month: string; cents: number; count: number }>(
      `SELECT strftime('%Y-%m', o.created_at) AS month,
              COALESCE(SUM(total_cents), 0) AS cents,
              COUNT(*) AS count
       FROM repair_orders o
       WHERE o.status = 'delivered' ${clause}
       GROUP BY month ORDER BY month DESC LIMIT 12`,
    )
    .all(...values)

  const states = db
    .prepare<unknown[], { label: string; color: string; count: number }>(
      `SELECT s.label, s.color, COUNT(*) AS count
       FROM repair_orders o JOIN repair_states s ON s.id = o.state_id
       WHERE 1=1 ${clause.replace(/o\./g, 'o.')}
       GROUP BY s.id ORDER BY count DESC`,
    )
    .all(...values)

  const mechanics = db
    .prepare<unknown[], { id: number; name: string; orders: number; revenueCents: number }>(
      `SELECT u.id, u.name,
              COUNT(o.id) AS orders,
              COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total_cents ELSE 0 END), 0) AS revenueCents
       FROM users u
       LEFT JOIN repair_orders o ON o.mechanic_id = u.id
       WHERE u.role IN ('mechanic','admin')
       GROUP BY u.id ORDER BY orders DESC`,
    )
    .all()

  const loyaltyTotals = db
    .prepare<
      [],
      { clients: number; pointsIssued: number; rewardsGranted: number; rewardsRedeemed: number }
    >(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE role = 'client' AND is_active = 1) AS clients,
         COALESCE((SELECT SUM(lifetime_points) FROM loyalty_accounts), 0) AS pointsIssued,
         COALESCE((SELECT COUNT(*) FROM redemptions WHERE status IN ('used','available')), 0) AS rewardsGranted,
         COALESCE((SELECT COUNT(*) FROM redemptions WHERE status = 'used'), 0) AS rewardsRedeemed`,
    )
    .get()!

  const topClients = db
    .prepare<[], { id: number; name: string; points: number; repairs: number }>(
      `SELECT u.id, u.name,
              COALESCE(l.lifetime_points, 0) AS points,
              (SELECT COUNT(*) FROM repair_orders o
                WHERE o.client_id = u.id AND o.status = 'delivered') AS repairs
       FROM users u
       LEFT JOIN loyalty_accounts l ON l.client_id = u.id
       WHERE u.role = 'client'
       ORDER BY repairs DESC, points DESC LIMIT 8`,
    )
    .all()

  const incidents = db
    .prepare<unknown[], ReportsSummary['incidents'][number]>(
      `SELECT e.order_id AS orderId, o.code, s.label AS state, e.note, e.created_at
       FROM state_events e
       JOIN repair_orders o ON o.id = e.order_id
       JOIN repair_states s ON s.id = e.to_state_id
       WHERE e.is_incident = 1 ${clause}
       ORDER BY e.id DESC LIMIT 10`,
    )
    .all(...values)

  return {
    range: {
      from: typeof range.from === 'string' ? range.from : null,
      to: typeof range.to === 'string' ? range.to : null,
    },
    orders: counts,
    revenue: { totalCents: revenue, byMonth },
    states,
    mechanics,
    loyalty: { ...loyaltyTotals, topClients },
    incidents,
  }
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Export plano, pensado para abrir en Excel/Sheets sin dependencias extra. */
export function reportsCsv(db: Db, range: { from?: unknown; to?: unknown } = {}): string {
  const { clause, values } = dateClause(range.from, range.to)
  const rows = db
    .prepare<unknown[], {
      code: string
      created_at: string
      delivered_at: string | null
      status: string
      state: string | null
      incident: number
      client: string
      vehicle: string
      mechanic: string | null
      subtotal: number
      discount: number
      total: number
      currency: string
      points: number
    }>(
      `SELECT o.code, o.created_at, o.delivered_at, o.status,
              (SELECT s.label FROM state_events e JOIN repair_states s ON s.id = e.to_state_id
                WHERE e.order_id = o.id ORDER BY e.id DESC LIMIT 1) AS state,
              (SELECT COUNT(*) FROM state_events e WHERE e.order_id = o.id AND e.is_incident = 1) AS incident,
              u.name AS client,
              (v.plate || ' ' || v.brand || ' ' || v.model) AS vehicle,
              m.name AS mechanic,
              o.subtotal_cents AS subtotal, o.discount_cents AS discount,
              o.total_cents AS total, o.currency,
              COALESCE((SELECT SUM(delta) FROM ledger_entries l
                         WHERE l.ref_order_id = o.id AND l.reason = 'repair'), 0) AS points
       FROM repair_orders o
       JOIN users u ON u.id = o.client_id
       JOIN vehicles v ON v.id = o.vehicle_id
       LEFT JOIN users m ON m.id = o.mechanic_id
       WHERE 1=1 ${clause}
       ORDER BY o.id DESC`,
    )
    .all(...values)

  const header = [
    'Codigo',
    'Creada',
    'Entregada',
    'Estado',
    'Estado actual',
    'Contratiempos',
    'Cliente',
    'Vehiculo',
    'Mecanico',
    'Subtotal',
    'Descuento',
    'Total',
    'Moneda',
    'Puntos',
  ]

  const body = rows.map((r) =>
    [
      r.code,
      r.created_at,
      r.delivered_at ?? '',
      r.status,
      r.state ?? '',
      r.incident,
      r.client,
      r.vehicle,
      r.mechanic ?? '',
      (r.subtotal / 100).toFixed(2),
      (r.discount / 100).toFixed(2),
      (r.total / 100).toFixed(2),
      r.currency,
      r.points,
    ]
      .map(csvEscape)
      .join(','),
  )

  return [header.join(','), ...body].join('\n')
}
