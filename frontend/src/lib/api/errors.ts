// Single translation point from a Worker error response to operator-facing wording.
//
// Mapping rules come from the verified backend contract, not from guesswork:
//   - No handler returns 500 deliberately. Every router's `onError` returns 503 with a
//     router-specific message, and authorization outages return 503 too. 503 is therefore the
//     retryable "server had a problem" case, not a maintenance window.
//   - Ownership and scope failures deliberately answer 404 ("Product unavailable",
//     "Order unavailable", ...) so a foreign record is indistinguishable from a missing one.
//     That means 404 must never be shown as "deleted".
//   - An unmatched route returns Hono's plain-text 404, so there is no JSON `error` field to
//     read and `ApiError.message` falls back to "API request failed (404)".
//   - A forced-password-change account receives 403 ADMIN_PASSWORD_CHANGE_REQUIRED on every
//     route except `GET /api/me` and the initial-password endpoint.
import { ApiError } from "./client";

/** What the caller was doing, so 404 and 403 can be phrased correctly. */
export type ErrorContext = "list" | "record" | "mutation" | "session";

export type ErrorKind =
  | "auth"
  | "permission"
  | "password-change"
  | "missing"
  | "conflict"
  | "validation"
  | "throttled"
  | "server"
  | "network";

export interface DescribedError {
  kind: ErrorKind;
  /** Short heading, safe for an alert region. */
  title: string;
  /** One sentence in plain operator language. No database or HTTP vocabulary. */
  message: string;
  /** True when retrying the same request could reasonably succeed. */
  retryable: boolean;
  /** True when the session is gone and the sign-in form should be shown. */
  signedOut: boolean;
  /** True when the Admin must complete the forced initial password change first. */
  passwordChangeRequired: boolean;
  /** Seconds the server asked us to wait, when it supplied `Retry-After`. */
  retryAfterSeconds?: number;
  /** The server's own wording, kept when it is specific enough to be worth showing. */
  detail?: string;
}

/**
 * Backend codes that are not human sentences. Everything else from the server is already
 * operator-readable prose and is surfaced verbatim.
 */
const CODE_MESSAGES: Record<string, string> = {
  ADMIN_PASSWORD_CHANGE_REQUIRED: "Set a permanent password before continuing.",
  INVENTORY_VERSION_STALE:
    "Inventory was updated somewhere else. Refresh and try again.",
  INVENTORY_VERSION_REQUIRED:
    "Refresh this page to load the current stock figure, then save again.",
  ADMIN_LIFECYCLE_UNAVAILABLE:
    "Account requests are temporarily unavailable. Try again shortly.",
  RECOVERY_DECISION_CONFLICT:
    "This request was already decided. Refresh to see its current state.",
  INVALID_LIFECYCLE_BODY: "Some required details are missing or invalid.",
  INVALID_LIFECYCLE_ID: "That request reference is not valid.",
  INVALID_LIFECYCLE_DECISION: "Choose a valid decision.",
  INVALID_RECOVERY_CATEGORIES:
    "Select the selling categories to restore with this account.",
};

/** A generic client fallback has no useful server wording behind it. */
const isGenericFallback = (message: string) =>
  /^API request failed \(\d+\)$/.test(message);

function serverDetail(error: ApiError): string | undefined {
  if (!error.message || isGenericFallback(error.message)) return undefined;
  return CODE_MESSAGES[error.message] ?? error.message;
}

const MISSING_BY_CONTEXT: Record<ErrorContext, string> = {
  list: "This information is not available to your account.",
  record:
    "That record is not available to your account. It may belong to another seller, or the reference may be wrong.",
  mutation:
    "That record is not available to your account, so the change was not saved.",
  session: "That account is not available.",
};

const PERMISSION_BY_CONTEXT: Record<ErrorContext, string> = {
  list: "You do not have access to this information.",
  record: "You do not have access to this record.",
  mutation: "You are not allowed to perform this action.",
  session: "This workspace is not available to your account.",
};

/**
 * Translates any thrown value into operator-facing wording.
 *
 * `context` only affects phrasing — it never changes whether something is treated as an error.
 */
