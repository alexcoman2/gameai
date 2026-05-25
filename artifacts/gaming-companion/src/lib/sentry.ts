import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Filter out well-known third-party noise that has nothing to do
    // with our code. These fire on every site on the internet and just
    // burn through our Sentry quota + page on-call for no reason.
    ignoreErrors: [
      // Microsoft Outlook SafeLink crawler / Office365 link scanner
      // injects an Object.update call when it pre-fetches URLs shared
      // in emails. Throws "Object Not Found Matching Id:N, MethodName:
      // update, ParamCount:4" on every page it visits.
      /Object Not Found Matching Id:\d+, MethodName:update, ParamCount:\d+/,
      // Browser extensions occasionally throw these inside our page
      // context. Not our bug, not actionable.
      /Non-Error promise rejection captured with value: Object Not Found Matching Id/,
      // ResizeObserver loop benign warning — fires when an observer
      // callback triggers another layout. Spec says browsers should
      // suppress; some still surface it. Cosmetic only.
      /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
      // Network errors from ad-blockers / privacy extensions canceling
      // our analytics requests. We don't need to know.
      /Failed to fetch.*posthog/i,
    ],
    denyUrls: [
      // Browser extension scripts running in our origin.
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
      /safari-extension:\/\//,
    ],
  });
}

export { Sentry };
export const sentryEnabled = !!dsn;
