import { type z } from 'zod';
import { type KbIssue } from './issues';
import {
  KbCoverageSchema,
  KbDiscrepanciesSchema,
  KbEntrySchema,
  KbManifestSchema,
  type KnowledgeBase,
  type KnowledgeBaseInput,
} from './schema';

/** Thrown by `parseKnowledgeBase` when the data does not match the format; every issue is `SCHEMA_INVALID`. */
export class KnowledgeBaseParseError extends Error {
  readonly issues: readonly KbIssue[];

  constructor(issues: readonly KbIssue[]) {
    const head = issues
      .slice(0, 10)
      .map((i) => `${i.path}: ${i.message}`)
      .join('; ');
    const more = issues.length > 10 ? ` (+${issues.length - 10} more)` : '';
    super(`Invalid rules knowledge base: ${head}${more}`);
    this.name = 'KnowledgeBaseParseError';
    this.issues = issues;
  }
}

function toIssues(prefix: string, error: z.ZodError): KbIssue[] {
  return error.issues.map((issue) => ({
    code: 'SCHEMA_INVALID' as const,
    path: [prefix, ...issue.path.map((p) => String(p))].join('.'),
    message: issue.message,
  }));
}

/** Parses raw data into a `KnowledgeBase` (shape only); throws `KnowledgeBaseParseError` with all issues. */
export function parseKnowledgeBase(input: KnowledgeBaseInput): KnowledgeBase {
  const issues: KbIssue[] = [];

  const manifest = KbManifestSchema.safeParse(input.manifest);
  if (!manifest.success) issues.push(...toIssues('manifest', manifest.error));

  const entries = KbEntrySchema.array().safeParse(input.entries);
  if (!entries.success) issues.push(...toIssues('entries', entries.error));

  const coverage =
    input.coverage === undefined ? undefined : KbCoverageSchema.safeParse(input.coverage);
  if (coverage && !coverage.success) issues.push(...toIssues('coverage', coverage.error));

  const discrepancies =
    input.discrepancies === undefined
      ? undefined
      : KbDiscrepanciesSchema.safeParse(input.discrepancies);
  if (discrepancies && !discrepancies.success) {
    issues.push(...toIssues('discrepancies', discrepancies.error));
  }

  if (issues.length > 0 || !manifest.success || !entries.success) {
    throw new KnowledgeBaseParseError(issues);
  }

  const kb: KnowledgeBase = {
    manifest: manifest.data,
    entries: entries.data,
    discrepancies: discrepancies?.success ? discrepancies.data : [],
  };
  if (coverage?.success) kb.coverage = coverage.data;
  return kb;
}
