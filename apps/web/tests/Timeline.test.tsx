import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Timeline } from '@/components/Timeline'
import type { StateEvent } from '@/lib/types'

function event(overrides: Partial<StateEvent>): StateEvent {
  return {
    id: 1,
    order_id: 1,
    from_state_id: null,
    to_state_id: 1,
    state_label_snapshot: 'En reparación',
    state_color_snapshot: 'amber',
    note: null,
    is_incident: 0,
    is_client_visible: 1,
    notify_client: 1,
    created_by: 2,
    created_at: '2026-03-10 15:30:00',
    ...overrides,
  }
}

describe('Timeline', () => {
  it('muestra un mensaje vacio cuando no hay eventos', () => {
    render(<Timeline events={[]} />)
    expect(screen.getByText(/sin novedades/i)).toBeInTheDocument()
  })

  it('lista los estados en orden con su nota', () => {
    render(
      <Timeline
        events={[
          event({ id: 1, state_label_snapshot: 'Recibido', note: 'Kilometraje verificado' }),
          event({ id: 2, state_label_snapshot: 'En reparación', note: 'Cambio de pastillas' }),
        ]}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(screen.getByText('Recibido')).toBeInTheDocument()
    expect(screen.getByText('Kilometraje verificado')).toBeInTheDocument()
    expect(screen.getByText('Cambio de pastillas')).toBeInTheDocument()
  })

  it('destaca los contratiempos', () => {
    render(
      <Timeline
        events={[event({ state_label_snapshot: 'Esperando repuesto', is_incident: 1 })]}
      />,
    )

    expect(screen.getByText('Contratiempo')).toBeInTheDocument()
  })

  it('usa el snapshot del evento, no el estado actual del taller', () => {
    // Si el taller renombra "En reparación" a "En el taller", el historial
    // antiguo debe seguir mostrando el nombre que tenia entonces.
    render(<Timeline events={[event({ state_label_snapshot: 'En reparación' })]} />)
    expect(screen.getByText('En reparación')).toBeInTheDocument()
  })
})
