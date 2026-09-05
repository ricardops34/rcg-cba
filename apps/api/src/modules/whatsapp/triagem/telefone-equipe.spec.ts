import { digitos, jidBrasileiro, sufixoTelefone } from './telefone-equipe';

/**
 * O telefone da equipe já falhou uma vez em silêncio: o aviso da IA lia de
 * `usuario_empresas.celular`, coluna que ninguém preenche, e a ferramenta
 * devolvia "ninguém tem celular cadastrado" sem que nada parecesse quebrado.
 *
 * Estes testes prendem as duas decisões que evitam a repetição disso: como o
 * número vira JID (onde um prefixo cego mandaria a mensagem para um número
 * inexistente) e como dois números se comparam (onde um critério estrito
 * deixaria de reconhecer o próprio vendedor).
 */
describe('Telefone da equipe', () => {
  describe('jidBrasileiro', () => {
    it('acrescenta o DDI ao celular do cadastro', () => {
      expect(jidBrasileiro('67998699444')).toBe('5567998699444@s.whatsapp.net');
    });

    it('aceita o número formatado como a tela mostra', () => {
      expect(jidBrasileiro('(67) 99869-9444')).toBe(
        '5567998699444@s.whatsapp.net',
      );
    });

    it('não duplica o DDI quando ele já está no cadastro', () => {
      // Um prefixo cego produziria 5555679..., um número que não existe — e a
      // mensagem sairia sem erro nenhum para lugar nenhum.
      expect(jidBrasileiro('5567998699444')).toBe(
        '5567998699444@s.whatsapp.net',
      );
    });

    it('aceita fixo de 10 dígitos', () => {
      expect(jidBrasileiro('6733214455')).toBe('556733214455@s.whatsapp.net');
    });

    it('recusa número curto demais em vez de completar', () => {
      // Inventar dígito manda mensagem para a pessoa errada — o mesmo motivo
      // pelo qual `dddPadrao` nasce nulo na configuração.
      expect(jidBrasileiro('99869944')).toBeNull();
      expect(jidBrasileiro('')).toBeNull();
      expect(jidBrasileiro(null)).toBeNull();
    });
  });

  describe('sufixoTelefone', () => {
    it('reconhece o mesmo número com e sem DDI', () => {
      expect(sufixoTelefone('67998699444')).toBe(
        sufixoTelefone('5567998699444'),
      );
    });

    it('reconhece o mesmo número com e sem o 9º dígito', () => {
      // O caso que quebra qualquer comparação estrita nesta base: o cadastro
      // tem o número antigo e o WhatsApp entrega o novo, ou o contrário.
      expect(sufixoTelefone('6798699444')).toBe(sufixoTelefone('67998699444'));
    });

    it('reconhece o número como o WhatsApp entrega, com o jid junto', () => {
      expect(sufixoTelefone('5567998699444@s.whatsapp.net')).toBe(
        sufixoTelefone('(67) 99869-9444'),
      );
    });

    it('separa números realmente diferentes', () => {
      expect(sufixoTelefone('67998699444')).not.toBe(
        sufixoTelefone('67995215670'),
      );
    });

    it('devolve vazio quando não há dígitos para comparar', () => {
      // Vazio é o sinal de "não dá para reconhecer". Devolver um sufixo curto
      // faria dois cadastros incompletos casarem entre si.
      expect(sufixoTelefone('123')).toBe('');
      expect(sufixoTelefone(null)).toBe('');
    });
  });

  describe('digitos', () => {
    it('tira formatação e trata nulo', () => {
      expect(digitos('(67) 99869-9444')).toBe('67998699444');
      expect(digitos(null)).toBe('');
    });
  });
});
