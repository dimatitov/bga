import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GameEvent, GameState } from '@swr/contracts';
import { PrismaService } from '../persistence/prisma.service';

export interface GameRow {
  id: string;
  state: string;
  version: number;
  updatedAt: Date;
}

export type CommitOutcome = { ok: true } | { ok: false; reason: 'VERSION_CONFLICT' };

/** Thrown inside the transaction to roll it back when the optimistic version guard fails. */
class VersionConflictSignal extends Error {}

function eventRows(gameId: string, events: GameEvent[]): Prisma.GameEventCreateManyInput[] {
  return events.map((e) => ({
    gameId,
    seq: e.seq,
    type: e.type,
    actor: e.actor,
    payload: JSON.stringify(e.payload),
    createdAt: new Date(e.at),
  }));
}

/**
 * The ONLY place with Prisma access to Game / GameEvent (TC-ARCH-06).
 * `Game.state` (full GameState, JSON) is the source of truth; `GameEvent` rows are an
 * append-only mirror of `state.log`, written in the same transaction (A-15).
 */
@Injectable()
export class GamesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertGame(state: GameState, now: string): Promise<void> {
    const at = new Date(now);
    await this.prisma.$transaction([
      this.prisma.game.create({
        data: {
          id: state.id,
          setup: JSON.stringify(state.setup),
          state: JSON.stringify(state),
          version: state.version,
          createdAt: at,
          updatedAt: at,
        },
      }),
      this.prisma.gameEvent.createMany({ data: eventRows(state.id, state.log) }),
    ]);
  }

  findById(id: string): Promise<GameRow | null> {
    return this.prisma.game.findUnique({
      where: { id },
      select: { id: true, state: true, version: true, updatedAt: true },
    });
  }

  async currentVersion(id: string): Promise<number | null> {
    const row = await this.prisma.game.findUnique({ where: { id }, select: { version: true } });
    return row?.version ?? null;
  }

  /** Most recently updated first (A-18). */
  listRecent(limit: number): Promise<GameRow[]> {
    return this.prisma.game.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, state: true, version: true, updatedAt: true },
    });
  }

  /**
   * Atomic commit with optimistic concurrency (plan-backend §6.4, D-6):
   * `updateMany WHERE id AND version = expected`; `count === 0` → rollback → VERSION_CONFLICT.
   * New GameEvent rows are inserted in the same transaction.
   */
  async commitCommand(
    gameId: string,
    expectedVersion: number,
    next: GameState,
    events: GameEvent[],
    now: string,
  ): Promise<CommitOutcome> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.game.updateMany({
          where: { id: gameId, version: expectedVersion },
          data: { state: JSON.stringify(next), version: next.version, updatedAt: new Date(now) },
        });
        if (count === 0) throw new VersionConflictSignal();
        if (events.length > 0) {
          await tx.gameEvent.createMany({ data: eventRows(gameId, events) });
        }
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof VersionConflictSignal) return { ok: false, reason: 'VERSION_CONFLICT' };
      // @@unique([gameId, seq]) is a second guard against a lost race.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { ok: false, reason: 'VERSION_CONFLICT' };
      }
      throw error;
    }
  }
}
