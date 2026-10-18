# auth — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `auth`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Endpoints HTTP

| Método | Caminho | Entrada (Body/Params) | Saída | Status Codes |
|--------|---------|-----------------------|-------|--------------|
| `POST` | `/auth/login` | `LoginDto` (`email`, `senha`, `empresaAlias?`) | `{ accessToken, refreshToken, expiresIn, mustChangePassword }` | 200, 401, 403, 423 |
| `GET` | `/auth/empresa-branding` | Query: `alias` | `{ nome, alias, logoUrl, corPrimaria }` | 200, 404 |
| `POST` | `/auth/refresh` | `RefreshDto` (`refreshToken`) | `{ accessToken, refreshToken, expiresIn }` | 200, 401 |
| `POST` | `/auth/logout` | `RefreshDto` (`refreshToken`) | `{ success: true }` | 201 |
| `GET` | `/auth/me` | Bearer Token | `CurrentUserDto` (perfil, empresas, permissões, rota) | 200, 401 |
| `POST` | `/auth/switch-empresa` | `SwitchEmpresaDto` (`empresaId`) | `{ accessToken, refreshToken, expiresIn }` | 201, 401, 403 |
| `POST` | `/auth/suporte/:empresaId` | Param: `empresaId` | `{ accessToken, refreshToken, expiresIn }` | 201, 401, 403 |
| `PATCH` | `/auth/change-password` | `ChangePasswordDto` (`senhaAtual`, `novaSenha`) | `{ success: true }` | 200, 400, 401 |
| `PATCH` | `/auth/me/primeiro-acesso` | `CompleteFirstAccessDto` (nome, telefone, nascimento) | `CurrentUserDto` atualizado | 200, 400, 401 |
| `POST` | `/auth/me/foto` | Multipart: `file` (máx 2MB) | `CurrentUserDto` atualizado | 201, 400, 401 |
| `PATCH` | `/auth/me/avatar-padrao` | `AvatarPadraoDto` (`avatar`) | `CurrentUserDto` atualizado | 200, 400, 401 |
| `PATCH` | `/auth/me` | `UpdateOwnProfileDto` | `CurrentUserDto` atualizado | 200, 400, 401 |
| `PATCH` | `/auth/me/rotina-inicial` | `UpdateRotinaInicialDto` (`rotinaId`) | `CurrentUserDto` atualizado | 200, 400, 401 |

### Métodos e Funções Centrais

| Símbolo | Assinatura | Retorno | Observação |
|---------|-----------|---------|------------|
| `AuthService.login` | `(dto: LoginDto, meta: RequestMeta)` | `Promise<AuthTokensResult>` | Orquestra as 7 etapas de validação e abre sessão única |
| `AuthService.refresh` | `(dto: RefreshDto, meta: RequestMeta)` | `Promise<AuthTokensResult>` | Rotação estrita com busca por SHA-256 e teste de horário |
| `AuthService.buildAccessToken` | `(usuarioEmpresaId: string, empresaId: string, sessaoId: string)` | `Promise<{ accessToken: string, vinculo: any }>` | Calcula permissões filtradas e emite JWT |
| `AuthService.me` | `(usuarioId: string, empresaAtivaId: string)` | `Promise<CurrentUserResult>` | Recalcula permissões do zero e resolve tela inicial |
| `rotinaNoAr` | `(rotina: RotinaComArvore, daEmpresa: DesativadosDaEmpresa)` | `boolean` | Poda de permissões baseada no catálogo global e empresa |
| `precisaCompletarPrimeiroAcesso` | `(usuario: DadosPrimeiroAcesso, vinculo?: VinculoPrimeiroAcesso)` | `boolean` | Validação estrita via Zod mesmo após flag no banco |

## Fluxo Principal — Login (`login`)

