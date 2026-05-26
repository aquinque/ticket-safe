/**
 * Observability layer. Forwards to Sentry when VITE_SENTRY_DSN is set; otherwise
 * falls back to console logging (dev or unconfigured environments).
 *
 * Sentry.init lives in src/main.tsx so it runs before any module-level errors.
 */

import * as Sentry from "@sentry/react";

type Severity = "fatal" | "error" | "warning" | "info" | "debug";

interface Breadcrumb {
  category: string;
  message: string;
  data?: Record<string, unknown>;
  level?: Severity;
}

const sentryEnabled = Boolean(import.meta.env.VITE_SENTRY_DSN);

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (sentryEnabled) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
    return;
  }
  console.error("[dev] captureException:", error, context);
}

export function captureMessage(message: string, level: Severity = "info", context?: Record<string, unknown>): void {
  if (sentryEnabled) {
    Sentry.captureMessage(message, { level, extra: context });
    return;
  }
  console.log(`[dev:${level}]`, message, context ?? "");
}

export function addBreadcrumb(crumb: Breadcrumb): void {
  if (sentryEnabled) {
    Sentry.addBreadcrumb(crumb);
    return;
  }
  console.debug("[dev:breadcrumb]", crumb);
}

export function setUserContext(user: { id: string; email?: string } | null): void {
  if (sentryEnabled) {
    Sentry.setUser(user);
    return;
  }
  console.debug("[dev:setUser]", user);
}
