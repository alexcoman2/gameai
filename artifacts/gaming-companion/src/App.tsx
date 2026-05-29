import { useEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth } from "@clerk/react";
import { setAuthTokenGetter as setApiClientAuthTokenGetter } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@/lib/auth-fetch";
import { identifyUser, resetUser, trackPageview } from "@/lib/posthog";
import { useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Settings from "@/pages/settings";
import Upgrade from "@/pages/upgrade";
import UsagePage from "@/pages/usage";
import AdminUsagePage from "@/pages/admin-usage";
import { AboutPage, PricingPage, TermsPage, PrivacyPage, RefundPage } from "@/pages/legal";
import { LibraryPage } from "@/pages/library";
import { DownloadPage } from "@/pages/download";
import OverlayPage from "@/pages/overlay";
import { Layout } from "@/components/layout";
import { ChatProvider } from "@/context/chat-context";
import { GameProvider } from "@/context/game-context";

const hostname = window.location.hostname;
const isLocalHost =
  hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
const clerkPubKey = isLocalHost
  ? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  : publishableKeyFromHost(
      hostname,
      import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
    );
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// True only inside the bundled Electron desktop app (preload injects
// electronAPI.isElectron). Used to keep web-only Clerk behavior canonical
// while still enabling the desktop-specific bearer-token transport.
const isElectron = !!(
  window as Window & { electronAPI?: { isElectron?: boolean } }
).electronAPI?.isElectron;

// In Electron (and any non-proxy host), Clerk's OAuth flow defaults to using
// the FAPI/proxy origin (game-companion-ai.replit.app) as the post-sign-in
// redirect target. That sends the Electron window permanently to the hosted
// site after Google OAuth. Force the post-auth landing URL back to the
// current window's origin so we stay on http://127.0.0.1:8765 inside Electron.
const postAuthRedirectUrl = `${window.location.origin}${basePath}/`;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const queryClient = new QueryClient();

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(154 100% 50%)",
    colorForeground: "hsl(0 0% 98%)",
    colorMutedForeground: "hsl(0 0% 60%)",
    colorDanger: "hsl(0 100% 60%)",
    colorBackground: "hsl(0 0% 5%)",
    colorInput: "hsl(0 0% 8%)",
    colorInputForeground: "hsl(0 0% 98%)",
    colorNeutral: "hsl(0 0% 20%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(0_0%_5%)] border border-[hsl(0_0%_12%)] w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(0_0%_98%)] font-mono tracking-wider",
    headerSubtitle: "text-[hsl(0_0%_60%)]",
    socialButtonsBlockButton: "border border-[hsl(0_0%_20%)] bg-[hsl(0_0%_8%)] hover:bg-[hsl(0_0%_12%)]",
    socialButtonsBlockButtonText: "text-[hsl(0_0%_98%)] font-medium",
    formFieldLabel: "text-[hsl(0_0%_98%)] font-mono text-xs tracking-wider uppercase",
    formFieldInput: "bg-[hsl(0_0%_8%)] border border-[hsl(0_0%_20%)] text-[hsl(0_0%_98%)]",
    formButtonPrimary:
      "bg-[hsl(154_100%_50%)] hover:bg-[hsl(154_100%_45%)] text-black font-mono tracking-wider uppercase",
    footerActionLink: "text-[hsl(154_100%_50%)] hover:text-[hsl(154_100%_60%)]",
    footerActionText: "text-[hsl(0_0%_60%)]",
    dividerLine: "bg-[hsl(0_0%_20%)]",
    dividerText: "text-[hsl(0_0%_60%)]",
    identityPreviewEditButton: "text-[hsl(154_100%_50%)]",
    formFieldSuccessText: "text-[hsl(154_100%_50%)]",
    alertText: "text-[hsl(0_0%_98%)]",
    alert: "border border-[hsl(0_100%_60%)]/40 bg-[hsl(0_100%_60%)]/10",
    otpCodeFieldInput: "bg-[hsl(0_0%_8%)] border border-[hsl(0_0%_20%)] text-[hsl(0_0%_98%)]",
    logoBox: "justify-center py-2",
    logoImage: "h-10",
    main: "gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        oauthFlow="redirect"
        forceRedirectUrl={postAuthRedirectUrl}
        fallbackRedirectUrl={postAuthRedirectUrl}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        oauthFlow="redirect"
        forceRedirectUrl={postAuthRedirectUrl}
        fallbackRedirectUrl={postAuthRedirectUrl}
      />
    </div>
  );
}

