import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { registrarUsoSchema } from '@plataforma/contracts';
import { AcessosService } from './acessos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

class RegistrarUsoDto extends createZodDto(registrarUsoSchema) {}

/**
 * Registro de uso por rotina. Separado de AcessosController porque aquele
 * exige `acessos.visualizar` (é a tela da administração), e aqui quem grava é
 * qualquer usuário logado, sobre si mesmo, ao abrir uma tela.
 */
@ApiTags('acessos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('acessos/uso')
export class UsoRotinaController {
  constructor(private readonly service: AcessosService) {}

  @ApiOperation({
    summary: 'Registrar a abertura de uma tela',
    description:
      'O web manda o caminho da tela; a API descobre a rotina pela rota do menu e soma um ' +
      'acesso do usuário logado no dia. Caminho que não é tela do sistema é ignorado.',
  })
  @HttpCode(204)
  @Post()
  async registrar(@Body() dto: RegistrarUsoDto, @CurrentUser() user: AuthenticatedUser) {
    await this.service.registrarUso(user.empresaAtivaId, user.id, dto.rota);
  }
}
