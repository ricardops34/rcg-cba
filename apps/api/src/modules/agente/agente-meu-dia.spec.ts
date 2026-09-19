import { AgenteMeuDiaService } from './agente-meu-dia.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * A saudação de abertura existe para ser **determinística** — foi essa a razão
 * de tirá-la do prompt. Então o que se testa aqui é o que o prompt não
 * garantiria: o limiar da meta, de quem é a meta, e o que some quando a pessoa
 * não tem a permissão de origem.
 */
describe('AgenteMeuDiaService', () => {
  const usuario = (permissoes: string[] = [], isAdmin = false) =>
    ({
      id: 'u1',
      nome: 'Maria Aparecida Souza',
      email: 'maria@exemplo.com',
      empresaAtivaId: 'e1',
      isAdmin,
      permissoes,
    }) as unknown as AuthenticatedUser;

  /** Só o vínculo é lido direto; o resto vem dos services das telas. */
  const prismaCom = (vinculo: unknown) =>
    ({
      withTenant: (_e: string, fn: (tx: unknown) => unknown) =>
        fn({ usuarioEmpresa: { findFirst: () => Promise.resolve(vinculo) } }),
    }) as never;

  const montar = (opcoes: {
    vinculo?: unknown;
    vendedor?: unknown;
    dashboard?: unknown;
    atividades?: unknown;
    feed?: unknown;
  }) =>
    new AgenteMeuDiaService(
      prismaCom(opcoes.vinculo ?? null),
      {
        findAll: () =>
          Promise.resolve(opcoes.atividades ?? { data: [], total: 0 }),
      } as never,
      {
        dashboard: () =>
          opcoes.dashboard instanceof Error
            ? Promise.reject(opcoes.dashboard)
            : Promise.resolve(opcoes.dashboard ?? {}),
      } as never,
      {
        feed: () => Promise.resolve(opcoes.feed ?? { total: 0, itens: [] }),
      } as never,
      {
        vendedorDoUsuario: () => Promise.resolve(opcoes.vendedor ?? null),
      } as never,
    );

  const VENDEDOR = { id: 'v1', nome: 'Maria', tipo: 'vendedor' };
  const COM_META = ['dashboard-comercial.visualizar'];

  describe('tratamento', () => {
    it('usa o nome reduzido do cadastro quando existe', async () => {
      const s = montar({
        vinculo: { nomeReduzido: 'Cida', dataNascimento: null },
      });
      expect((await s.montar('e1', usuario())).tratamento).toBe('Cida');
    });

    it('sem nome reduzido, usa o primeiro nome — não o nome inteiro', async () => {
      const s = montar({ vinculo: null });
      expect((await s.montar('e1', usuario())).tratamento).toBe('Maria');
    });
  });

  describe('aniversário', () => {
    it('compara dia e mês, ignorando o ano de nascimento', async () => {
      const hoje = new Date();
      const s = montar({
        vinculo: {
          nomeReduzido: null,
          dataNascimento: new Date(
            Date.UTC(1985, hoje.getUTCMonth(), hoje.getUTCDate()),
          ),
        },
      });
      expect((await s.montar('e1', usuario())).aniversario).toBe(true);
    });

    it('sem data de nascimento não inventa aniversário', async () => {
      const s = montar({
        vinculo: { nomeReduzido: null, dataNascimento: null },
      });
      expect((await s.montar('e1', usuario())).aniversario).toBe(false);
    });
  });

  describe('meta', () => {
    const com = (percRealizado: number) =>
      montar({
        vendedor: VENDEDOR,
        dashboard: {
          objetivoValor: 1000,
          realizadoValor: 10 * percRealizado,
          percRealizado,
        },
      });

    it('abaixo de 80% é "abaixo" — o assistente informa, não cobra', async () => {
      const r = await com(79.9).montar('e1', usuario(COM_META));
      expect(r.meta?.situacao).toBe('abaixo');
    });

    it('80% já é reta final', async () => {
      const r = await com(80).montar('e1', usuario(COM_META));
      expect(r.meta?.situacao).toBe('perto');
    });

    it('99% ainda é reta final, não meta batida', async () => {
      const r = await com(99.9).montar('e1', usuario(COM_META));
      expect(r.meta?.situacao).toBe('perto');
    });

    it('100% é atingida', async () => {
      const r = await com(100).montar('e1', usuario(COM_META));
      expect(r.meta?.situacao).toBe('atingida');
    });

    it('sem a permissão do dashboard, o bloco não vem', async () => {
      const r = await com(90).montar('e1', usuario([]));
      expect(r.meta).toBeNull();
    });

    it('quem não é vendedor não tem meta, mesmo com a permissão', async () => {
      const s = montar({
        vendedor: { id: 'v9', nome: 'Ana', tipo: 'supervisor' },
        dashboard: {
          objetivoValor: 1000,
          realizadoValor: 900,
          percRealizado: 90,
        },
      });
      expect((await s.montar('e1', usuario(COM_META))).meta).toBeNull();
    });

    it('administrador sem cadastro de vendedor também não tem meta própria', async () => {
      const s = montar({
        vendedor: null,
        dashboard: {
          objetivoValor: 1000,
          realizadoValor: 900,
          percRealizado: 90,
        },
      });
      expect((await s.montar('e1', usuario([], true))).meta).toBeNull();
    });

    it('objetivo não lançado no mês não vira "0% da meta"', async () => {
      const s = montar({
        vendedor: VENDEDOR,
        dashboard: { objetivoValor: 0, realizadoValor: 0, percRealizado: 0 },
      });
      expect((await s.montar('e1', usuario(COM_META))).meta).toBeNull();
    });
  });

  describe('agenda', () => {
    const ontem = new Date(Date.now() - 2 * 86_400_000);
    const hoje = new Date();

    it('separa atrasada de hoje e põe a atrasada na frente', async () => {
      const s = montar({
        atividades: {
          data: [
            { titulo: 'De hoje', tipo: 'ligacao', dataVencimento: hoje },
            { titulo: 'Atrasada', tipo: 'visita', dataVencimento: ontem },
          ],
        },
      });
      const r = await s.montar('e1', usuario(['atividades.visualizar']));
      expect(r.agenda?.atrasadas).toBe(1);
      expect(r.agenda?.hoje).toBe(1);
      expect(r.agenda?.proximas[0].titulo).toBe('Atrasada');
      expect(r.agenda?.proximas[0].quando).toMatch(/atrasada h/);
    });

    it('sem a permissão de atividades, o bloco não vem', async () => {
      const s = montar({
        atividades: {
          data: [{ titulo: 'X', tipo: 'tarefa', dataVencimento: hoje }],
        },
      });
      expect((await s.montar('e1', usuario([]))).agenda).toBeNull();
    });
  });

  describe('recados', () => {
    it('traz a contagem, e só ela — título de notificação não sai daqui', async () => {
      const s = montar({
        feed: { total: 3, itens: [{ titulo: 'Mensagem de Fulano' }] },
      });
      const r = await s.montar('e1', usuario());
      expect(r.recados).toBe(3);
      expect(JSON.stringify(r)).not.toContain('Fulano');
    });
  });

  it('uma fonte fora do ar não derruba a saudação inteira', async () => {
    const s = montar({
      vinculo: { nomeReduzido: 'Cida', dataNascimento: null },
      vendedor: VENDEDOR,
      dashboard: new Error('dashboard fora do ar'),
      feed: { total: 2, itens: [] },
    });
    const r = await s.montar('e1', usuario(COM_META));
    expect(r.meta).toBeNull();
    expect(r.tratamento).toBe('Cida');
    expect(r.recados).toBe(2);
  });
});
