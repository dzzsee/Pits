export type Role = 'client' | 'mechanic' | 'admin'

export interface User {
  id: number
  role: Role
  email: string
  phone: string | null
  name: string
  created_at: string
  /** El API lo envia siempre; el panel lo usa para activar y desactivar. */
  is_active: number
}

export type StateColor =
  'slate' | 'sky' | 'amber' | 'violet' | 'emerald' | 'rose' | 'cyan' | 'orange' | 'teal' | 'indigo'

export interface RepairState {
  id: number
  key: string
  label: string
  color: StateColor
  position: number
  is_suggested: 0 | 1
  is_custom: 0 | 1
  is_incident: 0 | 1
  is_terminal: 0 | 1
  is_active: 0 | 1
}

export interface Vehicle {
  id: number
  client_id: number
  plate: string
  vin: string | null
  brand: string
  model: string
  year: number | null
  mileage: number | null
  notes: string | null
  created_at?: string
  updated_at?: string
  order_count?: number
}

export interface OrderSummary {
  id: number
  code: string
  client_id: number
  vehicle_id: number
  mechanic_id: number | null
  state_id: number | null
  status: 'open' | 'delivered' | 'cancelled'
  state_changed_at: string | null
  total_cents: number
  currency: string
  created_at: string
  delivered_at: string | null
  state_label: string | null
  state_color: string | null
  vehicle_label: string
}

export interface OrderItem {
  id: number
  order_id: number
  kind: 'part' | 'labor' | 'service'
  description: string
  qty: number
  unit_price_cents: number
  status: 'pending' | 'done' | 'cancelled'
  applied_redemption_id: number | null
}

export interface StateEvent {
  id: number
  order_id: number
  from_state_id: number | null
  to_state_id: number
  state_label_snapshot: string
  state_color_snapshot: string
  note: string | null
  is_incident: 0 | 1
  is_client_visible: 0 | 1
  notify_client: 0 | 1
  created_by: number
  created_at: string
}

export interface OrderDetail {
  order: OrderSummary & {
    state_key: string | null
    state_is_incident: number | null
    client_note: string | null
    mileage: number | null
    subtotal_cents: number
    discount_cents: number
  }
  vehicle: Vehicle
  client: { id: number; name: string; email: string; phone: string | null }
  mechanic: { id: number; name: string } | null
  items: OrderItem[]
  events: StateEvent[]
  invoice: {
    id: number
    number: string
    status: string
    total_cents: number
    paid_at: string | null
  } | null
}

export interface Redemption {
  id: number
  client_id: number
  label: string
  code: string
  status: 'available' | 'used' | 'expired'
  created_at: string
  expires_at: string | null
  redeemed_at: string | null
  client_name?: string
}

export interface AppNotification {
  id: number
  title: string
  body: string
  kind: 'state' | 'incident' | 'loyalty' | 'billing' | 'info'
  order_id: number | null
  read_at: string | null
  created_at: string
}

export interface LoyaltySummary {
  points: number
  lifetimePoints: number
  rewardsAvailable: number
  rewardsRedeemed: number
  rewardLabel: string
  pointsPerRepair: number
  pointsPerReward: number
  remaining: number
  percent: number
  repairsUntilReward: number
  codes: Redemption[]
}

/** Payload del PATCH de estados: la API usa nombres camelCase. */
export type RepairStatePatch = Partial<{
  label: string
  color: StateColor
  position: number
  isIncident: boolean
  isTerminal: boolean
  isActive: boolean
}>

export interface ClientDashboard {
  shop: { name: string; currency: string }
  openRepairs: OrderSummary[]
  history: OrderSummary[]
  vehicles: Vehicle[]
  loyalty: LoyaltySummary
  stats: { completedRepairs: number; vehicles: number; spentCents: number }
  notifications: AppNotification[]
  unread: number
}

export interface LoyaltyDetail {
  client_id: number
  points_balance: number
  lifetime_points: number
  rewards_available: number
  rewards_redeemed: number
  rewardLabel: string
  pointsPerRepair: number
  pointsPerReward: number
  remaining: number
  percent: number
  repairsUntilReward: number
  redemptions: Redemption[]
  ledger: {
    id: number
    delta: number
    reason: 'repair' | 'reward_granted' | 'redeem' | 'adjust'
    note: string | null
    created_at: string
    ref_order_id: number | null
  }[]
}

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
  incidents: {
    orderId: number
    code: string
    state: string
    note: string | null
    created_at: string
  }[]
}

export interface TransitionResult {
  orderId: number
  state: { id: number; key: string; label: string; color: StateColor; isTerminal: number }
  eventId: number
  delivered: boolean
  pointsAwarded: number
  rewardsGranted: string[]
}
