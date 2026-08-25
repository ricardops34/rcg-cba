import {
  garantirMascarado,
  mascarar,
  referenciasEm,
  remontar,
} from './anonimizar-agente';

/**
 * A fronteira de dados do chat. Estes testes existem para **falhar** quando um
 * campo de identificação novo escapar para o provedor — é o tipo de regressão
 * que passa despercebida em revisão e só aparece num vazamento.
 */
describe('anonimizar-agente', () => {
  describe('mascarar', () => {
    it('troca o nome do cliente pela referência do código ERP', () => {
      const saida = mascarar({
        id: 'uuid-1',
        codigoErp: '1234',
        razaoSocial: '2 MO RESTAURANTE LTDA',
        nomeFantasia: 'Fogo Caipira',
      }) as Record<string, unknown>;

      expect(saida.cliente).toBe('«CLI:1234»');
      expect(saida).not.toHaveProperty('razaoSocial');
      expect(saida).not.toHaveProperty('nomeFantasia');
      // O código continua indo: é o que o modelo usa para se referir à entidade.
      expect(saida.codigoErp).toBe('1234');
    });

    it('cai para o id quando o cliente não tem código ERP', () => {
      const saida = mascarar({
        id: 'uuid-9',
        codigoErp: null,
        razaoSocial: 'CLIENTE SEM CODIGO',
      }) as Record<string, unknown>;

      expect(saida.cliente).toBe('«CLI:uuid-9»');
    });

    it('remove documento, contato, endereço e coordenada sem deixar substituto', () => {
      const saida = mascarar({
        codigoErp: '1',
        razaoSocial: 'X',
        cnpjCpf: '12.345.678/0001-90',
        email: 'contato@x.com.br',
        telefone: '67 99999-0000',
        telefone2: '67 3333-0000',
        site: 'x.com.br',
        endereco: 'Rua A, 100',
        cep: '79000-000',
        dataNascimento: '1980-01-01',
        latitude: -20.46,
        longitude: -54.61,
        municipio: 'CAMPO GRANDE',
        uf: 'MS',
      }) as Record<string, unknown>;

      for (const proibido of [
        'cnpjCpf',
        'email',
        'telefone',
        'telefone2',
        'site',
        'endereco',
        'cep',
        'dataNascimento',
        // Coordenada é endereço exato disfarçado de número.
        'latitude',
        'longitude',
      ]) {
        expect(saida).not.toHaveProperty(proibido);
      }

      // Município e UF seguem: grossos demais para identificar, úteis para
      // filtrar.
      expect(saida.municipio).toBe('CAMPO GRANDE');
      expect(saida.uf).toBe('MS');
    });

    it('troca a descrição do produto pela referência', () => {
      const saida = mascarar({
        produtoId: 'p-1',
        codigoErp: 'P900',
        descricao: 'CERVEJA PILSEN 600ML',
        quantidade: 12,
        vlrTotal: 480.5,
      }) as Record<string, unknown>;

      expect(saida.produto).toBe('«PRD:P900»');
      expect(saida).not.toHaveProperty('descricao');
      // Valores seguem: é a decisão de 2026-08-25, e sem eles o modelo não
      // consegue ordenar nem comparar.
      expect(saida.quantidade).toBe(12);
      expect(saida.vlrTotal).toBe(480.5);
    });

    it('NÃO mascara descrição que não é de produto (CNAE, categoria)', () => {
      const saida = mascarar({
        cnae: { codigo: '5611201', descricao: 'Restaurantes' },
      }) as Record<string, { descricao?: string }>;

      // Descrição de ramo não identifica cliente nenhum, e mascarar quebraria
      // a sugestão por CNAE sem proteger nada.
      expect(saida.cnae.descricao).toBe('Restaurantes');
    });

    it('mascara o vendedor quando vem sob a chave vendedor', () => {
      const saida = mascarar({
        vendedor: { nome: 'JOÃO DA SILVA', codigoErp: 'V7' },
      }) as Record<string, unknown>;

      expect(saida.vendedor).toBe('«VND:V7»');
    });

    it('desce em listas e objetos aninhados', () => {
      const saida = mascarar({
        data: [
          { codigoErp: 'A', razaoSocial: 'ALFA', titulos: 2 },
          { codigoErp: 'B', razaoSocial: 'BETA', titulos: 0 },
        ],
      }) as { data: Record<string, unknown>[] };

      expect(saida.data[0].cliente).toBe('«CLI:A»');
      expect(saida.data[1].cliente).toBe('«CLI:B»');
      expect(saida.data[0].titulos).toBe(2);
    });

    it('preserva valores primitivos e datas', () => {
      const saida = mascarar({ total: 1880.4, vencimento: '2026-09-10' });
      expect(saida).toEqual({ total: 1880.4, vencimento: '2026-09-10' });
    });
  });

  describe('garantirMascarado', () => {
    it('aceita payload já mascarado', () => {
      const texto = JSON.stringify(
        mascarar({ codigoErp: '1', razaoSocial: 'X' }),
      );
      expect(() => garantirMascarado(texto)).not.toThrow();
    });

    it('lança quando um campo de identificação escapa', () => {
      expect(() => garantirMascarado('{"razaoSocial":"ESCAPOU LTDA"}')).toThrow(
        /campo proibido/i,
      );
    });
  });

  describe('remontar', () => {
    it('troca as referências pelos nomes reais', () => {
      const nomes = {
        CLI: new Map([['1234', '2 MO Restaurante']]),
        PRD: new Map([['P900', 'Cerveja Pilsen 600ml']]),
        VND: new Map<string, string>(),
      };
      const texto = remontar('«CLI:1234» comprou 12 un de «PRD:P900».', nomes);
      expect(texto).toBe(
        '2 MO Restaurante comprou 12 un de Cerveja Pilsen 600ml.',
      );
    });

    it('sinaliza referência inventada em vez de apagá-la em silêncio', () => {
      const nomes = {
        CLI: new Map<string, string>(),
        PRD: new Map<string, string>(),
        VND: new Map<string, string>(),
      };
      // Apagar produziria uma frase que parece correta sobre um cliente que
      // não existe — pior que um aviso feio.
      expect(remontar('O «CLI:999» está em dia.', nomes)).toBe(
        'O [cliente 999 não encontrado] está em dia.',
      );
    });

    it('coleta as referências citadas, sem repetir', () => {
      const refs = referenciasEm('«CLI:1» e «CLI:1» e «PRD:9»');
      expect(refs.CLI).toEqual(['1']);
      expect(refs.PRD).toEqual(['9']);
      expect(refs.VND).toEqual([]);
    });
  });
});
