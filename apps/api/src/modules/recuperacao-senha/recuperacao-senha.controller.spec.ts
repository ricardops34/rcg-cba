import { RecuperacaoSenhaController } from './recuperacao-senha.controller';

describe('RecuperacaoSenhaController.esqueci', () => {
  it('responde sem esperar a busca da conta e o envio do e-mail', () => {
    // Um pedido que nunca termina: se a resposta o esperasse, o tempo dela
    // diria se o e-mail tem conta.
    const pedir = jest.fn(() => new Promise<{ ok: true }>(() => undefined));
    const controller = new RecuperacaoSenhaController({ pedir } as never);

    const resposta = controller.esqueci({ email: 'a@b.com' }, {
      ip: '1.2.3.4',
      headers: {},
    } as never);

    expect(resposta).toEqual({ ok: true });
    expect(pedir).toHaveBeenCalledWith(
      { email: 'a@b.com' },
      { ip: '1.2.3.4', userAgent: undefined },
    );
  });
});
