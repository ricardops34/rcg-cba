import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  ProdutoCampoCreate,
  ProdutoCampoUpdate,
  ProdutoCamposGravar,
} from '@plataforma/contracts';
import { normalizarValorDoCampo } from './normalizar-valor';
import type { TenantTx } from '../../common/prisma/prisma.service';

/**
 * Campos complementares de produto.
 *
 * Este serviço cuida das **duas** metades: o cadastro das definições (o que a
 * empresa resolveu guardar) e o preenchimento por produto. Ficam juntas porque
 * a validação de um valor depende da definição — separá-las obrigaria a
 * duplicar a conversão de tipo, e uma cópia divergiria da outra.
 */
@Injectable()
export class ProdutoCamposService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // Definições
  // ------------------------------------------------------------------

  /**
   * `apenasAtivos` é o que a tela de preenchimento pede: um campo desativado
   * some do formulário mas **não** perde o que já estava gravado — desativar
   * não é apagar.
   */
  async listar(empresaId: string, apenasAtivos = false) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.produtoCampo.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ...(apenasAtivos ? { ativo: true } : {}),
        },
        orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      }),
    );
  }

  async criar(empresaId: string, userId: string, input: ProdutoCampoCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.produtoCampo.findFirst({
        where: { empresaId, chave: input.chave },
        select: { id: true, deletedAt: true },
      });
      if (existente) {
        // A chave é única no banco inclusive para o que foi excluído, então
        // recusar sem explicar deixaria o usuário tentando de novo o mesmo.
        throw new ConflictException(
          existente.deletedAt
            ? `Já existe um campo excluído com a chave "${input.chave}". Escolha outra.`
            : `Já existe um campo com a chave "${input.chave}".`,
        );
      }

      return tx.produtoCampo.create({
        data: {
          empresaId,
          chave: input.chave,
          nome: input.nome,
          tipo: input.tipo,
          unidade: input.unidade || null,
          opcoes: input.tipo === 'lista' ? input.opcoes : [],
          grupo: input.grupo || null,
          ajuda: input.ajuda || null,
          ordem: input.ordem,
          obrigatorio: input.obrigatorio,
          visivelAgente: input.visivelAgente,
          ativo: input.ativo,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    });
  }

  async atualizar(
    empresaId: string,
    userId: string,
    id: string,
    input: ProdutoCampoUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const campo = await tx.produtoCampo.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!campo) throw new NotFoundException('Campo não encontrado');

      const tipo = input.tipo ?? campo.tipo;
      const opcoes = input.opcoes ?? campo.opcoes;
      if (tipo === 'lista' && opcoes.length === 0) {
        throw new BadRequestException(
          'Campo de lista precisa de ao menos uma opção',
        );
      }

      // Mudar o tipo de um campo já preenchido é o caminho curto para um
      // cadastro cheio de valor que não conversa com o tipo — "sim" num campo
      // que virou número. Vale a recusa: o caminho é criar outro campo.
      if (input.tipo && input.tipo !== campo.tipo) {
        const preenchidos = await tx.produtoCampoValor.count({
          where: { empresaId, campoId: id },
        });
        if (preenchidos > 0) {
          throw new ConflictException(
            `Este campo já está preenchido em ${preenchidos} produto(s); ` +
              'o tipo não pode mais mudar. Crie um campo novo e desative este.',
          );
        }
      }

      return tx.produtoCampo.update({
        where: { id },
        data: {
          ...(input.nome !== undefined ? { nome: input.nome } : {}),
          ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
          ...(input.unidade !== undefined
            ? { unidade: input.unidade || null }
            : {}),
          ...(input.opcoes !== undefined
            ? { opcoes: tipo === 'lista' ? input.opcoes : [] }
            : {}),
          ...(input.grupo !== undefined ? { grupo: input.grupo || null } : {}),
          ...(input.ajuda !== undefined ? { ajuda: input.ajuda || null } : {}),
          ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
          ...(input.obrigatorio !== undefined
            ? { obrigatorio: input.obrigatorio }
            : {}),
          ...(input.visivelAgente !== undefined
            ? { visivelAgente: input.visivelAgente }
            : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: userId,
        },
      });
    });
  }

  /**
   * Exclusão lógica, e ela **não** apaga o que os produtos têm preenchido.
   *
   * O valor fica onde está: se o campo for restaurado, o cadastro volta
   * inteiro. Quem só quer tirar da tela deve desativar — a exclusão existe
   * para o campo criado por engano.
   */
  async remover(empresaId: string, userId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const campo = await tx.produtoCampo.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!campo) throw new NotFoundException('Campo não encontrado');
      await tx.produtoCampo.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: userId, ativo: false },
      });
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------
  // Valores por produto
  // ------------------------------------------------------------------

  /**
   * O formulário do produto: **toda** definição ativa, com o valor quando
   * houver.
   *
   * Devolver só o que está preenchido faria a tela não ter o que desenhar num
   * produto novo — e é justamente nele que os campos precisam aparecer.
   *
   * `apenasAgente` é o recorte que a ferramenta de IA usa: campo marcado como
   * não visível ao agente nem chega a sair daqui. É código, não instrução de
   * prompt.
   */
  async valoresDoProduto(
    empresaId: string,
    produtoId: string,
    opcoes: { apenasAgente?: boolean; apenasPreenchidos?: boolean } = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) =>
      this.valoresDoProdutoTx(tx, empresaId, produtoId, opcoes),
    );
  }

  /** Mesma leitura, para quem já está dentro de uma transação. */
  async valoresDoProdutoTx(
    tx: TenantTx,
    empresaId: string,
    produtoId: string,
    opcoes: { apenasAgente?: boolean; apenasPreenchidos?: boolean } = {},
  ) {
    const campos = await tx.produtoCampo.findMany({
      where: {
        empresaId,
        deletedAt: null,
        ativo: true,
        ...(opcoes.apenasAgente ? { visivelAgente: true } : {}),
      },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
    if (campos.length === 0) return [];

    const valores = await tx.produtoCampoValor.findMany({
      where: {
        empresaId,
        produtoId,
        campoId: { in: campos.map((c) => c.id) },
      },
      select: { campoId: true, valor: true },
    });
    const porCampo = new Map(valores.map((v) => [v.campoId, v.valor]));

    const linhas = campos.map((c) => ({
      campoId: c.id,
      chave: c.chave,
      nome: c.nome,
      tipo: c.tipo,
      unidade: c.unidade,
      opcoes: c.opcoes,
      grupo: c.grupo,
      ajuda: c.ajuda,
      obrigatorio: c.obrigatorio,
      valor: porCampo.get(c.id) ?? null,
    }));

    return opcoes.apenasPreenchidos
      ? linhas.filter((l) => l.valor !== null)
      : linhas;
  }

  /**
   * Grava o formulário inteiro de uma vez.
   *
   * Cada valor é validado contra o **tipo da definição**, e o que passa é
   * normalizado antes de entrar no banco (ver `normalizar`). Sem isso o campo
   * "peso" aceitaria "mais ou menos 12" e quem lê depois — a tela, a IA, um
   * relatório — teria de adivinhar.
   */
  async gravarValores(
    empresaId: string,
    userId: string,
    produtoId: string,
    input: ProdutoCamposGravar,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id: produtoId, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!produto) throw new NotFoundException('Produto não encontrado');

      const ids = [...new Set(input.valores.map((v) => v.campoId))];
      const campos = await tx.produtoCampo.findMany({
        where: { empresaId, id: { in: ids }, deletedAt: null, ativo: true },
      });
      const porId = new Map(campos.map((c) => [c.id, c]));

      for (const item of input.valores) {
        const campo = porId.get(item.campoId);
        // Campo inexistente, excluído ou desativado: recusa em vez de ignorar
        // em silêncio, senão a tela diz "salvo" e o valor não está lá.
        if (!campo) {
          throw new BadRequestException(
            'Campo complementar inválido ou desativado',
          );
        }

        const bruto = (item.valor ?? '').trim();
        if (!bruto) {
          if (campo.obrigatorio) {
            throw new BadRequestException(`Informe ${campo.nome}`);
          }
          await tx.produtoCampoValor.deleteMany({
            where: { empresaId, produtoId, campoId: campo.id },
          });
          continue;
        }

        const valor = normalizarValorDoCampo(
          campo.tipo,
          campo.opcoes,
          bruto,
          campo.nome,
        );
        await tx.produtoCampoValor.upsert({
          where: {
            empresaId_produtoId_campoId: {
              empresaId,
              produtoId,
              campoId: campo.id,
            },
          },
          update: { valor, updatedBy: userId },
          create: {
            empresaId,
            produtoId,
            campoId: campo.id,
            valor,
            createdBy: userId,
            updatedBy: userId,
          },
        });
      }

      return this.valoresDoProdutoTx(tx, empresaId, produtoId);
    });
  }
}
