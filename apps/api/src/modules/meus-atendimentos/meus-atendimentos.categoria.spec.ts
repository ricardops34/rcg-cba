import { categoriaDoTitulo } from './meus-atendimentos.service';

/**
 * A timeline agrupa por origem lendo o **título** da atividade, e os títulos
 * são escritos pelos helpers do servidor. Este teste é o que amarra as duas
 * pontas: mudar o texto de um helper sem mexer aqui joga a linha para
 * `agenda`, e o contador da tela erra em silêncio — nada quebra, o número só
 * fica errado.
 *
 * Por isso os casos abaixo copiam os títulos **como os helpers os geram**
 * (ver `registrar-atendimento-whatsapp.ts`, `registrar-atividade-documento.ts`
 * e `registrar-atividade-orcamento.ts`).
 */
describe('categoriaDoTitulo', () => {
  it('reconhece o atendimento por WhatsApp', () => {
    expect(categoriaDoTitulo('Atendimento por WhatsApp')).toBe('whatsapp');
  });

  it('reconhece os documentos, gerados na tela ou enviados pela conversa', () => {
    const documentos = [
      '2ª via do DANFE gerada — NF 123',
      'DANFE enviado pelo WhatsApp — NF 123',
      'XML da NF 123 baixado',
      '2ª via de boleto gerada — título 456',
      'Boleto enviado pelo WhatsApp — título 456',
      'Títulos em aberto enviados pelo WhatsApp',
      'Últimas notas fiscais enviadas pelo WhatsApp',
    ];
    for (const titulo of documentos) {
      expect(categoriaDoTitulo(titulo)).toBe('documento');
    }
  });

  it('reconhece os passos do orçamento', () => {
    const orcamentos = [
      'Orçamento nº 7 cadastrado',
      'Orçamento nº 7 alterado',
      'Proposta em PDF gerada — orçamento nº 7',
      'Proposta enviada pelo WhatsApp — orçamento nº 7',
      'Orçamento nº 7 aprovado pelo cliente',
      'Desconto autorizado — orçamento nº 7',
    ];
    for (const titulo of orcamentos) {
      expect(categoriaDoTitulo(titulo)).toBe('orcamento');
    }
  });

  it('manda para a agenda o que o próprio vendedor escreveu', () => {
    expect(categoriaDoTitulo('Retornar contato sobre a reposição')).toBe(
      'agenda',
    );
    expect(categoriaDoTitulo('Visita ao cliente')).toBe('agenda');
  });

  it('não confunde a proposta enviada pelo WhatsApp com a conversa', () => {
    // O título tem "WhatsApp" nos dois casos: o que separa é o começo da
    // frase, e é justamente onde um `includes` ingênuo erraria.
    expect(
      categoriaDoTitulo('Proposta enviada pelo WhatsApp — orçamento nº 7'),
    ).toBe('orcamento');
    expect(categoriaDoTitulo('Boleto enviado pelo WhatsApp — título 9')).toBe(
      'documento',
    );
  });
});
