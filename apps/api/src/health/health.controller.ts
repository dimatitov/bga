import { Controller, Get } from '@nestjs/common';
import { HealthResponseSchema, type HealthResponse } from '@swr/contracts';

@Controller('health')
export class HealthController {
  @Get()
  get(): HealthResponse {
    return HealthResponseSchema.parse({ status: 'ok' });
  }
}
