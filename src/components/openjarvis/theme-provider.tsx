'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * OpenJARVIS Theme Provider
 *
 * Wraps the app with next-themes for dark/light/system mode support.
 * Uses the "class" attribute strategy so Tailwind's `dark:` variant works.
 * Default theme follows the operating system preference.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
