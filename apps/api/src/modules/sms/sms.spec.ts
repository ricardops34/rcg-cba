import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ParametrosService } from '../parametros/parametros.service';
import {
  normalizarCelular,
  primeiroCelular,
  segredoWebhook,
  SmsService,
  textoSms,
} from './sms.service';
import { dataDoWebhook, SmsWebhookService } from './sms-webhook.service';
import { situacaoDoStatus } from './sms-relatorio.service';
import { SmsAvisoVencimentoService } from './sms-aviso-vencimento.service';

// docs/planos/2026-10-01-sms-iagente.md
describe('celular e texto do SMS', () => {
  it('normaliza celular brasileiro para 55DDD9XXXXXXXX e recusa fixo', () => {
    expect(normalizarCelular('(67) 99146-8448')).toBe('5567991468448');
    expect(normalizarCelular('067991468448')).toBe('5567991468448');
    expect(normalizarCelular('+55 67 99146-8448')).toBe('5567991468448');
    expect(normalizarCelular('6733827328')).toBeNull(); // fixo
    expect(normalizarCelular('06733827328')).toBeNull(); // fixo com 0
    expect(normalizarCelular('')).toBeNull();
  });

  it('usa o primeiro campo do cadastro que for celular', () => {
    expect(primeiroCelular(null, '6733827328', '67991468448')).toBe(
      '5567991468448',
    );
  });

  it('tira acento (operadora troca o caractere)', () => {
    expect(textoSms('Lembrete:  título  vence em ação')).toBe(
      'Lembrete: titulo vence em acao',
    );
  });
});

describe('SmsService.enviar', () => {
  const ambiente = { ...process.env };
  afterEach(() => {
    process.env = { ...ambiente };
    jest.restoreAllMocks();
  });

  function montar(token: string | null) {
    const tx = {
      smsEnvio: {
        create: jest.fn().mockResolvedValue({ id: 'envio-1' }),
        update: jest.fn(),
      },
    };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const parametros = { obterTexto: jest.fn().mockResolvedValue(token) };
    const service = new SmsService(
      prisma as unknown as PrismaService,
      parametros as unknown as ParametrosService,
    );
    return { service, tx };
  }

  const envio = {
    empresaId: 'empresa-1',
    motivo: 'boleto' as const,
    celular: '5567991468448',
    mensagem: 'RCG: boleto do título 1',
    clienteId: 'cliente-1',
    autor: 'usuario-1',
  };

  it('manda com client_ref = id do registro (é por ele que a resposta volta)', async () => {
    const { service, tx } = montar('sk_live_x');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: 'prov-9', status: 'queued' } }),
        {
          status: 201,
        },
      ),
    );
    const r = await service.enviar(envio);

    expect(r).toEqual({ id: 'envio-1', provedorId: 'prov-9' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.iagentesms.com.br/api/v2/messages');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'envio-1',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      to: '5567991468448',
      message: 'RCG: boleto do titulo 1',
      client_ref: 'envio-1',
    });
    expect(tx.smsEnvio.update.mock.calls[0][0].data).toMatchObject({
      provedorId: 'prov-9',
      status: 'queued',
      erro: null,
    });
  });

  it('recusa da iAgente: registra o erro e devolve 502 com o motivo', async () => {
    const { service, tx } = montar('sk_live_x');
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'insufficient_credits',
              message: 'Saldo insuficiente.',
            },
          }),
          { status: 402 },
        ),
      );
    await expect(service.enviar(envio)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(tx.smsEnvio.update.mock.calls[0][0].data).toMatchObject({
      status: 'erro',
      erro: 'Saldo insuficiente. (insufficient_credits)',
    });
  });

  it('sem token: 409, sem registro nem chamada', async () => {
    const { service, tx } = montar(null);
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(service.enviar(envio)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tx.smsEnvio.create).not.toHaveBeenCalled();
  });
});

