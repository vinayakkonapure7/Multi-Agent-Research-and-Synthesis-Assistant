import { useState, useEffect, useCallback } from 'react'
import { getStoredTheme, storeTheme } from './storage'

/**
 * Light/dark theme.
 *
 * This interface is designed dark-first — the frosted panels are built to
 * float over a deep aurora field — so dark is the default on a first visit
 * regardless of the operating-system setting. Once the user picks a side,
 * that choice is remembered and always wins.
 *
 * The value is applied as data-theme on <html>; tokens.css keys its light
 * palette off [data-theme='light'] and treats :root as dark.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => getStoredTheme() || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    storeTheme(theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle }
}
