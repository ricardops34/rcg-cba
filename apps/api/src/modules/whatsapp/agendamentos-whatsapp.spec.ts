import { NotFoundException } from '@nestjs/common';
import { WhatsappAgendamentoService } from './whatsapp-agendamento.service';

/**
 * Agendamentos de WhatsApp na Agenda (docs/planos/2026-10-16-agendamentos-whatsapp.md):
 * alterar, cancelar e o aviso na hora de um atendimento agendado.
 */
describe('WhatsappAgendamentoService — agenda', () => {
  const user = { id: 'u1', empresaAtivaId: 'e1' } as never;

  interface Args {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }
  /** Argumento da primeira chamada de um mock do Prisma. */
  const chamada = (fn: jest.Mock): Args => (fn.mock.calls as [Args][])[0][0];

  const montar = (tx: Record<string, unknown>) => {
    const prisma = {
      withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx),
    };
    const conversas = {
      conversaParaEnvio: jest.fn().mockResolvedValue({
        id: 'c1',
        clienteId: 'cli1',
        sessao: { vendedorId: 'v1' },
      }),
    };
    const servico = new WhatsappAgendamentoService(
      prisma as never,
      {} as never,
      {} as never,
      conversas as never,
    );
    return { servico, conversas };
  };

  describe('agendar', () => {
    it('cria a atividade na agenda do vendedor dono do aparelho, ligada à conversa', async () => {
      const tx = {
        feriado: { findMany: jest.fn().mockResolvedValue([]) },
        // Sem cadastro de expediente: só valem os dias úteis.
        usuario: { findUnique: jest.fn().mockResolvedValue(null) },
        atividade: { create: jest.fn().mockResolvedValue({ id: 'a1' }) },
        whatsappMensagemAgendada: {
          create: jest.fn().mockResolvedValue({ id: 'm1' }),
        },
      };
      const { servico } = montar(tx);
      // Terça-feira 10h: dia útil, o calendário não mexe.
      const quando = new Date('2030-03-12T13:00:00.000Z');

      await servico.agendar('e1', user, 'c1', {
        texto: 'Bom dia! Segue a proposta.',
        enviarEm: quando,
      });

      const dadosAtividade = chamada(tx.atividade.create).data;
      expect(dadosAtividade).toMatchObject({
        vendedorId: 'v1',
        clienteId: 'cli1',
        conversaId: 'c1',
        // Não é tarefa do vendedor: o sistema envia sozinho.
        automatica: true,
      });
      expect(dadosAtividade.titulo).toEqual(
        expect.stringContaining('Mensagem agendada'),
      );
      expect(chamada(tx.whatsappMensagemAgendada.create).data).toMatchObject({
        atividadeId: 'a1',
        texto: 'Bom dia! Segue a proposta.',
      });
    });

    it('agenda mesmo sem vendedor no aparelho, só que fora da agenda', async () => {
      const tx = {
        feriado: { findMany: jest.fn().mockResolvedValue([]) },
        // Sem cadastro de expediente: só valem os dias úteis.
        usuario: { findUnique: jest.fn().mockResolvedValue(null) },
        atividade: { create: jest.fn() },
        whatsappMensagemAgendada: {
          create: jest.fn().mockResolvedValue({ id: 'm1' }),
        },
      };
      const { servico, conversas } = montar(tx);
      conversas.conversaParaEnvio.mockResolvedValue({
        id: 'c1',
        clienteId: null,
        sessao: { vendedorId: null },
      });

      await servico.agendar('e1', user, 'c1', {
        texto: 'Oi',
        enviarEm: new Date('2030-03-12T13:00:00.000Z'),
      });

      expect(tx.atividade.create).not.toHaveBeenCalled();
      expect(tx.whatsappMensagemAgendada.create).toHaveBeenCalled();
    });
  });

  describe('atualizar', () => {
    it('recusa quando a mensagem já saiu ou está em envio', async () => {
      const tx = {
        feriado: { findMany: jest.fn().mockResolvedValue([]) },
        // Sem cadastro de expediente: só valem os dias úteis.
        usuario: { findUnique: jest.fn().mockResolvedValue(null) },
        whatsappMensagemAgendada: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      const { servico } = montar(tx);

      await expect(
        servico.atualizar('e1', user, 'c1', 'm1', { texto: 'Novo' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // A trava é o status no filtro da atualização.
      expect(
        chamada(tx.whatsappMensagemAgendada.updateMany).where,
      ).toMatchObject({ status: 'pendente' });
    });

    it('a atividade da agenda acompanha o novo texto e horário', async () => {
      const novoHorario = new Date('2030-03-13T14:00:00.000Z');
      const tx = {
        feriado: { findMany: jest.fn().mockResolvedValue([]) },
        // Sem cadastro de expediente: só valem os dias úteis.
        usuario: { findUnique: jest.fn().mockResolvedValue(null) },
        whatsappMensagemAgendada: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: 'm1',
            texto: 'Texto novo',
            enviarEm: novoHorario,
            atividadeId: 'a1',
          }),
        },
        atividade: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      const { servico } = montar(tx);

      await servico.atualizar('e1', user, 'c1', 'm1', {
        texto: 'Texto novo',
        enviarEm: novoHorario,
      });

      expect(chamada(tx.atividade.updateMany)).toMatchObject({
        where: { id: 'a1' },
        data: { descricao: 'Texto novo', dataVencimento: novoHorario },
      });
    });
  });

  describe('cancelar', () => {
    it('tira a atividade da agenda', async () => {
      const tx = {
        whatsappMensagemAgendada: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findFirst: jest.fn().mockResolvedValue({ atividadeId: 'a1' }),
        },
        atividade: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      const { servico } = montar(tx);

      await servico.cancelar('e1', user, 'c1', 'm1');

      const arg = chamada(tx.atividade.updateMany);
      expect(arg.where).toMatchObject({ id: 'a1' });
      expect(arg.data).toMatchObject({ ativo: false });
      expect(arg.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('avisar atendimentos agendados', () => {
    const avisar = (servico: WhatsappAgendamentoService): Promise<void> =>
      (
        servico as unknown as {
          avisarAtendimentosAgendados: (e: string) => Promise<void>;
        }
      ).avisarAtendimentosAgendados('e1');

    const atividade = (id: string) => ({
      id,
      titulo: 'Retorno sobre a proposta',
      conversaId: 'c1',
      dataVencimento: new Date('2030-03-12T11:00:00.000Z'),
      createdBy: 'u-agendou',
      vendedor: { usuarioId: 'u-vend' },
      vendedorAtendimento: null,
      cliente: { razaoSocial: 'Açougue X' },
    });

    it('avisa o vendedor com o link da conversa, uma vez por atividade', async () => {
      const executeRaw = jest.fn().mockResolvedValue(1);
      const tx = {
        atividade: {
          findMany: jest
            .fn()
            .mockResolvedValue([atividade('a1'), atividade('a2')]),
        },
        // a2 já foi avisada antes (mesmo lida, não se recria).
        notificacao: {
          findMany: jest.fn().mockResolvedValue([{ referenciaId: 'a2' }]),
        },
        // Quem agendou está no sistema.
        sessao: {
          findMany: jest.fn().mockResolvedValue([{ usuarioId: 'u-agendou' }]),
        },
        $executeRaw: executeRaw,
      };
      const { servico } = montar(tx);

      await avisar(servico);

      // Um INSERT só: o da a1.
      expect(executeRaw).toHaveBeenCalledTimes(1);
      const valores = (executeRaw.mock.calls as unknown[][])[0].slice(1);
      expect(valores).toContain('u-agendou');
      expect(valores).toContain('atendimento_agendado');
      expect(valores).toContain('Hora de atender Açougue X');
      expect(valores).toContain('/comercial/atendimento?conversa=c1');
      expect(valores).toContain('a1');
    });

    it('quem agendou fora do sistema: marca como não realizado, com o motivo', async () => {
      const executeRaw = jest.fn().mockResolvedValue(1);
      const tx = {
        atividade: {
          findMany: jest.fn().mockResolvedValue([atividade('a1')]),
          update: jest.fn().mockResolvedValue({}),
        },
        notificacao: { findMany: jest.fn().mockResolvedValue([]) },
        sessao: { findMany: jest.fn().mockResolvedValue([]) },
        $executeRaw: executeRaw,
      };
      const { servico } = montar(tx);

      await avisar(servico);

      expect(chamada(tx.atividade.update)).toMatchObject({
        where: { id: 'a1' },
        data: {
          naoRealizada: true,
          motivoNaoRealizacao: expect.stringContaining('não estava no sistema'),
        },
      });
      const valores = (executeRaw.mock.calls as unknown[][])[0].slice(1);
      expect(valores).toContain('atendimento_nao_realizado');
      expect(valores).not.toContain('atendimento_agendado');
    });

    it('só considera atendimento marcado para iniciar conversa, ainda aberto', async () => {
      const tx = {
        atividade: { findMany: jest.fn().mockResolvedValue([]) },
        notificacao: { findMany: jest.fn() },
        $executeRaw: jest.fn(),
      };
      const { servico } = montar(tx);

      await avisar(servico);

      expect(chamada(tx.atividade.findMany).where).toMatchObject({
        iniciarConversa: true,
        concluida: false,
        ativo: true,
        deletedAt: null,
      });
      expect(tx.notificacao.findMany).not.toHaveBeenCalled();
    });
  });

  describe('atendimento agendado — alterar e cancelar', () => {
    it('mudar a hora zera o aviso já gravado, para avisar de novo na nova hora', async () => {
      const tx = {
        feriado: { findMany: jest.fn().mockResolvedValue([]) },
        // Sem cadastro de expediente: só valem os dias úteis.
        usuario: { findUnique: jest.fn().mockResolvedValue(null) },
        atividade: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        notificacao: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      const { servico } = montar(tx);

      await servico.atualizarAtendimento('e1', user, 'c1', 'a1', {
        dataVencimento: new Date('2030-03-13T14:00:00.000Z'),
      });

      expect(chamada(tx.atividade.updateMany).where).toMatchObject({
        id: 'a1',
        conversaId: 'c1',
        iniciarConversa: true,
        concluida: false,
      });
      expect(chamada(tx.notificacao.deleteMany).where).toMatchObject({
        tipo: { in: ['atendimento_agendado', 'atendimento_nao_realizado'] },
        referenciaId: 'a1',
      });
    });

    it('mudar só o título não mexe no aviso', async () => {
      const tx = {
        feriado: { findMany: jest.fn().mockResolvedValue([]) },
        // Sem cadastro de expediente: só valem os dias úteis.
        usuario: { findUnique: jest.fn().mockResolvedValue(null) },
        atividade: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        notificacao: { deleteMany: jest.fn() },
      };
      const { servico } = montar(tx);

      await servico.atualizarAtendimento('e1', user, 'c1', 'a1', {
        titulo: 'Novo título',
      });

      expect(tx.notificacao.deleteMany).not.toHaveBeenCalled();
    });

    it('recusa atendimento de outra conversa ou já concluído', async () => {
      const tx = {
        atividade: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      const { servico } = montar(tx);

      await expect(
        servico.cancelarAtendimento('e1', user, 'c1', 'a1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cancelar tira da agenda', async () => {
      const tx = {
        atividade: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      const { servico } = montar(tx);

      await servico.cancelarAtendimento('e1', user, 'c1', 'a1');

      expect(chamada(tx.atividade.updateMany).data).toMatchObject({
        ativo: false,
      });
    });
  });
});
