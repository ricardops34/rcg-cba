import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  EnviarBoletoSms,
  EnviarSmsCliente,
  EnvioSmsResultado,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { registrarAtividadeDocumento } from '../../common/atividades/registrar-atividade-documento';
import { buscarEmpresaDoEmail } from '../../common/mail/email-layout';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { primeiroCelular, SmsService, textoSms } from './sms.service';

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data civil, sem fuso. */
export const dataSms = (v: string | Date | null | undefined) => {
  if (!v) return '';
  const iso = v instanceof Date ? v.toISOString() : v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/**
 * SMS ao cliente disparado pela tela: boleto, cobrança e mensagem livre
 * (docs/planos/2026-10-01-sms-iagente.md).
 *
 * Mesmas regras do e-mail: destinatário só do cadastro, documento pelos
 * serviços da tela (com a carteira de quem pede), e todo envio no histórico de
 * atendimento do cliente (usuário, 01/10/2026).
 */
@Injectable()
export class SmsClienteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly titulos: TitulosReceberService,
  ) {}

  /** Boleto: valor, vencimento e linha digitável — SMS não leva anexo. */
  async enviarBoleto(
    empresaId: string,
    user: AuthenticatedUser,
    tituloId: string,
    input: EnviarBoletoSms,
  ): Promise<EnvioSmsResultado> {
    const boleto = await this.titulos.gerarBoleto(
      empresaId,
      { tipo: 'usuario', user },
      tituloId,
      { registrarEvento: false, atualizado: input.atualizado },
    );
    const cliente = await this.cliente(empresaId, user, boleto.clienteId);
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);

    const atrasado = boleto.encargos.diasAtraso > 0;
    const mensagem = textoSms(
      `${empresa.nomeFantasia}: boleto do titulo ${boleto.numeroDocumento}, ` +
        (atrasado
          ? `valor atualizado ${moeda(boleto.valor)}. `
          : `venc ${dataSms(boleto.vencimento)}, ${moeda(boleto.valor)}. `) +
        `Linha digitavel: ${boleto.linhaDigitavel ?? boleto.linhaDigitavelFormatada}`,
    );

    await this.sms.enviar({
      empresaId,
      motivo: 'boleto',
      celular: cliente.celular,
      mensagem,
      clienteId: boleto.clienteId,
      vendedorId: boleto.vendedorId,
      tituloReceberId: tituloId,
      autor: user.id,
    });
    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'boleto_sms',
        clienteId: boleto.clienteId,
        vendedorId: boleto.vendedorId,
        numero: boleto.numeroDocumento,
        descricao: `Enviado para ${cliente.celular} · ${this.titulos.descreverBoleto(
          boleto.vencimento,
          boleto.encargos,
        )}`,
      }),
    );
    return { celular: cliente.celular, mensagem };
  }

  /** Cobrança: quantos títulos vencidos e o total, com o contato da empresa. */
  async enviarCobranca(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
  ): Promise<EnvioSmsResultado> {
    const cliente = await this.cliente(empresaId, user, clienteId);
    const resultado = (await this.titulos.findAll(empresaId, user, {
      page: 1,
      pageSize: 100,
      sortBy: 'vencimento',
      sortOrder: 'asc',
      status: 'vencido',
      ativo: true,
      clienteId,
    } as never)) as {
      data: Array<{ saldo: number; vencimento: string | Date | null }>;
    };
    const titulos = resultado.data ?? [];
    if (titulos.length === 0) {
      throw new ConflictException('Este cliente não tem títulos vencidos.');
    }
    const total = titulos.reduce((soma, t) => soma + Number(t.saldo ?? 0), 0);
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);

    const mensagem = textoSms(
      `${empresa.nomeFantasia}: consta(m) ${titulos.length} titulo(s) vencido(s), ` +
        `total ${moeda(total)}, o mais antigo de ${dataSms(titulos[0].vencimento)}. ` +
        (empresa.telefone
          ? `Fale conosco: ${empresa.telefone}.`
          : 'Fale conosco para regularizar.') +
        ' Se ja pagou, desconsidere.',
    );

    await this.sms.enviar({
      empresaId,
      motivo: 'cobranca',
      celular: cliente.celular,
      mensagem,
      clienteId,
      vendedorId: cliente.vendedorId,
      autor: user.id,
    });
    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'cobranca_sms',
        clienteId,
        vendedorId: null,
        numero: '',
        descricao: `Enviado para ${cliente.celular} · ${titulos.length} título(s) vencido(s) · ${moeda(total)}`,
      }),
    );
    return { celular: cliente.celular, mensagem };
  }

  /** Mensagem livre do vendedor, com o nome da empresa na frente. */
  async enviarMensagem(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    input: EnviarSmsCliente,
  ): Promise<EnvioSmsResultado> {
    const cliente = await this.cliente(empresaId, user, clienteId);
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const mensagem = textoSms(`${empresa.nomeFantasia}: ${input.mensagem}`);

    await this.sms.enviar({
      empresaId,
      motivo: 'mensagem_livre',
      celular: cliente.celular,
      mensagem,
      clienteId,
      vendedorId: cliente.vendedorId,
      autor: user.id,
    });
    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'sms_cliente',
        clienteId,
        vendedorId: null,
        numero: '',
        descricao: `Para ${cliente.celular}: ${input.mensagem}`,
      }),
    );
    return { celular: cliente.celular, mensagem };
  }

  /**
   * Cliente na carteira de quem pede, com o celular do cadastro.
   */
  private async cliente(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string | null,
  ) {
    if (!clienteId) throw new NotFoundException('Cliente não encontrado');
    const cliente = await this.prisma.withTenant(empresaId, async (tx) => {
      // Carteira: quem não vê o cliente não manda SMS para ele.
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      return tx.cliente.findFirst({
        where: {
          id: clienteId,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        select: {
          razaoSocial: true,
          celular: true,
          telefone: true,
          telefone2: true,
          vendedorId: true,
        },
      });
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    const celular = primeiroCelular(
      cliente.celular,
      cliente.telefone,
      cliente.telefone2,
    );
    if (!celular) {
      throw new ConflictException(
        `O cliente ${cliente.razaoSocial} não tem celular no cadastro — SMS só vai para celular.`,
      );
    }
    return { celular, vendedorId: cliente.vendedorId };
  }
}
