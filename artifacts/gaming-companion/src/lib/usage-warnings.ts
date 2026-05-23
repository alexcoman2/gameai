import { authFetch } from "@/lib/auth-fetch";

type Toast = (opts: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

type UsageSnapshot = {
  plan: "free" | "pro" | "elite";
  allowance: {
    monthlyChats: number;
    monthlyWatchSeconds: number;
    allowsOverage: boolean;
  };
  monthly: { chats: number; watchSeconds: number };
  periodStart: string;
};

type Threshold = 80 | 100;
type Kind = "chats" | "watch";

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return (used / total) * 100;
}

function storageKey(kind: Kind, threshold: Threshold, periodStart: string): string {
  return `unstuck.usage-warn.${periodStart}.${kind}.${threshold}`;
}

function alreadyShown(kind: Kind, threshold: Threshold, periodStart: string): boolean {
  try {
    return sessionStorage.getItem(storageKey(kind, threshold, periodStart)) === "1";
  } catch {
    return false;
  }
}

function markShown(kind: Kind, threshold: Threshold, periodStart: string): void {
  try {
    sessionStorage.setItem(storageKey(kind, threshold, periodStart), "1");
  } catch {
    // sessionStorage unavailable — best-effort, warning will fire again next call
  }
}

function messageFor(
  kind: Kind,
  threshold: Threshold,
  snap: UsageSnapshot,
): { title: string; description: string; variant: "default" | "destructive" } | null {
  const unit = kind === "chats" ? "chats" : "Watch Mode minutes";
  const allowsOverage = snap.allowance.allowsOverage;

  if (threshold === 80) {
    return {
      title: `You've used 80% of your ${unit} this month`,
      description: allowsOverage
        ? `Going over your included ${unit} will be billed at the overage rate.`
        : `Free plan hard-caps at 100%. Upgrade to keep going.`,
      variant: "default",
    };
  }

  // 100% threshold
  if (!allowsOverage) {
    return {
      title: `${kind === "chats" ? "Chat" : "Watch Mode"} limit reached`,
      description: `You've used all your ${unit} for this month. Upgrade to keep going.`,
      variant: "destructive",
    };
  }
  return {
    title: `You're now in overage on ${unit}`,
    description: `Additional usage is being billed at your plan's overage rate and will appear on your next invoice.`,
    variant: "default",
  };
}

/**
 * Fire a toast once per (kind, threshold) crossing per billing period.
 * Called after chat sends and successful watch ticks; cheap enough to call
 * unconditionally — it does one auth'd GET and keys de-dup off the period.
 */
export async function checkUsageWarnings(toast: Toast): Promise<void> {
  let snap: UsageSnapshot;
  try {
    const res = await authFetch("/api/billing/usage");
    if (!res.ok) return;
    snap = (await res.json()) as UsageSnapshot;
  } catch {
    return;
  }

  const checks: Array<{ kind: Kind; used: number; total: number }> = [
    { kind: "chats", used: snap.monthly.chats, total: snap.allowance.monthlyChats },
    {
      kind: "watch",
      used: snap.monthly.watchSeconds,
      total: snap.allowance.monthlyWatchSeconds,
    },
  ];

  for (const { kind, used, total } of checks) {
    const p = pct(used, total);
    // Check 100% first so we don't fire 80% on the same call when crossing both.
    if (p >= 100 && !alreadyShown(kind, 100, snap.periodStart)) {
      const msg = messageFor(kind, 100, snap);
      if (msg) {
        toast(msg);
        markShown(kind, 100, snap.periodStart);
        markShown(kind, 80, snap.periodStart);
      }
    } else if (p >= 80 && !alreadyShown(kind, 80, snap.periodStart)) {
      const msg = messageFor(kind, 80, snap);
      if (msg) {
        toast(msg);
        markShown(kind, 80, snap.periodStart);
      }
    }
  }
}
