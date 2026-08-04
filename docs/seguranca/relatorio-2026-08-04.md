# Relatório de auditoria de segurança — 2026-08-04

## Resumo

Auditoria do backend (`apps/api`) cobrindo controle de acesso, isolamento
multi-tenant (RLS), injeção de SQL, segredos, upload de arquivo, JWT,
rate limiting e headers de transporte, seguindo o checklist da skill
`security-audit` (`.claude/skills/security-audit/SKILL.md`, criada nesta
auditoria). Cobertura de guards/permissões, RLS e proteção contra SQL
injection já estava sólida. Foram encontradas e **corrigidas** 3 falhas
reais (1 alta, 2 médias) e 1 item de baixa severidade (documentação
desatualizada). Nenhuma falha crítica (bypass de autenticação ativo,
vazamento cross-tenant, RCE) foi encontrada na configuração atual — a
falha mais severa (JWT) era condicional a uma futura má-configuração, não
explorável hoje.

**3 corrigidas, 1 corrigida (doc), 0 pendentes.**

## Findings

### [HIGH] Path traversal no upload de logo da empresa
- **Local**: `apps/api/src/common/uploads/uploads.config.ts:40-44` (antes da correção), rota `POST /empresas/:id/logo` em `apps/api/src/modules/empresas/empresas.controller.ts:116-125`
- **Descrição**: o nome do arquivo gravado em disco era montado como `` `${req.params.id}-${Date.now()}${ext}` ``, onde `id` vem direto da rota (`@Param('id') id: string`, sem `ParseUUIDPipe` nem validação de formato) e `ext` vinha de `extname(file.originalname)` (nome de arquivo enviado pelo cliente). O multer **não sanitiza** o valor retornado pelo callback `filename` — se ele contiver sequências `../`, o `path.join(destino, filename)` interno do multer escreve fora do diretório de destino (`LOGOS_DIR`). Um `id` de rota malicioso (ex. via segmento percent-encoded `..%2F..%2Fetc`, que o Express decodifica para `../../etc` só depois de casar a rota) ou um `originalname` forjado poderiam gravar o arquivo em um caminho arbitrário dentro do container.
- **Impacto**: escrita de arquivo arbitrário no filesystem do container da API, limitada a usuários com a permissão `empresas.editar` (não é anônimo, mas é uma permissão de negócio comum, não equivalente a admin de sistema). Dependendo do que mais existe gravável/executável no container, isso é um primitivo sério.
- **Correção**: o nome do arquivo agora é sempre gerado no servidor via `randomUUID()` (node:crypto) + extensão fixa mapeada 1:1 a partir do MIME já validado pelo `fileFilter` (`EXT_POR_MIME`), nunca a partir de `req.params.id` ou `file.originalname`. Nenhum input do cliente participa da construção do nome/caminho do arquivo.
- **Status**: **Corrigido** — `apps/api/src/common/uploads/uploads.config.ts`. Build (`nest build`) validado limpo.

### [MEDIUM] Fallback hardcoded no segredo de verificação do JWT
- **Local**: `apps/api/src/modules/auth/strategies/jwt.strategy.ts:21` (antes da correção)
- **Descrição**: a verificação do access token usava `secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'dev-secret'`. O lado de **assinatura** (`auth.service.ts:69`) já não tinha fallback — só o lado de verificação. Se `JWT_ACCESS_SECRET` alguma vez não estiver setado num ambiente real (variável ausente, nome errado, falha de integração com secret manager — falhas de operação plausíveis), o verificador aceitaria silenciosamente qualquer token assinado com a string literal `'dev-secret'`, que é pública neste repositório.
- **Impacto**: sob essa má-configuração específica, um atacante que conheça (ou apenas leia o código-fonte público) essa string poderia forjar um token com `isAdmin: true` e `permissoes` completas — bypass total de autenticação/autorização. Não é explorável na configuração atual (a env var está setada em todos os ambientes verificados), mas era uma bomba-relógio de configuração.
- **Correção**: removido o fallback; o construtor de `JwtStrategy` agora lança um erro explícito no boot (`JWT_ACCESS_SECRET não configurado`) se a variável não estiver setada, falhando alto e cedo em vez de aceitar silenciosamente um segredo conhecido.
- **Status**: **Corrigido** — `apps/api/src/modules/auth/strategies/jwt.strategy.ts`. Boot do container `api` confirmado funcionando normalmente após a mudança (a env var está corretamente setada em dev).

