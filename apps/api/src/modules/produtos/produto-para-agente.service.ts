import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProdutoFichasService } from './produto-fichas.service';
import { ProdutoRelacionadosService } from './produto-relacionados.service';
import { EmbeddingsService } from '../agente/embeddings.service';
import { semPreco } from './sem-preco';

/**
 * O que a IA pode contar sobre um produto — e **nunca** inclui preço.
 *
 * ## Por que existe um serviço só para isto
 *
 * Porque a regra "a IA nunca passa preço para o cliente" precisa ser código, e
 * código verificável em um lugar. O `ProdutosService.findAll` devolve o produto
 * inteiro, `ultimoPreco` junto; se a ferramenta do WhatsApp chamasse aquele
 * método e o resultado fosse podado depois, a poda seria uma linha fácil de
 * esquecer — e o preço já teria entrado no contexto do modelo.
 *
 * Aqui a seleção é positiva: o campo de preço **não é lido do banco**. Não há o
 * que o modelo possa deixar escapar, porque ele nunca recebeu.
 *
 * O preço do cliente sai por um caminho só, e é o que o usuário definiu:
 * orçamento feito por vendedor, supervisor ou gerente.
 *
 * ## De onde vem o conteúdo
 *
 * Do que o cadastro acumulou: os campos complementares que a empresa criou, as
 * fichas técnicas transcritas em Markdown, e os similares e produtos de
 * aplicação. Os dois primeiros respeitam `visivelAgente` — a empresa decide o
 * que a IA pode citar, e o recorte é feito na consulta.
 */
