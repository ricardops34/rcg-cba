import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import {
  GEO_NOMINATIM_URL_PADRAO,
  type GeocodificacaoProvedor,
  type GeocodificacaoTesteResultado,
} from '@plataforma/contracts';
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
  provedor: {
    parametro: 'GEO_PROVEDOR',
    tipo: 'texto',
    tamanho: 20,
    padrao: 'google',
    descricao:
      'Serviço das coordenadas: google (Geocoding API, pago, com chave) ou nominatim (OpenStreetMap, gratuito)',
  },
  nominatimUrl: {
    parametro: 'GEO_NOMINATIM_URL',
    tipo: 'texto',
    tamanho: 300,
    padrao: GEO_NOMINATIM_URL_PADRAO,
    descricao: 'URL do serviço Nominatim (OpenStreetMap)',
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
  provedor: GeocodificacaoProvedor;
  nominatimUrl: string;
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

/**
 * O que fazer, em português, para as recusas mais comuns do Google. A frase
 * original segue entre parênteses: é ela que o suporte do Google reconhece.
 */
export function explicarErroGoogle(status: string, mensagem?: string): string {
  const original = mensagem ? `${status}: ${mensagem}` : status;
  const m = (mensagem ?? '').toLowerCase();
  let causa: string | null = null;
  if (m.includes('billing')) {
    causa =
      'O projeto no Google Cloud está sem faturamento. Vincule uma conta de faturamento em Google Cloud > Faturamento e tente de novo.';
  } else if (
    m.includes('api key is invalid') ||
    m.includes('api key not valid')
  ) {
    causa = 'A chave da API é inválida. Confira se foi copiada inteira.';
  } else if (m.includes('ip address') || m.includes('referer')) {
    causa =
      'A restrição da chave recusou este servidor. Confira, nas restrições da chave, o IP público do servidor.';
  } else if (m.includes('not authorized') || m.includes('not activated')) {
    causa =
      'A chave não pode usar a Geocoding API. Ative a API no projeto e inclua-a nas restrições da chave.';
  } else if (status === 'OVER_DAILY_LIMIT' || status === 'OVER_QUERY_LIMIT') {
    causa =
      'O limite de consultas da conta do Google acabou. Confira as cotas e o faturamento do projeto.';
  }
  return causa ? `${causa} (${original})` : original;
}

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
      mensagem: explicarErroGoogle(status, c.error_message),
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
 * Lê o corpo do Nominatim (`format=jsonv2&addressdetails=1`). Função pura.
 *
 * O filtro de cidade do Nominatim não é rígido: "Rua Augusta, 500 / São
 * Paulo" volta primeiro com uma rua parecida em Sumaré (conferido em
 * 20/11/2026). Por isso, quando a cidade e a UF do cadastro são conhecidas,
 * só vale o resultado que bate com as duas.
 *
 * `place_rank` vira o mesmo vocabulário do Google, para a regra de gravação
 * ser uma só: 30 é o imóvel (ROOFTOP), 26–29 a rua (GEOMETRIC_CENTER), menos
 * que isso bairro/cidade (APPROXIMATE, não gravado).
 */
