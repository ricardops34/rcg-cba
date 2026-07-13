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
import { ProdutosService } from './produtos.service';
import { ProdutoCreateDto, ProdutoUpdateDto } from './dto/produto.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('produtos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly service: ProdutosService) {}

  @ApiOperation({
    summary: 'Listar produtos',
    description:
      'Catálogo da empresa ativa. Busca por descrição, código ERP, marca, categoria ou código de barras. Requer produtos.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('produtos', 'visualizar')
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Cadastrar produto', description: 'Requer produtos.cadastrar.' })
  @RequirePermission('produtos', 'cadastrar')
  @Post()
  create(@Body() dto: ProdutoCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar produto', description: 'Requer produtos.editar.' })
  @RequirePermission('produtos', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ProdutoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir produto (soft delete)', description: 'Requer produtos.excluir.' })
  @RequirePermission('produtos', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
