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
import { VendedoresService } from './vendedores.service';
import { VendedorCreateDto, VendedorQueryDto, VendedorUpdateDto } from './dto/vendedor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('vendedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vendedores')
export class VendedoresController {
  constructor(private readonly service: VendedoresService) {}

  @ApiOperation({
    summary: 'Listar vendedores',
    description:
      'Cadastro de vendedores/supervisores/gerentes da empresa ativa. Busca por nome, código ERP ou e-mail. Requer vendedores.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('vendedores', 'visualizar')
  @Get()
  findAll(@Query() query: VendedorQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar vendedor', description: 'Requer vendedores.visualizar.' })
  @RequirePermission('vendedores', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({ summary: 'Cadastrar vendedor', description: 'Requer vendedores.cadastrar.' })
  @RequirePermission('vendedores', 'cadastrar')
  @Post()
  create(@Body() dto: VendedorCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar vendedor', description: 'Requer vendedores.editar.' })
  @RequirePermission('vendedores', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: VendedorUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir vendedor (soft delete)', description: 'Requer vendedores.excluir.' })
  @RequirePermission('vendedores', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
