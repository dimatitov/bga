/**
 * SWR-004 repository contract (plan-backend §2.3): status persisted as passed, idempotency key stored with the
 * session, unique violation on the key → `IDEMPOTENCY_KEY_TAKEN` with the whole transaction rolled back.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionsRepository, type NewSession } from '../src/sessions/sessions.repository';
import { prismaOf } from './support/fixtures';
import { fakeGameDefinition, fakeGameModule } from './support/fake-game';
import { createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

const NOW = '2026-01-01T00:00:00.000Z';

function newSession(overrides: Partial<NewSession> = {}): NewSession {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    gameId: fakeGameDefinition.id,
    setup: '{"start":0}',
    state: JSON.stringify({ id, count: 0, version: 1 }),
    version: 1,
    status: 'prototype',
    idempotency: null,
    events: [{ seq: 1, type: 'STARTED', actor: 'player', at: NOW, payload: {} }],
    now: NOW,
    ...overrides,
  };
}

describe('SessionsRepository (SWR-004)', () => {
  let db: TestDb;
  let app: INestApplication;
  let repo: SessionsRepository;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url, {
      gameModules: [fakeGameModule],
      gameDefinitions: [fakeGameDefinition],
    });
    repo = app.get(SessionsRepository);
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  it('insert stores status and idempotency key/hash; findById / listRecent / findByIdempotencyKey return status', async () => {
    const key = randomUUID();
    const s = newSession({ status: 'completed', idempotency: { key, hash: 'h1' } });
    expect(await repo.insert(s)).toEqual({ ok: true });

    const row = await repo.findById(s.id);
    expect(row).toMatchObject({ id: s.id, status: 'completed', setup: s.setup, version: 1 });
    expect(row).not.toHaveProperty('idempotencyKey');
    expect((await repo.listRecent(10))[0]).toMatchObject({ id: s.id, status: 'completed' });

    const byKey = await repo.findByIdempotencyKey(key);
    expect(byKey).toMatchObject({ id: s.id, status: 'completed', idempotencyHash: 'h1' });
    expect(await repo.findByIdempotencyKey(randomUUID())).toBeNull();
  });

  it('a second insert with the same key → IDEMPOTENCY_KEY_TAKEN; nothing of it is stored (rollback)', async () => {
    const key = randomUUID();
    const first = newSession({ idempotency: { key, hash: 'h1' } });
    await repo.insert(first);
    const second = newSession({
      idempotency: { key, hash: 'h2' },
      events: [
        { seq: 1, type: 'STARTED', actor: 'player', at: NOW, payload: {} },
        { seq: 2, type: 'STARTED', actor: 'player', at: NOW, payload: {} },
      ],
    });
    expect(await repo.insert(second)).toEqual({ ok: false, reason: 'IDEMPOTENCY_KEY_TAKEN' });

    const prisma = prismaOf(app);
    expect(await prisma.session.count()).toBe(1);
    expect(await prisma.sessionEvent.count()).toBe(1);
    expect(await repo.findById(second.id)).toBeNull();
    expect((await repo.findByIdempotencyKey(key))?.idempotencyHash).toBe('h1');
  });

  it('many sessions without a key (NULL is not unique-constrained)', async () => {
    for (let i = 0; i < 3; i++) expect(await repo.insert(newSession())).toEqual({ ok: true });
    const rows = await prismaOf(app).session.findMany();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.idempotencyKey === null && r.idempotencyHash === null)).toBe(true);
  });

  it('a unique violation that is not about the key (duplicate id) is rethrown, with or without a key', async () => {
    const s = newSession();
    await repo.insert(s);
    await expect(repo.insert(newSession({ id: s.id }))).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      repo.insert(newSession({ id: s.id, idempotency: { key: randomUUID(), hash: 'x' } })),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await prismaOf(app).session.count()).toBe(1);
  });

  it('commit keeps status and idempotency columns untouched; rewrites setup with state (review #1)', async () => {
    const key = randomUUID();
    const s = newSession({ status: 'active', idempotency: { key, hash: 'h' } });
    await repo.insert(s);
    expect(
      await repo.commit({
        id: s.id,
        expectedVersion: 1,
        setup: '{"start":0,"mode":"normal","v":2}',
        state: JSON.stringify({ id: s.id, count: 1, version: 2 }),
        version: 2,
        events: [{ seq: 2, type: 'INCREMENTED', actor: 'player', at: NOW, payload: {} }],
        now: NOW,
      }),
    ).toEqual({ ok: true });
    const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: s.id } });
    expect(row).toMatchObject({
      version: 2,
      setup: '{"start":0,"mode":"normal","v":2}',
      status: 'active',
      idempotencyKey: key,
      idempotencyHash: 'h',
    });
  });
});
