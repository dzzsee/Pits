import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import { cx } from '@/shared/colors'
import { IconBox, IconCheck, IconClose, IconSearch } from '@/components/icons'

/* ------------------------------- Boton -------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

const SIZES: Record<Size, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx('btn', VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || loading}
      // `aria-busy` para que un lector de pantalla sepa que el boton esta
      // trabajando, no simplemente deshabilitado.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  className,
  icon,
  children,
}: {
  to: string
  variant?: Variant
  size?: Size
  className?: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <Link to={to} className={cx('btn', VARIANTS[variant], SIZES[size], className)}>
      {icon}
      {children}
    </Link>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/* ------------------------------- Tarjeta ------------------------------ */

export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card p-6', className)} {...rest}>
      {children}
    </div>
  )
}

/**
 * Encabezado de seccion. La linea divisoria hace el trabajo de separacion:
 * bloques del mismo nivel no necesitan un borde alrededor.
 */
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="rule mb-3">
        <span className="eyebrow">{title}</span>
        {action}
      </div>
      {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
    </div>
  )
}

/**
 * Cabecera de pagina. El titulo va en display comprimida y el subtitulo en
 * muted: la jerarquia la marca la tipografia, no el tamano del bloque.
 *
 * Vive aqui y no en un layout porque lo usan paginas de los dos portales:
 * antes vivia en `ClientLayout` y las de staff lo reimplementaban a mano cinco
 * veces.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
            <span className="eyebrow">{eyebrow}</span>
          </div>
        ) : null}
        <h1 className="font-display text-[clamp(2rem,5vw,3rem)] uppercase leading-[0.9] tracking-[0.01em]">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 max-w-prose text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

/** Vinculo de retour con la misma forma en todas las pantallas. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="mb-5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted transition-colors hover:text-accent"
    >
      <span aria-hidden="true">&larr;</span>
      {children}
    </Link>
  )
}

/* -------------------------------- Chips ------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'danger'
  className?: string
}) {
  const tones: Record<string, string> = {
    neutral: 'border border-line bg-surface-hover text-ink-muted',
    accent: 'border border-accent/30 bg-accent/10 text-accent',
    success: 'border border-ok/30 bg-ok/10 text-ok',
    danger: 'border border-danger/30 bg-danger/10 text-danger',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Chip de estado. El taller elige el color de cada estado, asi que el tono
 * llega como clases ya resueltas por `stateColor()`.
 */
export function StateChip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em]',
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------- Campos ------------------------------- */

/**
 * Campo con etiqueta, error o pista.
 *
 * El `id` se genera con `useId` y el `label` se enlaza a el. Antes el `label`
 * no tenia `htmlFor`, asi que `getByLabelText` no encontraba nada y el clic en
 * la etiqueta no enfocaba el campo.
 */
export function Field({
  label,
  error,
  hint,
  children,
  className,
  id,
}: {
  label?: string
  error?: string
  hint?: string
  children: (props: { id: string; 'aria-invalid'?: boolean }) => ReactNode
  className?: string
  id?: string
}) {
  const generated = useId()
  const fieldId = id ?? generated

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={fieldId} className="eyebrow mb-2 block">
          {label}
        </label>
      ) : null}
      {children({ id: fieldId, ...(error ? { 'aria-invalid': true } : {}) })}
      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('field', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('field resize-y', className)} rows={3} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('field', className)} {...rest} />
}

/** Campo de busqueda con icono a la izquierda y boton de limpiar. */
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  label,
}: {
  value: string
  onValueChange: (next: string) => void
  placeholder: string
  label: string
}) {
  return (
    <div className="relative">
      <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        className="field pl-10 pr-9"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange('')}
          aria-label="Limpiar busqueda"
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/* --------------------------------- Datos ------------------------------ */

/**
 * Cifra grande con su etiqueta. El numero va en display comprimida: es lo que
 * el ojo busca primero en un tablero.
 */
export function StatCounter({
  value,
  label,
  total,
  accent,
}: {
  value: ReactNode
  label: string
  total?: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col items-center px-4 text-center">
      <span className={cx('stat-value text-[clamp(2rem,5vw,3rem)]', accent && 'text-accent')}>
        {value}
        {total ? <span className="text-ink-muted">{total}</span> : null}
      </span>
      <span className="eyebrow mt-2">{label}</span>
    </div>
  )
}

/** Fila de cifras separadas por una regla vertical. */
export function CounterBar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('card flex items-stretch divide-x divide-line py-6', className)}>
      {children}
    </div>
  )
}

export function CounterDivider() {
  return <span className="hidden w-px self-center bg-line md:block" aria-hidden="true" />
}

/**
 * Barra de progreso. El punto que late solo aparece cuando ya hay progreso:
 * sin el, la animacion es ruido.
 */
export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number
  max: number
  label: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cx('track', className)}
    >
      <div
        className="track-fill relative"
        style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }}
      >
        {pct > 0 ? (
          <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse-glow rounded-full bg-accent" />
        ) : null}
      </div>
    </div>
  )
}

/** Par etiqueta/valor. Lo usan todas las fichas de detalle. */
export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-right text-sm text-ink">{value}</dd>
    </div>
  )
}

/* -------------------------------- Feedback ---------------------------- */

