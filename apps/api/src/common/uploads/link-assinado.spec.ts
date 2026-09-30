import { assinarNaResposta, assinarUrl, linkValido } from './link-assinado';

describe('link assinado da mídia do WhatsApp', () => {
  const caminho = '/uploads/whatsapp/abc.jpg';
  const agora = Date.UTC(2026, 8, 30, 12);
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'segredo-de-teste';
  });

  const partes = (url: string) => {
    const q = new URLSearchParams(url.split('?')[1]);
    return { exp: q.get('exp') ?? undefined, sig: q.get('sig') ?? undefined };
  };

  it('assina e confere dentro do prazo', () => {
    const { exp, sig } = partes(assinarUrl(caminho, agora));
    expect(linkValido(caminho, exp, sig, agora)).toBe(true);
  });

  it('recusa vencido, sem assinatura e assinatura de outro arquivo', () => {
    const { exp, sig } = partes(assinarUrl(caminho, agora));
    expect(linkValido(caminho, exp, sig, agora + 25 * 3600 * 1000)).toBe(false);
    expect(linkValido(caminho, undefined, undefined, agora)).toBe(false);
    expect(linkValido('/uploads/whatsapp/outro.jpg', exp, sig, agora)).toBe(false);
  });

  it('não mexe em quem não é mídia do WhatsApp', () => {
    expect(assinarUrl('/uploads/logos/x.png')).toBe('/uploads/logos/x.png');
  });

  it('assina em qualquer profundidade da resposta', () => {
    const r = assinarNaResposta({
      data: [{ arquivoUrl: caminho, contato: { fotoUrl: caminho } }],
      total: 1,
      quando: new Date(0),
    });
    expect(r.data[0].arquivoUrl).toMatch(/^\/uploads\/whatsapp\/abc\.jpg\?exp=\d+&sig=/);
    expect(r.data[0].contato.fotoUrl).toMatch(/\?exp=/);
    expect(r.quando).toBeInstanceOf(Date);
    expect(r.total).toBe(1);
  });
});
