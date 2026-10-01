import { linkDeAcesso, montarEmailAcesso } from './email-acesso';

describe('e-mail de acesso', () => {
  const ambiente = { ...process.env };
  afterEach(() => {
    process.env = { ...ambiente };
  });

  const empresa = {
    nomeFantasia: 'RCG DISTRIBUIDORA',
    razaoSocial: 'REPRESENTACOES CAMPO GRANDE LTDA',
    cnpj: '03715067000109',
    alias: 'rcg',
    endereco: 'RUA TREZE DE MAIO, 1472',
    bairro: 'CENTRO',
    municipio: 'CAMPO GRANDE',
    uf: 'MS',
    telefone: '6733827328',
    site: 'www.rcgdist.com.br',
  };

  it('o link de login sai do CORS_ORIGIN, com o alias da empresa', () => {
    delete process.env.WEB_URL;
    process.env.CORS_ORIGIN = 'https://plataforma.rcgdist.com.br,https://outro';
    expect(linkDeAcesso('rcg')).toBe(
      'https://plataforma.rcgdist.com.br/login?empresa=rcg',
    );
  });

  it('WEB_URL, quando existe, vence o CORS_ORIGIN', () => {
    process.env.WEB_URL = 'https://app.exemplo.com.br/';
    process.env.CORS_ORIGIN = 'https://plataforma.rcgdist.com.br';
    expect(linkDeAcesso(null)).toBe('https://app.exemplo.com.br/login');
  });

  it('leva empresa, link, login e senha — e escapa o que vem do cadastro', () => {
    process.env.CORS_ORIGIN = 'https://plataforma.rcgdist.com.br';
    const { assunto, html } = montarEmailAcesso({
      empresa,
      nome: 'TESTE <MAXIMA>',
      login: 'teste@exemplo.com',
      senha: 'z4%s@P$m',
      motivo: 'redefinida',
    });

    expect(assunto).toBe('Nova senha provisória — RCG DISTRIBUIDORA');
    expect(html).toContain(
      'href="https://plataforma.rcgdist.com.br/login?empresa=rcg"',
    );
    expect(html).toContain(
      'REPRESENTACOES CAMPO GRANDE LTDA — CNPJ 03.715.067/0001-09',
    );
    expect(html).toContain('CAMPO GRANDE/MS');
    expect(html).toContain('teste@exemplo.com');
    expect(html).toContain('z4%s@P$m');
    expect(html).toContain('TESTE &lt;MAXIMA&gt;');
    expect(html).not.toContain('<MAXIMA>');
  });

  it('sem endereço do sistema, sai sem o botão em vez de um link quebrado', () => {
    delete process.env.WEB_URL;
    delete process.env.CORS_ORIGIN;
    const { html } = montarEmailAcesso({
      empresa,
      nome: 'Fulano',
      login: 'f@x.com',
      senha: 'abc',
      motivo: 'criado',
    });
    expect(html).not.toContain('Acessar a plataforma');
  });
});