export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'success' | 'info'
  children: ReactNode
}) {
  const tones = {
    danger: 'border border-danger/40 bg-danger/[0.06] text-danger',
    success: 'border border-ok/40 bg-ok/[0.06] text-ok',
    info: 'border border-accent/40 bg-accent/[0.06] text-accent',
  }
  return (
    <div role="alert" className={cx('rounded border px-3.5 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  )
}

/**
 * Estado vacio. El icono va grande y en mono, como marca de agua: comunica
 * "aun no hay nada aqui" sin parecer un error.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-5 font-display text-6xl leading-none text-line-light">
        {icon ?? <IconBox className="h-14 w-14" />}
      </span>
      <p className="font-display text-xl uppercase tracking-[0.02em] text-ink">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

/** Esqueleto con barrido: dice "cargando" sin parpadear el layout. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'rounded bg-[linear-gradient(90deg,rgb(var(--surface))_0%,rgb(var(--surface-hover))_50%,rgb(var(--surface))_100%)] bg-[length:200%_100%] animate-shimmer',
        className,
      )}
    />
  )
}

/* ------------------------------- Controles ---------------------------- */

/** Interruptor. Reemplaza al checkbox crudo de `WorkshopPage` y al `TogglePill`. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
}) {
  const labelId = useId()
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        // El nombre accesible lo aporta el texto del `label`. El `id` va en
        // el propio `label`: un `htmlFor` apuntando al boton no sirve, porque
        // `for` solo enlaza controles de formulario.
        aria-labelledby={labelId}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-300',
          checked ? 'border-accent bg-accent' : 'border-line bg-surface-hover',
        )}
      >
        {/*
          El boton se posiciona con `left`, no con una traslacion horizontal.

          Antes se movia combinando la utilidad de centrado vertical con una
          traslacion en X. Ambas redefinen `transform` y se combinan por
          variables CSS, asi que el resultado depende de que las dos esten
          presentes y en el orden correcto: cualquier refactor que toque una de
          ellas mueve el boton al lado contrario sin que nada falle. `left` no
          depende de esa composicion.

          Geometria: pista `w-9` (36px), boton `w-3.5` (14px). Margen de 2px a
          cada lado deja 18px de recorrido: apagado en 2, encendido en 20.
        */}
        <span
          className={cx(
            'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-[left] duration-300',
            checked ? 'left-5 bg-black' : 'left-0.5 bg-ink-muted',
          )}
        />
      </button>
      <span id={labelId} className="text-sm">
        <span className="block font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[13px] text-ink-muted">{description}</span>
        ) : null}
      </span>
    </div>
  )
}

/** Filtro segmentado. El control activo se invierte en vez de resaltarse. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div
      role="tablist"
      className="flex overflow-hidden rounded border border-line max-md:flex-col"
    >
      {options.map((opt, i) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cx(
              'flex flex-1 items-center justify-center gap-2 px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors duration-300 max-md:flex-row max-md:justify-between',
              i > 0 && 'max-md:border-t max-md:border-line',
              i > 0 && 'md:border-l md:border-line',
              active
                ? 'bg-accent text-black'
                : 'bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink',
            )}
          >
            {opt.label}
            {opt.count !== undefined ? (
              <span className={cx('tabular-nums', active ? 'text-black/60' : 'text-ink-muted')}>
                {opt.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------- Dialogo ----------------------------- */

/**
 * Modal accesible: Escape cierra, el foco queda atrapado dentro y el fondo no
 * se desplaza. Se monta en `document.body` via portal para no quedar recortado
 * por el `overflow` de un contenedor.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Trampa de foco: sin esto, tabular se sale del modal hacia la pagina de
      // fondo, que sigue siendo legible y pulsable.
      if (e.key !== 'Tab' || !panel.current) return

      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-slide-up relative max-h-[90vh] w-full overflow-y-auto rounded-t-lg border border-line bg-surface p-6 shadow-panel sm:max-w-lg sm:rounded-lg"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id={titleId}
              className="font-display text-2xl uppercase leading-none tracking-[0.02em]"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-2 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {children}

        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}

/* --------------------------------- Tabla ------------------------------ */

/**
 * Tabla de datos. La cabecera se queda fija al desplazar: en la tabla de
 * produccion del taller hay mas filas que pantalla y perder la columna de
 * importes obliga a volver arriba.
 */
export function DataTable<T extends object>({
  rows,
  columns,
  getKey,
  empty = 'Sin registros.',
}: {
  rows: T[]
  columns: {
    key: string
    header: string
    align?: 'left' | 'right'
    render: (row: T) => ReactNode
  }[]
  getKey: (row: T) => string | number
  empty?: string
}) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">{empty}</p>
  }

  return (
    <div className="scroll-slim -mx-5 overflow-x-auto px-5">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cx(
                  'eyebrow whitespace-nowrap py-3 font-medium',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)} className="border-b border-line/60 last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(
                    'py-3',
                    col.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------- Confirmar ---------------------------- */

/** Boton con confirmacion en linea. Para acciones que no merecen un modal. */
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = 'Confirmar',
  variant = 'danger',
  size = 'sm',
  className,
}: {
  onConfirm: () => void
  label: string
  confirmLabel?: string
  variant?: Variant
  size?: Size
  className?: string
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 6000)
    return () => window.clearTimeout(timer)
  }, [armed])

  if (!armed) {
    return (
      <Button variant={variant} size={size} className={className} onClick={() => setArmed(true)}>
        {label}
      </Button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Button
        variant={variant}
        size={size}
        className={className}
        icon={<IconCheck className="h-3.5 w-3.5" />}
        onClick={() => {
          // Se desarma antes de ejecutar: si la mutacion falla, el boton ya
          // vuelve al estado inicial y no se queda esperando un segundo clic.
          setArmed(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setArmed(false)} aria-label="Cancelar">
        <IconClose className="h-3.5 w-3.5" />
      </Button>
    </span>
  )
}