// Browser-based desktop sign-in landing page. Reached when the Electron app
// opens https://<hosted>/desktop/auth?state=<nonce> in the user's real OS
// browser. If the visitor isn't signed in, render the normal Clerk <SignIn>
// returning to this same URL (preserving the state nonce). Once signed in,
// forward the browser to the token-minting endpoint, which 302-redirects to
// the unstuck:// deep link that hands control back to the desktop app.
function DesktopAuthPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const search =
    typeof window !== "undefined" ? window.location.search : "";
  // Read the desktop nonce. New desktop builds pass it as `desktop_state`;
  // older installed builds (≤2.0.63) still pass it as `state`. We accept both,
  // but we must NEVER let `state` reach clerk-js: `state` is reserved by
  // Clerk's OAuth/CSRF handshake, and our value there collides on the Google
  // round-trip and invalidates the sign-in context — that is what makes
  // prepare_first_factor 401 on this page but not on /sign-in.
  const params = new URLSearchParams(search);
  const desktopState =
    params.get("desktop_state") ?? params.get("state") ?? "";
  const selfUrl = `${window.location.origin}${basePath}/desktop/auth${
    desktopState ? `?desktop_state=${encodeURIComponent(desktopState)}` : ""
  }`;

  // Strip the reserved `state` param out of the address bar on load so
  // clerk-js never observes it (covers older desktop builds that open this
  // page with ?state=<nonce>). The nonce is already captured above.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (!p.has("state")) return;
    p.delete("state");
    if (desktopState) p.set("desktop_state", desktopState);
    const qs = p.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, [desktopState]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const tokenUrl = `${basePath}/api/desktop/token${
      desktopState ? `?desktop_state=${encodeURIComponent(desktopState)}` : ""
    }`;
    window.location.href = tokenUrl;
  }, [isLoaded, isSignedIn, desktopState]);

  if (isLoaded && isSignedIn) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-mono text-sm uppercase tracking-wider text-primary">
          Returning you to Unstuck…
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          If your desktop app doesn&apos;t come back to focus, you can close
          this tab and return to it manually.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/desktop/auth`}
        signUpUrl={`${basePath}/sign-up`}
        oauthFlow="redirect"
        forceRedirectUrl={selfUrl}
        fallbackRedirectUrl={selfUrl}
      />
    </div>
  );
}

function ClerkAuthTokenBridge() {
  const { getToken, isLoaded } = useAuth();
  useEffect(() => {
    // Web uses Clerk session cookies sent automatically by the browser, so
    // wiring a bearer-token getter on web is non-canonical and adds failure
    // modes. Only the Electron renderer (separate 127.0.0.1 origin, no shared
    // cookie jar with the hosted API) needs the explicit bearer transport.
    if (!isElectron) return;
    if (!isLoaded) return;
    const getter = async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    };
    setAuthTokenGetter(getter);
    setApiClientAuthTokenGetter(getter);
    return () => {
      setAuthTokenGetter(null);
      setApiClientAuthTokenGetter(null);
    };
  }, [getToken, isLoaded]);
  return null;
}

// Inside Electron only. The desktop app sends a short-lived Clerk sign-in
// token (minted by the hosted server and delivered through the unstuck://
// deep link) once the user has signed in inside their real OS browser. We
// exchange that ticket for an active session on the local origin so the
// whole app (main window + overlay) becomes signed-in, with Clerk's cookies
// written first-party through the /api/__clerk proxy.
function DesktopAuthTicketBridge() {
  const clerk = useClerk();
  // Dedupe: the ticket is single-use, so processing it twice (StrictMode
  // double-mount, or a main-process queue flush racing a direct send) would
  // make the second create() fail on an already-consumed token.
  const processedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const api = (window as Window & {
      electronAPI?: {
        onDesktopAuthTicket?: (
          cb: (payload: { ticket: string }) => void,
        ) => () => void;
      };
    }).electronAPI;
    if (!api?.onDesktopAuthTicket) return;
    // A cold-start deep link can deliver the ticket before clerk-js has
    // finished loading its client. Poll briefly (up to ~10s) instead of
    // dropping the single-use ticket on the first miss.
    const waitForSignIn = async () => {
      for (let i = 0; i < 100; i++) {
        if (clerk.loaded && clerk.client?.signIn) return clerk.client.signIn;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return clerk.client?.signIn ?? null;
    };
    const off = api.onDesktopAuthTicket(({ ticket }) => {
      if (!ticket) return;
      if (processedRef.current.has(ticket)) return;
      processedRef.current.add(ticket);
      void (async () => {
        // Canonical Clerk "sign in with a ticket" custom flow. We use the
        // standard SignInResource via useClerk() (NOT the experimental
        // signals useSignIn().ticket()/finalize(), which returned 200 from
        // /v1/client/sign_ins but never drove the sign-in to `complete` —
        // finalize() then threw "Cannot finalize sign-in without a created
        // session" and the app stayed signed out):
        //   1. create({ strategy: "ticket", ticket }) exchanges the
        //      short-lived sign-in token for a completed SignIn carrying a
        //      createdSessionId.
        //   2. setActive({ session }) promotes it to the active session,
        //      writing __session (first-party via /api/__clerk) and updating
        //      useUser / useAuth everywhere.
        const signIn = await waitForSignIn();
        if (!signIn) {
          console.error("[desktop-auth] Clerk never became ready; ticket dropped");
          return;
        }
        try {
          const res = await signIn.create({ strategy: "ticket", ticket });
          if (res.status === "complete" && res.createdSessionId) {
            await clerk.setActive({ session: res.createdSessionId });
          } else {
            // Not complete = unexpected for a single-step ticket sign-in
            // (e.g. expired/used token). Leave the user to retry.
            console.error(
              "[desktop-auth] ticket sign-in not complete:",
              res.status,
            );
          }
        } catch (err) {
          console.error("[desktop-auth] ticket sign-in failed", err);
        }
      })();
    });
    return off;
  }, [clerk]);
  return null;
}

// Mirrors Clerk auth state into PostHog: identify on sign-in, reset on
// sign-out, and emits $pageview on every wouter route change so SPA
// navigation shows up in funnels.
function AnalyticsBridge() {
  const { user, isLoaded } = useUser();
  const [location] = useLocation();
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const id = user?.id ?? null;
    if (id && id !== lastUserIdRef.current) {
      identifyUser(id, {
        email: user?.primaryEmailAddress?.emailAddress,
      });
    } else if (!id && lastUserIdRef.current) {
      resetUser();
    }
    lastUserIdRef.current = id;
  }, [user, isLoaded]);

  useEffect(() => {
    trackPageview(location);
  }, [location]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// Root route: the chat home only works correctly from the installed Windows
// desktop app (it needs the Electron screen-capture / overlay / hotkey APIs,
// and Clerk cookies are wired for that origin). For visitors hitting the
// hosted site in a normal browser, show the download landing page instead
// so they don't land on a half-broken chat. Inside Electron the chat home
// is still served, identifiable via the preload-injected electronAPI flag.
function RootRoute() {
  const isElectron = !!(window as Window & {
    electronAPI?: { isElectron?: boolean };
  }).electronAPI?.isElectron;
  return isElectron ? <Home /> : <DownloadPage />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/desktop/auth/*?" component={DesktopAuthPage} />
      <Route path="/" component={RootRoute} />
      <Route path="/settings" component={Settings} />
      <Route path="/upgrade" component={Upgrade} />
      <Route path="/usage" component={UsagePage} />
      <Route path="/admin/usage" component={AdminUsagePage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/download" component={DownloadPage} />
      <Route path="/library" component={LibraryPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/legal/terms" component={TermsPage} />
      <Route path="/legal/privacy" component={PrivacyPage} />
      <Route path="/legal/refund" component={RefundPage} />
      <Route path="/overlay" component={OverlayPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function WrappedAppRoutes() {
  const [location] = useLocation();
  const isAuthPage =
    location.startsWith("/sign-in") ||
    location.startsWith("/sign-up") ||
    location.startsWith("/desktop/auth");
  // Overlay renders standalone (frameless transparent window in Electron) — no
  // app chrome, no header, no padding.
  const isOverlayPage = location.startsWith("/overlay");

  if (isAuthPage || isOverlayPage) {
    return <AppRoutes />;
  }

  return (
    <Layout>
      <AnalyticsBridge />
      <AppRoutes />
    </Layout>
  );
}

function App() {
  const [, setLocation] = useLocation();

  // Render-time guard so the Sentry ErrorBoundary in main.tsx catches it
  // and shows a readable error. A top-level throw would happen before
  // React mounts and leave both Electron windows pure-black blank, with
  // no clue what failed unless the user opens DevTools.
  if (!clerkPubKey) {
    throw new Error(
      "Missing VITE_CLERK_PUBLISHABLE_KEY — the renderer was built without the Clerk publishable key. Set VITE_CLERK_PUBLISHABLE_KEY in your shell before running the build pipeline.",
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInForceRedirectUrl={postAuthRedirectUrl}
      signUpForceRedirectUrl={postAuthRedirectUrl}
      signInFallbackRedirectUrl={postAuthRedirectUrl}
      signUpFallbackRedirectUrl={postAuthRedirectUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      localization={{
        signIn: {
          start: { title: "Welcome back", subtitle: "Sign in to keep getting unstuck" },
        },
        signUp: {
          start: { title: "Create your account", subtitle: "Get unstuck in any game" },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthTokenBridge />
        <DesktopAuthTicketBridge />
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <ChatProvider>
            <GameProvider>
              <WrappedAppRoutes />
            </GameProvider>
            <Toaster />
          </ChatProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
