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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CONSULTA_CNPJ_EXAMPLE } from '@plataforma/contracts';
import { ClientesService } from './clientes.service';
import { EnriquecimentoService } from './enriquecimento.service';
import { ClienteAlteracoesService } from './cliente-alteracoes.service';
import {
  ClienteCreateDto,
  ClienteQueryDto,
  ClienteUpdateDto,
  MunicipiosEscopoQueryDto,
  PosicaoClienteListQueryDto,
  UfsEscopoQueryDto,
  VendedoresEscopoQueryDto,
} from './dto/cliente.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly service: ClientesService,
    private readonly enriquecimento: EnriquecimentoService,
    private readonly alteracoes: ClienteAlteracoesService,
  ) {}

  @ApiOperation({
    summary: 'Listar clientes',
    description:
      'Carteira de clientes da empresa ativa, restrita ao escopo hierárquico do usuário logado ' +
      '(vendedor vê a própria carteira; supervisor/gerente veem o time; admin vê tudo). ' +
      'Busca por razão social, nome fantasia, código ERP ou CNPJ/CPF. Requer clientes.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('clientes', 'visualizar')
  @Get()
  findAll(
    @Query() query: ClienteQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  // Declarado antes de GET :id, senão o Nest casa "vendedores-escopo" como :id.
  @ApiOperation({
    summary: 'Vendedores no escopo do usuário logado',
    description:
      'Opções de vendedor para o filtro/formulário de clientes, já restritas ao escopo ' +
      'hierárquico. restrito=false indica acesso total. meuVendedorId é o vendedor vinculado ao ' +
      'usuário logado (null se não houver vínculo). apenasComCliente=true troca pra só listar ' +
      'vendedores com pelo menos um cliente vinculado (inclui bloqueados nesse caso — usado no ' +
      'filtro rápido de vendedor da Posição de Cliente). uf/municipio (facetas irmãs já ' +
      'selecionadas no filtro) restringem a lista a vendedores com cliente batendo com elas. ' +
      'Endpoint utilitário compartilhado por várias telas com filtro de Vendedor (Posição de ' +
      'Cliente, Orçamentos, Atividades etc.) — só exige login, sem permissão de módulo ' +
      'específica, já que o resultado já vem restrito ao escopo hierárquico do usuário.',
  })
  @Get('vendedores-escopo')
  vendedoresEscopo(
    @Query() query: VendedoresEscopoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vendedoresEscopo(
      user.empresaAtivaId,
      user,
      query.apenasComCliente ?? false,
      { uf: query.uf, municipio: query.municipio },
    );
  }

  // Declarado antes de GET :id pelo mesmo motivo de vendedores-escopo.
  @ApiOperation({
    summary: 'Municípios no escopo do usuário logado',
    description:
      'Municípios distintos presentes na carteira visível ao usuário logado, pro filtro ' +
      '"Município" da Posição de Cliente. uf/vendedorId (facetas irmãs já selecionadas no ' +
      'filtro) restringem a lista — selecionar uma UF só mostra municípios daquela UF. ' +
      'Endpoint utilitário compartilhado (ver vendedores-escopo) — só exige login.',
  })
  @Get('municipios-escopo')
  municipiosEscopo(
    @Query() query: MunicipiosEscopoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.municipiosEscopo(user.empresaAtivaId, user, query);
  }

  // Declarado antes de GET :id pelo mesmo motivo de vendedores-escopo.
  @ApiOperation({
    summary: 'UFs no escopo do usuário logado',
    description:
      'UFs distintas presentes na carteira visível ao usuário logado, pro filtro "UF" ' +
      '(Clientes e Posição de Cliente). município/vendedorId (facetas irmãs já selecionadas no ' +
      'filtro) restringem a lista, mesma regra de municipios-escopo. Endpoint utilitário ' +
      'compartilhado (ver vendedores-escopo) — só exige login.',
  })
  @Get('ufs-escopo')
  ufsEscopo(
    @Query() query: UfsEscopoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.ufsEscopo(user.empresaAtivaId, user, query);
  }

  // Declarado antes de GET :id pelo mesmo motivo de vendedores-escopo.
  @ApiOperation({
    summary: 'Listagem de Posição de Cliente',
    description:
      'Carteira de clientes com colunas de venda calculadas ao vivo: venda dos últimos 30 dias, ' +
      'venda média (últimos 90 dias ÷ 3), diferença entre as duas, dias desde a última compra, ' +
      'comodato em aberto e bloqueio. Aceita os filtros de clientes.visualizar (busca, ativo, uf, ' +
      'vendedorId, carteira) mais diasSemComprar (filtro rápido) e bloqueado. Requer posicao-cliente.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('posicao-cliente', 'visualizar')
  @Get('posicao')
  listagemPosicao(
    @Query() query: PosicaoClienteListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listagemPosicao(user.empresaAtivaId, user, query);
  }

  // Declarado antes de GET :id pelo mesmo motivo de vendedores-escopo.
  @ApiOperation({
    summary: 'Consultar CNPJ na base pública da Receita Federal',
    description:
      'Consulta a MinhaReceita e devolve os dados cadastrais normalizados do CNPJ, incluindo os ' +
      'CNAEs (principal + secundárias) já casados com a referência local — CNAE cujo código não ' +
      'estiver na referência volta com `cnaeId: null` (sinal de que o sync do IBGE está atrasado). ' +
      '**Não grava nada**: o resultado é sugestão para o formulário. Responde 404 para CNPJ ' +
      'inexistente e 502 quando a fonte pública está fora do ar. Requer clientes.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: CONSULTA_CNPJ_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'CNPJ não encontrado na Receita' })
  @ApiResponse({ status: 502, description: 'Fonte pública indisponível' })
  @RequirePermission('clientes', 'visualizar')
  @Get('consulta-cnpj/:cnpj')
  consultarCnpj(@Param('cnpj') cnpj: string) {
    return this.enriquecimento.consultarCnpj(cnpj);
  }

  @ApiOperation({
    summary: 'Detalhar cliente',
    description:
      'Requer clientes.visualizar ou posicao-cliente.visualizar — esta segunda rota também ' +
      'busca o cliente pré-selecionado ao abrir "Incluir Orçamento" na Posição de Cliente.',
  })
  @RequirePermission('clientes', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Posição de cliente',
    description:
      'Tela agrupada: cliente + notas de saída + remessas de comodato + títulos a receber + ' +
      'mix de produtos comprados. Notas inativas ficam de fora, e as de comodato saem separadas ' +
      'em `comodatos` (não entram em `notas` nem no resumo). Requer posicao-cliente.visualizar.',
  })
  @RequirePermission('posicao-cliente', 'visualizar')
  @Get(':id/posicao')
  posicao(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.posicao(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Mix de produtos do cliente',
    description:
      'Produtos já comprados pelo cliente (código, descrição, última compra, preço/desconto da ' +
      'compra mais recente, preço vigente na tabela de preço do cliente) — usado pela aba "Mix" ' +
      'do formulário de Orçamento. Requer clientes.visualizar ou posicao-cliente.visualizar ' +
      '(orçamento aberto a partir da Posição de Cliente).',
  })
  @RequirePermission('clientes', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id/mix')
  mix(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.mix(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Cadastrar cliente',
    description: 'Requer clientes.cadastrar.',
  })
  @RequirePermission('clientes', 'cadastrar')
  @Post()
  create(
    @Body() dto: ClienteCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar cliente',
    description: 'Requer clientes.editar.',
  })
  @RequirePermission('clientes', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ClienteUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Histórico de alterações do cliente',
    description:
      'O que já mudou no cadastro, campo a campo, com origem e autor — inclusive alterações ' +
      'vindas da integração do ERP. Últimos 200 registros, mais recente primeiro. ' +
      'Requer clientes.visualizar.',
  })
  @RequirePermission('clientes', 'visualizar')
  @Get(':id/historico-alteracoes')
  historicoAlteracoes(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.alteracoes.historicoDoCliente(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Excluir cliente (soft delete)',
    description: 'Requer clientes.excluir.',
  })
  @RequirePermission('clientes', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
