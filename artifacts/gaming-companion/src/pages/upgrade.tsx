import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { Check, Loader2, ExternalLink, Crown, Zap, Gift } from "lucide-react";
import { openCheckout } from "@/lib/paddle-client";
import { useToast } from "@/hooks/use-toast";

type BillingStatus = {
  plan: "free" | "pro" | "elite";
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  hasSubscription: boolean;
};

const TIERS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    period: "forever",
    icon: Gift,
    features: [
      "25 chats / month",
      "30 min Watch Mode trial",
      "Game detection",
      "Conversation history",
    ],
    notIncluded: ["No overage — hard caps"],
    overage: null,
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "$29",
    period: "month",
    icon: Zap,
    highlight: true,
    features: [
      "200 chats included",
      "2 hours Watch Mode included",
      "5-second observation sampling",
      "Pay-as-you-go beyond included",
    ],
    notIncluded: [],
    overage: "Then $0.05 / chat, $0.20 / min watch",
  },
  {
    id: "elite" as const,
    name: "Elite",
    price: "$99",
    period: "month",
    icon: Crown,
    features: [
      "750 chats included",
      "8 hours Watch Mode included",
      "Lower overage rates",
      "Priority during peak load",
    ],
    notIncluded: [],
    overage: "Then $0.04 / chat, $0.15 / min watch",
  },
];

export default function Upgrade() {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loadingTier, setLoadingTier] = useState<"pro" | "elite" | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetch("/api/billing/status")
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
        fetch("/api/billing/status")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setStatus(d));
      }, 3000);
    }
  }, [toast]);

  async function handleUpgrade(tier: "pro" | "elite") {
    if (!user) {
      setLocation("/sign-in");
      return;
    }
    setLoadingTier(tier);
    try {
      await openCheckout({ tier });
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

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
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

  const currentPlan = status?.plan ?? "free";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="max-w-5xl mx-auto">
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
          {status?.hasSubscription && (
            <div className="mb-8 border border-border bg-card p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Current plan
                </p>
                <p className="text-lg font-mono font-bold text-primary uppercase mt-1">
                  {currentPlan}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            const isCurrent = currentPlan === tier.id;
            const isUpgradeable = tier.id !== "free";
            return (
              <div
                key={tier.id}
                className={`border p-6 flex flex-col ${
                  tier.highlight
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <Icon
                    className={`w-6 h-6 ${
                      tier.highlight ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  {isCurrent && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-primary border border-primary px-2 py-1">
                      Current
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
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
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
                  <button
                    type="button"
                    disabled={isCurrent || loadingTier !== null}
                    onClick={() => handleUpgrade(tier.id)}
                    className={`w-full py-3 font-mono text-xs uppercase tracking-wider border transition-colors ${
                      tier.highlight
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
