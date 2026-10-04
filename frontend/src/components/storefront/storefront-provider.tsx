"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Lenis from "lenis";
import { ApiError } from "@/lib/api";

export function StorefrontProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
    } },
  }));
  const pathname = usePathname();

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scroll: Lenis | undefined;
    const syncIntro = () => {
      if (document.documentElement.classList.contains("intro-lock")) scroll?.stop();
      else scroll?.start();
    };
    function configure() {
      scroll?.destroy();
      scroll = undefined;
      if (!preference.matches) scroll = new Lenis({
        autoRaf: true,
        anchors: true,
        duration: 0.9,
        syncTouch: false,
        prevent: (node) => !!node.closest('[role="dialog"], [data-lenis-prevent]'),
      });
      syncIntro();
    }
    configure();
    const introObserver = new MutationObserver(syncIntro);
    introObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    preference.addEventListener("change", configure);
    return () => { introObserver.disconnect(); preference.removeEventListener("change", configure); scroll?.destroy(); };
  }, [pathname]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
