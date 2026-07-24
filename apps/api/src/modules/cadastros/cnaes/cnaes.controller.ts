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
import { CnaesService } from './cnaes.service';
import { CnaeCreateDto, CnaeQueryDto, CnaeUpdateDto } from './dto/cnae.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('cnaes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cnaes')
export class CnaesController {
  constructor(private readonly service: CnaesService) {}

  @ApiOperation({
    summary: 'Listar CNAEs',
    description:
      'Tabela de referência global (compartilhada entre empresas). Busca por descrição, código ERP ' +
      'ou subclasse. Requer cnaes.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('cnaes', 'visualizar')
  @Get()
  findAll(@Query() query: CnaeQueryDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Detalhar CNAE', description: 'Requer cnaes.visualizar.' })
  @RequirePermission('cnaes', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Cadastrar CNAE', description: 'Requer cnaes.cadastrar.' })
  @RequirePermission('cnaes', 'cadastrar')
  @Post()
  create(@Body() dto: CnaeCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user, dto);
  }

  @ApiOperation({ summary: 'Editar CNAE', description: 'Requer cnaes.editar.' })
  @RequirePermission('cnaes', 'editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CnaeUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir CNAE (soft delete)', description: 'Requer cnaes.excluir.' })
  @RequirePermission('cnaes', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user, id);
  }
}
