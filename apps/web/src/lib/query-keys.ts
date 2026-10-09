/**
 * Claves de cache de React Query, centralizadas.
 *
 * Motivo de existir: React Query empareja las claves por igualdad estricta
 * elemento a elemento, asi que `['repair', '8']` y `['repair', 8]` son claves
 * DISTINTAS. Un `id` que viene de `useParams` (string) y el mismo `id` que
 * viene de la entidad (number) rompian la invalidacion: la mutacion invalidaba
 * una clave que ninguna vista tenia registrada y la pantalla se quedaba
 * congelada hasta recargar.
 *
 * toda clave se construye aqui y normaliza su identificador con `Number()`,
 * de modo que ambos origenes convergen siempre.
 */
import type { QueryClient } from '@tanstack/react-query'

// El id puede venir de la ruta (string), de la entidad (number) o ser
// `undefined` mientras la ruta resuelve; en ese caso la clave queda en -1 y la
// consulta se desactiva con `enabled`, sin colisionar con ninguna real.
type Id = number | string | null | undefined

const num = (id: Id): number => {
  const n = Number(id)
  return Number.isFinite(n) ? n : -1
}

export const keys = {
  /** Detalle de una orden. Acepta el id de la ruta (string) o el de la entidad. */
  repair: (id: Id) => ['repair', num(id)] as const,

  /** Listado del taller con sus filtros. Sin argumentos = invalida cualquier filtro. */
  staffRepairs: (status?: string, q?: string) =>
    status === undefined && q === undefined
      ? (['staff-repairs'] as const)
      : (['staff-repairs', status ?? '', q ?? ''] as const),

  dashboard: () => ['dashboard'] as const,
  clientRepairs: () => ['repairs'] as const,
  vehicles: () => ['vehicles'] as const,
  loyalty: () => ['loyalty'] as const,
  redemptions: () => ['redemptions'] as const,
  mechanics: () => ['mechanics'] as const,

  /** Estados del taller. `full` incluye los archivados (pantalla de gestion). */
  repairStates: () => ['repair-states'] as const,
  repairStatesFull: () => ['repair-states', 'full'] as const,

  notifications: () => ['notifications'] as const,

  staffClients: (q?: string) => ['staff-clients', q ?? ''] as const,
  adminUsers: () => ['admin-users'] as const,
  loyaltySettings: () => ['loyalty-settings'] as const,
  reports: (from?: string, to?: string) => ['reports', from ?? '', to ?? ''] as const,
} as const

/**
 * Refresca todo lo que depende del contenido de una orden: el detalle, el
 * listado del taller y las vistas del cliente.
 *
 * Es una funcion y no una lista de claves a propósito: pasar un array de
 * arrays a `invalidateQueries` seria interpretado como UNA sola clave composed
 * y no invalidaria nada.
 */
export async function invalidateOrder(client: QueryClient, id: Id): Promise<void> {
  await client.invalidateQueries({ queryKey: keys.repair(id) })
  await client.invalidateQueries({ queryKey: keys.staffRepairs() })
  await client.invalidateQueries({ queryKey: keys.dashboard() })
  await client.invalidateQueries({ queryKey: keys.clientRepairs() })
}
