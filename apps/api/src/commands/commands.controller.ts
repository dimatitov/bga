import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import type { CommandOk } from '@swr/contracts';
import { CommandsService } from './commands.service';

@Controller('games')
export class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  /** The only state-changing route besides game creation (TC-API-23). Body validated in the service (D-7). */
  @Post(':id/commands')
  @HttpCode(200)
  execute(@Param('id') id: string, @Body() body: unknown): Promise<CommandOk> {
    return this.commands.execute(id, body);
  }
}
