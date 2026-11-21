import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PROSPECCAO_PADRAO_MAX_COMBINACOES,
  PROSPECCAO_PADRAO_MAX_EMPRESAS,
  PROSPECCAO_PADRAO_PAUSA_MS,
  type ProspeccaoFonte,
  type ProspeccaoLimites,
  type ReceitaBaseConfig,
  type ReceitaBaseConfigSalvar,
  type ReceitaBaseEstado,
  type ReceitaReferenciasResumo,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ParametrosService } from '../parametros/parametros.service';
import { cifrarParametro } from '../parametros/parametros-cripto';
import { BASE_URLS } from '../../common/external-http/external-http.service';

/**
 * Administração > Base da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md).
 *
 * Tudo é parâmetro da empresa (pedido do usuário, 2026-11-20), gravado pela
 * tela como nas outras rotinas da Administração (mesmo desenho do GEO_*):
 *
 * - RECEITA_*: estados e situações que a empresa quer na base própria, e como
 *   chegar nela (URL da API de consulta, URL e token do controle — o ambiente
 *   `MINHARECEITA_*` é só o padrão, a tela vence);
 * - PROSPECCAO_*: de onde a coleta de leads busca e os limites dela.
 *
 * A base é uma só para a instalação: a carga grava a **união** dos estados e
 * situações de todas as empresas, para uma não tirar da base o que a outra usa.
 */
export const RECEITA_PARAMETROS = {
  ufs: {
    parametro: 'RECEITA_UFS',
    tipo: 'texto',
    tamanho: 200,
    padrao: '',
    descricao:
      'Estados que a empresa quer na base própria da Receita (separados por vírgula)',
  },
  situacoes: {
    parametro: 'RECEITA_SITUACOES',
    tipo: 'texto',
    tamanho: 50,
    padrao: '02',
    descricao:
      'Situações cadastrais mantidas na base própria (02 ativa, 03 suspensa, 04 inapta, 08 baixada, 01 nula)',
  },
  propriaUrl: {
    parametro: 'RECEITA_PROPRIA_URL',
    tipo: 'texto',
    tamanho: 300,
    padrao: '',
    descricao:
      'URL da API de consulta da base própria (vazio = MINHARECEITA_PROPRIA_URL do ambiente)',
  },
  controleUrl: {
    parametro: 'RECEITA_CONTROLE_URL',
    tipo: 'texto',
    tamanho: 300,
    padrao: '',
    descricao:
      'URL do serviço de controle da base própria (vazio = MINHARECEITA_CONTROLE_URL do ambiente)',
  },
  controleToken: {
    parametro: 'RECEITA_CONTROLE_TOKEN',
    tipo: 'senha',
    tamanho: 200,
    padrao: null,
    descricao:
      'Token do serviço de controle da base própria (o mesmo CONTROLE_TOKEN da stack)',
  },
  fonte: {
    parametro: 'PROSPECCAO_FONTE',
    tipo: 'texto',
    tamanho: 20,
    padrao: 'publica',
    descricao:
      'De onde a coleta de leads busca as empresas: publica (MinhaReceita) ou propria (base própria)',
  },
  maxCombinacoes: {
    parametro: 'PROSPECCAO_MAX_COMBINACOES',
    tipo: 'numero',
    tamanho: 5,
    padrao: String(PROSPECCAO_PADRAO_MAX_COMBINACOES),
    descricao: 'Fonte pública: máximo de buscas (município × CNAE) por coleta',
  },
  maxEmpresas: {
    parametro: 'PROSPECCAO_MAX_EMPRESAS',
    tipo: 'numero',
    tamanho: 7,
    padrao: String(PROSPECCAO_PADRAO_MAX_EMPRESAS),
    descricao:
      'Máximo de empresas lidas por coleta de leads (todas as situações)',
  },
  downloadConexoes: {
    parametro: 'RECEITA_DOWNLOAD_CONEXOES',
    tipo: 'numero',
    tamanho: 2,
    padrao: '4',
    descricao:
      'Carga da base própria: conexões simultâneas com o servidor da Receita',
  },
  downloadRetentativas: {
    parametro: 'RECEITA_DOWNLOAD_RETENTATIVAS',
    tipo: 'numero',
    tamanho: 4,
    padrao: '30',
    descricao:
      'Carga da base própria: tentativas por parte do arquivo quando a Receita falha',
  },
  downloadEsperaS: {
    parametro: 'RECEITA_DOWNLOAD_ESPERA_S',
    tipo: 'numero',
    tamanho: 3,
    padrao: '15',
    descricao:
      'Carga da base própria: segundos de espera entre as tentativas do download',
  },
  pausaMs: {
    parametro: 'PROSPECCAO_PAUSA_MS',
    tipo: 'numero',
    tamanho: 6,
    padrao: String(PROSPECCAO_PADRAO_PAUSA_MS),
    descricao: 'Fonte pública: pausa entre buscas da coleta, em milissegundos',
  },
} as const;

