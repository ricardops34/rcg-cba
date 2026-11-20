import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { GeocodificacaoTesteResultado } from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ParametrosService } from '../parametros/parametros.service';
import { cifrarParametro } from '../parametros/parametros-cripto';

/**
 * Coordenadas do cliente pela Geocoding API do Google
 * (docs/planos/geocodificacao-clientes.md).
 *
 * Decisões do usuário (16/11/2026): busca automática ao salvar o cliente e
 * lote na tela Administração > Geolocalização; o resultado vai ao ERP
 * (A1_XLAT/A1_XLNG) pela fila de alterações, como qualquer mudança do
 * cadastro. A configuração são parâmetros GEO_* da empresa, sem tabela
 * própria — mesmo desenho do SMS.
 */
export const GEO_URL_PADRAO =
  'https://maps.googleapis.com/maps/api/geocode/json';

export const GEO_PARAMETROS = {
  ativo: {
    parametro: 'GEO_ATIVO',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'false',
    descricao:
      'Habilita a busca das coordenadas do cliente pela Geocoding API do Google',
  },
  url: {
    parametro: 'GEO_URL',
    tipo: 'texto',
    tamanho: 300,
    padrao: GEO_URL_PADRAO,
    descricao: 'URL da Geocoding API do Google',
  },
  chave: {
    parametro: 'GEO_CHAVE',
    tipo: 'senha',
    tamanho: 200,
    padrao: null,
    descricao:
      'Chave da API do Google (Google Cloud > APIs e serviços > Credenciais), com a Geocoding API liberada',
  },
  aoSalvar: {
    parametro: 'GEO_AO_SALVAR',
    tipo: 'booleano',
    tamanho: null,
    padrao: 'true',
    descricao:
      'Busca as coordenadas ao salvar o cliente quando o endereço muda ou elas estão vazias',
  },
  loteLimite: {
    parametro: 'GEO_LOTE_LIMITE',
    tipo: 'numero',
    tamanho: 5,
    padrao: '200',
    descricao:
      'Máximo de clientes consultados por execução do lote de coordenadas',
  },
} as const;

export type GeoConfig = {
  ativo: boolean;
  url: string;
  chave: string | null;
  aoSalvar: boolean;
  loteLimite: number;
};

/** Campos do cadastro que formam o endereço consultado. */
export const CAMPOS_ENDERECO = [
  'endereco',
  'bairro',
  'municipio',
  'uf',
  'cep',
] as const;

export type EnderecoCliente = Partial<
  Record<(typeof CAMPOS_ENDERECO)[number], string | null>
>;

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * O endereço como vai ao Google, ou null quando não dá para consultar. Sem rua
 * o Google só devolveria o centro da cidade, que não é gravado (ver
 * `PRECISOES_ACEITAS`) — não vale gastar a consulta.
 */
export function textoDoEndereco(e: EnderecoCliente): string | null {
  const rua = texto(e.endereco);
  const municipio = texto(e.municipio);
  const uf = texto(e.uf);
  if (!rua || !municipio || !uf) return null;
  const cep = texto(e.cep).replace(/\D/g, '');
  return [
    rua,
    texto(e.bairro),
    `${municipio} - ${uf}`,
    cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : '',
    'Brasil',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * APPROXIMATE é bairro, cidade ou CEP inteiro: um ponto no meio da cidade
 * gravado como "a coordenada do cliente" engana mais do que ajuda (rota,
 * mapa). Fica sem coordenada, e a consulta conta como "não encontrado".
 */
const PRECISOES_ACEITAS = new Set([
  'ROOFTOP',
  'RANGE_INTERPOLATED',
  'GEOMETRIC_CENTER',
]);

/** Status do Google que valem para qualquer endereço: param o lote. */
const STATUS_FATAIS = new Set([
  'REQUEST_DENIED',
  'OVER_DAILY_LIMIT',
  'OVER_QUERY_LIMIT',
]);

export type RespostaGeo =
  | {
      tipo: 'encontrado';
      latitude: number;
      longitude: number;
      enderecoFormatado: string | null;
      precisao: string | null;
    }
  | {
      tipo: 'nao_encontrado';
      enderecoFormatado: string | null;
      precisao: string | null;
    }
  | { tipo: 'erro'; fatal: boolean; mensagem: string };

/** 6 casas ≈ 11 cm: mais que isso não cabe com folga no A1_XLAT texto. */
const arredondar = (n: number) => Math.round(n * 1e6) / 1e6;

/** Lê o corpo da Geocoding API. Função pura, para o teste. */
export function interpretarResposta(corpo: unknown): RespostaGeo {
  const c = (corpo ?? {}) as {
    status?: string;
    error_message?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: {
        location?: { lat?: number; lng?: number };
        location_type?: string;
      };
    }>;
  };
  const status = c.status ?? 'SEM_STATUS';
  if (status === 'ZERO_RESULTS') {
    return { tipo: 'nao_encontrado', enderecoFormatado: null, precisao: null };
  }
  if (status !== 'OK') {
    return {
      tipo: 'erro',
      fatal: STATUS_FATAIS.has(status),
      mensagem: c.error_message ? `${status}: ${c.error_message}` : status,
    };
  }
  const primeiro = c.results?.[0];
  const lat = primeiro?.geometry?.location?.lat;
  const lng = primeiro?.geometry?.location?.lng;
  const precisao = primeiro?.geometry?.location_type ?? null;
  const enderecoFormatado = primeiro?.formatted_address ?? null;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !precisao ||
    !PRECISOES_ACEITAS.has(precisao)
  ) {
    return { tipo: 'nao_encontrado', enderecoFormatado, precisao };
  }
  return {
    tipo: 'encontrado',
    latitude: arredondar(lat),
    longitude: arredondar(lng),
    enderecoFormatado,
    precisao,
  };
}

