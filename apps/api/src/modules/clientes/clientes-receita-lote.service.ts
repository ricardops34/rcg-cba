import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClientesReceitaExecucao,
  ClientesReceitaLoteBody,
  ClientesReceitaLoteResultado,
  ClienteCamposConfig,
  ConsultaCnpjResultado,
} from '@plataforma/contracts';
import { Prisma, PrismaService } from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ClienteCampoConfigService } from '../cliente-campo-config/cliente-campo-config.service';
import { ClienteAlteracoesService } from './cliente-alteracoes.service';
import { EnriquecimentoService } from './enriquecimento.service';

/** Cortesia com o serviço público, que é gratuito e compartilhado. */
const INTERVALO_MS = 1000;
/** Espera antes da segunda tentativa, quando a fonte falha ou limita acesso. */
const ESPERA_RETENTATIVA_MS = 10_000;
/** Falhas seguidas que encerram o lote: a fonte está fora, não adianta insistir. */
const MAX_FALHAS_SEGUIDAS = 20;
/** Execução "rodando" há mais que isso é de antes de um reinício da API. */
const EXECUCAO_ORFA_MS = 3 * 60 * 60_000;
/** De quantos em quantos clientes o andamento é gravado para a tela. */
const GRAVAR_ANDAMENTO_A_CADA = 10;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/**
 * Texto comparável: sem acento, caixa, pontuação e espaço repetido. "Rua
 * José, 10" e "RUA JOSE 10" são o mesmo endereço — sem isto, quase todo
 * cliente viraria uma solicitação de aprovação só por grafia.
 */
const comparavel = (v: unknown): string =>
  typeof v === 'string'
    ? v
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
    : '';

const vazio = (v: unknown) =>
  v == null || (typeof v === 'string' && v.trim() === '');

/** Campos do cadastro que a consulta à Receita devolve. */
const CAMPOS_RECEITA = [
  'razaoSocial',
  'nomeFantasia',
  'endereco',
  'complemento',
  'bairro',
  'municipio',
  'uf',
  'cep',
  'telefone',
  'telefone2',
  'email',
] as const satisfies readonly (keyof ConsultaCnpjResultado)[];

/** O que a regra fez com um cliente. Só nomes de campo e códigos, sem valores
 *  — é o que o assistente pode repetir ao modelo (`anonimizar-agente.ts`). */
export interface AplicacaoReceita {
  atualizou: boolean;
  pendente: boolean;
  cnaePreenchido: boolean;
  camposAtualizados: string[];
  camposPendentes: string[];
  solicitacaoId: string | null;
  cnaesAplicados: string[];
}

type Desfecho = 'nao_encontrado' | AplicacaoReceita;

/**
 * Atualização em lote do cadastro de clientes pela Receita Federal
 * (MinhaReceita), em segundo plano — o botão "Atualizar pela Receita" do
 * Cadastro de Clientes.
 *
 * Regra por campo (decisões do usuário, 2026-10-07):
 *
 * - **Campo vazio no cadastro** é preenchimento: o dado da Receita grava
 *   direto, registrado na fila como autoaprovado (o rastro de quem e quando
 *   é o mesmo de sempre). Vale para o CNAE: sem nenhum ramo, recebe principal
 *   e secundários; com ramo e sem principal, recebe o principal.
 * - **Campo com valor diferente** vai para a fila de aprovação. Diferença só
 *   de grafia (acento, caixa, pontuação) não conta. Com ramo, a união dos
 *   CNAEs vai para aprovação.
 *
 * Campo travado na configuração da empresa nunca é gravado direto — só pode
 * chegar como proposta, para alguém decidir.
 *
 * A mesma regra vale para a consulta de um cliente só
 * (`ClientesService.atualizarPelaReceita`, tela e assistente), que até
 * 07/10/2026 mandava tudo para a fila (decisão de 30/09/2026).
 */
@Injectable()
export class ClientesReceitaLoteService {
  private readonly logger = new Logger(ClientesReceitaLoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enriquecimento: EnriquecimentoService,
    private readonly alteracoes: ClienteAlteracoesService,
    private readonly campoConfig: ClienteCampoConfigService,
  ) {}

