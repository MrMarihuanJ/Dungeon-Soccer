'use client'

// =====================================================================
// ThemeProvider - Wrapper para next-themes
// =====================================================================

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ReactNode } from 'react'

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange={false}
      storageKey="dungeon-theme"
    >
      {children}
    </NextThemesProvider>
  )
}
