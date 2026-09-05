import { readFile, unlink } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { whereEmpresaAcessivel } from '../../common/empresa/situacao-empresa';
import { AgenteConfigService } from '../agente/agente-config.service';
import { ProvedorFactory } from '../agente/provedor.factory';
import { ProdutoFichasService } from './produto-fichas.service';
import { FICHAS_IMPORTACAO_DIR } from '../../common/uploads/uploads.config';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Importação em lote de fichas técnicas.
 *
 * ## Por que é uma fila, e não uma requisição
 *
 * Cada PDF é uma chamada ao provedor de IA: lenta e paga. Um lote de 80
 * arquivos não cabe no tempo de uma requisição HTTP, e um reinício no meio não
 * pode perder o que já foi lido. O upload só grava os arquivos e devolve; a
 * varredura processa um por vez, e a tela acompanha.
 *
 * ## Quem decide o produto
 *
 * O modelo **lê**; o servidor **procura**. O que volta do provedor é o que está
 * escrito no documento — o código do fabricante, o nome do produto — e é o
 * servidor que consulta o catálogo com isso. Se o modelo devolvesse um id,
 * bastaria ele alucinar um para pendurar a ficha no produto errado, e ninguém
 * perceberia até um vendedor mandar a ficha errada a um cliente.
 *
 * Achou **um** produto: vincula e grava. Achou nenhum ou mais de um: para, e a
 * tela pede a decisão de uma pessoa — com o que foi lido do documento à vista,
 * que é o que explica a dúvida.
 */
