import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BASE_URLS,
  ExternalHttpService,
} from '../../common/external-http/external-http.service';
import type {
  CnaeSugerido,
  ConsultaCnpjResultado,
} from '@plataforma/contracts';

/** Resposta da MinhaReceita — só os campos que consumimos. */
interface MinhaReceitaResposta {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  codigo_municipio_ibge?: number | string;
  uf?: string;
  cep?: string;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
  email?: string;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  // A fonte usa `cnaes_secundarios` (masculino); a variante feminina fica como
  // tolerância, caso mude.
  cnaes_secundarios?: { codigo?: number | string; descricao?: string }[];
  cnaes_secundarias?: { codigo?: number | string; descricao?: string }[];
}

/** Narrow explícito: a resposta da fonte é JSON não confiável, e um objeto
 *  inesperado viraria "[object Object]" se fosse direto pro String(). */
const escalar = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : null;

const texto = (v: unknown): string | null => {
  const t = escalar(v)?.trim();
  return !t ? null : t;
};

const digitos = (v: unknown): string => (escalar(v) ?? '').replace(/\D/g, '');

/**
 * Código de subclasse CNAE em 7 dígitos. O JSON da fonte manda o código como
 * **número**, então o zero à esquerda se perde: "0111399" chega como 111399.
 * Sem o padding, todo CNAE da seção A (agropecuária) seria descartado por
 * "não ter 7 dígitos".
 */
const codigoCnae = (v: unknown): string | null => {
  const d = digitos(v);
  if (!d || Number(d) === 0) return null;
  return d.length <= 7 ? d.padStart(7, '0') : null;
};

/**
 * Consulta de CNPJ na MinhaReceita (base pública da Receita Federal), usada
 * para preencher o cadastro de cliente e, principalmente, para trazer os
 * **CNAEs** — que são o eixo de afinidade da sugestão de compra.
 *
 * Não grava nada: devolve o dado normalizado, e o que o usuário aceitar vira
 * uma solicitação de alteração do cliente.
 */
@Injectable()
export class EnriquecimentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: ExternalHttpService,
  ) {}

  async consultarCnpj(cnpjBruto: string): Promise<ConsultaCnpjResultado> {
    const cnpj = digitos(cnpjBruto);
    if (cnpj.length !== 14) {
      throw new BadRequestException('CNPJ deve ter 14 dígitos');
    }

    const dados = await this.http.getJson<MinhaReceitaResposta>(
      `${BASE_URLS.minhaReceita()}/${cnpj}`,
      {
        fonte: 'MinhaReceita',
        // A fonte responde 400 (não 404) para CNPJ que ela não conhece — do
        // ponto de vista de quem digitou, é "não encontrado".
        statusNaoEncontrado: [400, 404],
        mensagemNaoEncontrado: 'CNPJ não encontrado na base da Receita Federal',
      },
    );

    const cnaes = await this.resolverCnaes(dados);
    const municipioId = await this.resolverMunicipio(
      dados.codigo_municipio_ibge,
    );

    // Logradouro e número chegam separados; o cadastro tem um campo só.
    const logradouro = texto(dados.logradouro);
    const numero = texto(dados.numero);
    const endereco = logradouro
      ? [logradouro, numero].filter(Boolean).join(', ')
      : null;

    return {
      cnpj,
      razaoSocial: texto(dados.razao_social) ?? '',
      nomeFantasia: texto(dados.nome_fantasia),
      situacaoCadastral: texto(dados.descricao_situacao_cadastral),
      dataSituacaoCadastral: texto(dados.data_situacao_cadastral),
      endereco,
      complemento: texto(dados.complemento),
      bairro: texto(dados.bairro),
      municipio: texto(dados.municipio),
      municipioId,
      uf: texto(dados.uf)?.toUpperCase() ?? null,
      cep: digitos(dados.cep) || null,
      telefone: digitos(dados.ddd_telefone_1) || null,
      telefone2: digitos(dados.ddd_telefone_2) || null,
      email: texto(dados.email)?.toLowerCase() ?? null,
      cnaes,
    };
  }

  /**
   * Casa cada código com a referência `cnaes` (populada pelo sync do IBGE).
   * Código ausente na referência volta com `cnaeId: null` em vez de sumir —
   * assim a tela avisa, em vez de o usuário achar que vinculou algo que não
   * existe. Na prática significa sync do IBGE desatualizado.
   */
  private async resolverCnaes(
    dados: MinhaReceitaResposta,
  ): Promise<CnaeSugerido[]> {
    const brutos: { codigo: string; descricao: string; principal: boolean }[] =
      [];

    const principal = codigoCnae(dados.cnae_fiscal);
    if (principal) {
      brutos.push({
        codigo: principal,
        descricao: texto(dados.cnae_fiscal_descricao) ?? '',
        principal: true,
      });
    }
    const secundarios =
      dados.cnaes_secundarios ?? dados.cnaes_secundarias ?? [];
    for (const s of secundarios) {
      // codigoCnae já descarta o item "0000000 / Não informada" que a fonte
      // devolve quando não há secundária.
      const codigo = codigoCnae(s.codigo);
      if (!codigo) continue;
      if (brutos.some((b) => b.codigo === codigo)) continue;
      brutos.push({
        codigo,
        descricao: texto(s.descricao) ?? '',
        principal: false,
      });
    }
    if (brutos.length === 0) return [];

    const referencia = await this.prisma.cnae.findMany({
      where: {
        codigoErp: { in: brutos.map((b) => b.codigo) },
        deletedAt: null,
      },
      select: { id: true, codigoErp: true, descricao: true },
    });
    const porCodigo = new Map(referencia.map((c) => [c.codigoErp, c]));

    return brutos.map((b) => {
      const local = porCodigo.get(b.codigo);
      return {
        codigo: b.codigo,
        // A descrição da referência do IBGE é a oficial; a da Receita serve de
        // fallback quando o código ainda não está sincronizado.
        descricao: local?.descricao ?? b.descricao,
        principal: b.principal,
        cnaeId: local?.id ?? null,
      };
    });
  }

  private async resolverMunicipio(
    codigoIbge: number | string | undefined,
  ): Promise<string | null> {
    const codigo = digitos(codigoIbge);
    if (!codigo) return null;
    const municipio = await this.prisma.municipio.findUnique({
      where: { codigoIbge: codigo },
      select: { id: true },
    });
    return municipio?.id ?? null;
  }
}