1. **Validação de Existência e Ativação:** Busca usuário por e-mail com case-insensitive. Se não existir ou `ativo = false`, registra `login_falha` e lança `UnauthorizedException("Credenciais inválidas")`. 🟢 `auth.service.ts:73`
2. **Lockout Check:** Verifica se `bloqueadoAte` é maior que `now()`. Se sim, registra `login_bloqueado` e lança `HttpException("Conta temporariamente bloqueada", HttpStatus.LOCKED)` (423). 🟢 `auth.service.ts:76`
3. **Comparação de Senha:** Executa `bcrypt.compare(dto.senha, usuario.senhaHash)`. Se inválida:
   - Incrementa `tentativasFalhas`.
   - Se atingir limite da política, define `bloqueadoAte = agora + minutosBloqueio` e zera contador.
   - Registra auditoria e lança `UnauthorizedException("Credenciais inválidas")`. 🟢 `auth.service.ts:77-79`
4. **Resolução de Empresa e Alias:** Se informado `empresaAlias`, localiza a empresa sem filtro de situação para permitir detalhar motivo de suspensão (`motivoBloqueio`). Se não informado, recupera vínculo com a empresa padrão/mais antiga (`findVinculoAtivo`). 🟢 `auth.service.ts:80-84`
5. **Checagem de Expediente:** Invoca `horarios.verificar(usuarioId, empresaId)`. Se fora de turno ou em feriado cadastrado, registra `login_fora_horario` e lança `ForaDoExpedienteException`. 🟢 `auth.service.ts:85-87`
6. **Sessão Única:** Abre nova sessão via `acessos.abrirSessao(usuarioId, empresaId, meta)`. Chama `acessos.encerrarSessoes(usuarioId, sessaoId, MOTIVO_NOVO_ACESSO)` para derrubar imediatamente qualquer outra sessão aberta do usuário. 🟢 `auth.service.ts:88-91`
7. **Emissão de Credenciais:**
   - Monta access token com `buildAccessToken` (15m TTL).
   - Gera refresh token aleatório (`randomBytes(32).hex`), grava seu SHA-256 em `refresh_tokens` vinculado à sessão.
   - Atualiza `ultimoLogin`, zera `tentativasFalhas` e registra `login_sucesso`. 🟢 `auth.service.ts:92-96`

## Fluxos Alternativos e de Exceção

### 1. Renovação de Token (`refresh`)
- Recebe `refreshToken` em texto claro.
- Calcula digest SHA-256 e busca no banco.
- Se o registro estiver revogado ou a sessão vinculada tiver sido terminada com `MOTIVO_NOVO_ACESSO` ou `MOTIVO_DESCONECTADO`, lança `SessaoEncerradaException` explicitando o motivo. 🟢
- **Revoga o refresh token imediatamente** no banco de dados. 🟢
- Reavalia horário de trabalho. Se fora do expediente, chama `encerrarAcessoPorHorario` (revoga todos os tokens e derruba sessões) e lança exceção. 🟢
- Emite novo par de tokens mantendo a mesma sessão e empresa ativa. 🟢

### 2. Alternância de Empresa (`switchEmpresa`)
- Valida se o usuário autenticado possui vínculo ativo com a empresa alvo. Se não possuir, retorna 403 Forbidden. 🟢
- Não cria nova sessão: reutiliza o `sessaoId` existente para manter a continuidade do tempo logado. 🟢
- Emite novo access token com as permissões da nova empresa e novo refresh token rotacionado. 🟢

### 3. Upload de Fotografia de Perfil (`uploadOwnAvatar`)
- Recebe buffer do arquivo via `multer.memoryStorage()`.
- Valida o tamanho máximo (2 MB).
- Inspeciona os primeiros bytes do buffer (Magic Bytes):
  - PNG: `89 50 4E 47 0D 0A 1A 0A`
  - JPEG: `FF D8 FF`
  - WEBP: `RIFF` no offset 0 e `WEBP` no offset 8.
- Salva arquivo em `UPLOADS_DIR` com hash aleatório `randomBytes(16).hex`.
- Executa update no Prisma. Caso a transação falhe, dispara `unlink` do arquivo físico para não deixar lixo em disco. 🟢

