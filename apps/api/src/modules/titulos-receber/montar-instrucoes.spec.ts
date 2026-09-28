import { montarInstrucoes } from './titulos-receber.service';

describe('montarInstrucoes', () => {
  // O ERP manda nas instruções do título as mesmas linhas de encargo que a
  // plataforma monta (BJInstrBol, no BJPLA003), sem acento. Somadas, saíam
  // duplicadas no boleto (relato de 26/09/2026).
  const titulo = {
    instrucoes:
      'Importancia por Dia de Atraso de R$ 2,28\r\nApos Vencimento Cobrar Multa de R$ 22,78',
    multaValor: 22.78,
    jurosValorDia: 2.28,
  };
  const conta = { instrucoes: null, multaPerc: null, jurosMesPerc: null, diasProtesto: null };
  const encargos = { saldo: 1139 } as Parameters<typeof montarInstrucoes>[2];

  it('não repete as linhas de encargo que vieram do ERP', () => {
    expect(montarInstrucoes(titulo, conta, encargos, true)).toEqual([
      'Importancia por Dia de Atraso de R$ 2,28',
      'Após Vencimento Cobrar Multa de R$ 22,78',
      ' - - - 2º Via - - -',
      'Boleto atualizado para pagamento apenas nesta data.',
    ]);
  });

  it('mantém as demais instruções do título antes da marca de 2ª via', () => {
    const comDesconto = {
      ...titulo,
      instrucoes: `${titulo.instrucoes}\r\nConceder Desconto de R$ 10,00 ate o vencimento.`,
    };

    expect(montarInstrucoes(comDesconto, conta, encargos, false)).toEqual([
      'Importancia por Dia de Atraso de R$ 2,28',
      'Após Vencimento Cobrar Multa de R$ 22,78',
      'Conceder Desconto de R$ 10,00 ate o vencimento.',
      ' - - - 2º Via - - -',
    ]);
  });
});
