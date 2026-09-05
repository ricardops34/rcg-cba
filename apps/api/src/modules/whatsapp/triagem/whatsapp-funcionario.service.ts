import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TenantTx } from '../../../common/prisma/prisma.service';
import { chaveTelefone, digitos, sufixoTelefone } from './telefone-equipe';

/**
 * Validade do código enviado para confirmar o número.
 *
 * Curta de propósito: ele é lido no sistema e digitado no WhatsApp, o que leva
 * segundos. Um código que vale o dia todo vale para quem estiver com o aparelho
 * mais tarde.
 */
const CODIGO_VALIDADE_MIN = 10;

/** Erros seguidos antes de o código morrer. */
const MAX_TENTATIVAS = 5;

/**
 * Por quantos dias o número confirmado continua valendo.
 *
 * Não é para sempre porque pessoas trocam de telefone e saem da empresa, e um
 * pareamento eterno sobreviveria às duas coisas.
 */
const VALIDADE_DIAS = 30;

/** O que o institucional descobriu sobre quem escreveu. */
export type Identidade =
  | { tipo: 'desconhecido' }
  | {
      /** Reconhecido no cadastro, mas o número ainda não foi confirmado. */
      tipo: 'funcionario_pendente';
      vinculoId: string;
      usuarioId: string;
      nome: string;
    }
  | {
      tipo: 'funcionario';
      vinculoId: string;
      usuarioId: string;
      vendedorId: string;
      nome: string;
      /** Tem gente abaixo na hierarquia — enxerga a equipe, não só a carteira. */
      superior: boolean;
    };

/**
 * Reconhece o funcionário que escreve para o número institucional e cuida do
 * pareamento do aparelho dele.
 *
 * **O telefone sozinho não autoriza nada.** Ele diz *quem provavelmente é*; o
 * que autoriza é o código confirmado, e o código só aparece dentro do sistema,
 * para quem entrou com senha. Sem essa segunda etapa, um celular emprestado,
 * perdido ou clonado falaria com a voz do dono — e, diferente do cliente, o
 * funcionário enxerga carteira, títulos e números da equipe.
 */
