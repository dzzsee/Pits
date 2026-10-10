/**
 * Set de iconos.
 *
 * Estaban escritos a mano dentro de los layouts y de las propias paginas, en
 * tres sitios distintos. Aqui viven todos con el mismo contrato: trazo de 1.7
 * sobre `currentColor`, lienzo de 24, decorativos para lectores de pantalla.
 *
 * Cuando uno recibe texto al lado, el texto es el que se lee; cuando el boton
 * es solo icono, el `aria-label` va en el sitio que lo usa.
 */

interface IconProps {
  className?: string
}

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/* ------------------------------ Navegacion ---------------------------- */

export function IconHome({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function IconWrench({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M15.5 4a5 5 0 0 0-4.6 7L4 18l2 2 7-6.9A5 5 0 1 0 15.5 4Z" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconCar({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        d="M5 17v2a1 1 0 0 1-1 1H3v-2M21 17v2a1 1 0 0 1-1 1h-1v-2M4 17h16M5 17l1.2-5.2A2 2 0 0 1 8.1 10h7.8a2 2 0 0 1 1.9 1.8L19 17M8 14h.01M16 14h.01"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function IconStar({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 4Z"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function IconUser({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
    </Icon>
  )
}

export function IconList({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
    </Icon>
  )
}

export function IconTag({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8-8-8Z" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </Icon>
  )
}

export function IconGift({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8ZM3 7h18v4H3zM12 7v13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7S9.5 3 7.5 4.2 9 7 12 7Zm0 0s2.5-4 4.5-2.8S15 7 12 7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function IconChart({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </Icon>
  )
}

export function IconUsers({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 19a6 6 0 0 1 12 0M16 6.2a3 3 0 0 1 0 5.6M17.5 14.2A5.5 5.5 0 0 1 21 19" strokeLinecap="round" />
    </Icon>
  )
}

/* -------------------------------- Accion ------------------------------ */

export function IconPlus({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </Icon>
  )
}

export function IconBell({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path
        d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 19a2 2 0 0 1-3.4 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function IconSearch({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </Icon>
  )
}

export function IconLogout({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M15 17v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v2M10 12h11m0 0-3.5-3.5M21 12l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconCheck({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m5 13 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconEye({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

export function IconEdit({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" strokeLinejoin="round" />
      <path d="m14.5 5.5 4 4" strokeLinecap="round" />
    </Icon>
  )
}

export function IconTrash({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconDownload({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M4 18v2h16v-2" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

/* ------------------------------- Flujo -------------------------------- */

export function IconArrowRight({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 12h16m0 0-5.5-5.5M20 12l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconArrowUp({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 19V6m0 0-5.5 5.5M12 6l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconArrowDown({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 5v13m0 0 5.5-5.5M12 18l-5.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

/* ------------------------------- Estados ------------------------------ */

/** Estados vacios. Un glifo grande en mono hace el trabajo de una ilustracion. */
export function IconBox({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 8h16M4 8l2-3h12l2 3M4 8v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8M9 19v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconCarFront({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 17v2a1 1 0 0 1-1 1H3v-2M21 17v2a1 1 0 0 1-1 1h-1v-2M4 17h16M5 17l1.2-5.2A2 2 0 0 1 8.1 10h7.8a2 2 0 0 1 1.9 1.8L19 17M8 14h.01M16 14h.01" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconInvoice({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h4" strokeLinecap="round" />
    </Icon>
  )
}

export function IconAlert({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 4 2.5 20h19L12 4Z" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
    </Icon>
  )
}

export function IconLock({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function IconClose({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </Icon>
  )
}