const lista = (v: string | null) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);

const semBarraFinal = (u: string) => u.replace(/\/+$/, '');

interface Acesso {
  propriaUrl: string | null;
  controleUrl: string | null;
  controleToken: string | null;
}

@Injectable()
export class ReceitaBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  private padroes() {
    return {
      propriaUrl: process.env.MINHARECEITA_PROPRIA_URL?.trim() || null,
      controleUrl: process.env.MINHARECEITA_CONTROLE_URL?.trim() || null,
      controleToken: process.env.MINHARECEITA_CONTROLE_TOKEN?.trim() || null,
    };
  }

  async config(empresaId: string): Promise<ReceitaBaseConfig> {
    const P = RECEITA_PARAMETROS;
    const texto = async (p: { parametro: string }) =>
      ((await this.parametros.obterTexto(empresaId, p.parametro)) ?? '').trim();
    const numero = (p: { parametro: string; padrao: string }) =>
      this.parametros.obterNumero(empresaId, p.parametro, Number(p.padrao));
    const fonte = await texto(P.fonte);
    const padroes = this.padroes();
    return {
      ufs: lista(await texto(P.ufs)) as ReceitaBaseConfig['ufs'],
      situacoes: (lista(await texto(P.situacoes)).length
        ? lista(await texto(P.situacoes))
        : ['02']) as ReceitaBaseConfig['situacoes'],
      propriaUrl: await texto(P.propriaUrl),
      controleUrl: await texto(P.controleUrl),
      temControleToken: !!(await texto(P.controleToken)),
      fonte: fonte === 'propria' ? 'propria' : 'publica',
      maxCombinacoes: await numero(P.maxCombinacoes),
      maxEmpresas: await numero(P.maxEmpresas),
      pausaMs: await numero(P.pausaMs),
      downloadConexoes: await numero(P.downloadConexoes),
      downloadRetentativas: await numero(P.downloadRetentativas),
      downloadEsperaS: await numero(P.downloadEsperaS),
      padroes: {
        propriaUrl: padroes.propriaUrl,
        controleUrl: padroes.controleUrl,
        temControleToken: !!padroes.controleToken,
      },
    };
  }

  async salvarConfig(
    empresaId: string,
    autor: string,
    dados: ReceitaBaseConfigSalvar,
  ) {
    const P = RECEITA_PARAMETROS;
    const valores: Array<[(typeof P)[keyof typeof P], string]> = [
      [P.ufs, [...new Set(dados.ufs)].sort().join(',')],
      [P.situacoes, [...new Set(dados.situacoes)].sort().join(',')],
      [P.propriaUrl, dados.propriaUrl.trim()],
      [P.controleUrl, dados.controleUrl.trim()],
      [P.fonte, dados.fonte],
      [P.maxCombinacoes, String(dados.maxCombinacoes)],
      [P.maxEmpresas, String(dados.maxEmpresas)],
      [P.pausaMs, String(dados.pausaMs)],
      [P.downloadConexoes, String(dados.downloadConexoes)],
      [P.downloadRetentativas, String(dados.downloadRetentativas)],
      [P.downloadEsperaS, String(dados.downloadEsperaS)],
    ];
    // Cifrado (PARAMETROS_CRYPTO_KEY), antes da transação: sem a chave mestra o
    // salvamento inteiro é recusado, sem gravar a metade.
    if (dados.controleToken?.trim()) {
      if (dados.controleToken.trim().length < 16)
        throw new BadRequestException(
          'O token do controle tem ao menos 16 caracteres',
        );
      valores.push([
        P.controleToken,
        cifrarParametro(dados.controleToken.trim()),
      ]);
    }
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
    return this.config(empresaId);
  }

  /** URLs e token em uso: o parâmetro da empresa, ou o do ambiente. */
  private async acesso(empresaId: string): Promise<Acesso> {
    const P = RECEITA_PARAMETROS;
    const padroes = this.padroes();
    const ler = async (p: { parametro: string }) =>
      (
        (await this.parametros.obterTexto(empresaId, p.parametro)) ?? ''
      ).trim() || null;
    const propriaUrl = (await ler(P.propriaUrl)) ?? padroes.propriaUrl;
    const controleUrl = (await ler(P.controleUrl)) ?? padroes.controleUrl;
    return {
      propriaUrl: propriaUrl ? semBarraFinal(propriaUrl) : null,
      controleUrl: controleUrl ? semBarraFinal(controleUrl) : null,
      controleToken: (await ler(P.controleToken)) ?? padroes.controleToken,
    };
  }

  /** Também usado por ReceitaReferenciasService (referências e CEPs demoram mais). */
  async chamarControle<T>(
    empresaId: string,
    metodo: 'GET' | 'POST',
    caminho: string,
    corpo?: unknown,
    timeoutMs = 20_000,
  ): Promise<{ status: number; corpo: T | { message?: string } }> {
    const a = await this.acesso(empresaId);
    if (!a.controleUrl || !a.controleToken) {
      throw new ServiceUnavailableException(
        'Base própria não configurada: informe a URL e o token do controle em Administração > Base da Receita.',
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(`${a.controleUrl}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${a.controleToken}`,
          'Content-Type': 'application/json',
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: controller.signal,
      });
      const json = (await r.json().catch(() => ({}))) as
        T | { message?: string };
      return { status: r.status, corpo: json };
    } catch {
      throw new ServiceUnavailableException(
        'O serviço de controle da base própria não respondeu. Confira a URL e se a stack está no ar.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * União dos estados e situações de todas as empresas: o que a próxima carga
   * grava. Os parâmetros têm RLS por empresa, então cada uma é lida no próprio
   * contexto; a lista de empresas é global (modo sistema, só leitura do id).
   */
  async proximaCarga(): Promise<ReceitaBaseEstado['proximaCarga']> {
    const empresas = await this.prisma.withSistema((tx) =>
      tx.empresa.findMany({
        where: { deletedAt: null },
        select: { id: true, nomeFantasia: true, razaoSocial: true },
      }),
    );
    const ufs = new Set<string>();
    const situacoes = new Set<string>();
    const porEmpresa: { nome: string; ufs: string[] }[] = [];
    for (const e of empresas) {
      const u = lista(
        await this.parametros.obterTexto(
          e.id,
          RECEITA_PARAMETROS.ufs.parametro,
        ),
      );
      if (u.length === 0) continue;
      const s = lista(
        await this.parametros.obterTexto(
          e.id,
          RECEITA_PARAMETROS.situacoes.parametro,
        ),
      );
      u.forEach((x) => ufs.add(x));
      (s.length ? s : ['02']).forEach((x) => situacoes.add(x));
      porEmpresa.push({
        nome: e.nomeFantasia || e.razaoSocial || e.id,
        ufs: u,
      });
    }
    return {
      ufs: [...ufs].sort(),
      situacoes: [...situacoes].sort(),
      empresas: porEmpresa,
    };
  }

  /** Contagens das tabelas de referência (globais, sem RLS). */
  async resumoReferencias(): Promise<ReceitaReferenciasResumo> {
    const [
      municipios,
      municipiosComCodigoReceita,
      naturezas,
      cnaes,
      cepsReceita,
    ] = await Promise.all([
      this.prisma.municipio.count({ where: { deletedAt: null } }),
      this.prisma.municipio.count({
        where: { deletedAt: null, codigoReceita: { not: null } },
      }),
      this.prisma.naturezaJuridica.count(),
      this.prisma.cnae.count({ where: { deletedAt: null } }),
      this.prisma.cep.count({ where: { origem: 'receita' } }),
    ]);
    return {
      municipios,
      municipiosComCodigoReceita,
      naturezas,
      cnaes,
      cepsReceita,
    };
  }

  async estado(empresaId: string): Promise<ReceitaBaseEstado> {
    const [proximaCarga, referencias] = await Promise.all([
      this.proximaCarga(),
      this.resumoReferencias(),
    ]);
    try {
      const r = await this.chamarControle<{
        carga: ReceitaBaseEstado['carga'];
        base: ReceitaBaseEstado['base'];
        erroBase: string;
        mesMaisRecente: string;
      }>(empresaId, 'GET', '/estado');
      if (r.status !== 200 || !('carga' in r.corpo)) {
        return {
          disponivel: false,
          erro: `O controle recusou (${r.status}${'message' in r.corpo && r.corpo.message ? `: ${r.corpo.message}` : ''}).`,
          carga: null,
          base: null,
          mesMaisRecente: null,
          proximaCarga,
          referencias,
        };
      }
      return {
        disponivel: true,
        erro: r.corpo.erroBase || null,
        carga: r.corpo.carga,
        base: r.corpo.base,
        mesMaisRecente: r.corpo.mesMaisRecente || null,
        proximaCarga,
        referencias,
      };
    } catch (e) {
      return {
        disponivel: false,
        erro: e instanceof Error ? e.message : String(e),
        carga: null,
        base: null,
        mesMaisRecente: null,
        proximaCarga,
        referencias,
      };
    }
  }

  /** Dispara a carga com a união das empresas. */
  async carregar(empresaId: string, mes?: string) {
    const proxima = await this.proximaCarga();
    // Download: parâmetros da empresa que dispara a carga.
    const cfg = await this.config(empresaId);
    if (proxima.ufs.length === 0) {
      throw new BadRequestException(
        'Nenhum estado marcado: escolha ao menos um estado antes de carregar (senão a base viria com o Brasil inteiro).',
      );
    }
    // Pares código da Receita → IBGE da nossa tabela de municípios, para os
    // estados da carga: a tabela do Tesouro que a carga usa atrasa em
    // município novo (Boa Esperança do Norte-MT, 2023, ficou sem IBGE em
    // 2026-11). O controle os grava ao lado dela (patch 0005). Vazio enquanto
    // ninguém rodou "Atualizar referências" — a carga segue só com o Tesouro.
    const municipios = await this.prisma.municipio.findMany({
      where: {
        deletedAt: null,
        codigoIbge: { not: null },
        codigoReceita: { not: null },
        estado: { sigla: { in: proxima.ufs } },
      },
      select: {
        codigoIbge: true,
        codigoReceita: true,
        estado: { select: { sigla: true } },
      },
    });
    const r = await this.chamarControle<{ mes: string }>(
      empresaId,
      'POST',
      '/carga',
      {
        mes: mes ?? '',
        ufs: proxima.ufs,
        situacoes: proxima.situacoes,
        conexoes: cfg.downloadConexoes,
        retentativas: cfg.downloadRetentativas,
        esperaS: cfg.downloadEsperaS,
        municipios: municipios
          .filter(
            (m) =>
              m.estado &&
              /^\d{7}$/.test(m.codigoIbge ?? '') &&
              /^\d{4}$/.test(m.codigoReceita ?? ''),
          )
          .map((m) => ({
            codigoReceita: m.codigoReceita!,
            uf: m.estado!.sigla,
            ibge: Number(m.codigoIbge),
          })),
      },
    );
    if (r.status === 409)
      throw new ConflictException('Já há uma carga rodando.');
    if (r.status !== 202) {
      const msg = 'message' in r.corpo ? r.corpo.message : undefined;
      throw new BadRequestException(
        `O controle recusou a carga${msg ? `: ${msg}` : ''}.`,
      );
    }
    return r.corpo as { mes: string };
  }

  /** Para a prospecção: fonte, limites e de onde buscar. */
  async prospeccao(
    empresaId: string,
  ): Promise<ProspeccaoLimites & { pausaMs: number; url: string }> {
    const c = await this.config(empresaId);
    const fonte: ProspeccaoFonte = c.fonte;
    if (fonte === 'publica') {
      return {
        fonte,
        maxCombinacoes: c.maxCombinacoes,
        maxEmpresas: c.maxEmpresas,
        pausaMs: c.pausaMs,
        url: BASE_URLS.minhaReceita(),
      };
    }
    const a = await this.acesso(empresaId);
    if (!a.propriaUrl) {
      throw new ServiceUnavailableException(
        'A coleta está na base própria, mas a URL dela não foi informada em Administração > Base da Receita.',
      );
    }
    return {
      fonte,
      maxCombinacoes: c.maxCombinacoes,
      maxEmpresas: c.maxEmpresas,
      pausaMs: 0,
      url: a.propriaUrl,
    };
  }

  /** Base própria no meio de uma carga: vazia ou incompleta. */
  async cargaRodando(empresaId: string): Promise<boolean> {
    try {
      const r = await this.chamarControle<{ carga?: { rodando?: boolean } }>(
        empresaId,
        'GET',
        '/estado',
      );
      return 'carga' in r.corpo && !!r.corpo.carga?.rodando;
    } catch {
      return false;
    }
  }
}
