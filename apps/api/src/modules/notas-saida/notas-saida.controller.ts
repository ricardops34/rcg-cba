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
import { NotasSaidaService } from './notas-saida.service';
import { NotaSaidaCreateDto, NotaSaidaListQueryDto, NotaSaidaUpdateDto } from './dto/nota-saida.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('notas-saida')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notas-saida')
export class NotasSaidaController {
  constructor(private readonly service: NotasSaidaService) {}

  @ApiOperation({
    summary: 'Listar notas fiscais de saída',
    description:
      'Vendedor vê apenas as próprias notas; supervisor/gerente veem as de toda a equipe abaixo; ' +
      'admin vê todas. Busca por número, chave NF-e ou cliente. Requer notas-saida.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('notas-saida', 'visualizar')
  @Get()
  findAll(@Query() query: NotaSaidaListQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Consultar nota fiscal de saída', description: 'Requer notas-saida.visualizar.' })
  @RequirePermission('notas-saida', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({ summary: 'Lançar nota fiscal de saída', description: 'Requer notas-saida.cadastrar.' })
  @RequirePermission('notas-saida', 'cadastrar')
  @Post()
  create(@Body() dto: NotaSaidaCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar nota fiscal de saída', description: 'Requer notas-saida.editar.' })
  @RequirePermission('notas-saida', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: NotaSaidaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir nota fiscal de saída (soft delete)', description: 'Requer notas-saida.excluir.' })
  @RequirePermission('notas-saida', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