@Injectable()
export class FichaImportacaoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FichaImportacaoService.name);
  private timer: NodeJS.Timeout | null = null;
  /** Trava de reentrada: a varredura anterior pode ainda estar no provedor. */
  private rodando = false;

  /**
   * De quanto em quanto tempo a fila é olhada.
   *
   * Curto porque quem subiu 80 PDFs está olhando a tela, e o gargalo real é o
   * provedor — não este intervalo.
   */
  private static readonly INTERVALO_MS = 5_000;

  /**
   * Quantos PDFs por rodada.
   *
   * Um de cada vez, de propósito: são chamadas caras a um provedor com limite
   * de taxa, e disparar dez em paralelo troca "demora" por "429".
   */
  private static readonly POR_RODADA = 1;

  /** Uma falha pode ser do provedor, não do arquivo. Três tentativas e para. */
  private static readonly MAX_TENTATIVAS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AgenteConfigService,
    private readonly provedores: ProvedorFactory,
    private readonly fichas: ProdutoFichasService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.varrer(),
      FichaImportacaoService.INTERVALO_MS,
    );
    // `unref` para o timer não segurar o processo no encerramento.
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------------
  // Entrada: o upload
  // ------------------------------------------------------------------

  async receber(
    empresaId: string,
    user: AuthenticatedUser,
    arquivos: Express.Multer.File[],
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const criados: { id: string; arquivoNome: string }[] = [];
      for (const arquivo of arquivos) {
        const criado = await tx.produtoFichaImportacao.create({
          data: {
            empresaId,
            arquivo: arquivo.filename,
            arquivoNome: arquivo.originalname.slice(0, 255),
            mime: arquivo.mimetype,
            tamanho: arquivo.size,
            createdBy: user.id,
          },
          select: { id: true, arquivoNome: true },
        });
        criados.push(criado);
      }
      return criados.map((c) => ({ id: c.id, arquivoNome: c.arquivoNome }));
    });
  }

  // ------------------------------------------------------------------
  // Leitura pela tela
  // ------------------------------------------------------------------

  async listar(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linhas = await tx.produtoFichaImportacao.findMany({
        where: { empresaId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      const produtoIds = [
        ...new Set(
          linhas.map((l) => l.produtoId).filter((p): p is string => !!p),
        ),
      ];
      const produtos = produtoIds.length
        ? await tx.produto.findMany({
            where: { empresaId, id: { in: produtoIds } },
            select: { id: true, codigoErp: true, descricao: true },
          })
        : [];
      const porId = new Map(produtos.map((p) => [p.id, p]));

      return linhas.map((l) => ({
        id: l.id,
        arquivoNome: l.arquivoNome,
        tamanho: l.tamanho,
        situacao: l.situacao,
        codigoDetectado: l.codigoDetectado,
        nomeDetectado: l.nomeDetectado,
        titulo: l.titulo,
        markdown: l.markdown,
        produtoId: l.produtoId,
        produtoDescricao: l.produtoId
          ? (porId.get(l.produtoId)?.descricao ?? null)
          : null,
        produtoCodigoErp: l.produtoId
          ? (porId.get(l.produtoId)?.codigoErp ?? null)
          : null,
        fichaId: l.fichaId,
        erro: l.erro,
        createdAt: l.createdAt,
        processadoEm: l.processadoEm,
      }));
    });
  }

  async resumo(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const grupos = await tx.produtoFichaImportacao.groupBy({
        by: ['situacao'],
        where: { empresaId },
        _count: { _all: true },
      });
      const conta = (s: string) =>
        grupos.find((g) => g.situacao === s)?._count._all ?? 0;
      return {
        pendentes: conta('pendente'),
        processando: conta('processando'),
        vinculadas: conta('vinculada'),
        precisamDecisao: conta('sem_correspondencia') + conta('ambiguo'),
        erros: conta('erro'),
      };
    });
  }

  // ------------------------------------------------------------------
  // Decisão humana sobre o que ficou pendente
  // ------------------------------------------------------------------

  /**
   * Vincula à mão o que a leitura não resolveu.
   *
   * O Markdown já foi extraído e está gravado: o que faltava era o produto, e
   * é só isso que a pessoa informa. Reprocessar o PDF aqui seria pagar de novo
   * pela leitura que já foi feita.
   */
  async vincular(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    produtoId: string,
  ) {
    const item = await this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.produtoFichaImportacao.findFirst({
        where: { id, empresaId },
      });
      if (!linha) throw new NotFoundException('Importação não encontrada');
      if (linha.fichaId) {
        throw new NotFoundException('Esta ficha já foi vinculada');
      }
      if (!linha.markdown) {
        throw new NotFoundException(
          'O conteúdo deste PDF ainda não foi lido. Aguarde o processamento.',
        );
      }
      return linha;
    });

    return this.gravarFicha(empresaId, user, item, produtoId);
  }

  /** Descarta um item da lista, com o PDF junto. */
  async remover(empresaId: string, id: string) {
    const item = await this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.produtoFichaImportacao.findFirst({
        where: { id, empresaId },
        select: { id: true, arquivo: true, fichaId: true },
      });
      if (!linha) throw new NotFoundException('Importação não encontrada');
      await tx.produtoFichaImportacao.delete({ where: { id } });
      return linha;
    });

    // O arquivo só sai do disco se ele **não** virou ficha: a ficha guarda a
    // própria cópia, mas descartar o item de importação não pode apagar um PDF
    // que o produto ainda usa.
    if (!item.fichaId) {
      await unlink(join(FICHAS_IMPORTACAO_DIR, item.arquivo)).catch(
        () => undefined,
      );
    }
    return { ok: true };
  }

  /** Tira da lista tudo o que já terminou, deixando só o que exige decisão. */
  async limparConcluidos(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const { count } = await tx.produtoFichaImportacao.deleteMany({
        where: { empresaId, situacao: 'vinculada' },
      });
      return { removidos: count };
    });
  }

  // ------------------------------------------------------------------
  // A varredura
  // ------------------------------------------------------------------

  private async varrer() {
    if (this.rodando) return;
    this.rodando = true;
    try {
      // Empresa por empresa porque a tabela tem RLS: sem `withTenant` a
      // consulta volta **vazia**, e a fila fica parada sem erro nenhum — foi o
      // que aconteceu no primeiro teste em dev, com três PDFs eternamente
      // "pendentes". `empresas` não tem RLS, e é por ela que se começa; é o
      // mesmo caminho da varredura de notificações.
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null, ...whereEmpresaAcessivel() },
        select: { id: true },
      });

      for (const { id } of empresas) {
        await this.processarEmpresa(id);
      }
    } catch (erro) {
      this.logger.error(`Falha na varredura de fichas: ${String(erro)}`);
    } finally {
      this.rodando = false;
    }
  }

  private async processarEmpresa(empresaId: string) {
    const pendentes = await this.prisma.withTenant(empresaId, (tx) =>
      tx.produtoFichaImportacao.findMany({
        where: { empresaId, situacao: 'pendente' },
        orderBy: { createdAt: 'asc' },
        take: FichaImportacaoService.POR_RODADA,
      }),
    );
    if (pendentes.length === 0) return;

    for (const item of pendentes) {
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.produtoFichaImportacao.update({
          where: { id: item.id },
          data: { situacao: 'processando', tentativas: { increment: 1 } },
        }),
      );

      try {
        await this.processarItem(empresaId, item);
      } catch (erro) {
        const mensagem =
          erro instanceof Error ? erro.message : 'Falha ao processar o PDF';
        // Erro de provedor costuma ser passageiro (limite de taxa, timeout).
        // Volta para a fila enquanto houver tentativa; depois disso para, para
        // não queimar a cota da empresa repetindo o mesmo arquivo.
        const desiste =
          item.tentativas + 1 >= FichaImportacaoService.MAX_TENTATIVAS;
        await this.prisma.withTenant(empresaId, (tx) =>
          tx.produtoFichaImportacao.update({
            where: { id: item.id },
            data: {
              situacao: desiste ? 'erro' : 'pendente',
              erro: mensagem.slice(0, 500),
              ...(desiste ? { processadoEm: new Date() } : {}),
            },
          }),
        );
        this.logger.warn(
          `Ficha ${item.arquivoNome}: ${mensagem}${desiste ? '' : ' (vai tentar de novo)'}`,
        );
      }
    }
  }

  private async processarItem(
    empresaId: string,
    item: { id: string; arquivo: string; arquivoNome: string; mime: string },
  ) {
    const lido = await this.lerPdf(empresaId, item);

    const candidatos = await this.procurarProduto(empresaId, lido);

    if (candidatos.length === 1) {
      const usuario = {
        id: 'importacao',
        empresaAtivaId: empresaId,
      } as AuthenticatedUser;
      await this.gravarFicha(
        empresaId,
        usuario,
        { ...item, titulo: lido.titulo, markdown: lido.markdown },
        candidatos[0].id,
        lido,
      );
      return;
    }

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.produtoFichaImportacao.update({
        where: { id: item.id },
        data: {
          situacao: candidatos.length > 1 ? 'ambiguo' : 'sem_correspondencia',
          codigoDetectado: lido.codigo,
          nomeDetectado: lido.nome,
          titulo: lido.titulo,
          markdown: lido.markdown,
          processadoEm: new Date(),
          erro: null,
        },
      }),
    );
  }

  /**
   * Manda o PDF ao provedor e recebe o que está escrito nele.
   *
   * Sem ferramentas de propósito: é uma leitura só, e um laço de ferramentas
   * aqui multiplicaria o custo de cada arquivo do lote.
   */
  private async lerPdf(
    empresaId: string,
    item: { arquivo: string; arquivoNome: string; mime: string },
  ) {
    const cfg = await this.config.paraUso(empresaId);
    const conteudo = await readFile(join(FICHAS_IMPORTACAO_DIR, item.arquivo));

    const resposta = await this.provedores.para(cfg.provedor).conversar({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      contaId: cfg.contaId,
      modelo: cfg.modelo,
      temperatura: cfg.temperatura,
      maxTokens: cfg.maxTokens,
      ferramentas: [],
      mensagens: [
        {
          papel: 'system',
          conteudo:
            'Você transcreve fichas técnicas de produto. Responda **somente** ' +
            'com um objeto JSON, sem cercas de código e sem comentários, com ' +
            'as chaves: codigo (o código do produto do fabricante impresso no ' +
            'documento, ou null), nome (o nome do produto, ou null), titulo ' +
            '(um título curto para a ficha) e markdown (o conteúdo técnico do ' +
            'documento transcrito em Markdown). ' +
            'Transcreva o que está escrito, não resuma nem invente. ' +
            'NÃO inclua preço, tabela de preços nem condição comercial no ' +
            'markdown.',
        },
        {
          papel: 'user',
          conteudo:
            `Arquivo: ${item.arquivoNome}. Leia a ficha técnica anexada e ` +
            'devolva o JSON.',
          anexos: [
            {
              nome: item.arquivoNome,
              mime: item.mime,
              base64: conteudo.toString('base64'),
            },
          ],
        },
      ],
    });

    const dados = this.extrairJson(resposta.texto ?? '');
    const markdown = texto(dados.markdown);
    if (!markdown) {
      // O caso do PDF escaneado: sem camada de texto, o modelo não tem o que
      // transcrever. Falha explicitamente, em vez de gravar uma ficha vazia
      // que ninguém entenderia depois.
      throw new Error(
        'Não consegui ler o conteúdo deste PDF. Se ele for digitalizado, ' +
          'não há texto para transcrever.',
      );
    }

    return {
      codigo: texto(dados.codigo) || null,
      nome: texto(dados.nome) || null,
      titulo: texto(dados.titulo) || item.arquivoNome,
      markdown,
    };
  }

  /**
   * JSON no meio de prosa é o normal, não a exceção.
   *
   * Modelo instruído a responder só JSON ainda embrulha em ```json quando a
   * pergunta parece pedir formatação. Recortar entre a primeira chave e a
   * última é mais barato do que brigar com o prompt.
   */
  private extrairJson(bruto: string): Record<string, unknown> {
    const inicio = bruto.indexOf('{');
    const fim = bruto.lastIndexOf('}');
    if (inicio === -1 || fim <= inicio) {
      throw new Error('O modelo não devolveu um JSON com o conteúdo da ficha');
    }
    try {
      const valor: unknown = JSON.parse(bruto.slice(inicio, fim + 1));
      return typeof valor === 'object' && valor !== null
        ? (valor as Record<string, unknown>)
        : {};
    } catch {
      throw new Error('O modelo devolveu um JSON inválido');
    }
  }

  /**
   * Procura o produto com o que foi lido no documento — **no servidor**.
   *
   * A ordem é do mais específico para o menos: código do fornecedor e código
   * ERP são identificadores; o nome é palpite, e por isso só entra quando os
   * códigos não acharam nada.
   */
  private async procurarProduto(
    empresaId: string,
    lido: { codigo: string | null; nome: string | null },
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const base = { empresaId, deletedAt: null };
      const selecao = { id: true, codigoErp: true, descricao: true };

      if (lido.codigo) {
        const porCodigo = await tx.produto.findMany({
          where: {
            ...base,
            OR: [
              {
                codigoFornecedor: { equals: lido.codigo, mode: 'insensitive' },
              },
              { codigoErp: { equals: lido.codigo, mode: 'insensitive' } },
              { codigoBarras: { equals: lido.codigo, mode: 'insensitive' } },
            ],
          },
          select: selecao,
          take: 2,
        });
        if (porCodigo.length) return porCodigo;
      }

      if (lido.nome && lido.nome.length >= 4) {
        // `sem_acento` (invólucro IMMUTABLE de `unaccent`) dos dois lados, e não
        // o `contains` do Prisma: o
        // `mode: 'insensitive'` ignora maiúsculas, **não** acentos. Uma ficha
        // de "Cafe torrado 500g" não encontrava o "Café torrado 500g" do
        // catálogo — visto em dev em 2026-09-05, e é o caso comum, porque o
        // PDF do fabricante costuma vir sem acentuação.
        const achados = await tx.$queryRaw<
          { id: string; codigoErp: string; descricao: string }[]
        >`
          SELECT "id", "codigoErp", "descricao"
          FROM "produtos"
          WHERE "empresaId" = ${empresaId}
            AND "deletedAt" IS NULL
            AND sem_acento("descricao") ILIKE sem_acento(${'%' + lido.nome + '%'})
          LIMIT 2
        `;
        return achados;
      }

      return [];
    });
  }

  /** Grava a ficha no produto e fecha o item da fila. */
  private async gravarFicha(
    empresaId: string,
    user: AuthenticatedUser,
    item: {
      id: string;
      arquivo: string;
      arquivoNome: string;
      mime: string;
      tamanho?: number;
      titulo: string | null;
      markdown: string | null;
    },
    produtoId: string,
    lido?: { codigo: string | null; nome: string | null },
  ) {
    const ficha = await this.fichas.criar(
      empresaId,
      user,
      produtoId,
      {
        caminho: join(FICHAS_IMPORTACAO_DIR, item.arquivo),
        nomeOriginal: item.arquivoNome,
        mime: item.mime,
        tamanho: item.tamanho ?? 0,
      },
      {
        titulo: item.titulo ?? item.arquivoNome,
        markdown: item.markdown ?? '',
      },
    );

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.produtoFichaImportacao.update({
        where: { id: item.id },
        data: {
          situacao: 'vinculada',
          produtoId,
          fichaId: ficha.id,
          processadoEm: new Date(),
          erro: null,
          ...(lido
            ? {
                codigoDetectado: lido.codigo,
                nomeDetectado: lido.nome,
                titulo: item.titulo,
                markdown: item.markdown,
              }
            : {}),
        },
      }),
    );

    return ficha;
  }

  /** Garante o diretório do lote antes de o multer gravar nele. */
  static prepararDiretorio() {
    if (!existsSync(FICHAS_IMPORTACAO_DIR)) {
      mkdirSync(FICHAS_IMPORTACAO_DIR, { recursive: true });
    }
  }
}

/** Texto de um valor que veio do modelo, sem virar "[object Object]". */
function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}
