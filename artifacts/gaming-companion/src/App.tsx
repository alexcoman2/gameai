import { useEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Settings from "@/pages/settings";
import { Layout } from "@/components/layout";
import { ChatProvider } from "@/context/chat-context";
import { GameProvider } from "@/context/game-context";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      />
    </div>
  );
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
      <Route component={NotFound} />
    </Switch>
  );
}

function WrappedAppRoutes() {
  const [location] = useLocation();
  const isAuthPage = location.startsWith("/sign-in") || location.startsWith("/sign-up");

  if (isAuthPage) {
    return <AppRoutes />;
  }

  return (
    <Layout>
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