export function describeApiError(
  error: unknown,
  context: ErrorContext = "list",
): DescribedError {
  if (!(error instanceof ApiError)) {
    // Network failure, an aborted request, or the missing-API-URL configuration error.
    return {
      kind: "network",
      title: "Could not reach the server",
      message:
        "Check your connection and try again. Nothing was saved if you were making a change.",
      retryable: true,
      signedOut: false,
      passwordChangeRequired: false,
      detail: error instanceof Error ? error.message : undefined,
    };
  }

  const detail = serverDetail(error);

  if (error.status === 401)
    return {
      kind: "auth",
      title: "Sign in required",
      message: "Your session has ended. Sign in to continue.",
      retryable: false,
      signedOut: true,
      passwordChangeRequired: false,
    };

  if (error.status === 403) {
    if (error.message === "ADMIN_PASSWORD_CHANGE_REQUIRED")
      return {
        kind: "password-change",
        title: "Set a permanent password",
        message:
          "Your account still uses the temporary password. Set a permanent one to continue.",
        retryable: false,
        signedOut: false,
        passwordChangeRequired: true,
      };

    if (error.message === "Account unavailable")
      return {
        kind: "permission",
        title: "Account unavailable",
        message:
          "This account cannot be used right now. Contact the platform owner if you think this is wrong.",
        retryable: false,
        signedOut: false,
        passwordChangeRequired: false,
      };

    if (error.message === "Category is outside Admin scope")
      return {
        kind: "permission",
        title: "Category not assigned",
        message:
          "You can only work in the selling categories assigned to your account.",
        retryable: false,
        signedOut: false,
        passwordChangeRequired: false,
      };

    return {
      kind: "permission",
      title: "Not permitted",
      message: PERMISSION_BY_CONTEXT[context],
      retryable: false,
      signedOut: false,
      passwordChangeRequired: false,
      detail: error.message === "Forbidden" ? undefined : detail,
    };
  }

  if (error.status === 404)
    return {
      kind: "missing",
      title: "Not available",
      message: MISSING_BY_CONTEXT[context],
      retryable: false,
      signedOut: false,
      passwordChangeRequired: false,
      detail,
    };

  if (error.status === 409)
    return {
      kind: "conflict",
      title: "Changed somewhere else",
      message:
        detail ??
        "This record changed since you loaded it. Refresh and try again.",
      retryable: false,
      signedOut: false,
      passwordChangeRequired: false,
    };

  if (error.status === 422 || error.status === 400)
    return {
      kind: "validation",
      title: "Check the details",
      message: detail ?? "Some details are missing or invalid.",
      retryable: false,
      signedOut: false,
      passwordChangeRequired: false,
    };

  if (error.status === 413 || error.status === 415)
    return {
      kind: "validation",
      title: "File not accepted",
      message:
        detail ??
        "That file is too large or not a supported type. Use a PDF, JPEG or PNG under 5 MB.",
      retryable: false,
      signedOut: false,
      passwordChangeRequired: false,
    };

  if (error.status === 429) {
    const wait = error.retryAfterSeconds;
    return {
      kind: "throttled",
      title: "Too many attempts",
      message:
        wait && wait > 0
          ? `Too many requests. Wait ${wait} second${wait === 1 ? "" : "s"} and try again.`
          : "Too many requests. Wait a moment and try again.",
      retryable: true,
      signedOut: false,
      passwordChangeRequired: false,
      retryAfterSeconds: wait,
    };
  }

  // 503 is the deliberate server-side failure code across every router; 500/502 can only come
  // from an unexpected escape or an upstream hop. All are retryable from the operator's side.
  if (error.status >= 500)
    return {
      kind: "server",
      title: "Temporarily unavailable",
      message:
        "The server could not complete this request. Try again in a moment.",
      retryable: true,
      signedOut: false,
      passwordChangeRequired: false,
      retryAfterSeconds: error.retryAfterSeconds,
      detail,
    };

  return {
    kind: "server",
    title: "Something went wrong",
    message: detail ?? "The request could not be completed.",
    retryable: true,
    signedOut: false,
    passwordChangeRequired: false,
  };
}

/** Convenience for inline messages where only one sentence is rendered. */
export const apiErrorMessage = (
  error: unknown,
  context: ErrorContext = "list",
) => describeApiError(error, context).message;
