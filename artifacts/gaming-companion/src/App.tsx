import { useEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth, useSignIn } from "@clerk/react";
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
  const state = new URLSearchParams(search).get("state") ?? "";
  const selfUrl = `${window.location.origin}${basePath}/desktop/auth${
    state ? `?state=${encodeURIComponent(state)}` : ""
  }`;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const tokenUrl = `${basePath}/api/desktop/token${
      state ? `?state=${encodeURIComponent(state)}` : ""
    }`;
    window.location.href = tokenUrl;
  }, [isLoaded, isSignedIn, state]);

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
        forceRedirectUrl={selfUrl}
        fallbackRedirectUrl={selfUrl}
      />
    </div>
  );
}

function ClerkAuthTokenBridge() {
  const { getToken, isLoaded } = useAuth();
  useEffect(() => {
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
  const { signIn } = useSignIn();
  useEffect(() => {
    if (!signIn) return;
    const api = (window as Window & {
      electronAPI?: {
        onDesktopAuthTicket?: (
          cb: (payload: { ticket: string }) => void,
        ) => () => void;
      };
    }).electronAPI;
    if (!api?.onDesktopAuthTicket) return;
    const off = api.onDesktopAuthTicket(({ ticket }) => {
      if (!ticket) return;
      void (async () => {
        // Signal-based custom flow: ticket() drives the SignIn resource to
        // `complete`, then finalize() promotes it to the active session
        // (updating useUser / useAuth everywhere). Errors are returned, not
        // thrown — an expired/used ticket just leaves the user to retry.
        const { error } = await signIn.ticket({ ticket });
        if (error) return;
        if (signIn.status === "complete") {
          await signIn.finalize();
        }
      })();
    });
    return off;
  }, [signIn]);
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
