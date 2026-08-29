import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

type TenantTx = Prisma.TransactionClient;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  /**
   * Executa `fn` dentro de uma transação com a empresa ativa configurada via
   * `SET LOCAL app.current_empresa_id`, para que as policies de Row-Level
   * Security do Postgres isolem os dados por tenant mesmo sob pool de conexões
   * compartilhado.
   */
  async withTenant<T>(
    empresaId: string,
    fn: (tx: TenantTx) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;
      return fn(tx);
    }, options);
  }

  /**
   * Mesma ideia de `withTenant`, mas escopado pelo próprio usuário
   * (`app.current_usuario_id`) em vez da empresa ativa — necessário pra
   * consultar `usuario_empresas` (tem RLS) antes de existir empresa ativa no
   * contexto: login (descobrir a quais empresas o usuário pertence) e
   * `AuthService.me()` (listar todas as empresas do usuário).
   */
  async withUsuario<T>(
    usuarioId: string,
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_usuario_id', ${usuarioId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Contexto mÃ­nimo para localizar uma credencial do portal antes de o tenant
   * estar autenticado. A policy aceita somente a credencial exata informada.
   */
  async withPortalCredential<T>(
    alvo: { id: string } | { empresaAlias: string; email: string },
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_portal_credential_id', ${'id' in alvo ? alvo.id : ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_portal_empresa_alias', ${'empresaAlias' in alvo ? alvo.empresaAlias : ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_portal_email', ${'email' in alvo ? alvo.email : ''}, true)`;
      return fn(tx);
    });
  }

  /** Permite inserir apenas o evento de auditoria que estÃ¡ sendo registrado. */
  async withPortalAudit<T>(
    email: string,
    empresaId: string | undefined,
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_portal_audit_email', ${email}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_portal_audit_empresa_id', ${empresaId ?? ''}, true)`;
      return fn(tx);
    });
  }
}

export type { TenantTx };
export { Prisma };
