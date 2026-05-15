/**
 * Minimal observability layer.
 *
 * Today: forwards captured errors to the browser console (no external service).
 * Tomorrow (when you have a Sentry/PostHog/Datadog account): replace the body of
 * captureException + addBreadcrumb with the SDK's calls. Nothing else in the app
 * needs to change.
 *
 * Set VITE_SENTRY_DSN in your environment, install @sentry/react, and uncomment
 * the Sentry block at the bottom. Until then, errors still get logged locally.
 */

type Severity = "fatal" | "error" | "warning" | "info" | "debug";

interface Breadcrumb {
  category: string;
  message: string;
  data?: Record<string, unknown>;
  level?: Severity;
}

const inProd = import.meta.env.PROD;

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (inProd) {
    // TODO(observability): swap for Sentry.captureException(error, { extra: context })
    console.error("[observability] captureException:", error, context);
  } else {
    console.error("[dev] captureException:", error, context);
  }
}

export function captureMessage(message: string, level: Severity = "info", context?: Record<string, unknown>): void {
  if (inProd) {
    // TODO(observability): swap for Sentry.captureMessage(message, { level, extra: context })
    console.log(`[observability:${level}]`, message, context ?? "");
  } else {
    console.log(`[dev:${level}]`, message, context ?? "");
  }
}

export function addBreadcrumb(crumb: Breadcrumb): void {
  if (inProd) {
    // TODO(observability): swap for Sentry.addBreadcrumb(crumb)
    return;
  }
  console.debug("[dev:breadcrumb]", crumb);
}

export function setUserContext(user: { id: string; email?: string } | null): void {
  if (inProd) {
    // TODO(observability): swap for Sentry.setUser(user)
    return;
  }
  console.debug("[dev:setUser]", user);
}

/*
 * Activation guide (do this when you sign up for Sentry):
 *
 * 1. npm i @sentry/react
 * 2. Create a Sentry project, copy the DSN
 * 3. Add VITE_SENTRY_DSN=https://... to your .env
 * 4. In src/main.tsx, before ReactDOM.render:
 *
 *      import * as Sentry from "@sentry/react";
 *      Sentry.init({
 *        dsn: import.meta.env.VITE_SENTRY_DSN,
 *        environment: import.meta.env.MODE,
 *        tracesSampleRate: 0.1,
 *        replaysSessionSampleRate: 0,
 *        replaysOnErrorSampleRate: 1.0,
 *      });
 *
 * 5. Replace the four `console.*` calls in this file with Sentry equivalents.
 *    All call sites (ErrorBoundary, useChat, etc.) keep working unchanged.
 */
