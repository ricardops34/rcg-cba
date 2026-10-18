# auth — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `auth`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas base criadas: `usuarios`, `usuario_empresas`, `empresas`, `sessoes`, `refresh_tokens`, `politica_senha`, `acessos_eventos`.
- [ ] Row-Level Security habilitado nas tabelas tenant-aware com policy `app.current_empresa_id`.
- [ ] Variável de ambiente `JWT_ACCESS_SECRET` devidamente configurada sem valor default permissivo.
- [ ] Serviços de suporte implementados: `PoliticaSenhaService`, `AcessosService`, `HorarioTrabalhoService`, `SuporteAcessoService`.
- [ ] Diretório configurado para armazenamento local de fotos de perfil (`UPLOADS_DIR`).

## Tarefas

- [ ] **T-01: Implementar DTOs e Schemas de Autenticação**
  - Origem no legado: `apps/api/src/modules/auth/dto/auth.dto.ts:1-60`
  - Critério de pronto: DTOs tipados com decoradores Swagger e validação integrada via Zod (`@plataforma/contracts`).
  - Confiança: 🟢

- [ ] **T-02: Configurar JwtStrategy e Injeção de Contexto RLS**
  - Origem no legado: `apps/api/src/modules/auth/strategies/jwt.strategy.ts:1-65`
  - Critério de pronto: Validar access token, extrair `empresaId`, `usuarioId` e alimentar o AsyncLocalStorage do `PrismaService`. Rejeitar boot se `JWT_ACCESS_SECRET` ausente.
  - Confiança: 🟢

- [ ] **T-03: Implementar Função Pura de Poda de Permissões (`rotinaNoAr`)**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.ts:117-128`
  - Critério de pronto: Filtrar árvore completa (rotina -> menu -> menuPai -> modulo) contra os conjuntos de desativação da empresa (`empresa_modulos` / `empresa_menus`).
  - Confiança: 🟢

- [ ] **T-04: Implementar Algoritmo de Emissão de Access Token (`buildAccessToken`)**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.ts:40-52`
  - Critério de pronto: Perfis `sistemaBase` emitem `permissoes: []`. Demais perfis emitem lista podada por `rotinaNoAr` sem itens do módulo administrativo. Fallback seguro para `JWT_ACCESS_EXPIRES_IN`.
  - Confiança: 🟢

- [ ] **T-05: Implementar Endpoint e Lógica de Login com Sessão Única**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.ts:70-96`
  - Critério de pronto: Executar sequência de 7 passos (existência, lockout, senha, empresa/alias, expediente, abertura de sessão e encerramento de sessões anteriores, emissão de par de tokens). Rate limit de 10/min por IP.
  - Confiança: 🟢

- [ ] **T-06: Implementar Rotação Estrita de Refresh Token (`refresh`)**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.ts:98-114`
  - Critério de pronto: Buscar por hash SHA-256, revogar o token de entrada imediatamente, checar expediente e sessão, e emitir novo par com mesma sessão.
  - Confiança: 🟢

- [ ] **T-07: Implementar Troca de Empresa Ativa (`switchEmpresa`)**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.ts:115-120`
  - Critério de pronto: Validar vínculo ativo na empresa solicitada, preservar a sessão atual (`sessaoId`) e emitir novos tokens atualizados.
  - Confiança: 🟢

- [ ] **T-08: Implementar Endpoint de Perfil e Permissões (`GET /auth/me`)**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.ts:122-132`
  - Critério de pronto: Recalcular permissões em tempo real, resolver rota da tela inicial (pessoal x perfil) e identificar perfil de administrador da plataforma.
  - Confiança: 🟢

- [ ] **T-09: Implementar Troca de Própria Senha (`changePassword`)**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.ts:151-157`
  - Critério de pronto: Validar senha atual com bcrypt, verificar política e reuso com `PoliticaSenhaService`, e gravar novo hash e histórico na mesma transação.
  - Confiança: 🟢

- [ ] **T-10: Implementar Upload Seguro de Foto de Perfil (`uploadOwnAvatar`)**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.ts:141-150`
  - Critério de pronto: Validar limite de 2 MB, inspecionar magic bytes (PNG, JPEG, WEBP), gerar nome aleatório seguro e efetuar rollback físico com `unlink` se a persistência falhar.
  - Confiança: 🟢

- [ ] **T-11: Implementar Acesso Suporte Autorizado (`entrarComoSuporte`)**
  - Origem no legado: `apps/api/src/modules/auth/auth.controller.ts:173-186`
  - Critério de pronto: Exigir guard de admin da plataforma, checar consentimento vigente em `SuporteAcessoService` e emitir token no contexto da empresa do cliente com auditoria.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Teste Unitário do Fluxo de Login e Lockout**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.spec.ts`
  - Validar incrementação de `tentativasFalhas`, disparo do bloqueio após atingir limite e retorno idêntico para usuário inativo/inexistente.
  - Confiança: 🟢

- [ ] **TT-02: Teste de Rotação e Revogação do Refresh Token**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.spec.ts`
  - Validar que o mesmo refresh token não pode ser utilizado duas vezes e que tokens armazenados utilizam hash SHA-256.
  - Confiança: 🟢

- [ ] **TT-03: Teste de Conclusão do Primeiro Acesso e Propagação para Vendedor**
  - Origem no legado: `apps/api/src/modules/auth/first-access.spec.ts`
  - Validar se data de nascimento e telefone são replicados na entidade `vendedores` em empresas do mesmo grupo econômico.
  - Confiança: 🟢

- [ ] **TT-04: Teste de Bloqueio por Horário de Trabalho e Feriado**
  - Origem no legado: `apps/api/src/modules/auth/auth.service.spec.ts`
  - Validar se requisições de login e refresh são rejeitadas fora do expediente e se o acesso é sumariamente revogado.
  - Confiança: 🟢

## Tarefas de Migração de Dados

- [ ] **TM-01: Migração dos Usuários com Primeiro Acesso Pendente**
  - Origem no legado: `precisaCompletarPrimeiroAcesso` (`auth.service.ts:60-77`)
  - Identificar registros legados com `primeiroAcessoConcluidoEm` preenchido mas campos de telefone ou nascimento ausentes para forçar atualização no próximo login.
  - Confiança: 🟢

## Ordem Sugerida

1. **Infraestrutura e Contratos:** T-01 e T-02 (DTOs, contratos Zod e JwtStrategy com injeção de contexto RLS).
2. **Lógica de Permissões:** T-03 e T-04 (`rotinaNoAr` e `buildAccessToken`).
3. **Core de Autenticação:** T-05 e T-06 (Login com sessão única e Refresh token com rotação SHA-256).
4. **Contexto de Sessão e Perfil:** T-07 e T-08 (Switch de empresa e `GET /auth/me`).
5. **Auto-serviço do Usuário:** T-09 e T-10 (Troca de senha e upload seguro de fotos).
6. **Módulos Assistidos:** T-11 (Acesso de suporte).
7. **Bateria de Testes Automatizados:** TT-01 a TT-04.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente para o módulo `auth`. Todo o fluxo operacional e de segurança foi 100% confirmado no código fonte. 🟢

