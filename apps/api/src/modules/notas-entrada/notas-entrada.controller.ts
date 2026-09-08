import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NOTA_ENTRADA_EXAMPLE } from '@plataforma/contracts';
import { NotasEntradaService } from './notas-entrada.service';
import { NotaEntradaQueryDto } from './dto/nota-entrada.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('notas-entrada')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notas-entrada')
export class NotasEntradaController {
  constructor(private readonly service: NotasEntradaService) {}

  @ApiOperation({
    summary: 'Listar notas de entrada',
    description:
      'Notas fiscais de compra da empresa ativa (consulta — os dados entram ' +
      'por /integracao/notas-entrada). Busca por número, chave NFe ou razão ' +
      'social do fornecedor. Requer notas-entrada.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('notas-entrada', 'visualizar')
  @Get()
  findAll(
    @Query() query: NotaEntradaQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar nota de entrada (com itens)',
    description:
      'Os itens vêm embutidos no detalhe — não têm rotina própria. ' +
      'Requer notas-entrada.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: NOTA_ENTRADA_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Nota de entrada não encontrada' })
  @RequirePermission('notas-entrada', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }
}
