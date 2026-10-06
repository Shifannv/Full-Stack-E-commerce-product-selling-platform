"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { ToastProvider } from "./toast";

/**
 * Data-only query client for the operator workspaces — deliberately not the storefront's
 * `storefront-provider.tsx`, which also drives Lenis smooth scroll that an admin console has
 * no use for.
 *
 * Retry policy: a 4xx is a decision already made by the server and retrying changes nothing;
 * a network failure or 5xx (every router's deliberate failure code is 503, see lib/api/errors)
 * is worth one retry. `authenticate()` runs once per mounted `/api/*` router before the target
 * route, so staleTime keeps repeat navigations from re-paying that cost needlessly.
 */
export function OperatorQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 600_000,
            refetchOnWindowFocus: true,
            retry: (count, error) =>
              count < 1 && !(error instanceof ApiError && error.status < 500),
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
