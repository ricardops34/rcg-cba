import { validarSegredosDoAmbiente } from './validar-segredos';

describe('validarSegredosDoAmbiente', () => {
  it('recusa segredo pÃºblico fora de development', () => {
    expect(() =>
      validarSegredosDoAmbiente({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'desenvolvimento-local-access',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('permite defaults em development', () => {
    expect(() =>
      validarSegredosDoAmbiente({
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'desenvolvimento-local-access',
      }),
    ).not.toThrow();
  });
});
