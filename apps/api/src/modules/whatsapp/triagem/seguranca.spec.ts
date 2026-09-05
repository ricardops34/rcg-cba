import { chaveTelefone, sufixoTelefone } from './telefone-equipe';
import { pedeCredencial } from './sem-credencial';
import {
  FERRAMENTAS_DO_CLIENTE,
  FERRAMENTAS_GERAIS,
  ferramentasDaTriagem,
} from './triagem-ferramentas';
import { FERRAMENTAS_DO_FUNCIONARIO } from './triagem-ferramentas-funcionario';

/**
 * As garantias do atendimento pelo WhatsApp, uma por bloco.
 *
 * Estão juntas de propósito: são a lista que o usuário pediu para garantir, e
 * quem mexer no módulo precisa ver todas de uma vez. Cada uma falha em
 * silêncio se quebrar — nenhuma delas derruba o sistema, só entrega dado a
 * quem não devia.
 */
describe('Atendimento institucional — garantias de segurança', () => {
  /**
   * Um número não pode herdar o pareamento de outro.
   *
   * Este teste nasceu de uma falha real: o vínculo era chaveado pelos últimos 8
   * dígitos, então (67) 99869-9444 e (11) 99869-9444 caíam na mesma linha e o
   * segundo herdava a confirmação do primeiro — virava funcionário com a
   * carteira alheia.
   */
  describe('ninguém herda o pareamento de outro número', () => {
    it('mesmo sufixo em DDD diferente NÃO gera a mesma chave', () => {
      expect(sufixoTelefone('67998699444')).toBe(sufixoTelefone('11998699444'));
      // O sufixo colide — e é por isso que ele não pode ser a chave.
      expect(chaveTelefone('67998699444')).not.toBe(
        chaveTelefone('11998699444'),
      );
    });

    it('o mesmo aparelho gera a mesma chave em qualquer formato', () => {
      const esperado = chaveTelefone('67998699444');
      expect(esperado).toBeTruthy();
      // Com DDI, sem o 9º dígito, formatado: é a mesma pessoa.
      expect(chaveTelefone('5567998699444')).toBe(esperado);
      expect(chaveTelefone('6798699444')).toBe(esperado);
      expect(chaveTelefone('(67) 99869-9444')).toBe(esperado);
    });

    it('número sem DDD não vira chave — não dá para distinguir de outra região', () => {
      expect(chaveTelefone('998699444')).toBe('');
      expect(chaveTelefone('99869944')).toBe('');
      expect(chaveTelefone(null)).toBe('');
    });
  });

  /**
   * Número desconhecido é o do concorrente que descobriu o WhatsApp da empresa.
   * O que ele alcança é só o que está em FERRAMENTAS_GERAIS.
   */
  describe('número não associado não alcança dado de ninguém', () => {
    const semCliente = ferramentasDaTriagem(false).map((f) => f.nome);

    it('nenhuma ferramenta de dado de cliente é oferecida', () => {
      for (const f of FERRAMENTAS_DO_CLIENTE) {
        expect(semCliente).not.toContain(f.nome);
      }
    });

    it('não dá para levantar a equipe de vendas pelo nome', () => {
      // `procurar_vendedor` sondaria a lista inteira, um palpite por vez.
      expect(semCliente).not.toContain('procurar_vendedor');
    });

    it('nenhuma ferramenta do funcionário vaza para o catálogo do cliente', () => {
      const doCliente = ferramentasDaTriagem(true).map((f) => f.nome);
      for (const f of FERRAMENTAS_DO_FUNCIONARIO) {
        expect(doCliente).not.toContain(f.nome);
        expect(semCliente).not.toContain(f.nome);
      }
    });

    it('o que sobra para o desconhecido é só triagem, nunca consulta', () => {
      // Se alguém acrescentar uma consulta às gerais, este teste cai — que é o
      // ponto: dado de cliente exige cliente associado.
      expect(semCliente.sort()).toEqual(
        [
          'avisar_equipe',
          'direcionar_para_administrativo',
          'direcionar_para_vendedor',
          'identificar_cliente',
        ].sort(),
      );
    });
  });

  /**
   * O escopo nunca é argumento: ele é resolvido pelo servidor a partir de quem
   * confirmou o número. Se o modelo pudesse informá-lo, bastaria convencê-lo.
   */
  describe('o modelo não escolhe de quem é o dado', () => {
    const proibidos = [
      'clienteId',
      'cliente_id',
      'vendedorId2',
      'empresaId',
      'usuarioId',
      'carteira',
      'escopo',
    ];

    it('nenhuma ferramenta de cliente aceita apontar o dono do dado', () => {
      for (const f of [...FERRAMENTAS_DO_CLIENTE, ...FERRAMENTAS_GERAIS]) {
        const props = Object.keys(
          (f.parametros as { properties?: Record<string, unknown> })
            .properties ?? {},
        );
        for (const proibido of proibidos) {
          expect(props).not.toContain(proibido);
        }
      }
    });

    it('nenhuma ferramenta do funcionário aceita apontar carteira alheia', () => {
      for (const f of FERRAMENTAS_DO_FUNCIONARIO) {
        const props = Object.keys(
          (f.parametros as { properties?: Record<string, unknown> })
            .properties ?? {},
        );
        for (const proibido of proibidos) {
          expect(props).not.toContain(proibido);
        }
      }
    });
  });

  /**
   * O funcionário só consulta. Um celular perdido não pode virar acesso de
   * escrita — é a diferença entre um vazamento incômodo e um estrago no
   * cadastro.
   */
  it('funcionário no WhatsApp não tem nenhuma ferramenta de escrita', () => {
    for (const f of FERRAMENTAS_DO_FUNCIONARIO) {
      expect(f.nome).not.toMatch(
        /criar|cadastrar|alterar|atualizar|excluir|apagar|remover|aprovar|enviar|agendar/,
      );
    }
  });

  /**
   * Senha por WhatsApp é a fraude clássica, e ela funciona **porque** vem do
   * número oficial da empresa. O prompt já mandava não pedir; isto é o que
   * impede de sair.
   */
  describe('o bot nunca pede credencial', () => {
    it('bloqueia pedido de senha', () => {
      expect(
        pedeCredencial('Para continuar, informe sua senha do sistema'),
      ).toBe(true);
      expect(pedeCredencial('Qual a sua senha?')).toBe(true);
      expect(pedeCredencial('me passe a senha por favor')).toBe(true);
    });

    it('bloqueia pedido de dado de cartão', () => {
      expect(pedeCredencial('Digite o CVV do cartão')).toBe(true);
      expect(pedeCredencial('Envie o número do cartão para eu confirmar')).toBe(
        true,
      );
    });

    it('deixa passar a frase que tranquiliza o cliente', () => {
      // Emudecer a IA numa resposta correta seria o custo de uma lista cega.
      expect(pedeCredencial('Nunca pedimos sua senha por aqui.')).toBe(false);
      expect(
        pedeCredencial('Por segurança, não trato de senha nem de cartão.'),
      ).toBe(false);
    });

    it('não bloqueia o código de pareamento do funcionário', () => {
      // O fluxo que existe para aumentar a segurança pede um código de 6
      // dígitos — bloqueá-lo quebraria justamente ele.
      expect(
        pedeCredencial(
          'Abra Meu perfil e me mande o código de 6 dígitos que aparece lá.',
        ),
      ).toBe(false);
    });

    it('deixa passar atendimento comum', () => {
      expect(pedeCredencial('Seu boleto vence dia 10, quer a 2ª via?')).toBe(
        false,
      );
      expect(pedeCredencial('Qual o número da nota que você precisa?')).toBe(
        false,
      );
    });
  });
});
