# auth — Requisitos da Unit (Autenticação e Sessão)

> Especificação formal de requisitos operacionais do módulo `auth`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

O módulo `auth` é a raiz de identidade, autorização e controle de sessão da plataforma comercial multi-tenant. É responsável por autenticar usuários, gerenciar o ciclo de vida de sessões únicas, emitir e rotacionar tokens JWT, alternar a empresa ativa mantendo o contexto de auditoria, garantir a poda dinâmica de permissões conforme ativação de módulos e fazer o enforcement de segurança (política de senha, bloqueio por força bruta, horário de expediente e validação estrita de uploads).

## Responsabilidades

- Autenticar usuários via e-mail e senha, com emissão de par de tokens (Access Token 15m e Refresh Token 7d). 🟢
- Garantir sessão única simultânea por usuário em toda a plataforma (`MOTIVO_NOVO_ACESSO`). 🟢
- Rotacionar estritamente refresh tokens gravados exclusivamente em formato hash SHA-256. 🟢
- Poda dinâmica de permissões no access token com base na árvore de catálogo e ativação por empresa (`rotinaNoAr`). 🟢
- Otimização do payload JWT para administradores da plataforma (`sistemaBase`), evitando HTTP 431. 🟢
- Trocar de empresa ativa mantendo a mesma sessão e tempo de uso contínuo. 🟢
- Bloquear acessos fora do horário de trabalho configurado ou em feriados da empresa ativa. 🟢
- Permitir acesso assistido de suporte autorizado pelo cliente para administradores da plataforma. 🟢
- Gerenciar o perfil do próprio usuário (troca de senha, primeiro acesso, avatar por assinatura binária e rotina inicial). 🟢
- Rastreamento e auditoria de cada evento de acesso (sucesso, falha, bloqueio, desconexão forçada). 🟢

## Regras de Negócio

