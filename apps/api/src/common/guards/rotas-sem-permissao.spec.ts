import 'reflect-metadata';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * O `PermissionsGuard` libera a rota que **não** tem `@RequirePermission`
 * (`permissions.guard.ts`): sem o decorador, qualquer usuário logado chama. Este
 * teste varre todos os controllers e reprova toda rota de **escrita** (POST,
 * PUT, PATCH, DELETE) que não tenha permissão, `PlatformAdminGuard` ou outra
 * guarda própria (`ApiKeyGuard` da integração, `PortalClienteGuard`).
 *
 * As exceções abaixo são rotas de autoatendimento ou públicas **de propósito**,
 * conferidas uma a uma na auditoria de 27/10/2026 (docs/seguranca). Rota nova
 * sem permissão **falha aqui**: ou ganha `@RequirePermission`, ou entra na
 * lista com o motivo.
 */
const EXCECOES: Record<string, string> = {
  // Login e sessão: públicos ou autenticados pelo próprio token.
  'AuthController.login': 'público; limite de 10/min por IP e bloqueio de conta',
  'AuthController.refresh': 'público; autenticado pelo refresh token',
  'AuthController.logout': 'público; autenticado pelo refresh token',
  'AuthController.switchEmpresa': 'do próprio usuário (JwtAuthGuard)',
  'AuthController.changePassword': 'do próprio usuário (JwtAuthGuard)',
  'AuthController.completeFirstAccess': 'do próprio usuário (JwtAuthGuard)',
  'AuthController.uploadPhoto': 'do próprio usuário (JwtAuthGuard)',
  'AuthController.selectDefaultAvatar': 'do próprio usuário (JwtAuthGuard)',
  'AuthController.updateMe': 'do próprio usuário (JwtAuthGuard)',
  'AuthController.updateRotinaInicial': 'do próprio usuário (JwtAuthGuard)',
  'RecuperacaoSenhaController.esqueci': 'público; limite por IP e por conta',
  'RecuperacaoSenhaController.redefinir': 'público; autenticado pelo token do link',
  'PortalClienteAuthController.login': 'público (portal); limite por IP',
  'PortalClienteAuthController.refresh': 'público (portal); refresh token',
  'PortalClienteAuthController.logout': 'público (portal); refresh token',
  // Decisão do cliente pelo link público do orçamento: o token do link é a credencial.
  'OrcamentoLinkPublicoController.aprovar': 'público; token do link; limite por IP',
  'OrcamentoLinkPublicoController.recusar': 'público; token do link; limite por IP',
  // Webhook: autenticado por segredo próprio da instância.
  'WhatsappEvolutionController.webhook': 'segredo por instância, comparado em tempo constante',
  // Do próprio usuário logado.
  'UsoRotinaController.registrar': 'registra o uso do próprio usuário',
  'ErrosController.reportar': 'relato de erro do próprio usuário; limite de 20/min',
  'NotificacoesController.marcarLida': 'só as notificações do próprio usuário',
  'NotificacoesController.marcarTodasLidas': 'só as notificações do próprio usuário',
  'TermosController.aceitar': 'aceite dos termos do próprio usuário',
  'ToursController.iniciar': 'tour do próprio usuário',
  'ToursController.atualizar': 'tour do próprio usuário',
};

const ESCRITA = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

/** Guardas que dispensam a permissão de rotina: a rota tem outra autenticação própria. */
const GUARDAS_PROPRIAS = [
  'PlatformAdminGuard',
  'ApiKeyGuard',
  'PortalClienteGuard',
];

function controllersDe(pasta: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) controllersDe(caminho, achados);
    else if (nome.endsWith('.controller.ts')) achados.push(caminho);
  }
  return achados;
}

const nomesDasGuardas = (alvo: object): string[] =>
  ((Reflect.getMetadata('__guards__', alvo) as { name?: string }[] | undefined) ?? []).map(
    (g) => g?.name ?? '',
  );

describe('rotas de escrita sem @RequirePermission', () => {
  it('só existem as exceções conferidas (rota nova sem permissão reprova)', () => {
    const sem: string[] = [];
    const exceptionsUsadas = new Set<string>();

    for (const arquivo of controllersDe(join(__dirname, '..', '..', 'modules'))) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const modulo = require(arquivo) as Record<string, unknown>;
      for (const exportado of Object.values(modulo)) {
        if (typeof exportado !== 'function') continue;
        if (Reflect.getMetadata('path', exportado) === undefined) continue; // não é @Controller
        const classe = exportado as { name: string; prototype: Record<string, unknown> };
        const guardasDaClasse = nomesDasGuardas(classe);
        const permissaoDaClasse = Reflect.getMetadata(PERMISSION_KEY, classe) as string[] | undefined;

        for (const nomeMetodo of Object.getOwnPropertyNames(classe.prototype)) {
          if (nomeMetodo === 'constructor') continue;
          const metodo = classe.prototype[nomeMetodo];
          if (typeof metodo !== 'function') continue;
          const verbo = Reflect.getMetadata('method', metodo) as RequestMethod | undefined;
          if (verbo === undefined || !ESCRITA.has(verbo)) continue;

          const permissao =
            (Reflect.getMetadata(PERMISSION_KEY, metodo) as string[] | undefined) ?? permissaoDaClasse;
          if (permissao && permissao.length > 0) continue;
          const guardas = [...guardasDaClasse, ...nomesDasGuardas(metodo)];
          if (guardas.some((g) => GUARDAS_PROPRIAS.includes(g))) continue;

          const id = `${classe.name}.${nomeMetodo}`;
          if (id in EXCECOES) {
            exceptionsUsadas.add(id);
            continue;
          }
          sem.push(id);
        }
      }
    }

    expect(sem).toEqual([]);
    // Exceção que deixou de existir é lixo que esconderia uma rota nova de mesmo nome.
    expect(Object.keys(EXCECOES).filter((e) => !exceptionsUsadas.has(e))).toEqual([]);
  });
});
