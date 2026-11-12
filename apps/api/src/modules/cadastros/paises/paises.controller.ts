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
import { PaisesService } from './paises.service';
import { PaisCreateDto, PaisQueryDto, PaisUpdateDto } from './dto/pais.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('paises')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('paises')
export class PaisesController {
  constructor(private readonly service: PaisesService) {}

  @ApiOperation({
    summary: 'Listar países',
    description:
      'Tabela de referência global (compartilhada entre empresas). Busca por nome ou sigla. ' +
      'Requer paises.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('paises', 'visualizar')
  @Get()
  findAll(@Query() query: PaisQueryDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Detalhar país', description: 'Requer paises.visualizar.' })
  @RequirePermission('paises', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Cadastrar país', description: 'Requer paises.cadastrar.' })
  @UseGuards(PlatformAdminGuard)
  @RequirePermission('paises', 'cadastrar')
  @Post()
  create(@Body() dto: PaisCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user, dto);
  }

  @ApiOperation({ summary: 'Editar país', description: 'Requer paises.editar.' })
  @UseGuards(PlatformAdminGuard)
  @RequirePermission('paises', 'editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: PaisUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir país (soft delete)', description: 'Requer paises.excluir.' })
  @UseGuards(PlatformAdminGuard)
  @RequirePermission('paises', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user, id);
  }
}