### [MEDIUM] Rate limiting configurado mas nunca aplicado
- **Local**: `apps/api/src/app.module.ts:32` (antes da correção)
- **Descrição**: `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }])` estava importado, mas nunca havia um `APP_GUARD`/`ThrottlerGuard` de fato vinculado — nem globalmente, nem em nenhuma rota (`@UseGuards(ThrottlerGuard)`/`@Throttle` inexistentes em todo `apps/api/src`). O módulo configurado sem o guard não tem efeito nenhum em runtime.
- **Impacto**: nenhuma proteção por IP contra força bruta/credential stuffing em nenhuma rota, incluindo `POST /auth/login` — o único freio existente era o lockout por conta (`tentativasFalhas`/`bloqueadoAte`), que não impede tentar muitas contas diferentes a partir do mesmo IP.
- **Correção**: `ThrottlerGuard` registrado globalmente via `APP_GUARD` em `app.module.ts`. Adicionalmente, `POST /auth/login` recebeu um throttle específico mais rígido (`@Throttle({ default: { limit: 10, ttl: 60_000 } })`) já que o default global (200/min) é frouxo demais especificamente para login.
- **Status**: **Corrigido** — `apps/api/src/app.module.ts`, `apps/api/src/modules/auth/auth.controller.ts`. **Verificado ao vivo**: requisições autenticadas comuns agora retornam headers `X-RateLimit-Limit`/`X-RateLimit-Remaining`; 12 tentativas de login em sequência retornaram `401` nas 10 primeiras e `429 Too Many Requests` na 11ª e 12ª.

### [LOW] Documentação de cobertura de RLS desatualizada
- **Local**: `apps/api/prisma/migrations/README.md` ("Cobertura atual")
- **Descrição**: `objetivos_vendedor_mes` e `objetivos_vendedor_categoria` têm RLS habilitada de fato (migration `20260729024239_objetivos`), mas não constavam na lista "Com RLS" do README — nem na lista de exceções. Não é uma falha de proteção real (o banco está protegido), é um risco de processo: esse README é o checklist que se consulta pra saber "esquecemos RLS em algo?", e uma lista incompleta pode mascarar uma lacuna futura real.
- **Correção**: lista atualizada para incluir as duas tabelas.
- **Status**: **Corrigido** — `apps/api/prisma/migrations/README.md`.

## Checklist executado

| Seção | Resultado |
|---|---|
| A. AuthN/AuthZ | CONCERN → Corrigido (JWT fallback, rate limiting) |
| B. Isolamento multi-tenant (RLS) | OK (com correção de documentação) |
| C. Injeção de SQL | OK — todo `$queryRaw`/`$executeRaw` é parametrizado via tagged template; zero uso de `*Unsafe`; sort/filtros dinâmicos usam whitelist fixa (`clientes.service.ts`) |
| D. Segredos & configuração | OK — nenhum segredo real commitado; `.env` real fora do git; placeholders óbvios em `.env.example`/prod example |
| E. Upload de arquivo | CONCERN → Corrigido (path traversal) |
| F. Transporte/headers | OK — `helmet()` aplicado, CORS restrito a origem específica via env (nunca wildcard), CSP ativa. `/api/docs` (Swagger) fica publicamente acessível sem guard — comum em ferramenta interna, mas vale decisão consciente antes de produção |
| G. Escopo de negócio (vendedor/cliente/oportunidade) | OK — módulo novo (`orcamentos`, construído nesta sessão) já segue o padrão `garantirClienteNoEscopo`/`garantirVendedorNoEscopo`/`garantirOportunidadeNoEscopo` |
| H. Verificação ao vivo | Feita para rate limiting (429 confirmado) e guard de autenticação (401 sem token confirmado) |

## Não corrigido / fora de escopo

- **Swagger `/api/docs` público**: decisão consciente pendente para produção (bloquear por rede/IP allowlist ou exigir auth), não uma falha de código.
- Nenhum outro item pendente.
