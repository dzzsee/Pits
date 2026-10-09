import { twMerge } from 'tailwind-merge'

/** Clases por color de estado. Se amplia en shared/colors.ts del API. */
export const stateColorClasses: Record<string, { dot: string; chip: string; bar: string }> = {
  slate: {
    dot: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
    bar: 'bg-slate-400',
  },
  sky: {
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    bar: 'bg-sky-500',
  },
  amber: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  violet: {
    dot: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    bar: 'bg-violet-500',
  },
  emerald: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  rose: {
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
  cyan: {
    dot: 'bg-cyan-500',
    chip: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
    bar: 'bg-cyan-500',
  },
  orange: {
    dot: 'bg-orange-500',
    chip: 'bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    bar: 'bg-orange-500',
  },
  teal: {
    dot: 'bg-teal-500',
    chip: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    bar: 'bg-teal-500',
  },
  indigo: {
    dot: 'bg-indigo-500',
    chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
    bar: 'bg-indigo-500',
  },
}

const fallback = stateColorClasses.slate!

export function stateColor(color: string | null | undefined) {
  return (color && stateColorClasses[color]) || fallback
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(' '))
}
