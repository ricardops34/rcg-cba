import { AgenteToolsService } from './agente-tools.service';
import type { FiltroFerramentas } from './agente-ferramentas.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * As duas camadas que decidem o que o agente enxerga: a permissão do RBAC
 * (código) e a configuração da empresa (banco).
 *
 * Estes testes existem porque a interação entre elas é onde um erro passa
 * despercebido — e o erro aqui é sempre grave, nos dois sentidos: liberar o
 * que devia estar fechado, ou fechar para o administrador a ferramenta que ele
 * acabou de configurar.
 */
describe('AgenteToolsService — permissão × configuração', () => {
  // Os services injetados não são exercidos: o filtro só lê metadados do
  // catálogo, e instanciar as dependências reais traria o Prisma junto. Um
  // `as never` por dependência do construtor — se o número divergir, o
  // TypeScript acusa aqui antes de o Nest acusar na subida.
  const instanciar = (clientes: unknown = {}) =>
    new AgenteToolsService(
      {} as never, // consultas
      clientes as never, // clientes
      {} as never, // produtos
      {} as never, // orcamentos
      {} as never, // titulos
      {} as never, // sugestao
      {} as never, // objetivos
      {} as never, // enriquecimento
      {} as never, // atividades
      {} as never, // oportunidades
      {} as never, // conversas
      {} as never, // vendedores
      {} as never, // whatsappAcoes
      {} as never, // agendamento
      {} as never, // referencias
      {} as never, // fichas
      {} as never, // anexos
      {} as never, // meuDia
    );

  const tools = instanciar();

  const admin: AuthenticatedUser = {
    id: 'u-admin',
    nome: 'Administrador',
    email: 'admin@x.com',
    empresaAtivaId: 'e-1',
    isAdmin: true,
    permissoes: [],
  };

  const vendedor: AuthenticatedUser = {
    id: 'u-vend',
    nome: 'Vendedor',
    email: 'vend@x.com',
    empresaAtivaId: 'e-1',
    isAdmin: false,
    permissoes: ['clientes.visualizar'],
  };

  const PERFIL_GERENTE = '11111111-1111-4111-8111-111111111111';
  const PERFIL_VENDEDOR = '22222222-2222-4222-8222-222222222222';

  const filtro = (
    cfg: Partial<{ ativa: boolean; perfilIds: string[] }>,
    perfilId: string | null,
    whatsappVinculado = false,
  ): FiltroFerramentas => ({
    whatsappVinculado,
    config: new Map([
      [
        'buscar_cliente',
        {
          ativa: cfg.ativa ?? true,
          nome: null,
          instrucoes: null,
          descricao: null,
          perfilIds: cfg.perfilIds ?? [],
        },
      ],
    ]),
    perfilId,
  });

  const temBuscarCliente = (user: AuthenticatedUser, f?: FiltroFerramentas) =>
    tools.disponiveisPara(user, f).some((x) => x.nome === 'buscar_cliente');

  describe('administrador', () => {
    it('ignora a restrição por perfil — sempre tem acesso', () => {
      // Restrita ao Gerente; o admin não é Gerente e mesmo assim recebe.
      // É quem configura a lista, e precisa poder testar o que restringiu.
      expect(
        temBuscarCliente(
          admin,
          filtro({ perfilIds: [PERFIL_GERENTE] }, PERFIL_VENDEDOR),
        ),
      ).toBe(true);
    });

    it('NÃO ignora o desligamento da ferramenta', () => {
      // O interruptor diz "esta capacidade não existe nesta empresa". Abrir
      // exceção para o admin faria ele testar um agente diferente do que a
      // equipe usa, e o desligamento deixaria de ser verificável.
      expect(temBuscarCliente(admin, filtro({ ativa: false }, null))).toBe(
        false,
      );
    });
  });

  describe('demais perfis', () => {
    it('recebe quando o perfil está na lista', () => {
      expect(
        temBuscarCliente(
          vendedor,
          filtro({ perfilIds: [PERFIL_VENDEDOR] }, PERFIL_VENDEDOR),
        ),
      ).toBe(true);
    });

    it('NÃO recebe quando o perfil ficou de fora, mesmo tendo a permissão', () => {
      // O vendedor tem `clientes.visualizar` — o RBAC libera. A configuração
      // da empresa é que restringe, e ela tem de valer.
      expect(
        temBuscarCliente(
          vendedor,
          filtro({ perfilIds: [PERFIL_GERENTE] }, PERFIL_VENDEDOR),
        ),
      ).toBe(false);
    });

    it('recebe quando nenhum perfil foi marcado', () => {
      // Lista vazia = sem restrição por perfil. É o padrão, e o comportamento
      // anterior a esta configuração existir.
      expect(temBuscarCliente(vendedor, filtro({}, PERFIL_VENDEDOR))).toBe(
        true,
      );
    });

    it('NÃO recebe o que a permissão do código nega, mesmo com o perfil marcado', () => {
      // A configuração restringe, nunca amplia: marcar o perfil não substitui
      // a permissão. `titulos_em_aberto` exige `titulos-receber.visualizar`,
      // que este vendedor não tem.
      const semTitulos = tools
        .disponiveisPara(
          vendedor,
          filtro({ perfilIds: [PERFIL_VENDEDOR] }, PERFIL_VENDEDOR),
        )
        .some((x) => x.nome === 'titulos_em_aberto');
      expect(semTitulos).toBe(false);
    });
  });

  describe('ferramentas de WhatsApp', () => {
    // Exigem, além da permissão, que o usuário tenha aparelho pareado. São as
    // duas condições somadas: `whatsapp-conversas.visualizar` diz que ele pode
    // atender por WhatsApp; o vínculo diz que ele tem por onde.
    const comWhatsapp: AuthenticatedUser = {
      ...vendedor,
      permissoes: ['clientes.visualizar', 'whatsapp-conversas.visualizar'],
    };

    const temConversas = (user: AuthenticatedUser, f?: FiltroFerramentas) =>
      tools
        .disponiveisPara(user, f)
        .some((x) => x.nome === 'conversas_whatsapp');

    it('aparece para quem tem a permissão e o aparelho vinculado', () => {
      expect(temConversas(comWhatsapp, filtro({}, PERFIL_VENDEDOR, true))).toBe(
        true,
      );
    });

    it('NÃO aparece para quem tem a permissão mas nenhum aparelho vinculado', () => {
      // O caso do vendedor que ainda não pareou o celular. Sem isto o modelo
      // prometeria agendar uma mensagem por um WhatsApp que não existe.
      expect(
        temConversas(comWhatsapp, filtro({}, PERFIL_VENDEDOR, false)),
      ).toBe(false);
    });

    it('NÃO aparece sem filtro carregado — o default fecha', () => {
      // Ao contrário da configuração da empresa, que sem filtro vale o catálogo
      // puro, aqui o default é negar: conversa de cliente é dado pessoal, e a
      // ausência de informação não pode virar acesso.
      expect(temConversas(comWhatsapp, undefined)).toBe(false);
    });

    it('NÃO aparece para quem tem aparelho mas não tem a permissão', () => {
      // O vínculo não substitui o RBAC. Este usuário tem só `clientes.visualizar`.
      expect(temConversas(vendedor, filtro({}, PERFIL_VENDEDOR, true))).toBe(
        false,
      );
    });

    it('o administrador também precisa de aparelho vinculado', () => {
      // Diferente da restrição por perfil, que o admin ignora: aqui não é
      // política de acesso, é fato material. Sem conexão não há conversa dele
      // para ler nem aparelho por onde falar.
      expect(temConversas(admin, filtro({}, null, false))).toBe(false);
      expect(temConversas(admin, filtro({}, null, true))).toBe(true);
    });
  });

  describe('ferramentas de anexo', () => {
    // Só existem no turno que trouxe arquivo. Fora dele, o modelo prometeria
    // anexar o que não recebeu — e o usuário ficaria esperando uma ficha que
    // nunca foi gravada.
    const comProdutos: AuthenticatedUser = {
      ...admin,
      permissoes: ['produtos.editar', 'produtos.visualizar'],
    };

    const temFicha = (user: AuthenticatedUser, temAnexo: boolean) =>
      tools
        .disponiveisPara(user, filtro({}, null, false), { temAnexo })
        .some((x) => x.nome === 'anexar_ficha_tecnica');

    it('aparece no turno com arquivo, para quem pode editar produto', () => {
      expect(temFicha(comProdutos, true)).toBe(true);
    });

    it('NÃO aparece sem arquivo no turno', () => {
      expect(temFicha(comProdutos, false)).toBe(false);
    });

    it('NÃO aparece por omissão do parâmetro — o default fecha', () => {
      expect(
        tools
          .disponiveisPara(comProdutos, filtro({}, null, false))
          .some((x) => x.nome === 'anexar_ficha_tecnica'),
      ).toBe(false);
    });

    it('o arquivo não substitui a permissão', () => {
      // `vendedor` tem só `clientes.visualizar`: anexar ficha técnica altera o
      // cadastro de produto, e ter mandado um PDF não muda isso.
      expect(temFicha(vendedor, true)).toBe(false);
    });

    it('o id do anexo não é parâmetro declarado de nenhuma ferramenta', () => {
      // Ele é injetado pelo servidor a partir da mensagem que carregou o
      // arquivo. Declarado, bastaria convencer o modelo a informar o anexo de
      // outra pessoa.
      // O catálogo cru, não o filtrado: a garantia vale para toda ferramenta
      // que exista, inclusive as que este usuário não alcança.
      for (const f of tools['todas']()) {
        const props = Object.keys(
          (f.parametros as { properties?: Record<string, unknown> })
            .properties ?? {},
        );
        expect(props).not.toContain('anexoId');
      }
    });
  });

  it('quem só visualiza cliente não recebe a ferramenta que edita o cadastro', () => {
    // `atualizar_cadastro_pela_receita` grava (vira pendência de confirmação) e exige
    // `clientes.editar`. Quem tem só `clientes.visualizar` não pode nem vê-la
    // no catálogo: o modelo não deve prometer o que a tela negaria.
    const nomes = tools.disponiveisPara(vendedor).map((f) => f.nome);
    expect(nomes).toContain('buscar_cliente');
    expect(nomes).not.toContain('atualizar_cadastro_pela_receita');
  });

  describe('a exceção da fronteira de dados', () => {
    it('só a consulta de CNPJ declara identificacaoPublica', () => {
      // A isenção deixa um bloco do resultado ir ao provedor **sem máscara**.
      // Ela vale para base pública (Receita Federal) e para mais nada: se este
      // teste quebrar, alguém ligou a exceção numa ferramenta que lê a nossa
      // base, e a decisão precisa ser consciente — não um campo a mais no
      // catálogo. Ver `anonimizar-agente.ts`.
      const comIsencao = tools['todas']()
        .filter((f) => f.identificacaoPublica)
        .map((f) => f.nome);
      expect(comIsencao).toEqual(['consultar_cnpj']);
    });
  });

  describe('atualizar_cadastro_pela_receita — quem alcança o cliente', () => {
    // Quem pode atualizar é o vendedor responsável, quem está acima dele e
    // quem tem acesso total. Isso **não** é decidido aqui: vem do escopo
    // hierárquico que `clientes.atualizarPelaReceita` resolve a partir do
    // usuário da sessão. O que esta suíte trava é o caminho — que a ferramenta
    // continue delegando com o usuário real e sem deixar o modelo apontar
    // carteira.
    const editor: AuthenticatedUser = {
      id: 'u-edit',
      nome: 'Editor',
      email: 'edit@x.com',
      empresaAtivaId: 'e-1',
      isAdmin: false,
      permissoes: ['clientes.editar'],
    };

    it('delega ao service com o usuário da sessão', async () => {
      const atualizarPelaReceita = jest.fn().mockResolvedValue({});
      const comClientes = instanciar({ atualizarPelaReceita });

      await comClientes.executar(
        'atualizar_cadastro_pela_receita',
        { clienteId: 'c-1' },
        editor,
      );

      expect(atualizarPelaReceita).toHaveBeenCalledWith('e-1', editor, 'c-1');
    });

    it('não declara parâmetro de vendedor ou carteira', () => {
      // Se o modelo pudesse informar de quem é o cliente, bastaria convencê-lo.
      const f = tools['todas']().find(
        (x) => x.nome === 'atualizar_cadastro_pela_receita',
      );
      const props = Object.keys(
        (f?.parametros as { properties?: Record<string, unknown> })
          .properties ?? {},
      );
      expect(props).toEqual(['clienteId']);
    });
  });

  it('sem configuração carregada, vale o catálogo puro', () => {
    // Chamada interna ou empresa ainda não sincronizada não pode zerar o
    // agente.
    expect(temBuscarCliente(vendedor, undefined)).toBe(true);
  });
});
