/**
 * Marca de Pits.
 *
 * Un tornillo de mecanico estilizado: cabeza hexagonal y vástago. El trazo
 * usa el acento ambar porque el fondo de la app es casi negro y con
 * `currentColor` gris el logo se perdia contra `#0a0a0a`.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="7"
        fill="var(--accent)"
        fillOpacity="0.12"
        stroke="var(--accent)"
        strokeOpacity="0.4"
      />
      {/* Cabeza hexagonal del tornillo. */}
      <path
        d="M16 7.5 22.5 11v9L16 23.5 9.5 20v-9L16 7.5Z"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Ranura de destornillador. */}
      <path
        d="M12.6 14.2 19.4 18.6"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}