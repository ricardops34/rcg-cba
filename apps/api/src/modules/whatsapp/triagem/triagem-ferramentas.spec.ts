import {
  FERRAMENTAS_DO_CLIENTE,
  FERRAMENTAS_GERAIS,
  ferramentasDaTriagem,
} from './triagem-ferramentas';

/**
 * O catalogo da triagem e superficie de ataque: quem conversa com esta IA e um
 * desconhecido, e o texto dele chega ao modelo. Estes testes fixam as duas
 * regras que impedem a ferramenta de virar alavanca.
 */
describe('ferramentas da triagem', () => {
  it('sem cliente associado, as do cliente nem sao oferecidas', () => {
    const nomes = ferramentasDaTriagem(false).map((f) => f.nome);
    for (const f of FERRAMENTAS_DO_CLIENTE) {
      expect(nomes).not.toContain(f.nome);
    }
  });

  it('com cliente, as duas familias aparecem', () => {
    const nomes = ferramentasDaTriagem(true).map((f) => f.nome);
    expect(nomes).toEqual(
      expect.arrayContaining([
        ...FERRAMENTAS_DO_CLIENTE.map((f) => f.nome),
        ...FERRAMENTAS_GERAIS.map((f) => f.nome),
      ]),
    );
  });

  it('NENHUMA ferramenta aceita clienteId como argumento', () => {
    // O cliente vem do vinculo do numero, resolvido pelo servidor. Se a IA
    // pudesse informar de quem quer os dados, bastaria ela se enganar (ou ser
    // convencida) para vazar o financeiro de outro cliente.
    for (const f of ferramentasDaTriagem(true)) {
      const props = Object.keys(
        (f.parametros as { properties?: Record<string, unknown> }).properties ?? {},
      );
      expect(props).not.toContain('clienteId');
      expect(props).not.toContain('empresaId');
    }
  });

  it('avisar_equipe NAO aceita telefone nem numero de destino', () => {
    // O destino e um papel; o telefone sai do cadastro. Aceitar numero faria o
    // WhatsApp da empresa virar disparador para quem soubesse pedir.
    const avisar = FERRAMENTAS_GERAIS.find((f) => f.nome === 'avisar_equipe');
    expect(avisar).toBeDefined();
    const props = Object.keys(
      (avisar!.parametros as { properties: Record<string, unknown> }).properties,
    );
    expect(props).toEqual(expect.arrayContaining(['destino', 'mensagem']));
    for (const proibido of ['telefone', 'numero', 'jid', 'celular', 'para']) {
      expect(props).not.toContain(proibido);
    }
  });

  it('o destino de avisar_equipe e um conjunto fechado', () => {
    const avisar = FERRAMENTAS_GERAIS.find((f) => f.nome === 'avisar_equipe')!;
    const destino = (
      avisar.parametros as {
        properties: { destino: { enum?: string[] } };
      }
    ).properties.destino;
    expect(destino.enum).toEqual(['vendedor', 'supervisao']);
  });

  /**
   * Este teste substituiu, em 2026-09-05, um que fixava a **ausência** da 2ª
   * via de boleto — ela dependia de um recorte por cliente que não existia.
   * Agora existe (`QuemPede`), e o que precisa ficar preso é outra coisa:
   * documento só é oferecido quando há cliente associado.
   *
   * Sem isso, a IA descreveria "mando seu boleto" a um desconhecido e falharia
   * na execução — prometendo antes do erro, que é exatamente o que o desenho
   * fail-closed do catálogo evita.
   */
  it('documento do cliente so e oferecido quando ha cliente associado', () => {
    const comCliente = ferramentasDaTriagem(true).map((f) => f.nome);
    const semCliente = ferramentasDaTriagem(false).map((f) => f.nome);

    for (const ferramenta of [
      'segunda_via_boleto',
      'copia_da_nota',
      'meus_pedidos',
      'copia_do_pedido',
    ]) {
      expect(comCliente).toContain(ferramenta);
      expect(semCliente).not.toContain(ferramenta);
    }
  });

  it('nenhuma ferramenta de documento recebe de quem e o documento', () => {
    // O cliente sai do vínculo do número, resolvido pelo servidor. Se o modelo
    // pudesse informar o cliente, bastaria ele se enganar (ou ser convencido)
    // para mandar o boleto de uma empresa para outra.
    for (const f of ferramentasDaTriagem(true)) {
      const props = Object.keys(
        (f.parametros as { properties?: Record<string, unknown> }).properties ??
          {},
      );
      expect(props).not.toContain('clienteId');
      expect(props).not.toContain('cliente');
    }
  });

  it('toda ferramenta descreve para que serve, em portugues', () => {
    for (const f of ferramentasDaTriagem(true)) {
      expect(f.descricao.length).toBeGreaterThan(40);
      expect(f.nome).toMatch(/^[a-z_]+$/);
    }
  });
});