@Injectable()
export class WhatsappFuncionarioService {
  private readonly logger = new Logger(WhatsappFuncionarioService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quem é o dono deste número, do ponto de vista da empresa.
   *
   * Duas comparações diferentes, de propósito:
   *
   * - **Encontrar a pessoa** no cadastro usa os últimos 8 dígitos, como
   *   `casarCliente` — tolerante porque o cadastro pode estar sem DDI ou sem o
   *   9º dígito. Encontrar não autoriza nada: abre um pedido de código.
   * - **O pareamento** usa a chave exata (DDD + 8), porque ali a tolerância
   *   deixaria um número de outro DDD herdar a confirmação alheia.
   *
   * Como em `casarCliente`, **ambiguidade não adivinha**: dois vendedores com o
   * mesmo sufixo devolvem `desconhecido`, e a conversa segue como cliente.
   */
  async identificar(
    tx: TenantTx,
    empresaId: string,
    telefoneBruto: string | null,
  ): Promise<Identidade> {
    const sufixo = sufixoTelefone(telefoneBruto);
    // Sem chave exata não há pareamento possível: número sem DDD não se
    // distingue de um de outra região, e é essa distinção que impede alguém de
    // herdar a confirmação alheia.
    const chave = chaveTelefone(telefoneBruto);
    if (!sufixo || !chave) return { tipo: 'desconhecido' };

    // O vínculo com a empresa precisa estar **ativo**, e não só existir.
    //
    // Sem isso, desligar alguém exigiria lembrar de desativar o cadastro de
    // vendedor: enquanto ele ficasse ativo, o ex-funcionário continuaria
    // consultando a carteira pelo WhatsApp com o pareamento que já tinha. Aqui
    // basta cortar o acesso ao sistema, que é o que se faz primeiro.
    const candidatos = await tx.$queryRaw<
      { id: string; nome: string; usuarioId: string | null }[]
    >`
      SELECT v.id, v.nome, v."usuarioId"
      FROM vendedores v
      JOIN usuarios u ON u.id = v."usuarioId"
      JOIN usuario_empresas ue
        ON ue."usuarioId" = u.id AND ue."empresaId" = v."empresaId"
      WHERE v."empresaId" = ${empresaId}
        AND v."deletedAt" IS NULL
        AND v.ativo
        AND u."deletedAt" IS NULL
        AND u.ativo
        AND ue.ativo
        AND right(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g'), 8) = ${sufixo}
      LIMIT 2`;

    // Ambiguidade não adivinha: dois vendedores com o mesmo sufixo não
    // resolvem para nenhum.
    if (candidatos.length !== 1) return { tipo: 'desconhecido' };
    const vendedor = candidatos[0];
    if (!vendedor.usuarioId) return { tipo: 'desconhecido' };

    const vinculo = await this.vinculo(
      tx,
      empresaId,
      vendedor.usuarioId,
      telefoneBruto,
      sufixo,
      chave,
    );

    const confirmado =
      vinculo.confirmadoEm !== null &&
      vinculo.validoAte !== null &&
      vinculo.validoAte > new Date();

    if (!confirmado) {
      return {
        tipo: 'funcionario_pendente',
        vinculoId: vinculo.id,
        usuarioId: vendedor.usuarioId,
        nome: vendedor.nome,
      };
    }

    // "Superior" aqui é quem tem gente abaixo, e não o rótulo do cargo — a
    // mesma regra de `resolverEscopoVendedores`. Gerente e supervisor são o
    // mesmo grupo por decisão do usuário: o cadastro não os distingue.
    const abaixo = await tx.vendedor.count({
      where: { empresaId, superiorId: vendedor.id, deletedAt: null },
    });

    return {
      tipo: 'funcionario',
      vinculoId: vinculo.id,
      usuarioId: vendedor.usuarioId,
      vendedorId: vendedor.id,
      nome: vendedor.nome,
      superior: abaixo > 0,
    };
  }

  /**
   * A linha de pareamento deste número, criada na primeira vez que ele
   * escreve. Um número atende uma pessoa por empresa (índice único na chave);
   * se o número mudou de dono no cadastro, o vínculo é reapontado e **perde a
   * confirmação** — quem herdou o número confirma por si.
   */
  private async vinculo(
    tx: TenantTx,
    empresaId: string,
    usuarioId: string,
    telefoneBruto: string | null,
    sufixo: string,
    chave: string,
  ) {
    // A chave é o número **exato** (DDD + 8 dígitos). O sufixo serve para
    // encontrar a pessoa no cadastro; chavear o pareamento nele deixava um
    // número de outro DDD herdar a confirmação alheia.
    const existente = await tx.whatsappVinculoFuncionario.findUnique({
      where: { empresaId_chave: { empresaId, chave } },
    });

    if (!existente) {
      return tx.whatsappVinculoFuncionario.create({
        data: {
          empresaId,
          usuarioId,
          telefone: digitos(telefoneBruto),
          sufixo,
          chave,
        },
      });
    }

    if (existente.usuarioId !== usuarioId) {
      return tx.whatsappVinculoFuncionario.update({
        where: { id: existente.id },
        data: {
          usuarioId,
          telefone: digitos(telefoneBruto),
          codigo: null,
          codigoExpiraEm: null,
          tentativas: 0,
          confirmadoEm: null,
          validoAte: null,
        },
      });
    }

    return existente;
  }

  /**
   * Gera (ou reaproveita) o código pendente e devolve o texto a mandar.
   *
   * Reaproveita enquanto o anterior é válido para o caso comum de a pessoa
   * escrever duas vezes seguidas: gerar um novo a cada mensagem invalidaria o
   * que ela acabou de ler na tela.
   */
  async pedirCodigo(
    empresaId: string,
    vinculoId: string,
    nome: string,
  ): Promise<string> {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const vinculo = await tx.whatsappVinculoFuncionario.findFirst({
        where: { id: vinculoId },
        select: { codigo: true, codigoExpiraEm: true },
      });
      const valido =
        vinculo?.codigo &&
        vinculo.codigoExpiraEm &&
        vinculo.codigoExpiraEm > new Date();
      if (valido) return;

      await tx.whatsappVinculoFuncionario.update({
        where: { id: vinculoId },
        data: {
          // `randomInt` e não `Math.random`: é credencial, ainda que de vida
          // curta, e a diferença de custo aqui é irrelevante.
          codigo: String(randomInt(0, 1_000_000)).padStart(6, '0'),
          codigoExpiraEm: new Date(Date.now() + CODIGO_VALIDADE_MIN * 60_000),
          tentativas: 0,
        },
      });
    });

