import {
  MENUS,
  MODULOS,
  ROTINAS_SEM_TELA,
  SUPERVISAO_PERMISSOES,
  VENDEDOR_PERMISSOES,
} from '../../../prisma/catalogo-sistema';

/**
 * O catálogo (`prisma/catalogo-sistema.ts`) é a definição única da estrutura de
 * navegação e das permissões iniciais. Estes testes existem porque ele é editado
 * à mão e nada mais o confere: um `moduloId` com erro de digitação, uma rotina
 * repetida ou um perfil que nasce apontando para uma rotina que não existe são
 * erros silenciosos — o seed roda, a base sobe, e a tela some para alguém.
 *
 * Foi exatamente esse tipo de divergência (duas listas do mesmo fato) que a
 * auditoria de 2026-08-25 encontrou três vezes.
 */
describe('catálogo do sistema', () => {
  const codigosDeRotina = [
    ...MENUS.map((m) => m.codigo),
    ...ROTINAS_SEM_TELA.map((r) => r.codigo),
  ];

  it('todo menu aponta para um módulo que existe', () => {
    const modulos = new Set<string>(MODULOS.map((m) => m.id));
    const orfaos = MENUS.filter((m) => !modulos.has(m.moduloId));
    expect(orfaos.map((m) => m.id)).toEqual([]);
  });

  it('toda rotina sem tela aponta para um menu que existe', () => {
    // Rotina pendurada em menu inexistente viola a FK e derruba o seed no meio.
    const menus = new Set(MENUS.map((m) => m.id));
    const orfas = ROTINAS_SEM_TELA.filter((r) => !menus.has(r.menuId));
    expect(orfas.map((r) => r.codigo)).toEqual([]);
  });

  it('não há código de rotina repetido', () => {
    // `rotinas.codigo` é UNIQUE no banco: repetir aqui faz o segundo upsert
    // sequestrar o primeiro, e a rotina passa a apontar para o menu errado.
    const repetidos = codigosDeRotina.filter(
      (c, i) => codigosDeRotina.indexOf(c) !== i,
    );
    expect([...new Set(repetidos)]).toEqual([]);
  });

  it('não há id de menu repetido', () => {
    const ids = MENUS.map((m) => m.id);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(repetidos)]).toEqual([]);
  });

  it('todo perfil nasce apontando para rotinas que existem', () => {
    // A guarda contra o erro mais fácil de cometer: escrever
    // `'sugestao_compra'` na lista de permissões e nunca descobrir, porque o
    // seed simplesmente não encontra a rotina e segue em frente — o perfil
    // nasce sem aquele acesso, em silêncio.
    const existentes = new Set(codigosDeRotina);
    const inexistentes = [
      ...Object.keys(VENDEDOR_PERMISSOES),
      ...Object.keys(SUPERVISAO_PERMISSOES),
    ].filter((codigo) => !existentes.has(codigo));

    expect([...new Set(inexistentes)]).toEqual([]);
  });

  it('Supervisor e Gerente têm tudo do Vendedor', () => {
    // SUPERVISAO_PERMISSOES é montada por spread sobre VENDEDOR_PERMISSOES; se
    // alguém trocar isso por uma lista própria, os dois conjuntos passam a
    // divergir sem aviso — e supervisor perde tela que o vendedor tem.
    const faltando = Object.keys(VENDEDOR_PERMISSOES).filter(
      (codigo) => !(codigo in SUPERVISAO_PERMISSOES),
    );
    expect(faltando).toEqual([]);
  });
});
