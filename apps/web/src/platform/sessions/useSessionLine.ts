import type { SessionStatus, SessionSummary } from '@bga/platform';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionLinePart, WebGameEntry } from '@/games/registry';
import { formatAbsoluteDate, formatRelativeTime } from './formatRelativeTime';

/** Session line data for "Continue"/"Recent" (SWR-004 AM-FE-9; status for the platform status chip). */
export interface SessionLine {
  /** Parts from the game (`describeSession` → parts); `[]` when the game returned a string or nothing. */
  parts: readonly SessionLinePart[];
  /** Game description as one string (string result, or parts joined by « · »); `''` → generic text. */
  description: string;
  /** Relative time of `updatedAt` («5 мин. назад»). */
  time: string;
  /** `updatedAt` as sent by the server (ISO, for `<time dateTime>`). */
  iso: string;
  /** Absolute `updatedAt` in the current language (`<time title>`, «8 нояб. 2026 г., 10:05»). */
  absolute: string;
  /** Platform lifecycle status (`SessionSummary.status`). */
  status: SessionStatus;
  /** Full one-line text: `gamePage:session.line` (description · time) or `gamePage:session.generic`. */
  text: string;
}

/** Separator of parts (same as `gamePage:session.line`). */
export const SESSION_LINE_SEPARATOR = ' · ';

const PART_KEY = /^[a-z][a-z0-9-]*$/;

function normalizeParts(value: unknown): SessionLinePart[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is SessionLinePart =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as SessionLinePart).key === 'string' &&
      PART_KEY.test((p as SessionLinePart).key) &&
      typeof (p as SessionLinePart).text === 'string' &&
      (p as SessionLinePart).text !== '',
  );
}

/**
 * Session line for "Continue" and "Recent" (D-GP-3..5, Q-13; SWR-004 AM-FE-9): the game's
 * `describeSession(summary)` (string or parts) + relative time; without `describeSession` (or when it throws /
 * returns `''` / `[]`) — the generic "Session · updated N ago".
 */
export function useSessionLine(
  entry: WebGameEntry,
  options: { now?: () => number } = {},
): (summary: SessionSummary) => SessionLine {
  const { t, i18n } = useTranslation();
  const { describeSession } = entry;
  const language = i18n.language;
  const { now } = options;
  return useCallback(
    (summary: SessionSummary) => {
      const time = formatRelativeTime(summary.updatedAt, language, {
        justNow: t('common:time.justNow'),
        now: now?.(),
      });
      let parts: SessionLinePart[] = [];
      let description = '';
      if (describeSession) {
        try {
          const result: unknown = describeSession(summary, t);
          if (typeof result === 'string') description = result;
          else {
            parts = normalizeParts(result);
            description = parts.map((p) => p.text).join(SESSION_LINE_SEPARATOR);
          }
        } catch {
          parts = [];
          description = '';
        }
      }
      const text = description
        ? t('gamePage:session.line', { text: description, time })
        : t('gamePage:session.generic', { time });
      return {
        parts,
        description,
        time,
        iso: summary.updatedAt,
        absolute: formatAbsoluteDate(summary.updatedAt, language),
        status: summary.status,
        text,
      };
    },
    [describeSession, language, now, t],
  );
}
