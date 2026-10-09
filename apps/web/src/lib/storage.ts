/**
 * Acceso tolerante a almacenamiento.
 *
 * Safari en modo privado y algunos webviews lanza al tocar localStorage, y en
 * entornos sin DOM (tests) directamente no existe. En ambos casos la app debe
 * seguir funcionando en memoria, no romperse.
 */
export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* sin persistencia: se pierde al recargar, pero la app sigue viva */
  }
}

export function removeSetting(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* idem */
  }
}
