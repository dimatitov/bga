/**
 * Dev-only AI diagnostics module (SWR-005B, plan-backend BD-8). `AppModule` imports it only when
 * `nodeEnv !== 'production'`; in production the routes do not exist (404). Uses the global `AiModule` services.
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { DEV_RATE_LIMITER, DevAiController } from './dev-ai.controller';
import { DEFAULT_DEV_RATE_LIMIT, DevRateLimiter, type DevRateLimit } from './dev-rate-limiter';
import { LoopbackGuard } from './loopback.guard';

export interface DevAiModuleOptions {
  /** Test-only override of the 10 paid / 120 total per minute limits. */
  rateLimit?: DevRateLimit;
  /** Clock of the rate limiter (ms); defaults to `Date.now`. */
  now?: () => number;
}

@Module({})
export class DevAiModule {
  static forRoot(options: DevAiModuleOptions = {}): DynamicModule {
    return {
      module: DevAiModule,
      controllers: [DevAiController],
      providers: [
        LoopbackGuard,
        {
          provide: DEV_RATE_LIMITER,
          useFactory: () =>
            new DevRateLimiter(options.rateLimit ?? DEFAULT_DEV_RATE_LIMIT, options.now),
        },
      ],
    };
  }
}
