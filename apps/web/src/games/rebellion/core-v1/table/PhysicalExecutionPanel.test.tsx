/**
 * SWR-010 FE-B (plan-frontend §11.1; TC-PX-10, TC-PX-01/08 at component level): the Physical Execution module — three
 * blocks, numbered steps, a named region, the waiting status in text, next tasks, and no opponent secrets in the DOM.
 */
import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { cardsView } from '../../test/cardFixtures';
import { makeCoreOutcomeView } from '../../test/coreFixtures';
import {
  aiActivationTask,
  aiMoveIntoBaseTask,
  aiMoveTask,
  CORE_PHYSICAL_REBELS,
  initialRebelsTasks,
  makePhysicalEmpireView,
  makePhysicalRebelsView,
  refreshTaskEmpire,
  refreshTaskRebels,
} from '../../test/tableFixtures';
import { renderCore, resetCoreStores } from '../panels/test/harness';
import { PX_TITLE_ID } from '../panels/focus';
import { useTableErrorStore } from './model/tableErrorStore';
import { PhysicalExecutionPanel } from './PhysicalExecutionPanel';
import { TableTaskKeys } from './TableTaskKeys';

beforeEach(() => {
  resetCoreStores();
  useTableErrorStore.getState().clear();
});

function renderPx(view: Parameters<typeof renderCore>[1]) {
  return renderCore(
    <>
      <PhysicalExecutionPanel />
      <TableTaskKeys />
    </>,
    view,
  );
}