describe('webhook da iAgente', () => {
  const ambiente = { ...process.env };
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'segredo-de-teste';
  });
  afterEach(() => {
    process.env = { ...ambiente };
  });

  const empresaId = '7f8226bb-7076-4c08-92f3-0693333d618e';
  const envioId = '0d1e2f3a-4b5c-4d6e-7f80-91a2b3c4d5e6';

  function montar(opcoes: { repetida?: boolean } = {}) {
    const tx = {
      smsEnvio: {
        findFirst: jest.fn().mockResolvedValue({
          id: envioId,
          clienteId: 'cliente-1',
          vendedorId: 'vendedor-1',
          mensagem: 'RCG: o titulo 1 venceu',
        }),
        updateMany: jest.fn(),
      },
      smsResposta: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opcoes.repetida ? { id: 'r' } : null),
        create: jest.fn(),
      },
      cliente: { findFirst: jest.fn() },
      atividade: { create: jest.fn() },
    };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    return {
      service: new SmsWebhookService(prisma as unknown as PrismaService),
      tx,
    };
  }

  it('resposta do cliente é vinculada ao envio pelo codigosms e entra no histórico', async () => {
    const { service, tx } = montar();
    await service.processar(empresaId, segredoWebhook(empresaId), {
      codigosms: envioId,
      celular: '5567991468448',
      status: 'Resposta',
      mensagem: 'Ja paguei ontem',
      data: '01/10/2026 10:15:00',
    });

    expect(tx.smsResposta.create.mock.calls[0][0].data).toMatchObject({
      empresaId,
      smsEnvioId: envioId,
      clienteId: 'cliente-1',
      celular: '5567991468448',
      mensagem: 'Ja paguei ontem',
      recebidaEm: new Date('2026-10-01T13:15:00.000Z'),
    });
    expect(tx.atividade.create.mock.calls[0][0].data).toMatchObject({
      clienteId: 'cliente-1',
      titulo: 'Resposta do cliente por SMS',
      createdBy: null,
    });
  });

  it('a mesma resposta repetida pela iAgente não vira duas', async () => {
    const { service, tx } = montar({ repetida: true });
    await service.processar(empresaId, segredoWebhook(empresaId), {
      codigosms: envioId,
      celular: '5567991468448',
      status: 'Resposta',
      mensagem: 'Ja paguei ontem',
      data: '01/10/2026 10:15:00',
    });
    expect(tx.smsResposta.create).not.toHaveBeenCalled();
  });

  it('status de entrega atualiza o envio', async () => {
    const { service, tx } = montar();
    await service.processar(empresaId, segredoWebhook(empresaId), {
      codigosms: envioId,
      status: 'Entregue',
      data: '01/10/2026 10:00:00',
    });
    expect(tx.smsEnvio.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: envioId, empresaId },
      data: { status: 'Entregue' },
    });
  });

  it('segredo errado é 404 e não grava nada', async () => {
    const { service, tx } = montar();
    await expect(
      service.processar(empresaId, 'segredo-errado', {
        status: 'Resposta',
        mensagem: 'x',
        celular: '5567991468448',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.smsResposta.create).not.toHaveBeenCalled();
  });

  it('lê a data do webhook como horário de Brasília', () => {
    expect(dataDoWebhook('26/03/2026 14:32:10')?.toISOString()).toBe(
      '2026-03-26T17:32:10.000Z',
    );
    expect(dataDoWebhook('lixo')).toBeNull();
  });
});

describe('situação e janela do aviso', () => {
  it('agrupa o status da iAgente em entregue, falha e aguardando', () => {
    expect(situacaoDoStatus('Entregue')).toBe('entregue');
    expect(situacaoDoStatus('Visualizada')).toBe('entregue');
    expect(situacaoDoStatus('Falha operadora')).toBe('falha');
    expect(situacaoDoStatus('Não entregável')).toBe('falha');
    expect(situacaoDoStatus('erro')).toBe('falha');
    expect(situacaoDoStatus('queued')).toBe('aguardando');
  });

  it('aviso automático só sai de segunda a sábado, das 8h às 18h de Campo Grande', () => {
    // Quarta, 01/10/2026; Campo Grande é UTC-4.
    expect(
      SmsAvisoVencimentoService.podeEnviarAgora(
        new Date('2026-10-01T13:00:00Z'),
      ),
    ).toBe(true); // 09h
    expect(
      SmsAvisoVencimentoService.podeEnviarAgora(
        new Date('2026-10-01T11:30:00Z'),
      ),
    ).toBe(false); // 07h30
    expect(
      SmsAvisoVencimentoService.podeEnviarAgora(
        new Date('2026-10-01T22:30:00Z'),
      ),
    ).toBe(false); // 18h30
    // Domingo, 04/10/2026, 10h.
    expect(
      SmsAvisoVencimentoService.podeEnviarAgora(
        new Date('2026-10-04T14:00:00Z'),
      ),
    ).toBe(false);
  });
});
