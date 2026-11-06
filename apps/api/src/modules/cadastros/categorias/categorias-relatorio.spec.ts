import { CategoriasController } from './categorias.controller';

/** Quem tem só permissão de relatório recebe a lista de categorias só com nomes. */
describe('GET /categorias: o que cada permissão enxerga', () => {
  const montar = () => {
    const service = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
    const controller = new CategoriasController(service as never);
    return { controller, service };
  };
  const usuario = (permissoes: string[], isAdmin = false) =>
    ({ empresaAtivaId: 'e1', isAdmin, permissoes }) as never;

  it('só permissão de relatório → somenteNomes', async () => {
    const { controller, service } = montar();
    await controller.findAll(
      {} as never,
      usuario(['relatorio-vendas.visualizar']),
    );
    expect(service.findAll).toHaveBeenCalledWith(
      'e1',
      {},
      { somenteNomes: true },
    );
  });

  it('categorias.visualizar → registro completo', async () => {
    const { controller, service } = montar();
    await controller.findAll({} as never, usuario(['categorias.visualizar']));
    expect(service.findAll).toHaveBeenCalledWith(
      'e1',
      {},
      { somenteNomes: false },
    );
  });

  it('administrador da empresa → registro completo', async () => {
    const { controller, service } = montar();
    await controller.findAll({} as never, usuario([], true));
    expect(service.findAll).toHaveBeenCalledWith(
      'e1',
      {},
      { somenteNomes: false },
    );
  });
});
