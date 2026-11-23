/**
 * SWR-010 FE-B (plan-frontend §4.2, §4.3; TC-PX-04/05/09 at component level): CONFIRM_TABLE_TASK through the real
 * `useSendCommand` (`mockFetch`): one POST for a double click, the head's id and the cached `expectedVersion`, 422 →
 * inline error, 409 → snackbar (no inline text), success → next head + announcement.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedbackStore } from '@/shared/feedback';
import type { MockReply } from '@/shared/test';
import { aiActivationTask, aiMoveTask, makePhysicalRebelsView } from '../../test/tableFixtures';
import { PX_TITLE_ID } from '../panels/focus';
import {
  CMD_PATH,
  commandsOf,
  ok,
  rejected,
  renderCore,
  resetCoreStores,
} from '../panels/test/harness';
import { useTableErrorStore } from './model/tableErrorStore';
import { PhysicalExecutionPanel } from './PhysicalExecutionPanel';
import { TableTaskKeys } from './TableTaskKeys';
import { useTableCommands } from './useTableCommands';

beforeEach(() => {
  resetCoreStores();
  useTableErrorStore.getState().clear();
});

const twoTasks = () =>
  makePhysicalRebelsView({
    unregistered: false,
    aiWaiting: true,
    tasks: [aiActivationTask(), aiMoveTask()],
  });

/** A command route whose reply waits until `release()` is called. */
function gated(reply: MockReply) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return { handler: async () => (await gate, reply), release: () => release() };
}

function renderPx(view = twoTasks(), reply: MockReply | (() => Promise<MockReply>)) {
  return renderCore(
    <>
      <PhysicalExecutionPanel />
      <TableTaskKeys />
    </>,
    view,
    { [CMD_PATH]: reply },
  );
}

describe('useTableCommands — CONFIRM_TABLE_TASK (AC-21, AC-12)', () => {
  it('TC-PX-04: a double click sends exactly one command with the head id and the cached version', async () => {
    const view = twoTasks();
    const next = makePhysicalRebelsView({
      unregistered: false,
      aiWaiting: true,
      tasks: [aiMoveTask()],
    });
    const route = gated(ok({ ...next, version: view.version + 1 }));
    const { api } = renderPx(view, route.handler);
    const key = await screen.findByTestId('table-task-confirm');
    fireEvent.click(key);
    fireEvent.click(key);
    await waitFor(() => expect(key).toBeDisabled());
    expect(key).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(key);
    route.release();
    await waitFor(() =>
      expect(screen.getByTestId('physical-execution')).toHaveAttribute('data-head-kind', 'aiMove'),
    );
    const posts = api.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toMatchObject({
      actor: 'rebels',
      expectedVersion: view.version,
      command: { type: 'CONFIRM_TABLE_TASK', taskId: 't-5-1' },
    });
    // The new head gets the focus and the response is read out.
    await waitFor(() => expect(document.activeElement?.id).toBe(PX_TITLE_ID));
    expect(useFeedbackStore.getState().live?.text).toContain(
      'Следующая задача стола: AI переместил юниты.',
    );
  });

  it('TC-PX-05: two synchronous confirms (click + Enter before the re-render) → one request', async () => {
    const view = twoTasks();
    const route = gated(ok({ ...view, version: view.version + 1 }));
    function DoubleConfirm() {
      const { confirm } = useTableCommands();
      useEffect(() => {
        void confirm();
        void confirm();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return null;
    }
    const { api } = renderCore(<DoubleConfirm />, view, { [CMD_PATH]: route.handler });
    await waitFor(() => expect(commandsOf(api.requests)).toHaveLength(1));
    route.release();
    await new Promise((r) => setTimeout(r, 50));
    expect(commandsOf(api.requests)).toHaveLength(1);
  });

  it('422 → inline text under the head task (role=alert), no snackbar', async () => {
    const { user } = renderPx(twoTasks(), rejected('errors.tableTaskNotFound'));
    await user.click(await screen.findByTestId('table-task-confirm'));
    const error = await screen.findByTestId('table-task-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error.textContent).not.toContain('errors.');
    expect(useFeedbackStore.getState().queue).toHaveLength(0);
    expect(screen.getByTestId('table-task-confirm')).toBeEnabled();
  });

  it('409 (stale version) → snackbar, no inline error, no second request', async () => {
    const { user, api } = renderPx(twoTasks(), {
      status: 409,
      body: {
        ok: false,
        error: { code: 'VERSION_CONFLICT', messageKey: 'errors.versionConflict' },
      },
    });
    await user.click(await screen.findByTestId('table-task-confirm'));
    await waitFor(() => expect(useFeedbackStore.getState().queue).toHaveLength(1));
    expect(screen.queryByTestId('table-task-error')).toBeNull();
    expect(commandsOf(api.requests)).toHaveLength(1);
  });

  it('the last task confirmed → «Стол синхронизирован», no new head', async () => {
    const view = makePhysicalRebelsView({ unregistered: false, tasks: [aiActivationTask()] });
    const after = makePhysicalRebelsView(
      { unregistered: false, tasks: [] },
      { version: view.version + 1 },
    );
    const { user } = renderPx(view, ok(after));
    await user.click(await screen.findByTestId('table-task-confirm'));
    await waitFor(() =>
      expect(useFeedbackStore.getState().live?.text).toContain('Стол синхронизирован.'),
    );
    expect(useFeedbackStore.getState().live?.text).toContain(
      'Выполнено на столе: AI активировал систему.',
    );
  });
});
