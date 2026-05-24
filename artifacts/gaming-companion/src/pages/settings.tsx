import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useClerk } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useGetSettings, getGetSettingsQueryKey, useSaveSettings } from "@workspace/api-client-react";
import { Loader2, Save, Terminal, Gamepad2, Eye, EyeOff, Keyboard, CreditCard, AlertTriangle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";

const settingsSchema = z.object({
  steamApiKey: z.string(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

type BillingStatus = {
  plan: "free" | "pro" | "pro_plus" | "elite";
  billingProvider: "paddle" | "paypal" | "stripe" | null;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  hasSubscription: boolean;
  isSubscriptionActive: boolean;
};

function displayTier(t: BillingStatus["plan"]): string {
  if (t === "pro_plus") return "Pro+";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const [showSteamKey, setShowSteamKey] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const saveMutation = useSaveSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      steamApiKey: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({ steamApiKey: "" });
    }
  }, [settings, form]);

  // Load billing status on mount. Failures fall back to "free" so the
  // billing card always renders (signed-out users see a Sign-in prompt).
  useEffect(() => {
    let cancelled = false;
    setBillingLoading(true);
    authFetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) setBilling(data as BillingStatus);
      })
      .catch(() => {
        if (!cancelled) setBilling({ plan: "free", billingProvider: null, subscriptionStatus: null, subscriptionCurrentPeriodEnd: null, hasSubscription: false, isSubscriptionActive: false });
      })
      .finally(() => {
        if (!cancelled) setBillingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (data: SettingsFormValues) => {
    try {
      await saveMutation.mutateAsync({
        data: {
          steamApiKey: data.steamApiKey || null,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      form.setValue("steamApiKey", "");
      toast({
        title: "SYSTEM UPDATED",
        description: "Configuration parameters saved successfully.",
        className: "bg-card border-primary/50 font-mono text-primary",
      });
    } catch {
      toast({
        title: "UPDATE FAILED",
        description: "Unable to write configuration to memory.",
        variant: "destructive",
        className: "font-mono rounded-none",
      });
    }
  };

  async function handleCancelSubscription() {
    if (!billing?.isSubscriptionActive) return;
    setCancelling(true);
    try {
      // Branch strictly by provider — never blind-fallback between the
      // two, otherwise an already-cancelled PayPal sub can incorrectly
      // open the Paddle portal.
      if (billing.billingProvider === "paypal") {
        const res = await authFetch("/api/billing/paypal/cancel", { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        toast({
          title: "Subscription cancelled",
          description: "Your plan will stay active until the end of the current billing period.",
        });
        const updated = await authFetch("/api/billing/status").then((r) => r.json());
        setBilling(updated);
      } else if (billing.billingProvider === "paddle") {
        const portalRes = await authFetch("/api/billing/portal", { method: "POST" });
        if (!portalRes.ok) {
          const body = await portalRes.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${portalRes.status}`);
        }
        const { url } = await portalRes.json();
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("Unknown billing provider — contact support.");
      }
    } catch (e) {
      toast({
        title: "Couldn't cancel subscription",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await authFetch("/api/me", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast({
        title: "Account deleted",
        description: "Your data has been removed. Signing you out…",
      });
      // Give the toast a beat, then sign out (which redirects to /).
      setTimeout(() => {
        signOut({ redirectUrl: "/" }).catch(() => {
          window.location.href = "/";
        });
      }, 800);
    } catch (e) {
      toast({
        title: "Account deletion failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-8 flex items-center gap-3 pb-4 border-b border-border">
        <Terminal className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-mono tracking-widest text-primary font-bold">SYSTEM CONFIGURATION</h1>
      </div>

      <div className="grid gap-6">
        <Card className="bg-card/50 border-border rounded-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary/80"></div>
          <CardHeader>
            <CardTitle className="font-mono flex items-center gap-2 text-lg">
              <Keyboard className="w-5 h-5 text-muted-foreground" />
              KEYBOARD SHORTCUTS
            </CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              Global hotkeys — work even while a game is focused
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border border border-border bg-background/50 font-mono text-sm">
              {[
                {
                  label: "Show / hide chat overlay",
                  primary: ["Ctrl", "Shift", "Space"],
                  fallback: ["Alt", "Space"],
                },
                {
                  label: "Voice input — tap once, speak, it auto-sends when you stop",
                  primary: ["Ctrl", "Shift", "V"],
                  fallback: ["Alt", "V"],
                },
                {
                  label: "Hands-free mode (auto-listen on / off)",
                  primary: ["Ctrl", "Shift", "H"],
                  fallback: ["Alt", "H"],
                },
                {
                  label: "Close / hide overlay while focused",
                  primary: ["Esc"],
                },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-foreground/90 text-xs sm:text-sm">
                    {row.label}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1">
                      {row.primary.map((k) => (
                        <kbd
                          key={k}
                          className="rounded-none border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                    {row.fallback && (
                      <>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          or
                        </span>
                        <span className="flex items-center gap-1">
                          {row.fallback.map((k) => (
                            <kbd
                              key={k}
                              className="rounded-none border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-3">
              If the primary combo is taken by another app, Unstuck
              automatically falls back to the alternate. The active binding is
              shown inside the overlay.
            </p>
          </CardContent>
        </Card>

        {/* ── Billing & Subscription ─────────────────────────────────── */}
        <Card className="bg-card/50 border-border rounded-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/80"></div>
          <CardHeader>
            <CardTitle className="font-mono flex items-center gap-2 text-lg">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              BILLING & SUBSCRIPTION
            </CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              Current plan, upgrades, and cancellation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-none border border-border bg-background/50 p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Current plan
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-primary uppercase">
                    {billingLoading ? "…" : displayTier(billing?.plan ?? "free")}
                    {billing?.subscriptionStatus && (
                      <span className="ml-2 text-[10px] text-muted-foreground normal-case tracking-normal">
                        ({billing.subscriptionStatus})
                      </span>
                    )}
                  </p>
                  {billing?.subscriptionCurrentPeriodEnd && (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Renews{" "}
                      {new Date(billing.subscriptionCurrentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Link
                  href="/upgrade"
                  className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest border border-primary text-primary px-4 py-2 hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {billing?.hasSubscription ? "Change plan" : "Upgrade"}
                </Link>
              </div>

              {billing?.isSubscriptionActive && (
                <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-border/60">
                  <p className="font-mono text-xs text-muted-foreground max-w-md">
                    Cancellation stops auto-renew. Paid access continues until
                    the end of the current billing period.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelSubscription}
                    disabled={cancelling}
                    className="font-mono rounded-none uppercase tracking-widest text-xs h-9"
                  >
                    {cancelling ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    )}
                    Cancel subscription
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border rounded-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/80"></div>
          <CardHeader>
            <CardTitle className="font-mono flex items-center gap-2 text-lg">
              <Gamepad2 className="w-5 h-5 text-muted-foreground" />
              GAME DETECTION
            </CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              Steam API integration for expanded title coverage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="rounded-none border border-border p-4 bg-background/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-mono text-sm tracking-widest text-foreground">STEAM API KEY</p>
                      <p className="font-mono text-[10px] uppercase text-muted-foreground">
                        Optional — improves detection for obscure or indie titles
                      </p>
                    </div>
                    {settings?.hasSteamApiKey && (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-green-500 border border-green-500/40 bg-green-500/10 px-2 py-1">
                        CONFIGURED
                      </span>
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name="steamApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <div className="relative">
                          <FormControl>
                            <Input
                              {...field}
                              type={showSteamKey ? "text" : "password"}
                              placeholder={settings?.hasSteamApiKey ? "••••••••••••  (leave blank to keep)" : "Enter Steam Web API key…"}
                              className="font-mono text-sm rounded-none bg-background border-border pr-10"
                              autoComplete="off"
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() => setShowSteamKey((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            tabIndex={-1}
                          >
                            {showSteamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <FormMessage className="font-mono text-xs" />
                        <p className="font-mono text-[10px] text-muted-foreground uppercase mt-1">
                          Get a free key at{" "}
                          <a
                            href="https://steamcommunity.com/dev/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2"
                          >
                            steamcommunity.com/dev/apikey
                          </a>
                          . Without a key, game detection still uses Steam store search as a fallback.
                        </p>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="font-mono rounded-none uppercase tracking-widest h-12 px-8 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    Commit Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* ── Danger Zone ────────────────────────────────────────────── */}
        <Card className="bg-card/50 border-destructive/50 rounded-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-destructive/80"></div>
          <CardHeader>
            <CardTitle className="font-mono flex items-center gap-2 text-lg text-destructive">
              <AlertTriangle className="w-5 h-5" />
              DANGER ZONE
            </CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              Irreversible account actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-none border border-destructive/40 bg-destructive/5 p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-md">
                <p className="font-mono text-sm text-foreground">Delete account</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  Permanently deletes your Unstuck account, all chat history,
                  usage records, and game profiles. Cancels any active paid
                  subscription. This cannot be undone.
                </p>
              </div>
              <AlertDialog
                onOpenChange={(open) => {
                  if (!open) setConfirmText("");
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    className="font-mono rounded-none uppercase tracking-widest text-xs h-9 shrink-0"
                  >
                    Delete account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-none border-destructive/60 font-mono">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-destructive uppercase tracking-widest">
                      Delete account?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-foreground/80">
                      This permanently deletes your account, your chat
                      history, usage records and game profiles, and cancels
                      any active subscription. There is no undo. Type{" "}
                      <span className="font-bold text-destructive">DELETE</span>{" "}
                      to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    autoComplete="off"
                    className="font-mono rounded-none bg-background border-destructive/40"
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-none font-mono uppercase tracking-widest">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={confirmText !== "DELETE" || deleting}
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirmText === "DELETE") handleDeleteAccount();
                      }}
                      className="rounded-none font-mono uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Delete forever
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
