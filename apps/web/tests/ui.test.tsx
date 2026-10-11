import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  DataTable,
  Dialog,
  Field,
  Input,
  ProgressBar,
  SegmentedControl,
  Toggle,
} from '@/components/ui'

describe('Button', () => {
  it('no dispara la accion mientras carga', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    )

    const button = screen.getByRole('button', { name: /guardar/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('expone el nombre accesible cuando solo lleva icono', () => {
    render(
      <>
        <Button aria-label="Abrir orden" icon={<svg />} />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Abrir orden' })).toBeInTheDocument()
  })
})

describe('Field', () => {
  it('enlaza la etiqueta con su input', () => {
    // Sin `htmlFor` el campo no era alcanzable por getByLabelText y la
    // etiqueta no enfocaba al pulsarla.
    render(
      <Field label="Correo">
        {(props) => <Input {...props} />}
      </Field>,
    )

    expect(screen.getByLabelText('Correo')).toBeInTheDocument()
  })

  it('marca el campo como invalido cuando hay error', () => {
    render(
      <Field label="Contrasena" error="Minimo 8 caracteres.">
        {(props) => <Input {...props} />}
      </Field>,
    )

    expect(screen.getByLabelText('Contrasena')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Minimo 8 caracteres.')
  })

  it('focaliza al hacer clic en la etiqueta', async () => {
    const user = userEvent.setup()
    render(
      <Field label="Placa">
        {(props) => <Input {...props} />}
      </Field>,
    )

    await user.click(screen.getByText('Placa'))
    expect(screen.getByLabelText('Placa')).toHaveFocus()
  })
})

describe('ProgressBar', () => {
  it('expone el valor a lectores de pantalla', () => {
    render(<ProgressBar value={72} max={100} label="Progreso hacia la recompensa" />)
    expect(screen.getByRole('progressbar', { name: 'Progreso hacia la recompensa' })).toHaveAttribute(
      'aria-valuenow',
      '72',
    )
  })

  it('no deja pasar el valor por encima del maximo', () => {
    render(<ProgressBar value={150} max={100} label="Progreso" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '150')
    // El ancho se recorta: 100% y no 150%.
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '100%' })
  })
})

describe('Toggle', () => {
  it('cambia de estado y reporta el marcado', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Toggle checked={false} onChange={onChange} label="Notificar al cliente" />)

    const sw = screen.getByRole('switch', { name: 'Notificar al cliente' })
    expect(sw).toHaveAttribute('aria-checked', 'false')

    await user.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('mueve el boton a la derecha al activarse', () => {
    // El boton se posiciona con `left`, no con `translate-x`: si la direccion
    // se invirtiera, el control marcado se leeria como apagado.
    const { unmount } = render(
      <Toggle checked={false} onChange={() => {}} label="Notificar al cliente" />,
    )
    const off = screen.getByRole('switch').querySelector('span')
    expect(off).toHaveClass('left-0.5')
    expect(off).not.toHaveClass('left-5')
    unmount()

    render(<Toggle checked onChange={() => {}} label="Marcar como contratiempo" />)
    const on = screen.getByRole('switch').querySelector('span')
    expect(on).toHaveClass('left-5')
    expect(on).not.toHaveClass('left-0.5')
  })
})

describe('SegmentedControl', () => {
  it('marca la opcion activa y avisa del cambio', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <SegmentedControl
        options={[
          { value: 'open', label: 'En curso' },
          { value: '', label: 'Todas' },
        ]}
        value="open"
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('tab', { name: 'En curso' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Todas' }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})

describe('Dialog', () => {
  it('cierra con Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <Dialog open onClose={onClose} title="Nuevo vehiculo">
        <input aria-label="Placa" />
      </Dialog>,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('atrapa el foco dentro del dialogo', async () => {
    const user = userEvent.setup()
    render(
      <Dialog open onClose={() => {}} title="Nuevo vehiculo">
        <input aria-label="Placa" />
        <button type="button">Guardar</button>
      </Dialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Nuevo vehiculo' })
    const focusable = dialog.querySelectorAll<HTMLElement>('input, button')

    // Tabbing desde el ultimo elemento vuelve al primero, en vez de salir al
    // fondo de la pagina, que sigue siendo pulsable.
    focusable[focusable.length - 1]!.focus()
    await user.tab()

    expect(focusable[0]).toHaveFocus()
  })

  it('no se renderiza cuando esta cerrado', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Nuevo vehiculo">
        <p>Contenido</p>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('DataTable', () => {
  interface Row {
    id: number
    name: string
    orders?: number
  }

  it('muestra el estado vacio en vez de una tabla sin filas', () => {
    render(
      <DataTable<Row>
        rows={[]}
        getKey={(r) => String(r.id)}
        empty="Sin mecanicos con ordenes."
        columns={[{ key: 'name', header: 'Mecanico', render: (r) => r.name }]}
      />,
    )
    expect(screen.getByText('Sin mecanicos con ordenes.')).toBeInTheDocument()
  })

  it('alinea a la derecha las columnas numericas', () => {
    render(
      <DataTable<Row>
        rows={[{ id: 1, name: 'Javier', orders: 7 }]}
        getKey={(r) => String(r.id)}
        columns={[
          { key: 'name', header: 'Mecanico', render: (r) => r.name },
          { key: 'orders', header: 'Ordenes', align: 'right', render: (r) => r.orders ?? 0 },
        ]}
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'Ordenes' })).toHaveClass('text-right')
    expect(screen.getByRole('cell', { name: '7' })).toHaveClass('tabular-nums')
  })
})