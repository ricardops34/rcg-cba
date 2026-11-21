import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type ProspeccaoLimites,
  type ProspeccaoCnae,
  type ProspeccaoColeta,
  type ProspeccaoColetaCriar,
  type ProspeccaoMunicipio,
} from '@plataforma/contracts';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { ReceitaBaseService } from '../receita-base/receita-base.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Coleta de empresas na base da Receita para virar lead
 * (docs/planos/2026-11-20-prospeccao-leads-receita.md, fase 3).
 *
 * Fonte e limites são parâmetros da empresa (PROSPECCAO_*, em Administração >
 * Base da Receita — ReceitaBaseService.prospeccao):
 *
 * - **pública** (MinhaReceita): **um município (código IBGE) e um CNAE por
 *   busca** — com dois CNAEs ela responde "busca muito custosa para o banco de
 *   dados, tente novamente em 1 minuto" (conferido em 20/11/2026). A coleta
 *   percorre cada combinação, com pausa entre buscas e teto de combinações;
 * - **própria**: sem trava (uso exclusivo), uma busca só com todos os
 *   municípios e CNAEs, sem pausa; recusada enquanto a base está carregando.
 *
 * Nas duas: até 1.000 por página, `cursor` para a próxima e `cursor: null` no
 * fim; vem toda situação cadastral que a fonte tiver (a pública, em Campo
 * Grande × supermercado: 213 ativas de 622) — só as ATIVAS viram lead.
 *
 * A coleta roda em segundo plano, uma por empresa de cada vez; o progresso das
 * combinações fica em memória (some num restart, e a coleta que estava rodando
 * é marcada como interrompida na próxima consulta).
 */

interface ConfigColeta {
  url: string;
  pausaMs: number;
  maxEmpresas: number;
}

/** Espera quando a fonte pede ("tente novamente em 1 minuto" ou 429). */
const ESPERA_LIMITE_MS = 61_000;
const TENTATIVAS_NO_LIMITE = 4;
const TIMEOUT_BUSCA_MS = 90_000;

interface EmpresaReceita {
  cnpj: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  descricao_situacao_cadastral?: string | null;
  data_inicio_atividade?: string | null;
  natureza_juridica?: string | null;
  codigo_natureza_juridica?: number | null;
  porte?: string | null;
  capital_social?: number | null;
  email?: string | null;
  ddd_telefone_1?: string | null;
  ddd_telefone_2?: string | null;
  descricao_tipo_de_logradouro?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  codigo_municipio?: number | null;
  codigo_municipio_ibge?: number | null;
  uf?: string | null;
  cep?: string | null;
  cnae_fiscal?: number | null;
  cnae_fiscal_descricao?: string | null;
  cnaes_secundarios?: { codigo: number; descricao: string }[] | null;
}

/**
 * Ids das tabelas de referência para as empresas de uma página
 * (docs/planos/2026-11-21-tabelas-referencia-compartilhadas.md): município
 * pelo IBGE (ou pelo código da Receita, para o que veio sem IBGE), natureza e
 * CNAE pelo código.
 */
interface ReferenciasPagina {
  municipioPorIbge: Map<string, string>;
  municipioPorReceita: Map<string, string>;
  natureza: Map<string, string>;
  cnae: Map<string, string>;
}

const codigoCnae = (v: number | string) => String(v).padStart(7, '0');

interface PaginaReceita {
  data?: EmpresaReceita[];
  cursor?: string | number | null;
  message?: string;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Telefone da Receita ("6792228826"; "000000000000" quando não há). */
function telefone(valor?: string | null) {
  const d = (valor ?? '').replace(/\D/g, '');
  return d.length >= 10 && !/^0+$/.test(d) ? d : null;
}

function texto(valor?: string | null) {
  const t = (valor ?? '').trim();
  return t ? t : null;
}

@Injectable()
export class ProspeccaoService {
  private readonly logger = new Logger(ProspeccaoService.name);
  /** Progresso em memória das coletas rodando, por id de coleta. */
  private readonly progresso = new Map<
    string,
    { feitas: number; total: number }
  >();
  /** Empresas com coleta em andamento neste processo. */
  private readonly rodando = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly receita: ReceitaBaseService,
  ) {}

  /** Fonte e limites em uso, para a tela de Prospecção. */
  async limites(empresaId: string): Promise<ProspeccaoLimites> {
    const c = await this.receita.prospeccao(empresaId);
    return {
      fonte: c.fonte,
      maxCombinacoes: c.maxCombinacoes,
      maxEmpresas: c.maxEmpresas,
    };
  }

