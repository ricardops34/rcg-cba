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
import {
  SUGESTAO_COMPRA_CALCULADA_EXAMPLE,
  SUGESTAO_COMPRA_EXAMPLE,
  SUGESTAO_COMPRA_LIST_ROW_EXAMPLE,
} from '@plataforma/contracts';
import { SugestaoCompraService } from './sugestao-compra.service';
import {
  SugestaoCompraGerarClienteBodyDto,
  SugestaoCompraGerarLoteBodyDto,
  SugestaoCompraListQueryDto,
  SugestaoCompraQueryDto,
} from './dto/sugestao-compra.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('sugestao-compra')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sugestao-compra')
export class SugestaoCompraController {
  constructor(private readonly service: SugestaoCompraService) {}

  @ApiOperation({
    summary: 'Listar clientes com quando a sugestão foi calculada',
    description:
      'Um cliente por linha (mesmo escopo hierárquico da carteira: vendedor vê a própria, ' +
      'supervisor/gerente o time, quem não tem cadastro de Vendedor vê tudo), com a data do ' +
      'último cálculo gravado em `sugestoes_compra` e quantos produtos estão sugeridos hoje. ' +
      'Não calcula nada — só lê o que já foi gerado. Requer sugestao-compra.visualizar.',
  })
  @ApiPaginationQuery()
  @ApiResponse({ status: 200, schema: { example: { data: [SUGESTAO_COMPRA_LIST_ROW_EXAMPLE], total: 1, page: 1, pageSize: 20, totalPages: 1 } } })
  @RequirePermission('sugestao-compra', 'visualizar')
  @Get()
  listagem(
    @Query() query: SugestaoCompraListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listagem(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'O que oferecer a este cliente',
    description:
      'Produtos que clientes semelhantes compram e o cliente-alvo não. A semelhança soma dois ' +
      'eixos: a cesta de compras (índice de Jaccard sobre os produtos do período) e o ramo de ' +
      'atividade (CNAEs compartilhados, com bônus para o principal coincidente), mais um ' +
      'desempate por mesma região. `baseSemelhanca` permite isolar um dos eixos. ' +
      'Tudo restrito à carteira que o usuário alcança — a sugestão nunca se apoia em cliente de ' +
      'outra equipe. Devolve a evidência (quais semelhantes compram, quantos, ticket médio) e o ' +
      'preço na tabela do cliente, quando resolvível. Requer sugestao-compra.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: SUGESTAO_COMPRA_EXAMPLE } })
  @RequirePermission('sugestao-compra', 'visualizar')
  @Get('cliente/:clienteId')
  paraCliente(
    @Param('clienteId') clienteId: string,
    @Query() query: SugestaoCompraQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.paraCliente(
      user.empresaAtivaId,
      user,
      clienteId,
      query,
    );
  }

  @ApiOperation({
    summary: 'Sugestão já calculada para este cliente',
    description:
      'O que está gravado em `sugestoes_compra` para o cliente — não recalcula nada. É o que a ' +
      'ação "Visualizar" da listagem e a aba de Sugestão na Posição de Cliente mostram. ' +
      'Requer sugestao-compra.visualizar; o cliente precisa estar no escopo do usuário.',
  })
  @ApiResponse({ status: 200, schema: { example: SUGESTAO_COMPRA_CALCULADA_EXAMPLE } })
  @RequirePermission('sugestao-compra', 'visualizar')
  @Get('cliente/:clienteId/calculada')
  calculadaDoCliente(
    @Param('clienteId') clienteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.calculadaDoCliente(
      user.empresaAtivaId,
      user,
      clienteId,
    );
  }

  @ApiOperation({
    summary: 'Recalcular a sugestão de um cliente',
    description:
      'Roda o motor determinístico (cesta + CNAE) para este cliente e substitui o que estava ' +
      'gravado (`origem: local`) por ele. Recusa cliente inativo ou bloqueado (`dataBloqueio` sem ' +
      'reativação posterior). O cliente precisa estar no escopo do usuário. Requer ' +
      'sugestao-compra.cadastrar.',
  })
  @RequirePermission('sugestao-compra', 'cadastrar')
  @Post('cliente/:clienteId/gerar')
  gerarParaCliente(
    @Param('clienteId') clienteId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SugestaoCompraGerarClienteBodyDto,
  ) {
    return this.service.gerarParaCliente(
      user.empresaAtivaId,
      user,
      clienteId,
      body.meses,
    );
  }

  @ApiOperation({
    summary: 'Gerar sugestões em lote',
    description:
      'Roda o motor determinístico (cesta + CNAE) para os clientes elegíveis (dentro do escopo ' +
      'do usuário, ativos, não bloqueados) e grava em `sugestoes_compra` (`origem: local`), ' +
      'substituindo o que já existia para **cada cliente processado** — quem está fora do ' +
      'escopo/faixa não é tocado. `clienteCodigoDe`/`clienteCodigoAte` restringem por código ERP ' +
      '(faixa inclusiva); sem os dois, roda sobre todo o escopo. Disparo manual — não há ' +
      'agendamento automático. Pode levar minutos numa base grande: uma varredura por cliente. ' +
      'Requer sugestao-compra.cadastrar.',
  })
  @RequirePermission('sugestao-compra', 'cadastrar')
  @Post('gerar')
  gerar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SugestaoCompraGerarLoteBodyDto,
  ) {
    return this.service.gerarLote(user.empresaAtivaId, user, body);
  }
}