/**
 * Coordenada que não aponta para lugar nenhum: faltando, ou 0/0. O Protheus
 * grava 0 nos campos numéricos vazios, e o cadastro chega com 0/0 — que é
 * um ponto no oceano, não um endereço (20/11/2026: 415 clientes assim).
 */
export function coordenadaVazia(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    latitude == null ||
    longitude == null ||
    (Number(latitude) === 0 && Number(longitude) === 0)
  );
}

/** O mesmo, para filtro do Prisma (cliente e lead). */
export const FILTRO_COORDENADA_VAZIA = [
  { latitude: null },
  { longitude: null },
  { latitude: 0, longitude: 0 },
];

const mesmoNumero = (a: unknown, b: unknown) =>
  (a == null && b == null) ||
  (a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-9);

const comparavel = (v: unknown) =>
  texto(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

export type ClienteParaGeo = EnderecoCliente & {
  latitude?: number | null;
  longitude?: number | null;
  coordenadasConsultadasEm?: Date | null;
};

/**
 * O endereço a consultar ao salvar o cliente, ou null quando não é o caso.
 * `atual` é null na inclusão. Regras (16/11/2026):
 *
 * - quem digitou a coordenada na tela manda: não se sobrescreve;
 * - endereço mudou → consulta, mesmo com coordenada (a antiga é de outro lugar);
 * - endereço igual e sem coordenada → consulta, se o Google ainda não tentou
 *   este cadastro (endereço que ele não acha não gasta cota a cada salvar).
 *
 * Diferença só de grafia (acento, caixa, pontuação) não conta como mudança.
 */
export function enderecoParaConsultarAoSalvar(
  atual: ClienteParaGeo | null,
  input: ClienteParaGeo,
): string | null {
  const final: EnderecoCliente = {};
  for (const campo of CAMPOS_ENDERECO) {
    final[campo] =
      input[campo] !== undefined ? input[campo] : (atual?.[campo] ?? null);
  }
  const consulta = textoDoEndereco(final);
  if (!consulta) return null;

  if (!atual) {
    return coordenadaVazia(input.latitude, input.longitude) ? consulta : null;
  }

  const digitou =
    (input.latitude !== undefined &&
      !mesmoNumero(input.latitude, atual.latitude)) ||
    (input.longitude !== undefined &&
      !mesmoNumero(input.longitude, atual.longitude));
  if (digitou) return null;

  const enderecoMudou = CAMPOS_ENDERECO.some(
    (campo) =>
      input[campo] !== undefined &&
      comparavel(input[campo]) !== comparavel(atual[campo]),
  );
  if (enderecoMudou) return consulta;

  const semCoordenadas = coordenadaVazia(atual.latitude, atual.longitude);
  return semCoordenadas && !atual.coordenadasConsultadasEm ? consulta : null;
}

@Injectable()
export class GeocodificacaoService {
  private readonly logger = new Logger(GeocodificacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  async config(empresaId: string): Promise<GeoConfig> {
    const P = GEO_PARAMETROS;
    const chave = (
      await this.parametros.obterTexto(empresaId, P.chave.parametro)
    )?.trim();
    const url = (
      await this.parametros.obterTexto(empresaId, P.url.parametro)
    )?.trim();
    return {
      ativo: await this.parametros.obterBoolean(
        empresaId,
        P.ativo.parametro,
        false,
      ),
      url: url || GEO_URL_PADRAO,
      chave: chave || null,
      aoSalvar: await this.parametros.obterBoolean(
        empresaId,
        P.aoSalvar.parametro,
        true,
      ),
      loteLimite: await this.parametros.obterNumero(
        empresaId,
        P.loteLimite.parametro,
        Number(P.loteLimite.padrao),
      ),
    };
  }

  /** Ativo e com chave. */
  habilitado(c: GeoConfig) {
    return c.ativo && !!c.chave;
  }

  /**
   * Grava a tela nos parâmetros GEO_*. A chave só muda quando vem preenchida
   * — a tela não recebe a atual, só se ela existe.
   */
  async salvarConfig(
    empresaId: string,
    autor: string,
    dados: Omit<GeoConfig, 'chave'> & { chave?: string | null },
  ) {
    const P = GEO_PARAMETROS;
    const valores: Array<[(typeof P)[keyof typeof P], string]> = [
      [P.ativo, String(dados.ativo)],
      [P.url, dados.url.trim()],
      [P.aoSalvar, String(dados.aoSalvar)],
      [P.loteLimite, String(dados.loteLimite)],
    ];
    // Cifrada (PARAMETROS_CRYPTO_KEY); cifrar antes da transação faz uma
    // chave mestra ausente recusar o salvamento inteiro, sem gravar a metade.
    if (dados.chave?.trim())
      valores.push([P.chave, cifrarParametro(dados.chave.trim())]);

    await this.prisma.withTenant(empresaId, async (tx) => {
      for (const [d, conteudo] of valores) {
        await tx.parametroEmpresa.upsert({
          where: { empresaId_parametro: { empresaId, parametro: d.parametro } },
          create: {
            empresaId,
            parametro: d.parametro,
            tipo: d.tipo,
            tamanho: d.tamanho,
            conteudo,
            descricao: d.descricao,
            createdBy: autor,
            updatedBy: autor,
          },
          update: { conteudo, ativo: true, deletedAt: null, updatedBy: autor },
        });
      }
    });
  }

  /** Uma consulta ao Google. Não lança: falha vira `{ tipo: 'erro' }`. */
  async consultar(cfg: GeoConfig, endereco: string): Promise<RespostaGeo> {
    if (!cfg.chave) {
      return {
        tipo: 'erro',
        fatal: true,
        mensagem: 'Chave da API não informada',
      };
    }
    const url = new URL(cfg.url);
    url.searchParams.set('address', endereco);
    url.searchParams.set('key', cfg.chave);
    url.searchParams.set('components', 'country:BR');
    url.searchParams.set('region', 'br');
    url.searchParams.set('language', 'pt-BR');
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      const corpo: unknown = await resposta.json().catch(() => null);
      if (!corpo) {
        return {
          tipo: 'erro',
          fatal: resposta.status === 401 || resposta.status === 403,
          mensagem: `HTTP ${resposta.status}`,
        };
      }
      return interpretarResposta(corpo);
    } catch (falha) {
      return {
        tipo: 'erro',
        fatal: false,
        mensagem: `Sem resposta do Google: ${(falha as Error).message}`,
      };
    }
  }

  /** O "Testar" da tela: lança 502 quando o Google recusa, para mostrar o motivo. */
  async testar(
    empresaId: string,
    endereco: string,
  ): Promise<GeocodificacaoTesteResultado> {
    const cfg = await this.config(empresaId);
    const r = await this.consultar(cfg, endereco);
    if (r.tipo === 'erro') {
      throw new BadGatewayException(
        `O Google recusou a consulta: ${r.mensagem}`,
      );
    }
    return {
      encontrado: r.tipo === 'encontrado',
      latitude: r.tipo === 'encontrado' ? r.latitude : null,
      longitude: r.tipo === 'encontrado' ? r.longitude : null,
      enderecoFormatado: r.enderecoFormatado,
      precisao: r.precisao,
    };
  }

  /**
   * A busca do salvar do cliente. Nunca lança nem atrasa além do timeout:
   * salvar o cadastro não pode depender do Google. Devolve se consultou (para
   * marcar `coordenadasConsultadasEm`) e as coordenadas, quando achou.
   */
  async aoSalvar(
    empresaId: string,
    atual: ClienteParaGeo | null,
    input: ClienteParaGeo,
  ): Promise<{
    consultou: boolean;
    coordenadas: { latitude: number; longitude: number } | null;
  }> {
    const nada = { consultou: false, coordenadas: null };
    const endereco = enderecoParaConsultarAoSalvar(atual, input);
    if (!endereco) return nada;
    const cfg = await this.config(empresaId);
    if (!this.habilitado(cfg) || !cfg.aoSalvar) return nada;

    const r = await this.consultar(cfg, endereco);
    if (r.tipo === 'erro') {
      this.logger.warn(
        `Coordenadas não consultadas ao salvar cliente (empresa ${empresaId}): ${r.mensagem}`,
      );
      return nada;
    }
    return {
      consultou: true,
      coordenadas:
        r.tipo === 'encontrado'
          ? { latitude: r.latitude, longitude: r.longitude }
          : null,
    };
  }
}
