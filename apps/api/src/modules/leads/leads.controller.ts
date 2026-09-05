import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LEAD_EXAMPLE } from '@plataforma/contracts';
import { LeadsService } from './leads.service';
import { LeadAtualizarDto, LeadQueryDto } from './dto/lead.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Leads captados pela IA no número institucional.
 *
 * O recorte é diferente do resto do sistema, e está documentado no service:
 * lead não tem carteira. Quem tem equipe vê a fila inteira porque distribuir é
 * o trabalho dele; quem não tem vê só o que lhe foi entregue.
 */
@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @ApiOperation({
    summary: 'Leads captados',
    description:
      'Quentes primeiro e, dentro de cada temperatura, os mais antigos antes — ' +
      'lead esfria esperando. Requer leads.visualizar.',
  })
  @ApiPaginationQuery()
  @ApiResponse({ status: 200, schema: { example: [LEAD_EXAMPLE] } })
  @RequirePermission('leads', 'visualizar')
  @Get()
  listar(@Query() query: LeadQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listar(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Atender, direcionar ou descartar um lead',
    description:
      'Entregar a um vendedor tira o lead da fila (passa a "em atendimento") e ' +
      'avisa quem recebeu. `vendedorId: null` devolve o lead à fila da ' +
      'supervisão. Requer leads.editar.',
  })
  @RequirePermission('leads', 'editar')
  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: LeadAtualizarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.atualizar(user.empresaAtivaId, user, id, dto);
  }
}