@Injectable()
export class ProdutoParaAgenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fichas: ProdutoFichasService,
    private readonly relacionados: ProdutoRelacionadosService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /**
   * A busca do pré-atendimento: semântica **somada** à lexical.
   *
   * As duas erram de formas diferentes, e é por isso que as duas ficam. A
   * lexical não sabe que "rouparia" tem a ver com "lençol", mas acerta em cheio
   * código de produto, marca e nome exato — coisas em que o vetor é ruim,
   * porque "DEMO-P015" não tem semântica. A semântica acha o produto cuja ficha
   * fala do problema com outras palavras.
   *
   * A soma é por posição (o `peso` cai conforme o item desce na lista de cada
   * lado), e não pela distância bruta: escore de cosseno e contagem de palavras
   * não são comparáveis, e normalizá-los daria uma precisão inventada.
   *
   * Sem provedor de embeddings configurado, `gerarUm` devolve `null` e sobra a
   * lexical — a busca fica pior, não quebra.
   */
  async procurarHibrido(empresaId: string, busca: string, limite = 5) {
    // `disponivel` cobre as duas metades: a coluna de vetor no banco e o
    // provedor que gera. Faltando qualquer uma, nem se pede o embedding — a
    // consulta abaixo mencionaria uma coluna que pode não existir.
    const podeVetor = await this.embeddings.disponivel(empresaId);
    const [lexical, vetor] = await Promise.all([
      this.procurar(empresaId, busca, limite * 2),
      podeVetor ? this.embeddings.gerarUm(empresaId, busca) : null,
    ]);

    const semantica = vetor
      ? await this.procurarPorVetor(empresaId, vetor, limite * 2)
      : [];

    const peso = new Map<string, number>();
    const dados = new Map<
      string,
      { id: string; codigoErp: string; descricao: string }
    >();
    const somar = (
      lista: { id: string; codigoErp: string; descricao: string }[],
      fator: number,
    ) => {
      lista.forEach((p, i) => {
        dados.set(p.id, p);
        // 1/(posição+1): o primeiro vale 1, o segundo 0,5, o terceiro 0,33.
        // Um item bem colocado nos dois lados ganha de um primeiro colocado
        // que só aparece em um.
        peso.set(p.id, (peso.get(p.id) ?? 0) + fator / (i + 1));
      });
    };

    // A semântica pesa um pouco mais quando existe: ela é a que entende a
    // pergunta descrita em outras palavras, que é o caso do pré-atendimento.
    somar(lexical, 1);
    somar(semantica, 1.3);

    return [...peso.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limite)
      .map(([id]) => dados.get(id)!)
      .filter(Boolean);
  }

  /**
   * Os produtos cujos trechos de ficha mais se aproximam da pergunta.
   *
   * `<=>` é a distância de cosseno do pgvector, e usa o índice HNSW. O
   * `DISTINCT ON` é o que impede uma ficha longa de ocupar a lista inteira com
   * cinco trechos do mesmo produto.
   */
  private async procurarPorVetor(
    empresaId: string,
    vetor: number[],
    limite: number,
  ) {
    // O literal do pgvector é '[1,2,3]'; vai como texto e é convertido no banco.
    const literal = `[${vetor.join(',')}]`;

    return this.prisma.withTenant(
      empresaId,
      (tx) =>
        tx.$queryRaw<{ id: string; codigoErp: string; descricao: string }[]>`
        SELECT p."id", p."codigoErp", p."descricao"
        FROM (
          SELECT DISTINCT ON (t."produtoId")
                 t."produtoId", t."embedding" <=> ${literal}::vector AS distancia
          FROM "produto_ficha_trechos" t
          JOIN "produto_fichas" f ON f."id" = t."fichaId"
          WHERE t."empresaId" = ${empresaId}
            AND t."embedding" IS NOT NULL
            AND f."deletedAt" IS NULL
            AND f."visivelAgente" = true
          ORDER BY t."produtoId", distancia
        ) melhores
        JOIN "produtos" p ON p."id" = melhores."produtoId"
        WHERE p."deletedAt" IS NULL AND p."ativo" = true
        ORDER BY melhores.distancia
        LIMIT ${limite}
      `,
    );
  }

  /**
   * Procura produtos ativos — por nome, e também **pelo que eles resolvem**.
   *
   * ## Palavras, não a frase; e as que mais casam ganham
   *
   * Quem chega ao pré-atendimento escreve uma frase: "que produto uso para
   * lavar os lençóis do meu hotel, que não desgaste muito o lençol". Duas
   * armadilhas em sequência, e as duas apareceram em teste com o modelo real:
   *
   * 1. A **frase inteira** num `ILIKE` não casa com nada — nenhum campo contém
   *    aquela sequência. O agente respondeu "não localizei arroz no catálogo"
   *    com o arroz cadastrado.
   * 2. Exigir **todas** as palavras também não serve: numa frase natural sobram
   *    palavras que não estão em lugar nenhum, e um AND derruba o produto certo
   *    por causa delas.
   *
   * Então cada palavra vale um ponto onde aparecer, e o resultado é ordenado
   * pelo número de palavras que casaram. Quem casa "lavar" e "hotel" sobe.
   *
   * ## Candidatos primeiro, pontuação depois
   *
   * A forma da consulta é o que a faz caber num atendimento. Pontuar cada
   * produto e ordenar obriga o banco a avaliar o catálogo **inteiro**; buscar
   * os candidatos por índice e contar quantas vezes cada um apareceu avalia só
   * o que casou. Medido em dev, 4000 produtos e 4000 fichas, três palavras:
   *
   *     pontuando todos ....... 1139 ms
   *     candidatos primeiro ....   0,8 ms
   *
   * Cada braço do `UNION ALL` é uma palavra em um lugar, e todos usam o índice
   * GIN de trigramas criado na migration `20260906000000`. Por isso a consulta
   * chama `sem_acento(...)` e não `unaccent(...)`: são expressões diferentes
   * para o planejador, e com a segunda o índice não é usado.
   *
   * ## Onde cada palavra é procurada
   *
   * Descrição, marca, código e categoria do produto; os **valores dos campos
   * complementares** e o **texto das fichas** — as duas últimas só quando a
   * empresa as liberou para a IA (`visivelAgente`). É o mesmo recorte da
   * leitura: senão um produto apareceria por causa de um texto que o agente não
   * pode citar, e ele não teria o que dizer sobre ele.
   */
  async procurar(empresaId: string, busca: string, limite = 5) {
    const termos = palavrasDaBusca(busca);
    if (termos.length === 0) return [];

    const alvo = (t: string) => `%${t}%`;
    const braços = termos.flatMap((t) => [
      Prisma.sql`
        SELECT p."id" FROM "produtos" p
        LEFT JOIN "categorias" c ON c."id" = p."categoriaId"
        WHERE p."empresaId" = ${empresaId} AND p."deletedAt" IS NULL AND p."ativo" = true
          AND (
            sem_acento(p."descricao") ILIKE sem_acento(${alvo(t)})
            OR sem_acento(COALESCE(p."marca", '')) ILIKE sem_acento(${alvo(t)})
            OR p."codigoErp" ILIKE ${alvo(t)}
            OR sem_acento(COALESCE(c."descricao", '')) ILIKE sem_acento(${alvo(t)})
          )`,
      Prisma.sql`
        SELECT v."produtoId" AS "id"
        FROM "produto_campo_valores" v
        JOIN "produto_campos" pc ON pc."id" = v."campoId"
        WHERE v."empresaId" = ${empresaId}
          AND pc."ativo" = true AND pc."deletedAt" IS NULL AND pc."visivelAgente" = true
          AND sem_acento(v."valor") ILIKE sem_acento(${alvo(t)})`,
      Prisma.sql`
        SELECT f."produtoId" AS "id"
        FROM "produto_fichas" f
        WHERE f."empresaId" = ${empresaId}
          AND f."deletedAt" IS NULL AND f."visivelAgente" = true
          AND sem_acento(f."markdown") ILIKE sem_acento(${alvo(t)})`,
    ]);

    return this.prisma.withTenant(empresaId, (tx) =>
      tx.$queryRaw<
        { id: string; codigoErp: string; descricao: string; pontos: bigint }[]
      >(
        Prisma.sql`
          WITH candidatos AS (
            ${Prisma.join(braços, ' UNION ALL ')}
          )
          SELECT p."id", p."codigoErp", p."descricao", COUNT(*) AS "pontos"
          FROM candidatos ca
          JOIN "produtos" p ON p."id" = ca."id"
          WHERE p."deletedAt" IS NULL AND p."ativo" = true
          GROUP BY p."id", p."codigoErp", p."descricao"
          ORDER BY "pontos" DESC, p."descricao"
          LIMIT ${limite}
        `,
      ),
    );
  }

  /**
   * O dossiê de um produto para a IA falar dele.
   *
   * Repare no `select`: descrição, marca, unidade, embalagem, categoria. Não há
   * `ultimoPreco` — e é essa ausência, não uma instrução de prompt, que impede
   * o preço de chegar a quem pergunta.
   */
  async detalhar(empresaId: string, produtoId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id: produtoId, empresaId, deletedAt: null, ativo: true },
        select: {
          id: true,
          codigoErp: true,
          descricao: true,
          marca: true,
          unidade: true,
          qtdEmbalagem: true,
          observacao: true,
          categoria: { select: { descricao: true } },
          subCategoria: { select: { descricao: true } },
        },
      });
      if (!produto) return null;

      const [campos, fichas, relacionados] = await Promise.all([
        this.camposVisiveis(tx, empresaId, produtoId),
        this.fichas.listarTx(tx, empresaId, produtoId, { apenasAgente: true }),
        this.relacionados.listarTx(tx, empresaId, produtoId),
      ]);

      return {
        codigo: produto.codigoErp,
        descricao: produto.descricao,
        marca: produto.marca,
        unidade: produto.unidade,
        qtdEmbalagem: produto.qtdEmbalagem,
        categoria: produto.categoria?.descricao ?? null,
        subCategoria: produto.subCategoria?.descricao ?? null,
        observacao: produto.observacao,
        caracteristicas: campos,
        // A ficha é texto que veio de um PDF de fabricante e pode trazer tabela
        // de preço mesmo com a instrução de extração pedindo o contrário. O
        // corte é aqui, no que sai — ver `semPreco`.
        fichas: fichas.map((f) => ({
          titulo: f.titulo,
          conteudo: semPreco(f.markdown),
        })),
        similares: relacionados
          .filter((r) => r.tipo === 'similar')
          .map((r) => ({ codigo: r.codigoErp, descricao: r.descricao })),
        usaNaAplicacao: relacionados
          .filter((r) => r.tipo === 'aplicacao' && r.origem)
          .map((r) => ({
            codigo: r.codigoErp,
            descricao: r.descricao,
            observacao: r.observacao,
          })),
        usadoEm: relacionados
          .filter((r) => r.tipo === 'aplicacao' && !r.origem)
          .map((r) => ({ codigo: r.codigoErp, descricao: r.descricao })),
      };
    });
  }

  /** Os campos complementares preenchidos que a empresa liberou para a IA. */
  private async camposVisiveis(
    tx: Parameters<ProdutoFichasService['listarTx']>[0],
    empresaId: string,
    produtoId: string,
  ) {
    const campos = await tx.produtoCampo.findMany({
      where: { empresaId, deletedAt: null, ativo: true, visivelAgente: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, unidade: true },
    });
    if (campos.length === 0) return [];

    const valores = await tx.produtoCampoValor.findMany({
      where: { empresaId, produtoId, campoId: { in: campos.map((c) => c.id) } },
      select: { campoId: true, valor: true },
    });
    const porCampo = new Map(valores.map((v) => [v.campoId, v.valor]));

    // Só o que está preenchido: uma lista de campos vazios não ajuda a
    // responder nada e ocupa o contexto do modelo à toa.
    return campos
      .filter((c) => porCampo.get(c.id))
      .map((c) => ({
        nome: c.nome,
        valor: porCampo.get(c.id) as string,
        unidade: c.unidade,
      }));
  }
}

