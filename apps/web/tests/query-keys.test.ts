import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateOrder, keys } from '@/lib/query-keys'

/**
 * Regresion del bug que obligaba a recargar la pagina.
 *
 * React Query compara claves elemento a elemento con igualdad estricta. El id
 * de una orden llega como string desde `useParams` y como number desde la
 * entidad; con `['repair', '8']` y `['repair', 8]` registrados, la
 * invalidacion no encontraba la vista y la pantalla se congelaba.
 *
 * Estos tests fijan el contrato: la clave depende del valor, no del origen.
 */
describe('query keys', () => {
  it('normaliza el id de la ruta y el de la entidad al mismo numero', () => {
    expect(keys.repair('8')).toEqual(keys.repair(8))
  })

  it('produce una clave distinta de la ingenua con el id en crudo', () => {
    // La razon de existir de la factory.
    expect(['repair', '8']).not.toEqual(keys.repair(8))
  })

  it('no colisiona entre ordenes distintas', () => {
    expect(keys.repair(8)).not.toEqual(keys.repair(9))
  })

  it('usa una clave inutil cuando el id aun no existe', () => {
    expect(keys.repair(undefined)).toEqual(['repair', -1])
    expect(keys.repair(undefined)).not.toEqual(keys.repair(0))
  })

  it('el listado del taller se invalida sin conocer sus filtros', () => {
    expect(keys.staffRepairs()).toEqual(['staff-repairs'])
  })
})

describe('invalidacion real contra React Query', () => {
  it('invalida la consulta registrada desde la ruta (id string)', async () => {
    const client = new QueryClient()
    let fetched = 0

    client.setQueryDefaults(keys.repair(0), { staleTime: Infinity })

    // Simula RepairDetailPage: la clave se construye con el id de useParams.
    await client.prefetchQuery({
      queryKey: keys.repair('8'),
      queryFn: () => {
        fetched += 1
        return { total: 100 }
      },
    })
    expect(fetched).toBe(1)

    // Simula la mutacion: invalida con el id de la entidad (numero).
    await client.invalidateQueries({ queryKey: keys.repair(8) })

    expect(client.getQueryState(keys.repair('8'))?.isInvalidated).toBe(true)
  })

  it('invalida la consulta registrada desde la entidad (id numero)', async () => {
    const client = new QueryClient()
    let fetched = 0

    await client.prefetchQuery({
      queryKey: keys.repair(8),
      queryFn: () => {
        fetched += 1
        return { total: 100 }
      },
    })
    await client.invalidateQueries({ queryKey: keys.repair('8') })

    expect(client.getQueryState(keys.repair(8))?.isInvalidated).toBe(true)
  })

  it('el alcance de una orden cubre detalle, taller y cliente', async () => {
    const client = new QueryClient()

    await client.prefetchQuery({ queryKey: keys.repair(8), queryFn: () => ({}) })
    await client.prefetchQuery({ queryKey: keys.staffRepairs('open', ''), queryFn: () => ({}) })
    await client.prefetchQuery({ queryKey: keys.dashboard(), queryFn: () => ({}) })
    await client.prefetchQuery({ queryKey: keys.clientRepairs(), queryFn: () => ({}) })

    await invalidateOrder(client, 8)

    expect(client.getQueryState(keys.repair(8))?.isInvalidated).toBe(true)
    expect(client.getQueryState(keys.staffRepairs('open', ''))?.isInvalidated).toBe(true)
    expect(client.getQueryState(keys.dashboard())?.isInvalidated).toBe(true)
    expect(client.getQueryState(keys.clientRepairs())?.isInvalidated).toBe(true)
  })

  it('no toca ordenes que no son la modificada', async () => {
    const client = new QueryClient()

    await client.prefetchQuery({ queryKey: keys.repair(8), queryFn: () => ({}) })
    await client.prefetchQuery({ queryKey: keys.repair(9), queryFn: () => ({}) })

    await client.invalidateQueries({ queryKey: keys.repair(8) })

    expect(client.getQueryState(keys.repair(8))?.isInvalidated).toBe(true)
    expect(client.getQueryState(keys.repair(9))?.isInvalidated).toBe(false)
  })
})
