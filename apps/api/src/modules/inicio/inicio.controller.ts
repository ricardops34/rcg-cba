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
import { ComunicadosService } from './comunicados.service';
import { AniversariantesService } from './aniversariantes.service';
import {
  ComunicadoCreateDto,
  ComunicadoQueryDto,
  ComunicadoUpdateDto,
} from './dto/comunicado.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Tela inicial (Início) — o que o usuário vê ao entrar.
 *
 * As duas rotas de leitura daqui **não exigem permissão de rotina**, só login:
 * são o conteúdo da própria porta de entrada. Exigir uma permissão para ler o
 * mural ou os aniversários deixaria a tela inicial vazia para quem tem perfil
 * enxuto — que é justamente quem mais precisa dos atalhos.
 */
@ApiTags('inicio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inicio')
export class InicioController {
  constructor(
    private readonly comunicados: ComunicadosService,
    private readonly aniversariantes: AniversariantesService,
  ) {}

  @ApiOperation({
    summary: 'Mural da tela inicial',
    description:
      'Comunicados vigentes endereçados ao perfil do usuário logado (comunicado sem perfil ' +
      'marcado vale para todos). Só login — administrar o cadastro é que requer comunicados.*.',
  })
  @Get('mural')
  mural(@CurrentUser() user: AuthenticatedUser) {
    return this.comunicados.mural(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Aniversariantes da equipe',
    description:
      'Vendedores ativos da empresa cujo aniversário cai nos próximos 30 dias, hoje incluído. ' +
      'Devolve nome, dia e mês — nunca o ano. Só login.',
  })
  @Get('aniversariantes')
  listarAniversariantes(@CurrentUser() user: AuthenticatedUser) {
    return this.aniversariantes.listar(user.empresaAtivaId);
  }
}

/** Cadastro dos comunicados, em Administração. */
@ApiTags('comunicados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comunicados')
export class ComunicadosController {
  constructor(private readonly service: ComunicadosService) {}

  @ApiOperation({
    summary: 'Listar comunicados',
    description: 'Requer comunicados.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('comunicados', 'visualizar')
  @Get()
  findAll(
    @Query() query: ComunicadoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar comunicado',
    description: 'Requer comunicados.visualizar.',
  })
  @RequirePermission('comunicados', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Publicar comunicado',
    description:
      'Sem perfis marcados, vale para todos os usuários da empresa. Requer comunicados.cadastrar.',
  })
  @RequirePermission('comunicados', 'cadastrar')
  @Post()
  create(
    @Body() dto: ComunicadoCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar comunicado',
    description:
      'Informar `perfisIds` substitui a lista de destino inteira. Requer comunicados.editar.',
  })
  @RequirePermission('comunicados', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ComunicadoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir comunicado (soft delete)',
    description: 'Requer comunicados.excluir.',
  })
  @RequirePermission('comunicados', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
