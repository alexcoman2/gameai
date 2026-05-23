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

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
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

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/" component={Home} />
      <Route path="/settings" component={Settings} />
      <Route path="/upgrade" component={Upgrade} />
      <Route path="/usage" component={UsagePage} />
      <Route path="/admin/usage" component={AdminUsagePage} />
      <Route path="/about" component={AboutPage} />
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
  const isAuthPage = location.startsWith("/sign-in") || location.startsWith("/sign-up");
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
