import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AniversariantesService } from './aniversariantes.service';

describe('AniversariantesService', () => {
  it('consulta usuários ativos da empresa, inclusive quem não é vendedor, sem expor o ano', async () => {
    const hoje = new Date();
    const nascimento = new Date(Date.UTC(1990, hoje.getMonth(), hoje.getDate()));
    const findMany = jest.fn().mockResolvedValue([{ usuarioId: 'usuario', usuario: { nome: 'Maria' }, dataNascimento: nascimento }]);
    const withTenant = jest.fn().mockImplementation((_id, fn) => fn({ usuarioEmpresa: { findMany } }));
    const module = await Test.createTestingModule({ providers: [AniversariantesService, { provide: PrismaService, useValue: { withTenant } }] }).compile();
    const result = await module.get(AniversariantesService).listar('empresa');
    expect(withTenant).toHaveBeenCalledWith('empresa', expect.any(Function));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { empresaId: 'empresa', ativo: true, deletedAt: null, dataNascimento: { not: null }, usuario: { ativo: true, deletedAt: null } } }));
    expect(result).toEqual([{ id: 'usuario', nome: 'Maria', dia: hoje.getDate(), mes: hoje.getMonth() + 1, emDias: 0 }]);
  });
});
