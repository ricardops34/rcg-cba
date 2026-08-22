import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NFE_DIR } from '../../common/uploads/uploads.config';
import { extrairNfe, NfeXmlInvalidoError } from './nfe-xml';
import { montarDanfePdf } from './danfe-pdf';
import { comFlagXml } from './nota-flags';
import {
  registrarAtividadeDocumento,
  type EventoDocumento,
} from '../../common/atividades/registrar-atividade-documento';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { NotaSaidaQuery } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ocultarComissaoDosItens } from '../../common/permissoes/pode-ver-comissao';
import { ParametrosService } from '../parametros/parametros.service';

const SORT_FIELDS = new Set(['numero', 'dtEmissao', 'vlrItens', 'vlrBruto', 'ativo', 'createdAt']);

const CLIENTE_SELECT = {
  select: { id: true, codigoErp: true, razaoSocial: true, nomeFantasia: true },
};
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };
const CONDICAO_SELECT = { select: { id: true, codigoErp: true, descricao: true } };

// Consulta read-only com o mesmo escopo hierárquico de Clientes: usuário
// restrito só enxerga notas da própria carteira/time.
//
// notaSaida.vendedorId é quem efetivamente fez aquela venda (exibido na
// tela) — mas escopo/filtro de "quem pode ver esta nota" considera o
// vendedor do CADASTRO DO CLIENTE (cliente.vendedorId), não o da nota: uma
// nota registrada por outro vendedor (cobrindo, por exemplo) continua
// visível pra quem enxerga aquele cliente.
@Injectable()
export class NotasSaidaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  findAll(empresaId: string, user: AuthenticatedUser, query: NotaSaidaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        cliente: combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.comodato !== undefined ? { comodato: query.comodato } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.ano !== undefined ? { ano: query.ano } : {}),
        ...(query.mes !== undefined ? { mes: query.mes } : {}),
        ...(query.search
          ? {
              OR: [
                { numero: { contains: query.search, mode: 'insensitive' as const } },
                { chaveNfe: { contains: query.search, mode: 'insensitive' as const } },
                {
                  cliente: {
                    razaoSocial: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'dtEmissao';
      const sortOrder = query.sortBy ? query.sortOrder : 'desc';
      const [data, total] = await Promise.all([
        tx.notaSaida.findMany({
          where,
          include: {
            cliente: CLIENTE_SELECT,
            vendedor: VENDEDOR_SELECT,
          },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: sortOrder },
        }),
        tx.notaSaida.count({ where }),
      ]);
      return buildPaginatedResult(data.map(comFlagXml), total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const nota = await tx.notaSaida.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { cliente: { vendedorId: { in: escopo } } } : {}),
        },
        include: {
          cliente: CLIENTE_SELECT,
          vendedor: VENDEDOR_SELECT,
          condicaoPagamento: CONDICAO_SELECT,
          itens: {
            where: { deletedAt: null },
            orderBy: { item: 'asc' },
            include: {
              produto: { select: { id: true, codigoErp: true, descricao: true, unidade: true } },
              regraDesconto: {
                select: { id: true, codigoErp: true, descricao: true },
              },
            },
          },
        },
      });
      if (!nota) throw new NotFoundException('Nota de saída não encontrada');
      return ocultarComissaoDosItens(
        comFlagXml(nota),
        user,
        await this.parametros.obterBoolean(
          empresaId,
          'COMISSAO_OCULTA_PARA_TODOS',
          false,
        ),
      );
    });
  }

  /**
   * DANFE em PDF, renderizado do XML autorizado que o ERP empurrou.
   *
   * O escopo é o mesmo de `findOne` — quem não enxerga a nota na tela não
   * baixa o documento dela. Sem XML não há DANFE: a resposta é 409 com o
   * motivo, e não um PDF vazio ou montado a partir das colunas da nota, que
   * seria um documento fiscal inventado pela plataforma.
   *
   * A emissão entra no **histórico de atendimento do cliente** como atividade
   * concluída. `registrarEvento: false` desliga isso para quem registra um
   * evento mais específico — o envio pela conversa de WhatsApp grava "DANFE
   * enviado", não "DANFE gerado".
   */
  async gerarDanfe(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    opcoes: { registrarEvento?: boolean } = {},
  ) {
    const { conteudo, nota } = await this.lerXml(empresaId, user, id);

    let dados;
    try {
      dados = extrairNfe(conteudo.toString('utf8'));
    } catch (erro) {
      if (erro instanceof NfeXmlInvalidoError) {
        throw new ConflictException(
          `O XML guardado para a NF ${nota.numero} não pôde ser lido: ${erro.message}`,
        );
      }
      throw erro;
    }

    const numero = dados.numero ?? nota.numero;
    const pdf = montarDanfePdf(dados, { segundaVia: true });

    // Registrado depois de o PDF existir: XML ilegível vira 409, e o histórico
    // não pode registrar uma 2ª via que ninguém recebeu.
    if (opcoes.registrarEvento !== false) {
      await this.registrarEvento(empresaId, user, nota, 'danfe_gerado', numero, [
        dados.cancelada ? 'NOTA CANCELADA' : null,
        dados.dataEmissao
          ? `emitida em ${new Date(dados.dataEmissao).toLocaleDateString('pt-BR')}`
          : null,
        dados.totais.valorTotal != null
          ? dados.totais.valorTotal.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })
          : null,
      ]);
    }

    return {
      conteudo: pdf,
      nomeArquivo: `danfe-${numero}.pdf`,
      chave: dados.chave,
      cancelada: dados.cancelada,
      numero,
      clienteId: nota.clienteId,
      vendedorId: nota.vendedorId,
    };
  }

  /**
   * O próprio XML, para quem precisa do arquivo (contador, escrituração).
   *
   * Também entra no histórico do cliente: baixar o XML é entregar documento
   * fiscal a alguém, e a pergunta "quando foi que mandamos essa nota?" tem de
   * ter resposta.
   */
  async obterXml(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    opcoes: { registrarEvento?: boolean } = {},
  ) {
    const { conteudo, nota } = await this.lerXml(empresaId, user, id);

    if (opcoes.registrarEvento !== false) {
      await this.registrarEvento(empresaId, user, nota, 'xml_baixado', nota.numero, [
        nota.chaveNfe ? `chave ${nota.chaveNfe}` : null,
      ]);
    }

    return {
      conteudo,
      nomeArquivo: `nfe-${nota.chaveNfe ?? nota.numero}.xml`,
      clienteId: nota.clienteId,
      vendedorId: nota.vendedorId,
    };
  }

  /** Grava o rastro da 2ª via na agenda do cliente (ver o módulo compartilhado). */
  private registrarEvento(
    empresaId: string,
    user: AuthenticatedUser,
    nota: { clienteId: string | null; vendedorId: string | null },
    evento: EventoDocumento,
    numero: string,
    detalhes: (string | null)[],
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento,
        clienteId: nota.clienteId,
        vendedorId: nota.vendedorId,
        numero,
        descricao: detalhes.filter(Boolean).join(' · ') || undefined,
      }),
    );
  }

  /**
   * Lê do disco o XML da nota, respeitando o escopo do usuário.
   *
   * `basename` no nome guardado não é paranoia: a coluna é preenchida pela
   * rota de integração, e um valor com `../` transformaria esta leitura num
   * path traversal — o diretório `uploads/nfe` guarda XML de todas as
   * empresas.
   */
  private async lerXml(empresaId: string, user: AuthenticatedUser, id: string) {
    const nota = await this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const encontrada = await tx.notaSaida.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { cliente: { vendedorId: { in: escopo } } } : {}),
        },
        select: {
          id: true,
          numero: true,
          chaveNfe: true,
          xmlArquivo: true,
          // Para o rastro no histórico do cliente (ver `registrarEvento`).
          clienteId: true,
          vendedorId: true,
        },
      });
      if (!encontrada) throw new NotFoundException('Nota de saída não encontrada');
      return encontrada;
    });

    if (!nota.xmlArquivo) {
      throw new ConflictException(
        `A NF ${nota.numero} ainda não tem o XML autorizado na plataforma — ` +
          'o ERP precisa enviá-lo antes da 2ª via.',
      );
    }

    try {
      return {
        nota,
        conteudo: await readFile(join(NFE_DIR, basename(nota.xmlArquivo))),
      };
    } catch {
      throw new ConflictException(
        `O arquivo XML da NF ${nota.numero} não foi encontrado no servidor. ` +
          'Peça ao ERP para reenviá-lo.',
      );
    }
  }
}
