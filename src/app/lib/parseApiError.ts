import type { AxiosError } from 'axios';

/**
 * Standardised API error parser.
 *
 * Extracts a user-friendly message from any Axios error shape the backend
 * might return.  Falls back to generic copy so the UI never shows raw JSON.
 */

interface ApiErrorBody {
  message?: string;
  error?: string;
  errors?: Array<{ message?: string; msg?: string; field?: string }>;
}

export interface ParsedApiError {
  /** Short, user-friendly string suitable for a toast. */
  message: string;
  /** HTTP status code, or 0 for network errors. */
  status: number;
  /** Per-field validation errors, if any. */
  fieldErrors: Record<string, string>;
}

export function parseApiError(err: unknown): ParsedApiError {
  const axiosErr = err as AxiosError<ApiErrorBody>;

  // Network error (no response at all)
  if (!axiosErr.response) {
    return {
      message: 'Network error — please check your connection and try again.',
      status: 0,
      fieldErrors: {},
    };
  }

  const { status, data } = axiosErr.response;

  // Build field-level errors
  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(data?.errors)) {
    for (const e of data.errors) {
      if (e.field) fieldErrors[e.field] = e.message || e.msg || 'Invalid';
    }
  }

  // Build user message
  let message = data?.message || data?.error || '';

  if (!message) {
    switch (status) {
      case 400: message = 'Invalid request. Please check your input.'; break;
      case 401: message = 'Session expired. Redirecting to login…'; break;
      case 403: message = 'You do not have permission to perform this action.'; break;
      case 404: message = 'The requested resource was not found.'; break;
      case 409: message = 'A conflict occurred — the item may already exist.'; break;
      case 422: message = 'Validation failed. Please correct the highlighted fields.'; break;
      case 429: message = 'Too many requests. Please wait a moment and try again.'; break;
      case 501: message = 'This feature is not yet available.'; break;
      default:  message = status >= 500
        ? 'Something went wrong on our end. Please try again later.'
        : `Request failed (${status}).`;
    }
  }

  return { message, status, fieldErrors };
}
