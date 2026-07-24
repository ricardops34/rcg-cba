import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CondicoesPagamentoService } from './condicoes-pagamento.service';
import {
  CondicaoPagamentoCreateDto,
  CondicaoPagamentoQueryDto,
  CondicaoPagamentoUpdateDto,
} from './dto/condicao-pagamento.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('condicoes-pagamento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('condicoes-pagamento')
export class CondicoesPagamentoController {
  constructor(private readonly service: CondicoesPagamentoService) {}

  @ApiOperation({
    summary: 'Listar condições de pagamento',
    description:
      'Condições de pagamento da empresa ativa. Busca por descrição ou código ERP. ' +
      'Requer condicoes-pagamento.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('condicoes-pagamento', 'visualizar')
  @Get()
  findAll(@Query() query: CondicaoPagamentoQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar condição de pagamento', description: 'Requer condicoes-pagamento.visualizar.' })
  @RequirePermission('condicoes-pagamento', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({ summary: 'Cadastrar condição de pagamento', description: 'Requer condicoes-pagamento.cadastrar.' })
  @RequirePermission('condicoes-pagamento', 'cadastrar')
  @Post()
  create(@Body() dto: CondicaoPagamentoCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar condição de pagamento', description: 'Requer condicoes-pagamento.editar.' })
  @RequirePermission('condicoes-pagamento', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CondicaoPagamentoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir condição de pagamento (soft delete)', description: 'Requer condicoes-pagamento.excluir.' })
  @RequirePermission('condicoes-pagamento', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
