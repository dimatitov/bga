import { Module, type DynamicModule } from '@nestjs/common';
import {
  createRulesContextRegistry,
  type RulesContextRegistryInput,
} from './rules-context.registry';
import { RULES_CONTEXT_REGISTRY } from './rules-context.tokens';

/** SWR-008 C-8: global `RULES_CONTEXT_REGISTRY`, built eagerly — a broken knowledge base fails the app start. */
@Module({})
export class RulesContextModule {
  static forRoot(input: RulesContextRegistryInput): DynamicModule {
    const registry = createRulesContextRegistry(input);
    return {
      module: RulesContextModule,
      global: true,
      providers: [{ provide: RULES_CONTEXT_REGISTRY, useValue: registry }],
      exports: [RULES_CONTEXT_REGISTRY],
    };
  }
}
