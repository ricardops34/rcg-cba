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
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;
      return fn(tx);
    });
  }
}

export type { TenantTx };
export { Prisma };
