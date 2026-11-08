import type { z } from 'zod';

/** One schema violation, as sent in `error.details.issues` of a 400 VALIDATION response. */
export interface ValidationIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

/** Zod issues → transport form (symbols in paths become strings); `prefix` is prepended to every path. */
export function toValidationIssues(
  error: z.ZodError,
  prefix: (string | number)[] = [],
): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [...prefix, ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))],
    code: issue.code,
    message: issue.message,
  }));
}
