-- Pits: volcado de la base de datos (esquema + datos).
--
-- Es la fuente de verdad del proyecto: al arrancar en una maquina limpia el
-- API importa este archivo en lugar de correr migraciones.
--
-- Regenerar desde una base recien sembrada:
--   npm run db:dump:fresh -w @pits/api
-- Volcar la base que se esta usando tal cual:
--   npm run db:dump -w @pits/api

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE _migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
INSERT INTO "_migrations" VALUES(1,'initial_schema','2026-10-09 23:04:23');
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
INSERT INTO "users" VALUES(1,'admin','admin@pits.local',NULL,'Administrador Pits','$pbkdf2-sha256$100000$LK3w6bUY9hFxcWN2uR1-1A$CNLTsundh8UDRB_PFwkfaxnVAciYp9YvhFhJkmJ_Omk',1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "users" VALUES(2,'mechanic','mecanico@pits.local',NULL,'Javier Santos','$pbkdf2-sha256$100000$1EbETUIiaREIwSfEVXCuig$wRYEBsmxrPPEtwqHpsFzfCjva_bz38ChcONrSYMCJWY',1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "users" VALUES(3,'mechanic','mecanico2@pits.local',NULL,'Rosa Diaz','$pbkdf2-sha256$100000$V6OdTyprgjAkSxvOqZJXBA$mbyYRxZ2lrcbAYJimaTDbUR80Xwyj4LN5CQ6MM50CwQ',1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "users" VALUES(4,'client','ana@demo.local','+1 809 555 0101','Ana Rivera','$pbkdf2-sha256$100000$tHHYsZFi56yQ_rdhIPoOwQ$CG8gNRd8ekhFS58Puc81ZYmQhoYOSWR2ec1Feyet4Do',1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "users" VALUES(5,'client','carlos@demo.local','+1 809 555 0202','Carlos Medina','$pbkdf2-sha256$100000$sJDqsDecCyjXNtCWF1qWNQ$2vjbqker9h_xoHzt5pcbH0D5mI0_5nOjegDmY5TJ0MA',1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "users" VALUES(6,'client','luis@demo.local','+1 809 555 0303','Luis Fernandez','$pbkdf2-sha256$100000$Rbh3UBBxvwgMltwmWfNd7Q$yDB-1QVosoYA4Vm-4qwAjYlMvK-CHaIim-P-n-cO-6I',1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
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
INSERT INTO "repair_states" VALUES(1,'recibido','Recibido','slate',0,1,0,0,0,1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "repair_states" VALUES(2,'diagnostico','Diagnóstico','sky',1,1,0,0,0,1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "repair_states" VALUES(3,'en-reparacion','En reparación','amber',2,1,0,1,0,1,'2026-10-09 23:04:23','2026-10-09 23:04:24');
INSERT INTO "repair_states" VALUES(4,'control-de-calidad','Control de calidad','violet',3,1,0,0,0,1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "repair_states" VALUES(5,'listo-para-entregar','Listo para entregar','emerald',4,1,0,0,0,1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "repair_states" VALUES(6,'entregado','Entregado','emerald',5,1,0,0,1,1,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "repair_states" VALUES(7,'esperando-repuesto','Esperando repuesto','teal',6,0,1,1,0,1,'2026-10-09 23:04:24','2026-10-09 23:04:24');
INSERT INTO "repair_states" VALUES(8,'enrevisiondelcliente','EnRevisionDelCliente','violet',7,0,1,0,0,1,'2026-10-09 23:04:24','2026-10-09 23:04:24');
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
INSERT INTO "vehicles" VALUES(1,4,'ABC-123',NULL,'Toyota','Corolla',2019,84200,NULL,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "vehicles" VALUES(2,4,'XYZ-987',NULL,'Honda','Civic',2021,31500,NULL,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "vehicles" VALUES(3,5,'MNO-456',NULL,'Ford','Ranger',2017,156800,NULL,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "vehicles" VALUES(4,6,'QRS-222',NULL,'Mazda','CX-5',2022,21000,NULL,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "vehicles" VALUES(5,6,'TUV-888',NULL,'Hyundai','Elantra',2018,97300,NULL,'2026-10-09 23:04:23','2026-10-09 23:04:23');
INSERT INTO "vehicles" VALUES(6,6,'WXY-333',NULL,'Kia','Rio',2020,60450,NULL,'2026-10-09 23:04:23','2026-10-09 23:04:23');
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
INSERT INTO "repair_orders" VALUES(1,'PITS-2026-0001',4,1,2,6,'delivered','2026-10-09 23:04:23','El carro hace ruido al frenar en baja.',NULL,'USD',24000,0,24000,'2026-10-09 23:04:23','2026-10-09 23:04:24','2026-10-09 23:04:23');
INSERT INTO "repair_orders" VALUES(2,'PITS-2026-0002',4,2,2,6,'delivered','2026-10-09 23:04:24','Mantenimiento de 80,000 km.',NULL,'USD',14500,0,14500,'2026-10-09 23:04:24','2026-10-09 23:04:24','2026-10-09 23:04:24');
INSERT INTO "repair_orders" VALUES(3,'PITS-2026-0003',5,3,3,6,'delivered','2026-10-09 23:04:24','Revison de frenos y sonido en la suspension delantera.',NULL,'USD',32800,0,32800,'2026-10-09 23:04:24','2026-10-09 23:04:24','2026-10-09 23:04:24');
INSERT INTO "repair_orders" VALUES(4,'PITS-2026-0004',6,4,2,6,'delivered','2026-10-09 23:04:24','Cambio de aceite y alineacion.',NULL,'USD',19200,0,19200,'2026-10-09 23:04:24','2026-10-09 23:04:24','2026-10-09 23:04:24');
INSERT INTO "repair_orders" VALUES(5,'PITS-2026-0005',6,5,3,7,'open','2026-10-09 23:04:24','Se apago el(check engine).',NULL,'USD',4000,0,4000,'2026-10-09 23:04:24','2026-10-09 23:04:24',NULL);
INSERT INTO "repair_orders" VALUES(6,'PITS-2026-0006',6,6,2,6,'delivered','2026-10-09 23:04:24','Revision general de 60,000 km.',NULL,'USD',11100,0,11100,'2026-10-09 23:04:24','2026-10-09 23:04:24','2026-10-09 23:04:24');
INSERT INTO "repair_orders" VALUES(7,'PITS-2026-0007',6,4,2,8,'open','2026-10-09 23:04:24','Vibracion al conducir sobre 100 km/h.',NULL,'USD',4500,0,4500,'2026-10-09 23:04:24','2026-10-09 23:04:24',NULL);
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
INSERT INTO "order_items" VALUES(1,1,'part','Pastillas de freno delanteras',1,8500,'pending',NULL,'2026-10-09 23:04:23');
INSERT INTO "order_items" VALUES(2,1,'labor','Mano de obra - rectificado de discos',1,12000,'pending',NULL,'2026-10-09 23:04:23');
INSERT INTO "order_items" VALUES(3,1,'service','Limpieza deInjectores',1,3500,'pending',NULL,'2026-10-09 23:04:23');
INSERT INTO "order_items" VALUES(4,2,'part','Aceite sintetico 5W-30 (galon)',1,4500,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(5,2,'part','Filtro de aceite',1,1800,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(6,2,'part','Filtro de aire',1,2200,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(7,2,'labor','Mano de obra - mantenimiento',1,6000,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(8,3,'part','Buje de rueda trasera izquierda',2,7400,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(9,3,'labor','Mano de obra - suspension',1,18000,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(10,4,'part','Aceite sintetico 0W-20 (galon)',1,5200,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(11,4,'labor','Alineacion',1,9000,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(12,4,'labor','Balanceo',1,5000,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(13,5,'labor','Diagnaneo computarizado',1,4000,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(14,6,'part','Filtro de aceite + filtro de habitaculo',1,3600,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(15,6,'labor','Mano de obra - revision general',1,7500,'pending',NULL,'2026-10-09 23:04:24');
INSERT INTO "order_items" VALUES(16,7,'labor','Diagnostico de vibracion',1,4500,'pending',NULL,'2026-10-09 23:04:24');
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
INSERT INTO "state_events" VALUES(1,1,NULL,1,'Recibido','slate','Vehiculo recibido en el taller',0,1,0,2,'2026-10-09 23:04:23');
INSERT INTO "state_events" VALUES(2,1,1,1,'Recibido','slate','Kilometraje verificado',0,0,0,2,'2026-10-09 23:04:23');
INSERT INTO "state_events" VALUES(3,1,1,2,'Diagnóstico','sky','Pastillas delanteras desgastadas, discos al 40%',0,1,0,2,'2026-10-09 23:04:23');
INSERT INTO "state_events" VALUES(4,1,2,3,'En reparación','amber','Cambio de pastillas y rectificado de discos',0,1,1,2,'2026-10-09 23:04:23');
INSERT INTO "state_events" VALUES(5,1,3,4,'Control de calidad','violet','Probado de frenada OK',0,1,0,2,'2026-10-09 23:04:23');
INSERT INTO "state_events" VALUES(6,1,4,5,'Listo para entregar','emerald','Listo en recepcion',0,1,1,2,'2026-10-09 23:04:23');
INSERT INTO "state_events" VALUES(7,1,5,6,'Entregado','emerald','Entregado al cliente. 12 meses de garantia',0,1,1,2,'2026-10-09 23:04:23');
INSERT INTO "state_events" VALUES(8,2,NULL,1,'Recibido','slate','Vehiculo recibido en el taller',0,1,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(9,2,1,1,'Recibido','slate',NULL,0,0,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(10,2,1,3,'En reparación','amber','Cambio de aceite y filtros',0,1,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(11,2,3,6,'Entregado','emerald',NULL,0,1,1,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(12,3,NULL,1,'Recibido','slate','Vehiculo recibido en el taller',0,1,0,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(13,3,1,1,'Recibido','slate',NULL,0,0,0,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(14,3,1,2,'Diagnóstico','sky','Bujes de rueda izq. traseros Destroyed',0,1,0,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(15,3,2,3,'En reparación','amber','Pedir bujes: stock agotado',1,1,1,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(16,3,3,3,'En reparación','amber','Bujes llegaron, montando',0,1,1,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(17,3,3,4,'Control de calidad','violet',NULL,0,1,0,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(18,3,4,6,'Entregado','emerald',NULL,0,1,1,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(19,4,NULL,1,'Recibido','slate','Vehiculo recibido en el taller',0,1,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(20,4,1,1,'Recibido','slate',NULL,0,0,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(21,4,1,3,'En reparación','amber','Alineacion y balanceo',0,1,1,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(22,4,3,6,'Entregado','emerald',NULL,0,1,1,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(23,5,NULL,1,'Recibido','slate','Vehiculo recibido en el taller',0,1,0,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(24,5,1,1,'Recibido','slate',NULL,0,0,0,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(25,5,1,2,'Diagnóstico','sky','Codigo P0420 - catalytic converter',0,1,0,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(26,5,2,7,'Esperando repuesto','teal','Catalizador de 5 dias',1,1,1,3,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(27,6,NULL,1,'Recibido','slate','Vehiculo recibido en el taller',0,1,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(28,6,1,1,'Recibido','slate',NULL,0,0,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(29,6,1,3,'En reparación','amber','Revision general',0,1,1,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(30,6,3,4,'Control de calidad','violet',NULL,0,1,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(31,6,4,6,'Entregado','emerald',NULL,0,1,1,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(32,7,NULL,1,'Recibido','slate','Vehiculo recibido en el taller',0,1,0,2,'2026-10-09 23:04:24');
INSERT INTO "state_events" VALUES(33,7,1,8,'EnRevisionDelCliente','violet','Probando el vehiculo en ruta de prueba',0,1,1,2,'2026-10-09 23:04:24');
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
INSERT INTO "invoices" VALUES(1,1,'INV-2026-0001','paid','tarjeta','2026-10-09 23:04:24','2026-10-09 23:04:24',24000,'USD','2026-10-09 23:04:24');
INSERT INTO "invoices" VALUES(2,2,'INV-2026-0002','paid','tarjeta','2026-10-09 23:04:24','2026-10-09 23:04:24',14500,'USD','2026-10-09 23:04:24');
INSERT INTO "invoices" VALUES(3,3,'INV-2026-0003','paid','tarjeta','2026-10-09 23:04:24','2026-10-09 23:04:24',32800,'USD','2026-10-09 23:04:24');
INSERT INTO "invoices" VALUES(4,4,'INV-2026-0004','paid','tarjeta','2026-10-09 23:04:24','2026-10-09 23:04:24',19200,'USD','2026-10-09 23:04:24');
INSERT INTO "invoices" VALUES(5,6,'INV-2026-0005','paid','tarjeta','2026-10-09 23:04:24','2026-10-09 23:04:24',11100,'USD','2026-10-09 23:04:24');
CREATE TABLE loyalty_accounts (
      client_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      points_balance   INTEGER NOT NULL DEFAULT 0,
      lifetime_points  INTEGER NOT NULL DEFAULT 0,
      rewards_available INTEGER NOT NULL DEFAULT 0,
      rewards_redeemed INTEGER NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
INSERT INTO "loyalty_accounts" VALUES(4,0,25,1,0,'2026-10-09 23:04:24');
INSERT INTO "loyalty_accounts" VALUES(5,5,5,0,0,'2026-10-09 23:04:24');
INSERT INTO "loyalty_accounts" VALUES(6,10,10,0,0,'2026-10-09 23:04:24');
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
INSERT INTO "ledger_entries" VALUES(1,4,5,'repair',1,NULL,'Reparacion entregada (+5 pts)',NULL,'2026-10-09 23:04:24');
INSERT INTO "ledger_entries" VALUES(2,4,5,'repair',2,NULL,'Reparacion entregada (+5 pts)',NULL,'2026-10-09 23:04:24');
INSERT INTO "ledger_entries" VALUES(3,5,5,'repair',3,NULL,'Reparacion entregada (+5 pts)',NULL,'2026-10-09 23:04:24');
INSERT INTO "ledger_entries" VALUES(4,6,5,'repair',4,NULL,'Reparacion entregada (+5 pts)',NULL,'2026-10-09 23:04:24');
INSERT INTO "ledger_entries" VALUES(5,6,5,'repair',6,NULL,'Reparacion entregada (+5 pts)',NULL,'2026-10-09 23:04:24');
INSERT INTO "ledger_entries" VALUES(6,4,15,'adjust',NULL,NULL,'Ajuste de historico previo al taller',NULL,'2026-10-09 23:04:24');
INSERT INTO "ledger_entries" VALUES(7,4,-25,'reward_granted',NULL,1,'Reward: Lavado gratis',NULL,'2026-10-09 23:04:24');
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
INSERT INTO "redemptions" VALUES(1,4,'Lavado gratis','PITS-2RJB-AWZR','available','2026-10-09 23:04:24','2027-04-07 23:04:24',NULL,NULL,NULL);
CREATE TABLE push_subscriptions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint   TEXT NOT NULL UNIQUE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
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
INSERT INTO "notifications" VALUES(1,4,'Estado: Recibido','PITS-2026-0001 - Recibido','state',1,NULL,'2026-10-09 23:04:23');
INSERT INTO "notifications" VALUES(2,4,'Estado: Diagnóstico','PITS-2026-0001 - Diagnóstico','state',1,NULL,'2026-10-09 23:04:23');
INSERT INTO "notifications" VALUES(3,4,'Estado: En reparación','PITS-2026-0001 - En reparación','state',1,NULL,'2026-10-09 23:04:23');
INSERT INTO "notifications" VALUES(4,4,'Estado: Control de calidad','PITS-2026-0001 - Control de calidad','state',1,NULL,'2026-10-09 23:04:23');
INSERT INTO "notifications" VALUES(5,4,'Estado: Listo para entregar','PITS-2026-0001 - Listo para entregar','state',1,NULL,'2026-10-09 23:04:23');
INSERT INTO "notifications" VALUES(6,4,'+5 puntos','Tu reparacion fue entregada. Revisa tu saldo de fidelizacion.','loyalty',1,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(7,4,'Reparacion entregada','PITS-2026-0001 - Entregado','state',1,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(8,4,'Factura disponible','Factura INV-2026-0001 por $240.00','billing',1,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(9,4,'Estado: Recibido','PITS-2026-0002 - Recibido','state',2,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(10,4,'Estado: En reparación','PITS-2026-0002 - En reparación','state',2,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(11,4,'+5 puntos','Tu reparacion fue entregada. Revisa tu saldo de fidelizacion.','loyalty',2,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(12,4,'Reparacion entregada','PITS-2026-0002 - Entregado','state',2,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(13,4,'Factura disponible','Factura INV-2026-0002 por $145.00','billing',2,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(14,5,'Estado: Recibido','PITS-2026-0003 - Recibido','state',3,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(15,5,'Estado: Diagnóstico','PITS-2026-0003 - Diagnóstico','state',3,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(16,5,'Estado: En reparación','Contratiempo en PITS-2026-0003. Pedir bujes: stock agotado','incident',3,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(17,5,'Estado: En reparación','PITS-2026-0003 - En reparación','state',3,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(18,5,'Estado: Control de calidad','PITS-2026-0003 - Control de calidad','state',3,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(19,5,'+5 puntos','Tu reparacion fue entregada. Revisa tu saldo de fidelizacion.','loyalty',3,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(20,5,'Reparacion entregada','PITS-2026-0003 - Entregado','state',3,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(21,5,'Factura disponible','Factura INV-2026-0003 por $328.00','billing',3,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(22,6,'Estado: Recibido','PITS-2026-0004 - Recibido','state',4,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(23,6,'Estado: En reparación','PITS-2026-0004 - En reparación','state',4,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(24,6,'+5 puntos','Tu reparacion fue entregada. Revisa tu saldo de fidelizacion.','loyalty',4,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(25,6,'Reparacion entregada','PITS-2026-0004 - Entregado','state',4,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(26,6,'Factura disponible','Factura INV-2026-0004 por $192.00','billing',4,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(27,6,'Estado: Recibido','PITS-2026-0005 - Recibido','state',5,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(28,6,'Estado: Diagnóstico','PITS-2026-0005 - Diagnóstico','state',5,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(29,6,'Estado: Esperando repuesto','Contratiempo en PITS-2026-0005. Catalizador de 5 dias','incident',5,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(30,6,'Estado: Recibido','PITS-2026-0006 - Recibido','state',6,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(31,6,'Estado: En reparación','PITS-2026-0006 - En reparación','state',6,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(32,6,'Estado: Control de calidad','PITS-2026-0006 - Control de calidad','state',6,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(33,6,'+5 puntos','Tu reparacion fue entregada. Revisa tu saldo de fidelizacion.','loyalty',6,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(34,6,'Reparacion entregada','PITS-2026-0006 - Entregado','state',6,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(35,6,'Factura disponible','Factura INV-2026-0005 por $111.00','billing',6,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(36,6,'Estado: Recibido','PITS-2026-0007 - Recibido','state',7,NULL,'2026-10-09 23:04:24');
INSERT INTO "notifications" VALUES(37,6,'Estado: EnRevisionDelCliente','PITS-2026-0007 - EnRevisionDelCliente','state',7,NULL,'2026-10-09 23:04:24');
CREATE TABLE settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
INSERT INTO "settings" VALUES('points_per_repair','5','2026-10-09 23:04:23');
INSERT INTO "settings" VALUES('points_per_reward','25','2026-10-09 23:04:23');
INSERT INTO "settings" VALUES('reward_label','Lavado gratis','2026-10-09 23:04:23');
INSERT INTO "settings" VALUES('reward_valid_days','180','2026-10-09 23:04:23');
CREATE TABLE counters (
      name  TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
INSERT INTO "counters" VALUES('order',7);
INSERT INTO "counters" VALUES('invoice',5);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_vehicles_client ON vehicles(client_id);
CREATE INDEX idx_orders_client ON repair_orders(client_id);
CREATE INDEX idx_orders_status ON repair_orders(status);
CREATE INDEX idx_orders_vehicle ON repair_orders(vehicle_id);
CREATE INDEX idx_orders_mechanic ON repair_orders(mechanic_id);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_events_order ON state_events(order_id);
CREATE INDEX idx_ledger_client ON ledger_entries(client_id, id DESC);
CREATE INDEX idx_redemptions_client ON redemptions(client_id, status);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
CREATE INDEX idx_notif_user ON notifications(user_id, id DESC);
INSERT INTO sqlite_sequence VALUES('repair_states',8);
INSERT INTO sqlite_sequence VALUES('users',6);
INSERT INTO sqlite_sequence VALUES('vehicles',6);
INSERT INTO sqlite_sequence VALUES('repair_orders',7);
INSERT INTO sqlite_sequence VALUES('state_events',33);
INSERT INTO sqlite_sequence VALUES('notifications',37);
INSERT INTO sqlite_sequence VALUES('order_items',16);
INSERT INTO sqlite_sequence VALUES('ledger_entries',7);
INSERT INTO sqlite_sequence VALUES('invoices',5);
INSERT INTO sqlite_sequence VALUES('redemptions',1);
COMMIT;