  /** Municípios da UF com código IBGE, para o filtro da coleta. */
  async municipios(uf: string): Promise<ProspeccaoMunicipio[]> {
    const sigla = uf.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(sigla)) throw new BadRequestException('UF inválida');
    const linhas = await this.prisma.municipio.findMany({
      where: {
        deletedAt: null,
        codigoIbge: { not: null },
        estado: { sigla },
      },
      select: { codigoIbge: true, descricao: true },
      orderBy: { descricao: 'asc' },
    });
    return linhas.map((m) => ({
      codigoIbge: m.codigoIbge!,
      nome: m.descricao,
    }));
  }

  /** CNAEs (subclasse) pela descrição ou pelo código. */
  async cnaes(busca: string): Promise<ProspeccaoCnae[]> {
    const termo = busca.trim();
    const digitos = termo.replace(/\D/g, '');
    const linhas = await this.prisma.cnae.findMany({
      where: {
        deletedAt: null,
        ativo: true,
        codigoErp: { not: null },
        ...(termo
          ? {
              OR: [
                {
                  descricao: { contains: termo, mode: 'insensitive' as const },
                },
                ...(digitos.length >= 2
                  ? [{ codigoErp: { startsWith: digitos } }]
                  : []),
              ],
            }
          : {}),
      },
      select: { codigoErp: true, descricao: true },
      orderBy: { descricao: 'asc' },
      // Sem termo vem a lista inteira (~1.300 subclasses): a tela filtra.
      ...(termo ? { take: 50 } : {}),
    });
    return linhas
      .filter((c) => /^\d{7}$/.test(c.codigoErp ?? ''))
      .map((c) => ({ codigo: c.codigoErp!, descricao: c.descricao }));
  }

  async listarColetas(empresaId: string): Promise<ProspeccaoColeta[]> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      // Coleta "rodando" que não está neste processo morreu num restart.
      await tx.leadColeta.updateMany({
        where: {
          empresaId,
          situacao: 'rodando',
          id: { notIn: [...this.progresso.keys()] },
        },
        data: {
          situacao: 'erro',
          erro: 'Interrompida: o servidor reiniciou durante a coleta. Rode de novo — o que já foi importado não se repete.',
          concluidaEm: new Date(),
        },
      });
      const coletas = await tx.leadColeta.findMany({
        where: { empresaId },
        orderBy: { iniciadaEm: 'desc' },
        take: 30,
      });
      const usuarios = await tx.usuario.findMany({
        where: { id: { in: [...new Set(coletas.map((c) => c.usuarioId))] } },
        select: { id: true, nome: true },
      });
      const nome = new Map(usuarios.map((u) => [u.id, u.nome]));
      return coletas.map((c) => ({
        id: c.id,
        usuarioNome: nome.get(c.usuarioId) ?? null,
        filtros: c.filtros as unknown as ProspeccaoColeta['filtros'],
        situacao: c.situacao,
        encontrados: c.encontrados,
        jaClientes: c.jaClientes,
        jaLeads: c.jaLeads,
        inativos: c.inativos,
        importados: c.importados,
        progresso: this.progresso.get(c.id) ?? null,
        erro: c.erro,
        iniciadaEm: c.iniciadaEm.toISOString(),
        concluidaEm: c.concluidaEm?.toISOString() ?? null,
      }));
    });
  }

  async iniciarColeta(
    empresaId: string,
    user: AuthenticatedUser,
    input: ProspeccaoColetaCriar,
  ) {
    if (this.rodando.has(empresaId)) {
      throw new ConflictException(
        'Já há uma coleta rodando — espere ela terminar.',
      );
    }
    const cfg = await this.receita.prospeccao(empresaId);
    const combinacoesPedidas =
      new Set(input.municipios).size * new Set(input.cnaes).size;
    if (cfg.fonte === 'publica' && combinacoesPedidas > cfg.maxCombinacoes) {
      throw new BadRequestException(
        `A fonte pública aceita no máximo ${cfg.maxCombinacoes} buscas (município × atividade) por coleta; foram ${combinacoesPedidas}.`,
      );
    }
    if (
      cfg.fonte === 'propria' &&
      (await this.receita.cargaRodando(empresaId))
    ) {
      throw new ConflictException(
        'A base própria está sendo carregada; a coleta fica disponível quando a carga terminar.',
      );
    }
    // Nomes para o histórico da coleta (e para a tela): o que não existir na
    // base de municípios/CNAEs fica de fora.
    const [municipios, cnaes] = await Promise.all([
      this.prisma.municipio.findMany({
        where: {
          codigoIbge: { in: input.municipios },
          estado: { sigla: input.uf },
        },
        select: { codigoIbge: true, descricao: true },
      }),
      this.prisma.cnae.findMany({
        where: { codigoErp: { in: input.cnaes } },
        select: { codigoErp: true, descricao: true },
      }),
    ]);
    if (municipios.length !== new Set(input.municipios).size) {
      throw new BadRequestException(`Há município que não é de ${input.uf}`);
    }
    const filtros = {
      uf: input.uf,
      municipios: municipios.map((m) => ({
        codigo: m.codigoIbge!,
        nome: m.descricao,
      })),
      cnaes: [...new Set(input.cnaes)].map((c) => ({
        codigo: c,
        descricao: cnaes.find((x) => x.codigoErp === c)?.descricao ?? null,
      })),
    };

    this.rodando.add(empresaId);
    let coletaId: string;
    try {
      const coleta = await this.prisma.withTenant(empresaId, (tx) =>
        tx.leadColeta.create({
          data: {
            empresaId,
            usuarioId: user.id,
            filtros: filtros,
            fonte: cfg.url,
          },
        }),
      );
      coletaId = coleta.id;
    } catch (e) {
      this.rodando.delete(empresaId);
      throw e;
    }

    // Pública: uma busca por município × CNAE. Própria: uma busca com todos
    // (a fonte aceita vários valores separados por vírgula).
    const combinacoes =
      cfg.fonte === 'propria'
        ? [
            {
              municipio: filtros.municipios.map((m) => m.codigo).join(','),
              cnae: filtros.cnaes.map((c) => c.codigo).join(','),
            },
          ]
        : filtros.municipios.flatMap((m) =>
            filtros.cnaes.map((c) => ({ municipio: m.codigo, cnae: c.codigo })),
          );
    this.progresso.set(coletaId, { feitas: 0, total: combinacoes.length });
    void this.executar(empresaId, user.id, coletaId, input.uf, combinacoes, {
      url: cfg.url,
      pausaMs: cfg.pausaMs,
      maxEmpresas: cfg.maxEmpresas,
    });
    return { id: coletaId };
  }

  private async executar(
    empresaId: string,
    usuarioId: string,
    coletaId: string,
    uf: string,
    combinacoes: { municipio: string; cnae: string }[],
    cfg: ConfigColeta,
  ) {
    const totais = {
      encontrados: 0,
      jaClientes: 0,
      jaLeads: 0,
      inativos: 0,
      importados: 0,
    };
    let aviso: string | null = null;
    try {
      laco: for (const [i, combo] of combinacoes.entries()) {
        let cursor: string | null = null;
        do {
          const pagina = await this.buscar(
            cfg.url,
            uf,
            combo.municipio,
            combo.cnae,
            cursor,
          );
          const empresas = pagina.data ?? [];
          await this.gravarPagina(
            empresaId,
            usuarioId,
            coletaId,
            empresas,
            totais,
          );
          cursor = pagina.cursor == null ? null : String(pagina.cursor);
          if (totais.encontrados >= cfg.maxEmpresas) {
            aviso = `Parou no limite de ${cfg.maxEmpresas.toLocaleString('pt-BR')} empresas lidas por coleta (Administração > Base da Receita). Para o resto, rode outra coleta com menos municípios ou CNAEs.`;
            break laco;
          }
          if (cfg.pausaMs > 0) await dormir(cfg.pausaMs);
        } while (cursor);
        this.progresso.set(coletaId, {
          feitas: i + 1,
          total: combinacoes.length,
        });
      }
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.leadColeta.update({
          where: { id: coletaId },
          data: {
            ...totais,
            situacao: 'concluida',
            erro: aviso,
            concluidaEm: new Date(),
          },
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Coleta ${coletaId} interrompida: ${msg}`);
      await this.prisma
        .withTenant(empresaId, (tx) =>
          tx.leadColeta.update({
            where: { id: coletaId },
            data: {
              ...totais,
              situacao: 'erro',
              erro: `${msg} O que já foi importado fica; rode de novo para continuar (não repete).`,
              concluidaEm: new Date(),
            },
          }),
        )
        .catch(() => undefined);
    } finally {
      this.progresso.delete(coletaId);
      this.rodando.delete(empresaId);
    }
  }

  /** Uma página da fonte, esperando e repetindo quando ela pede. */
  private async buscar(
    base: string,
    uf: string,
    municipio: string,
    cnae: string,
    cursor: string | null,
  ): Promise<PaginaReceita> {
    const url = new URL(base);
    url.searchParams.set('uf', uf);
    url.searchParams.set('municipio', municipio);
    url.searchParams.set('cnae_fiscal', cnae);
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);

    for (let tentativa = 1; ; tentativa++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_BUSCA_MS);
      let status = 0;
      let corpo: PaginaReceita = {};
      try {
        const resposta = await fetch(url, { signal: controller.signal });
        status = resposta.status;
        corpo = (await resposta.json().catch(() => ({}))) as PaginaReceita;
      } catch {
        status = 0;
      } finally {
        clearTimeout(timer);
      }

      if (status === 200 && Array.isArray(corpo.data)) return corpo;

      const pediuEspera =
        status === 429 ||
        status === 0 ||
        status >= 500 ||
        /tente novamente|custosa/i.test(corpo.message ?? '');
      if (pediuEspera && tentativa < TENTATIVAS_NO_LIMITE) {
        await dormir(ESPERA_LIMITE_MS);
        continue;
      }
      throw new Error(
        status === 0
          ? 'A base da Receita não respondeu.'
          : `A base da Receita recusou a busca (${status}${corpo.message ? `: ${corpo.message}` : ''}).`,
      );
    }
  }

  /**
   * Classifica e grava uma página: só ATIVA vira lead; o que já é cliente
   * (mesmo CNPJ) ou já é lead fica de fora e entra na contagem.
   */
  private async gravarPagina(
    empresaId: string,
    usuarioId: string,
    coletaId: string,
    empresas: EmpresaReceita[],
    totais: {
      encontrados: number;
      jaClientes: number;
      jaLeads: number;
      inativos: number;
      importados: number;
    },
  ) {
    if (empresas.length === 0) return;
    await this.prisma.withTenant(
      empresaId,
      async (tx) => {
        const cnpjs = empresas.map((e) => e.cnpj);
        const [clientes, leads] = await Promise.all([
          tx.cliente.findMany({
            where: { empresaId, cnpjCpf: { in: cnpjs } },
            select: { cnpjCpf: true },
          }),
          tx.lead.findMany({
            where: { empresaId, cnpj: { in: cnpjs } },
            select: { cnpj: true },
          }),
        ]);
        const ehCliente = new Set(clientes.map((c) => c.cnpjCpf));
        const ehLead = new Set(leads.map((l) => l.cnpj));
        const refs = await this.referenciasDaPagina(tx, empresas);

        for (const e of empresas) {
          totais.encontrados++;
          if (
            (e.descricao_situacao_cadastral ?? '').toUpperCase() !== 'ATIVA'
          ) {
            totais.inativos++;
          } else if (ehCliente.has(e.cnpj)) {
            totais.jaClientes++;
          } else if (ehLead.has(e.cnpj)) {
            totais.jaLeads++;
          } else {
            await this.criarLead(tx, empresaId, usuarioId, coletaId, e, refs);
            ehLead.add(e.cnpj);
            totais.importados++;
          }
        }
        await tx.leadColeta.update({
          where: { id: coletaId },
          data: { ...totais },
        });
      },
      { timeout: 120_000 },
    );
  }

  /** Referências globais (sem RLS) das empresas de uma página, numa ida só. */
  private async referenciasDaPagina(
    tx: TenantTx,
    empresas: EmpresaReceita[],
  ): Promise<ReferenciasPagina> {
    const ibges = new Set<string>();
    const receitas = new Set<string>();
    const naturezas = new Set<string>();
    const cnaes = new Set<string>();
    for (const e of empresas) {
      if (e.codigo_municipio_ibge) ibges.add(String(e.codigo_municipio_ibge));
      else if (e.codigo_municipio)
        receitas.add(String(e.codigo_municipio).padStart(4, '0'));
      if (e.codigo_natureza_juridica)
        naturezas.add(String(e.codigo_natureza_juridica).padStart(4, '0'));
      if (e.cnae_fiscal) cnaes.add(codigoCnae(e.cnae_fiscal));
      for (const c of e.cnaes_secundarios ?? [])
        if (c.codigo) cnaes.add(codigoCnae(c.codigo));
    }
    // Conjunto vazio vira `in: []`: o Prisma devolve vazio sem ir ao banco.
    const [porIbge, porReceita, nats, cns] = await Promise.all([
      tx.municipio.findMany({
        where: { deletedAt: null, codigoIbge: { in: [...ibges] } },
        select: { id: true, codigoIbge: true },
      }),
      tx.municipio.findMany({
        where: { deletedAt: null, codigoReceita: { in: [...receitas] } },
        select: { id: true, codigoReceita: true },
      }),
      tx.naturezaJuridica.findMany({
        where: { codigo: { in: [...naturezas] } },
        select: { id: true, codigo: true },
      }),
      tx.cnae.findMany({
        where: { codigoErp: { in: [...cnaes] } },
        select: { id: true, codigoErp: true },
      }),
    ]);
    return {
      municipioPorIbge: new Map(
        porIbge.map((m): [string, string] => [m.codigoIbge!, m.id]),
      ),
      municipioPorReceita: new Map(
        porReceita.map((m): [string, string] => [m.codigoReceita!, m.id]),
      ),
      natureza: new Map(nats.map((n): [string, string] => [n.codigo, n.id])),
      cnae: new Map(cns.map((c): [string, string] => [c.codigoErp!, c.id])),
    };
  }

  private async criarLead(
    tx: TenantTx,
    empresaId: string,
    usuarioId: string,
    coletaId: string,
    e: EmpresaReceita,
    refs: ReferenciasPagina,
  ) {
    const endereco = [
      [texto(e.descricao_tipo_de_logradouro), texto(e.logradouro)]
        .filter(Boolean)
        .join(' '),
      texto(e.numero),
      texto(e.complemento),
    ]
      .filter(Boolean)
      .join(', ');
    const cnaes = [
      ...(e.cnae_fiscal
        ? [
            {
              codigo: codigoCnae(e.cnae_fiscal),
              descricao: texto(e.cnae_fiscal_descricao),
              cnaeId: refs.cnae.get(codigoCnae(e.cnae_fiscal)) ?? null,
              principal: true,
            },
          ]
        : []),
      ...(e.cnaes_secundarios ?? [])
        .filter((c) => c.codigo)
        .map((c) => ({
          codigo: codigoCnae(c.codigo),
          descricao: texto(c.descricao),
          cnaeId: refs.cnae.get(codigoCnae(c.codigo)) ?? null,
          principal: false,
        })),
    ];
    // Um código só uma vez (a fonte às vezes repete o principal nos secundários).
    const unicos = [...new Map(cnaes.map((c) => [c.codigo, c])).values()];

    await tx.lead.create({
      data: {
        empresaId,
        origem: 'receita',
        situacao: 'novo',
        temperatura: 'frio',
        cnpj: e.cnpj,
        razaoSocial: texto(e.razao_social),
        nomeFantasia: texto(e.nome_fantasia),
        situacaoCadastral: texto(e.descricao_situacao_cadastral),
        dataAbertura: e.data_inicio_atividade
          ? new Date(`${e.data_inicio_atividade}T00:00:00Z`)
          : null,
        naturezaJuridica: texto(e.natureza_juridica),
        porte: texto(e.porte),
        capitalSocial: e.capital_social ?? null,
        email: texto(e.email)?.toLowerCase() ?? null,
        telefone: telefone(e.ddd_telefone_1),
        telefone2: telefone(e.ddd_telefone_2),
        endereco: endereco || null,
        bairro: texto(e.bairro),
        municipio: texto(e.municipio),
        uf: texto(e.uf),
        cep: texto(e.cep),
        municipioId:
          (e.codigo_municipio_ibge
            ? refs.municipioPorIbge.get(String(e.codigo_municipio_ibge))
            : e.codigo_municipio
              ? refs.municipioPorReceita.get(
                  String(e.codigo_municipio).padStart(4, '0'),
                )
              : undefined) ?? null,
        naturezaJuridicaId: e.codigo_natureza_juridica
          ? (refs.natureza.get(
              String(e.codigo_natureza_juridica).padStart(4, '0'),
            ) ?? null)
          : null,
        dadosReceita: e as unknown as Prisma.InputJsonValue,
        coletaId,
        coletadoEm: new Date(),
        coletadoPor: usuarioId,
        cnaes: {
          createMany: {
            data: unicos.map((c) => ({ empresaId, ...c })),
          },
        },
      },
    });
  }
}
