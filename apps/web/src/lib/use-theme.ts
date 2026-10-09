import { useCallback, useEffect, useState } from 'react'

import { readSetting, writeSetting } from './storage'

type Theme = 'light' | 'dark'

const KEY = 'pits.theme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    writeSetting(KEY, theme)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    meta?.setAttribute('content', theme === 'dark' ? '#0a0a0d' : '#ffffff')
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return { theme, toggle, saved: readSetting(KEY) }
}
