import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { contextoBanco, type ContextoBanco } from './contexto-banco';

type TenantTx = Prisma.TransactionClient;

/** O `set_config` que leva o contexto da requisição à transação. */
function informarContexto(
  cliente: { $executeRaw: PrismaClient['$executeRaw'] },
  contexto: ContextoBanco | undefined,
) {
  if (!contexto?.empresaId && !contexto?.plataforma) return null;
  return cliente.$executeRaw`SELECT
    set_config('app.current_empresa_id', ${contexto.empresaId ?? ''}, true),
    set_config('app.plataforma', ${contexto.plataforma ? 'on' : ''}, true)`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Contexto automático para a RLS: toda consulta feita durante uma requisição
   * leva ao banco a empresa ativa e o modo plataforma (ver `contexto-banco.ts`),
   * sem o código chamador precisar passar por `withTenant`.
   *
   * - **Consulta avulsa** (`this.prisma.x.findMany()`): vira um lote curto
   *   `[set_config, consulta]`, na mesma transação e na mesma conexão.
   * - **Dentro de transação** (o Prisma informa em `__internalParams`): passa
   *   direto — o contexto já foi informado quando a transação abriu, pelo
   *   `$transaction` abaixo. Abrir outra transação ali quebraria a atual.
   * - **`$transaction`**: a interativa informa o contexto antes de rodar a
   *   função; o lote ganha o `set_config` na frente (e o resultado dele é
   *   retirado da resposta). Um `set_config` explícito dentro da transação —
   *   `withTenant`, ou os serviços que trocam de empresa num laço — continua
   *   valendo, porque vem depois.
   *
   * O construtor devolve o cliente estendido (Prisma 6 não tem mais `$use`); os
   * métodos desta classe continuam acessíveis por ele.
   */
  constructor() {
    super();
    const base = this;
    const estendido = this.$extends({
      query: {
        $allModels: {
          async $allOperations(params) {
            const interno = (params as { __internalParams?: { transaction?: unknown } })
              .__internalParams;
            const contexto = informarContexto(base, contextoBanco());
            if (interno?.transaction || !contexto) return params.query(params.args);
            const [, resultado] = await base.$transaction([contexto, params.query(params.args)]);
            return resultado;
          },
        },
      },
    });

    const transacao = (arg: unknown, opcoes?: unknown) => {
      const contexto = contextoBanco();
      if (typeof arg === 'function') {
        return estendido.$transaction(async (tx) => {
          await informarContexto(tx, contexto);
          return (arg as (tx: unknown) => Promise<unknown>)(tx);
        }, opcoes as Parameters<typeof estendido.$transaction>[1]);
      }
      const antes = informarContexto(estendido, contexto);
      const lote = [...(antes ? [antes] : []), ...(arg as Prisma.PrismaPromise<unknown>[])];
      return estendido
        .$transaction(lote, opcoes as { isolationLevel?: Prisma.TransactionIsolationLevel })
        .then((resultados) => (antes ? resultados.slice(1) : resultados));
    };

    return new Proxy(estendido, {
      get(alvo, prop, receiver) {
        if (prop === '$transaction') return transacao;
        return Reflect.get(alvo, prop, receiver);
      },
    }) as unknown as PrismaService;
  }

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
      // Zera a empresa que o contexto automático informou: aqui a pergunta é
      // "os vínculos DESTE usuário", e com a empresa setada a policy de tenant
      // somaria os vínculos de todo mundo da empresa ativa.
      await tx.$executeRaw`SELECT set_config('app.current_usuario_id', ${usuarioId}, true), set_config('app.current_empresa_id', '', true)`;
      return fn(tx);
    });
  }

  /**
   * Contexto mínimo para localizar uma credencial do portal antes de o tenant
   * estar autenticado. A policy aceita somente a credencial exata informada.
   */
  async withPortalCredential<T>(
    alvo: { id: string } | { empresaAlias: string; email: string },
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.current_portal_credential_id', ${'id' in alvo ? alvo.id : ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_portal_empresa_alias', ${'empresaAlias' in alvo ? alvo.empresaAlias : ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_portal_email', ${'email' in alvo ? alvo.email : ''}, true)`;
      return fn(tx);
    });
  }

  /** Permite inserir apenas o evento de auditoria que está sendo registrado. */
  async withPortalAudit<T>(
    email: string,
    empresaId: string | undefined,
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.current_portal_audit_email', ${email}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_portal_audit_empresa_id', ${empresaId ?? ''}, true)`;
      return fn(tx);
    });
  }
}

export type { TenantTx };
export { Prisma };
