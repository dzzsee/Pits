import type { Db } from '../../db/connection.js'
import { slugify } from '../../db/helpers.js'
import type { RepairStateRow } from '../../db/types.js'
import { colorForLabel, isStateColor } from '../../shared/colors.js'
import { notFound } from '../../shared/errors.js'

export async function listStates(
  db: Db,
  opts: { includeInactive?: boolean } = {},
): Promise<RepairStateRow[]> {
  return db
    .prepare<[], RepairStateRow>(
      `SELECT * FROM repair_states ${opts.includeInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY position ASC, id ASC`,
    )
    .all()
}

/**
 * Busca un estado por key. Si el mecanico escribe un estado que aun no existe,
 * se crea automaticamente (is_custom = 1) para que el historial y los
 * dashboards puedan agrupar por el.
 */
export async function resolveState(
  db: Db,
  label: string,
  opts: { isIncident?: boolean } = {},
): Promise<RepairStateRow> {
  const clean = label.trim().replace(/\s+/g, ' ')
  const key = slugify(clean)
  if (!key) throw new Error('El estado no puede estar vacio')

  const existing = await db
    .prepare<[string], RepairStateRow>('SELECT * FROM repair_states WHERE key = ?')
    .get(key)
  if (existing) {
    // Un estado existente que ahora se reporta como contratiempo se marca,
    // pero nunca se desmarca solo: podria ser un dato de otra orden.
    if (opts.isIncident && !existing.is_incident) {
      await db
        .prepare(
          "UPDATE repair_states SET is_incident = 1, updated_at = datetime('now') WHERE id = ?",
        )
        .run(existing.id)
      return { ...existing, is_incident: 1 }
    }
    return existing
  }

  const maxPos = await db
    .prepare<[], { p: number | null }>('SELECT MAX(position) AS p FROM repair_states')
    .get()
  const info = await db
    .prepare(
      `INSERT INTO repair_states (key, label, color, position, is_suggested, is_custom, is_incident)
       VALUES (?, ?, ?, ?, 0, 1, ?)`,
    )
    .run(key, clean, colorForLabel(clean), (maxPos?.p ?? 0) + 1, opts.isIncident ? 1 : 0)

  return (await db
    .prepare<[number], RepairStateRow>('SELECT * FROM repair_states WHERE id = ?')
    .get(Number(info.lastInsertRowid)))!
}

export async function createState(
  db: Db,
  input: {
    label: string
    color?: string
    isIncident?: boolean
    isTerminal?: boolean
    isActive?: boolean
  },
): Promise<RepairStateRow> {
  const state = await resolveState(db, input.label, { isIncident: input.isIncident })
  const patch: string[] = []
  const values: (string | number)[] = []

  if (input.color && isStateColor(input.color)) {
    patch.push('color = ?')
    values.push(input.color)
  }
  if (input.isTerminal !== undefined) {
    patch.push('is_terminal = ?')
    values.push(input.isTerminal ? 1 : 0)
  }
  if (input.isActive !== undefined) {
    patch.push('is_active = ?')
    values.push(input.isActive ? 1 : 0)
  }
  if (patch.length) {
    values.push(state.id)
    await db
      .prepare(
        `UPDATE repair_states SET ${patch.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(...values)
  }
  return (await db
    .prepare<[number], RepairStateRow>('SELECT * FROM repair_states WHERE id = ?')
    .get(state.id))!
}

export async function updateState(
  db: Db,
  id: number,
  patch: Partial<{
    label: string
    color: string
    position: number
    isIncident: boolean
    isTerminal: boolean
    isActive: boolean
  }>,
): Promise<RepairStateRow> {
  const current = await db
    .prepare<[number], RepairStateRow>('SELECT * FROM repair_states WHERE id = ?')
    .get(id)
  if (!current) throw notFound('Estado no encontrado')

  const sets: string[] = []
  const values: (string | number)[] = []

  if (patch.label !== undefined) {
    const label = patch.label.trim().replace(/\s+/g, ' ')
    if (!label) throw new Error('El estado no puede estar vacio')
    const key = slugify(label)
    sets.push('label = ?', 'key = ?')
    values.push(label, key)
  }
  if (patch.color !== undefined && isStateColor(patch.color)) {
    sets.push('color = ?')
    values.push(patch.color)
  }
  if (patch.position !== undefined) {
    sets.push('position = ?')
    values.push(patch.position)
  }
  if (patch.isIncident !== undefined) {
    sets.push('is_incident = ?')
    values.push(patch.isIncident ? 1 : 0)
  }
  if (patch.isTerminal !== undefined) {
    sets.push('is_terminal = ?')
    values.push(patch.isTerminal ? 1 : 0)
  }
  if (patch.isActive !== undefined) {
    sets.push('is_active = ?')
    values.push(patch.isActive ? 1 : 0)
  }
  if (!sets.length) return current

  values.push(id)
  await db
    .prepare(
      `UPDATE repair_states SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(...values)
  return (await db
    .prepare<[number], RepairStateRow>('SELECT * FROM repair_states WHERE id = ?')
    .get(id))!
}

/** Baja logica: el historial referencia el estado, nunca se borra en cascada. */
export async function archiveState(db: Db, id: number): Promise<void> {
  await db
    .prepare("UPDATE repair_states SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
    .run(id)
}
