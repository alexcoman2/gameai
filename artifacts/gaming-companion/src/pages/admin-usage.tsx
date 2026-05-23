import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Show } from "@clerk/react";
import { Loader2, RefreshCw, Shield, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type AdminUsage = {
  generatedAt: string;
  dailyHardCapCents: number;
  today: {
    totalCostMicrocents: number;
    distinctUsers: number;
    usersOverFuse: number;
  };
  month: {
    totalCostMicrocents: number;
    chats: number;
    watchSeconds: number;
    distinctUsers: number;
    periodStart: string;
  };
  subscribers: { free: number; pro: number; elite: number };
  daily: Array<{
    day: string;
    costMicrocents: number;
    chats: number;
    watchSeconds: number;
    distinctUsers: number;
    usersOverFuse: number;
  }>;
  perUser: Array<{
    userId: string;
    email: string | null;
    plan: "free" | "pro" | "elite";
    isAdmin: boolean;
    monthChats: number;
    monthWatchSeconds: number;
    monthCostMicrocents: number;
    todayCostMicrocents: number;
  }>;
};

function fmtDollars(microcents: number): string {
  return `$${(microcents / 1_000_000).toFixed(2)}`;
}

function fmtMinutes(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function fmtShortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Sparkbars({ data }: { data: AdminUsage["daily"] }) {
  // Scale only to the largest observed day (no synthetic floor) so the
  // shape of the trend is preserved. Empty days are 0-height.
  const maxObserved = Math.max(0, ...data.map((d) => d.costMicrocents));
  return (
    <div className="flex items-end gap-1 h-32 border-b border-border">
      {data.map((d) => {
        const heightPct = maxObserved > 0 ? (d.costMicrocents / maxObserved) * 100 : 0;
        // Red coloring means at least one user individually crossed the
        // per-user $5 fuse that day — distinct from "total daily cost > $5".
        const someoneHitFuse = d.usersOverFuse > 0;
        const fuseSuffix =
          d.usersOverFuse > 0
            ? ` · ${d.usersOverFuse} user${d.usersOverFuse === 1 ? "" : "s"} hit fuse`
            : "";
        return (
          <div
            key={d.day}
            className="flex-1 flex flex-col items-center justify-end gap-1 group relative"
            title={`${fmtShortDay(d.day)} · ${fmtDollars(d.costMicrocents)} · ${d.distinctUsers} users · ${d.chats} chats · ${fmtMinutes(d.watchSeconds)} watch${fuseSuffix}`}
          >
            <div
              className={`w-full transition-all ${someoneHitFuse ? "bg-destructive" : "bg-primary/80 group-hover:bg-primary"}`}
              style={{ height: `${heightPct}%`, minHeight: d.costMicrocents > 0 ? "2px" : "0" }}
            />
            <span className="text-[9px] font-mono text-muted-foreground rotate-0">
              {fmtShortDay(d.day).split(" ")[1]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminUsagePage() {
  const [data, setData] = useState<AdminUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    setForbidden(false);
    try {
      const res = await authFetch("/api/admin/usage");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
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
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold font-mono tracking-wider text-primary uppercase flex items-center gap-3">
              <Shield className="w-6 h-6" /> Admin Usage
            </h1>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mt-2">
              Cross-user observability · UTC days
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-border text-foreground font-mono text-xs uppercase tracking-wider hover:bg-muted transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>

        <Show when="signed-out">
          <div className="border border-primary/40 bg-primary/5 p-6 text-center">
            <p className="text-sm font-mono text-foreground mb-4">
              Sign in to view admin usage.
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
          {forbidden && (
            <div className="border border-destructive/50 bg-destructive/10 p-6 text-sm font-mono text-destructive">
              403 · This page is restricted to admin accounts.
            </div>
          )}

          {err && !forbidden && (
            <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm font-mono text-destructive">
              {err}
            </div>
          )}

          {data && !forbidden && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Stat
                  label="Today cost"
                  value={fmtDollars(data.today.totalCostMicrocents)}
                  sub={`${data.today.distinctUsers} active users`}
                />
                <Stat
                  label="Month cost"
                  value={fmtDollars(data.month.totalCostMicrocents)}
                  sub={`${data.month.distinctUsers} active · ${data.month.chats} chats · ${fmtMinutes(data.month.watchSeconds)}`}
                />
                <Stat
                  label="Subscribers"
                  value={`${data.subscribers.pro + data.subscribers.elite}`}
                  sub={`${data.subscribers.pro} pro · ${data.subscribers.elite} elite · ${data.subscribers.free} free`}
                />
                <Stat
                  label="Hit $5 fuse today"
                  value={String(data.today.usersOverFuse)}
                  warn={data.today.usersOverFuse > 0}
                  sub={`per-user cap: $${(data.dailyHardCapCents / 100).toFixed(2)}/day`}
                />
              </div>

              <div className="border border-border bg-card/40 p-5 mb-6">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-mono uppercase tracking-wider text-primary">
                    Cost · last 14 days
                  </h2>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    red bar = exceeded per-user fuse for at least one user
                  </span>
                </div>
                <Sparkbars data={data.daily} />
              </div>

              <div className="border border-border bg-card/40 p-5">
                <h2 className="text-sm font-mono uppercase tracking-wider text-primary mb-4">
                  Top spenders · this month
                </h2>
                {data.perUser.length === 0 ? (
                  <p className="text-xs font-mono text-muted-foreground">
                    No usage recorded this period yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead className="text-muted-foreground uppercase tracking-wider">
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-3">User</th>
                          <th className="text-left py-2 pr-3">Plan</th>
                          <th className="text-right py-2 pr-3">Chats</th>
                          <th className="text-right py-2 pr-3">Watch</th>
                          <th className="text-right py-2 pr-3">Today</th>
                          <th className="text-right py-2">Month $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.perUser.map((u) => {
                          const overFuse =
                            u.todayCostMicrocents >= data.dailyHardCapCents * 10_000;
                          return (
                            <tr
                              key={u.userId}
                              className="border-b border-border/40 hover:bg-muted/20"
                            >
                              <td className="py-2 pr-3 text-foreground">
                                {u.email ?? (
                                  <span className="text-muted-foreground">
                                    {u.userId.slice(0, 12)}…
                                  </span>
                                )}
                                {u.isAdmin && (
                                  <span className="ml-2 text-[9px] border border-primary/60 px-1.5 py-0.5 text-primary uppercase">
                                    admin
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-3 uppercase">{u.plan}</td>
                              <td className="py-2 pr-3 text-right">{u.monthChats}</td>
                              <td className="py-2 pr-3 text-right">
                                {fmtMinutes(u.monthWatchSeconds)}
                              </td>
                              <td
                                className={`py-2 pr-3 text-right ${overFuse ? "text-destructive font-bold" : ""}`}
                              >
                                {fmtDollars(u.todayCostMicrocents)}
                                {overFuse && (
                                  <AlertTriangle className="inline w-3 h-3 ml-1" />
                                )}
                              </td>
                              <td className="py-2 text-right font-bold text-foreground">
                                {fmtDollars(u.monthCostMicrocents)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <p className="mt-6 text-[11px] font-mono text-muted-foreground text-center">
                Generated{" "}
                {new Date(data.generatedAt).toLocaleString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}{" "}
                · period started{" "}
                {new Date(data.month.periodStart).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`border p-4 ${warn ? "border-destructive/60 bg-destructive/5" : "border-border bg-card"}`}
    >
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-2xl font-mono font-bold mt-1 ${warn ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[10px] font-mono text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
