import { registrarAtendimentoWhatsapp } from './registrar-atendimento-whatsapp';
import type { TenantTx } from '../prisma/prisma.service';

/**
 * O que este helper precisa acertar é o "uma vez por dia": errar para o lado
 * de criar demais enche o histórico do cliente de linhas iguais — o defeito
 * que a decisão de granularidade existia para evitar.
 */
describe('registrarAtendimentoWhatsapp', () => {
  /** Só o que o helper de fato lê de cada chamada — o resto do Prisma não entra. */
  interface CriarArgs {
    data: { descricao: string | null; [campo: string]: unknown };
  }
  interface AtualizarArgs {
    where: { id: string };
    data: { descricao: string | null; updatedBy: string | null };
  }
  interface BuscarArgs {
    where: {
      dataConclusao: { gte: Date; lt: Date };
      [campo: string]: unknown;
    };
  }

  const criar = jest.fn<Promise<unknown>, [CriarArgs]>();
  const atualizar = jest.fn<Promise<unknown>, [AtualizarArgs]>();
  const buscar = jest.fn<Promise<{ id: string } | null>, [BuscarArgs]>();
  const contar = jest.fn<Promise<number>, []>();

  const tx = () =>
    ({
      atividade: {
        findFirst: buscar,
        create: criar,
        update: atualizar,
      },
      whatsappMensagem: { count: contar },
    }) as unknown as TenantTx;

  const base = {
    empresaId: 'e-1',
    autor: 'u-1',
    clienteId: 'c-1',
    vendedorId: 'v-1',
    quando: new Date('2026-09-02T14:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    contar.mockResolvedValue(2);
  });

  it('cria a atividade do dia no primeiro contato', async () => {
    buscar.mockResolvedValue(null);

    expect(await registrarAtendimentoWhatsapp(tx(), base)).toBe(true);

    expect(criar).toHaveBeenCalledTimes(1);
    expect(atualizar).not.toHaveBeenCalled();
    const dados = criar.mock.calls[0][0].data;
    expect(dados).toMatchObject({
      empresaId: 'e-1',
      clienteId: 'c-1',
      vendedorId: 'v-1',
      titulo: 'Atendimento por WhatsApp',
      concluida: true,
      dataVencimento: null,
    });
    expect(dados.descricao).toBe('2 enviadas · 2 recebidas');
  });

  it('atualiza a contagem quando já houve contato hoje', async () => {
    buscar.mockResolvedValue({ id: 'a-1' });
    contar.mockResolvedValueOnce(5).mockResolvedValueOnce(1);

    expect(await registrarAtendimentoWhatsapp(tx(), base)).toBe(true);

    expect(criar).not.toHaveBeenCalled();
    expect(atualizar).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      data: { descricao: '5 enviadas · 1 recebida', updatedBy: 'u-1' },
    });
  });

  it('procura o registro do dia pelo cliente, vendedor e título', async () => {
    buscar.mockResolvedValue(null);

    await registrarAtendimentoWhatsapp(tx(), base);

    const where = buscar.mock.calls[0][0].where;
    expect(where).toMatchObject({
      empresaId: 'e-1',
      clienteId: 'c-1',
      vendedorId: 'v-1',
      titulo: 'Atendimento por WhatsApp',
      deletedAt: null,
    });
    // A janela é o dia inteiro de `quando`, não as últimas 24 horas: duas
    // mensagens às 23h e à 1h são dois atendimentos, em dois dias.
    expect(where.dataConclusao.gte.getHours()).toBe(0);
    expect(
      where.dataConclusao.lt.getTime() - where.dataConclusao.gte.getTime(),
    ).toBe(86_400_000);
  });

  it('não registra conversa de contato sem cliente vinculado', async () => {
    expect(
      await registrarAtendimentoWhatsapp(tx(), { ...base, clienteId: null }),
    ).toBe(false);
    expect(buscar).not.toHaveBeenCalled();
    expect(criar).not.toHaveBeenCalled();
  });
});
