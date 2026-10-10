import { twMerge } from 'tailwind-merge'
import { clsx, type ClassValue } from 'clsx'

/**
 * Clases por color de estado.
 *
 * El taller crea sus propios estados y cada uno trae un color. Sobre el fondo
 * casi negro, un tono a saturacion plena canta demasiado: estos son los
 * mismos diez tonos con la luz bajada para que el acento ambar de la marca
 * siga siendo lo unico que brilla.
 *
 * Se amplia en `shared/colors.ts` del API.
 */
export const stateColorClasses: Record<string, { dot: string; chip: string; bar: string }> = {
  slate: {
    dot: 'bg-slate-500',
    chip: 'bg-slate-500/10 text-slate-300',
    bar: 'bg-slate-500',
  },
  sky: {
    dot: 'bg-sky-600',
    chip: 'bg-sky-600/10 text-sky-400',
    bar: 'bg-sky-600',
  },
  amber: {
    dot: 'bg-amber-600',
    chip: 'bg-amber-600/10 text-amber-400',
    bar: 'bg-amber-600',
  },
  violet: {
    dot: 'bg-violet-600',
    chip: 'bg-violet-600/10 text-violet-400',
    bar: 'bg-violet-600',
  },
  emerald: {
    dot: 'bg-emerald-600',
    chip: 'bg-emerald-600/10 text-emerald-400',
    bar: 'bg-emerald-600',
  },
  rose: {
    dot: 'bg-rose-600',
    chip: 'bg-rose-600/10 text-rose-400',
    bar: 'bg-rose-600',
  },
  cyan: {
    dot: 'bg-cyan-600',
    chip: 'bg-cyan-600/10 text-cyan-400',
    bar: 'bg-cyan-600',
  },
  orange: {
    dot: 'bg-orange-600',
    chip: 'bg-orange-600/10 text-orange-400',
    bar: 'bg-orange-600',
  },
  teal: {
    dot: 'bg-teal-600',
    chip: 'bg-teal-600/10 text-teal-400',
    bar: 'bg-teal-600',
  },
  indigo: {
    dot: 'bg-indigo-600',
    chip: 'bg-indigo-600/10 text-indigo-400',
    bar: 'bg-indigo-600',
  },
}

const fallback = stateColorClasses.slate!

export function stateColor(color: string | null | undefined) {
  return (color && stateColorClasses[color]) || fallback
}

/** Los diez tonos, en el orden en que los ve el admin al elegir color. */
export const statePalette = Object.keys(stateColorClasses)

export function cx(...parts: ClassValue[]): string {
  return twMerge(clsx(parts))
}