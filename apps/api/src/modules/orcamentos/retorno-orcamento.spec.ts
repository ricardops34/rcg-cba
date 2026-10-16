import { BadRequestException } from '@nestjs/common';
import { instanteLocal } from '../../common/horario/expediente';
import { ajustarRetornoOrcamento } from './retorno-orcamento';

/**
 * Retorno do orçamento: dia útil, expediente de quem retoma o contato, e nunca
 * depois da validade.
 */
describe('ajustarRetornoOrcamento', () => {
  // 2030-03-15 é uma sexta-feira.
  const SEX = '2030-03-15';
  const validade = new Date(`${SEX}T00:00:00.000Z`);

  const montar = (restringir = false) => ({
    feriado: { findMany: jest.fn().mockResolvedValue([]) },
    usuario: {
      findUnique: jest.fn().mockResolvedValue({
        restringirHorario: restringir,
        horarios: [1, 2, 3, 4, 5].map((diaSemana) => ({
          diaSemana,
          horaInicio: '08:00',
          horaFim: '18:00',
        })),
      }),
    },
  });
  const chamar = (
    tx: ReturnType<typeof montar>,
    retorno: Date,
    val: Date | null = validade,
  ) =>
    ajustarRetornoOrcamento(tx as never, 'e1', {
      retorno,
      validade: val,
      vendedorUsuarioId: 'u-vend',
      autorId: 'u1',
    });

  it('aceita retorno até o fim do dia da validade', async () => {
    const retorno = instanteLocal(SEX, '17:30');
    const r = await chamar(montar(true), retorno);
    expect(r.toISOString()).toBe(retorno.toISOString());
  });

  it('recusa retorno depois da validade', async () => {
    await expect(
      chamar(montar(), instanteLocal('2030-03-18', '09:00')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa quando o ajuste ao expediente empurra o retorno para depois da validade', async () => {
    // Sexta 19:00, expediente até 18:00: o próximo momento válido é segunda.
    await expect(
      chamar(montar(true), instanteLocal(SEX, '19:00')),
    ).rejects.toThrow(/expediente/);
  });

  it('sem validade, só ajusta', async () => {
    const r = await chamar(montar(true), instanteLocal(SEX, '19:00'), null);
    expect(r.toISOString()).toBe(
      instanteLocal('2030-03-18', '08:00').toISOString(),
    );
  });

  it('sem restrição de horário, mantém a hora (só dia útil)', async () => {
    const retorno = instanteLocal(SEX, '22:00');
    const r = await chamar(montar(false), retorno);
    expect(r.toISOString()).toBe(retorno.toISOString());
  });
});
