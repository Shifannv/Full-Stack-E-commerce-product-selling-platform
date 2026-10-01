"use client";

import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export function useCustomerSession() {
  const session = authClient.useSession();
  const [role, setRole] = useState<
    "checking" | "customer" | "forbidden" | "error"
  >("checking");
  const userId = session.data?.user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    authApi
      .me()
      .then((actor) => {
        if (active)
          setRole(actor.roles.includes("CUSTOMER") ? "customer" : "forbidden");
      })
      .catch(() => {
        if (active) setRole("error");
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return {
    user: session.data?.user ?? null,
    status: session.isPending
      ? ("loading" as const)
      : !session.data?.user
        ? ("signed-out" as const)
        : role,
    refetch: session.refetch,
  };
}
