import { validarSegredosDoAmbiente } from './validar-segredos';

describe('validarSegredosDoAmbiente', () => {
  it('recusa segredo público fora de desenvolvimento', () => {
    expect(() =>
      validarSegredosDoAmbiente({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'desenvolvimento-local-access',
        PORTAL_JWT_ACCESS_SECRET: 'prod-portal-secret-32b-ok-12345',
        JWT_REFRESH_SECRET: 'prod-refresh-secret-32b-ok-12345',
        WHATSAPP_WORKER_TOKEN: 'prod-worker-secret-32b-ok-12345',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('recusa variáveis obrigatórias ausentes em produção', () => {
    expect(() =>
      validarSegredosDoAmbiente({
        NODE_ENV: 'production',
      }),
    ).toThrow(/não configuradas em produção/);
  });

  it('permite defaults em desenvolvimento', () => {
    expect(() =>
      validarSegredosDoAmbiente({
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'desenvolvimento-local-access',
      }),
    ).not.toThrow();
  });
});
