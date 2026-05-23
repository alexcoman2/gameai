import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Show } from "@clerk/react";
import { Loader2, RefreshCw, Crown, Shield } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type UsageSnapshot = {
  plan: "free" | "pro" | "pro_plus" | "elite";
  isAdmin: boolean;
  allowance: {
    monthlyChats: number;
    monthlyWatchSeconds: number;
    allowsWatch: boolean;
    allowsVoice: boolean;
    allowsOverage: boolean;
    overageChatMicrocents: number;
    overageWatchSecMicrocents: number;
  };
  monthly: { chats: number; watchSeconds: number; costMicrocents: number };
  daily: { chats: number; watchSeconds: number; costMicrocents: number };
  dailyHardCapCents: number;
  estimatedOverageMicrocents: { chat: number; watch: number; total: number };
  periodStart: string;
};

function fmtDollars(microcents: number): string {
  return `$${(microcents / 1_000_000).toFixed(2)}`;
}

function fmtMinutes(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function Bar({
  used,
  total,
  unit,
  fmt,
  overageOk,
}: {
  used: number;
  total: number;
  unit: string;
  fmt: (n: number) => string;
  overageOk: boolean;
}) {
  const p = pct(used, total);
  const over = used > total;
  const overLabel = over
    ? ` (+${fmt(used - total)} ${overageOk ? "overage" : "over hard cap"})`
    : "";
  const barColor = over
    ? overageOk
      ? "bg-yellow-400"
      : "bg-destructive"
    : p >= 90
    ? "bg-yellow-400"
    : "bg-primary";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs font-mono">
        <span className="text-muted-foreground uppercase tracking-wider">
          {unit}
        </span>
        <span className="text-foreground">
          <span className="font-bold">{fmt(used)}</span>
          <span className="text-muted-foreground"> / {fmt(total)}</span>
          <span className={over ? "text-yellow-400" : "text-muted-foreground"}>
            {overLabel}
          </span>
        </span>
      </div>
      <div className="mt-2 h-2 w-full bg-muted/40 border border-border/60">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

export default function UsagePage() {
  const [data, setData] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await authFetch("/api/billing/usage");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold font-mono tracking-wider text-primary uppercase">
              Usage
            </h1>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mt-2">
              This billing period · resets on the 1st of each month UTC
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-border text-foreground font-mono text-xs uppercase tracking-wider hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
        </div>

        <Show when="signed-out">
          <div className="border border-primary/40 bg-primary/5 p-6 text-center">
            <p className="text-sm font-mono text-foreground mb-4">
              Sign in to see your usage.
            </p>
            <Link
              href="/sign-in"
              className="inline-flex px-4 py-2 border border-primary text-primary font-mono text-xs uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              Sign in
            </Link>
          </div>
        </Show>

        <Show when="signed-in">
          {err && (
            <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm font-mono text-destructive">
              {err}
            </div>
          )}

          {data && (
            <>
              <div className="border border-border bg-card p-5 mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Current plan
                  </p>
                  <p className="text-2xl font-mono font-bold text-primary uppercase mt-1 flex items-center gap-2">
                    <Crown className="w-5 h-5" />
                    {data.plan}
                    {data.isAdmin && (
                      <span className="ml-2 text-[10px] border border-primary px-2 py-1 normal-case flex items-center gap-1">
                        <Shield className="w-3 h-3" /> admin · caps bypassed
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href="/upgrade"
                  className="px-4 py-2 border border-primary/40 text-primary font-mono text-xs uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {data.plan === "free" ? "Upgrade" : "Manage plan"}
                </Link>
              </div>

              <div className="border border-border bg-card/40 p-6 space-y-6 mb-6">
                <h2 className="text-sm font-mono uppercase tracking-wider text-primary">
                  This month
                </h2>
                <Bar
                  used={data.monthly.chats}
                  total={data.allowance.monthlyChats}
                  unit="Chats"
                  fmt={(n) => String(n)}
                  overageOk={data.allowance.allowsOverage}
                />
                <Bar
                  used={data.monthly.watchSeconds}
                  total={data.allowance.monthlyWatchSeconds}
                  unit="Watch Mode"
                  fmt={fmtMinutes}
                  overageOk={data.allowance.allowsOverage}
                />
              </div>

              {data.allowance.allowsOverage &&
                data.estimatedOverageMicrocents.total > 0 && (
                  <div className="border border-yellow-400/40 bg-yellow-400/5 p-5 mb-6">
                    <p className="text-xs font-mono uppercase tracking-wider text-yellow-400">
                      Projected overage this period
                    </p>
                    <p className="mt-2 text-2xl font-mono font-bold text-foreground">
                      {fmtDollars(data.estimatedOverageMicrocents.total)}
                    </p>
                    <p className="mt-2 text-xs font-mono text-muted-foreground">
                      Chat overage:{" "}
                      {fmtDollars(data.estimatedOverageMicrocents.chat)} · Watch
                      overage:{" "}
                      {fmtDollars(data.estimatedOverageMicrocents.watch)} ·
                      Billed via Paddle at period end alongside renewal.
                    </p>
                  </div>
                )}

              <div className="border border-border bg-card/40 p-6 mb-6">
                <h2 className="text-sm font-mono uppercase tracking-wider text-primary mb-4">
                  Today
                </h2>
                <div className="grid grid-cols-3 gap-4 text-sm font-mono">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Chats
                    </p>
                    <p className="text-xl font-bold mt-1">{data.daily.chats}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Watch
                    </p>
                    <p className="text-xl font-bold mt-1">
                      {fmtMinutes(data.daily.watchSeconds)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Cost today
                    </p>
                    <p className="text-xl font-bold mt-1">
                      {fmtDollars(data.daily.costMicrocents)}
                      <span className="ml-1 text-xs text-muted-foreground font-normal">
                        / ${(data.dailyHardCapCents / 100).toFixed(2)}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-[11px] font-mono text-muted-foreground">
                  Daily $
                  {(data.dailyHardCapCents / 100).toFixed(2)} per-user safety
                  fuse pauses all usage until 00:00 UTC if hit.
                </p>
              </div>

              <p className="text-[11px] font-mono text-muted-foreground text-center">
                Period started{" "}
                {new Date(data.periodStart).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}{" "}
                · totals refresh in real time
              </p>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
