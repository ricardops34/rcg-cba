import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FORNECEDOR_EXAMPLE } from '@plataforma/contracts';
import { FornecedoresService } from './fornecedores.service';
import { FornecedorQueryDto } from './dto/fornecedor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('fornecedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('fornecedores')
export class FornecedoresController {
  constructor(private readonly service: FornecedoresService) {}

  @ApiOperation({
    summary: 'Listar fornecedores',
    description:
      'Cadastro espelhado do ERP (consulta — os dados entram por ' +
      '/integracao/fornecedores). Busca por razão social, nome fantasia, ' +
      'CNPJ/CPF ou código do ERP. Requer fornecedores.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('fornecedores', 'visualizar')
  @Get()
  findAll(
    @Query() query: FornecedorQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar fornecedor' })
  @ApiResponse({ status: 200, schema: { example: FORNECEDOR_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado' })
  @RequirePermission('fornecedores', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }
}
