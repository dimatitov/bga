import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionEventRecord, SessionStatus } from '@bga/platform';
import { PrismaService } from '../persistence/prisma.service';

export interface SessionRow {
  id: string;
  gameId: string;
  /** JSON text of the stored setup (any stored version; the game module upcasts it). */
  setup: string;
  state: string;
  version: number;
  /** Raw `Session.status` text; the service validates it with `SessionStatusSchema` (invalid → 500). */
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** `Idempotency-Key` of the creating POST and the SHA-256 of its canonical body (Q-2, Q-25). */
export interface IdempotencyRecord {
  key: string;
  hash: string;
}

/** A session row found by its idempotency key (the hash decides replay vs 409). */
export interface IdempotentSessionRow extends SessionRow {
  idempotencyHash: string | null;
}

export interface NewSession {
  id: string;
  gameId: string;
  /** JSON text of the parsed setup. */
  setup: string;
  /** JSON text of the full state — never sent to clients. */
  state: string;
  version: number;
  /** Initial `SessionStatus` chosen by the game module. */
  status: SessionStatus;
  /** Stored only together with a successfully created session (Q-3); null = no key sent. */
  idempotency: IdempotencyRecord | null;
  events: readonly SessionEventRecord[];
  now: string;
}

/** `IDEMPOTENCY_KEY_TAKEN`: another request created a session with the same key first (lost race, Q-4). */
export type InsertOutcome = { ok: true } | { ok: false; reason: 'IDEMPOTENCY_KEY_TAKEN' };

export interface SessionUpdate {
  id: string;
  expectedVersion: number;
  /** JSON text of the setup in the current stored form, rewritten with every state write (review #1). */
  setup: string;
  state: string;
  version: number;
  /** `module.statusOf(newState)` (SWR-005, AM-BE-1), written in the same `updateMany` as the state. */
  status: SessionStatus;
  events: readonly SessionEventRecord[];
  now: string;
}

export type CommitOutcome = { ok: true } | { ok: false; reason: 'VERSION_CONFLICT' };

/** Thrown inside the transaction to roll it back when the optimistic version guard fails. */
class VersionConflictSignal extends Error {}

const ROW_SELECT = {
  id: true,
  gameId: true,
  setup: true,
  state: true,
  version: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function eventRows(
  sessionId: string,
  events: readonly SessionEventRecord[],
): Prisma.SessionEventCreateManyInput[] {
  return events.map((e) => ({
    sessionId,
    seq: e.seq,
    type: e.type,
    actor: e.actor,
    payload: JSON.stringify(e.payload),
    createdAt: new Date(e.at),
  }));
}

/**
 * The ONLY place with Prisma access to Session / SessionEvent (TC-SES-15).
 * `Session.state` (JSON) is the source of truth; `SessionEvent` rows are an append-only mirror of the
 * game's event log, written in the same transaction as the snapshot.
 */
@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Session + its initial events in ONE transaction (all or nothing). A unique violation (P2002) is reported
   * as `IDEMPOTENCY_KEY_TAKEN` only when a row with the same idempotency key really exists afterwards
   * (the error's `meta.target` format is not relied upon); any other failure is rethrown (→ 500).
   */
  async insert(session: NewSession): Promise<InsertOutcome> {
    const at = new Date(session.now);
    try {
      await this.prisma.$transaction([
        this.prisma.session.create({
          data: {
            id: session.id,
            gameId: session.gameId,
            setup: session.setup,
            state: session.state,
            version: session.version,
            status: session.status,
            idempotencyKey: session.idempotency?.key ?? null,
            idempotencyHash: session.idempotency?.hash ?? null,
            createdAt: at,
            updatedAt: at,
          },
        }),
        this.prisma.sessionEvent.createMany({ data: eventRows(session.id, session.events) }),
      ]);
      return { ok: true };
    } catch (error) {
      const key = session.idempotency?.key;
      if (
        key !== undefined &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (await this.findByIdempotencyKey(key)) !== null
      ) {
        return { ok: false, reason: 'IDEMPOTENCY_KEY_TAKEN' };
      }
      throw error;
    }
  }

  findByIdempotencyKey(key: string): Promise<IdempotentSessionRow | null> {
    return this.prisma.session.findUnique({
      where: { idempotencyKey: key },
      select: { ...ROW_SELECT, idempotencyHash: true },
    });
  }

  findById(id: string): Promise<SessionRow | null> {
    return this.prisma.session.findUnique({ where: { id }, select: ROW_SELECT });
  }

  async currentVersion(id: string): Promise<number | null> {
    const row = await this.prisma.session.findUnique({ where: { id }, select: { version: true } });
    return row?.version ?? null;
  }

  /** Most recently updated first (ties: id desc), optionally of one game. */
  listRecent(limit: number, gameId?: string): Promise<SessionRow[]> {
    return this.prisma.session.findMany({
      where: gameId === undefined ? {} : { gameId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: ROW_SELECT,
    });
  }

  /**
   * Atomic commit with optimistic concurrency: `updateMany WHERE id AND version = expected`;
   * `count === 0` → rollback → VERSION_CONFLICT. New event rows go into the same transaction.
   * `setup` is rewritten together with `state` (review #1: an upcast v1 row becomes v2 on its first write);
   * so is `status` (SWR-005): a lost race rolls back state, setup, status and events together.
   */
  async commit(update: SessionUpdate): Promise<CommitOutcome> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.session.updateMany({
          where: { id: update.id, version: update.expectedVersion },
          data: {
            setup: update.setup,
            state: update.state,
            version: update.version,
            status: update.status,
            updatedAt: new Date(update.now),
          },
        });
        if (count === 0) throw new VersionConflictSignal();
        if (update.events.length > 0) {
          await tx.sessionEvent.createMany({ data: eventRows(update.id, update.events) });
        }
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof VersionConflictSignal) return { ok: false, reason: 'VERSION_CONFLICT' };
      // @@unique([sessionId, seq]) is a second guard against a lost race.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { ok: false, reason: 'VERSION_CONFLICT' };
      }
      throw error;
    }
  }
}
