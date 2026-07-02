'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'react-hot-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        retry: 1,
        retryDelay: 1000,
      },
    },
  }));

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <Tooltip.Provider delayDuration={400} skipDelayDuration={100}>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster
            position="top-right"
            gutter={8}
            containerStyle={{ top: 16, right: 16 }}
            toastOptions={{
              duration: 3000,
              style: {
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 500,
                padding: '12px 16px',
                maxWidth: '420px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)',
              },
              success: {
                duration: 2500,
                iconTheme: { primary: '#22c55e', secondary: '#fff' },
                style: { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' },
              },
              error: {
                duration: 4500,
                iconTheme: { primary: '#ef4444', secondary: '#fff' },
                style: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' },
              },
            }}
          />
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
        </QueryClientProvider>
      </Tooltip.Provider>
    </ThemeProvider>
  );
}