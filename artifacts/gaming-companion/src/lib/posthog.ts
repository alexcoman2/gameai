import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

let initialized = false;

export function initPostHog() {
  if (initialized || !key) return;
  // Defer pageview to manual capture in the router so we get accurate
  // SPA navigation events instead of only the initial load.
  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: "identified_only",
    autocapture: true,
  });
  initialized = true;
}

export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (!key) return;
  posthog.capture(name, props);
}

export function identifyUser(userId: string, props?: Record<string, unknown>) {
  if (!key) return;
  posthog.identify(userId, props);
}

export function resetUser() {
  if (!key) return;
  posthog.reset();
}

export function trackPageview(path: string) {
  if (!key) return;
  posthog.capture("$pageview", { $current_url: window.location.origin + path });
}

export { posthog };
export const posthogEnabled = !!key;