/**
 * Palavras que não ajudam a achar produto.
 *
 * Preposições e conectivos da frase que a pessoa escreveu ("algo **para** o
 * chão **da** cozinha"). Deixá-los na busca casaria com meio catálogo, e como
 * a busca exige **todas** as palavras, bastaria um deles não aparecer em
 * lugar nenhum para o produto certo ficar de fora.
 */
const VAZIAS = new Set([
  // conectivos
  'para',
  'com',
  'sem',
  'dos',
  'das',
  'nos',
  'nas',
  'num',
  'numa',
  'que',
  'uma',
  'uns',
  'umas',
  'pelo',
  'pela',
  'até',
  'ate',
  // pronomes e determinantes
  'meu',
  'minha',
  'meus',
  'seu',
  'sua',
  'esse',
  'essa',
  'este',
  'esta',
  'isso',
  'aquele',
  'aquela',
  // verbos e advérbios que aparecem em toda pergunta
  'uso',
  'usar',
  'usado',
  'quero',
  'preciso',
  'tenho',
  'ter',
  'tem',
  'pode',
  'posso',
  'deve',
  'fazer',
  'serve',
  'indicado',
  'melhor',
  'muito',
  'mais',
  'menos',
  'não',
  'nao',
  'sim',
  'como',
  'qual',
  'quais',
  'onde',
  'quando',
  'algo',
  'alguma',
  'algum',
  // palavras do próprio domínio, que casariam com o catálogo inteiro
  'produto',
  'produtos',
  'item',
  'itens',
  'marca',
  'voces',
  'vocês',
]);

/**
 * A frase da pessoa vira as palavras que valem a busca.
 *
 * Teto de seis: a partir daí cada palavra a mais só estreita um resultado que
 * já estava estreito, e a consulta cresce à toa.
 */
export function palavrasDaBusca(busca: string): string[] {
  const palavras = busca
    .trim()
    .toLowerCase()
    // Separa por tudo que não é letra, dígito ou hífen — o hífen fica porque
    // código de produto o usa ("DEMO-P015").
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((t) => t.length >= 3 && !VAZIAS.has(t));

  // Uma busca só de palavras vazias ("preciso de algo") não deve virar uma
  // consulta sem filtro nenhum, que devolveria o catálogo inteiro.
  if (palavras.length === 0) {
    const inteiro = busca.trim();
    return inteiro.length >= 2 ? [inteiro] : [];
  }

  return [...new Set(palavras)].slice(0, 6);
}
