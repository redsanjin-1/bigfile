import { useState, useEffect } from 'react'

const dark = window.matchMedia('(prefers-color-scheme:dark)')

export function useAutoTheme() {
  const [isDarkTheme, setIsDarkTheme] = useState<any>(dark.matches)
  function handleColorChange(e: MediaQueryListEvent) {
    setIsDarkTheme(e.matches)
  }
  useEffect(() => {
    window
      .matchMedia('(prefers-color-scheme:dark)')
      .addEventListener('change', handleColorChange)

    return () => {
      window
        .matchMedia('(prefers-color-scheme:dark)')
        .removeEventListener('change', handleColorChange)
    }
  }, [])

  return {
    isDarkTheme,
  }
}
