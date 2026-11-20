import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  GeocodificacaoConfiguracao,
  GeocodificacaoEmpresaLocal,
  GeocodificacaoRota,
  GeocodificacaoLoteSituacao,
  GeocodificacaoTesteResultado,
} from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { GeocodificacaoService } from './geocodificacao.service';
import { GeocodificacaoLoteService } from './geocodificacao-lote.service';
import {
  CoordenadasDto,
  GeocodificacaoBuscarDto,
  GeocodificacaoConfiguracaoUpdateDto,
  GeocodificacaoRotaDto,
  GeocodificacaoLoteDto,
  GeocodificacaoTesteDto,
} from './geocodificacao.dto';

/**
 * Administração > Geolocalização: parâmetros GEO_*, teste de um endereço e o
 * lote dos clientes sem coordenadas (docs/planos/geocodificacao-clientes.md).
 */
@ApiTags('geocodificacao')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('geocodificacao')
export class GeocodificacaoController {
  constructor(
    private readonly geo: GeocodificacaoService,
    private readonly lote: GeocodificacaoLoteService,
  ) {}

  @ApiOperation({
    summary: 'Configuração da geolocalização',
    description:
      'Os parâmetros GEO_* sem a chave (só se ela está preenchida), e quantos clientes estão ' +
      'sem coordenadas. Requer geolocalizacao.visualizar.',
  })
  @RequirePermission('geolocalizacao', 'visualizar')
  @Get('configuracao')
  async configuracao(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GeocodificacaoConfiguracao> {
    const empresaId = user.empresaAtivaId;
    const completa = await this.geo.config(empresaId);
    const { chave, ...config } = completa;
    const contagem = await this.lote.contagem(empresaId);
    return {
      ...config,
      chavePreenchida: !!chave,
      habilitado: this.geo.habilitado(completa),
      ...contagem,
    };
  }

  @ApiOperation({
    summary: 'Gravar a configuração da geolocalização',
    description:
      'Grava os parâmetros GEO_*. A chave só é trocada quando vem preenchida. Requer ' +
      'geolocalizacao.editar.',
  })
  @RequirePermission('geolocalizacao', 'editar')
  @Put('configuracao')
  async salvarConfiguracao(
    @Body() dto: GeocodificacaoConfiguracaoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GeocodificacaoConfiguracao> {
    await this.geo.salvarConfig(user.empresaAtivaId, user.id, dto);
    return this.configuracao(user);
  }

  @ApiOperation({
    summary: 'Testar a consulta com um endereço',
    description:
      'Consulta o Google com a configuração gravada e devolve o que ele achou, sem gravar ' +
      'nada. 502 com o motivo quando o Google recusa. Requer geolocalizacao.visualizar.',
  })
  @RequirePermission('geolocalizacao', 'visualizar')
  @HttpCode(200)
  @Post('testar')
  testar(
    @Body() dto: GeocodificacaoTesteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GeocodificacaoTesteResultado> {
    return this.geo.testar(user.empresaAtivaId, dto.endereco);
  }

  @ApiOperation({
    summary: 'Buscar a coordenada de um endereço (sem gravar)',
    description:
      'Aba Mapa do cliente: consulta o serviço configurado e devolve o ponto para conferir no ' +
      'mapa; quem grava é o cadastro. 409 com a busca desligada, 502 quando o serviço recusa. ' +
      'Requer clientes.editar (a consulta do Google é cobrada).',
  })
  @RequirePermission('clientes', 'editar')
  @HttpCode(200)
  @Post('buscar')
  buscar(
    @Body() dto: GeocodificacaoBuscarDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GeocodificacaoTesteResultado> {
    return this.geo.buscar(user.empresaAtivaId, dto);
  }

  @ApiOperation({
    summary: 'Rota de um ponto a outro',
    description:
      'Aba Mapa do cliente: da empresa (ou de onde o usuário está) até o cliente. Pelo Google ' +
      'quando GEO_ROTAS_GOOGLE está ligado (caminho pelas ruas, distância e tempo); senão a ' +
      'distância em linha reta. Requer clientes.visualizar ou posicao-cliente.visualizar.',
  })
  @RequirePermission('clientes', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @HttpCode(200)
  @Post('rota')
  rota(
    @Body() dto: GeocodificacaoRotaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GeocodificacaoRota> {
    return this.geo.rota(user.empresaAtivaId, dto.origem, dto.destino);
  }

  @ApiOperation({
    summary: 'Local da empresa ativa',
    description:
      'Nome, endereço e coordenadas da empresa em que o usuário está — o ponto de referência ' +
      'dos mapas. Só exige estar autenticado.',
  })
  @Get('empresa')
  empresa(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GeocodificacaoEmpresaLocal> {
    return this.geo.empresaLocal(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Gravar as coordenadas da empresa ativa',
    description: 'Requer geolocalizacao.editar.',
  })
  @RequirePermission('geolocalizacao', 'editar')
  @Put('empresa')
  gravarEmpresa(
    @Body() dto: CoordenadasDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GeocodificacaoEmpresaLocal> {
    return this.geo.gravarEmpresaLocal(user.empresaAtivaId, user.id, dto);
  }

  @ApiOperation({
    summary: 'Andamento do lote de coordenadas',
    description: 'Requer geolocalizacao.visualizar.',
  })
  @RequirePermission('geolocalizacao', 'visualizar')
  @Get('lote')
  situacaoLote(
    @CurrentUser() user: AuthenticatedUser,
  ): GeocodificacaoLoteSituacao {
    return this.lote.situacao(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Buscar as coordenadas dos clientes sem coordenadas',
    description:
      'Corre em segundo plano, até GEO_LOTE_LIMITE clientes; a coordenada achada entra no ' +
      'cadastro pela fila de alterações e vai ao ERP. Requer geolocalizacao.editar.',
  })
  @RequirePermission('geolocalizacao', 'editar')
  @HttpCode(202)
  @Post('lote')
  iniciarLote(
    @Body() dto: GeocodificacaoLoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GeocodificacaoLoteSituacao> {
    return this.lote.iniciar(user.empresaAtivaId, user, dto);
  }
}
