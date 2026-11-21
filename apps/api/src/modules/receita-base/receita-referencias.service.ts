import {
  BadGatewayException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type {
  ReceitaCepsResultado,
  ReceitaReferenciasResultado,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReceitaBaseService } from './receita-base.service';

/**
 * Tabelas de referência compartilhadas com a Receita
 * (docs/planos/2026-11-21-tabelas-referencia-compartilhadas.md).
 *
 * A plataforma é a fonte única: em vez de cada lado ter a sua tabela, as
 * nossas referências guardam os códigos da Receita.
 * - Município: `codigoReceita`, pela tabela do Tesouro (código da Receita ↔
 *   IBGE). Município que o Tesouro ainda não traz (Boa Esperança do
 *   Norte-MT, 2023) casa pelo nome + UF com a lista da própria Receita.
 * - Natureza jurídica: tabela nova, pelo código da Receita.
 * - CNAE: o código já é o mesmo do IBGE; entram só os que a Receita usa e a
 *   tabela não tinha.
 * - CEP: os CEPs distintos da base própria, com o endereço mais frequente;
 *   só os que a tabela ainda não tem (o ViaCEP não é sobrescrito).
 *
 * As tabelas são globais (sem empresaId, sem RLS): uma empresa atualiza para
 * todas, como a base própria, que também é uma só.
 */

interface ReferenciasControle {
  mes: string;
  tesouro: { codigoReceita: string; nome: string; uf: string; ibge: string }[];
  municipios: { codigo: string; descricao: string }[];
  naturezas: { codigo: string; descricao: string }[];
  cnaes: { codigo: string; descricao: string }[];
}

interface CepControle {
  cep: string;
  uf: string;
  codigoReceita: string;
  bairro: string;
  endereco: string;
  empresas: number;
}

/** Sem acento, apóstrofo, hífen e caixa: "Santa Bárbara d'Oeste" = "SANTA BARBARA DOESTE". */
export const normalizarNome = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`´]/g, '')
    .replace(/-/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

const LOTE = 1000;

@Injectable()
export class ReceitaReferenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly base: ReceitaBaseService,
  ) {}

  private erroControle(
    status: number,
    corpo: { message?: string },
    oQue: string,
  ): never {
    if (status === 409) {
      throw new ConflictException(
        corpo.message ?? 'Há uma carga rodando; tente depois que ela terminar.',
      );
    }
    throw new BadGatewayException(
      `Não foi possível ${oQue} (${status}${corpo.message ? `: ${corpo.message}` : ''}).`,
    );
  }

  async atualizarReferencias(
    empresaId: string,
  ): Promise<ReceitaReferenciasResultado> {
    // O controle baixa do Tesouro e da Receita, com tentativas: pode demorar.
    const r = await this.base.chamarControle<ReferenciasControle>(
      empresaId,
      'GET',
      '/referencias',
      undefined,
      5 * 60_000,
    );
    if (r.status !== 200 || !('tesouro' in r.corpo)) {
      this.erroControle(
        r.status,
        r.corpo as { message?: string },
        'baixar as referências',
      );
    }
    const refs = r.corpo;

    // --- Municípios -------------------------------------------------------
    const plataforma = await this.prisma.municipio.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        descricao: true,
        codigoIbge: true,
        codigoReceita: true,
        estado: { select: { sigla: true } },
      },
    });
    const porIbge = new Map(
      plataforma.filter((m) => m.codigoIbge).map((m) => [m.codigoIbge!, m]),
    );
    const codigoDe = new Map<string, string>(); // municipioId → código da Receita
    const codigosDoTesouro = new Set<string>();
    for (const t of refs.tesouro) {
      const cod = t.codigoReceita.padStart(4, '0');
      codigosDoTesouro.add(cod);
      const m = porIbge.get(t.ibge);
      if (m) codigoDe.set(m.id, cod);
    }
    const municipiosPeloTesouro = codigoDe.size;

    // O que o Tesouro não traz: a lista da Receita não tem UF, então só casa
    // quando o nome aparece uma vez entre os municípios ainda sem código.
    const semCodigoPorNome = new Map<string, typeof plataforma>();
    for (const m of plataforma) {
      if (codigoDe.has(m.id)) continue;
      const k = normalizarNome(m.descricao);
      semCodigoPorNome.set(k, [...(semCodigoPorNome.get(k) ?? []), m]);
    }
    const municipiosPeloNome: ReceitaReferenciasResultado['municipiosPeloNome'] =
      [];
    for (const rm of refs.municipios) {
      const cod = rm.codigo.padStart(4, '0');
      if (codigosDoTesouro.has(cod)) continue;
      const cands = semCodigoPorNome.get(normalizarNome(rm.descricao));
      if (cands?.length !== 1 || codigoDe.has(cands[0].id)) continue;
      codigoDe.set(cands[0].id, cod);
      municipiosPeloNome.push({
        nome: cands[0].descricao,
        uf: cands[0].estado?.sigla ?? null,
        codigoReceita: cod,
      });
    }

    const mudar = plataforma.filter(
      (m) => codigoDe.has(m.id) && m.codigoReceita !== codigoDe.get(m.id),
    );
    for (let i = 0; i < mudar.length; i += LOTE) {
      await this.prisma.$transaction(
        mudar.slice(i, i + LOTE).map((m) =>
          this.prisma.municipio.update({
            where: { id: m.id },
            data: { codigoReceita: codigoDe.get(m.id) },
          }),
        ),
      );
    }

    // --- Naturezas jurídicas ----------------------------------------------
    const naturezasAtuais = new Map(
      (
        await this.prisma.naturezaJuridica.findMany({
          select: { codigo: true, descricao: true },
        })
      ).map((n) => [n.codigo, n.descricao]),
    );
    const naturezas = refs.naturezas.map((n) => ({
      codigo: n.codigo.padStart(4, '0'),
      descricao: n.descricao,
    }));
    const naturezasNovas = naturezas.filter(
      (n) => !naturezasAtuais.has(n.codigo),
    );
    const naturezasMudaram = naturezas.filter(
      (n) =>
        naturezasAtuais.has(n.codigo) &&
        naturezasAtuais.get(n.codigo) !== n.descricao,
    );
    if (naturezasNovas.length) {
      await this.prisma.naturezaJuridica.createMany({
        data: naturezasNovas,
        skipDuplicates: true,
      });
    }
    if (naturezasMudaram.length) {
      await this.prisma.$transaction(
        naturezasMudaram.map((n) =>
          this.prisma.naturezaJuridica.update({
            where: { codigo: n.codigo },
            data: { descricao: n.descricao },
          }),
        ),
      );
    }

    // --- CNAEs: só os que faltam (a descrição do IBGE é a oficial) ---------
    const cnaesAtuais = new Set(
      (
        await this.prisma.cnae.findMany({
          where: { codigoErp: { not: null } },
          select: { codigoErp: true },
        })
      ).map((c) => c.codigoErp!),
    );
    const cnaesNovos = refs.cnaes
      .map((c) => ({
        codigo: c.codigo.padStart(7, '0'),
        descricao: c.descricao,
      }))
      .filter((c) => /^\d{7}$/.test(c.codigo) && !cnaesAtuais.has(c.codigo));
    if (cnaesNovos.length) {
      await this.prisma.cnae.createMany({
        data: cnaesNovos.map((c) => ({
          codigoErp: c.codigo,
          subclasse: c.codigo,
          descricao: c.descricao,
        })),
        skipDuplicates: true,
      });
    }

    return {
      mes: refs.mes,
      municipiosAtualizados: mudar.length,
      municipiosPeloTesouro,
      municipiosPeloNome,
      municipiosSemCodigo: plataforma
        .filter((m) => !codigoDe.has(m.id))
        .map((m) => ({ nome: m.descricao, uf: m.estado?.sigla ?? null })),
      naturezasNovas: naturezasNovas.length,
      naturezasAtualizadas: naturezasMudaram.length,
      cnaesNovos,
    };
  }

  async atualizarCeps(empresaId: string): Promise<ReceitaCepsResultado> {
    // ~2 min 20 s para MS+MT (969 mil empresas, 42 mil CEPs); o Brasil todo, mais.
    const r = await this.base.chamarControle<{ ceps: CepControle[] }>(
      empresaId,
      'GET',
      '/ceps',
      undefined,
      15 * 60_000,
    );
    if (r.status !== 200 || !('ceps' in r.corpo)) {
      this.erroControle(
        r.status,
        r.corpo as { message?: string },
        'ler os CEPs da base',
      );
    }
    const ceps = r.corpo.ceps ?? [];

    const [municipios, estados, existentes] = await Promise.all([
      this.prisma.municipio.findMany({
        where: { deletedAt: null, codigoReceita: { not: null } },
        select: { id: true, codigoReceita: true, estadoId: true },
      }),
      this.prisma.estado.findMany({ select: { id: true, sigla: true } }),
      this.prisma.cep.findMany({ select: { cep: true } }),
    ]);
    const municipioPorCodigo = new Map(
      municipios.map((m) => [m.codigoReceita!, m]),
    );
    const estadoPorSigla = new Map(estados.map((e) => [e.sigla, e.id]));
    const jaTem = new Set(existentes.map((c) => c.cep));

    let semMunicipio = 0;
    const novos = ceps
      .filter((c) => /^\d{8}$/.test(c.cep) && !jaTem.has(c.cep))
      .map((c) => {
        const m = municipioPorCodigo.get(c.codigoReceita);
        if (!m) semMunicipio++;
        return {
          cep: c.cep,
          estadoId: m?.estadoId ?? estadoPorSigla.get(c.uf) ?? null,
          municipioId: m?.id ?? null,
          bairro: c.bairro || null,
          endereco: c.endereco || null,
          origem: 'receita',
        };
      });
    for (let i = 0; i < novos.length; i += LOTE * 5) {
      await this.prisma.cep.createMany({
        data: novos.slice(i, i + LOTE * 5),
        skipDuplicates: true,
      });
    }
    return {
      lidos: ceps.length,
      novos: novos.length,
      jaExistiam: ceps.length - novos.length,
      semMunicipio,
    };
  }
}
