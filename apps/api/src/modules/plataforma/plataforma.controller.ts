import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PLATAFORMA_EMPRESA_EXAMPLE } from '@plataforma/contracts';
import { PlataformaService } from './plataforma.service';
import {
  PlataformaAdminPromoverDto,
  PlataformaAdminUpdateDto,
  PlataformaAuditoriaQueryDto,
  PlataformaEmpresaCreateDto,
  PlataformaEmpresaQueryDto,
  PlataformaSituacaoUpdateDto,
} from './dto/plataforma.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Administração do SaaS: quem tem acesso, por quanto tempo e com quantos
 * usuários.
 *
 * **Sem `PermissionsGuard`, e é deliberado.** As permissões deste sistema são
 * por perfil, e perfis são globais e compartilhados por todas as empresas —
 * dar uma permissão ao Administrador daria a todo administrador de tenant.
 * Aqui o corte é outro: o atributo `administradorPlataforma` do usuário, que
 * não vem de perfil nenhum. Por isso só o `PlatformAdminGuard`.
 */
@ApiTags('plataforma')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('plataforma')
export class PlataformaController {
  constructor(private readonly service: PlataformaService) {}

  private ator(user: AuthenticatedUser) {
    return { id: user.id, email: user.email };
  }

  @ApiOperation({
    summary: 'Listar empresas do SaaS',
    description:
      'Situação, prazo de teste, uso do limite de usuários e último acesso. ' +
      'Filtra por situação e por "apenasExpiradas" (em teste com a data vencida).',
  })
  @ApiPaginationQuery()
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [PLATAFORMA_EMPRESA_EXAMPLE],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    },
  })
  @Get('empresas')
  listarEmpresas(@Query() query: PlataformaEmpresaQueryDto) {
    return this.service.listarEmpresas(query);
  }

  @ApiOperation({
    summary: 'Cadastrar empresa com o primeiro administrador',
    description:
      'Cria a empresa e o usuário administrador dela na mesma transação. A senha ' +
      'informada é provisória: o primeiro login exige troca. Nasce em teste, salvo ' +
      'se a situação for informada.',
  })
  @ApiResponse({ status: 201, description: 'Empresa e administrador criados' })
  @ApiResponse({
    status: 409,
    description: 'CNPJ, alias ou e-mail já em uso',
  })
  @Post('empresas')
  criarEmpresa(
    @Body() dto: PlataformaEmpresaCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.criarEmpresa(dto, this.ator(user));
  }

  @ApiOperation({
    summary: 'Alterar situação, prazo de teste e limite de usuários',
    description:
      'As três coisas que só a plataforma governa. Cada alteração vira uma linha ' +
      'no log; "motivo" acompanha o registro para explicar depois.',
  })
  @ApiParam({ name: 'id', description: 'Id da empresa' })
  @ApiResponse({ status: 200, description: 'Empresa atualizada' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada' })
  @Patch('empresas/:id/situacao')
  alterarSituacao(
    @Param('id') id: string,
    @Body() dto: PlataformaSituacaoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.alterarSituacao(id, dto, this.ator(user));
  }

  @ApiOperation({ summary: 'Listar administradores da plataforma' })
  @Get('admins')
  listarAdmins() {
    return this.service.listarAdmins();
  }

  @ApiOperation({
    summary: 'Promover administrador da plataforma pelo e-mail',
    description:
      'Procura o usuário em toda a base — a rota /usuarios é do tenant e só ' +
      'enxerga a empresa da sessão, o que não serve a quem administra o SaaS. ' +
      'A conta precisa existir.',
  })
  @ApiResponse({ status: 201, description: 'Usuário promovido' })
  @ApiResponse({ status: 404, description: 'Nenhum usuário com este e-mail' })
  @Post('admins')
  promoverPorEmail(
    @Body() dto: PlataformaAdminPromoverDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.promoverPorEmail(dto.email, this.ator(user));
  }

  @ApiOperation({
    summary: 'Promover ou revogar administrador da plataforma',
    description:
      'Recusa revogar o último administrador e recusa que alguém revogue a si ' +
      'mesmo — nos dois casos o acesso ao módulo se perderia sem volta pela tela.',
  })
  @ApiParam({ name: 'usuarioId', description: 'Id do usuário' })
  @ApiResponse({ status: 200, description: 'Atributo atualizado' })
  @ApiResponse({
    status: 409,
    description: 'Último administrador, ou tentativa de revogar a si mesmo',
  })
  @Patch('admins/:usuarioId')
  definirAdmin(
    @Param('usuarioId') usuarioId: string,
    @Body() dto: PlataformaAdminUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.definirAdmin(
      usuarioId,
      dto.administradorPlataforma,
      this.ator(user),
    );
  }

  @ApiOperation({
    summary: 'Log da administração da plataforma',
    description:
      'Quem mudou o quê e quando. Filtra por empresa e por ação. Mais recentes primeiro.',
  })
  @ApiPaginationQuery()
  @Get('auditoria')
  listarAuditoria(@Query() query: PlataformaAuditoriaQueryDto) {
    return this.service.listarAuditoria(query);
  }
}
