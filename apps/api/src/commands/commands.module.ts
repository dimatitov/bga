import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';

@Module({
  imports: [GamesModule],
  controllers: [CommandsController],
  providers: [CommandsService],
})
export class CommandsModule {}
