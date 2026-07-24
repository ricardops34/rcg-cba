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
import { CategoriasService } from './categorias.service';
import { CategoriaCreateDto, CategoriaQueryDto, CategoriaUpdateDto } from './dto/categoria.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('categorias')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly service: CategoriasService) {}

  @ApiOperation({
    summary: 'Listar categorias',
    description:
      'Categorias e subcategorias de produto da empresa ativa (2 níveis, via categoriaPaiId). ' +
      'Busca por descrição ou código ERP. Requer categorias.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('categorias', 'visualizar')
  @Get()
  findAll(@Query() query: CategoriaQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar categoria', description: 'Requer categorias.visualizar.' })
  @RequirePermission('categorias', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({ summary: 'Cadastrar categoria', description: 'Requer categorias.cadastrar.' })
  @RequirePermission('categorias', 'cadastrar')
  @Post()
  create(@Body() dto: CategoriaCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar categoria', description: 'Requer categorias.editar.' })
  @RequirePermission('categorias', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CategoriaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir categoria (soft delete)', description: 'Requer categorias.excluir.' })
  @RequirePermission('categorias', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
