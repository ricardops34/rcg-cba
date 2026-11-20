import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  rotaVisitaCalcularSchema,
  rotaVisitaCreateSchema,
  rotaVisitaQuerySchema,
} from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { RotasVisitaService } from './rotas-visita.service';

class RotaVisitaCalcularDto extends createZodDto(rotaVisitaCalcularSchema) {}
class RotaVisitaCreateDto extends createZodDto(rotaVisitaCreateSchema) {}
class RotaVisitaQueryDto extends createZodDto(rotaVisitaQuerySchema) {}

/** Gerencial > Mapa e Rotas: rotas de visita (rotina `mapa-rotas`). */
@ApiTags('rotas-visita')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rotas-visita')
export class RotasVisitaController {
  constructor(private readonly service: RotasVisitaService) {}

  @ApiOperation({
    summary: 'Calcular a rota (sem gravar)',
    description:
      'Ordena as paradas: pela Google Routes API quando GEO_ROTAS_GOOGLE está ligado (até 25 ' +
      'paradas, com o caminho pelas ruas), senão por proximidade em linha reta. Se o Google ' +
      'recusar, volta a ordem por proximidade com o aviso do motivo. Requer mapa-rotas.cadastrar.',
  })
  @RequirePermission('mapa-rotas', 'cadastrar')
  @HttpCode(200)
  @Post('calcular')
  calcular(
    @Body() dto: RotaVisitaCalcularDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.calcular(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Salvar a rota',
    description:
      'Grava a rota e cria uma atividade de visita na Agenda do vendedor para cada parada, na ' +
      'ordem. Requer mapa-rotas.cadastrar.',
  })
  @RequirePermission('mapa-rotas', 'cadastrar')
  @Post()
  criar(
    @Body() dto: RotaVisitaCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.criar(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Listar rotas',
    description:
      'Com o andamento (visitas feitas ÷ total). Requer mapa-rotas.visualizar.',
  })
  @RequirePermission('mapa-rotas', 'visualizar')
  @Get()
  listar(
    @Query() q: RotaVisitaQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listar(user.empresaAtivaId, user, q);
  }

  @ApiOperation({
    summary: 'Detalhar rota',
    description: 'Requer mapa-rotas.visualizar.',
  })
  @RequirePermission('mapa-rotas', 'visualizar')
  @Get(':id')
  detalhe(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detalhe(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Excluir rota',
    description:
      'Exclui a rota e as visitas ainda não feitas; as feitas ficam na Agenda. Requer ' +
      'mapa-rotas.editar.',
  })
  @RequirePermission('mapa-rotas', 'editar')
  @Delete(':id')
  remover(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remover(user.empresaAtivaId, user, id);
  }
}
