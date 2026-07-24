import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ItensNotaSaidaService } from './itens-nota-saida.service';
import { NotaSaidaItemQueryDto } from './dto/nota-saida.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('itens-nota-saida')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('itens-nota-saida')
export class ItensNotaSaidaController {
  constructor(private readonly service: ItensNotaSaidaService) {}

  @ApiOperation({
    summary: 'Listar itens de notas de saída',
    description:
      'Itens de NF de saída da empresa ativa (consulta — dados entram pelo import do ERP), ' +
      'restritos ao escopo hierárquico do usuário logado. Busca por produto ou número da nota. ' +
      'Requer itens-nota-saida.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('itens-nota-saida', 'visualizar')
  @Get()
  findAll(@Query() query: NotaSaidaItemQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Detalhar item de nota', description: 'Requer itens-nota-saida.visualizar.' })
  @RequirePermission('itens-nota-saida', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }
}
