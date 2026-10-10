import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  inputToCents,
  pluralize,
} from '@/lib/format'

describe('formatMoney', () => {
  it('convierte centavos a dolares', () => {
    expect(formatMoney(123456, 'USD')).toContain('1,234.56')
  })

  it('ida y vuelta entre centavos y el input del formulario', () => {
    expect(centsToInput(4500)).toBe('45.00')
    expect(inputToCents('45.00')).toBe(4500)
  })

  it('acepta formato con coma decimal', () => {
    expect(inputToCents('12,50')).toBe(1250)
    expect(inputToCents('abc')).toBe(0)
  })
})

describe('fechas', () => {
  it('interpreta el formato de SQLite como UTC', () => {
    // El API guarda 'YYYY-MM-DD HH:MM:SS' en UTC. Si se parsea como local,
    // las fechas cerca de medianoche cambian de dia segun donde este el usuario.
    const raw = '2026-03-10 15:30:00'
    const expected = new Date('2026-03-10T15:30:00Z')

    expect(formatDate(raw)).toBe(
      new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium' }).format(expected),
    )
    expect(formatDateTime(raw)).toBe(
      new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' }).format(
        expected,
      ),
    )
  })

  it('devuelve un guion largo cuando no hay fecha', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDateTime(null)).toBe('—')
  })

  it('no lanza con una fecha invalida', () => {
    expect(formatDate('no-es-fecha')).toBe('—')
    expect(formatRelative('no-es-fecha')).toBe('')
  })

  it('resume los minutos recientes', () => {
    expect(formatRelative(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('hace 5 min')
    expect(formatRelative(new Date().toISOString())).toBe('ahora')
    expect(formatRelative(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('hace 3 h')
  })
})

describe('pluralize', () => {
  it('concuerda el numero', () => {
    expect(pluralize(1, 'orden', 'ordenes')).toBe('1 orden')
    expect(pluralize(3, 'orden', 'ordenes')).toBe('3 ordenes')
    expect(pluralize(0, 'orden', 'ordenes')).toBe('0 ordenes')
  })
})
