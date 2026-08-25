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
  const tools = new AgenteToolsService(
    {} as never, // consultas
    {} as never, // clientes
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
  );

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
      tools.disponiveisPara(user, f).some((x) => x.nome === 'conversas_whatsapp');

    it('aparece para quem tem a permissão e o aparelho vinculado', () => {
      expect(temConversas(comWhatsapp, filtro({}, PERFIL_VENDEDOR, true))).toBe(
        true,
      );
    });

    it('NÃO aparece para quem tem a permissão mas nenhum aparelho vinculado', () => {
      // O caso do vendedor que ainda não pareou o celular. Sem isto o modelo
      // prometeria agendar uma mensagem por um WhatsApp que não existe.
      expect(temConversas(comWhatsapp, filtro({}, PERFIL_VENDEDOR, false))).toBe(
        false,
      );
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

  it('quem só visualiza cliente não recebe a ferramenta que edita o cadastro', () => {
    // `atualizar_cadastro_pela_receita` grava (vira pendência de confirmação) e exige
    // `clientes.editar`. Quem tem só `clientes.visualizar` não pode nem vê-la
    // no catálogo: o modelo não deve prometer o que a tela negaria.
    const nomes = tools.disponiveisPara(vendedor).map((f) => f.nome);
    expect(nomes).toContain('buscar_cliente');
    expect(nomes).not.toContain('atualizar_cadastro_pela_receita');
  });

  it('sem configuração carregada, vale o catálogo puro', () => {
    // Chamada interna ou empresa ainda não sincronizada não pode zerar o
    // agente.
    expect(temBuscarCliente(vendedor, undefined)).toBe(true);
  });
});