  /**
   * Registra a execução e devolve na hora; o lote corre depois. Uma por
   * empresa — quem garante é o índice parcial único da migration.
   */
  async iniciar(
    empresaId: string,
    user: AuthenticatedUser,
    body: ClientesReceitaLoteBody,
  ): Promise<ClientesReceitaExecucao> {
    const limite = new Date(Date.now() - EXECUCAO_ORFA_MS);
    let execucao: { id: string };
    try {
      execucao = await this.prisma.withTenant(empresaId, async (tx) => {
        await tx.clienteReceitaExecucao.updateMany({
          where: { empresaId, situacao: 'rodando', iniciadaEm: { lt: limite } },
          data: {
            situacao: 'falhou',
            erro: 'Interrompida: o servidor reiniciou durante a atualização.',
            concluidaEm: new Date(),
          },
        });
        return tx.clienteReceitaExecucao.create({
          data: { empresaId, usuarioId: user.id, parametros: body },
          select: { id: true },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já existe uma atualização pela Receita em andamento nesta empresa. Aguarde ela terminar.',
        );
      }
      throw err;
    }
    // Sem `await`: é isto que tira o lote da requisição.
    void this.executar(execucao.id, empresaId, user, body);
    return (await this.ultimaExecucao(empresaId))!;
  }

  /** A execução mais recente da empresa, para a tela acompanhar. */
  async ultimaExecucao(
    empresaId: string,
  ): Promise<ClientesReceitaExecucao | null> {
    const e = await this.prisma.withTenant(empresaId, (tx) =>
      tx.clienteReceitaExecucao.findFirst({
        where: { empresaId },
        orderBy: { iniciadaEm: 'desc' },
      }),
    );
    if (!e) return null;
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: e.usuarioId },
      select: { nome: true },
    });
    return {
      id: e.id,
      situacao: e.situacao,
      iniciadaEm: e.iniciadaEm.toISOString(),
      concluidaEm: e.concluidaEm?.toISOString() ?? null,
      usuarioNome: usuario?.nome ?? null,
      resultado: (e.resultado as ClientesReceitaLoteResultado | null) ?? null,
      erro: e.erro,
    };
  }

  private async executar(
    execucaoId: string,
    empresaId: string,
    user: AuthenticatedUser,
    body: ClientesReceitaLoteBody,
  ) {
    const resultado: ClientesReceitaLoteResultado = {
      total: 0,
      processados: 0,
      atualizados: 0,
      pendentes: 0,
      cnaesPreenchidos: 0,
      semMudanca: 0,
      naoEncontrados: 0,
      falhas: 0,
    };
    const gravar = (data: Prisma.ClienteReceitaExecucaoUpdateInput) =>
      this.prisma.withTenant(empresaId, (tx) =>
        tx.clienteReceitaExecucao.update({ where: { id: execucaoId }, data }),
      );

    let titulo: string;
    let descricao: string;
    try {
      const clientes = await this.clientesDoLote(empresaId, user, body);
      resultado.total = clientes.length;
      await gravar({ resultado: { ...resultado } });

      const config = await this.campoConfig.obterConfig(empresaId);
      let falhasSeguidas = 0;
      for (const cliente of clientes) {
        try {
          const desfecho = await this.atualizarCliente(
            empresaId,
            user,
            cliente.id,
            cliente.cnpj,
            config,
          );
          falhasSeguidas = 0;
          if (desfecho === 'nao_encontrado') resultado.naoEncontrados++;
          else {
            if (desfecho.atualizou) resultado.atualizados++;
            if (desfecho.pendente) resultado.pendentes++;
            if (desfecho.cnaePreenchido) resultado.cnaesPreenchidos++;
            if (!desfecho.atualizou && !desfecho.pendente)
              resultado.semMudanca++;
          }
        } catch (err) {
          resultado.falhas++;
          falhasSeguidas++;
          this.logger.warn(
            `Receita em lote: cliente ${cliente.id} falhou — ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
            throw new Error(
              `${MAX_FALHAS_SEGUIDAS} consultas seguidas falharam — o serviço da Receita parece indisponível. ` +
                `${resultado.processados + 1} de ${resultado.total} clientes foram processados; rode de novo mais tarde.`,
            );
          }
        }
        resultado.processados++;
        if (resultado.processados % GRAVAR_ANDAMENTO_A_CADA === 0) {
          await gravar({ resultado: { ...resultado } });
        }
        await dormir(INTERVALO_MS);
      }

      await gravar({
        situacao: 'concluida',
        resultado: { ...resultado },
        concluidaEm: new Date(),
      });
      titulo = 'Clientes atualizados pela Receita';
      descricao =
        `${resultado.processados} consultado(s): ${resultado.atualizados} com campo vazio preenchido (${resultado.cnaesPreenchidos} com CNAE), ` +
        `${resultado.pendentes} com divergência para aprovação` +
        (resultado.naoEncontrados
          ? `, ${resultado.naoEncontrados} não encontrado(s)`
          : '') +
        (resultado.falhas
          ? `, ${resultado.falhas} com falha na consulta`
          : '') +
        '.';
    } catch (err) {
      this.logger.error(
        `Atualização em lote pela Receita falhou (execução ${execucaoId})`,
        err as Error,
      );
      const erro = err instanceof Error ? err.message : String(err);
      await gravar({
        situacao: 'falhou',
        resultado: { ...resultado },
        erro: erro.slice(0, 1000),
        concluidaEm: new Date(),
      }).catch((e) =>
        this.logger.error(
          `Não foi possível registrar a falha da execução ${execucaoId}`,
          e as Error,
        ),
      );
      titulo = 'A atualização de clientes pela Receita falhou';
      descricao =
        'Abra o Cadastro de Clientes para ver o motivo e tentar de novo.';
    }

    // Um aviso só, no sino de quem pediu — as pendências do lote não viram
    // tarefa de agenda uma a uma (ver `registrarNaAgenda`).
    await this.prisma
      .withTenant(empresaId, (tx) =>
        tx.notificacao.create({
          data: {
            empresaId,
            usuarioId: user.id,
            tipo: 'clientes_receita_atualizados',
            titulo,
            descricao,
            rota: '/cadastros/clientes',
            referenciaId: execucaoId,
            ocorridaEm: new Date(),
          },
        }),
      )
      .catch((e) =>
        this.logger.error(
          'Não foi possível notificar o fim da atualização',
          e as Error,
        ),
      );
  }

  /** Ativos, com CNPJ de 14 dígitos, no escopo de quem pediu. */
  private async clientesDoLote(
    empresaId: string,
    user: AuthenticatedUser,
    body: ClientesReceitaLoteBody,
  ): Promise<{ id: string; cnpj: string }[]> {
    const linhas = await this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const de = body.clienteCodigoDe || undefined;
      const ate = body.clienteCodigoAte || undefined;
      return tx.cliente.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          cnpjCpf: { not: null },
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
          ...(de || ate
            ? {
                codigoErp: {
                  ...(de ? { gte: de } : {}),
                  ...(ate ? { lte: ate } : {}),
                },
              }
            : {}),
          ...(body.somenteSemCnae
            ? { cnaes: { none: { deletedAt: null } } }
            : {}),
        },
        orderBy: { codigoErp: 'asc' },
        select: { id: true, cnpjCpf: true },
      });
    });
    return linhas
      .map((l) => ({ id: l.id, cnpj: digitos(l.cnpjCpf) }))
      .filter((l) => l.cnpj.length === 14);
  }

  /** Consulta com uma segunda tentativa; CNPJ desconhecido não é falha. */
  private async consultar(cnpj: string): Promise<ConsultaCnpjResultado | null> {
    try {
      return await this.enriquecimento.consultarCnpj(cnpj);
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      await dormir(ESPERA_RETENTATIVA_MS);
      try {
        return await this.enriquecimento.consultarCnpj(cnpj);
      } catch (err2) {
        if (err2 instanceof NotFoundException) return null;
        throw err2;
      }
    }
  }

  private async atualizarCliente(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    cnpj: string,
    config: ClienteCamposConfig,
  ): Promise<Desfecho> {
    const consulta = await this.consultar(cnpj);
    if (!consulta) return 'nao_encontrado';
    return this.aplicarReceita(empresaId, user, clienteId, consulta, {
      config,
      registrarNaAgenda: false,
      contexto: 'Atualização em lote pela Receita',
    });
  }

  /**
   * A regra por campo, num lugar só: usada pelo lote e pela consulta de um
   * cliente (`ClientesService.atualizarPelaReceita`, tela e assistente).
   * Quem chama já garantiu que o cliente está no escopo de quem pede.
   */
  async aplicarReceita(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    consulta: ConsultaCnpjResultado,
    opcoes: {
      config?: ClienteCamposConfig;
      /** Pendência nova vira tarefa na agenda de quem aprova? */
      registrarNaAgenda: boolean;
      /** Início da justificativa gravada na fila ("Atualização em lote..."). */
      contexto: string;
    },
  ): Promise<AplicacaoReceita> {
    const config =
      opcoes.config ?? (await this.campoConfig.obterConfig(empresaId));

    return this.prisma.withTenant(empresaId, async (tx) => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId, empresaId, deletedAt: null },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      const vinculos = await tx.clienteCnae.findMany({
        where: { empresaId, clienteId, deletedAt: null },
        select: { principal: true, cnae: { select: { codigoErp: true } } },
      });
      const codigosAtuais = vinculos.map((v) => v.cnae.codigoErp);
      const principalAtual =
        vinculos.find((v) => v.principal)?.cnae.codigoErp ?? null;

      const atual: Record<string, unknown> = { ...cliente };
      const preencher: Record<string, unknown> = {};
      const propor: Record<string, unknown> = {};

      for (const campo of CAMPOS_RECEITA) {
        const valor = consulta[campo];
        // A Receita sem o dado não é motivo para apagar o que o cadastro tem.
        if (vazio(valor)) continue;
        if (vazio(atual[campo])) {
          // Vazio é preenchimento, não alteração: entra direto — salvo campo
          // travado na configuração da empresa, que só chega como proposta.
          if (config[campo] === false) propor[campo] = valor;
          else preencher[campo] = valor;
        } else if (comparavel(atual[campo]) !== comparavel(valor)) {
          propor[campo] = valor;
        }
      }

      // Código fora da referência local (sync do IBGE atrasado) não vira vínculo.
      const sugeridos = consulta.cnaes.filter((c) => !!c.cnaeId);
      const principalReceita =
        sugeridos.find((c) => c.principal)?.codigo ?? null;
      const cnaesTravados = config.cnaes === false;
      if (sugeridos.length > 0) {
        if (codigosAtuais.length === 0 && !cnaesTravados) {
          preencher.cnaes = sugeridos.map((c) => c.codigo);
          if (principalReceita) preencher.cnaePrincipal = principalReceita;
        } else {
          // União: a fila nunca propõe remover ramo que já está no cadastro.
          propor.cnaes = [
            ...new Set([...codigosAtuais, ...sugeridos.map((c) => c.codigo)]),
          ];
          if (principalReceita) {
            if (!principalAtual && !cnaesTravados) {
              preencher.cnaePrincipal = principalReceita;
            } else {
              propor.cnaePrincipal = principalReceita;
            }
          }
        }
      }

      const atualComCnae = {
        ...atual,
        cnaes: codigosAtuais,
        cnaePrincipal: principalAtual,
      };
      const direto = await this.alteracoes.registrar(tx, {
        empresaId,
        clienteId,
        atual: atualComCnae,
        input: preencher,
        origem: 'enriquecimento',
        autorId: user.id,
        aplicarDireto: true,
        justificativa: `${opcoes.contexto}: campo vazio no cadastro.`,
      });
      const fila = await this.alteracoes.registrar(tx, {
        empresaId,
        clienteId,
        atual: atualComCnae,
        input: propor,
        origem: 'enriquecimento',
        autorId: user.id,
        aplicarDireto: false,
        justificativa: `${opcoes.contexto}: valor diferente do cadastro.`,
        registrarNaAgenda: opcoes.registrarNaAgenda,
      });

      const camposAtualizados =
        direto.resultado === 'aplicado' ? Object.keys(direto.diff) : [];
      const cnaesAplicados =
        direto.resultado === 'aplicado' && direto.diff.cnaes
          ? String(direto.diff.cnaes.para ?? '')
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean)
          : [];
      return {
        atualizou: camposAtualizados.length > 0,
        pendente: fila.resultado === 'pendente',
        cnaePreenchido: cnaesAplicados.length > 0,
        camposAtualizados,
        camposPendentes:
          fila.resultado === 'pendente' ? Object.keys(fila.diff) : [],
        solicitacaoId:
          fila.resultado === 'pendente' ? fila.solicitacaoId : null,
        cnaesAplicados,
      };
    });
  }
}