describe('PhysicalExecutionPanel (AC-21)', () => {
  it('TC-PX-10: AI task — header, region with three blocks, numbered steps, text status «AI waits»', async () => {
    renderPx(
      makePhysicalRebelsView({
        unregistered: false,
        aiWaiting: true,
        tasks: [aiActivationTask(), aiMoveTask()],
      }),
    );
    const px = await screen.findByTestId('physical-execution');
    expect(px).toHaveAttribute('data-head-kind', 'aiActivation');
    expect(px).toHaveAttribute('data-queue-length', '2');
    expect(px).toHaveAttribute('data-ai-waiting', 'true');
    expect(document.getElementById(PX_TITLE_ID)).toHaveTextContent(
      'Физический стол · задача 1 из 2',
    );

    const task = screen.getByTestId('table-task-t-5-1');
    expect(task).toHaveAttribute('role', 'region');
    expect(task).toHaveAttribute('data-head', 'true');
    expect(task).toHaveAccessibleName('AI активировал систему');
    expect(within(task).getByText('Что произошло')).toBeInTheDocument();
    expect(within(task).getByTestId('table-task-happened')).toHaveTextContent(
      'Империя: активирована система.',
    );
    expect(within(task).getByText('Затронуто')).toBeInTheDocument();
    expect(within(task).getByTestId('table-task-affected')).toHaveTextContent('Дарт Вейдер');
    expect(within(task).getByTestId('table-task-affected')).toHaveTextContent('Кореллия');
    expect(within(task).getByText('Что сделать на столе')).toBeInTheDocument();
    const steps = within(task).getByTestId('table-task-steps');
    expect(steps.tagName).toBe('OL');
    expect(within(steps).getAllByRole('listitem')[0]).toHaveTextContent(
      'Поставьте лидера: Дарт Вейдер → Кореллия.',
    );

    // The status is said in text, not only by the LED.
    const waiting = screen.getByTestId('table-task-waiting');
    expect(waiting).toHaveAttribute('data-ai-waiting', 'true');
    expect(waiting).toHaveTextContent('AI ждёт подтверждения стола');
    expect(waiting).toHaveAttribute('aria-live', 'polite');

    // Next tasks: titles only.
    const next = screen.getByTestId('table-task-next');
    expect(within(next).getByTestId('table-task-t-6-1')).toHaveTextContent('AI переместил юниты');
    expect(within(next).queryByTestId('table-task-steps')).toBeNull();

    expect(screen.getByTestId('table-task-confirm')).toHaveTextContent('Выполнено на столе');
    expect(screen.getByTestId('table-task-confirm')).toBeEnabled();
  });

  it('initial setup (ru) without AI waiting: «Синхронизируйте стол…»; en texts without Cyrillic', async () => {
    renderPx(makePhysicalRebelsView());
    const px = await screen.findByTestId('physical-execution');
    expect(px).toHaveAttribute('data-head-kind', 'initialSetup');
    expect(screen.getByTestId('table-task-waiting')).toHaveTextContent(
      'Синхронизируйте стол, чтобы продолжить',
    );
    expect(within(screen.getByTestId('table-task-steps')).getAllByRole('listitem')).toHaveLength(3);
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByTestId('table-task-confirm')).toHaveTextContent('Done on the table');
    expect(screen.getByTestId('table-task-waiting')).toHaveTextContent(
      'Sync the table to continue',
    );
    expect(px.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('initialSetup head: no registration form yet (FD-3)', async () => {
    renderPx(makePhysicalRebelsView());
    await screen.findByTestId('physical-execution');
    expect(screen.queryByTestId('location-register-form')).toBeNull();
    expect(screen.getByTestId('table-task-t-1-2')).toHaveTextContent('Зарегистрируйте карту базы');
  });

  it('registerBase head: the registration form, no «Done on the table» key', async () => {
    renderPx(makePhysicalRebelsView({ tasks: initialRebelsTasks().slice(1) }));
    expect(await screen.findByTestId('location-register-form')).toBeInTheDocument();
    expect(screen.queryByTestId('table-task-confirm')).toBeNull();
    expect(screen.getByTestId('physical-execution')).toHaveAttribute(
      'data-head-kind',
      'registerBase',
    );
  });

  it('after the game is over the queue is still shown and confirmable (C-5)', async () => {
    const over = makeCoreOutcomeView('empire', 'rebelBaseCaptured', {
      settings: { ...CORE_PHYSICAL_REBELS },
      cards: cardsView('rebels', { gameOver: true }),
      table: { tasks: [aiMoveTask()], aiWaiting: false, registration: null },
    });
    renderPx(over);
    expect(await screen.findByTestId('physical-execution')).toHaveAttribute(
      'data-head-kind',
      'aiMove',
    );
    expect(screen.getByTestId('table-task-waiting')).toHaveTextContent(
      'Партия окончена: завершите синхронизацию стола',
    );
    expect(screen.getByTestId('table-task-confirm')).toBeEnabled();
  });

  it('an inline error belongs to its task: shown for the head only', async () => {
    renderPx(makePhysicalRebelsView({ unregistered: false, tasks: [aiMoveTask()] }));
    act(() => useTableErrorStore.getState().set('t-1-1', 'old error'));
    expect(screen.queryByTestId('table-task-error')).toBeNull();
    act(() => useTableErrorStore.getState().set('t-6-1', 'Задача уже выполнена'));
    expect(screen.getByTestId('table-task-error')).toHaveTextContent('Задача уже выполнена');
    expect(screen.getByTestId('table-task-error')).toHaveAttribute('role', 'alert');
  });
});

describe('hidden information (AC-15, TC-PX-08, plan-frontend §5.4)', () => {
  it('human Empire: an AI move into the base names only the «Rebel Base» space, never the base system', async () => {
    const view = makePhysicalEmpireView({
      tasks: [aiMoveIntoBaseTask(['u-r-xwing'], 'corellia')],
    });
    const { container } = renderPx(view);
    const px = await screen.findByTestId('physical-execution');
    expect(px).toHaveTextContent('клетка «База Повстанцев»');
    expect(px).toHaveTextContent('Кореллия');
    expect(container.textContent).not.toContain('Явин');
    expect(container.innerHTML).not.toContain('yavin');
  });

  it('human Empire Refresh: «take X and Y» names exactly the drawn probe cards', async () => {
    renderPx(
      makePhysicalEmpireView({
        empireProbes: ['hoth', 'endor'],
        tasks: [refreshTaskEmpire(['hoth', 'endor'])],
      }),
    );
    const steps = await screen.findByTestId('table-task-steps');
    expect(steps).toHaveTextContent(
      'Возьмите в руку из справочной стопки эти карты зондов: Хот и Эндор.',
    );
  });

  it('human Rebels Refresh: the Empire draw is a count only — no card of the opponent in the DOM', async () => {
    const view = makePhysicalRebelsView(
      { unregistered: false, tasks: [refreshTaskRebels(2)] },
      { cards: cardsView('rebels', { empireProbes: ['hoth', 'endor'] }) },
    );
    // The fixture itself carries no opponent card ids (server projector: owner-only zone → count).
    expect(JSON.stringify(view)).not.toContain('probe-hoth');
    const { container } = renderPx(view);
    const steps = await screen.findByTestId('table-task-steps');
    expect(steps).toHaveTextContent('Соперник взял 2 карты зондов');
    expect(container.textContent).not.toMatch(/Хот|Эндор/);
  });
});