## Dependências

- `PrismaService`: Acesso ao banco de dados Postgres com Row-Level Security e controle transacional.
- `JwtService`: Emissão e assinatura criptográfica dos tokens JWT.
- `PoliticaSenhaService`: Consulta da política de segurança vigente, histórico de hashes de senha e regras de lockout.
- `AcessosService`: Registro de eventos de auditoria e controle de sessões ativas (`abrirSessao`, `encerrarSessoes`).
- `HorarioTrabalhoService`: Validação de expediente corporativo e feriados por empresa.
- `SuporteAcessoService`: Validação de autorizações temporárias para suporte técnico concedidas por clientes.
- `@plataforma/contracts`: Contratos Zod para validação e tipagem estrita de DTOs de autenticação.

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Hash SHA-256 para Refresh Tokens:** Nunca armazenar refresh tokens em texto claro no Postgres | `apps/api/src/modules/auth/auth.service.ts:141-143` | 🟢 |
| **Payload Reduzido para Admins:** Usuários com perfil `sistemaBase` recebem `permissoes: []` no JWT | `apps/api/src/modules/auth/auth.service.ts:42-44` | 🟢 |
| **Poda de Permissões na Origem (`rotinaNoAr`):** Avaliação em cascata (catálogo x empresa) antes de emitir o token | `apps/api/src/modules/auth/auth.service.ts:117-128` | 🟢 |
| **Reaproveitamento de Sessão no Switch:** Troca de empresa mantém a mesma sessão de login ativa | `apps/api/src/modules/auth/auth.service.ts:117-120` | 🟢 |
| **Fallback com operador `||` em `JWT_ACCESS_EXPIRES_IN`:** Proteção contra variáveis vazias passadas pelo Portainer | `apps/api/src/modules/auth/auth.service.ts:49-51` | 🟢 |
| **Validação Binária de Uploads:** Detecção de tipo de mídia via magic numbers em memória | `apps/api/src/modules/auth/auth.service.ts:143-146` | 🟢 |

## Estado Interno e Sessão

- **Sessões (`sessoes`):** Armazena o registro de acesso do usuário, incluindo IP, User-Agent, empresa conectada, horário de início e término, e motivo de encerramento (`MOTIVO_LOGOUT`, `MOTIVO_NOVO_ACESSO`, `MOTIVO_DESCONECTADO`, `MOTIVO_EXPIRADO`).
- **Refresh Tokens (`refresh_tokens`):** Registro de tokens emitidos, com hash SHA-256 do token, expiração (7 dias), flag `revogado` e vínculo com o ID da sessão.
- **Contexto RLS:** `JwtStrategy` extrai o payload do access token e injeta `empresaId`, `usuarioId` e flag de plataforma no AsyncLocalStorage do `PrismaService`, garantindo que todas as queries subsequentes respeitem o isolamento do tenant.

## Observabilidade

- Todo evento de login emite registros na tabela de auditoria de acessos:
  - `login_sucesso`: Acesso completado com êxito.
  - `login_falha`: Credenciais incorretas ou usuário inativo.
  - `login_bloqueado`: Tentativa em conta temporariamente travada por lockout.
  - `login_fora_horario`: Bloqueio por jornada de trabalho ou feriado.
  - `sessao_substituida`: Notificação de que uma sessão anterior foi terminada por novo login.
- O endpoint de login possui rate limiting individual monitorado por IP (10 requisições/min).

## Riscos e Lacunas

- 🟡 **Revogação em Tempo Real do Access Token:** Como o JWT é stateless com validade de 15 minutos, a alteração de permissões ou desativação de usuário só terá efeito imediato após a expiração do token de 15m ou na próxima chamada de `refresh`.
- 🟢 **Conflito de Sessões Simultâneas:** O encerramento forçado de sessões anteriores (`MOTIVO_NOVO_ACESSO`) desconecta o usuário em outro dispositivo, o que é um comportamento de segurança deliberado e documentado.

