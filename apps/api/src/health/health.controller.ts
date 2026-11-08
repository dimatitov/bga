import { Controller, Get } from '@nestjs/common';
import { HealthResponseSchema, type HealthResponse } from '@bga/platform';

@Controller('health')
export class HealthController {
  @Get()
  get(): HealthResponse {
    return HealthResponseSchema.parse({ status: 'ok' });
  }
}
