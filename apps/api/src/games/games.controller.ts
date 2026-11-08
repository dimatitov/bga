import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  GameSetupSchema,
  type CreateGameResponse,
  type GameSetup,
  type ListGamesResponse,
  type PlayerView,
} from '@swr/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(GameSetupSchema)) setup: GameSetup,
  ): Promise<CreateGameResponse> {
    return this.games.create(setup);
  }

  @Get()
  list(): Promise<ListGamesResponse> {
    return this.games.list();
  }

  /** Always the PlayerView of `setup.humanFaction`; any `?viewer=` is ignored (A-3/A-4). */
  @Get(':id')
  get(@Param('id') id: string): Promise<PlayerView> {
    return this.games.getView(id);
  }
}
