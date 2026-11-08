import { Module } from '@nestjs/common';
import { SessionCommandsService } from './session-commands.service';
import { SessionsController } from './sessions.controller';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [SessionsRepository, SessionsService, SessionCommandsService],
})
export class SessionsModule {}
