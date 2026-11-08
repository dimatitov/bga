import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DATABASE_URL } from './persistence.tokens';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(DATABASE_URL) databaseUrl: string) {
    super({ datasourceUrl: databaseUrl });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
