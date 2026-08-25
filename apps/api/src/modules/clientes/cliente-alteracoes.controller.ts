import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CLIENTE_ALTERACAO_EXAMPLE } from '@plataforma/contracts';
import { ClienteAlteracoesService } from './cliente-alteracoes.service';
import {
  ClienteAlteracaoAprovacaoDto,
  ClienteAlteracaoQueryDto,
  ClienteAlteracaoRecusaDto,
} from './dto/cliente-alteracao.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Fila de aprovação do cadastro de cliente. Rotina própria
 * (`clientes-alteracoes`) porque aprovar é papel distinto de editar: quem
 * aprova costuma ser o supervisor, não o vendedor que solicitou.
 */
@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clientes-alteracoes')
export class ClienteAlteracoesController {
  constructor(private readonly service: ClienteAlteracoesService) {}

  @ApiOperation({
    summary: 'Listar solicitações de alteração de cliente',
    description:
      'Fila de alterações de cadastro, restrita à carteira que o usuário alcança. Filtra por ' +
      'status, origem e cliente; busca pela razão social. Pendente mais antiga primeiro. ' +
      'Requer clientes-alteracoes.visualizar.',
  })
  @ApiPaginationQuery()
  @ApiResponse({
    status: 200,
    schema: { example: { data: [CLIENTE_ALTERACAO_EXAMPLE], total: 1 } },
  })
  @RequirePermission('clientes-alteracoes', 'visualizar')
  @Get()
  findAll(
    @Query() query: ClienteAlteracaoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Aprovar solicitação de alteração',
    description:
      'Aplica o "de → para" no cliente e grava o histórico, tudo na mesma transação. ' +
      'O corpo é opcional: informe `campos` para aprovar só parte da solicitação — o que ' +
      'ficar de fora entra no histórico do cliente como reprovado. Sem corpo, aprova tudo. ' +
      'Responde 409 se o cadastro mudou depois da solicitação (o valor "de" não confere mais) ' +
      'ou se ela já foi analisada. Requer clientes.aprovar.',
  })
  @ApiBodyExample({ campos: ['razaoSocial', 'cnaes'] })
  @ApiResponse({ status: 200, schema: { example: CLIENTE_ALTERACAO_EXAMPLE } })
  @ApiResponse({ status: 409, description: 'Cadastro mudou ou já analisada' })
  @RequirePermission('clientes', 'aprovar')
  @Post(':id/aprovar')
  aprovar(
    @Param('id') id: string,
    @Body() dto: ClienteAlteracaoAprovacaoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.aprovar(user.empresaAtivaId, user, id, dto?.campos);
  }

  @ApiOperation({
    summary: 'Recusar solicitação de alteração',
    description:
      'Fecha a solicitação sem tocar no cliente. O motivo é obrigatório — recusa sem motivo ' +
      'deixa quem solicitou sem saber o que corrigir. Requer clientes.aprovar.',
  })
  @ApiBodyExample({ motivo: 'Limite de crédito acima da alçada do vendedor' })
  @ApiResponse({ status: 200, schema: { example: CLIENTE_ALTERACAO_EXAMPLE } })
  @RequirePermission('clientes', 'aprovar')
  @Post(':id/recusar')
  recusar(
    @Param('id') id: string,
    @Body() dto: ClienteAlteracaoRecusaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.recusar(user.empresaAtivaId, user, id, dto.motivo);
  }
}
