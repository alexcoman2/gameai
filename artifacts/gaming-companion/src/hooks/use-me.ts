import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { authFetch } from "@/lib/auth-fetch";

export type Me = {
  id: string;
  email: string | null;
  plan: "free" | "pro" | "pro_plus" | "elite";
  isAdmin: boolean;
};

/**
 * Single source of truth for "who is signed in and are they admin".
 * Fires once on sign-in and clears on sign-out. Used by the layout to
 * conditionally show admin-only nav.
 */
export function useMe(): { me: Me | null; loading: boolean } {
  const { isSignedIn, isLoaded } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMe(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    authFetch("/api/me")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Me;
      })
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, isLoaded]);

  return { me, loading };
}
