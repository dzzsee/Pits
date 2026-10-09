export interface Migration {
  id: number
  name: string
  up: string
}

/**
 * Migraciones incrementales. Nunca edites una migracion ya aplicada:
 * agrega una nueva al final.
 */
export const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial_schema',
    up: /* sql */ `
    CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      role          TEXT NOT NULL CHECK (role IN ('client','mechanic','admin')),
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone         TEXT,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_users_role ON users(role);

    CREATE TABLE repair_states (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      key          TEXT NOT NULL UNIQUE,
      label        TEXT NOT NULL,
      color        TEXT NOT NULL DEFAULT 'slate',
      position     INTEGER NOT NULL DEFAULT 0,
      is_suggested INTEGER NOT NULL DEFAULT 0 CHECK (is_suggested IN (0,1)),
      is_custom    INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0,1)),
      is_incident  INTEGER NOT NULL DEFAULT 0 CHECK (is_incident IN (0,1)),
      is_terminal  INTEGER NOT NULL DEFAULT 0 CHECK (is_terminal IN (0,1)),
      is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE vehicles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plate      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      vin        TEXT,
      brand      TEXT NOT NULL,
      model      TEXT NOT NULL,
      year       INTEGER,
      mileage    INTEGER,
      notes      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_vehicles_client ON vehicles(client_id);

    CREATE TABLE repair_orders (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      code             TEXT NOT NULL UNIQUE,
      client_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id       INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
      mechanic_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      state_id         INTEGER REFERENCES repair_states(id) ON DELETE SET NULL,
      status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','delivered','cancelled')),
      state_changed_at TEXT,
      client_note      TEXT,
      mileage          INTEGER,
      currency         TEXT NOT NULL DEFAULT 'USD',
      subtotal_cents   INTEGER NOT NULL DEFAULT 0,
      discount_cents   INTEGER NOT NULL DEFAULT 0,
      total_cents      INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at     TEXT
    );
    CREATE INDEX idx_orders_client ON repair_orders(client_id);
    CREATE INDEX idx_orders_status ON repair_orders(status);
    CREATE INDEX idx_orders_vehicle ON repair_orders(vehicle_id);
    CREATE INDEX idx_orders_mechanic ON repair_orders(mechanic_id);

    CREATE TABLE order_items (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id               INTEGER NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
      kind                   TEXT NOT NULL CHECK (kind IN ('part','labor','service')),
      description            TEXT NOT NULL,
      qty                    REAL NOT NULL DEFAULT 1,
      unit_price_cents       INTEGER NOT NULL DEFAULT 0,
      status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
      applied_redemption_id  INTEGER REFERENCES redemptions(id) ON DELETE SET NULL,
      created_at             TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_items_order ON order_items(order_id);

    CREATE TABLE state_events (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id              INTEGER NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
      from_state_id         INTEGER REFERENCES repair_states(id) ON DELETE SET NULL,
      to_state_id           INTEGER NOT NULL REFERENCES repair_states(id) ON DELETE RESTRICT,
      state_label_snapshot  TEXT NOT NULL,
      state_color_snapshot  TEXT NOT NULL,
      note                  TEXT,
      is_incident           INTEGER NOT NULL DEFAULT 0 CHECK (is_incident IN (0,1)),
      is_client_visible     INTEGER NOT NULL DEFAULT 1 CHECK (is_client_visible IN (0,1)),
      notify_client         INTEGER NOT NULL DEFAULT 0 CHECK (notify_client IN (0,1)),
      created_by            INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_events_order ON state_events(order_id);

    CREATE TABLE invoices (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id       INTEGER NOT NULL UNIQUE REFERENCES repair_orders(id) ON DELETE CASCADE,
      number         TEXT NOT NULL UNIQUE,
      status         TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','paid','void')),
      payment_method TEXT,
      issued_at      TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at        TEXT,
      total_cents    INTEGER NOT NULL DEFAULT 0,
      currency       TEXT NOT NULL DEFAULT 'USD',
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE loyalty_accounts (
      client_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      points_balance   INTEGER NOT NULL DEFAULT 0,
      lifetime_points  INTEGER NOT NULL DEFAULT 0,
      rewards_available INTEGER NOT NULL DEFAULT 0,
      rewards_redeemed INTEGER NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE ledger_entries (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delta               INTEGER NOT NULL,
      reason              TEXT NOT NULL CHECK (reason IN ('repair','reward_granted','redeem','adjust')),
      ref_order_id        INTEGER REFERENCES repair_orders(id) ON DELETE SET NULL,
      ref_redemption_id   INTEGER REFERENCES redemptions(id) ON DELETE SET NULL,
      note                TEXT,
      created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_ledger_client ON ledger_entries(client_id, id DESC);

    CREATE TABLE redemptions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label           TEXT NOT NULL,
      code            TEXT NOT NULL UNIQUE,
      status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','used','expired')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at      TEXT,
      redeemed_at     TEXT,
      redeemed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      applied_order_id INTEGER REFERENCES repair_orders(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_redemptions_client ON redemptions(client_id, status);

    CREATE TABLE push_subscriptions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint   TEXT NOT NULL UNIQUE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_push_user ON push_subscriptions(user_id);

    CREATE TABLE notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'info' CHECK (kind IN ('state','incident','loyalty','billing','info')),
      order_id   INTEGER REFERENCES repair_orders(id) ON DELETE CASCADE,
      read_at    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_notif_user ON notifications(user_id, id DESC);

    CREATE TABLE settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE counters (
      name  TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
    `,
  },
]
