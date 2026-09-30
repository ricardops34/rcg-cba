import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * O que a requisição atual informa ao Postgres para as policies de RLS.
 *
 * Aberto vazio para toda requisição HTTP (middleware em `main.ts`) e preenchido
 * pelo `JwtStrategy` depois de validar o token. O `PrismaService` lê daqui e
 * repassa ao banco em cada consulta, sem o código chamador precisar lembrar —
 * ver `PrismaService`.
 *
 * Fora de requisição (jobs, boot, scripts) não há contexto, e as consultas vão
 * ao banco sem nada setado: quem precisa de tenant ali continua usando
 * `withTenant` explicitamente.
 */
export interface ContextoBanco {
  /** `app.current_empresa_id` — a empresa ativa da sessão. */
  empresaId?: string;
  /**
   * `app.plataforma = 'on'` — o usuário é administrador da plataforma. Libera,
   * nas tabelas que a consultam, o que é da plataforma e não de um cliente
   * (ex.: alterar perfil da plataforma).
   */
  plataforma?: boolean;
}

const armazenamento = new AsyncLocalStorage<ContextoBanco>();

export function contextoBanco(): ContextoBanco | undefined {
  return armazenamento.getStore();
}

export function executarComContexto<T>(contexto: ContextoBanco, fn: () => T): T {
  return armazenamento.run(contexto, fn);
}
