'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

// next-auth/react parses URLs at module-eval time which crashes
// during Next.js static prerendering. Lazy-load with ssr: false.
const Inner = dynamic(
  () =>
    import('next-auth/react').then(({ SessionProvider }) => ({
      default: ({ children }: { children: ReactNode }) => (
        <SessionProvider>{children}</SessionProvider>
      ),
    })),
  { ssr: false },
);

export function SessionProvider({ children }: { children: ReactNode }) {
  return <Inner>{children}</Inner>;
}
