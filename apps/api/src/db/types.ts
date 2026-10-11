export type Role = 'client' | 'mechanic' | 'admin'

export interface UserRow {
  id: number
  role: Role
  email: string
  phone: string | null
  name: string
  password_hash: string
  is_active: 0 | 1
  /** Version de sesion; se incrementa al cambiar la contrasena. */
  token_version: number
  created_at: string
  updated_at: string
}

export interface RepairStateRow {
  id: number
  key: string
  label: string
  color: string
  position: number
  is_suggested: 0 | 1
  is_custom: 0 | 1
  is_incident: 0 | 1
  is_terminal: 0 | 1
  is_active: 0 | 1
  created_at: string
  updated_at: string
}

export interface VehicleRow {
  id: number
  client_id: number
  plate: string
  vin: string | null
  brand: string
  model: string
  year: number | null
  mileage: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type OrderStatus = 'open' | 'delivered' | 'cancelled'

export interface RepairOrderRow {
  id: number
  code: string
  client_id: number
  vehicle_id: number
  mechanic_id: number | null
  state_id: number | null
  status: OrderStatus
  state_changed_at: string | null
  client_note: string | null
  mileage: number | null
  currency: string
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  created_at: string
  updated_at: string
  delivered_at: string | null
}

export type OrderItemKind = 'part' | 'labor' | 'service'
export type OrderItemStatus = 'pending' | 'done' | 'cancelled'

export interface OrderItemRow {
  id: number
  order_id: number
  kind: OrderItemKind
  description: string
  qty: number
  unit_price_cents: number
  status: OrderItemStatus
  applied_redemption_id: number | null
  created_at: string
}

export interface StateEventRow {
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

export interface InvoiceRow {
  id: number
  order_id: number
  number: string
  status: 'issued' | 'paid' | 'void'
  payment_method: string | null
  issued_at: string
  paid_at: string | null
  total_cents: number
  currency: string
  created_at: string
}

export interface LoyaltyAccountRow {
  client_id: number
  points_balance: number
  lifetime_points: number
  rewards_available: number
  rewards_redeemed: number
  updated_at: string
}

export type LedgerReason = 'repair' | 'reward_granted' | 'redeem' | 'adjust'

export interface LedgerEntryRow {
  id: number
  client_id: number
  delta: number
  reason: LedgerReason
  ref_order_id: number | null
  ref_redemption_id: number | null
  note: string | null
  created_by: number | null
  created_at: string
}

export interface RedemptionRow {
  id: number
  client_id: number
  label: string
  code: string
  status: 'available' | 'used' | 'expired'
  created_at: string
  expires_at: string | null
  redeemed_at: string | null
  redeemed_by: number | null
  applied_order_id: number | null
}

export interface PushSubscriptionRow {
  id: number
  user_id: number
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
}

export interface NotificationRow {
  id: number
  user_id: number
  title: string
  body: string
  kind: 'state' | 'incident' | 'loyalty' | 'billing' | 'info'
  order_id: number | null
  read_at: string | null
  created_at: string
}

export interface SettingRow {
  key: string
  value: string
  updated_at: string
}