- **RN-AUTH-01 (Sessão Única por Usuário):** Cada usuário pode manter apenas uma sessão ativa por vez. Quando um novo login é realizado com sucesso, todas as outras sessões abertas do usuário são sumariamente encerradas com o motivo `MOTIVO_NOVO_ACESSO`. Abas do mesmo navegador compartilham a sessão existente via storage do cliente. 🟢 `apps/api/src/modules/auth/auth.service.ts:88-91`
- **RN-AUTH-02 (Resposta Neutra para Falha de Credenciais):** Falhas por e-mail inexistente, senha incorreta ou usuário inativo retornam a mensagem idêntica `"Credenciais inválidas"` com status 401, impedindo a enumeração de contas válidas. 🟢 `apps/api/src/modules/auth/auth.service.ts:73-75`
- **RN-AUTH-03 (Lockout Progressivo e Bloqueio Temporário):** A cada falha de senha, o contador `tentativasFalhas` é incrementado. Ao alcançar `tentativasAntesBloqueio` definido na política de senha vigente, o campo `bloqueadoAte` é preenchido com `agora + minutosBloqueio` e requisições subsequentes são rejeitadas com HTTP 423 Locked. 🟢 `apps/api/src/modules/auth/auth.service.ts:76-79`
- **RN-AUTH-04 (Poda de Permissões Dinâmica — `rotinaNoAr`):** Uma permissão só é incluída no payload se a rotina, seu menu, o menu pai e o módulo estiverem ativos globalmente e não tiverem sido desativados pela empresa ativa (`empresa_modulos` / `empresa_menus`). Rotinas do módulo `seed-modulo-administracao` nunca são incluídas para perfis normais. 🟢 `apps/api/src/modules/auth/auth.service.ts:117-128`
- **RN-AUTH-05 (Otimização de JWT para Administrador do Sistema):** Usuários com perfil `sistemaBase: true` recebem `permissoes: []` no JWT. A autorização é concedida via flag `isAdmin` no `PermissionsGuard`, reduzindo o token de ~16 KB para ~400 bytes para evitar erro HTTP 431 (Request Header Fields Too Large). 🟢 `apps/api/src/modules/auth/auth.service.ts:42-44`
- **RN-AUTH-06 (Rotação Criptográfica de Refresh Token):** O refresh token recebido em texto claro é convertido em hash SHA-256 e imediatamente revogado no banco antes mesmo da emissão do novo par de tokens. Tokens revogados ou já utilizados são permanentemente inválidos. 🟢 `apps/api/src/modules/auth/auth.service.ts:106-107`
- **RN-AUTH-07 (Enforcement de Expediente no Refresh):** A renovação de tokens revalida o horário de expediente e feriados da empresa ativa. Se o usuário estiver fora do expediente, todos os refresh tokens e sessões ativas são revogados (`encerrarAcessoPorHorario`). 🟢 `apps/api/src/modules/auth/auth.service.ts:108-111`
- **RN-AUTH-08 (Validação de Avatar por Assinatura Binária):** Uploads de foto de perfil têm tamanho máximo de 2 MB e são validados inspecionando os *magic bytes* reais do buffer (PNG: `89 50 4E 47`, JPEG: `FF D8 FF`, WEBP: `RIFF...WEBP`). Nomes de arquivos são gerados via `randomBytes(16).hex`. Se a persistência falhar, o arquivo é deletado do disco imediatamente. 🟢 `apps/api/src/modules/auth/auth.service.ts:143-150`
- **RN-AUTH-09 (Propagação de Dados para Vendedores do Grupo):** Ao atualizar a data de nascimento no próprio perfil ou concluir o primeiro acesso, o valor é sincronizado com a tabela de vendedores em todas as empresas pertencentes ao mesmo grupo econômico. 🟢 `apps/api/src/modules/auth/auth.service.ts:34`
- **RN-AUTH-10 (Acesso como Suporte Autorizado):** Um administrador da plataforma só pode obter tokens de contexto de uma empresa cliente se houver uma autorização de suporte ativa, não expirada e concedida explicitamente por um administrador daquela empresa. Toda operação gera registros em auditoria de suporte. 🟢 `apps/api/src/modules/auth/auth.controller.ts:173-186`

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Autenticação por e-mail e senha com resolução automática da empresa ativa | Must | Retorna access token, refresh token, expiresIn e mustChangePassword |
| RF-02 | Login direcionado por alias de empresa na URL | Must | Valida se a empresa existe e está ativa; se suspensa/cancelada retorna o motivo exato |
| RF-03 | Renovação de tokens com revogação instantânea do refresh token usado | Must | Invalida o token anterior e emite novo par com verificação de horário |
| RF-04 | Logout com revogação explícita do refresh token | Must | Marca o token no banco como revogado e desvincula a sessão |
| RF-05 | Retorno de dados completos do usuário logado (`GET /auth/me`) | Must | Retorna perfil, empresas ativas, permissões calculadas dinamicamente e rota inicial |
| RF-06 | Alternância de empresa ativa (`POST /auth/switch-empresa`) | Must | Revalida vínculo ativo na empresa de destino e reemite tokens mantendo a mesma sessão |
| RF-07 | Acesso como suporte para administradores da plataforma | Should | Emite token com a empresa do cliente se e somente se houver autorização vigente |
| RF-08 | Troca da própria senha com validação de histórico | Must | Exige senha atual, valida complexidade contra política vigente e bloqueia reuso |
| RF-09 | Conclusão e reparo de primeiro acesso | Must | Valida schema Zod obrigatório e sincroniza telefone/data nascimento com cadastro de vendedor |
| RF-10 | Upload de fotografia de perfil com validação binária | Should | Rejeita arquivos > 2 MB e formatos fora de PNG, JPEG e WEBP via magic bytes |
| RF-11 | Seleção de avatar corporativo padrão | Should | Permite escolher entre opções pré-definidas de avatar institucional |
| RF-12 | Configuração da própria rotina inicial | Should | Permite selecionar rotina inicial desde que o usuário possua a permissão `.visualizar` |
| RF-13 | Consulta pública de branding da empresa por alias (`GET /auth/empresa-branding`) | Should | Retorna nome fantasia, logo e cor primária sem necessidade de autenticação |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Rate limit estrito de 10 requisições/min por IP na rota de login | `apps/api/src/modules/auth/auth.controller.ts:78` | 🟢 |
| Segurança | Custo de hash bcrypt fixado em 12 salt rounds | `apps/api/src/modules/auth/auth.service.ts:46` | 🟢 |
| Segurança | Refresh tokens persistidos unicamente como digest SHA-256 | `apps/api/src/modules/auth/auth.service.ts:141-143` | 🟢 |
| Segurança | Rejeição imediata no boot se `JWT_ACCESS_SECRET` não estiver definido | `apps/api/src/modules/auth/strategies/jwt.strategy.ts:25-30` | 🟢 |
| Performance | Supressão de lista de permissões em tokens de administradores (`sistemaBase`) | `apps/api/src/modules/auth/auth.service.ts:42-44` | 🟢 |
| Escalabilidade | Injeção de tenant no AsyncLocalStorage via JwtStrategy para RLS | `apps/api/src/modules/auth/strategies/jwt.strategy.ts:45-55` | 🟢 |
| Disponibilidade | Remoção imediata de arquivos órfãos em disco se falhar persistência no banco | `apps/api/src/modules/auth/auth.service.ts:148-150` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Login com credenciais válidas e sessão única
```gherkin
Dado que o usuário "vendedor@empresa.com" possui uma sessão ativa em outro navegador
Quando ele realiza login com e-mail e senha corretos na empresa "filial-sp"
Então a requisição retorna status 200 com access token e refresh token
E a sessão anterior é encerrada com o motivo "MOTIVO_NOVO_ACESSO"
E um evento "login_sucesso" é gravado no módulo de acessos
```

