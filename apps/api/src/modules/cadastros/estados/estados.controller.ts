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
import { EstadosService } from './estados.service';
import { EstadoCreateDto, EstadoQueryDto, EstadoUpdateDto } from './dto/estado.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('estados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('estados')
export class EstadosController {
  constructor(private readonly service: EstadosService) {}

  @ApiOperation({
    summary: 'Listar estados',
    description:
      'Tabela de referência global (compartilhada entre empresas). Busca por sigla ou descrição. ' +
      'Requer estados.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('estados', 'visualizar')
  @Get()
  findAll(@Query() query: EstadoQueryDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Detalhar estado', description: 'Requer estados.visualizar.' })
  @RequirePermission('estados', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Cadastrar estado', description: 'Requer estados.cadastrar.' })
  @RequirePermission('estados', 'cadastrar')
  @Post()
  create(@Body() dto: EstadoCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user, dto);
  }

  @ApiOperation({ summary: 'Editar estado', description: 'Requer estados.editar.' })
  @RequirePermission('estados', 'editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: EstadoUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir estado (soft delete)', description: 'Requer estados.excluir.' })
  @RequirePermission('estados', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user, id);
  }
}
