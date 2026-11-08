import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiError } from './api-error';

/** Validates a route argument with a Zod schema; failure → 400 VALIDATION (unified body). */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) throw ApiError.fromZod(result.error);
    return result.data;
  }
}
