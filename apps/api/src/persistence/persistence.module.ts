import { Global, Module, type DynamicModule } from '@nestjs/common';
import { DATABASE_URL } from './persistence.tokens';
import { PrismaService } from './prisma.service';

@Global()
@Module({})
export class PersistenceModule {
  static forRoot(options: { databaseUrl: string }): DynamicModule {
    return {
      module: PersistenceModule,
      providers: [{ provide: DATABASE_URL, useValue: options.databaseUrl }, PrismaService],
      exports: [PrismaService],
    };
  }
}
