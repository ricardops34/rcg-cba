import { fichaDaEmpresa, type DadosDaEmpresa } from './ficha-da-empresa';

const VAZIA: DadosDaEmpresa = {
  nomeFantasia: 'Acme',
  razaoSocial: '',
  cnpj: null,
  endereco: null,
  complemento: null,
  bairro: null,
  municipio: null,
  uf: null,
  cep: null,
  telefone: null,
  telefone2: null,
  email: null,
  email2: null,
  site: null,
  fundadaEm: null,
  historia: null,
  segmentos: null,
  horarios: [],
};

/**
 * A ficha vai no prompt de **toda** conversa. Erro aqui não quebra nada — ele
 * faz a IA dizer o endereço errado, ou dizer que a empresa não tem telefone.
 */
describe('Ficha da empresa para a IA', () => {
  it('não inventa "não informado" para campo vazio', () => {
    // Uma ficha com "Telefone: não informado" ensina a IA a afirmar que a
    // empresa não tem telefone — pior do que ela não falar do assunto.
    expect(fichaDaEmpresa(VAZIA)).toBeNull();
  });

  it('monta o endereço numa linha, pulando o que falta', () => {
    const ficha = fichaDaEmpresa({
      ...VAZIA,
      endereco: 'Av. Afonso Pena, 1234',
      bairro: 'Centro',
      municipio: 'Campo Grande',
      uf: 'MS',
      cep: '79002-000',
    });
    expect(ficha).toContain(
      '- Endereço: Av. Afonso Pena, 1234 — Centro — Campo Grande/MS — 79002-000',
    );
  });

  it('junta os dois telefones e os dois e-mails', () => {
    const ficha = fichaDaEmpresa({
      ...VAZIA,
      telefone: '6733214000',
      telefone2: '6799990000',
      email: 'contato@acme.com',
    });
    expect(ficha).toContain('- Telefone: 6733214000 / 6799990000');
    // Só um e-mail preenchido não vira "contato@acme.com / ".
    expect(ficha).toContain('- E-mail: contato@acme.com');
  });

  describe('horário de atendimento', () => {
    const faixa = (diaSemana: number, horaInicio: string, horaFim: string) => ({
      diaSemana,
      horaInicio,
      horaFim,
    });

    it('junta dias seguidos com o mesmo horário', () => {
      // Cinco linhas iguais custam em cada mensagem sem dizer nada a mais.
      const ficha = fichaDaEmpresa({
        ...VAZIA,
        horarios: [1, 2, 3, 4, 5].map((d) => faixa(d, '08:00', '18:00')),
      });
      expect(ficha).toContain(
        '- Horário de atendimento: segunda a sexta: 08:00–18:00',
      );
    });

    it('mantém separado o dia com horário diferente', () => {
      const ficha = fichaDaEmpresa({
        ...VAZIA,
        horarios: [
          ...[1, 2, 3, 4, 5].map((d) => faixa(d, '08:00', '18:00')),
          faixa(6, '08:00', '12:00'),
        ],
      });
      expect(ficha).toContain('segunda a sexta: 08:00–18:00');
      expect(ficha).toContain('sábado: 08:00–12:00');
    });

    it('mostra as duas faixas de um dia com intervalo de almoço', () => {
      const ficha = fichaDaEmpresa({
        ...VAZIA,
        horarios: [faixa(1, '08:00', '12:00'), faixa(1, '13:30', '18:00')],
      });
      expect(ficha).toContain('segunda: 08:00–12:00 e 13:30–18:00');
    });

    it('não junta dias que não são seguidos', () => {
      const ficha = fichaDaEmpresa({
        ...VAZIA,
        horarios: [faixa(1, '08:00', '18:00'), faixa(3, '08:00', '18:00')],
      });
      // "segunda a quarta" incluiria terça, em que a empresa não atende.
      expect(ficha).not.toContain('segunda a quarta');
      expect(ficha).toContain('segunda: 08:00–18:00');
      expect(ficha).toContain('quarta: 08:00–18:00');
    });
  });

  it('a fundação vira o ano, que é como se fala', () => {
    const ficha = fichaDaEmpresa({
      ...VAZIA,
      fundadaEm: new Date('1998-03-15T00:00:00'),
    });
    expect(ficha).toContain('- No mercado desde: 1998');
  });
});
