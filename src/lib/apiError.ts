/**
 * One place that turns a thrown pipeline error into the public API shape.
 * Pure and dependency-light so it can be unit-tested without the route, and so
 * bad input NEVER leaks a 500: anything unrecognised maps to a friendly 502.
 */
import { BadUrlError } from './url';
import { BlockedUrlError } from './ssrf';
import { FetchPageError } from './fetchPage';
import { CappedError, ThinPageError } from './pipeline';
import type { ApiError } from './types';

export type MappedError = { code: ApiError['code']; error: string; status: number };

export function apiErrorFor(err: unknown): MappedError {
  if (err instanceof BadUrlError) return { code: 'bad_url', error: err.message, status: 400 };
  if (err instanceof BlockedUrlError) return { code: 'blocked', error: err.message, status: 400 };
  if (err instanceof FetchPageError) return { code: 'fetch', error: err.message, status: 502 };
  if (err instanceof ThinPageError) return { code: 'thin', error: err.message, status: 422 };
  if (err instanceof CappedError) return { code: 'capped', error: err.message, status: 503 };
  return { code: 'llm', error: 'Our judgement circuits tripped. Try again in a sec.', status: 502 };
}
