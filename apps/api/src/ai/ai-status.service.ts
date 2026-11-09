/**
 * Status of the AI layer for the dev diagnostics (SWR-005B, plan-backend §10.1; AM-BE-9; Q-26). Never exposes the
 * key — only whether one is configured. Model availability is the cached free `GET /v1/models/{id}` check
 * (checked once per process, TTL 10 min); unknown → `null`.
 */
import type { AIProviderId } from './ai.types';
import type { OpenAIConfig } from '../config/env';
import type { AiDecisionService } from './ai-decision.service';
import type { BudgetSnapshot } from './budget.service';
import { availabilityFlag, type ModelAvailabilityService } from './model-availability.service';

export interface AiModelStatus {
  id: string | null;
  available: boolean | null;
}

export interface AiStatus {
  openaiEnabled: boolean;
  provider: AIProviderId;
  keyConfigured: boolean;
  models: { strategy: AiModelStatus; tactical: AiModelStatus };
  budget: BudgetSnapshot;
}

export interface AiStatusServiceDeps {
  openai: OpenAIConfig;
  availability: ModelAvailabilityService | null;
  decisions: Pick<AiDecisionService, 'snapshot' | 'resolveProvider'>;
}

export class AiStatusService {
  constructor(private readonly deps: AiStatusServiceDeps) {}

  async status(budgetKey: string): Promise<AiStatus> {
    const { openai } = this.deps;
    const [strategy, tactical, budget] = await Promise.all([
      this.model(openai.strategyModel),
      this.model(openai.tacticalModel),
      this.deps.decisions.snapshot(budgetKey),
    ]);
    return {
      openaiEnabled: openai.enabled,
      provider: this.deps.decisions.resolveProvider('auto'),
      keyConfigured: openai.enabled ? true : openai.apiKeyConfigured,
      models: { strategy, tactical },
      budget,
    };
  }

  private async model(id: string | null): Promise<AiModelStatus> {
    const availability = this.deps.availability;
    if (!this.deps.openai.enabled || !availability || id === null) {
      return { id, available: null };
    }
    try {
      return { id, available: availabilityFlag(await availability.check(id)) };
    } catch {
      // status never fails because of the free check
      return { id, available: null };
    }
  }
}
