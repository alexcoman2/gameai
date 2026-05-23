import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { Check, Loader2, ExternalLink, Crown, Zap, Gift, Mic, Rocket } from "lucide-react";
import { openCheckout, getPaddleConfig } from "@/lib/paddle-client";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import { useMe } from "@/hooks/use-me";

type PlanTier = "free" | "pro" | "pro_plus" | "elite";

type BillingStatus = {
  plan: PlanTier;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  hasSubscription: boolean;
};

type PaidTier = "pro" | "pro_plus" | "elite";

const TIERS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    period: "forever",
    icon: Gift,
    features: [
      "40 chats / month",
      "60 min Watch Mode trial",
      "Game detection",
      "Conversation history",
    ],
    notIncluded: ["No voice mode", "No overage — hard caps"],
    overage: null,
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "$19",
    period: "month",
    icon: Zap,
    features: [
      "150 chats included",
      "3 hours Watch Mode included",
      "Voice mode (mic + TTS replies)",
      "Pay-as-you-go beyond included",
    ],
    notIncluded: [],
    overage: "Then $0.04 / chat, $0.15 / min watch",
  },
  {
    id: "pro_plus" as const,
    name: "Pro+",
    price: "$39",
    period: "month",
    icon: Rocket,
    highlight: true,
    features: [
      "400 chats included",
      "8 hours Watch Mode included",
      "Voice mode included",
      "Lower watch overage",
    ],
    notIncluded: [],
    overage: "Then $0.04 / chat, $0.12 / min watch",
  },
  {
    id: "elite" as const,
    name: "Elite",
    price: "$99",
    period: "month",
    icon: Crown,
    features: [
      "1,500 chats included",
      "25 hours Watch Mode included",
      "Voice mode included",
      "Best overage rates · priority load",
    ],
    notIncluded: [],
    overage: "Then $0.03 / chat, $0.10 / min watch",
  },
];

