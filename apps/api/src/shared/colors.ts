import { config } from '../config.js'

const PALETTE = [
  'slate',
  'sky',
  'amber',
  'violet',
  'emerald',
  'rose',
  'cyan',
  'orange',
  'teal',
  'indigo',
] as const

export type StateColor = (typeof PALETTE)[number]

export function isStateColor(value: string): value is StateColor {
  return (PALETTE as readonly string[]).includes(value)
}

/** Color estable derivado del hash del label: mismo estado, mismo color siempre. */
export function colorForLabel(label: string): StateColor {
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]!
}

export const shopCurrency = config.shop.currency
