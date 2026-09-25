import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoTituloReceber,
  IntegracaoTituloReceberCreate,
  IntegracaoTituloReceberQuery,
  IntegracaoTituloReceberUpdate,
  IntegracaoTituloReceberBaixa,
  IntegracaoTituloReceberLoteItem,
  IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
  type DecisaoUpsert,
} from '../common/decidir-upsert';
import { processarLote } from '../common/processar-lote';
import {
  criarFilhos,
  sincronizarFilhos,
} from '../common/sincronizar-filhos';
import { resolverVendedor } from '../common/resolver-vendedor';
import { resolverCliente } from '../common/resolver-cliente';

const INCLUDE = {
  cliente: { select: { chave: true } },
  vendedor: { select: { chave: true } },
  // A conta de cobrança volta pela descrição, que é como o ERP a referencia —
  // ele não conhece o uuid do cadastro da plataforma.
  contaBancaria: { select: { descricao: true } },
  // Na ordem do pagamento: é como o extrato do título é lido.
  baixas: { orderBy: { data: 'asc' } },
} satisfies Prisma.TituloReceberInclude;
type TituloComRelacoes = Prisma.TituloReceberGetPayload<{
  include: typeof INCLUDE;
}>;

/**
 * Desenho do boleto que o ERP manda junto com o título.
 *
 * Vão para o banco como chegaram — sem `soDigitos`, ao contrário de nosso
 * número e código de barras. Aqui há texto de propósito: nome do beneficiário,
 * endereço, local de pagamento, instruções. E os que são numéricos (agência,
 * conta, dígitos) já vêm normalizados do ERP, que os leu do cadastro de bancos
 * dele.
 */
const CAMPOS_BOLETO = [
  'nossoNumeroDac',
  'banco',
  'bancoNome',
  'bancoCodigoCompensacao',
  'agencia',
  'agenciaDv',
  'conta',
  'contaDv',
  'beneficiarioNome',
  'beneficiarioDocumento',
  'beneficiarioEndereco',
  'localPagamento',
  'aceite',
  'especieDocumento',
  'jurosValorDia',
  'multaValor',
  'descontoValor',
  'instrucoes',
] as const;