export default function Upgrade() {
  const { user } = useUser();
  const { me } = useMe();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loadingTier, setLoadingTier] = useState<PaidTier | null>(null);
  const [loadingPaypalTier, setLoadingPaypalTier] = useState<PaidTier | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const isAdmin = me?.isAdmin ?? false;
  // Admin-only toggle: lets the admin bypass the "no purchases" block and run
  // a real checkout end-to-end to verify the payment portal. Real money will
  // be charged — the warning banner makes this explicit.
  const [adminTestMode, setAdminTestMode] = useState(false);

  useEffect(() => {
    getPaddleConfig()
      .then((cfg) => setPaypalEnabled(!!cfg.paypal?.enabled))
      .catch(() => setPaypalEnabled(false));
  }, []);

  useEffect(() => {
    authFetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      toast({
        title: "Checkout complete",
        description:
          "Your subscription is being activated. This page will refresh shortly.",
      });
      setTimeout(() => {
        authFetch("/api/billing/status")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setStatus(d));
      }, 3000);
    }
    // PayPal redirect-back: ?paypal=success&subscription_id=I-...
    // Confirm with the server so the user's plan flips immediately
    // instead of waiting on the webhook. Keep the query params until
    // we get a definitive success response — that way a transient 401
    // (Clerk not warmed up yet) or 500 leaves the user able to refresh
    // and retry, instead of stranding them on free with no recourse
    // until the webhook catches up.
    if (params.get("paypal") === "success") {
      const subId = params.get("subscription_id");
      if (!subId) {
        toast({
          title: "PayPal returned, but no subscription ID was provided.",
          variant: "destructive",
        });
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        authFetch("/api/billing/paypal/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId: subId }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const body = await r.json().catch(() => ({}));
              throw new Error(body.error ?? `HTTP ${r.status}`);
            }
            return r.json() as Promise<{ plan: string; status: string; active: boolean }>;
          })
          .then((body) => {
            if (body.active) {
              toast({
                title: "PayPal subscription active",
                description: "Your plan has been upgraded.",
              });
            } else {
              toast({
                title: "PayPal subscription pending",
                description: `Status: ${body.status}. We'll update your plan once PayPal activates it.`,
              });
            }
            // Only clean the URL on a definitive answer so refresh+retry
            // works after transient errors.
            window.history.replaceState({}, "", window.location.pathname);
            return authFetch("/api/billing/status")
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => setStatus(d));
          })
          .catch((e) => {
            toast({
              title: "PayPal confirmation failed — refresh to retry",
              description: e instanceof Error ? e.message : "Unknown error",
              variant: "destructive",
            });
          });
      }
    } else if (params.get("paypal") === "cancel") {
      toast({ title: "PayPal checkout cancelled" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  async function handleUpgrade(tier: PaidTier) {
    if (!user) {
      setLocation("/sign-in");
      return;
    }
    setLoadingTier(tier);
    try {
      await openCheckout({ tier, adminTest: isAdmin && adminTestMode });
    } catch (e) {
      toast({
        title: "Checkout failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingTier(null);
    }
  }

  // PayPal redirect flow: ask server for an approval URL, then navigate
  // the browser to PayPal. Server creates the subscription with our
  // custom_id=userId, so the webhook + confirm endpoint can both bind
  // the resulting subscription to the right user.
  async function handlePaypalUpgrade(tier: PaidTier) {
    if (!user) {
      setLocation("/sign-in");
      return;
    }
    setLoadingPaypalTier(tier);
    try {
      const res = await authFetch("/api/billing/paypal/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, adminTest: isAdmin && adminTestMode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { approveUrl } = (await res.json()) as { approveUrl: string };
      window.location.href = approveUrl;
    } catch (e) {
      toast({
        title: "PayPal checkout failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setLoadingPaypalTier(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await authFetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({
        title: "Couldn't open billing portal",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  }

  const currentPlan: PlanTier = status?.plan ?? "free";

  function displayTier(t: PlanTier): string {
    if (t === "pro_plus") return "Pro+";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold font-mono tracking-wider text-primary uppercase">
            Choose Your Plan
          </h2>
          <p className="text-muted-foreground mt-2 font-mono text-sm">
            Get unstuck in any game. Cancel anytime.
          </p>
        </div>

        <Show when="signed-out">
          <div className="mb-8 border border-primary/40 bg-primary/5 p-4 text-center">
            <p className="text-sm font-mono text-foreground mb-3">
              Sign in to manage your subscription.
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
          {isAdmin && (
            <div className={`mb-8 border p-4 ${adminTestMode ? "border-destructive/60 bg-destructive/10" : "border-primary/60 bg-primary/10"}`}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-left">
                  <p className={`text-sm font-mono uppercase tracking-wider ${adminTestMode ? "text-destructive" : "text-primary"}`}>
                    {adminTestMode ? "Admin test checkout: ON — real charges will apply" : "Admin account — billing bypassed"}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    {adminTestMode
                      ? "Buttons below run REAL Paddle / PayPal checkouts. Use a test card or cancel after the portal opens."
                      : "You have unlimited usage and cannot purchase subscriptions."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminTestMode((v) => !v)}
                  className={`shrink-0 px-3 py-2 font-mono text-[11px] uppercase tracking-widest border transition-colors ${
                    adminTestMode
                      ? "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      : "border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  }`}
                >
                  {adminTestMode ? "Disable test mode" : "Enable test checkout"}
                </button>
              </div>
            </div>
          )}
          {status?.hasSubscription && (
            <div className="mb-8 border border-border bg-card p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Current plan
                </p>
                <p className="text-lg font-mono font-bold text-primary uppercase mt-1">
                  {displayTier(currentPlan)}
                  {status.subscriptionStatus && (
                    <span className="ml-3 text-xs text-muted-foreground normal-case">
                      ({status.subscriptionStatus})
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handlePortal}
                disabled={portalLoading}
                className="flex items-center gap-2 px-4 py-2 border border-border text-foreground font-mono text-xs uppercase tracking-wider hover:bg-muted transition-colors disabled:opacity-50"
              >
                {portalLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Manage billing
              </button>
            </div>
          )}
        </Show>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            const isCurrent = currentPlan === tier.id;
            const isUpgradeable = tier.id !== "free";
            const highlight = "highlight" in tier && tier.highlight;
            return (
              <div
                key={tier.id}
                className={`border p-6 flex flex-col ${
                  highlight
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <Icon
                    className={`w-6 h-6 ${
                      highlight ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  {isCurrent && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-primary border border-primary px-2 py-1">
                      Current
                    </span>
                  )}
                  {highlight && !isCurrent && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-primary border border-primary px-2 py-1">
                      Popular
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-bold font-mono uppercase tracking-wider text-foreground">
                  {tier.name}
                </h3>
                <div className="mt-2 mb-6">
                  <span className="text-4xl font-bold font-mono text-foreground">
                    {tier.price}
                  </span>
                  <span className="text-muted-foreground font-mono text-sm ml-1">
                    / {tier.period}
                  </span>
                </div>
                <ul className="flex-1 space-y-2 mb-4">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-foreground font-mono"
                    >
                      {f.toLowerCase().includes("voice") ? (
                        <Mic className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      ) : (
                        <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      )}
                      <span>{f}</span>
                    </li>
                  ))}
                  {tier.notIncluded.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs text-muted-foreground font-mono opacity-60"
                    >
                      <span className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {tier.overage && (
                  <div className="mb-4 pb-4 border-b border-border/50">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      Overage
                    </p>
                    <p className="text-xs font-mono text-foreground/80">
                      {tier.overage}
                    </p>
                  </div>
                )}
                {isUpgradeable && (
                  <>
                    <button
                      type="button"
                      disabled={isCurrent || loadingTier !== null || loadingPaypalTier !== null || (isAdmin && !adminTestMode)}
                      onClick={() => handleUpgrade(tier.id as PaidTier)}
                      className={`w-full py-3 font-mono text-xs uppercase tracking-wider border transition-colors ${
                        highlight
                          ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                          : "bg-transparent text-foreground border-border hover:bg-muted"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {loadingTier === tier.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading...
                        </span>
                      ) : isCurrent ? (
                        "Active"
                      ) : currentPlan !== "free" ? (
                        `Switch to ${tier.name}`
                      ) : (
                        `Upgrade to ${tier.name}`
                      )}
                    </button>
                    {paypalEnabled && !isCurrent && (
                      <button
                        type="button"
                        disabled={loadingTier !== null || loadingPaypalTier !== null || (isAdmin && !adminTestMode)}
                        onClick={() => handlePaypalUpgrade(tier.id as PaidTier)}
                        className="mt-2 w-full py-2 font-mono text-[11px] uppercase tracking-wider border border-[#ffc439]/60 text-[#ffc439] bg-transparent hover:bg-[#ffc439]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingPaypalTier === tier.id ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Redirecting...
                          </span>
                        ) : (
                          "Or pay with PayPal"
                        )}
                      </button>
                    )}
                  </>
                )}
                {!isUpgradeable && (
                  <div className="w-full py-3 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground border border-dashed border-border">
                    Default tier
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs font-mono text-muted-foreground mt-8">
          Powered by Paddle · Secure checkout · Cancel anytime
        </p>
      </div>
    </div>
  );
}