export function interpretarRespostaNominatim(
  corpo: unknown,
  esperado?: { municipio?: string | null; uf?: string | null },
): RespostaGeo {
  if (!Array.isArray(corpo)) {
    return {
      tipo: 'erro',
      fatal: false,
      mensagem: 'Resposta inesperada do Nominatim',
    };
  }
  type Item = {
    lat?: string;
    lon?: string;
    place_rank?: number;
    display_name?: string;
    address?: Record<string, string>;
  };
  const municipio = comparavel(esperado?.municipio);
  const uf = texto(esperado?.uf).toUpperCase();
  const confere = (r: Item) => {
    const a = r.address ?? {};
    if (municipio) {
      const cidades = [a.city, a.town, a.village, a.municipality, a.hamlet];
      if (!cidades.some((c) => c && comparavel(c) === municipio)) return false;
    }
    const iso = a['ISO3166-2-lvl4'];
    if (uf && iso && iso !== `BR-${uf}`) return false;
    return true;
  };
  const r = (corpo as Item[]).find(confere);
  if (!r) {
    return { tipo: 'nao_encontrado', enderecoFormatado: null, precisao: null };
  }
  const rank = r.place_rank ?? 0;
  const precisao =
    rank >= 30 ? 'ROOFTOP' : rank >= 26 ? 'GEOMETRIC_CENTER' : 'APPROXIMATE';
  const enderecoFormatado = r.display_name ?? null;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
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
 * O serviço público do Nominatim aceita no máximo 1 consulta por segundo,
 * somando tudo o que sai deste servidor (lote, salvar cliente, teste de
 * todas as empresas). Cada chamada reserva a sua vez antes de esperar.
 */
const NOMINATIM_INTERVALO_MS = 1_100;
let proximaVezNominatim = 0;
async function aguardarVezNominatim() {
  const agora = Date.now();
  const inicio = Math.max(agora, proximaVezNominatim);
  proximaVezNominatim = inicio + NOMINATIM_INTERVALO_MS;
  if (inicio > agora) await new Promise((r) => setTimeout(r, inicio - agora));
}

/** Identifica a aplicação, como pede a política de uso do Nominatim. */
const NOMINATIM_USER_AGENT = 'plataforma-comercial/1.0 (geocodificacao)';

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

/** O endereço como fica depois de salvar: o que veio na tela sobre o atual. */
export function enderecoCombinado(
  atual: ClienteParaGeo | null,
  input: ClienteParaGeo,
): EnderecoCliente {
  const final: EnderecoCliente = {};
  for (const campo of CAMPOS_ENDERECO) {
    final[campo] =
      input[campo] !== undefined ? input[campo] : (atual?.[campo] ?? null);
  }
  return final;
}

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
  const consulta = textoDoEndereco(enderecoCombinado(atual, input));
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
    const provedor = (
      await this.parametros.obterTexto(empresaId, P.provedor.parametro)
    )?.trim();
    const nominatimUrl = (
      await this.parametros.obterTexto(empresaId, P.nominatimUrl.parametro)
    )?.trim();
    return {
      ativo: await this.parametros.obterBoolean(
        empresaId,
        P.ativo.parametro,
        false,
      ),
      provedor: provedor === 'nominatim' ? 'nominatim' : 'google',
      nominatimUrl: nominatimUrl || GEO_NOMINATIM_URL_PADRAO,
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

  /** Ativo e pronto: o Google exige a chave; o Nominatim não tem chave. */
  habilitado(c: GeoConfig) {
    return c.ativo && (c.provedor === 'nominatim' || !!c.chave);
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
      [P.provedor, dados.provedor],
      [P.nominatimUrl, dados.nominatimUrl.trim()],
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

  /**
   * Uma consulta ao serviço configurado. Não lança: falha vira
   * `{ tipo: 'erro' }`. Endereço em campos (cadastro) ou texto livre (o
   * "Testar" da tela) — em campos, o Nominatim confere a cidade e a UF.
   */
  async consultar(
    cfg: GeoConfig,
    endereco: EnderecoCliente | string,
  ): Promise<RespostaGeo> {
    if (cfg.provedor === 'nominatim') {
      return this.consultarNominatim(cfg, endereco);
    }
    const texto =
      typeof endereco === 'string' ? endereco : textoDoEndereco(endereco);
    if (!texto) {
      return {
        tipo: 'nao_encontrado',
        enderecoFormatado: null,
        precisao: null,
      };
    }
    return this.consultarGoogle(cfg, texto);
  }

  private async consultarNominatim(
    cfg: GeoConfig,
    endereco: EnderecoCliente | string,
  ): Promise<RespostaGeo> {
    const url = new URL(cfg.nominatimUrl);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'br');
    url.searchParams.set('accept-language', 'pt-BR');
    if (typeof endereco === 'string') {
      url.searchParams.set('q', endereco);
    } else {
      const rua = (endereco.endereco ?? '').trim();
      const municipio = (endereco.municipio ?? '').trim();
      const uf = (endereco.uf ?? '').trim();
      if (!rua || !municipio || !uf) {
        return {
          tipo: 'nao_encontrado',
          enderecoFormatado: null,
          precisao: null,
        };
      }
      // Busca estruturada; o CEP fica de fora — a base do OpenStreetMap tem
      // poucos CEPs, e um que não bate derruba o resultado.
      url.searchParams.set('street', rua);
      url.searchParams.set('city', municipio);
      url.searchParams.set('state', uf);
    }
    await aguardarVezNominatim();
    try {
      const resposta = await fetch(url, {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (resposta.status === 429 || resposta.status === 403) {
        return {
          tipo: 'erro',
          fatal: true,
          mensagem:
            resposta.status === 429
              ? 'O Nominatim recusou por excesso de consultas (limite de 1 por segundo). Tente mais tarde. (HTTP 429)'
              : 'O Nominatim bloqueou as consultas deste servidor. Use o Google ou um servidor Nominatim próprio. (HTTP 403)',
        };
      }
      const corpo: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok || corpo === null) {
        return {
          tipo: 'erro',
          fatal: false,
          mensagem: `Nominatim: HTTP ${resposta.status}`,
        };
      }
      return interpretarRespostaNominatim(
        corpo,
        typeof endereco === 'string' ? undefined : endereco,
      );
    } catch (falha) {
      return {
        tipo: 'erro',
        fatal: false,
        mensagem: `Sem resposta do Nominatim: ${(falha as Error).message}`,
      };
    }
  }

  private async consultarGoogle(
    cfg: GeoConfig,
    endereco: string,
  ): Promise<RespostaGeo> {
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

  /** O "Testar" da tela: lança 502 quando o serviço recusa, para mostrar o motivo. */
  async testar(
    empresaId: string,
    endereco: string,
  ): Promise<GeocodificacaoTesteResultado> {
    const cfg = await this.config(empresaId);
    const r = await this.consultar(cfg, endereco);
    if (r.tipo === 'erro') {
      throw new BadGatewayException(`A consulta foi recusada: ${r.mensagem}`);
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
    if (!enderecoParaConsultarAoSalvar(atual, input)) return nada;
    const cfg = await this.config(empresaId);
    if (!this.habilitado(cfg) || !cfg.aoSalvar) return nada;

    const r = await this.consultar(cfg, enderecoCombinado(atual, input));
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
