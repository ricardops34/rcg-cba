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
import { MunicipiosService } from './municipios.service';
import { MunicipioCreateDto, MunicipioQueryDto, MunicipioUpdateDto } from './dto/municipio.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('municipios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('municipios')
export class MunicipiosController {
  constructor(private readonly service: MunicipiosService) {}

  @ApiOperation({
    summary: 'Listar municípios',
    description:
      'Tabela de referência global (compartilhada entre empresas). Filtro por estado; busca por ' +
      'descrição ou código IBGE. Requer municipios.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('municipios', 'visualizar')
  @Get()
  findAll(@Query() query: MunicipioQueryDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Detalhar município', description: 'Requer municipios.visualizar.' })
  @RequirePermission('municipios', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Cadastrar município', description: 'Requer municipios.cadastrar.' })
  @RequirePermission('municipios', 'cadastrar')
  @Post()
  create(@Body() dto: MunicipioCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user, dto);
  }

  @ApiOperation({ summary: 'Editar município', description: 'Requer municipios.editar.' })
  @RequirePermission('municipios', 'editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: MunicipioUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir município (soft delete)', description: 'Requer municipios.excluir.' })
  @RequirePermission('municipios', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user, id);
  }
}
