import { ForbiddenException } from '@nestjs/common';
import { garantirVagaDeUsuario } from './limite-usuarios';

type Tx = Parameters<typeof garantirVagaDeUsuario>[0];

const tx = (limiteUsuarios: number | null, emUso: number, onCount?: (a: unknown) => void) =>
  ({
    empresa: { findUnique: () => Promise.resolve({ limiteUsuarios }) },
    usuarioEmpresa: {
      count: (args: unknown) => {
        onCount?.(args);
        return Promise.resolve(emUso);
      },
    },
  }) as unknown as Tx;

describe('garantirVagaDeUsuario', () => {
  it('limite nulo nao restringe', async () => {
    await expect(garantirVagaDeUsuario(tx(null, 999), 'e1')).resolves.toBeUndefined();
  });

  it('deixa passar quando ha vaga', async () => {
    await expect(garantirVagaDeUsuario(tx(10, 9), 'e1')).resolves.toBeUndefined();
  });

  it('barra quando o limite ja foi atingido', async () => {
    await expect(garantirVagaDeUsuario(tx(10, 10), 'e1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('barra tambem quando ja passou do limite', async () => {
    // Pode acontecer se o teto for reduzido depois de os usuarios existirem.
    await expect(garantirVagaDeUsuario(tx(5, 8), 'e1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('a mensagem diz o uso, o teto e o que fazer', async () => {
    await expect(garantirVagaDeUsuario(tx(3, 3), 'e1')).rejects.toThrow(
      /3 de 3 usuários contratados/,
    );
    await expect(garantirVagaDeUsuario(tx(3, 3), 'e1')).rejects.toThrow(/Desative/);
  });

  it('conta so vinculo ativo', async () => {
    let recebido: { where?: { ativo?: boolean } } | undefined;
    await garantirVagaDeUsuario(tx(10, 1, (a) => (recebido = a as never)), 'e1');
    expect(recebido?.where?.ativo).toBe(true);
  });

  it('ignora o proprio usuario na reativacao', async () => {
    let recebido: { where?: { NOT?: { usuarioId?: string } } } | undefined;
    await garantirVagaDeUsuario(tx(10, 1, (a) => (recebido = a as never)), 'e1', 'u9');
    expect(recebido?.where?.NOT?.usuarioId).toBe('u9');
  });

  it('sem reativacao nao manda NOT nenhum', async () => {
    let recebido: { where?: { NOT?: unknown } } | undefined;
    await garantirVagaDeUsuario(tx(10, 1, (a) => (recebido = a as never)), 'e1');
    expect(recebido?.where?.NOT).toBeUndefined();
  });
});