### Cenário 2: Falha por senha incorreta atingindo lockout
```gherkin
Dado que a política de senhas estabelece 5 tentativas antes do bloqueio
E o usuário já acumulou 4 tentativas falhas de login
Quando ele envia uma quinta tentativa com senha incorreta
Então a requisição retorna status 401 com "Credenciais inválidas"
E o usuário tem o campo "bloqueadoAte" configurado para o horário atual somado aos minutos de bloqueio
E a tentativa seguinte retorna status 423 Locked
```

### Cenário 3: Renovação de token fora do expediente
```gherkin
Dado que o usuário possui um refresh token válido emitido durante o turno de trabalho
E o expediente da empresa encerrou às 18:00
Quando o cliente envia uma requisição POST /auth/refresh às 18:05
Então o refresh token fornecido é revogado imediatamente
E o serviço executa "encerrarAcessoPorHorario" cancelando todas as sessões e tokens do usuário
E a requisição retorna exceção de fora do expediente
```

### Cenário 4: Upload de foto com extensão falsa
```gherkin
Dado que o usuário envia um arquivo executável renomeado para "foto.png"
Quando a requisição POST /auth/me/foto é processada
Então os magic bytes do buffer inicial não correspondem a PNG, JPEG ou WEBP
E a requisição é rejeitada com status 400 "Fotografia inválida"
E nenhum arquivo é gravado no disco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Login, refresh token e logout (RF-01 a RF-04) | Must | Caminho crítico e fundação de autenticação de toda a plataforma |
| Resolução de permissões dinâmicas e RLS (`me`) | Must | Necessário para renderização do frontend e isolamento multitenant |
| Alternância de empresa (`switch-empresa`) | Must | Essencial para usuários de grupos multi-empresa |
| Troca de senha e conformidade com política (RF-08) | Must | Requisito fundamental de segurança corporativa |
| Conclusão de primeiro acesso (RF-09) | Must | Bloqueador legal e contratual para utilização do sistema |
| Upload de foto e avatar padrão (RF-10, RF-11) | Should | Usabilidade e personalização visual da interface |
| Acesso como suporte (RF-07) | Should | Operação técnica assistida e suporte a incidentes |
| Configuração de rotina inicial (RF-12) | Could | Preferência ergonômica de navegação por usuário |

## Rastreabilidade de Código

| Arquivo | Função / Elemento | Cobertura |
|---------|-------------------|-----------|
| `apps/api/src/modules/auth/auth.controller.ts` | `AuthController` | 🟢 |
| `apps/api/src/modules/auth/auth.service.ts` | `AuthService.login` | 🟢 |
| `apps/api/src/modules/auth/auth.service.ts` | `AuthService.refresh` | 🟢 |
| `apps/api/src/modules/auth/auth.service.ts` | `AuthService.switchEmpresa` | 🟢 |
| `apps/api/src/modules/auth/auth.service.ts` | `AuthService.me` | 🟢 |
| `apps/api/src/modules/auth/auth.service.ts` | `AuthService.buildAccessToken` | 🟢 |
| `apps/api/src/modules/auth/auth.service.ts` | `rotinaNoAr` | 🟢 |
| `apps/api/src/modules/auth/auth.service.ts` | `AuthService.uploadOwnAvatar` | 🟢 |
| `apps/api/src/modules/auth/auth.service.ts` | `AuthService.changePassword` | 🟢 |
| `apps/api/src/modules/auth/strategies/jwt.strategy.ts` | `JwtStrategy.validate` | 🟢 |
| `apps/api/src/modules/auth/dto/auth.dto.ts` | DTOs de autenticação e validação Zod | 🟢 |

