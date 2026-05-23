import * as Sentry from "@sentry/node";

const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export { Sentry };
export const sentryEnabled = !!dsn;