    const primeiroNome = nome.trim().split(/\s+/)[0];
    return (
      `Oi, ${primeiroNome}! Reconheci este número como seu, mas preciso confirmar ` +
      `antes de responder sobre a sua carteira.\n\n` +
      `Entre no sistema, abra *Meu perfil* e me mande aqui o código de 6 dígitos ` +
      `que aparece lá. Ele vale por ${CODIGO_VALIDADE_MIN} minutos.`
    );
  }

  /**
   * Tenta confirmar o pareamento com o que a pessoa escreveu.
   *
   * Devolve `null` quando a mensagem não parece um código — é o caso normal de
   * quem escreveu "bom dia" —, para quem chamou seguir pedindo o código em vez
   * de tratar a conversa como uma tentativa falha.
   */
  async tentarConfirmar(
    empresaId: string,
    vinculoId: string,
    texto: string | null,
  ): Promise<{ ok: boolean; mensagem: string } | null> {
    const informado = digitos(texto);
    if (informado.length !== 6) return null;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const vinculo = await tx.whatsappVinculoFuncionario.findFirst({
        where: { id: vinculoId },
        select: { codigo: true, codigoExpiraEm: true, tentativas: true },
      });

      if (!vinculo?.codigo || !vinculo.codigoExpiraEm) {
        return {
          ok: false,
          mensagem:
            'Não há código pendente. Me escreva de novo que eu gero um.',
        };
      }

      if (vinculo.codigoExpiraEm <= new Date()) {
        await tx.whatsappVinculoFuncionario.update({
          where: { id: vinculoId },
          data: { codigo: null, codigoExpiraEm: null, tentativas: 0 },
        });
        return {
          ok: false,
          mensagem:
            'Esse código expirou. Me escreva de novo que eu gero outro.',
        };
      }

      if (vinculo.codigo !== informado) {
        const tentativas = vinculo.tentativas + 1;
        const estourou = tentativas >= MAX_TENTATIVAS;
        await tx.whatsappVinculoFuncionario.update({
          where: { id: vinculoId },
          data: estourou
            ? { codigo: null, codigoExpiraEm: null, tentativas: 0 }
            : { tentativas },
        });
        return {
          ok: false,
          mensagem: estourou
            ? 'Errou o código vezes demais. Me escreva de novo para gerar outro.'
            : `Código incorreto. Tente de novo (${MAX_TENTATIVAS - tentativas} restantes).`,
        };
      }

      await tx.whatsappVinculoFuncionario.update({
        where: { id: vinculoId },
        data: {
          codigo: null,
          codigoExpiraEm: null,
          tentativas: 0,
          confirmadoEm: new Date(),
          validoAte: new Date(Date.now() + VALIDADE_DIAS * 24 * 60 * 60_000),
        },
      });

      return {
        ok: true,
        mensagem:
          'Pronto, número confirmado. Agora posso responder sobre a sua ' +
          `carteira por aqui. Vou pedir o código de novo daqui a ${VALIDADE_DIAS} dias.`,
      };
    });
  }

  /**
   * O código pendente do próprio usuário, para a tela de Meu perfil.
   *
   * É o único lugar onde ele aparece, e é o que faz a posse do celular não
   * bastar: quem lê aqui já entrou com senha.
   */
  async codigoPendente(empresaId: string, usuarioId: string) {
    const vinculo = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappVinculoFuncionario.findFirst({
        where: { empresaId, usuarioId },
        orderBy: { updatedAt: 'desc' },
        select: {
          codigo: true,
          codigoExpiraEm: true,
          telefone: true,
          confirmadoEm: true,
          validoAte: true,
        },
      }),
    );

    if (!vinculo) {
      return {
        codigo: null,
        expiraEm: null,
        telefone: null,
        confirmado: false,
        validoAte: null,
      };
    }

    const codigoValido =
      vinculo.codigo &&
      vinculo.codigoExpiraEm &&
      vinculo.codigoExpiraEm > new Date();

    return {
      // Código vencido não é mostrado: exibi-lo levaria a pessoa a digitar um
      // código que vai ser recusado, e a culpar a ferramenta.
      codigo: codigoValido ? vinculo.codigo : null,
      expiraEm: codigoValido ? vinculo.codigoExpiraEm?.toISOString() : null,
      telefone: vinculo.telefone,
      confirmado:
        vinculo.confirmadoEm !== null &&
        vinculo.validoAte !== null &&
        vinculo.validoAte > new Date(),
      validoAte: vinculo.validoAte?.toISOString() ?? null,
    };
  }
}
