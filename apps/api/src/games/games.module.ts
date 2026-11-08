import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesRepository } from './games.repository';
import { GamesService } from './games.service';

@Module({
  controllers: [GamesController],
  providers: [GamesRepository, GamesService],
  exports: [GamesRepository, GamesService],
})
export class GamesModule {}