@Injectable()
export class IntegracaoTitulosReceberService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: TituloComRelacoes): IntegracaoTituloReceber {
    return {
      id: row.id,
      chave: row.chave ?? '',
      codigoErp: row.codigoErp,
      clienteChave: row.cliente?.chave ?? null,
      vendedorChave: row.vendedor?.chave ?? null,
      numero: row.numero,
      parcela: row.parcela,
      prefixo: row.prefixo,
      tipo: row.tipo,
      emissao: row.emissao,
      vencimento: row.vencimento,
      vencimentoReal: row.vencimentoReal,
      valor: row.valor,
      saldo: row.saldo,
      acrescimo: row.acrescimo,
      decrescimo: row.decrescimo,
      dtBaixa: row.dtBaixa,
      formaPgto: row.formaPgto,
      historico: row.historico,
      ativo: row.ativo,
      nossoNumero: row.nossoNumero,
      carteira: row.carteira,
      contaBancariaDescricao: row.contaBancaria?.descricao ?? null,
      codigoBarras: row.codigoBarras,
      linhaDigitavel: row.linhaDigitavel,
      nossoNumeroDac: row.nossoNumeroDac,
      banco: row.banco,
      bancoNome: row.bancoNome,
      bancoCodigoCompensacao: row.bancoCodigoCompensacao,
      agencia: row.agencia,
      agenciaDv: row.agenciaDv,
      conta: row.conta,
      contaDv: row.contaDv,
      beneficiarioNome: row.beneficiarioNome,
      beneficiarioDocumento: row.beneficiarioDocumento,
      beneficiarioEndereco: row.beneficiarioEndereco,
      localPagamento: row.localPagamento,
      aceite: row.aceite,
      especieDocumento: row.especieDocumento,
      jurosValorDia: row.jurosValorDia,
      multaValor: row.multaValor,
      descontoValor: row.descontoValor,
      instrucoes: row.instrucoes,
      baixas: row.baixas.map((baixa) => ({
        // `delete` é campo de comando do payload de entrada, não estado: na
        // leitura toda baixa devolvida existe, então vai sempre false.
        delete: false,
        chave: baixa.chave ?? '',
        data: baixa.data,
        valor: baixa.valor,
        juros: baixa.juros,
        multa: baixa.multa,
        desconto: baixa.desconto,
        abatimento: baixa.abatimento,
        impostosRetidos: baixa.impostosRetidos,
        motivo: baixa.motivo,
        historico: baixa.historico,
        banco: baixa.banco,
        agencia: baixa.agencia,
        conta: baixa.conta,
        ativo: baixa.ativo,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoTituloReceberQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? { numero: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.tituloReceber.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { chave: 'asc' },
        }),
        tx.tituloReceber.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((r) => this.paraLeitura(r)),
        total,
        query,
      );
    });
  }

  async findOne(
    empresaId: string,
    chave: string,
  ): Promise<IntegracaoTituloReceber> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.tituloReceber.findFirst({
        where: { empresaId, chave, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Título a receber não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoTituloReceberCreate,
  ): Promise<IntegracaoTituloReceber> {
    const { registro } = await this.upsert(empresaId, apiKeyId, input);
    return registro;
  }

  /**
   * O mesmo upsert do `create`, devolvendo também **o que aconteceu**.
   *
   * Só o lote precisa dessa informação — é o que separa `criados` de
   * `atualizados` no relatório. O `create` continua devolvendo apenas o
   * registro, porque o REST individual responde a entidade e a decisão não
   * cabe no corpo dela.
   */
  async upsert(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoTituloReceberCreate,
  ): Promise<{ registro: IntegracaoTituloReceber; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.tituloReceber.findFirst({
        where: { empresaId, chave: input.chave },
      });
      const decisao = decidirUpsert(existente);

      const clienteId = await this.resolverCliente(
        tx,
        empresaId,
        input.clienteChave,
      );
      const vendedorId = await this.resolverVendedor(
        tx,
        empresaId,
        input.vendedorChave,
      );
      const contaBancariaId = await this.resolverContaBancaria(
        tx,
        empresaId,
        input.contaBancariaDescricao,
        input,
      );

      const dados = {
        chave: input.chave,
        codigoErp: input.codigoErp ?? null,
        clienteId,
        vendedorId,
        numero: input.numero,
        parcela: input.parcela ?? null,
        prefixo: input.prefixo ?? null,
        tipo: input.tipo ?? null,
        emissao: input.emissao ?? null,
        vencimento: input.vencimento ?? null,
        vencimentoReal: input.vencimentoReal ?? null,
        valor: input.valor,
        saldo: input.saldo,
        acrescimo: input.acrescimo ?? null,
        decrescimo: input.decrescimo ?? null,
        dtBaixa: input.dtBaixa ?? null,
        formaPgto: input.formaPgto ?? null,
        historico: input.historico ?? null,
        ativo: input.ativo,
        contaBancariaId,
        nossoNumero: this.soDigitos(input.nossoNumero),
        carteira: this.soDigitos(input.carteira),
        codigoBarras: this.validarCodigoBarras(input.codigoBarras),
        linhaDigitavel: this.soDigitos(input.linhaDigitavel),
        ...this.dadosDoBoleto(input),
        updatedBy: autor,
      };

      const baixasData = this.montarBaixas(empresaId, input.baixas);

      if (decisao !== 'criar') {
        // Baixa que veio é casada pela chave em vez de recriada; baixa ausente
        // do payload não é excluída (ver `sincronizarFilhos`). Estorno no ERP
        // precisa chegar como `delete: true`.
        const atualizadoUpsert = await tx.tituloReceber.update({
          where: { id: existente!.id },
          data: {
            ...dados,
            ...camposDaDecisao(decisao),
            baixas: sincronizarFilhos(
              { campo: 'tituloReceberId', id: existente!.id },
              baixasData,
            ),
          },
          include: INCLUDE,
        });
        return { registro: this.paraLeitura(atualizadoUpsert), decisao };
      }

      const criado = await tx.tituloReceber.create({
        data: {
          ...dados,
          empresaId,
          createdBy: autor,
          baixas: { create: criarFilhos(baixasData) },
        },
        include: INCLUDE,
      });
      return { registro: this.paraLeitura(criado), decisao };
    });
  }

  /**
   * Aplica um lote. Ver `processarLote` para a ordem e o tratamento de erro;
   * aqui fica só o que é da entidade.
   *
   * A reativação conta como `atualizado`: a linha já existia e mantém o mesmo
   * uuid — quem lê o relatório está conferindo quantos registros novos
   * entraram, e um código que volta do soft delete não é um deles.
   */
  upsertLote(
    empresaId: string,
    apiKeyId: string,
    registros: IntegracaoTituloReceberLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.chave);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoTituloReceberCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    chave: string,
    input: IntegracaoTituloReceberUpdate,
  ): Promise<IntegracaoTituloReceber> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.tituloReceber.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente)
        throw new NotFoundException('Título a receber não encontrado');

      const clienteId =
        input.clienteChave !== undefined
          ? await this.resolverCliente(tx, empresaId, input.clienteChave)
          : undefined;
      const vendedorId =
        input.vendedorChave !== undefined
          ? await this.resolverVendedor(tx, empresaId, input.vendedorChave)
          : undefined;
      const contaBancariaId =
        input.contaBancariaDescricao !== undefined
          ? await this.resolverContaBancaria(
              tx,
              empresaId,
              input.contaBancariaDescricao,
              input,
            )
          : undefined;

      const camposDiretos = [
        'numero',
        'parcela',
        'prefixo',
        'tipo',
        'emissao',
        'vencimento',
        'vencimentoReal',
        'valor',
        'saldo',
        'acrescimo',
        'decrescimo',
        'dtBaixa',
        'formaPgto',
        'historico',
        'ativo',
      ] as const;
      const data: Record<string, unknown> = { updatedBy: autor };
      for (const campo of camposDiretos) {
        if (input[campo] !== undefined) data[campo] = input[campo];
      }
      if (clienteId !== undefined) data.clienteId = clienteId;
      if (vendedorId !== undefined) data.vendedorId = vendedorId;
      if (contaBancariaId !== undefined) data.contaBancariaId = contaBancariaId;

      // Os campos de cobrança são normalizados antes de gravar (só dígitos, e
      // o código de barras conferido no tamanho): é o que a geração do boleto
      // vai consumir sem revalidar, e máscara vinda do ERP viraria boleto
      // ilegível.
      if (input.nossoNumero !== undefined)
        data.nossoNumero = this.soDigitos(input.nossoNumero);
      if (input.carteira !== undefined)
        data.carteira = this.soDigitos(input.carteira);
      if (input.codigoBarras !== undefined)
        data.codigoBarras = this.validarCodigoBarras(input.codigoBarras);
      if (input.linhaDigitavel !== undefined)
        data.linhaDigitavel = this.soDigitos(input.linhaDigitavel);

      // Desenho do boleto: só o que veio no PATCH é tocado. Diferente do
      // create, aqui `undefined` significa "não mexe" e `null` significa
      // "apaga" — mandar tudo apagaria o boleto de quem enviou só o saldo.
      for (const campo of CAMPOS_BOLETO) {
        if (input[campo] !== undefined) data[campo] = input[campo] ?? null;
      }

      // Lista omitida no PATCH não mexe nas baixas gravadas.
      if (input.baixas) {
        data.baixas = sincronizarFilhos(
          { campo: 'tituloReceberId', id: existente.id },
          this.montarBaixas(empresaId, input.baixas),
        );
      }

      const atualizado = await tx.tituloReceber.update({
        where: { id: existente.id },
        data: data as never,
        include: INCLUDE,
      });
      return this.paraLeitura(atualizado);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    chave: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.tituloReceber.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) return;
      await tx.tituloReceber.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }

  private async resolverCliente(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    return resolverCliente(tx, empresaId, codigo);
  }

  /**
   * Vendedor do título: vazio ou desconhecido grava `null`, sem 404.
   *
   * O E1_VEND1 vazio chega como `"  -"` (filial + hífen) e o de um vendedor
   * que a plataforma não tem, como `"  -00312"`. Nos dois casos o título é
   * válido sem vendedor — e o 404 travava o envio: o ERP para o lote no
   * primeiro erro, e um título segurava as cem mil mensagens seguintes.
   */
  private async resolverVendedor(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    try {
      return await resolverVendedor(tx, empresaId, codigo);
    } catch (e) {
      if (e instanceof NotFoundException) return null;
      throw e;
    }
  }

  /**
   * Conta de cobrança pela descrição cadastrada — o ERP não conhece o uuid.
   *
   * Falhar com 404 quando a descrição não bate é proposital: aceitar em
   * silêncio deixaria o título apontando para a conta padrão, e a 2ª via sairia
   * com o convênio errado — um boleto que o banco não reconhece.
   */
  private async resolverContaBancaria(
    tx: TenantTx,
    empresaId: string,
    descricao: string | null | undefined,
    input?: Partial<IntegracaoTituloReceberCreate>,
  ) {
    if (!descricao) return null;

    // 1. Busca por descrição exata (ex: '237/2201/014575-0/06')
    let conta = await tx.contaBancaria.findFirst({
      where: { empresaId, descricao, deletedAt: null },
      select: { id: true },
    });

    if (conta) return conta.id;

    // 2. Fallback: se a descrição for composta por 'banco/agencia/conta/carteira', busca pelos campos individuais
    const partes = descricao.split('/').map((p) => p.trim());
    if (partes.length >= 3) {
      const banco = partes[0];
      const agencia = partes[1];
      const contaNum = partes[2];
      const carteira = partes.length >= 4 ? partes[3] : undefined;

      const agenciaLimpa = agencia.replace(/^0+/, '') || agencia;
      const contaLimpa = contaNum.replace(/^0+/, '') || contaNum;

      conta = await tx.contaBancaria.findFirst({
        where: {
          empresaId,
          deletedAt: null,
          banco,
          OR: [
            { agencia, conta: contaNum },
            { agencia: agenciaLimpa, conta: contaLimpa },
            { agencia, conta: contaLimpa },
            { agencia: agenciaLimpa, conta: contaNum },
          ],
          ...(carteira ? { carteira } : {}),
        },
        select: { id: true },
      });

      if (conta) return conta.id;
    }

    // 3. Se a conta não existir, realiza o cadastro automático (auto-provisioning/upsert)
    const novoBanco = input?.banco ?? (partes.length >= 1 ? partes[0] : '237');
    const novaAgencia = input?.agencia ?? (partes.length >= 2 ? partes[1] : '0000');
    const novaContaNum = input?.conta ?? (partes.length >= 3 ? partes[2] : '000000');
    const novaCarteira = input?.carteira ?? (partes.length >= 4 ? partes[3] : '09');

    const novaContaCriada = await tx.contaBancaria.create({
      data: {
        empresaId,
        descricao,
        banco: novoBanco,
        agencia: novaAgencia,
        agenciaDv: input?.agenciaDv ?? null,
        conta: novaContaNum,
        contaDv: input?.contaDv ?? null,
        carteira: novaCarteira,
        beneficiarioNome: input?.beneficiarioNome ?? null,
        beneficiarioDocumento: input?.beneficiarioDocumento ?? null,
        beneficiarioEndereco: input?.beneficiarioEndereco ?? null,
        localPagamento: input?.localPagamento ?? 'Pagável preferencialmente em qualquer agência bancária',
        aceite: input?.aceite ?? 'N',
        especieDocumento: input?.especieDocumento ?? 'DM',
        instrucoes: input?.instrucoes ?? null,
      },
      select: { id: true },
    });

    return novaContaCriada.id;
  }

  /**
   * Recolhe o desenho do boleto do payload, normalizando ausência em `null`.
   *
   * No create todo campo é gravado: o que o ERP não mandou fica nulo, e nulo
   * quer dizer "usa a conta de cobrança". No update é diferente — lá `undefined`
   * significa "não mexe" —, por isso aquele caminho não usa este helper.
   */
  private dadosDoBoleto(input: IntegracaoTituloReceberCreate) {
    // Escrito campo a campo, e não por laço sobre CAMPOS_BOLETO, porque o
    // retorno precisa ser um tipo concreto: um Record<string, unknown> espalhado
    // no `data` do Prisma quebra a checagem de tipo do create.
    return {
      nossoNumeroDac: input.nossoNumeroDac ?? null,
      banco: input.banco ?? null,
      bancoNome: input.bancoNome ?? null,
      bancoCodigoCompensacao: input.bancoCodigoCompensacao ?? null,
      agencia: input.agencia ?? null,
      agenciaDv: input.agenciaDv ?? null,
      conta: input.conta ?? null,
      contaDv: input.contaDv ?? null,
      beneficiarioNome: input.beneficiarioNome ?? null,
      beneficiarioDocumento: input.beneficiarioDocumento ?? null,
      beneficiarioEndereco: input.beneficiarioEndereco ?? null,
      localPagamento: input.localPagamento ?? null,
      aceite: input.aceite ?? null,
      especieDocumento: input.especieDocumento ?? null,
      jurosValorDia: input.jurosValorDia ?? null,
      multaValor: input.multaValor ?? null,
      descontoValor: input.descontoValor ?? null,
      instrucoes: input.instrucoes ?? null,
    };
  }

  /** Máscara do ERP não entra no banco: o boleto consome dígito puro. */
  /**
   * Baixas prontas para gravar. Sem resolução de vínculo: a baixa não aponta
   * para cadastro nenhum da plataforma — banco, agência e conta são o texto do
   * movimento no ERP, não a conta de cobrança do boleto.
   */
  private montarBaixas(empresaId: string, baixas: IntegracaoTituloReceberBaixa[]) {
    return baixas.map((baixa) => ({
      delete: baixa.delete,
      empresaId,
      chave: baixa.chave,
      data: baixa.data ?? null,
      valor: baixa.valor,
      juros: baixa.juros,
      multa: baixa.multa,
      desconto: baixa.desconto,
      abatimento: baixa.abatimento,
      impostosRetidos: baixa.impostosRetidos,
      motivo: baixa.motivo ?? null,
      historico: baixa.historico ?? null,
      banco: baixa.banco ?? null,
      agencia: baixa.agencia ?? null,
      conta: baixa.conta ?? null,
      ativo: baixa.ativo,
    }));
  }

  private soDigitos(valor: string | null | undefined) {
    if (valor == null) return null;
    const digitos = valor.replace(/\D/g, '');
    return digitos.length > 0 ? digitos : null;
  }

  /**
   * Código de barras registrado: 44 dígitos ou nada.
   *
   * Guardar um valor truncado seria pior do que não guardar — a plataforma
   * prefere o valor do ERP ao próprio cálculo, então um código inválido
   * silenciaria o cálculo correto e imprimiria lixo.
   */
  private validarCodigoBarras(valor: string | null | undefined) {
    const digitos = this.soDigitos(valor);
    if (!digitos) return null;
    if (digitos.length !== 44) {
      throw new ConflictException(
        `codigoBarras deve ter 44 dígitos (recebido: ${digitos.length})`,
      );
    }
    return digitos;
  }
}
