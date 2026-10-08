import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { UPLOADS_DIR } from '../../common/uploads/uploads.config';
import { jpegDoAvatar } from './foto-perfil-whatsapp';
import { nomeDeAssinatura } from './mensagem-com-autor';

describe('jpegDoAvatar', () => {
  it('lê o avatar corporativo, que já é JPEG', async () => {
    const bytes = await jpegDoAvatar('/avatares-padrao/corporativo-01.jpg');
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('sem foto no perfil, pede para escolher uma', async () => {
    await expect(jpegDoAvatar(null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('não transforma caminho do banco em leitura fora das pastas de avatar', async () => {
    for (const caminho of [
      '/uploads/avatares/../../../etc/passwd',
      '/avatares-padrao/../../package.json',
      '/uploads/whatsapp/qualquer.jpg',
    ]) {
      await expect(jpegDoAvatar(caminho)).rejects.toThrow(
        'Foto do perfil em formato não reconhecido.',
      );
    }
  });

  it('foto enviada em PNG é recusada com o que fazer', async () => {
    const nome = `${'a'.repeat(32)}.png`;
    const pasta = join(UPLOADS_DIR, 'avatares');
    await mkdir(pasta, { recursive: true });
    await writeFile(
      join(pasta, nome),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]),
    );
    try {
      await expect(jpegDoAvatar(`/uploads/avatares/${nome}`)).rejects.toThrow(
        /só aceita foto em JPEG/,
      );
    } finally {
      await unlink(join(pasta, nome));
    }
  });
});

describe('nomeDeAssinatura', () => {
  const tx = (usuario: { nome: string; nomeWhatsapp: string | null } | null) =>
    ({
      usuario: { findUnique: jest.fn().mockResolvedValue(usuario) },
    }) as never;
  const user = { id: 'u1', nome: 'Nome do Token' };

  it('usa o nome no WhatsApp quando definido', async () => {
    await expect(
      nomeDeAssinatura(
        tx({ nome: 'Ricardo Patay Sotomayor', nomeWhatsapp: 'Ricardo' }),
        user,
      ),
    ).resolves.toBe('Ricardo');
  });

  it('em branco, assina com o nome completo do cadastro', async () => {
    await expect(
      nomeDeAssinatura(
        tx({ nome: 'Ricardo Patay Sotomayor', nomeWhatsapp: '  ' }),
        user,
      ),
    ).resolves.toBe('Ricardo Patay Sotomayor');
  });

  it('sem leitura do cadastro, cai no nome do token', async () => {
    await expect(nomeDeAssinatura(tx(null), user)).resolves.toBe(
      'Nome do Token',
    );
  });
});
