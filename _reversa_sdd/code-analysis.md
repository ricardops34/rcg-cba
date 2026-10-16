# Análise de Código — plataforma-comercial (rcg)

> Gerado pelo Archaeologist. Nível de documentação: **detalhado**.
> Escala de confiança: 🟢 CONFIRMADO (extraído direto do código) · 🟡 INFERIDO (padrão, pode estar errado) · 🔴 LACUNA (requer validação humana)

---

## Módulo `auth`

**Caminho:** `apps/api/src/modules/auth/`
**Arquivos:** `auth.module.ts`, `auth.controller.ts`, `auth.service.ts`, `dto/auth.dto.ts`, `strategies/jwt.strategy.ts`, `auth.service.spec.ts`, `auth-whatsapp.spec.ts`, `first-access.spec.ts`

### 1. Responsabilidade 🟢

Autenticação (login/logout/refresh), sessão única por usuário, emissão e validação de
JWT, troca de empresa ativa, primeiro acesso, troca de senha e dados do próprio perfil
(`me`, avatar, tela inicial). É o módulo que resolve, a cada requisição, **quem** é o
usuário e **o que** ele pode fazer (lista de permissões embutida no token).

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `login(input, meta)` | email, senha, alias opcional da empresa | `{accessToken, refreshToken, expiresIn, mustChangePassword}` | Alta — 7 pontos de falha sequenciais |
| `refresh(input, meta)` | refreshToken | novo par de tokens | Alta — valida sessão, expiração, revogação, expediente |
| `logout(input)` | refreshToken | `{success}` | Baixa |
| `switchEmpresa(usuarioId, empresaId, meta, sessaoAtual?)` | ids | novo par de tokens | Média |
| `me(usuarioId, empresaAtivaId)` | ids | perfil completo + permissões + empresas vinculadas | Alta — cálculo de permissões e rota inicial |
| `completeFirstAccess(usuarioId, empresaId, input)` | dados pessoais | perfil atualizado (via `me`) | Média — propaga para `vendedor` |
| `changePassword(usuarioId, input)` | senha atual + nova | `{success}` | Média — valida política + histórico |
| `buildAccessToken(usuarioEmpresaId, empresaId, sessaoId)` (privado) | ids | `{accessToken, vinculo}` | Alta — monta a lista de permissões |
| `computeMustChangePassword(usuario)` (privado) | usuário | boolean | Baixa |
| `uploadOwnAvatar` / `selectDefaultAvatar` | arquivo / enum | `me()` atualizado | Baixa/Média |
| `updateOwnProfile` / `gravarDataNascimento` | campos do perfil | `me()` atualizado | Média — propaga data de nascimento para `vendedor` em todas empresas do grupo |
| `updateRotinaInicial` | rotinaId | `me()` atualizado | Média — valida permissão `.visualizar` |
| `telasIniciais` | ids | lista de rotinas elegíveis como tela inicial | Média |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Montagem do token de acesso (`buildAccessToken`) 🟢

- Perfis com `sistemaBase: true` (admin do sistema) recebem `permissoes: []` no payload —
  o `PermissionsGuard` libera por `isAdmin`, sem precisar embutir a lista. Isso reduz o
  JWT de ~16 KB para ~400 bytes (comentário explícito no código: evita erro HTTP 431).
- Para os demais perfis, a lista de permissões é filtrada por `rotinaNoAr()` (ver 3.2) e
  nunca inclui rotinas do módulo `seed-modulo-administracao` (constante
  `MODULO_ADMINISTRACAO_ID`), mesmo que o perfil tenha a permissão cadastrada.
- Formato de cada item: `"<codigo-da-rotina>.<acao>"`.
- `expiresIn` do access token lê `JWT_ACCESS_EXPIRES_IN` com fallback `'15m'` usando `||`
  (não `??`) de propósito — comentário no código explica que o Portainer sempre define a
  variável, mas pode chegar vazia (`""`), que `??` aceitaria e o `jsonwebtoken` rejeitaria.

#### 3.2 Visibilidade de rotina (`rotinaNoAr`) 🟢

Uma rotina só é incluída na lista de permissões se **todos** estes forem verdadeiros:
1. `rotina.ativo`
2. `menu.ativo`
3. `menu.modulo.ativo` (catálogo global, controlado pelo administrador da plataforma)
4. `menuPai.ativo` (se houver menu pai)
5. Módulo não desligado pela empresa (`empresaModulo.ativo = false`)
6. Menu não desligado pela empresa (`empresaMenu.ativo = false`)
7. Menu pai não desligado pela empresa

Comentário no código explicita a motivação: desligar um módulo na tela de Estrutura
precisa remover o acesso de verdade (a URL digitada à mão não passa pelo menu), então a
poda acontece na origem da lista de permissões — a API responde 403 e o item some do
menu lateral com uma regra só. Quem já está logado mantém o token antigo até expirar
(15 min).

#### 3.3 Login (`login`) — sequência de validações 🟢

Ordem exata das checagens (interrompe no primeiro erro):
1. Usuário existe e está ativo → senão `UnauthorizedException` (mensagem genérica
   "Credenciais inválidas" tanto para e-mail inexistente quanto usuário inativo —
   não revela qual).
2. `bloqueadoAte` no futuro → `HttpException` 423 LOCKED.
3. Senha correta (`bcrypt.compare`) → se não, incrementa `tentativasFalhas`; ao atingir
   `tentativasAntesBloqueio` (da política de senha vigente) zera o contador e seta
   `bloqueadoAte = agora + minutosBloqueio`.
4. Se veio `empresaAlias` na URL: busca a empresa **sem filtrar situação** e só então
   aplica `motivoBloqueio()` — comentário explica que filtrar direto devolveria "sem
   acesso" para uma empresa suspensa, mascarando a causa real.
5. Vínculo ativo do usuário com a empresa (`findVinculoAtivo`) — resolvido pelo alias ou
   pela primeira empresa ativa (`orderBy createdAt asc`).
6. Expediente de trabalho (`horarios.verificar`) — avaliado **depois** da senha (para não
   revelar nada a quem errou a senha) e **depois** de saber a empresa (feriado é por
   empresa).
7. Abre sessão (`acessos.abrirSessao`) e **encerra todas as outras sessões abertas do
   usuário** (`encerrarSessoes`, motivo `MOTIVO_NOVO_ACESSO`) — regra de **sessão única
   por usuário** (decisão datada de 30/09/2026 no comentário). Abas do mesmo navegador
   compartilham a mesma sessão.
8. Emite access + refresh token, recalcula `mustChangePassword`, zera tentativas falhas e
   registra `login_sucesso`.

Todo caminho de falha grava um evento em `acessos` (`login_falha`, `login_bloqueado`,
`login_fora_horario`) — rastro de auditoria completo mesmo em tentativas negadas.

#### 3.4 Refresh token (`refresh`) 🟢

- Hash do token recebido (SHA-256, `hashToken`) é a chave de busca — o token em texto
  claro nunca é persistido.
- Se a sessão vinculada ao refresh token foi encerrada por `MOTIVO_NOVO_ACESSO` ou
  `MOTIVO_DESCONECTADO`, lança `SessaoEncerradaException` com o motivo (em vez de um
  "token inválido" genérico) — permite à UI explicar por que caiu.
- Valida existência, não-revogação e não-expiração do token armazenado.
- **Revoga o token usado imediatamente**, mesmo antes de validar expediente — rotação
  estrita, sem reuso possível em nenhum cenário.
- Reavalia expediente de trabalho; se fora, chama `encerrarAcessoPorHorario` (revoga todos
  os refresh tokens abertos do usuário + encerra sessões) — comentário explica que, sem
  essa trava, bastaria manter a aba aberta para renovar indefinidamente após o fim do
  turno (a rota de refresh não passa pelo `JwtAuthGuard`).
- Mantém a mesma empresa ativa da sessão original; só cai para "primeira empresa
  disponível" se aquele vínculo específico não existir mais.

#### 3.5 Sessão única / troca de empresa (`switchEmpresa`) 🟢

Trocar de empresa **não abre uma nova sessão** — reaproveita a sessão do token atual
(já validada pelo `JwtAuthGuard`); token legado sem `sid` cai na última sessão aberta do
usuário, e só abre uma nova se não houver nenhuma. Isso mantém o tempo de uso contínuo
na tela de Acessos mesmo ao trocar de empresa.

#### 3.6 Cálculo de `me()` 🟢

- Permissões recalculadas do zero a cada chamada (não reaproveita o token) — garante que
  mudanças de perfil/módulo desligado refletem sem precisar de novo login.
- `rotinaInicialRota`: usa a escolha pessoal do usuário (`vinculo.rotinaInicial`) **se**
  ele ainda tiver a permissão `.visualizar` sobre ela; caso contrário cai para a rotina
  inicial padrão do perfil. A gravação da escolha pessoal não é apagada quando perde
  validade temporariamente — volta a valer se o acesso for restaurado.
- `administradorPlataforma` só é `true` se houver empresa ativa com vínculo (`ativo`) —
  comentário reforça: sem acesso à empresa ativa, nenhuma autoridade.

#### 3.7 Primeiro acesso incompleto (`precisaCompletarPrimeiroAcesso`) 🟢

Função pura exportada (fora da classe). Não basta checar
`primeiroAcessoConcluidoEm IS NOT NULL`: usuários migrados antes da introdução do fluxo
podem ter o marco preenchido mas faltar telefone/data de nascimento. A função valida
reaplicando `completeFirstAccessSchema` (Zod) sobre os dados atuais — se o schema rejeita,
o formulário volta a aparecer mesmo com o marco já setado.

#### 3.8 Upload de avatar (`uploadOwnAvatar`) 🟢

- Limite de 2 MB, validado por **assinatura binária** do arquivo (magic bytes), não pela
  extensão declarada: PNG (`89 50 4E 47 0D 0A 1A 0A`), JPEG (`FF D8 FF`), WEBP (`RIFF` +
  `WEBP` nos offsets corretos). Qualquer outro formato é rejeitado com 400.
- Nome do arquivo gerado por `randomBytes(16).toString('hex')` — sem relação com o nome
  original, evita colisão e path traversal.
- Se a escrita no banco falhar após o arquivo já ter sido salvo em disco, o arquivo é
  removido (`unlink`) antes de repropagar o erro — evita arquivo orfão.

#### 3.9 Troca de senha (`changePassword`) 🟢

Exige a senha atual (bcrypt.compare), delega a validação da política e do reuso para
`PoliticaSenhaService` (`validarSenhaDoUsuario`, `validarReuso`), grava o histórico da
senha antiga **dentro da mesma transação** que grava a nova — garante consistência entre
histórico e senha vigente mesmo em falha no meio do processo.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `auth`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `SALT_ROUNDS` | 12 | custo do bcrypt para hash de senha |
| `REFRESH_TTL_MS` | 7 dias | validade do refresh token |
| `MODULO_ADMINISTRACAO_ID` | `'seed-modulo-administracao'` | id fixo (seed) excluído da lista de permissões de não-admins |
| `JWT_ACCESS_SECRET` (env) | obrigatória, sem fallback | falha no boot se ausente (ver `jwt.strategy.ts`) |
| `JWT_ACCESS_EXPIRES_IN` (env) | fallback `'15m'` | TTL do access token |
| Access token TTL | 15 minutos (hardcoded em `expiresIn: 15 * 60` nas respostas) | |

### 6. Segurança 🟢

- `JwtStrategy.validate` popula o `contextoBanco()` (AsyncLocalStorage) com
  `empresaId`, `plataforma` (modo sistema) e `usuarioId` — é o que faz o `PrismaService`
  aplicar a policy de RLS correta em toda a cadeia de serviços da requisição, sem precisar
  passar esses valores explicitamente por parâmetro.
- `JWT_ACCESS_SECRET` sem valor default — falha alto e cedo no boot (`throw` no
  constructor da strategy) em vez de aceitar um secret público conhecido.
- Rate limit dedicado em `/auth/login`: 10 tentativas/min por IP (mais rígido que o
  default global de 200/min) — cobre credential stuffing distribuído entre contas, como
  complemento ao lockout por conta já existente.

### 7. Dependências do módulo 🟢

`PrismaService`, `JwtService` (`@nestjs/jwt`), `PoliticaSenhaService`, `AcessosService`,
`HorarioTrabalhoService`, contrato `@plataforma/contracts` (schemas Zod de input/output),
`gravarWhatsappDoUsuario` (helper compartilhado em `common/usuarios`).

### 8. Cobertura de testes 🟢

3 arquivos de spec: `auth.service.spec.ts`, `auth-whatsapp.spec.ts`, `first-access.spec.ts`.

---

## Módulo `clientes`

**Caminho:** `apps/api/src/modules/clientes/`
**Arquivos (18):** `clientes.module.ts`, `clientes.controller.ts`, `clientes.service.ts`
(1627 linhas), `cliente-alteracoes.controller.ts`, `cliente-alteracoes.service.ts` (954
linhas), `cliente-cnaes.controller.ts`, `cliente-cnaes.service.ts`,
`clientes-receita-lote.service.ts` (511 linhas), `comodato-baixas.controller.ts`,
`comodato-baixas.service.ts`, `comodato-sql.ts`, `enriquecimento.service.ts`,
`endereco-equivalente.ts`, `registrar-atividade-alteracao-cliente.ts`, DTOs (4 arquivos),
3 arquivos de spec.

### 1. Responsabilidade 🟢

É o módulo mais extenso do sistema (quase 5.000 linhas). Cobre: CRUD de cliente com
escopo hierárquico de carteira, fila de aprovação de alterações cadastrais (manual, ERP,
Receita Federal, agente de IA), enriquecimento via Receita Federal (MinhaReceita), CNAEs
do cliente, Posição de Cliente (tela agregada de vendas/títulos/comodato/mix), e baixas de
equipamento em comodato.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Serviço | Responsabilidade |
|---|---|
| `ClientesService` | CRUD, Posição de Cliente, mix de produtos, listagem com filtros avançados, titularidade (anti-duplicidade), escopos de filtro (vendedor/UF/município) |
| `ClienteAlteracoesService` | Fila de aprovação de alterações (diff, aplicação, histórico, aprovação campo a campo, envio ao ERP) |
| `EnriquecimentoService` | Consulta de CNPJ na MinhaReceita (API pública) e normalização do retorno |
| `ClientesReceitaLoteService` | Atualização em lote de clientes pela Receita, em background, com regra de preenchimento vs. proposta |
| `ClienteCnaesService` | CRUD dos vínculos cliente×CNAE, incluindo CNAE principal |
| `ComodatoBaixasService` | Baixa/desfazimento de saldo de equipamento em comodato |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Escopo de carteira (hierárquico) 🟢

Praticamente toda consulta do módulo passa por `resolverEscopoVendedores()` (helper
compartilhado em `common/escopo/escopo-vendedores`, usado também por Notas de
Saída/Títulos a Receber). Retorna `null` (sem restrição, ex. admin) ou uma lista de
`vendedorId` alcançáveis pelo usuário — vendedor vê só a própria carteira,
supervisor/gerente veem o time. Clientes fora da carteira respondem **404** (nunca 403) —
política deliberada: não confirmar nem a existência do registro para quem está fora do
escopo. 🟢

#### 3.2 Exceção deliberada: `verificarTitularidade` e `titularidadePorCnpj` 🟢

Duas únicas rotas do módulo que **ignoram o escopo de propósito**: resolvem "este cliente
já existe, e é de quem?" sem filtrar por carteira — para o vendedor não prospectar um
cliente que já é de um colega. Em compensação, a resposta é deliberadamente pobre: nunca
devolve valores, contato, histórico; `clienteId` (a chave de qualquer outra ferramenta) só
sai quando o cliente está de fato no escopo de quem perguntou. Comentário explícito no
código alerta que qualquer campo novo ali "vira dado de carteira alheia visível".

#### 3.3 Fila de aprovação de alterações (`ClienteAlteracoesService`) 🟢

- `calcularDiff`: compara só os ~34 campos de `CAMPOS_ACOMPANHADOS` (+ 2 campos virtuais
  `cnaes`/`cnaePrincipal`) entre o cliente atual e o payload; ignora campo ausente do
  payload (update parcial) e usa `mesmoValor()` para não considerar alteração diferenças
  de grafia (endereço, telefone, texto livre — ver 3.4).
- Quem tem `clientes.aprovar` (ou `isAdmin`) aplica a mudança **na hora**, mas a
  solicitação ainda é criada com `status: 'aprovada'` e `analisadoPor = autorId` — todo
  caminho fica no mesmo rastro de auditoria, sem bypass silencioso.
- Sem permissão de aprovar: cria/atualiza uma `ClienteAlteracao` pendente. Dedupe por
  `(empresaId, clienteId, origem, status='pendente')` — reenvio do ERP com o mesmo
  cadastro atualiza a pendência existente em vez de empilhar.
- `aprovar(id, campos?)`: aprovação **campo a campo**. Campos fora da lista escolhida vão
  para o histórico como `status: 'reprovado'` (não descartados em silêncio). Antes de
  aplicar, revalida que o valor atual do cliente ainda bate com o `de` do diff
  (`conflitos`) — se o cadastro mudou entre a solicitação e a aprovação, lança
  `ConflictException` em vez de sobrescrever às cegas.
- `aplicarNoCliente`: ponto único onde o cadastro muda de verdade — por isso é também
  onde nasce o item da fila de envio ao ERP (`enfileirarEnvioErp`) e a notificação de
  "cliente entrou na sua carteira" quando `vendedorId` muda.
- CNAEs no diff **só acrescentam** (nunca removem) — decisão deliberada: sincronizar
  apagando o que ficou de fora arriscaria remover um ramo cadastrado manualmente que a
  Receita não conhece.

#### 3.4 Equivalência de endereço/telefone/texto (`endereco-equivalente.ts`) 🟢

Normaliza para comparação: remove acento (NFD + regex `\p{M}`), maiúsculas, remove
pontuação, abrevia tipo de logradouro ("AVENIDA" → "AV.") via tabela de 11 tipos
conhecidos com múltiplas grafias cada. Telefone compara sem o zero do DDD. Motivação
explícita: sem essa equivalência, a consulta à Receita Federal propunha "mudar" quase
todo cadastro só por diferença de grafia.

#### 3.5 Atualização pela Receita Federal — regra por campo 🟢

Mesma regra usada tanto na consulta de 1 cliente (`ClientesService.atualizarPelaReceita`)
quanto no lote (`ClientesReceitaLoteService.aplicarReceita`):
- Campo **vazio** no cadastro → preenche direto (autoaprovado), **exceto** se o campo
  estiver travado na config da empresa (`ClienteCampoConfigService`), caso em que vira
  proposta mesmo estando vazio.
- Campo **com valor diferente** (após normalização) → vira proposta na fila.
- Campo que a Receita devolve vazio nunca é usado para apagar valor existente.
- CNAEs: cliente sem nenhum CNAE recebe principal + secundários direto; cliente com
  CNAEs recebe a união como proposta (nunca substituição).
- Código CNAE sem referência local (sync do IBGE atrasado) não vira vínculo — aparece como
  aviso (`cnaesSemReferencia`) em vez de desaparecer silenciosamente.

#### 3.6 Lote de atualização pela Receita (`ClientesReceitaLoteService`) 🟢

- Processamento assíncrono "fire and forget" (`void this.executar(...)`), uma execução
  por empresa (índice único — segunda tentativa concorrente recebe 409).
- Execução "rodando" há mais de 3h é considerada órfã (provável reinício da API) e marcada
  como falha ao iniciar uma nova.
- Entre clientes: 1s de cortesia com o serviço público; em falha, 1 nova tentativa após
  10s; 20 falhas consecutivas interrompem o lote inteiro (fonte externa indisponível).
- Progresso gravado a cada 10 clientes processados, para a tela acompanhar.
- Ao final, gera **uma única notificação** resumindo o resultado (nunca uma atividade de
  agenda por cliente — isso inundaria a agenda de quem aprova).

#### 3.7 Posição de Cliente (`posicao`) 🟢

Tela agregada: cliente + notas de venda (`NOTA_DE_VENDA`: ativa, não-comodato, tipo 'N',
com condição de pagamento) + comodatos + devoluções (tipo 'D') + títulos a receber (com
status recalculado via calendário útil da empresa) + mix de produtos + equipamentos em
comodato + conversas de WhatsApp (se o usuário tiver permissão). Nota inativa/cancelada no
ERP nunca entra em nenhuma aba — comentário no código menciona "o legado tem muita nota
inativa zerada". Devolução **não abate** `totalComprado` (quem abate é o `vlrDev` da
própria nota, para não contar a mesma devolução duas vezes).

#### 3.8 Equipamentos em comodato — saldo e aviso "sem consumo" 🟢

`comodato-sql.ts` centraliza 4 expressões SQL reaproveitadas por 3 consumidores (listagem,
aba Equipamentos, ferramenta do agente) para nunca divergirem:
- `saldoComodatoSql`: enviado (remessa) − devolvido (retorno) − baixado (`ComodatoBaixa`
  vigente).
- `comprouAplicavelSql`: cliente comprou algum produto "aplicável" ao equipamento
  (`produto_relacionados.tipo='aplicacao'`) nos últimos 30 dias — conta qualquer nota
  normal, inclusive bonificação.
- `comodatoSemConsumoSql`: equipamento ativo com aplicáveis cadastrados, em poder do
  cliente, sem nenhuma compra aplicável no período. Reescrita deliberadamente como
  `cliente.id IN (subquery sem correlação)` em vez de `EXISTS` correlacionado por
  performance: a versão correlacionada levava 5,9s na listagem e estourava o timeout de
  5s da transação.
- `comodatoEmPoderSql`: saldo positivo de qualquer produto saído em remessa, com ou sem
  aplicáveis cadastrados — a base de "comodato sem compra" mesmo antes de existir cadastro
  de aplicáveis.
- Baixa de comodato (`ComodatoBaixasService`) zera o **saldo inteiro atual** do produto no
  cliente (não uma quantidade parcial); remessa futura forma saldo novo. Baixar/desfazer
  grava uma `Atividade` já concluída no histórico do vendedor titular do cliente (se
  houver).

#### 3.9 Listagem de Posição de Cliente — SQL bruto para ordenação por coluna agregada 🟢

`listagemPosicao` monta a query inteira em `Prisma.sql` (não query builder): colunas como
venda dos últimos 30/90 dias são agregações calculadas ao vivo, e o Prisma não suporta
`ORDER BY` por coluna agregada antes do `LIMIT`. `sortBy`/condições de filtro usam
whitelists explícitas (`LISTAGEM_POSICAO_SORT_EXPR`, `SORT_FIELDS`) — nunca interpola
entrada do usuário direto na query.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `clientes`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `NOTA_DE_VENDA` / `NOTA_DE_VENDA_SQL` | ativa, não-comodato, tipo 'N', com condição de pagamento | definição única de "venda" em Posição de Cliente e Consultas |
| `CAMPOS_ACOMPANHADOS` | ~34 campos | campos do cliente monitorados pela fila de aprovação |
| `CAMPOS_ENVIO_ERP` | mapa campo→nome ERP | whitelist do que volta à SA1 (BJPLA004) |
| `COMODATO_DIAS_SEM_CONSUMO` | 30 dias | janela do aviso "sem consumo" |
| `INTERVALO_MS` (lote Receita) | 1000ms | cortesia entre chamadas à MinhaReceita |
| `MAX_FALHAS_SEGUIDAS` (lote Receita) | 20 | aborta o lote |
| `EXECUCAO_ORFA_MS` | 3h | marca execução travada como falha |

### 6. Segurança / integridade 🟢

- Escopo de carteira aplicado em **toda** consulta/mutação (exceto as duas exceções
  deliberadas e documentadas da seção 3.2).
- Reforço server-side da configuração de campos editáveis
  (`ClienteCampoConfigService`) em `update`, `ClienteCnaesService` e na aplicação da
  Receita — travar um campo na tela não é controle de acesso; a trava real é no serviço.
- Cliente de origem ERP (tem `chave` ou `codigoErp`) não pode ser excluído pela API —
  só inativado — porque a próxima carga do ERP o traria de volta e órfãos (orçamento,
  título) perderiam o cadastro.
- `titularidadePorCnpj` usa `regexp_replace` no SQL para comparar CNPJ por dígitos,
  evitando falso-negativo por máscara.

### 7. Dependências do módulo 🟢

`PrismaService`, `ClienteCampoConfigService`, `ClienteAlteracoesService`,
`EnriquecimentoService`, `ClientesReceitaLoteService`, `ExternalHttpService` (chamada à
MinhaReceita), `resolverEscopoVendedores`/`combinarFiltroVendedor` (common/escopo),
`calcularStatusTituloReceber`/`podeEmitirBoleto` (titulos-receber), `comFlagXml`
(notas-saida), `resolverTabelaPrecoCliente` (common/precos), `sessaoDoUsuarioWhere`
(whatsapp), `registrarNotificacao` (notificacoes), `@plataforma/contracts`.

### 8. Cobertura de testes 🟢

3 arquivos de spec: `cliente-alteracoes.diff.spec.ts` (regras de diff/equivalência),
`endereco-equivalente.spec.ts`.

---

## Módulo `empresas`

**Caminho:** `apps/api/src/modules/empresas/`
**Arquivos:** `empresas.module.ts`, `empresas.controller.ts` (256 linhas),
`empresas.service.ts` (321 linhas), `dto/empresa.dto.ts`, `empresa-plano-grupo.spec.ts`.

### 1. Responsabilidade 🟢

Cadastro de empresas (tenants). Cada empresa pertence a um `GrupoEconomico`. Controla
quem pode criar/editar empresa dentro do próprio grupo vs. a administração global da
plataforma, campos exclusivos da plataforma (situação de assinatura, teto de usuários),
upload de logo/banner/logo-DANFE, e exclusão (soft delete).

### 2. Fluxo de controle — funções principais 🟢

| Função | Observação |
|---|---|
| `findAll(query, user?)` | admin da plataforma vê todas; demais só as empresas do próprio grupo econômico (ou as vinculadas, se não for admin) |
| `findOneDoAtor(id, user)` | valida escopo antes de devolver o detalhe (rota pública ao usuário logado) |
| `create` / `createDoAtor` | `create` é uso interno (sem validação de ator); `createDoAtor` é o caminho da API — exige `isAdmin` ou `administradorPlataforma` |
| `update` | remove campos exclusivos da plataforma do payload se o ator não for admin de plataforma |
| `setLogo` / `setLogoDanfe` / `setBanner` | grava caminho do upload, remove arquivo anterior do disco (best-effort) |
| `remove` | soft delete + `situacao: 'cancelada'` |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Escopo de acesso a empresas (`garantirEscopo`) 🟢

- Administrador da plataforma (`administradorPlataforma`): acesso irrestrito a qualquer
  empresa.
- Administrador comum (`isAdmin`, perfil `sistemaBase`): só acessa empresas do **próprio
  grupo econômico** (resolvido via `usuario.grupoEconomicoId`).
- Qualquer outro usuário: só a própria `empresaAtivaId` da sessão.
- Comentário explícito no código registra uma correção de bug de segurança: antes desta
  checagem, a permissão `empresas.editar` (que o perfil Administrador tem) valia para
  **todas** as empresas da base, porque o service nunca comparava o id recebido com o da
  sessão — ou seja, um admin de uma empresa podia editar qualquer outra empresa do
  sistema só por ter essa permissão no próprio perfil.

#### 3.2 Campos exclusivos da plataforma (`CAMPOS_DA_PLATAFORMA`) 🟢

`ePlataforma`, `situacao`, `testeExpiraEm`, `limiteUsuarios` são removidos do payload de
`update` antes de chegar ao Prisma, a menos que `user.administradorPlataforma === true`.
Comentário no código: um administrador de empresa que alcançasse esses campos "se
liberaria sozinho" — estenderia o próprio período de teste, sairia do estado suspenso ou
apagaria o próprio teto de usuários. Por isso a exclusão é feita no payload, não apenas
escondida na tela (reforço server-side).

#### 3.3 Criação de empresa dentro de um grupo (`createDoAtor`) 🟢

- Só admin (de empresa ou plataforma) pode criar; admin de empresa precisa já pertencer
  a um grupo econômico.
- CNPJ é validado como único **na base inteira**, não só no grupo — consulta em "modo
  sistema" (`withSistema`, sem filtro de tenant) porque unicidade de CNPJ é uma regra
  global, não uma regra de carteira.
- `garantirVagaDeEmpresa` (helper externo, `common/empresa/limite-empresas`) confere se o
  grupo ainda tem vaga no plano contratado antes de criar.
- A nova empresa herda a situação da assinatura do grupo: `teste` (com o mesmo
  `testeExpiraEm` da empresa de origem) ou `ativa`, nunca gera cobrança nova — "utiliza o
  contrato do grupo" (comentário explícito).
- Após criar, executa `SELECT set_config('app.current_empresa_id', ...)` dentro da mesma
  transação — necessário porque o restante da transação (criação do `UsuarioEmpresa`)
  roda sob RLS e a policy de tenant exige esse contexto de sessão do Postgres.
- Vínculo `UsuarioEmpresa` criado sem perfil: perfil é do usuário (global), só o acesso à
  nova empresa precisa ser registrado.

#### 3.4 Unicidade de alias (`ensureAliasDisponivel`) 🟢

Alias é a URL de login (`?empresa=<alias>`) e precisa ser único **na base inteira**
(modo sistema), não só no grupo/empresa — dois tenants não podem compartilhar a mesma
URL de entrada.

#### 3.5 Upload de logo/banner/logo-DANFE 🟢

Os três seguem o mesmo padrão: grava o novo caminho, e se havia um arquivo anterior,
tenta removê-lo do disco de forma best-effort (`unlink` sem `await`, erro ignorado) —
evita acumular arquivos órfãos sem bloquear a resposta em caso de falha na remoção.
`setBanner` não liga a faixa automaticamente — enviar a imagem e publicá-la
(`bannerAtivo`) são ações separadas, decisão explícita no comentário.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `empresas`.

### 5. Metadados e configurações 🟢

| Constante | Observação |
|---|---|
| `CAMPOS_DA_PLATAFORMA` | `ePlataforma`, `situacao`, `testeExpiraEm`, `limiteUsuarios` |
| `SORT_FIELDS` | whitelist de ordenação: `razaoSocial`, `nomeFantasia`, `cnpj`, `situacao`, `createdAt` |

### 6. Segurança 🟢

- `garantirEscopo` é chamado em toda operação de leitura/escrita que recebe um `id` de
  empresa vindo da API — ponto único de correção do bug de escopo descrito em 3.1.
- Rota `DELETE /empresas/:id` tem `@UseGuards(PlatformAdminGuard)` adicional — só a
  administração da plataforma exclui empresa, mesmo que um perfil tenha
  `empresas.excluir`.
- `GET /empresas/ativa` deliberadamente **sem** `@RequirePermission` — qualquer usuário
  autenticado pode ler os dados da própria empresa ativa (usado no cabeçalho do PDF de
  orçamento); comentário no código avisa para não adicionar a permissão ali.

### 7. Dependências do módulo 🟢

`PrismaService`, `garantirVagaDeEmpresa` (common/empresa/limite-empresas),
`validarDocumentoEmpresa` (common/empresa/documento-empresa), `EnriquecimentoService`
(consulta de CNPJ, reaproveitado do módulo `clientes`), uploads config
(`common/uploads/uploads.config`).

### 8. Cobertura de testes 🟢

`empresa-plano-grupo.spec.ts` (criação de empresa dentro de grupo/plano).

---

## Módulo `grupos-economicos`

**Caminho:** `apps/api/src/modules/grupos-economicos/`
**Arquivos:** `grupos-economicos.module.ts`, `grupos-economicos.controller.ts`,
`grupos-economicos.service.ts` (280 linhas, sem spec próprio).

### 1. Responsabilidade 🟢

Hierarquia Grupo Econômico → Empresa. Gerencia composição de empresas no grupo (mover
empresa de um grupo para outro), usuários do grupo (perfil é da conta, válido em todas as
empresas do grupo) e remoção de acesso de um usuário a uma empresa específica. É o módulo
com a lógica transacional mais delicada do sistema — concorrência entre operações que
recompõem grupos.

### 2. Fluxo de controle — funções principais 🟢

| Função | Observação |
|---|---|
| `contexto(user)` | lista grupos visíveis + empresas "disponíveis" (de outros grupos, candidatas a mover) |
| `salvar(id, input, user)` | cria ou edita grupo — a função mais complexa do módulo (ver 3.2) |
| `usuarios(id, user)` | lista contas do grupo com seus vínculos por empresa |
| `salvarUsuario(id, input, user)` | cria usuário novo no grupo ou dá acesso a um existente, com mesmo perfil em todas as empresas do vínculo |
| `removerAcesso(id, usuarioId, empresaId, user)` | desativa o vínculo `UsuarioEmpresa` (não apaga a conta) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Escopo de administração (`exigirAdmin`, `empresasAdministradas`) 🟢

- Só `isAdmin` (perfil `sistemaBase`) gerencia grupos.
- Administrador da plataforma: sem restrição (`empresasAdministradas` retorna `null`).
- Administrador de empresa: só administra as empresas às quais tem vínculo ativo com
  perfil `sistemaBase` — `empresasAdministradas` retorna a lista explícita de ids.

#### 3.2 Recomposição de grupo (`salvar`) — a operação mais delicada do sistema 🟢

Como "toda empresa tem grupo" (invariante do domínio), incluir uma empresa num grupo é
sempre **mover** essa empresa de onde ela estava. A função:

1. Confere que só administradores da plataforma podem **criar** grupo novo.
2. Para cada empresa a incluir que não estava antes no grupo, exige que o ator administre
   essa empresa diretamente — impede "roubar" empresa de outro administrador.
3. Toda a recomposição roda em `withSistema` (modo sistema) — porque a operação atravessa
   múltiplos grupos e a RLS por grupo não permitiria ver/mover uma empresa de outro grupo
   a partir do contexto de uma única empresa ativa.
4. **Lock explícito com `SELECT ... FOR UPDATE`** no próprio grupo e em todas as empresas
   envolvidas (ordenado por id, para evitar deadlock entre duas chamadas concorrentes que
   tocam os mesmos registros em ordem diferente) — serializa recomposições concorrentes.
5. Confere vaga no plano do grupo (`garantirVagaDeEmpresa`) antes de mover empresa nova
   para dentro (exceto para admin da plataforma).
6. Para cada empresa que muda de grupo: usuários com vínculo **ativo** nela acompanham a
   empresa para o novo grupo — mas só se o `grupoEconomicoId` atual do usuário for nulo,
   o grupo de origem da empresa, ou o grupo de destino; senão lança `ConflictException`
   ("usuário vinculado a outro grupo. Revise os vínculos antes de agrupá-la") — proteção
   contra mover silenciosamente a conta de alguém que pertence a um terceiro grupo.
7. Perfis acompanham a empresa: `planejarPerfisParaGrupo`/`aplicarPerfisNoGrupo`
   (helper em `common/perfil/perfil-do-grupo`) resolve, pelo nome, o perfil equivalente
   no grupo de destino — planejado **antes** da troca de grupo (enquanto a RLS de
   `Perfil` ainda mostra o grupo de origem) e aplicado **depois**.
8. Empresa que é **removida** do grupo atual ganha um grupo próprio (novo, com o nome
   dela como descrição) e é marcada `situacao: 'suspensa'` + `testeExpiraEm: null` —
   nunca fica sem grupo.
9. Grupo de origem que ficar sem nenhuma empresa é soft-deletado.
10. Transação com timeout estendido (`20_000`ms) — operação com múltiplas idas ao banco
    por empresa envolvida.

#### 3.3 Perfil é do usuário, não do vínculo (`salvarUsuario`) 🟢

- Todos os vínculos informados (`input.vinculos`) devem ter o **mesmo** `perfilId` —
  reforça a decisão de 30/09/2026 de que o perfil é da conta, válido em todas as empresas
  do grupo que ela acessa.
- `validarPerfil`: perfil deve existir, pertencer ao grupo da empresa de referência
  (`garantirPerfilDoGrupo`), e só a administração da plataforma pode atribuir ou já ter
  atribuído o perfil "Administrador da Plataforma" (`administraPlataforma: true`).
- Usuário novo: e-mail único **na base inteira** (`withSistema`), valida a senha contra
  a política de **cada** empresa do vínculo, `deveTrocarSenha: true` forçado.
- Reaproveitamento de cadastro de vendedor: se já existe um `Vendedor` sem `usuarioId`
  com o mesmo e-mail em alguma das empresas do vínculo, os dados dele (nome, telefone,
  etc. via `dadosDoVendedor`) alimentam o novo usuário, e o vendedor é vinculado
  (`usuarioId`) ao final — evita duplicar identidade entre o cadastro comercial e o
  login.
- Locks explícitos (`FOR UPDATE`) no grupo e em cada empresa do vínculo, processados em
  ordem determinística (`sort` por id) — mesma proteção contra deadlock de `salvar`.
- `garantirVagaDeUsuario` só é chamado quando o vínculo **não estava ativo antes** — reativar
  um vínculo existente não deveria contar contra o teto se já contava antes 🟡 (inferido
  da condição `if (!atual?.ativo)`).

#### 3.4 Remoção de acesso (`removerAcesso`) 🟢

- Usuário não pode remover o próprio acesso por esta tela (proteção contra lockout
  acidental).
- `validarPerfil` é chamado de novo aqui — mesma trava: não é possível desativar o
  acesso de um Administrador da Plataforma por esta rota (só a própria plataforma).
- Ao desativar, também remove `WhatsappVinculoFuncionario` do usuário naquela empresa —
  evita vínculo de atendimento órfão apontando para quem perdeu acesso.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `grupos-economicos`.

### 5. Metadados e configurações 🟢

Transações de `salvar` e `salvarUsuario` usam `timeout: 20_000` (ms) — maior que o
default do Prisma, por envolverem múltiplas idas ao banco por empresa.

### 6. Segurança / integridade 🟢

- `withSistema` (bypass de RLS por tenant) é usado deliberadamente em operações que
  atravessam grupos — mas sempre **depois** de uma checagem de autorização já feita no
  contexto normal (`grupo()`, `empresasAdministradas()`), nunca para contornar a
  autorização em si.
- Locks `FOR UPDATE` ordenados por id — mitigação explícita de deadlock em operações
  concorrentes sobre os mesmos grupos/empresas.
- Dupla validação de perfil (`validarPerfil`) impede escalonamento para "Administrador
  da Plataforma" por quem não é administrador da própria plataforma.

### 7. Dependências do módulo 🟢

`PrismaService`, `PoliticaSenhaService`, `garantirVagaDeUsuario`
(common/empresa/limite-usuarios), `garantirVagaDeEmpresa` (common/empresa/limite-empresas),
`aplicarPerfisNoGrupo`/`garantirPerfilDoGrupo`/`planejarPerfisParaGrupo`
(common/perfil/perfil-do-grupo), `dadosDoVendedor` (common/usuarios/dados-do-vendedor).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec dedicado encontrado para este módulo — lacuna notável dado o nível
de complexidade transacional da função `salvar`.

---

## Módulo `usuarios`

**Caminho:** `apps/api/src/modules/usuarios/`
**Arquivos:** `usuarios.module.ts`, `usuarios.controller.ts`, `usuarios.service.ts`,
`dto/usuario.dto.ts`, `common/usuarios/whatsapp-do-usuario.ts`,
`common/usuarios/dados-do-vendedor.ts`
**Testes relacionados (em `common/usuarios/`):** `dados-do-vendedor.spec.ts`,
`whatsapp-do-usuario.spec.ts`

### 1. Responsabilidade 🟢

CRUD da conta `Usuario` dentro do escopo da empresa ativa, gestão de vínculo
usuário×empresa (`UsuarioEmpresa`) com atribuição de perfil/superior/dados pessoais,
reset de senha por administrador e cadastro de horário de trabalho (restrição de
expediente). Não cobre login/token/próprio perfil — isso é `auth` (ver módulo `auth`).

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `findAll(empresaId, query)` | filtros (perfilId, ativo, search), paginação | lista paginada + `vinculoId` | Média — roda dentro de `withTenant` por causa de RLS em `usuarioEmpresas`/`perfil` |
| `findOne(id, empresaAtivaId?)` | id, empresa ativa opcional | usuário sem `senhaHash` + `usuarioEmpresas` resolvidos por empresa | Alta — lê vínculo empresa a empresa no alcance do grupo, sem empresa cai em `withUsuario` |
| `create(input, empresaId, actorId, atorEhAdminPlataforma)` | dados + senha | usuário criado | Alta — checagem de perfil restrito, unicidade de e-mail por `withSistema`, vaga de licença, hash bcrypt, herda dados de `Vendedor` pré-existente e o vincula |
| `update(id, input, actorId)` | campos simples | usuário atualizado | Baixa — não altera senha nem vínculos |
| `resetSenha(id, input, actorId)` | nova senha | `{success}` | Média — valida política + reuso, grava histórico, zera lockout |
| `remove(id, actorId)` | id | `{success}` | Baixa — soft delete + `ativo: false` |
| `vincularEmpresa(usuarioId, empresaId, input, actorId, atorEhAdminPlataforma)` | perfilId, superiorId, dados pessoais | vínculo criado/reativado (upsert) | Alta — valida grupo econômico único, perfil restrito, superior no mesmo grupo, vaga de licença, grava WhatsApp |
| `obterHorarios` / `salvarHorarios(id, input, actorId)` | faixas por dia da semana | horários + flag `restringirHorario` | Média — substitui em bloco (delete+create) dentro de transação, invalida cache do guard |
| `desvincularEmpresa(usuarioId, empresaId, actorId, empresaAtivaId)` | ids | `{success}` | Média — `empresaId` só é aceita se estiver no alcance (grupo) de `empresaAtivaId` |
| `empresasNoAlcance(empresaAtivaId)` (privado) | empresa ativa | lista de ids (ela + grupo) | Baixa |
| `garantirPodeAtribuirPerfil(...)` (privado) | perfil novo/atual, flag admin plataforma, empresaId | lança `ForbiddenException` ou retorna | Média — ver 3.1 |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Trava de escalonamento de perfil (`garantirPodeAtribuirPerfil`) 🟢

Impede conceder **ou retirar** um perfil com `administraPlataforma: true` por quem não é
ele mesmo administrador da plataforma — fecha uma rota de escalonamento que
`usuarios.editar` (permissão que Administrador Empresa tem) deixaria aberta ao atribuir
um `perfilId` existente a um vínculo, já que a tela de Perfis tem `PlatformAdminGuard`
mas esta rota não. Antes dessa checagem, para qualquer ator: o perfil precisa ser da
plataforma ou do grupo econômico da empresa (`garantirPerfilDoGrupo`).

#### 3.2 Conta única por grupo econômico (`vincularEmpresa`, `create`) 🟢

Decisão de 30/09/2026: uma conta pertence a um grupo econômico só. `vincularEmpresa`
recusa (`ConflictException`) vincular a uma empresa de grupo diferente do já registrado
em `usuario.grupoEconomicoId`, e exige que o `superiorId` informado seja usuário do
mesmo grupo. `create` grava o grupo da empresa no momento da criação.

#### 3.3 Herança de dados de `Vendedor` pré-existente (`create`) 🟢

Ao criar um usuário, busca `Vendedor`s sem `usuarioId` com o mesmo e-mail na empresa e:
(a) usa `dadosDoVendedor()` para herdar `codigoErp`/`nomeReduzido`/`telefone`/
`dataNascimento` (só se o valor for único entre os vendedores encontrados — ver 3.5);
(b) após criar o usuário, vincula esses `Vendedor`s a ele (`usuarioId`). Sem isso, o
acesso nasceria sem carteira (o escopo hierárquico busca `Vendedor` pelo `usuarioId`).

#### 3.4 Resolução de vínculos no alcance do grupo (`findOne`) 🟢

`usuario_empresas` tem RLS por tenant — um `include` direto sem `withTenant` definido
mostraria "nenhuma empresa vinculada" para qualquer usuário. A função lê vínculo por
vínculo, uma chamada `withTenant` por empresa no alcance (a empresa ativa + demais do
mesmo grupo), e descarta os que não existem. Sem `empresaAtivaId` (uso interno), lê o
usuário via `withUsuario` e devolve sem vínculos resolvidos.

#### 3.5 Unificação de dados divergentes (`dadosDoVendedor`, em `common/usuarios/`) 🟡

Quando há mais de um `Vendedor` candidato com valores diferentes para o mesmo campo
(ex. dois `codigoErp` diferentes), a função descarta o campo (retorna `null`) em vez de
escolher um arbitrariamente — comentário explícito no código: "dados da conta são
únicos no grupo: não escolhe arbitrariamente uma empresa".

#### 3.6 WhatsApp replicado para `Vendedor` do grupo (`gravarWhatsappDoUsuario`) 🟢

Ao gravar celular/telefone do usuário (via `vincularEmpresa`), propaga o número
normalizado (`normalizarWhatsapp`, só dígitos) para o campo `telefone` de **todos** os
`Vendedor`es do usuário em todas as empresas do grupo — trocando o `app.current_empresa_id`
da sessão Postgres a cada empresa (RLS de `vendedor`) e restaurando a empresa de origem
no `finally`. Se o número mudou, apaga `WhatsappVinculoFuncionario` (precisa revincular).
Lança `ForbiddenException` se a empresa informada não estiver entre as do grupo do
usuário.

#### 3.7 Substituição em bloco do horário de trabalho (`salvarHorarios`) 🟢

Em vez de diff linha a linha, apaga todas as faixas do usuário e recria a partir do
payload (no máximo 7, uma por dia da semana), dentro de uma transação — uma falha no
meio não pode deixar `restringirHorario: true` com só parte da semana cadastrada (isso
trancaria o usuário fora do sistema em dias sem faixa). Após salvar, invalida o cache de
1 minuto do guard de horário (`horarioTrabalho.invalidar`) para a mudança valer
imediatamente.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `usuarios` (`UsuarioHorario`; `Usuario` e
`UsuarioEmpresa` já documentados na seção `auth`).

### 5. Metadados e configurações 🟢

`SALT_ROUNDS = 12` (bcrypt). `SORT_FIELDS` restringe a ordenação de `findAll` a
`nome`, `email`, `ativo`, `ultimoLogin`, `createdAt` — qualquer outro valor cai no
default `nome`.

### 6. Segurança / integridade 🟢

- `create` usa `withSistema` só para checar unicidade de e-mail (global, cruza grupos) —
  depois disso, toda a criação roda sob o tenant da empresa.
- A verificação de vaga de licença (`garantirVagaDeUsuario`) roda **dentro** da mesma
  transação do `create`/`vincularEmpresa`, não antes — evita que dois cadastros
  simultâneos passem pela mesma última vaga disponível.
- `desvincularEmpresa` valida que a `empresaId` da URL está no alcance (grupo) de quem
  pede, antes dessa checagem a RLS sozinha devolvia 500 em vez de 404 para empresa de
  fora.

### 7. Dependências do módulo 🟢

`PrismaService`, `PoliticaSenhaService` (validação de senha e reuso),
`HorarioTrabalhoService` (acessos — cache de restrição de expediente),
`garantirVagaDeUsuario` (common/empresa/limite-usuarios),
`garantirPerfilDoGrupo`/`grupoDaEmpresa` (common/perfil/perfil-do-grupo),
`gravarWhatsappDoUsuario`/`dadosDoVendedor` (common/usuarios/), `AuthModule` (importado
só para expor fluxos de foto/tela-inicial reaproveitados do próprio perfil), `bcryptjs`.

### 8. Cobertura de testes 🟡

Sem spec dedicado para `usuarios.service.ts`; as únicas coberturas tocam os helpers em
`common/usuarios/` (`dados-do-vendedor.spec.ts`, `whatsapp-do-usuario.spec.ts`) — a
lógica de orquestração do service (criação, vínculo, trava de perfil) não tem teste
próprio 🔴.

---

## Módulo `perfis`

**Caminho:** `apps/api/src/modules/perfis/`
**Arquivos:** `perfis.module.ts`, `perfis.controller.ts`, `perfis.service.ts`,
`dto/perfil.dto.ts`, `perfis.service.spec.ts`

### 1. Responsabilidade 🟢

CRUD do catálogo de perfis RBAC (`Perfil`) e das permissões por rotina/ação
(`PerfilPermissao`). Resolve a visibilidade e as travas de edição entre perfil "da
plataforma" (modelo global, `grupoEconomicoId` nulo) e perfil "do grupo econômico"
(cópia/personalização por grupo) — ver 3.1.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `findAll(query, user)` | filtros + paginação | perfis visíveis para o ator | Média — monta `where` combinando `visiveis()` com os filtros |
| `findOne(id, user)` | id | perfil + permissões + rotina inicial, ou 404 | Média — 404 também para perfil de outro grupo (ver 3.2) |
| `create(input, user)` | dados do perfil | perfil criado | Média — decide o dono (`grupoEconomicoId`) pelo papel do ator |
| `update(id, input, user)` | campos | perfil atualizado | Baixa — delega a trava a `garantirPodeAlterar` |
| `remove(id, user)` | id | soft delete | Baixa — recusa perfil `sistemaBase` |
| `updatePermissoes(id, input, user)` | lista `{rotinaId, acao, permitido}` | permissões atualizadas | Média — upsert em lote + trava de rotina administrativa |
| `visiveis(user)` (privado) | user | filtro Prisma (`Prisma.PerfilWhereInput`) | Média — ver 3.1 |
| `garantirPodeAlterar(id, user)` (privado) | id, user | perfil ou `ForbiddenException` | Baixa |
| `grupoDoAtor(user)` (privado) | user | grupo econômico da empresa ativa | Baixa |
| `formatPerfil` (função livre) | perfil com `rotinaInicial` | perfil achatado (`rotinaInicialNome`/`rotinaInicialRota`) | Baixa |
| `nomeRepetido(err)` (função livre) | erro | boolean (`P2002`) | Baixa |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Visibilidade perfil-da-plataforma × perfil-do-grupo (`visiveis`) 🟢

`Perfil` não tem RLS — é lido no login, antes de existir empresa ativa na sessão — então
o corte de visibilidade é feito inteiramente em código, em `visiveis()`:
- Quem **não** é administrador da plataforma vê os perfis da plataforma (`grupoEconomicoId`
  nulo) **exceto** os que têm um homônimo no grupo da empresa ativa — a migration que
  introduziu "perfil por grupo" deu a cada grupo uma cópia dos perfis que ele já usava, e
  mostrar os dois duplicaria a opção "Vendedor", por exemplo.
- Quem **não** é administrador da plataforma também nunca vê perfil com
  `administraPlataforma: true` — não por risco de leitura, mas para nem aparecer como
  opção no select de vínculo de quem não pode concedê-lo (a trava de atribuição em si
  mora em `UsuariosService.garantirPodeAtribuirPerfil`, módulo `usuarios`).
- Administrador da plataforma vê todos os da plataforma, mesmo havendo homônimo no
  grupo — são os que ele administra.

#### 3.2 Perfil de outro grupo responde 404 (`findOne`, `garantirPodeAlterar`) 🟢

Perfil de um grupo econômico diferente do da empresa ativa não gera 403, gera 404 —
"como se não existisse" (comentário explícito no código). `garantirPodeAlterar` reusa
`findOne` (que já aplica esse filtro) e só adiciona uma segunda trava: perfil da
plataforma (`grupoEconomicoId` nulo) só é alterável por administrador da plataforma,
mesmo que o ator o enxergue na listagem.

#### 3.3 Dono do perfil decidido na criação (`create`) 🟢

Administrador da plataforma cria sempre com `grupoEconomicoId: null` (perfil-modelo,
disponível a todos os grupos). Qualquer outro ator cria no grupo da empresa ativa — e
se a empresa ativa não pertencer a grupo nenhum, `ForbiddenException`. Não há como criar
perfil com `administraPlataforma: true` por essa rota (o campo nem está em
`PerfilCreate`/`PerfilUpdate` — só seed e migration concedem).

#### 3.4 Trava de rotina administrativa fora do perfil base (`updatePermissoes`) 🟢

Perfis que não são `sistemaBase` não podem receber permissão (`permitido: true`) para
nenhuma rotina do módulo `seed-modulo-administracao` (constante
`MODULO_ADMINISTRACAO_ID`) — mesmo corte usado em `auth.buildAccessToken` (`rotinaNoAr`,
módulo `auth`) para nunca listar essas rotinas no token de quem não é admin. Aqui a
checagem é preventiva: barra a gravação, não só a exibição.

#### 3.5 Upsert em lote de permissões (`updatePermissoes`) 🟢

Substitui por upsert (`perfilId_rotinaId_acao` como chave composta) só as combinações
rotina+ação presentes no payload — as demais permissões do perfil permanecem como
estavam (documentado também no Swagger do controller). Não roda em transação: as
chamadas de `upsert` disparam em paralelo via `Promise.all` 🟡 (uma falha no meio deixa
permissões parcialmente gravadas).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `perfis` (`Perfil`, `PerfilPermissao`).

### 5. Metadados e configurações 🟢

`SORT_FIELDS` restringe ordenação de `findAll` a `nome`, `ativo`, `sistemaBase`,
`createdAt`. `MODULO_ADMINISTRACAO_ID = 'seed-modulo-administracao'` — id fixo de seed,
replicado também em `auth.service.ts` (ver 3.4).

### 6. Segurança / integridade 🟢

- Nome único por dono: `@@unique([grupoEconomicoId, nome])` no schema cobre o caso geral,
  mas perfis da plataforma (grupo nulo) dependem de um índice parcial criado via SQL na
  migration (`perfis_nome_plataforma_key`), porque o Prisma não representa índice
  parcial e nulos não colidem num `@@unique` comum — documentado em comentário no schema.
- `nomeRepetido` traduz a violação desse índice (`P2002`) em `ConflictException` tanto em
  `create` quanto em `update`.
- `remove` recusa (`NotFoundException`, não 403) excluir perfil `sistemaBase` — mensagem
  deliberadamente genérica.

### 7. Dependências do módulo 🟢

`PrismaService`, `grupoDaEmpresa` (common/perfil/perfil-do-grupo), `Prisma` (namespace,
para `Prisma.PerfilWhereInput` e detecção de `PrismaClientKnownRequestError`).

### 8. Cobertura de testes 🟢

`perfis.service.spec.ts` cobre as duas frentes centrais: a trava de rotina administrativa
(3.4 — perfil não-admin barrado, perfil admin base liberado) e o corte dono-do-perfil
(3.1/3.2/3.3 — admin de empresa altera perfil do próprio grupo mas não o da plataforma,
perfil de outro grupo não é encontrado, admin da plataforma altera perfil da plataforma,
perfil nasce no dono certo conforme quem cria). `updatePermissoes` sem transação (3.5)
não tem teste cobrindo falha parcial 🔴.

---

## Módulo `acessos`

**Caminho:** `apps/api/src/modules/acessos/`
**Arquivos:** `acessos.module.ts`, `acessos.controller.ts`, `uso-rotina.controller.ts`,
`acessos.service.ts`, `horario-trabalho.service.ts`, `dto/acesso.dto.ts`
**Dependência direta:** `common/horario/horario-trabalho.ts` (`dentroDoExpediente`,
`momentoLocal`, `ForaDoExpedienteException`)

### 1. Responsabilidade 🟢

Duas frentes dentro do mesmo módulo: (a) auditoria de acesso só-leitura — eventos de
login/logout/falha (`AcessoLog`), sessões com tempo de uso (`Sessao`) e uso por rotina
(`UsoRotina`), consumidas pela tela Administração > Acessos; (b) a restrição de
expediente (`HorarioTrabalhoService`) que o `JwtAuthGuard` consulta a cada requisição
para decidir se o usuário pode acessar agora. Quem grava os eventos de auditoria é o
fluxo de autenticação (`auth`), nunca esta API — `AcessosController` é só leitura.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `registrar(dados)` | evento, email, ids opcionais | grava `AcessoLog`, nunca lança | Baixa — try/catch que vira log de servidor |
| `abrirSessao` / `tocarSessao` / `encerrarSessao` | ids, empresa | sessão criada/atualizada/fechada | Baixa |
| `situacaoSessao(sessaoId)` | id | `{aberta, motivo}`, com cache de 10s | Média |
| `encerrarSessoes(filtro, motivo)` | usuarioId + `manter`/`sessaoId` | sessões fechadas + refresh tokens revogados | Média — transação dupla (sessao + refreshToken) |
| `registrarUso(empresaId, usuarioId, caminho)` | caminho da tela (web) | `{registrado}` | Média — resolve rotina pela rota do menu (ver 3.1), upsert por dia |
| `usoPorRotina(empresaId, query)` | filtros + período | ranking de rotinas (acessos, usuários distintos, último acesso) | Média — agregação em memória |
| `desconectar(empresaId, ator, sessaoId)` | id da sessão | `{success, jaEncerrada}` | Média — recusa a própria sessão do ator |
| `encerrarSessoesDoUsuario(usuarioId, motivo)` | id, motivo | todas as sessões abertas fechadas | Baixa — usado no corte por fim de expediente |
| `listarEventos` / `listarSessoes` | filtros + paginação | listas paginadas | Média — `where` monta o corte de tenant (ver 3.2) |
| `resumo(empresaId, user, query)` | filtros + período | cartões + tempo de uso por usuário | Alta — agregação dupla (sessões + eventos de falha) em memória, ver 3.4 |
| `HorarioTrabalhoService.verificar(usuarioId, empresaId?, agora?)` | ids, instante | `{dentro, motivo}` | Média — cache de 1 min + feriado do dia |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Resolução de rota → rotina (`rotinasPorRota`, `registrarUso`) 🟢

O catálogo rota→rotina é lido do `Menu` (`rota`) e cacheado em memória por 5 minutos
(muda só quando o catálogo é resincronizado). Quando um `Menu` tem mais de uma `Rotina`
associada (ex.: "Empresas" + "Base de Demonstração"), a rotina "principal" é escolhida
por prioridade: (1) rotina de mesmo nome do menu; (2) rotina cujo `codigo` aparece como
segmento da rota; (3) a primeira da lista. As rotas são ordenadas por tamanho
decrescente antes da busca, para que um prefixo mais específico
(`/comercial/produtos/fichas`) vença um mais genérico (`/comercial/produtos`).
`registrarUso` ignora silenciosamente caminho que não bate com nenhuma rota — é medição,
não pode derrubar a navegação.

#### 3.2 Isolamento sem RLS via filtro em código (`usuariosDaEmpresa`, `whereEventos`, `whereSessoes`) 🟢

`AcessoLog` e `Sessao` não têm RLS por tenant — são escritos no login, antes de existir
empresa ativa (comentário explícito no schema). O isolamento por empresa é inteiramente
em código: toda consulta restringe a `usuarioId IN (vínculos ativos da empresa)`. Exceção
documentada: tentativa de login com e-mail que não existe no cadastro (`usuarioId` nulo)
não pertence a empresa nenhuma e só aparece para quem tem `isAdmin` (perfil de sistema)
— sem essa trava, o admin da empresa A leria tentativas de e-mail contra a empresa B.

#### 3.3 Sessão "viva" sem fechamento explícito (`sessaoAtiva`, `MINUTOS_SESSAO_VIVA`) 🟢

Uma sessão sem `encerradaEm` só conta como ativa se `ultimaAtividadeEm` estiver a menos
de 40 minutos do agora. O valor é o dobro do ciclo de refresh (~15 min, com folga) —
navegador fechado sem logout explícito não renova o token e "envelhece" sozinho até sair
da janela, em vez de aparecer como ativo para sempre.

#### 3.4 Agregação dupla sessões+eventos em memória (`resumo`) 🟢

Constrói um mapa por `usuarioId` em duas passadas: primeiro todas as sessões do período
(sessões, minutos totais, último acesso), depois os eventos de falha do período —
usuário que só tentou e nunca entrou não tem sessão, então nasce no mapa já na segunda
passada, zerado. `usuariosDistintos` é contado **antes** da segunda passada de propósito
(comentário no código) — só conta quem efetivamente acessou, não quem só tentou. O
agregado roda em memória (não em SQL) porque a duração de cada sessão depende de
`encerradaEm ?? ultimaAtividadeEm`, calculada em JS, e o volume mensal por empresa é
pequeno.

#### 3.5 Cache de 1 minuto + feriado do dia (`HorarioTrabalhoService.verificar`) 🟢

Roda em toda requisição autenticada (via guard), então o TTL de 1 min equilibra custo
(uma consulta extra por request seria caro) com responsividade (quem edita o horário
chama `invalidar()` para valer na hora — ver `usuarios.salvarHorarios`). O feriado do dia
só é consultado (outro cache, 10 min) quando `restringirHorario` está ligado, e falha ao
lê-lo vira log + `null`, nunca 500 — login não pode cair por causa do feriado. A
comparação de horário é textual (`"08:00" <= hora < "18:00"`), válida porque o formato é
sempre `HH:MM` de largura fixa; faixa que atravessa meia-noite não é suportada (recusada
no cadastro).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `acessos` (`Sessao`, `AcessoLog`, `UsoRotina`,
`AcessoEvento`). `UsuarioHorario` já documentado na seção `usuarios`.

### 5. Metadados e configurações 🟢

`DIAS_PADRAO = 30` (período default das consultas). `MINUTOS_SESSAO_VIVA = 40`.
`CACHE_SESSAO_MS = 10_000` (situação de sessão). `TTL_MS = 60_000`
(`HorarioTrabalhoService`, expediente) e `10 * TTL_MS` (feriado). `SORT_FIELDS_EVENTO` /
`SORT_FIELDS_SESSAO` restringem ordenação. `HORARIO_TIMEZONE = 'America/Campo_Grande'`
(fixo, não por empresa — comentário no código já antecipa a extensão).

### 6. Segurança / integridade 🟢

- `desconectar` recusa (`BadRequestException`) que o ator encerre a própria sessão atual
  — existe "Sair" para isso.
- Caches em memória (`situacaoCache`, `mapaRotas`, `feriadoCache` em
  `HorarioTrabalhoService`) têm limite de tamanho com `clear()` total ao estourar (ex.:
  10.000 sessões) — proteção simples contra crescimento ilimitado, ao custo de um pico de
  releituras logo depois 🟡.
- `registrar` (log de auditoria) nunca propaga exceção — falha de escrita no rastro não
  pode derrubar login/logout.

### 7. Dependências do módulo 🟢

`PrismaService`, `common/horario/horario-trabalho.ts` (`dentroDoExpediente`,
`momentoLocal`, `HORARIO_TIMEZONE`), `common/sessao/sessao-encerrada.exception.ts`
(`MOTIVO_DESCONECTADO`), `AuthenticatedUser` (current-user decorator).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec dedicado encontrado para `acessos.service.ts` nem
`horario-trabalho.service.ts` — lacuna notável dado o papel de
`HorarioTrabalhoService.verificar` em toda requisição autenticada e a agregação não
trivial de `resumo`.

---

## Módulo `produtos`

**Caminho:** `apps/api/src/modules/produtos/`
**Arquivos (18):** `produtos.module.ts`, `produtos.controller.ts`, `produtos.service.ts`,
`produto-relacionados.service.ts`, `produto-fichas.service.ts`,
`ficha-importacao.controller.ts`, `ficha-importacao.service.ts`,
`ficha-embedding.service.ts`, `partir-ficha.ts`, `sem-preco.ts`,
`produto-fotos-importacao.controller.ts`, `produto-fotos-importacao.service.ts`,
`produto-para-agente.service.ts`, `dto/produto.dto.ts`, 4 arquivos de spec.

### 1. Responsabilidade 🟢

CRUD do catálogo de produtos (origem ERP ou nascido na plataforma), com trava de edição
nos campos que o import do Protheus sobrescreveria; preços por tabela; fotos (upload
manual e importação em lote por nome de arquivo); fichas técnicas em PDF com extração de
Markdown por IA (manual ou importação em lote por conteúdo), indexação semântica dessas
fichas; produtos relacionados (similares e aplicação, usado também por Equipamentos de
Comodato); e o recorte do que a IA pode falar sobre um produto — nunca preço.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Serviço | Responsabilidade |
|---|---|
| `ProdutosService` | CRUD, listagem com filtros/busca, preços por tabela (`precos`), opções de filtro, fotos (upload, principal, remoção) |
| `ProdutoRelacionadosService` | CRUD de similares/aplicação, lidos dos dois lados; recusa produto de categoria "equipamento de comodato" como aplicável |
| `ProdutoFichasService` | CRUD de ficha técnica (PDF + Markdown), delega reindexação ao `FichaEmbeddingService` |
| `FichaImportacaoService` | Fila de importação de fichas por PDF: upload grava e devolve, varredura (`setInterval`) lê cada PDF via provedor de IA e vincula ao produto pelo conteúdo |
| `FichaEmbeddingService` | Parte a ficha em trechos (`partirFicha`), indexa (apaga e refaz) e vetoriza os pendentes em lote |
| `ProdutoFotosImportacaoService` | Importação de fotos em lote, vínculo por código extraído do nome do arquivo |
| `ProdutoParaAgenteService` | Busca híbrida (lexical + semântica) e dossiê de produto para a IA — nunca lê `ultimoPreco` |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Trava de campos do ERP (`CAMPOS_DO_ERP`) 🟢

`update` só compara e bloqueia os campos de `CAMPOS_DO_ERP` quando o produto tem `chave`
(veio do import) **e** o valor enviado difere do gravado — o formulário manda o objeto
inteiro, então comparar evita recusar um "salvar" que não tocou em nada do ERP. Produto
sem `chave` (nascido na plataforma) é editável por inteiro. `remove` aplica a mesma régua:
produto com `chave` não pode ser excluído pela API (`BadRequestException`) porque o
próximo import o recriaria — a exclusão real é no Protheus. 🟢

#### 3.2 Preço por tabela com herança de regra de desconto (`precos`) 🟢

Monta, por item de tabela de preço ativa, a regra de desconto que vale naquela linha, na
mesma precedência do orçamento (`resolverRegrasDescontoDosItens`): produto → item da
tabela → categoria do produto → regra padrão da empresa. Comentário no código registra que
a precedência "produto antes da tabela" é decisão do usuário de 2026-10-13 — mudou de
ordem em algum momento.

#### 3.3 Fichas técnicas — extração por IA e corte de preço (`FichaImportacaoService`,
`ProdutoFichasService`, `sem-preco.ts`) 🟢

- **Upload não processa**: grava os PDFs (`ProdutoFichaImportacao`) e devolve; uma
  varredura própria (`setInterval` de 5s, com trava de reentrada `rodando`) lê 1 PDF por
  vez por empresa, com até 3 tentativas antes de marcar `erro` — chamada cara a provedor
  de IA, lote não cabe numa requisição HTTP.
- **Quem decide o produto é o servidor, não o modelo**: o provedor devolve código e nome
  lidos do documento; `procurarProduto` busca no catálogo por código (fornecedor, ERP,
  barras — exato) e só cai para nome (com `sem_acento`, mínimo 4 caracteres) se nenhum
  código bateu. Um resultado → vincula e grava a ficha; zero ou mais de um → situação
  `sem_correspondencia`/`ambiguo`, decisão fica para uma pessoa na tela. Motivação
  explícita no código: se o modelo devolvesse um id, bastaria alucinar um para pendurar a
  ficha no produto errado, sem ninguém perceber até um vendedor mandar a ficha errada a um
  cliente.
- **`sem-preco.ts` — regra "a IA nunca passa preço" é código, não prompt**: `linhaTemPreco`
  reconhece `R$`/`US$`, palavras-chave (`preço`, `custo`, `desconto`, `condição de
  pagamento`...) e remove a linha inteira; deliberadamente **não** inclui "valor" sozinho
  (apareceria em "valor de pH", removeria conteúdo técnico legítimo). Comentário no código
  é explícito sobre a escolha de errar removendo demais — ver a doc do arquivo.
  `FichaEmbeddingService.indexar` vetoriza o Markdown **depois** do `semPreco`;
  `ProdutoParaAgenteService.detalhar` aplica `semPreco` de novo no conteúdo devolvido à IA
  — defesa em duas camadas (o que é indexado e o que é lido).
- **Reindexação é apagar e refazer** (`FichaEmbeddingService.indexar`): guardar diff entre
  versões de Markdown custaria mais do que regerar, e um trecho velho sobrevivendo à edição
  deixaria buscável um texto que a pessoa acabou de remover.
- **Vetorização tolerante a ausência de provedor**: sem embeddings configurados, os trechos
  ficam só com texto (busca lexical atende); `vetorizarPendentes` varre depois, em lote de
  32, teto de 200 por chamada.

#### 3.4 `partir-ficha.ts` — particionamento de Markdown para embedding 🟢

Alvo de ~800 caracteres por trecho (equilíbrio entre contexto suficiente e diluição do
vetor), corte por `\n\n` (respeita a estrutura do documento), blocos menores que 120
caracteres grudam no trecho anterior/seguinte (título de seção sozinho não responde nada),
blocos muito grandes (>1,5× o alvo) são cortados por linha. Teto de 60 trechos por ficha.
O título do documento é repetido no início de cada trecho que não já o contém, para o
vetor do trecho apontar ao produto certo mesmo isolado do resto.

#### 3.5 Busca híbrida para a IA (`ProdutoParaAgenteService.procurarHibrido`/`procurar`) 🟢

- **Lexical "candidatos primeiro, pontuação depois"**: cada termo da busca gera um braço de
  `UNION ALL` (descrição/marca/código/categoria do produto, campos complementares visíveis
  ao agente, texto de ficha visível ao agente), usando `sem_acento(...) ILIKE` (não
  `unaccent`, que não usa o índice GIN de trigramas da migration `20260906000000`) —
  medido em dev: 1139ms pontuando tudo vs. 0,8ms por candidatos primeiro, com 4.000
  produtos/fichas.
- **`palavrasDaBusca`**: remove conectivos/pronomes e palavras do próprio domínio (lista
  `VAZIAS`, ~60 termos) que casariam com o catálogo inteiro; teto de 6 palavras; busca só de
  palavras vazias cai para o texto inteiro (evita devolver o catálogo sem filtro).
  Pontuação por produto = nº de palavras que casaram (não exige todas, para não perder o
  produto certo por uma palavra solta da frase).
  🟢 (testado em `palavras-da-busca.spec.ts`)
- **Semântica**: distância de cosseno (`<=>`, índice HNSW) sobre `produto_ficha_trechos`,
  `DISTINCT ON (produtoId)` para uma ficha longa não ocupar o resultado com vários trechos
  do mesmo produto; filtra só trechos vetorizados e fichas `visivelAgente`.
- **Combinação**: soma por posição (`1/(posição+1)`, não pela distância bruta — cosseno e
  contagem de palavras não são comparáveis), semântica pesando 1,3× a lexical. Sem
  provedor de embeddings, `gerarUm` devolve `null` e sobra só a lexical.

#### 3.6 Similares e aplicação — leitura dos dois lados, regra de categoria (`ProdutoRelacionadosService`) 🟢

- `listar`/`listarTx` junta as relações que partem do produto e as que chegam, marcando
  `origem` — sem isso quem abre o "produto B" não veria que A o usa.
  `similar` é simétrico (gravado uma vez, lido nos dois lados; `criar` rejeita duplicar o
  inverso com `ConflictException`); `aplicacao` é direcional (mesma relação, rótulo
  diferente em cada ponta: "usa"/"usado em").
  `remover` aceita o id pela ponta aberta na tela, seja origem ou destino.
- `recusarCategoriaDeEquipamento`: um produto marcado como categoria/subcategoria de
  "equipamento de comodato" não pode entrar como `aplicacao` (o dispenser não "usa" outro
  dispenser) — decisão do usuário, 2026-10-07. Mora aqui e não na tela de Equipamentos de
  Comodato porque o card "Relacionados" do produto grava a mesma relação; pôr a regra só
  numa tela deixaria a outra como atalho.

#### 3.7 Importação de fotos por nome de arquivo (`codigosDoNome`) 🟢

Extrai candidatos do nome do arquivo (sem extensão) e uma variante sem sufixo
`_2`/` principal`, com precedência para o nome completo (só cai para a variante sem
sufixo quando a correspondência exata não achou nada). Critério de busca é parametrizável
(`codigo_erp`, `codigo_fornecedor`, `manual`); zero ou mais de um produto encontrado grava
a foto sem vínculo (`produtoId: null`), pendente de decisão manual.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `produtos`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `CAMPOS_DO_ERP` | 14 campos | trava de edição em produto com `chave` |
| `SORT_FIELDS` | 5 campos | whitelist de ordenação da listagem |
| `ALVO` / `MINIMO` / `MAXIMO_TRECHOS` (`partir-ficha.ts`) | 800 / 120 / 60 | tamanho-alvo do trecho, limiar de "grudar", teto por ficha |
| `INDICIOS` (`sem-preco.ts`) | 10 regex | o que denuncia preço numa linha de ficha |
| `FichaImportacaoService.INTERVALO_MS` / `POR_RODADA` / `MAX_TENTATIVAS` | 5000ms / 1 / 3 | cadência e paralelismo da varredura de PDFs |
| `FichaEmbeddingService.LOTE` | 32 | trechos por chamada ao provedor de embeddings |
| `VAZIAS` (`produto-para-agente.service.ts`) | ~60 palavras | stop-words da busca da IA |

### 6. Segurança / integridade 🟢

- `ProdutoParaAgenteService` nunca lê `ultimoPreco` do banco — seleção positiva, não poda
  depois da leitura: não há o que o modelo possa deixar escapar porque ele nunca recebeu.
  Caso concreto de "acesso é código" do inventário de ferramentas de IA do projeto.
- `sem-preco.ts` é defesa em duas camadas (indexação e leitura), explicitamente descrita no
  código como "rede, não barreira": heurística sobre texto livre, não garantia — a tela do
  produto permite editar/revisar o Markdown, e `visivelAgente: false` tira a ficha do
  alcance da IA sem apagá-la.
  🟡 (eficácia da heurística depende do texto real; não testável em abstrato)
- `FichaImportacaoService.varrer` precisa iterar empresas por `empresa.findMany` (sem RLS)
  antes de `withTenant` por empresa — comentário no código registra que esquecer isso
  deixa a fila "pendente" para sempre, sem erro, por RLS filtrar tudo (ver também `acessos`
  e `notificacoes`, mesmo padrão de varredura).
- Upload de foto/ficha sem produto correspondente (`setFoto`) remove o arquivo do disco
  (`unlink`) antes de lançar `NotFoundException` — evita lixo órfão em disco.

### 7. Dependências do módulo 🟢

`PrismaService`, `ProvedorIaModule`/`ProvedorFactory` e `AgenteConfigService` (módulo
`agente`, importado sem o `AgenteModule` inteiro para não fechar ciclo de import),
`EmbeddingsService` (módulo `agente`), `common/uploads/uploads.config`
(`PRODUTOS_DIR`, `FICHAS_DIR`, `FICHAS_IMPORTACAO_DIR`), `common/empresa/situacao-empresa`
(`whereEmpresaAcessivel`), `@plataforma/contracts`. Consumido por `whatsapp` (triagem/
pré-atendimento, via `ProdutoParaAgenteService`) e por `equipamentos-comodato` (via
`ProdutoRelacionadosService`, tipo `aplicacao`).

### 8. Cobertura de testes 🟡

4 arquivos de spec: `palavras-da-busca.spec.ts`, `partir-ficha.spec.ts`,
`sem-preco.spec.ts` (as três funções puras de parsing/heurística), e
`produto-relacionados.service.spec.ts`. Sem spec dedicado para `ProdutosService`
(trava de campos do ERP, `precos`), `FichaImportacaoService` (varredura, decisão
servidor-side) nem `ProdutoParaAgenteService.procurarHibrido`/`procurar` (combinação de
pesos) — lacuna notável dado que estas são as rotinas com a lógica de negócio mais densa
do módulo.

---

## Módulo `produto-campos`

**Caminho:** `apps/api/src/modules/produto-campos/`
**Arquivos (5):** `produto-campos.module.ts`, `produto-campos.controller.ts`,
`produto-campos.service.ts`, `normalizar-valor.ts`, `dto/produto-campo.dto.ts`, 1 spec.

### 1. Responsabilidade 🟢

Campos complementares de produto: o cadastro das definições (o que cada empresa decide
guardar — diluição, tensão, pictograma de risco etc., já que uma coluna nova em `produtos`
por empresa não escala) e o preenchimento desses campos por produto, com validação e
normalização de valor por tipo.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `listar` | Definições ativas (ou todas) da empresa, ordenadas por `ordem`/`nome` |
| `criar`/`atualizar`/`remover` | CRUD da definição; chave imutável; trava de mudança de tipo com valores preenchidos |
| `valoresDoProduto`/`valoresDoProdutoTx` | Formulário do produto: **toda** definição ativa + valor quando houver; recortes `apenasAgente`/`apenasPreenchidos` |
| `gravarValores` | Grava o formulário inteiro, validando e normalizando cada valor contra o tipo da definição |
| `normalizarValorDoCampo` | Texto digitado → formato canônico por tipo (número, booleano, data, lista) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Chave única mesmo para excluídos (`criar`) 🟢

A constraint `@@unique([empresaId, chave])` não distingue excluído: tentar recriar uma
chave de um campo soft-deleted falha no banco. O serviço antecipa isso com uma consulta
própria e devolve mensagem diferente conforme o achado esteja ou não excluído — evita o
usuário tentar de novo a mesma chave sem entender por quê.

#### 3.2 Trava de mudança de tipo com valores preenchidos (`atualizar`) 🟢

Mudar o `tipo` de um campo já preenchido (`texto` → `numero`, por exemplo) quebraria a
leitura em quem já confia no formato canônico (tela, IA, relatório). `atualizar` conta
`produtoCampoValor` pelo campo antes de aceitar a troca de tipo; havendo qualquer valor
gravado, recusa com `ConflictException` e orienta a criar um campo novo em vez de migrar o
existente. Campo `lista` sempre precisa de ao menos 1 opção (validado tanto aqui quanto no
schema Zod, nas duas entradas — criação e atualização).

#### 3.3 Normalização de valor por tipo (`normalizar-valor.ts`) 🟢

Módulo isolado "para poder ser testado direto — é a regra mais fácil de quebrar sem
ninguém perceber" (comentário do autor). Entrada tolera o formato local; saída é sempre o
canônico:
- **número**: aceita `1.234,5` (ponto = milhar, vírgula = decimal, formato brasileiro) —
  `Number("1.234,5")` direto daria `NaN`, e sem remover o ponto de milhar o valor sairia
  mil vezes menor. Saída: `Number` convertido para string (ponto decimal).
- **booleano**: aceita `sim/não/s/n/1/0/x/true/false` (case-insensitive); saída sempre
  `"true"`/`"false"` literal.
- **data**: aceita `DD/MM/AAAA` (o que a pessoa digita) e ISO (o que `<input type="date">`
  manda); valida que a data não "rolou" — `new Date('2026-02-31')` não lança em JS, apenas
  avança para 03/03, então o código recompara o ISO resultante com o original para pegar
  dias inexistentes.
- **lista**: compara a opção sem diferenciar maiúscula, mas grava **como cadastrada** —
  evita o mesmo valor aparecer de formas diferentes ao filtrar depois.
- Qualquer valor que não valida lança `BadRequestException` com o nome do campo na
  mensagem — nunca grava um valor que não bate com o tipo.

#### 3.4 `gravarValores` — formulário inteiro, apagar por valor vazio 🟢

Recusa (não ignora) campo inexistente/excluído/desativado referenciado no payload — do
contrário a tela diria "salvo" com o valor não gravado. Valor vazio e campo obrigatório →
`BadRequestException`; valor vazio e campo opcional → `deleteMany` do valor (limpar um
campo não precisa de rota própria). Valor não vazio passa por `normalizarValorDoCampo`
antes do `upsert` (chave composta `empresaId_produtoId_campoId`).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `produto-campos`.

### 5. Metadados e configurações 🟢

| Constante/Regra | Valor | Uso |
|---|---|---|
| `produtoCampoTipoSchema` | `texto`/`texto_longo`/`numero`/`booleano`/`data`/`lista` | tipos de campo complementar |
| `produtoCampoChaveSchema` (regex) | `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–40 chars | formato da chave estável, referenciada pela IA/integrações |
| `opcoes` | máx. 50, cada até 60 chars | opções de campo `lista` |
| `produtoCamposGravarSchema.valores` | máx. 200 itens, `valor` até 2000 chars | tamanho do payload de gravação em lote |

### 6. Segurança / integridade 🟢

- `visivelAgente` por campo é o mesmo mecanismo de recorte "acesso é código" usado em
  `produtos` (fichas técnicas) — campo de uso interno (custo, margem) não sai no
  `apenasAgente: true`.
- 🟡 **Duas leituras independentes do mesmo recorte**: `ProdutoCamposService.valoresDoProdutoTx`
  filtra `visivelAgente` para a ferramenta de IA, mas `ProdutoParaAgenteService.camposVisiveis`
  (módulo `produtos`) refaz a mesma consulta (`produtoCampo`/`produtoCampoValor` com
  `visivelAgente: true`) em vez de reaproveitar este serviço — duas cópias da mesma regra
  de acesso correm o risco de divergir se uma for alterada sem a outra.
- Exclusão de definição é lógica e não apaga `ProdutoCampoValor` — o cadastro do produto
  sobrevive à restauração do campo; só a tela de preenchimento some.

### 7. Dependências do módulo 🟢

`PrismaService`, `@plataforma/contracts`. Exportado para `produtos`
(`ProdutoParaAgenteService`, lido de forma paralela — ver 6) e para a ferramenta de IA via
`ProdutoCamposService` (export do módulo).

### 8. Cobertura de testes 🟢

1 arquivo de spec: `normalizar-valor.spec.ts`, cobrindo os 4 tipos com conversão
(número com formato brasileiro, booleano, data com rolagem inválida, lista). Sem spec para
`ProdutoCamposService` (trava de tipo com valores preenchidos, `gravarValores`).

---

## Módulo `cliente-campo-config`

**Caminho:** `apps/api/src/modules/cliente-campo-config/`
**Arquivos (4):** `cliente-campo-config.module.ts`, `cliente-campo-config.controller.ts`,
`cliente-campo-config.service.ts`, `dto/cliente-campo-config.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Módulo pequeno e de propósito único: quais campos do cadastro de Cliente a empresa decide
travar para edição (ex.: "razão social" e "CNPJ/CPF" só o ERP altera). Não é RBAC — é
configuração por empresa, consultada por qualquer usuário autenticado (o próprio
formulário de Cliente a usa para desabilitar campo na tela) e **reforçada no servidor**
pelos serviços de `clientes` que de fato gravam.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `obterConfig` | Mapa campo → editável para toda a lista canônica de campos configuráveis; campo sem linha = editável (default) |
| `atualizar` | Upsert por campo (`empresaId_campo`) e devolve a config recalculada |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Lista canônica derivada do schema de Cliente (`CAMPOS_CLIENTE_CONFIGURAVEIS`) 🟢

Em `@plataforma/contracts`, a lista de campos configuráveis é `Object.keys(clienteCreateSchema.shape)`
mais `"cnaes"` (que não é coluna do cliente, mas a pergunta "quem pode mexer nisso?" é a
mesma). Decisão deliberada contra duplicar nomes de campo à mão: um campo novo no schema
de Cliente aparece aqui automaticamente, sem exigir um segundo lugar para lembrar de
atualizar.

#### 3.2 "Sem configuração = editável" (rollout sem quebra) 🟢

`obterConfig` usa `porCampo.get(campo) ?? true` — campo sem linha gravada em
`ClienteCampoConfig` é tratado como editável. Isso permite a lista canônica crescer (novo
campo no cliente) sem precisar de uma migration de dados que insira uma linha para cada
empresa existente; o travamento é opt-in, por empresa.

#### 3.3 Reforço server-side, e não só na tela 🟢

Quem de fato aplica a trava não é este módulo — é cada serviço de `clientes` que grava
(`ClientesService.update`, `ClienteCnaesService`, `ClientesReceitaLoteService`). O padrão
observado em `ClientesService.update` é **filtrar em silêncio**: campos com
`config[campo] === false` são removidos do `input` antes de aplicar a alteração — a
chamada não falha, apenas ignora o campo travado. Comentário explícito no código do módulo
`clientes` registra que isso existe justamente para quem tentasse forçar via API direta,
não só pela UI.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `cliente-campo-config`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `CAMPOS_CLIENTE_CONFIGURAVEIS` | chaves de `clienteCreateSchema` + `"cnaes"` | universo de campos que podem ser travados |

### 6. Segurança / integridade 🟢

- `GET /clientes-config/campos` é deliberadamente **sem** `@RequirePermission` (comentário
  explícito no controller) — qualquer usuário autenticado consulta, porque o próprio
  formulário de Cliente precisa saber o que desabilitar antes de qualquer ação de escrita.
- `PATCH /clientes-config/campos` exige `clientes-config.editar` — só quem administra a
  empresa decide o que trava.
- A trava em si não é controle de acesso a dado (RLS) — é regra de negócio consultada e
  aplicada por código em cada serviço consumidor; este módulo não impede nada por conta
  própria, só guarda a configuração. Risco correspondente: um novo caminho de escrita em
  `clientes` que esqueça de chamar `obterConfig` reabriria a edição do campo travado — ver
  também a nota equivalente em `produtos.CAMPOS_DO_ERP`, mesmo padrão.

### 7. Dependências do módulo 🟢

`PrismaService`, `@plataforma/contracts` (`CAMPOS_CLIENTE_CONFIGURAVEIS`,
`clienteCreateSchema` indiretamente). Consumido por `clientes`
(`ClientesService`, `ClienteCnaesService`, `ClientesReceitaLoteService`).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec. Módulo pequeno, mas a regra "sem configuração = editável" e o
upsert por `empresaId_campo` não têm teste dedicado.

---

## Módulo `estoque`

**Caminho:** `apps/api/src/modules/estoque/`
**Arquivos (4):** `estoque.module.ts`, `estoque.controller.ts`, `estoque.service.ts`,
`dto/estoque.dto.ts`, 1 spec.

### 1. Responsabilidade 🟢

Consulta **só-leitura** de saldo de estoque — "nada de create/update/delete manual"
(comentário explícito no código): o saldo entra só pelo import do legado (e no futuro por
API externa de manutenção). Listagem agregada por produto (soma em todos os armazéns de
revenda, ou só no armazém filtrado) e detalhe por produto aberto por armazém.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `findAll` | Listagem agregada por produto, com filtro de armazém/categoria/busca/`comSaldo`, ordenação incluindo por saldo agregado |
| `findByProduto` | Detalhe de um produto aberto por armazém (não some do total) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Regra de "armazém de revenda" como filtro universal 🟢

`estoqueFilter`/`AND: [{ armazem: { revenda: true } }]` é aplicado em toda leitura de
estoque da plataforma (listagem, detalhe, ordenação por saldo) — decisão de negócio
datada de 29/09/2026 no comentário do código: só conta o estoque dos armazéns marcados
pelo ERP como de revenda (`MV_BJAPI16` no Protheus). Um armazém não-revenda com saldo
positivo não aparece em lugar nenhum da tela de Estoque.

#### 3.2 Visibilidade de armazém/produto inativo condicionada a saldo 🟢

Duplo filtro "inativo só aparece com saldo":
- **Armazém**: `OR: [{ armazem: { ativo: true } }, { armazem: { ativo: false }, saldo: { gt: 0 } }]`
  — uma linha de armazém desativado só entra na conta se ainda tiver saldo positivo
  (zerar o saldo tira a linha da leitura, mesmo sem reativar o armazém).
- **Produto**: mesma lógica — produto inativo só aparece na listagem/detalhe se tiver
  saldo em algum armazém de revenda; sem saldo, comporta-se como se não existisse
  (`findByProduto` lança `NotFoundException` mesmo existindo o cadastro).
- Produto também precisa estar em categoria `usado: true` **e** `ativo: true` (marcação
  da plataforma + status do ERP) para entrar na listagem — categoria não "usada" ou
  inativa no ERP tira o produto inteiro, independente de saldo.

#### 3.3 `comSaldo` — três modos de filtro sobre a mesma relação `estoques` 🟢

- `comSaldo === false`: produto cuja **toda** linha que conta (dentro de `estoqueFilter`)
  está zerada — combinação `some: estoqueFilter` + `every: { OR: [{ NOT: estoqueFilter },
  { saldo: { lte: 0 } }] }` (comentário do código resume como "toda linha que conta está
  zerada"; linha fora do filtro — não-revenda, por exemplo — não entra na verificação).
- `comSaldo === true`: ao menos uma linha dentro do filtro com saldo positivo.
- Sem `comSaldo` mas com `armazemId`: ao menos uma linha no armazém filtrado (sem exigir
  saldo positivo).

#### 3.4 Ordenação por saldo agregado — paginação em SQL cru 🟢

`sortBy === 'saldoTotal'` não é ordenável pelo Prisma (`ORDER BY` por soma agregada antes
do `LIMIT`): o service primeiro busca os ids candidatos respeitando o `where` de
visibilidade, depois roda um `$queryRaw` que agrega `SUM(e.saldo)` por produto com os
mesmos critérios de armazém revenda/ativo, pagina ali (`LIMIT`/`OFFSET`) e por fim busca
os produtos completos pelos ids ordenados, reordenando o resultado em memória
(`posicoes.get(a.id)! - posicoes.get(b.id)!`) porque o segundo `findMany` não garante a
ordem do `IN`. Testado em `estoque.service.spec.ts` (verifica o SQL gerado e a
reordenação, para `asc`/`desc`).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `estoque`.

### 5. Metadados e configurações 🟢

Nenhuma constante de módulo — toda regra de negócio ("revenda", visibilidade por saldo) é
expressa diretamente nos filtros Prisma/SQL, documentada em comentário no topo do service.

### 6. Segurança / integridade 🟢

- Módulo é deliberadamente read-only: controller só expõe `GET`s, e o comentário no
  service reforça que não deve existir mutação manual de saldo — qualquer gravação é
  responsabilidade do import/API de integração (fora deste módulo).
- Mesmo critério de "categoria usada e ativa" e "produto com saldo mesmo inativo" é
  citado no módulo `produtos` (`query.categoriaAtiva`) como o mesmo da Consulta de
  Estoque — duas implementações independentes da mesma regra (🟡 risco de divergência se
  uma mudar sem a outra, mesmo padrão já anotado em `produto-campos`/`produtos`).

### 7. Dependências do módulo 🟢

`PrismaService`, `common/pagination/paginate` (`buildPaginatedResult`,
`paginationToSkipTake`), `@plataforma/contracts`. Sem dependência de outros módulos de
domínio — é consumido pela tela de Estoque e, por critério equivalente (não por import de
código), pela listagem de `produtos` com `categoriaAtiva`.

### 8. Cobertura de testes 🟡

1 spec (`estoque.service.spec.ts`), focado exclusivamente na ordenação por saldo agregado
e paginação via SQL cru. Sem spec para os filtros de visibilidade (revenda, inativo com
saldo, `comSaldo`) nem para `findByProduto`.

---

## Módulo `estrutura`

**Caminho:** `apps/api/src/modules/estrutura/`
**Arquivos (4):** `estrutura.module.ts`, `estrutura.controller.ts`,
`estrutura.service.ts`, `dto/estrutura.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Catálogo global do menu lateral (Módulo → Menu/Submenu → Rotina) e o liga/desliga desse
catálogo por empresa e por plano de assinatura. Dois públicos bem distintos: administrador
da **plataforma** mantém o catálogo (cria módulo, menu, rotina — `PlatformAdminGuard`);
administrador da **empresa** decide o que a empresa usa dentro do que o plano permite
(`EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina`).

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `listModulos` | Árvore do menu para montar a navegação — só o que está ativo (catálogo + empresa + plano) |
| `listArvore` | Mesma árvore, mas **com** o que está inativo, marcado em `ativoNaEmpresa` — para a tela de administração religar |
| `desativadosDaEmpresa` | Calcula os sets de módulos/menus/rotinas desativados, combinando `Empresa*` (exceção manual) com o plano da assinatura (allowlist) |
| `definirModuloDaEmpresa`/`definirMenuDaEmpresa`/`definirRotinaDaEmpresa` | Upsert do liga/desliga por empresa |
| `createModulo`/`updateModulo`/`removeModulo`, idem `Menu`/`Rotina` | CRUD do catálogo global (sem `empresaId` — não passa por `withTenant`) |
| `validarMenuPai` | Regras de hierarquia de menu (máx. 2 níveis, não auto-referência, mesmo módulo) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 "Ausência de linha = ligado" (dupla camada: exceção manual + allowlist do plano) 🟢

`desativadosDaEmpresa` combina duas fontes independentes num só conjunto de ids
desativados:
- **Exceção manual**: linha em `EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina` com
  `ativo: false` — "ausência de linha significa ligado" (comentário explícito no schema),
  decisão para não precisar gravar uma linha por empresa × módulo a cada módulo novo, e
  para o módulo recém-criado já nascer disponível para todo mundo.
- **Allowlist do plano**: se a assinatura tem um plano com `planoModulos.size > 0` (plano
  restringe módulos), **todo** módulo que não está na lista do plano entra no conjunto de
  desativados, mesmo sem linha em `EmpresaModulo` — plano vazio (`size === 0`) não
  restringe nada (interpretado como "sem restrição definida", não "nada permitido").
  Mesma lógica independente para menus e rotinas.
- As duas fontes se somam (`Set.add`), nunca se cancelam: módulo banido pelo plano não
  pode ser reativado pela exceção manual da empresa (a exceção manual só liga/desliga
  dentro do que o plano já permite — o código não verifica essa precedência
  explicitamente, mas a soma dos sets garante o efeito). 🟡 (a precedência não é
  verificada por teste automatizado)

#### 3.2 `listModulos` filtra em cascata; `listArvore` só marca 🟢

`listModulos` remove do retorno módulo/menu/submenu/rotina desativados (filtro recursivo
nos 4 níveis) — é o que monta o menu lateral de verdade. `listArvore` devolve a árvore
**inteira**, incluindo inativos no catálogo global (`deletedAt: null` sem `ativo: true`),
e anota `ativoNaEmpresa` em cada nível — sem isso a tela de administração não teria como
religar o que foi desligado (um item filtrado não aparece para ser clicado de novo).

#### 3.3 Hierarquia de menu — máximo 2 níveis (`validarMenuPai`) 🟢

Regras, na ordem: não pode ser pai de si mesmo; o pai precisa existir; o pai precisa estar
no **mesmo módulo** do filho (`updateMenu` propaga a troca de módulo do pai para todos os
submenus via `updateMany`, para não deixar submenu órfão de módulo); o pai não pode já ser
submenu de outro (`pai.menuPaiId` truthy); e o menu que está se tornando submenu não pode
já ter os próprios submenus — a hierarquia trava em 2 níveis por construção, não por
constraint de banco.

#### 3.4 Exclusão de menu bloqueada por submenu (`removeMenu`) 🟢

Menu com submenus ativos não pode ser excluído (`BadRequestException`) — força "exclua ou
mova os submenus antes", em vez de um soft delete em cascata que deixaria submenu
apontando para um pai inexistente na prática.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `estrutura`.

### 5. Metadados e configurações 🟢

Nenhuma constante de módulo além de `ROTINA_SELECT` (projeção fixa de campos de rotina
reaproveitada nas duas árvores).

### 6. Segurança / integridade 🟢

- `PlatformAdminGuard` (`user.administradorPlataforma`) protege toda mutação do catálogo
  global (`createModulo`/`updateModulo`/`removeModulo`, idem `Menu`/`Rotina`) —
  administrador de empresa comum não altera o que é compartilhado entre todos os
  tenants, mesmo tendo a permissão `estrutura.*` do próprio perfil. É o único módulo do
  inventário até aqui com guard de "administrador global" separado de RBAC por empresa.
- `definirModuloDaEmpresa`/`definirMenuDaEmpresa` (liga/desliga **da empresa**)
  deliberadamente **não** passam por `PlatformAdminGuard` — comentário explícito no
  controller: é controle do administrador da empresa, não do catálogo global.
- CRUD do catálogo (`Modulo`/`Menu`/`Rotina`) não usa `withTenant` — são entidades sem
  `empresaId`, sem RLS; `EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina` têm `empresaId` e
  usam `withTenant`.

### 7. Dependências do módulo 🟢

`PrismaService`, `PlatformAdminGuard`, `@plataforma/contracts`. Lido por qualquer tela
autenticada para montar a navegação (`GET /modulos`); `desativadosDaEmpresa` depende de
`Assinatura`/`Plano` (módulos `assinaturas`/`planos`, ainda não analisados neste
inventário).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec. Lacuna notável na combinação exceção-manual + allowlist-do-plano
(3.1) e na hierarquia de 2 níveis de menu (3.3), ambas com várias ramificações de
validação sem cobertura automatizada.

---

## Módulo `fornecedores`

**Caminho:** `apps/api/src/modules/fornecedores/`
**Arquivos (4):** `fornecedores.module.ts`, `fornecedores.controller.ts`,
`fornecedores.service.ts`, `dto/fornecedor.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Cadastro de fornecedor **espelhado do ERP**, só-leitura pela API interna: dados entram e
saem só pela API de integração (`/integracao/fornecedores`). Listagem com busca e filtro,
e detalhe por id.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `findAll` | Listagem paginada com busca (razão social, nome fantasia, CNPJ/CPF, código ERP) e filtros (`ativo`, `uf`) |
| `findOne` | Detalhe por id, 404 se não encontrado ou excluído |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Sem escopo hierárquico — diferente de Clientes 🟢

Comentário explícito no topo do service: fornecedor não tem carteira (não há
`vendedorId`), então não passa pelo `resolverEscopoVendedores` que `clientes` usa. Quem
enxerga a tela já é recorte de perfil (RBAC — só Administrador e Diretor, conforme a
migration `perm_compras` citada no comentário); o isolamento que resta é o de empresa, via
RLS/`withTenant`. Não há lógica de negócio adicional no módulo além de busca/paginação.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `fornecedores`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `SORT_FIELDS` | `razaoSocial`/`nomeFantasia`/`codigoErp`/`municipio`/`uf`/`ativo`/`createdAt` | whitelist de ordenação |

### 6. Segurança / integridade 🟢

- Puramente read-only pela API interna — nenhuma rota de escrita neste módulo; a
  superfície de mutação é só a API de integração (fora deste inventário de módulo).
- RLS por `empresaId` via `withTenant`; sem exceção de "modo sistema" aqui (fornecedor não
  está na lista de entidades com RLS por grupo econômico do CLAUDE.md do projeto).

### 7. Dependências do módulo 🟢

`PrismaService`, `common/pagination/paginate`, `@plataforma/contracts`. Consumido por
`produtos` (seleção de fabricante/fornecedor em `opcoesFiltro`) e por `notas-entrada`/
`notas-saida` (relação `Fornecedor`, ainda não analisados).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec. Módulo pequeno e sem lógica de negócio complexa, mas sem
cobertura nenhuma mesmo assim.

---

## Módulo `notas-entrada`

**Caminho:** `apps/api/src/modules/notas-entrada/`
**Arquivos (4):** `notas-entrada.module.ts`, `notas-entrada.controller.ts`,
`notas-entrada.service.ts`, `dto/nota-entrada.dto.ts`, `notas-entrada.service.spec.ts`.

### 1. Responsabilidade 🟢

Consulta read-only das notas fiscais de **compra**, espelho do ERP (SF1): listagem
paginada e detalhe com itens embutidos (sem rotina própria de item). `tipo` separa dois
documentos: `'N'` compra (participante = fornecedor) e `'D'` devolução de venda
(participante = cliente). Os dados entram só pela API de integração
(`integracao/notas-entrada`, módulo irmão fora deste — ver §7); este módulo não tem
create/update/delete.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `findAll(empresaId, query)` | filtros (`ativo`, `fornecedorId`, `clienteId`, `tipo`, `ano`, `mes`, `search`) + paginação/ordenação | lista paginada com `fornecedor`/`cliente` embutidos | Baixa |
| `findOne(empresaId, user, id)` | id da nota | nota com fornecedor, cliente, condição de pagamento e itens (com produto/armazém) | Média — ramifica por permissão (§3.1) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Duas portas de acesso ao detalhe (`findOne`) 🟢

Quem tem `notas-entrada.visualizar` (ou é admin) vê qualquer nota, sem restrição — é a
tela de Compras. Quem chega só por `posicao-cliente.visualizar` (a aba Devoluções da
Posição de Cliente) **não pode** usar o id da nota como chave livre: o `where` é forçado
a `tipo: 'D'` e a `cliente.vendedorId` dentro do escopo de carteira do usuário
(`resolverEscopoVendedores` — mesmo mecanismo usado em `clientes`), ou `cliente: {isNot:
null}` quando o escopo é a carteira inteira (vendedor sem restrição/gerência). O
comentário no código é explícito sobre o motivo: a nota de compra carrega **custo**, e o
id não pode ser a chave que abre esse dado para quem só devia ver a própria devolução.
Coberto por `notas-entrada.service.spec.ts` (3 casos: acesso pleno, escopo restrito,
escopo de carteira inteira).

#### 3.2 Sem escopo hierárquico em `findAll` 🟢

Comentário explícito no topo do service: compra não tem carteira de vendedor — quem
enxerga a listagem já é recorte de perfil (a migration `perm_compras` restringe a rotina
a Administrador/Diretor). `findAll` não chama `resolverEscopoVendedores`; o único corte é
`empresaId` via RLS/`withTenant`. Difere de `findOne`, que tem a segunda porta de acesso
do §3.1.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `notas-entrada`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `SORT_FIELDS` | `numero`/`dtEmissao`/`dtEntrada`/`vlrItens`/`vlrBruto`/`ativo`/`createdAt` | whitelist de ordenação; fora da lista cai no default |
| default de ordenação | `dtEmissao desc` | quando `sortBy` não é informado ou não está na whitelist |

### 6. Segurança / integridade 🟢

- RLS por `empresaId` via `withTenant` em ambas as funções.
- `findOne` tem dupla porta de permissão (`RequirePermission` com dois pares
  rotina/ação — ver `require-permission.decorator`), e o service reforça a segunda porta
  com filtro de dados (§3.1); a permissão por si só não bastaria para impedir acesso a
  notas de compra (tipo `'N'`) por quem só tem `posicao-cliente.visualizar`.
- Sem rota de escrita nesta API interna — mutação só pela API de integração, que valida
  `apiKeyId` e resolve `fornecedorChave`/`clienteChave`/`produtoChave`/`armazemChave` por
  tenant antes de gravar (fora do escopo deste módulo).

### 7. Dependências do módulo 🟢

`PrismaService`, `common/pagination/paginate`, `resolverEscopoVendedores`
(`common/escopo/escopo-vendedores`), `@plataforma/contracts`. Espelhado pelo módulo de
escrita `integracao/notas-entrada` (`IntegracaoNotasEntradaService`), que faz o upsert
por `chave` (X2_UNICO), resolve referências do ERP, denormaliza `fornecedorId`/
`clienteId`/`dtEmissao`/`ano`/`mes` em cada item e recalcula a flag `comodato` do
cabeçalho a partir do CFOP dos itens (`common/comodato`) — ver `NotaEntrada`/
`NotaEntradaItem` no `data-dictionary.md` para os campos que só a integração escreve
(`duplicata`/`geraDuplicata`, `aliqIpi`/`aliqIcms`). Consultado por `clientes.posicao`
(aba Devoluções) e por `relatorios` (apuração de compra, ainda não analisado).

### 8. Cobertura de testes 🟢

`notas-entrada.service.spec.ts` cobre as 3 ramificações de permissão do `findOne`
(§3.1). `findAll` e os filtros de busca (`search` por número/chaveNfe/razão social) não
têm teste.

---

## Módulo `notas-saida`

**Caminho:** `apps/api/src/modules/notas-saida/`
**Arquivos (7):** `notas-saida.module.ts`, `notas-saida.controller.ts`,
`notas-saida.service.ts`, `dto/nota-saida.dto.ts`, `nota-flags.ts`, `nfe-xml.ts`,
`danfe-pdf.ts`, `nfe-xml.spec.ts`.

### 1. Responsabilidade 🟢

Consulta read-only das notas fiscais de **venda**, espelho do ERP (SF2): listagem
paginada, detalhe com itens e, exclusivo deste módulo, a **2ª via de DANFE** (PDF) e o
**XML autorizado** da NF-e para download — ambos renderizados/lidos sob demanda a partir
do XML que o ERP empurrou pela integração (não deste módulo). `tipo` separa dois
documentos: venda normal e `'D'` devolução de compra (participante = fornecedor, não
cliente). Dados entram só pela API de integração (módulo irmão, fora deste); sem
create/update/delete aqui. Compartilha com `notas-entrada` a estrutura geral, mas tem
responsabilidade extra (parsing de XML + geração de PDF) que o módulo de compra não tem.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `findAll(empresaId, user, query, opcoes?)` | filtros (`ativo`, `clienteId`, `vendedorId`, `comodato`, `tipo`, `devolucao`, `ano`, `mes`, `search`) + paginação/ordenação | lista paginada com `cliente`/`fornecedor`/`vendedor` embutidos + flag `temXml` | Média — escopo por carteira + filtro de devolução (§3.1) |
| `findOne(empresaId, user, id, opcoes?)` | id da nota | nota com cliente, fornecedor, vendedor, condição de pagamento e itens (produto, regra de desconto); comissão ocultada conforme parâmetro | Média — escopo por carteira + ocultação de comissão |
| `gerarDanfe(empresaId, quem, id, opcoes?)` | id da nota | `{ conteudo: Buffer PDF, nomeArquivo, chave, cancelada, numero, clienteId, vendedorId }` | Alta — lê XML, extrai dados, monta PDF, registra evento condicional (ver flowchart de função) |
| `obterXml(empresaId, user, id, opcoes?)` | id da nota | `{ conteudo: Buffer XML, nomeArquivo, clienteId, vendedorId }` | Baixa — delega a `lerXml`, registra evento |
| `lerXml(empresaId, quem, id)` *(privado)* | id da nota | `{ nota, conteudo: Buffer }` | Média — resolve escopo por `QuemPede` (usuário ou cliente no WhatsApp), 404/409 |
| `registrarEvento(...)` *(privado)* | nota, autor, evento, detalhes | grava atividade no histórico do cliente | Baixa |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Escopo por carteira usa o vendedor do **cliente**, não o da nota 🟢

Comentário explícito no topo do service: `notaSaida.vendedorId` é quem efetivamente fez a
venda (exibido na tela), mas o filtro de "quem pode ver esta nota" usa
`cliente.vendedorId` (o vendedor do CADASTRO do cliente). Efeito: uma nota registrada por
outro vendedor cobrindo a carteira continua visível para quem enxerga aquele cliente.
Implementado via `combinarFiltroVendedor(escopo, query.vendedorId)` sobre a relação
`cliente` em `findAll`, e via `cliente: { vendedorId: { in: escopo } }` em `findOne`
(mesmo mecanismo de `resolverEscopoVendedores` usado em `clientes`/`notas-entrada`).

#### 3.2 Devolução de compra (`tipo = 'D'`) não tem dono de carteira 🟢

`query.devolucao === true`: filtro vira `{ tipo: 'D' }` e **ignora** o filtro de
vendedor/cliente — se `escopo` não é `null` (usuário restrito), o `where` força
`{ id: { in: [] } }` (nunca retorna nada), porque a devolução não tem cliente associado
(destinatário é fornecedor) e não há carteira que a enxergue. Só quem vê tudo
(`escopo === null`) lista devoluções. `query.devolucao === false` exclui esse tipo
explicitamente (`tipo: null OU tipo != 'D'`); `devolucao` ausente não filtra por tipo.
Mesmo padrão do `TIPO_DEVOLUCAO` em `notas-entrada`, mas invertido (lá a devolução é do
cliente; aqui, do fornecedor).

#### 3.3 `lerXml` — leitura em duas etapas, sem o XML na consulta de escopo 🟢

O `select` da consulta de nota **não inclui** `xml.conteudo`: o conteúdo mora em
`NotaSaidaXml`, tabela acessória, e só é buscado (`findUnique` por `notaSaidaId`) depois
que o escopo já aprovou o acesso à nota. Isto evita que a listagem ou qualquer consulta
intermediária arraste megabytes de XML sem necessidade (mesmo racional de design documentado
no schema da tabela). Resolve o recorte via `recorteDoSolicitante(tx, empresaId, quem)`
— `quem` é `QuemPede` (`{ tipo: 'usuario', user }` ou cliente via WhatsApp), que devolve
tanto `escopoVendedores` (lista ou null) quanto `clienteId` (quando quem pede é o próprio
cliente, recorte adicional por `clienteId`). Nota inexistente/fora de escopo → 404; nota
sem XML ainda recebido → 409 com mensagem explicando que o ERP precisa enviá-lo antes.

#### 3.4 `gerarDanfe` — XML → dados → PDF → evento condicional 🟢

Ver `flowcharts/notas-saida-gerarDanfe.md` para o fluxo completo. Pontos centrais:
- Erro de parsing do XML (`NfeXmlInvalidoError`) vira 409 com o número da nota e a causa —
  nunca um PDF vazio ou "inventado" a partir das colunas da tabela (comentário explícito em
  `danfe-pdf.ts`: o documento é a representação do que a SEFAZ autorizou, não um recálculo).
- Logo do emitente: tenta `empresa.logoDanfeUrl` primeiro, cai para `empresa.logoUrl`; a
  consulta de `Empresa` é feita **fora** da transação de tenant (`Empresa` não é tabela de
  tenant), mesmo padrão do PDF de orçamento.
- O evento no histórico (`danfe_gerado`) só é registrado **depois** que o PDF existe — XML
  ilegível vira 409 sem deixar rastro de uma 2ª via que ninguém recebeu.
- `opcoes.registrarEvento === false` desliga o registro automático para quem já grava um
  evento mais específico (ex.: o fluxo de WhatsApp grava "DANFE enviado" em vez de "DANFE
  gerado").

#### 3.5 Parser de XML próprio, com defesas explícitas contra XXE (`nfe-xml.ts`) 🟢

`lerXml` (em `nfe-xml.ts`, não confundir com o método privado do service de mesmo nome)
constrói a árvore do documento com regex, não com um parser XML genérico. Comentário no
topo do arquivo justifica a escolha: o XML já veio validado pela SEFAZ contra o schema da
NF-e, então não há necessidade de um parser completo — e trazer um parser genérico
traria junto a superfície de XXE (entidades externas, DTD). Duas garantias de segurança:
- **DOCTYPE, `<!ENTITY>` e instruções de processamento são descartados** no pré-processo,
  antes de qualquer parsing — sem resolução de entidade não há XXE nem billion-laughs.
- **Profundidade máxima de pilha = 60** (`PROFUNDIDADE_MAXIMA`): um XML forjado com
  aninhamento profundo lança `NfeXmlInvalidoError` em vez de estourar a pilha do processo.
- `NFE_XML_MAX_BYTES = 5 MiB` é o teto aceito na ingestão (não reforçado neste arquivo —
  é um limite documentado para quem grava `NotaSaidaXml`, já que uma NF-e de 990 itens
  não passa de ~2 MB).

`extrairNfe` aceita tanto `nfeProc` (nota + protocolo de autorização — o que o ERP deve
mandar) quanto `NFe` sozinha; sem `nfeProc` o DANFE sai sem protocolo, carimbado "SEM VALOR
FISCAL" (ver §3.6), nunca como se tivesse sido autorizado. Cancelamento é inferido do
`cStat` do protocolo (`101`, `135`, `151`, `155` = cancelamento homologado).

#### 3.6 `montarDanfePdf` — paginação de itens e carimbos (`danfe-pdf.ts`) 🟡

Reproduz o layout do DANFE retrato que o Protheus imprime (pedido do usuário, 01/10/2026,
tendo o PDF do ERP como modelo) — mesmos quadros, mesma ordem, mesma composição de campos.
Primeira folha: canhoto, cabeçalho, destinatário, fatura, impostos, transporte e o quadro
de itens que cabem antes do rodapé fixo (`ALTURA_RODAPE`); itens que não couberem
continuam em folhas seguintes, cada uma repetindo o cabeçalho. `escreverItens` devolve o
índice de parada quando a próxima linha não cabe mais no quadro (considerando que a
descrição pode quebrar em várias linhas); se um item sozinho não cabe nem numa folha vazia,
o loop para (`proximo === antes`) para não entrar em loop infinito. O número de folhas só
é conhecido no final — por isso "FOLHA x/y" é escrito numa segunda passada
(`folhas: MarcaFolha[]` guarda página/posição de cada cabeçalho). Carimbo
("NF-e CANCELADA" ou "SEM VALOR FISCAL") é desenhado por último, em todas as páginas, para
ficar por cima do conteúdo. **Não recalcula nenhum valor fiscal** — todo número vem
literalmente do XML (`decimal()` só formata).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `notas-saida`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `SORT_FIELDS` | `numero`/`dtEmissao`/`vlrItens`/`vlrBruto`/`ativo`/`createdAt` | whitelist de ordenação; fora da lista cai no default |
| default de ordenação | `dtEmissao desc` | quando `sortBy` não é informado ou não está na whitelist |
| `TIPO_DEVOLUCAO` | `'D'` | marca devolução de compra (destinatário = fornecedor) |
| `NFE_XML_MAX_BYTES` (`nfe-xml.ts`) | 5 MiB | teto do XML aceito na ingestão |
| `PROFUNDIDADE_MAXIMA` (`nfe-xml.ts`) | 60 | teto de aninhamento do parser próprio |
| `MODALIDADE_FRETE` (`danfe-pdf.ts`) | mapa `0`–`4`,`9` → rótulo | tradução do `modFrete` do XML para o texto impresso no DANFE |
| cStat de cancelamento (`nfe-xml.ts`) | `101`/`135`/`151`/`155` | marca `cancelada: true` em `extrairNfe` |

### 6. Segurança / integridade 🟢

- RLS por `empresaId` via `withTenant` em todas as funções.
- Escopo por carteira em `findAll`/`findOne`/`lerXml`, resolvido sobre o vendedor do
  **cliente**, não o da nota (§3.1) — e com a ramificação própria da devolução (§3.2).
- `gerarDanfe`/`obterXml` aceitam tanto usuário logado quanto cliente via WhatsApp
  (`QuemPede`/`recorteDoSolicitante`), cada um com seu recorte (carteira ou só as próprias
  notas) — mesmo endpoint de serviço, duas origens de chamada (controller HTTP e ações de
  conversa).
- XML nunca trafega na consulta de escopo (§3.3) — só é lido depois que o acesso à nota já
  foi confirmado.
- Parser de XML próprio recusa DOCTYPE/ENTITY e limita profundidade de aninhamento (§3.5) —
  decisão deliberada para não importar um parser genérico com superfície de XXE.
- Sem XML autorizado na plataforma → 409 explícito (nunca PDF/XML vazio ou inventado).
- Sem rota de escrita nesta API interna — mutação só pela API de integração (fora deste
  módulo), que recebe o XML e grava em `NotaSaidaXml`.
- Download de DANFE/XML grava evento no histórico do cliente (`registrarAtividadeDocumento`)
  — rastreabilidade de quando um documento fiscal foi entregue a alguém.

### 7. Dependências do módulo 🟢

`PrismaService`, `ParametrosService` (parâmetro `COMISSAO_OCULTA_PARA_TODOS`),
`common/pagination/paginate`, `common/escopo/escopo-vendedores`
(`resolverEscopoVendedores`, `combinarFiltroVendedor`), `common/escopo/quem-pede`
(`QuemPede`, `recorteDoSolicitante`, `autorDoEvento`),
`common/atividades/registrar-atividade-documento`, `common/permissoes/pode-ver-comissao`
(`ocultarComissaoDosItens`), `common/pdf/carregar-logo`, `common/pdf/barcode`
(`code128cModulos`, `desenharBarras`, `larguraBarras` — usado no código de barras da chave
de acesso), `jspdf`, `@plataforma/contracts`. Exportado (`NotasSaidaModule.exports`) para
as ações da conversa de WhatsApp, que delegam aqui em vez de consultar a nota por conta
própria — mesmo padrão de reuso documentado no comentário do módulo. Consultado por
`clientes.posicao` (histórico/posição do cliente) e por `relatorios` (apuração de venda,
ainda não analisado).

### 8. Cobertura de testes 🟢

`nfe-xml.spec.ts` (153 linhas) cobre os três pontos mais sensíveis do módulo:
- `extrairNfe`: namespace, `nfeProc` com protocolo, decodificação de entidade e CDATA,
  leitura de ICMS independente do grupo de tributação (ICMS00 vs ICMSSN102 — Simples
  Nacional), totais/duplicatas/transporte, marcação de cancelada por `cStat`, e as duas
  rejeições (XML que não é NF-e; chave sem 44 dígitos).
- `lerXml`: **teste explícito de XXE** — DOCTYPE com `<!ENTITY xxe SYSTEM "file:///etc/passwd">`
  é descartado sem resolver a entidade — e tag vazia sem desbalancear a árvore.
- `montarDanfePdf`: formatação igual ao ERP (número com 9 dígitos, frete, datas sem
  conversão de fuso — regressão documentada no próprio teste: "o gerador antigo convertia
  pelo fuso do servidor e voltava um dia"), e paginação (60 itens forçando "FOLHA 01/02" /
  "FOLHA 02/02").

Sem spec para `notas-saida.service.ts`: a lógica de escopo por carteira (§3.1–3.3), o
tratamento de devolução (§3.2) e o fluxo completo de `gerarDanfe`/`obterXml` (§3.4),
incluindo os 404/409 e o registro condicional de evento, não têm teste automatizado —
mesma lacuna de `notas-entrada`, mas aqui o risco é maior porque há mais ramificações
(duas origens de chamada via `QuemPede`, condição de devolução).

---

## Módulo `sugestao-compra`

**Caminho:** `apps/api/src/modules/sugestao-compra/`
**Arquivos (6):** `sugestao-compra.module.ts`, `sugestao-compra.controller.ts`,
`sugestao-compra.service.ts` (1502 linhas — o maior arquivo de service analisado até
aqui), `dto/sugestao-compra.dto.ts`, `anonimizar.ts`, `anonimizar.spec.ts`.

### 1. Responsabilidade 🟢

Motor de recomendação de cross-sell: *"clientes parecidos com este compram algo que ele
não compra?"*. Dois modos que **compartilham o mesmo motor** (`gerarLinhasParaCliente`/
cálculo ao vivo com a mesma regra de semelhança) para nunca divergirem:
- **Ao vivo** (`paraCliente`): calcula na hora, devolve evidência completa (quem compra,
  quanto, preço na tabela do cliente). Usado pela tela e por uma ferramenta do agente de
  IA interno (módulo exportado — ver §7).
- **Gravado** (`gerarLote`/`gerarParaCliente` + `calculadaDoCliente`): roda o motor e
  grava em `sugestoes_compra` (`origem: 'local'`), para o catálogo de sugestões não
  depender de uma consulta cara a cada leitura — é o que o WhatsApp de funcionário
  (`clientes_sem_compra_no_mes`, módulo não analisado) espera encontrar já pronto. O lote
  roda em segundo plano (`iniciarLote`/`executarLote`), com acompanhamento por
  `ultimaExecucao` e notificação no sino ao terminar. Disparo manual — não há scheduler.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `paraCliente(empresaId, user, clienteId, query)` | cliente + parâmetros de ajuste (`meses`, `limite`, `semelhantes`, `baseSemelhanca`, `afinidadeCnae`) | `SugestaoCompraResultado` com evidência completa | Alta — orquestra elegibilidade, ramo, semelhança e produtos (ver flowchart de função) |
| `listagem(empresaId, user, query)` | filtros (`ativo`, `uf`, `municipio`, `vendedorId`, `bloqueado`, `search`) + paginação | 1 linha por cliente com `ultimoCalculo`/`qtdSugestoes` (SQL raw com subquery agregada) | Média |
| `calculadaDoCliente(empresaId, user, clienteId)` | id do cliente | o que está gravado em `sugestoes_compra`, com preço **atual** da tabela | Baixa |
| `gerarLinhasParaCliente(...)` *(privado)* | cliente, janela de datas | linhas prontas para `createMany` (não grava) | Alta — o motor determinístico, compartilhado por lote e individual |
| `gerarLote(empresaId, user, body)` | escopo + faixa de código opcional | grava sugestões do recorte inteiro, apagando o anterior | Alta — sequencial por cliente, transação de até 15 min |
| `iniciarLote`/`executarLote` | mesmo body | `202` imediato; grava `SugestaoCompraExecucao` e roda `gerarLote` sem `await` | Média — orquestração assíncrona + notificação |
| `gerarParaCliente(empresaId, user, clienteId, meses?)` | 1 cliente | recalcula e grava só este cliente; 400 se inativo/bloqueado | Média |
| `excluirCalculo(empresaId, user, filtro)` | 1 cliente ou recorte (escopo + faixa) | apaga `origem: 'local'`; 409 se lote rodando | Baixa |
| `ultimaExecucao(empresaId)` | — | última `SugestaoCompraExecucao` da empresa, com nome do usuário | Baixa |
| `clientesDoMesmoRamo`/`motivoInelegivel`/`clientesElegiveis` *(privados)* | cliente/escopo | listas/motivos de elegibilidade reusados pelas funções acima | Média |
| `buscarSemelhantes`/`produtosDosSemelhantes`/`cestaDoCliente`/`precosNaTabelaDoCliente` *(privados)* | parâmetros de cálculo | os blocos de SQL que `paraCliente` e `gerarLinhasParaCliente` montam em cima | Alta — SQL raw com CTEs (ver §3.3) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Elegibilidade: só CNPJ com CNAE, só o ramo como universo de comparação 🟢

`motivoInelegivel`: CPF (documento com 11 dígitos) ou cliente sem nenhum `ClienteCnae`
nunca recebe sugestão — decisão do usuário de 07/10/2026, documentada em comentário no
código: comparar com a base toda sugeriria produto sem ligação com a atividade.
`clientesDoMesmoRamo` define o universo: o CNAE **principal** do cliente (ou, sem
principal marcado, todos os CNAEs dele), e "do mesmo ramo" é qualquer cliente ativo da
**base inteira** (não só a carteira) cujo CNAE principal bate com um desses. Retorna
`null` quando o cliente não tem CNAE algum — sem atividade, não há com quem comparar.

#### 3.2 Escopo decide quem é identificado, não quem entra no cálculo 🟢

Comentário no topo da classe é explícito sobre a inversão: o **alvo** precisa estar na
carteira do usuário (consulta de cliente alheio continua vedada), mas os **comparáveis**
vêm da base inteira — "a semelhança por ramo diz muito mais com 800 clientes do que com
os 60 de uma carteira, e o que se entrega são produtos, não clientes". O corte acontece
na **saída**: em `paraCliente`, cada `clienteSemelhante` fora da carteira
(`naCarteira: false`) volta anonimizado (`clienteId: ''`, sem razão social, sem
município) — contribuiu para o padrão sem ser revelado. Em `produtosDosSemelhantes`, a
evidência (`ARRAY_AGG` de razão social) só nomeia quem está em `daCarteira`; quem está
fora vira a contagem agregada `outrosClientes` ("+N cliente(s) do mesmo perfil em outras
carteiras"). Comentário de alerta no código: todo campo novo acrescentado a
`clientesSemelhantes` precisa passar pelo mesmo corte, ou vaza identidade de cliente de
outra carteira.

#### 3.3 Score de semelhança — dois eixos combinados, com peso de hierarquia de CNAE 🟢

`buscarSemelhantes` roda uma única consulta SQL com CTEs (`cestas`, `medidas`,
`cnae_alvo`, `cnae_pares`, `cnae_medidas`) e calcula em JS por cima:

- **Eixo cesta** (peso 0,6): índice de **Jaccard** entre os produtos comprados por cada
  par de clientes (interseção / união) — penaliza naturalmente o cliente que compra de
  tudo e por isso "parece" com todo mundo.
- **Eixo CNAE** (peso 0,4): dois sub-casos —
  - Subclasse idêntica (`nivel = 'subclasse'`): fórmula fixa `min(afinidade*0.65 + 0.35
    se mesmo CNAE principal, 1)`, onde `afinidade` satura em 3 CNAEs em comum (`min(n,3)/3`)
    — comentário explícito: esta fórmula **não pode mudar** quando a comparação por
    hierarquia foi introduzida (25/08/2026), senão a regra nova invalidaria scores que a
    regra antiga já validava.
  - Ramo vizinho (classe/grupo/divisão, só quando `afinidadeCnae: 'hierarquica'`):
    `PESO_NIVEL_CNAE[nivel] * TETO_VIZINHO (0.2)` — teto calculado para nunca ultrapassar
    o piso do caso exato (0,217), garantindo que "mesmo ramo" sempre vença "ramo
    parecido". Decisão de 25/08/2026 documentada no contrato: a regra antiga (só
    subclasse idêntica) ignorava 90 mil pares de clientes que a RCG mediu como do mesmo
    ramo em nível de classe.
- **Desempate por região** (+0,05 fixo): mesmo município/UF do alvo — só desempata,
  nunca promove cliente de outro ramo.
- `baseSemelhanca` (`'ambos'`/`'cesta'`/`'cnae'`) zera um dos dois pesos para permitir
  isolar o eixo na tela (comparação de resultados).
- Linhas sem nenhuma afinidade (sem produto em comum **e** sem CNAE em comum) são
  descartadas antes do score — "não é pouco parecido, é outro negócio".
- Top-K (`query.semelhantes`, 3–100) depois de ordenar por score desc.

#### 3.4 `gerarLinhasParaCliente` — o motor gravado, espelho do ao vivo com uma diferença 🟢

Compartilhado por `gerarLote` e `gerarParaCliente`, mas **não** é o mesmo código de
`buscarSemelhantes`: usa `Jaccard` puro (sem o eixo CNAE) para escolher os K clientes de
referência dentro do ramo — citação do código: "o resultado são produtos, não clientes,
então o CNAE já fez seu papel ao definir o ramo; dentro dele, só a cesta decide quem é
referência". Sem compra do alvo no período, ou sem ninguém do ramo com produto em comum,
a referência vira o **ramo inteiro** (`porCompra = false`), e o `motivo` gravado muda de
texto para refletir isso. Produto sugerido precisa de no mínimo `min(2, total)`
compradores na referência — salvo quando a referência tem 1 ou 2 clientes — para não
gravar idiossincrasia de um único cliente como padrão.

#### 3.5 "O que conta como venda" — mesmo critério do Dashboard e das Consultas 🟢

A constante SQL `NOTA_DE_VENDA` (nota ativa, tipo `'N'`, sem comodato, **e com
financeiro** — `geraDuplicata = true`, ou `null` com `condicaoPagamentoId` preenchido,
critério de fallback para integrações antigas) e `PRODUTO_VENDAVEL` (categoria marcada
como usada, sem ser equipamento de comodato) são reaproveitadas de
`common/vendas/venda-analitica.ts`/Dashboard, citadas explicitamente no comentário — a
cesta de compras tem que concordar com o que as outras telas chamam de venda, senão o
vendedor vê números que não batem entre telas.

#### 3.6 Lote: substituição por **recorte inteiro**, não por quem foi recalculado 🟢

`gerarLote` apaga a sugestão anterior de **todo o recorte elegível** (escopo + faixa de
código, `recorteInteiro: true` em `clientesElegiveis` — inclui inativo/bloqueado/sem CNAE,
não só quem passou no filtro de elegibilidade), não só de quem recebeu linha nova.
Racional: cliente que deixou de ser elegível (virou CPF, perdeu o CNAE, foi bloqueado)
não pode continuar com a sugestão de um cálculo antigo. Rodar só a faixa "004000 a
004999" não apaga quem está fora da faixa. Processamento é **sequencial** por cliente, de
propósito (comentário explícito): cada cliente já dispara uma varredura pesada sobre a
base inteira — em paralelo isso satura o pool de conexões do Postgres sem acelerar nada,
porque a base comparada é a mesma para todo mundo.

#### 3.7 Lote em segundo plano: 202 imediato, execução sem `await`, notificação no fim 🟢

`iniciarLote`: antes de criar a execução, marca como `falhou` qualquer execução que
ficou `rodando` além de `TEMPO_MAXIMO_LOTE_MS + 5min` (a API reiniciou no meio) — sem
isso, uma execução travada em `rodando` bloquearia a empresa para sempre, já que uma
única execução por empresa é garantida por índice parcial único da migration (não por
checagem em código; colisão gera `P2002` → 409). O disparo do trabalho real
(`executarLote`) é **sem `await`** (comentário: "é isto que tira o cálculo da
requisição") — o controller responde 202 na hora, e a tela acompanha por
`ultimaExecucao`. Sucesso ou falha, o fim sempre grava `SugestaoCompraExecucao` e cria
uma `Notificacao` (`sugestao_compra_calculada`) para quem pediu; a notificação falhando
é logada e engolida (`.catch`), para não derrubar o fluxo principal.

#### 3.8 `anonimizar.ts` — fronteira de dados para a IA, preparada mas não conectada 🟡

Arquivo isolado, pequeno de propósito (comentário explícito: "é aqui que a regra pode ser
quebrada sem ninguém notar"). Monta um payload com **só códigos opacos** (`C0`, `C1`...
+ códigos de CNAE/produto) para uma eventual consulta de semelhança via IA — nunca razão
social, CNPJ, endereço, valores ou descrição. `garantirPayloadAnonimo` é uma segunda
barreira em runtime: varre o JSON serializado atrás de qualquer chave da lista
`CAMPOS_PROIBIDOS` e lança em vez de enviar. Testado exaustivamente
(`anonimizar.spec.ts`, 8 casos). **Porém**: nenhuma função deste service (`paraCliente`,
`gerarLinhasParaCliente` etc.) chama `montarPayloadAnonimo`/`garantirPayloadAnonimo` —
toda a sugestão hoje roda pelo motor determinístico (`origem: 'local'`); `origem: 'ia'`
existe no enum do Prisma e no schema (`sugestaoCompraCalculadaItemSchema.origem`), mas
sem produtor. O arquivo é citado como precedente pelo módulo `agente`
(`anonimizar-agente.ts`), que aplica a mesma regra no chat do agente de IA — ver esse
módulo (não analisado nesta passada) para o consumidor real do padrão.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `sugestao-compra`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `TEMPO_MAXIMO_LOTE_MS` | 15 min | timeout da transação do lote e janela de "execução travada" em `iniciarLote` |
| `TETO_VIZINHO` | 0,2 | teto do sinal de ramo vizinho — ver §3.3 |
| `PESO_NIVEL_CNAE` (`@plataforma/contracts`) | subclasse 1 / classe 0,7 / grupo 0,4 / divisão 0,2 | peso por nível de parentesco hierárquico de CNAE |
| `NIVEL_CNAE` | `{4: subclasse, 3: classe, 2: grupo, 1: divisao}` | traduz o `MAX(nivel)` numérico do SQL para o nome |
| parâmetro `SUGESTAO_COMPRA_MESES` (`ParametrosService`) | configurável por empresa, default do schema = 12 | janela de histórico quando a query não informa `meses` |
| `sugestaoCompraQuerySchema` defaults | `meses:12 (1–60)`, `limite:10 (1–50)`, `semelhantes:30 (3–100)`, `baseSemelhanca:'ambos'`, `afinidadeCnae:'hierarquica'` | parâmetros ajustáveis da consulta ao vivo |
| `CAMPOS_PROIBIDOS` (`anonimizar.ts`) | 16 chaves (`razaoSocial`, `cnpjCpf`, `valorTotal`, `preco`...) | lista de bloqueio da barreira em runtime (§3.8) |

### 6. Segurança / integridade 🟢

- RLS por `empresaId` via `withTenant` em todas as funções; SQL raw (`$queryRaw`) sempre
  com `Prisma.sql`/`Prisma.join` parametrizado — nenhuma interpolação de string crua
  encontrada nesta passada.
- Alvo sempre restrito ao escopo de carteira do usuário (`resolverEscopoVendedores`);
  comparáveis da base inteira, mas com anonimização obrigatória na saída (§3.2) — é a
  principal superfície de vazamento do módulo se um campo novo for acrescentado sem
  passar pelo corte (alerta já deixado no comentário do código).
- `anonimizar.ts`: dupla barreira (montagem campo a campo + varredura em runtime) contra
  vazamento de dado de negócio para a IA — mas sem consumidor neste módulo hoje (§3.8),
  então a proteção ainda não está em um caminho de execução real aqui.
- `excluirCalculo`/`gerarLote` recusam com 409 enquanto outro lote está `rodando` —
  evita apagar/regravar por cima de um cálculo em andamento.
- Índice parcial único (migration, fora deste módulo) garante uma execução de lote por
  empresa — a checagem em código (`P2002`) é a segunda linha de defesa, não a primeira.
- Sem rota de escrita de dado de origem — a tabela de sugestão só é escrita por este
  módulo (`origem: 'local'`), não por integração externa.

### 7. Dependências do módulo 🟢

`PrismaService`, `ParametrosService` (parâmetro `SUGESTAO_COMPRA_MESES`),
`common/escopo/escopo-vendedores` (`resolverEscopoVendedores`),
`common/busca/termos-busca` (`condicaoBuscaTermosSql`),
`common/precos/resolver-tabela-preco-cliente`, `common/pagination/paginate`,
`@plataforma/contracts` (schemas + `PESO_NIVEL_CNAE`). Lê `notas_saida_itens`/
`notas_saida` (SQL raw — módulo `notas-saida`), `produtos`/`categorias`/
`equipamentos_comodato` (SQL raw), `cliente_cnaes`/`cnaes` (SQL raw),
`tabela_preco_item` (Prisma Client), grava `Notificacao` (módulo `notificacoes`, não
analisado). **Exportado** (`SugestaoCompraModule.exports`) para o módulo `agente`
consumir como ferramenta do assistente de IA interno (comentário explícito no módulo:
"Bloco D") — e citado como precedente de design por `agente/anonimizar-agente.ts`, mesmo
sem dependência de código direta entre os dois arquivos de anonimização.

### 8. Cobertura de testes 🟡

`anonimizar.spec.ts` (122 linhas, 8 casos) cobre exaustivamente a fronteira de dados para
IA: nenhum campo proibido escapa, os códigos necessários sobrevivem, rótulo opaco sem
UUID/código do ERP, CNAE sem código descartado, e as duas falhas da barreira em runtime
(campo solto no payload; campo aninhado dentro de um array). **Sem nenhum spec para
`sugestao-compra.service.ts`** — o arquivo com toda a lógica de negócio (1502 linhas): o
score de semelhança (§3.3), a elegibilidade (§3.1), o corte de escopo na saída (§3.2), o
motor gravado (§3.4), a substituição por recorte (§3.6) e a orquestração assíncrona do
lote (§3.7) não têm teste automatizado algum. É a maior lacuna de cobertura encontrada
até agora nesta extração, pela combinação de tamanho do arquivo e ausência total de spec
— ao contrário de `notas-saida`, que ao menos cobre o parser de XML e o PDF.

---

## Módulo `orcamentos`

**Caminho:** `apps/api/src/modules/orcamentos/`
**Arquivos (11):** `orcamentos.module.ts`, `orcamentos.controller.ts`,
`orcamentos.service.ts` (974 linhas), `dto/orcamento.dto.ts`,
`calcular-itens-orcamento.ts`, `registrar-atividade-orcamento.ts`,
`criar-atividade-retorno.ts`, `validade-orcamento.ts` (+ spec),
`proximo-numero-orcamento.ts`, `orcamento-pdf.ts` (428 linhas),
`pode-excluir-orcamento.spec.ts` (testa função de `@plataforma/contracts`, não deste
módulo).

### 1. Responsabilidade 🟢

Único módulo de **escrita completa** (CRUD) analisado até agora entre os módulos
comerciais — orçamento é proposta comercial que nasce na plataforma (diferente de
notas, que só espelham o ERP). Cabeçalho + itens, cálculo de preço/desconto/comissão a
partir da Tabela de Preço do cliente, fluxo de duas etapas para autorização de desconto
acima do limite, geração de PDF da proposta (mesmo arquivo que o WhatsApp anexa),
rastreamento de integração com o ERP (pedido de venda gerado a partir do orçamento
aprovado) e histórico completo de atividade no CRM. Compartilha três funções puras com
`IntegracaoOrcamentosService` (módulo de integração, não analisado): `calcularItensOrcamento`,
`registrarAtividadeOrcamento`/`criarAtividadeRetorno` — citado explicitamente no código
como garantia de que tela e API externa nunca divergem na regra de negócio.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `precoProduto(empresaId, user, clienteId, produtoId)` | cliente + produto | `vlrTabela`, `ultimoPreco`, `saldoEstoque`, `regraDesconto` (faixas ocultas se sem permissão de comissão) | Média |
| `findAll(empresaId, user, query, opcoes?)` | filtros (status, cliente, oportunidade, vendedor, origem, busca, datas) + paginação | lista paginada com comissão ocultada conforme parâmetro | Média |
| `findOne(empresaId, user, id, opcoes?)` | id | orçamento completo com itens | Baixa |
| `create(empresaId, user, input, opcoes?)` | cabeçalho + itens | orçamento criado; 409 se nascer já `aprovado` e exigir autorização | Alta — resolve vendedor/origem, calcula itens, condicional de atividade (ver flowchart de função) |
| `update(empresaId, user, id, input)` | id + campos parciais | orçamento atualizado; 409 se `aprovado`/`expirado` | Alta — mesma orquestração de `create`, mais as travas de status e derrubada de autorização |
| `remove(empresaId, user, id)` | id | soft delete; 409 se integrado ao ERP (`podeExcluirOrcamento`) | Baixa |
| `solicitarAutorizacaoDesconto`/`autorizarDesconto` | id | orçamento atualizado; 409 se já autorizado ou se nenhum item exige | Média — duas etapas do fluxo de desconto (§3.3) |
| `gerarPdf(empresaId, quem, id, opcoes?)` | id | `{conteudo: Buffer, nomeArquivo, numero}`; 409 se desconto pendente de autorização | Alta — monta dados fora/dentro da transação, delega a `montarOrcamentoPdf` |
| `calcularItensOrcamento` (arquivo próprio, compartilhado) | itens + cliente + vendedor | itens com `vlrTabela`/`percDesconto`/`vlrDesconto`/`vlrTotal`/`percComissao` calculados | Alta — ver §3.1 |
| `registrarAtividadeOrcamento`/`orcamentoExigeAutorizacao` (arquivo próprio) | evento + dados do orçamento | grava `Atividade` no histórico; resolve destinatário da pendência | Média — ver §3.2/§3.3 |

### 3. Algoritmos e lógica não-trivial

#### 3.1 `calcularItensOrcamento` — preço, desconto e comissão nunca vêm do cliente 🟢

O vendedor informa só `produtoId`/`quantidade`/`vlrUnitario` por linha; o servidor
recalcula tudo o mais a partir da Tabela de Preço resolvida para o cliente
(`resolverTabelaPrecoCliente` — cai na tabela padrão de capital/interior quando a do
cadastro está vazia/inativa):
- `vlrTabela`: preço da tabela, ou `null` se não há tabela aplicável/preço cadastrado —
  nesse caso `vlrUnitario` informado vale do mesmo jeito, sem desconto calculado.
- `vlrDesconto`/`percDesconto`: só quando `vlrTabela > vlrUnitario` (desconto real, não
  acréscimo).
- `percComissao`: resolve a regra de desconto aplicável (`resolverRegrasDescontoDosItens`
  — ordem tabela de preço > produto > categoria > regra padrão) e aplica
  `calcularComissaoItem` (`@plataforma/contracts`) sobre o `percComissao` **base** do
  cadastro do vendedor — sem percentual base cadastrado, a comissão da linha fica `null`
  (não apurada), nunca `0` (zero seria "apurada e é zero").
- Parâmetro `DESCONTO_ACIMA_LIMITE_BLOQUEIA` (por empresa): desligado (default), desconto
  acima do máximo da regra só vira aviso (`comissao.acimaDoMaximo`) na resposta; ligado,
  `calcularItensOrcamento` lança `BadRequestException` e a gravação é recusada na hora —
  nunca grava e avisa depois.
- Valor de `percComissao`/`regraDescontoId` vindo do **payload** prevalece quando
  presente — só a API de integração (ERP é dono do número) informa isso; pela tela, nada
  vem preenchido e vale sempre o cálculo.

#### 3.2 Vendedor do orçamento é sempre o do cadastro do cliente, nunca escolha livre 🟢

`create`: `vendedorId` do payload só é usado quando o cliente **não tem** vendedor
vinculado; havendo vendedor no cadastro, ele prevalece sobre qualquer coisa enviada.
`update`: o vendedor **não muda por edição simples** — só muda junto com uma troca de
`clienteId` (`clienteTrocado && vendedorDoCliente`), e aí herda o vendedor do novo
cliente. Em ambos, `garantirVendedorNoEscopo` barra (404) se o vendedor resolvido cair
fora do escopo hierárquico de quem está fazendo a chamada — mesmo que o payload não
tenha pedido aquele vendedor explicitamente.

`origemDaVenda` registra **quem de fato montou** o orçamento, separado de quem é "dono"
da carteira (`vendedorId`): se o usuário logado é o próprio vendedor do cliente →
`'vendedor'`; senão, `isAdmin` (Administrador/Diretor) ganha de qualquer cargo cadastrado
→ `'administrador'` (comentário explícito: mesmo um admin com cadastro de vendedor como
gerente, a venda que ele faz na carteira alheia é da administração, não da gerência
comercial); senão, cargo `'superior'` no cadastro → `'superior'`; qualquer outro caso
(administrativo/financeiro sem cadastro de vendedor, ou vendedor mexendo fora da própria
carteira por escopo permissivo) → `'administrador'`. Isto é o que separa comissão/leitura
de desempenho de "o vendedor vendeu" vs. "o supervisor vendeu pelo vendedor".

#### 3.3 Autorização de desconto em duas etapas, e o que a derruba 🟢

`orcamentoExigeAutorizacao` lê o que está **gravado** nos itens (`percDesconto` +
`regraDesconto.percDescontoMaximo`), não o que veio na requisição — o que trava é o
orçamento como ficou no banco. Fluxo:
1. `solicitarAutorizacaoDesconto`: 409 se já autorizado, 409 se nenhum item exige;
   senão grava `descontoSolicitadoEm/Por` e abre uma `Atividade` pendente
   (`autorizacao_solicitada`) na agenda de **quem cobra o vendedor** — o superior
   (`Vendedor.superiorId`); sem superior cadastrado, a pendência fica com o próprio
   vendedor (comentário: "melhor uma pendência visível na agenda dele do que uma
   atividade órfã").
2. `autorizarDesconto`: mesmas duas travas de 409; grava `descontoAutorizadoEm/Por`,
   **fecha** a atividade de pendência aberta na etapa 1 (`updateMany` por título +
   `concluida: false`) e registra o evento `autorizacao_concedida`.
3. PDF (`gerarPdf`) e efetivação (`update` para `status: 'aprovado'`) checam
   `orcamentoExigeAutorizacao` e recusam com 409 se não houver `descontoAutorizadoEm`.
4. **Mexer nos itens derruba a autorização**: `update`, ao receber `itens`, zera as
   quatro colunas de solicitação/autorização — comentário explícito: "a autorização foi
   dada para aqueles preços... senão daria para autorizar 15% e gravar 40% depois". O
   vendedor precisa solicitar de novo se o novo desconto ainda passar do máximo.
5. Criar já com `status: 'aprovado'` passa pela **mesma trava** de `orcamentoExigeAutorizacao`
   — não há atalho para nascer aprovado com desconto fora do limite.

#### 3.4 Status é uma máquina de estado com dois becos sem saída 🟢

`update` recusa (409) alterar orçamento `aprovado` ("efetivado", sem volta por esta rota)
e `expirado` ("registro histórico... o caminho é copiar, que gera um novo orçamento com
validade reiniciada" — a cópia em si não foi encontrada neste módulo, é lógica de
tela/outro endpoint). Comentário no código nota que, como a guarda já recusou alterar um
`aprovado`, chegar à transição `status === 'aprovado'` dentro de `update` **sempre** é uma
transição nova (nunca re-aprovação) — por isso o evento de atividade correspondente
(`aprovacao_cliente`) é seguro de disparar sem checar o status anterior.

#### 3.5 Resposta do cliente (aprovação/recusa) é evento próprio, não "alteração" 🟢

`update` ramifica o evento de histórico conforme o novo `status`: `'aprovado'` →
`aprovacao_cliente`; `'recusado'` (e só se **não estava** já recusado — evita duplicar o
evento numa segunda edição) → `recusa_cliente`; qualquer outra mudança →
`alteracao` genérica. `registrarAtividadeOrcamento` aproveita esses dois eventos
específicos para também disparar uma `Notificacao` no sino do **vendedor dono**
(`usuarioDoVendedor`) — mas só quando quem registrou a resposta **não é** o próprio
dono (`autorUsuarioId: autor` na notificação; comentário: "quem registrou a resposta do
cliente não precisa ser avisado dela — o aviso existe para quando outra pessoa mexe no
orçamento do vendedor").

#### 3.6 `numero` sequencial é reservado atomicamente, fora do ciclo de vida do registro 🟢

`proximoNumeroOrcamento`: um único `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
lê-e-incrementa o contador `orcamento_config.ultimoNumero` numa instrução atômica —
duas criações simultâneas na mesma empresa serializam no lock da linha do contador, nunca
saindo com o mesmo número (o índice único `(empresaId, numero)` é a rede de segurança
redundante). O `INSERT` também cobre a empresa que ainda não tem linha de config. Função
compartilhada com a API de integração — os dois caminhos de criação de orçamento usam o
mesmo contador.

#### 3.7 Validade do orçamento: dias corridos, só o último dia pula fim de semana/feriado 🟢

`ajustarValidadeOrcamento` (`validade-orcamento.ts`) carrega o calendário útil da empresa
(`carregarCalendarioUtil`) e ajusta **só a data final informada** para o próximo dia útil
quando ela cai em fim de semana ou feriado — mantendo os dias corridos do prazo, não
reduzindo a janela. Testado para sábado seguido de feriado na segunda (pula para terça),
mudança de ano com feriado, e preservação de data sem deslocar por fuso (comentário no
teste aponta bug passado: "sem isso, o vencimento voltava um dia"). `null`/`undefined`
passam direto, sem consultar feriados.

#### 3.8 PDF: dados resolvidos em duas fases (transação + fora dela), DANFE-like 🟡

`gerarPdf` resolve o básico (busca por escopo via `QuemPede`/`recorteDoSolicitante` —
mesmo mecanismo de duas origens de `notas-saida`, usuário logado ou cliente via
WhatsApp) e registra o evento **dentro** da transação de tenant; busca a `Empresa`
emitente **fora** dela (mesmo padrão do DANFE — `Empresa` não é tabela de tenant).
`montarOrcamentoPdf` (`orcamento-pdf.ts`) é o layout — cabeçalho com logo + dados da
empresa, bloco do cliente, condições comerciais, tabela de itens via `jspdf-autotable`
(pagina sozinho), total, observação opcional, rodapé com paginação em todas as folhas.
Diferenças deliberadas da versão anterior no navegador (comentário no código): sem
`<canvas>` para normalizar formato de logo (aqui só PNG/JPEG — outro formato sai sem
logo) e recebe `number` puro (quem chama já converteu `Decimal` do Prisma). Fotos de
produto são opcionais por parâmetro (`PARAMETRO_ORCAMENTO_EXIBIR_FOTOS`) e por imagem
existir/ser PNG-JPEG; falha ao ler um arquivo de foto é engolida (`catch` → `null`), nunca
derruba a geração do PDF inteiro.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `orcamentos`.

### 5. Metadados e configurações 🟢

| Constante/parâmetro | Valor | Uso |
|---|---|---|
| `SORT_FIELDS` | `numero`/`titulo`/`status`/`vlrTotal`/`dataValidade`/`ativo`/`createdAt` | whitelist de ordenação; fora da lista cai em `createdAt` |
| `DESCONTO_ACIMA_LIMITE_BLOQUEIA` (`ParametrosService`) | bool, default `false` | liga a recusa de gravação (em vez de só aviso) quando desconto passa do máximo da regra |
| `PARAMETRO_ORCAMENTO_EXIBIR_FOTOS` (`ParametrosService`) | bool, default `true` | inclui coluna de foto do produto na tabela do PDF |
| `COMISSAO_OCULTA_PARA_TODOS` (`ParametrosService`) | bool, default `false` | zera as faixas da regra de desconto e oculta comissão dos itens na resposta |
| `OrigemVenda` (enum) | `vendedor`/`superior`/`administrador`/`cliente`/`erp` | ver §3.2; histórico anterior a 02/09/2026 todo gravado como `vendedor` (não dá para recuperar quem digitou) |
| `StatusOrcamento` (enum) | `rascunho`/`enviado`/`aprovado`/`recusado`/`expirado` | máquina de estado — ver §3.4 |
| `SituacaoErpOrcamento` (enum) | `pendente`/`liberado`/`bloqueado_credito`/`bloqueado_estoque`/`bloqueado_desconto`/`faturado_parcial`/`faturado`/`cancelado` | gravada só pela integração (fora deste módulo); `faturado_parcial` exibido como "Faturando" na tela (decisão de 29/09/2026) |

### 6. Segurança / integridade 🟢

- RLS por `empresaId` via `withTenant` em todas as funções.
- Escopo hierárquico (`resolverEscopoVendedores`) valida cliente, vendedor e oportunidade
  em `create`/`update` (`garantirClienteNoEscopo`/`garantirVendedorNoEscopo`/
  `garantirOportunidadeNoEscopo`) — todos 404 "fora do seu escopo", nunca 403, para não
  revelar existência de registro alheio.
- `gerarPdf`/ações de autorização aceitam duas origens (`QuemPede`: usuário logado ou
  cliente via WhatsApp), cada uma com seu recorte via `recorteDoSolicitante` — mesmo
  mecanismo de `notas-saida`.
- `remove` só permite exclusão de orçamento **sem integração real** com o ERP
  (`podeExcluirOrcamento`, em `@plataforma/contracts`, testada em
  `pode-excluir-orcamento.spec.ts`): não enviado, ou recusado pelo ERP (nunca existiu
  pedido); bloqueia qualquer orçamento vinculado a um pedido (mesmo cancelado) ou vindo do
  ERP como histórico — "excluir perderia o acompanhamento".
- Autorização de desconto em duas etapas (§3.3) é reforçada por checagem no servidor em
  três pontos de saída (solicitar, autorizar, PDF, efetivar) — nunca confia em o front já
  ter mostrado o aviso.
- Comissão (`percComissao`, faixas da regra de desconto) ocultada via
  `ocultarComissaoDosItens`/`podeVerComissao` conforme permissão do usuário e parâmetro
  de empresa — em `findAll`, `findOne`, `create`, `update`, `solicitarAutorizacaoDesconto`,
  `autorizarDesconto` e em `precoProduto` (zera as faixas da regra).

### 7. Dependências do módulo 🟢

`PrismaService`, `ParametrosService` (`DESCONTO_ACIMA_LIMITE_BLOQUEIA`,
`PARAMETRO_ORCAMENTO_EXIBIR_FOTOS`, `COMISSAO_OCULTA_PARA_TODOS`),
`common/escopo/escopo-vendedores` (`resolverEscopoVendedores`, `combinarFiltroVendedor`),
`common/escopo/quem-pede` (`QuemPede`, `recorteDoSolicitante`, `autorDoEvento`),
`common/pagination/paginate`, `common/precos/resolver-tabela-preco-cliente`,
`common/precos/resolver-regra-desconto-item`, `common/permissoes/pode-ver-comissao`,
`common/horario/calendario-util`, `common/pdf/carregar-logo`, `common/uploads/uploads.config`
(`PRODUTOS_DIR` — fotos do PDF), `modules/notificacoes` (`registrar-notificacao`:
`registrarNotificacao`, `usuarioDoVendedor`), `jspdf` + `jspdf-autotable`,
`@plataforma/contracts` (schemas, `numeroOrcamento`, `podeExcluirOrcamento`,
`situacaoIntegracaoOrcamento`, `calcularComissaoItem`). Compartilha três arquivos de
lógica pura (`calcular-itens-orcamento.ts`, `registrar-atividade-orcamento.ts`,
`criar-atividade-retorno.ts`) com `IntegracaoOrcamentosService` (módulo de integração,
não analisado). Cruza com `orcamento-config` (módulo pendente — a tabela `OrcamentoConfig`
usada aqui só tem o contador `ultimoNumero`; regras de negócio adicionais, se existirem,
estão no módulo ainda não analisado).

### 8. Cobertura de testes 🟡

Dois specs cobrem funções auxiliares isoladas: `validade-orcamento.spec.ts` (ajuste de
dia útil — 4 casos, incluindo o bug de fuso horário documentado em comentário) e
`pode-excluir-orcamento.spec.ts` (7 casos, mas testa uma função de
`@plataforma/contracts`, não código deste módulo). **Sem spec para
`orcamentos.service.ts`** (974 linhas) nem para `calcular-itens-orcamento.ts`,
`registrar-atividade-orcamento.ts` ou `orcamento-pdf.ts`: toda a máquina de estado de
status (§3.4), o fluxo de autorização de desconto em duas etapas (§3.3), a resolução de
vendedor/origem (§3.2) e o cálculo de preço/comissão (§3.1) não têm teste automatizado.
Mesmo padrão de `sugestao-compra`: lógica de negócio extensa, cobertura concentrada em
funções auxiliares pequenas e isoláveis, não no fluxo principal do service.

---

## Módulo `orcamento-config`

**Caminho:** `apps/api/src/modules/orcamento-config/`
**Arquivos (3):** `orcamento-config.module.ts`, `orcamento-config.controller.ts`,
`orcamento-config.service.ts` (35 linhas). Contrato em
`packages/contracts/src/orcamento-config.ts`. Sem spec.

### 1. Responsabilidade 🟢

Apesar do nome, **não lê nem grava a tabela `orcamento_config`**. É uma fachada de
leitura de um único parâmetro de sistema, `ORCAMENTO_DIAS_VALIDADE` (Administração >
Parâmetros), exposta sem permissão própria porque quem precisa dela — o vendedor, no
formulário de Orçamento — não tem acesso à tela de Parâmetros. A tabela
`orcamento_config` sobrou só com o contador do número do orçamento, usado por
`orcamentos/proximo-numero-orcamento.ts` (ver módulo `orcamentos` §3.6). O nome do módulo
é herança de quando a validade morava nessa tabela 🟡 (inferido do comentário do service
e de `proximo-numero-orcamento.ts`, que ainda cita um `diasValidade` na tabela).

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `OrcamentoConfigController.getVigente(user)` — `GET /orcamento-config` | usuário autenticado (empresa ativa) | `{ diasValidade, updatedAt }` | Baixa |
| `OrcamentoConfigService.getVigente(empresaId)` | empresa | `diasValidade` via `ParametrosService.obterNumero(…, 'ORCAMENTO_DIAS_VALIDADE', 30)` + `updatedAt` da linha em `parametros_empresa` | Baixa — duas leituras, fora de uma transação comum |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Valor com padrão em cascata 🟢

`obterNumero` (`parametros.service.ts:258`) devolve o padrão **30** quando o parâmetro
não existe, está vazio ou não é número (`Number.isNaN`). O seed (`seed-base.ts:111`) cria
o parâmetro com `tipo: 'numero'`, `tamanho: 3`, `conteudo: '30'`. Em dev, as três empresas
têm `30`.

#### 3.2 A validade é só sugestão, aplicada no navegador 🟢

O servidor não usa `diasValidade` para nada. Quem aplica é `orcamento-form.tsx:656-668`:
ao **criar**, uma única vez, `dataValidade = hoje + diasValidade` (data local do
navegador); a cópia de orçamento (`copiar`, linha ~1209) reinicia a validade do mesmo
jeito. O vendedor pode trocar a data livremente, e nem `OrcamentosService.create` nem a
API de integração validam a data contra o parâmetro.

#### 3.3 `updatedAt` inventado quando não há linha 🟡

Sem linha do parâmetro em `parametros_empresa`, a resposta traz
`updatedAt: new Date()` — o instante da consulta, não uma alteração real. Nenhum
consumidor lê `updatedAt` hoje (o formulário usa só `diasValidade`), então o efeito é
nulo; mas o contrato o descreve como "data/hora da última alteração do parâmetro".

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `orcamento-config`. Nenhuma entidade própria: lê
`ParametroEmpresa`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Onde | Uso |
|---|---|---|---|
| `PARAMETRO_DIAS_VALIDADE` | `'ORCAMENTO_DIAS_VALIDADE'` | `orcamento-config.service.ts:5` (exportada, sem outro importador) | nome do parâmetro |
| `DIAS_VALIDADE_PADRAO` | `30` | `orcamento-config.service.ts:6` | padrão sem parâmetro/valor inválido |
| parâmetro `ORCAMENTO_DIAS_VALIDADE` | `numero`, tamanho 3, seed `'30'` | `seed-base.ts:111` | editável em Administração > Parâmetros |

### 6. Segurança / integridade

- 🟢 `GET /orcamento-config` só com `JwtAuthGuard`, **sem `@RequirePermission`** — decisão
  explícita no `ApiOperation` ("Não colocar @RequirePermission aqui"). Expõe um único
  número não sensível; leitura dentro de `withTenant` da empresa ativa.
- 🟡 **Validação fraca do valor.** `validarConteudo` (`parametros.service.ts:78`) só exige
  que o conteúdo seja número e caiba em 3 caracteres: `0`, `-5` ou `2.5` passam. O
  contrato (`orcamentoConfigSchema`) diz `int().min(1)`, mas a resposta não é validada
  contra ele. Com `0` a validade sugerida é hoje; com negativo, uma data **no passado**
  (o orçamento nasceria vencido); com fração, o `Date.setDate` trunca. Risco baixo
  (só o admin edita), sem guarda em código.
- 🟡 **Contrato morto.** `orcamentoConfigUpdateSchema`/`OrcamentoConfigUpdate` não têm
  endpoint nem consumidor — sobra de quando a validade era editada por este módulo.
- 🟡 **Comentário desatualizado** em `orcamentos/proximo-numero-orcamento.ts:12` ("o
  `diasValidade` fica no default") — a tabela não tem mais essa coluna.

### 7. Dependências do módulo 🟢

| Depende de | Para quê |
|---|---|
| `ParametrosModule` / `ParametrosService.obterNumero` | ler o parâmetro com padrão |
| `PrismaService.withTenant` | ler `updatedAt` da linha do parâmetro |
| `@plataforma/contracts` (`ORCAMENTO_CONFIG_EXAMPLE`) | exemplo do Swagger |

Consumidor único: `apps/web/src/components/crud/orcamento-form.tsx` (query
`["orcamento-config"]`). O módulo exporta `OrcamentoConfigService`, mas nenhum outro
módulo da API o importa.

### 8. Cobertura de testes 🟢

Nenhum teste. Pouco a cobrir: a lógica relevante (padrão em cascata) mora em
`ParametrosService.obterNumero`.

---

## Módulo `titulos-receber`

**Caminho:** `apps/api/src/modules/titulos-receber/`
**Arquivos (13):** `titulos-receber.module.ts`, `titulos-receber.controller.ts`,
`titulos-receber.service.ts` (573 linhas), `titulo-receber-status.ts`,
`boleto-atualizacao.ts`, `boleto-codigo.ts` (279), `boleto-pdf.ts` (690),
`dto/titulo-receber.dto.ts` e 5 specs (`boleto-atualizacao`, `boleto-codigo`,
`boleto-pdf`, `montar-instrucoes`, `titulos-feriados` — 27 casos).

### 1. Responsabilidade 🟢

Consulta somente-leitura das contas a receber que o ERP integra (`TituloReceber` +
`TituloReceberBaixa`), no escopo hierárquico do usuário, e **2ª via de boleto em PDF**
(Bradesco/237) — reimpressão de cobrança já registrada pelo ERP, nunca registro novo.
Atualiza o valor do título vencido com multa e juros do próprio ERP e encerra a emissão
depois de um prazo de atraso configurável. É o serviço por trás de outros consumidores
além da tela: Posição de Cliente (`clientes.service`), agente de IA
(`agente-tools.service`), envio por e-mail (`documentos-email`), aviso de vencimento por
SMS (`sms-aviso-vencimento`) e a conversa de WhatsApp (que chama `gerarBoleto` com
`registrarEvento: false`).

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `findAll(empresaId, user, query, {ignorarEscopo?})` — `GET /titulos-receber` (`titulos-receber.visualizar`) | filtros (status, cliente, vendedor, ativo, busca), paginação, ordem | página com `vencimentoEfetivo`, `status`, `temBoleto` por linha | Média — status filtrado no banco com o mesmo corte do badge |
| `findOne(…, id, {ignorarEscopo?})` — `GET /titulos-receber/:id` (+ `posicao-cliente.visualizar`) | id | título + `baixas` (só no detalhe) + os mesmos derivados | Baixa |
| `gerarBoleto(empresaId, quem, id, {registrarEvento?, atualizado?})` — `GET /:id/boleto?atualizado=` | `QuemPede` (usuário ou cliente do WhatsApp), id | `{conteudo: Buffer, nomeArquivo, numeroDocumento, valor, encargos, …}` | Alta — ver §3.3 e `flowcharts/titulos-receber-gerarBoleto.md` |
| `descreverBoleto(vencimento, encargos)` | — | linha do histórico ("Venc. … · R$ … · valor atualizado — N dia(s)…") | Baixa |
| `calcularStatusTituloReceber(titulo, hoje)` (`titulo-receber-status.ts`) | `dtBaixa`, `vencimento` | `baixado` / `vencido` / `aberto` | Baixa — compartilhado com a Posição de Cliente |
| `calcularEncargos`, `diasEmAtraso`, `foraDoPrazoDeReemissao`, `podeEmitirBoleto` (`boleto-atualizacao.ts`) | saldo, vencimento, multa/juros do ERP | valor atualizado / decisão | Média — puro, testado |
| `montarBoleto`, `fatorVencimento`, `campoLivreBradesco`, DVs (`boleto-codigo.ts`) | dados de cobrança | código de barras (44), linha digitável (47), nosso número formatado | Alta — FEBRABAN, puro, testado; ver `flowcharts/titulos-receber-montarBoleto.md` |
| `montarBoletoPdf` (`boleto-pdf.ts`) | dados já resolvidos | PDF A4 com 3 vias (Empresa, Pagador, Ficha de Compensação) | Média — layout jsPDF |
| `montarInstrucoes(titulo, conta, usarAtualizado)` (exportada) | instruções do título e da conta | linhas ao caixa, sem duplicar encargo | Baixa |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Status e "vencimento efetivo" com feriados 🟢

- `calcularStatusTituloReceber`: `dtBaixa` → `baixado`; vencimento **anterior** a hoje →
  `vencido` (quem vence hoje ainda está em aberto); senão `aberto`. `hoje = inicioDoDia()`
  em **UTC** (`titulo-receber-status.ts`), porque o vencimento é data pura gravada 00:00 UTC.
- O status é calculado sobre o `vencimentoEfetivo` = `calendario.vencimento(vencimento)`
  (`common/horario/calendario-util.ts`): vencimento em fim de semana ou feriado da
  empresa vai para o próximo dia útil.
- O filtro de status **no banco** usa `calendario.corteVencidos(hoje)` — o dia seguinte
  ao último dia útil anterior a hoje — para a busca "vencido" bater com o badge calculado
  em memória. `em_aberto` = sem baixa (aberto + vencido).
- 🟡 Com o container em UTC (confirmado em dev: `TZ` vazio), "hoje" vira às 20h/21h no
  horário de MS/MT: um título que vence hoje passa a "vencido" à noite, no horário local.

#### 3.2 Valor atualizado do título vencido (`calcularEncargos`) 🟢

Regra fechada com o usuário em 2026-08-21, ajustada em 2026-10-09:
- Sem atraso → valor = saldo.
- Com atraso: **multa** = `multaValor` do título (em reais, uma vez); **juros** =
  `jurosValorDia × diasAtraso`. **Só o valor que o ERP mandou** — o percentual da conta
  bancária não entra; título sem esses valores sai sem encargo.
- Arredondamento ao centavo só no total (`Math.round((v + EPSILON)·100)/100`).
- `diasAtraso` conta dias corridos sobre o **vencimento efetivo** (feriado não gera juros).
- No PDF atualizado: vencimento impresso = hoje (`atualizadoAte`), instrução "Boleto
  atualizado para pagamento apenas nesta data." e o código de barras do ERP é
  **ignorado** (o valor mudou; recalcula localmente).
- `?atualizado=false` na rota força o valor original mesmo em atraso.

#### 3.3 `gerarBoleto` — ordem das guardas e precedência dos dados 🟢

1. Recorte por quem pede (`recorteDoSolicitante`): usuário → escopo de vendedores;
   cliente do WhatsApp → só os títulos dele. 404 fora do recorte.
2. Janela de reemissão: `diasEmAtraso(vencimentoEfetivo) > BOLETO_PRAZO_MAXIMO_REEMISSAO`
   (parâmetro, padrão 60) → 409 "fale com o financeiro".
3. Conta de cobrança: `titulo.contaBancaria ?? contaPadrao` → 409 se não houver.
4. Valor base = `saldo` se > 0, senão o `valor` original.
5. Monta o PDF com precedência **título → conta → empresa** em todo campo (banco,
   beneficiário, agência/conta, carteira, espécie, aceite, local de pagamento): quem
   registrou o boleto foi o ERP.
6. `BoletoInvalidoError` (banco sem gerador, sem nosso número, sem vencimento, valor
   zero, campos acima do tamanho) vira 409 com o motivo.
7. **Depois** do PDF pronto, grava a atividade `boleto_gerado` no histórico do cliente
   (salvo `registrarEvento: false`) — nunca "gerado" sem arquivo.

#### 3.4 Código de barras FEBRABAN + campo livre Bradesco 🟢

- Fator de vencimento: dias desde 07/10/1997; abaixo de 1000 é inválido; **depois de 9999
  (21/02/2025) recomeça em 1000**, em ciclo de 9000 — títulos antigos mantêm o fator linear.
- DV geral: módulo 11, pesos 2..9, resto 0/10/11 → 1. DVs da linha digitável: módulo 10.
- Campo livre Bradesco: agência(4) + carteira(2) + nosso número(11) + conta(7, sem DV) + `0`.
- DV do nosso número (só impresso): módulo 11, pesos 2..7, sobre carteira + nosso número;
  resto 1 → `P`.
- Valor em centavos com `Math.round` (evita perder 1 centavo em `1260.5 × 100`).
- **Código de barras e linha digitável do ERP prevalecem** quando vêm com 44/47 dígitos.
- Só o banco **237** tem gerador (`BANCOS_SUPORTADOS`).

#### 3.5 Instruções ao caixa sem duplicar encargo 🟢

`montarInstrucoes` gera "Importancia por Dia de Atraso…" e "Após Vencimento Cobrar
Multa…" a partir dos valores do título e **descarta** as linhas equivalentes que o ERP
manda em `instrucoes` (`BJInstrBol` no BJPLA003; comparação sem acento e em minúsculas) —
antes saíam duplicadas. Depois: instruções restantes do título e da conta, protesto
(`conta.diasProtesto`), a marca "2º Via" e o aviso de valor atualizado.

#### 3.6 Achados — onde o comentário e o código divergem

- 🔴 **Título baixado.** O `ApiOperation` da rota diz "Recusa com 409 quando … o título já
  está baixado", e o comentário de `podeEmitirBoleto` diz que a rota usa a mesma regra da
  tela. Nenhum dos dois acontece: `gerarBoleto` **não chama** `podeEmitirBoleto` nem testa
  `dtBaixa`, e `podeEmitirBoleto` recebe `dtBaixa` sem usá-lo. Título baixado dentro da
  janela sai com `temBoleto: true` e gera PDF com marca d'água "TÍTULO BAIXADO" — e, com
  saldo 0, com o **valor original** (passo 4 de §3.3). Precisa de decisão: bloquear, ou
  manter a reimpressão com marca d'água e corrigir a documentação.
- 🔴 **Título parcialmente baixado, em dia, com código de barras do ERP.** A ficha imprime
  o **saldo** em "Valor do Documento", mas o código de barras do ERP sai como veio, com o
  **valor do registro original**. O caixa cobra o valor do código de barras; ficha e
  código divergem, e nada no código concilia os dois.
- 🟡 `nossoNumero` vazio: a lista já não oferece o boleto (`podeEmitirBoleto`), e a rota
  só recusa lá no gerador (409 do `BoletoInvalidoError`) — mesmo resultado, caminho diferente.
- 🟡 O cabeçalho de `boleto-atualizacao.ts` diz que "a emissão para depois de 30 dias"; o
  código usa o parâmetro, com padrão 60.
- 🟡 Dois `inicioDoDia` diferentes: UTC em `titulo-receber-status.ts`, **local** em
  `boleto-atualizacao.ts`. Coincidem hoje porque o container é UTC; com `TZ` definido
  (ex.: America/Campo_Grande), `diasEmAtraso` passa a contar **um dia a mais** de juros
  (o vencimento 00:00 UTC vira 20:00 do dia anterior antes do `setHours(0)`).
- 🟡 Campos gravados e **não usados** pelo módulo: `nossoNumeroDac` (DV do ERP — a ficha
  imprime o DV calculado localmente), `descontoValor`, `vencimentoReal` (o ajuste de
  vencimento vem do calendário de feriados da plataforma, não do ERP).
- 🟡 Logo do banco lida do **disco local** (`process.cwd()` + `logoUrl`); com o
  armazenamento em MinIO, logo fora do disco cai silenciosamente no nome em texto.
- 🟡 `formatarCodigoBanco` usa `-9` como DV de banco desconhecido (irrelevante enquanto só
  o 237 é suportado).
- 🟡 `Promise.all` de `findMany` + `count` dentro da transação interativa — o próprio
  projeto evita esse padrão em `relatorios.service` ("consulta paralela numa transação
  interativa não é garantida pelo Prisma").

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `titulos-receber`.

### 5. Metadados e configurações 🟢

| Constante / parâmetro | Valor | Onde |
|---|---|---|
| `BOLETO_PRAZO_MAXIMO_REEMISSAO` (parâmetro) | padrão **60** dias | `parametros.service`; lido em `findAll`, `findOne` e `gerarBoleto` |
| `PRAZO_MAXIMO_REEMISSAO_DIAS` | 60 | `boleto-atualizacao.ts` (padrão das funções puras) |
| `BANCOS_SUPORTADOS` | `['237']` | `boleto-codigo.ts` |
| `SORT_FIELDS` | numero, emissao, vencimento, valor, saldo, dtBaixa, createdAt | service; padrão `vencimento desc` |
| Data-base FEBRABAN | 07/10/1997; reinício do fator em 22/02/2025 | `fatorVencimento` |
| Busca (`search`) | `numero` ou `cliente.razaoSocial` (sem fantasia, código ou CNPJ) | `findAll` |

### 6. Segurança / integridade 🟢

- Rotas com `JwtAuthGuard` + `PermissionsGuard`; detalhe e boleto aceitam
  `posicao-cliente.visualizar` como alternativa (a cortina da Posição abre o título).
- Escopo hierárquico de vendedores em `findAll`/`findOne`; `ignorarEscopo` só para o
  atendimento de WhatsApp fora da carteira (`Vendedor.atendeOutrasCarteiras`).
- No boleto, `recorteDoSolicitante` limita o **cliente do WhatsApp** aos próprios
  títulos — acesso em código, não em prompt.
- Leituras em `withTenant`; a empresa emitente é lida fora da transação
  (`prisma.empresa`), coberta pela RLS por grupo econômico.
- Nada grava em `titulos_receber`: os dados vêm só da integração.

### 7. Dependências do módulo 🟢

| Depende de | Para quê |
|---|---|
| `ContasBancariasModule` (`contaPadrao`) | convênio de cobrança quando o título não traz conta |
| `ParametrosModule` | prazo máximo de reemissão |
| `common/horario/calendario-util` | vencimento efetivo e corte de vencidos com feriados |
| `common/escopo` (`resolverEscopoVendedores`, `combinarFiltroVendedor`, `recorteDoSolicitante`, `autorDoEvento`) | recorte por quem pede |
| `common/atividades/registrar-atividade-documento` | histórico "boleto gerado" |
| `common/pdf/barcode` (`itfModulos`, `desenharBarras`) | barras Interleaved 2 of 5 |
| `jspdf` | PDF |

Consumidores: tela de títulos, Posição de Cliente, agente, documentos-email, SMS de aviso
de vencimento, WhatsApp e o gerador de demonstração.

### 8. Cobertura de testes 🟡

27 casos nas funções puras: fator de vencimento (inclusive o reinício de 2025), DVs,
campo livre, linha digitável, encargos, janela de reemissão, instruções sem duplicata,
feriados e layout do PDF. **Sem teste** do `TitulosReceberService` — nem das guardas de
`gerarBoleto` (onde estão os dois achados 🔴 de §3.6) nem do filtro de status no banco.

---

## Módulo `contas-bancarias`

**Caminho:** `apps/api/src/modules/contas-bancarias/`
**Arquivos (4):** `contas-bancarias.module.ts`, `contas-bancarias.controller.ts`,
`contas-bancarias.service.ts` (211 linhas), `dto/conta-bancaria.dto.ts`. Contrato em
`packages/contracts/src/conta-bancaria.ts`; tela em
`apps/web/src/app/(app)/admin/contas-bancarias/page.tsx`. Sem spec.

### 1. Responsabilidade 🟢

CRUD do **convênio de cobrança** da empresa — o insumo da 2ª via de boleto
(`titulos-receber`). Guarda banco, agência, conta, carteira, beneficiário, textos da
ficha e o logo do banco, e marca **uma** conta padrão por empresa, usada por todo título
que não aponta conta (o caso de todo título importado do legado). Sem escopo de vendedor:
é dado da empresa; o corte por tenant é a RLS.

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `findAll` — `GET /contas-bancarias` | `contas-bancarias.visualizar` | busca em descrição (sem caixa), agência e conta; filtro `ativo`; ordem padrão `descricao` |
| `findOne` — `GET /:id` | `visualizar` | 404 se excluída |
| `create` — `POST` | `cadastrar` | grava; se `padrao`, desmarca as outras |
| `update` — `PATCH /:id` | `editar` | 404 se excluída; se ficar `padrao`, desmarca as outras |
| `setLogo` — `POST /:id/logo` (multipart `file`) | `editar` | apaga o arquivo anterior do disco e grava `logoUrl = /uploads/bancos/<uuid>.<ext>` |
| `removeLogo` — `DELETE /:id/logo` | `editar` | apaga o arquivo e zera `logoUrl` |
| `remove` — `DELETE /:id` | `excluir` | soft delete + `ativo=false` + `padrao=false`; **títulos continuam apontando** para a conta |
| `contaPadrao(empresaId)` (exportada) | — | a conta `padrao`, `ativo`, não excluída; `null` se não houver |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Uma conta padrão por empresa, por atualização em massa 🟢

`desmarcarOutrosPadroes` roda **depois** de gravar: marcar a nova como padrão é o jeito de
trocar a padrão, e validar antes obrigaria a desmarcar a antiga primeiro. Não há índice
único no banco.
- 🟡 Duas gravações simultâneas marcando contas diferentes como padrão podem terminar
  com **duas** padrão (cada transação desmarca só o que já estava confirmado), e
  `contaPadrao` usa `findFirst` sem ordem — escolha indefinida.
- 🟡 Uma conta pode ficar `padrao: true` e `ativo: false` (edição que só desliga o ativo):
  `contaPadrao` exige `ativo`, então a empresa fica **sem** padrão sem nenhum aviso, e a
  2ª via passa a responder 409 "nenhuma conta padrão".

#### 3.2 Exclusão preserva o vínculo dos títulos 🟢

Soft delete sem tocar `titulos_receber.contaBancariaId`: a 2ª via de um boleto antigo
precisa do convênio que o registrou. Observação: `gerarBoleto` lê
`include: { contaBancaria: true }` sem filtrar `deletedAt`, então título com conta
excluída **continua** emitindo com ela — coerente com a intenção.

#### 3.3 Logo do banco em disco local 🟢

Upload `multer` em `BANCOS_DIR` (`uploads/bancos`), nome `uuid` + extensão pelo MIME
(nunca pelo nome enviado), até **2 MB**, MIME em PNG/JPEG/**WEBP/SVG**. Servido estático e
sem login em `/uploads/bancos/…` (como os demais logos).
- 🟡 O boleto (`boleto-pdf.ts:carregarBancoLogo`) só desenha **PNG e JPEG**: logo em WEBP ou
  SVG é aceito no upload e some do boleto em silêncio (cai no nome do banco em texto).
- 🟡 `setLogo` grava o arquivo (pelo multer) **antes** de checar se a conta existe: em 404
  o arquivo fica órfão no disco. E apaga o logo anterior antes de atualizar o banco: se o
  update falhar, a conta aponta para um arquivo que já não existe.
- 🟡 Pasta única para todas as empresas, fora do armazenamento por empresa (MinIO);
  `logoUrl` também aceita qualquer texto no `create`/`update` (URL externa), que o boleto
  ignora porque só lê do disco.

#### 3.4 Validação do contrato × gerador do boleto 🟡

O contrato aceita `agencia` até **5** dígitos e `conta` até **9**, mas o gerador Bradesco
(`campoLivreBradesco`) recusa agência com mais de 4 e conta com mais de 7. Uma conta salva
dentro do contrato pode **nunca** gerar boleto (409 "Agência com mais de 4 dígitos").
`banco` é `enum(['237'])` — coerente com `BANCOS_SUPORTADOS`.

#### 3.5 Percentuais de multa e juros: guardados e não usados 🟡

`jurosMesPerc` e `multaPerc` são gravados e listados (`Multa 2% · Juros 1%/mês`), mas
nenhum código de boleto os lê desde a decisão de 2026-10-09 (só os valores do ERP no
título). O comentário do schema ("Encargos impressos nas instruções") está
desatualizado, e a tela se contradiz: `page.tsx:607` diz que "não entram no boleto",
`page.tsx:642` diz que "são calculados na atualização do valor da 2ª via".

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `contas-bancarias`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Onde |
|---|---|---|
| `bancoBoletoSchema` | `enum(['237'])` | contracts |
| `SORT_FIELDS` | descricao, banco, agencia, ativo, createdAt | service |
| `LOGO_MAX_BYTES` | 2 MB | `common/uploads/uploads.config.ts` |
| `LOGO_MIME_TYPES` | png, jpeg, webp, svg+xml | idem |
| Padrões da ficha | local "Pagável em qualquer banco até o vencimento", aceite `N`, espécie `DM` | contrato e schema |

### 6. Segurança / integridade 🟢

- Ações separadas `visualizar` / `cadastrar` / `editar` / `excluir`; upload e remoção de
  logo exigem `editar`.
- Tudo em `withTenant`; `update`/`remove` conferem a existência na empresa antes (404).
- Arquivo de logo com nome gerado pelo servidor e MIME em lista — sem path traversal pelo
  nome; a remoção usa `basename` do caminho gravado.
- Logo público (sem login), por desenho: é imagem de banco, não dado da empresa.

### 7. Dependências do módulo 🟢

`PrismaService`, `common/uploads/uploads.config` (`BANCOS_DIR`, `bancoLogoPublicPath`,
`bancoLogoUploadOptions`), `@plataforma/contracts`. Consumidor na API:
`TitulosReceberService` (`contaPadrao` e a relação `contaBancaria` do título).

### 8. Cobertura de testes 🟡

Nenhum teste do módulo — nem da regra de conta padrão única.

---

## Módulo `equipamentos-comodato`

**Caminho:** `apps/api/src/modules/equipamentos-comodato/`
**Arquivos (6):** `equipamentos-comodato.module.ts`, `equipamentos-comodato.controller.ts`
(260 linhas, 15 rotas), `equipamentos-comodato.service.ts` (842), `descricao-parecida.ts`,
`dto/equipamento-comodato.dto.ts`, `descricao-parecida.spec.ts` (4 casos). Plano em
`docs/planos/equipamentos-comodato.md`.

### 1. Responsabilidade 🟢

Cadastro dos **equipamentos emprestados em comodato** (dispenser, saboneteira…) e dos
**produtos aplicáveis** a cada um (o refil, o papel, o sabonete). O cabeçalho é
`equipamentos_comodato` (um por produto); os itens **não** são tabela própria — são a
relação `aplicacao` de `produto_relacionados`, a mesma que o card "Relacionados" do
produto edita (as duas telas mexem no mesmo dado, pelo mesmo `ProdutoRelacionadosService.criar`).
Ajuda a montar o cadastro com dados: "Popular pelas notas" (cria equipamento para todo
produto que já saiu em remessa de comodato), **sugestões** por compra conjunta e **itens
comuns** aos clientes que estão com o equipamento.

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `findAll` — `GET /equipamentos-comodato` | `visualizar` | filtros `ativo`, `semAplicacao`, busca em descrição/código do produto; ordem descricao/categoria/codigoErp/createdAt; `totalClientes` e `totalAplicacoes` por linha |
| `findOne` — `GET /:id` | `visualizar` | equipamento + aplicações (ordem, descrição) |
| `create` — `POST` | `cadastrar` | produto da empresa e não excluído; 409 se já é equipamento; **excluído volta** na mesma linha, com as aplicações |
| `update` — `PATCH /:id` | `editar` | só `observacao` e `ativo` |
| `remove` — `DELETE /:id` | `excluir` | soft delete; aplicações ficam (são do produto) |
| `removerLote` — `POST /excluir-lote` | `excluir` | soft delete só dos **sem** aplicação; devolve quantos ficaram por ter |
| `adicionarAplicacao` / `adicionarAplicacoesLote` — `POST /:id/aplicacoes[/lote]` | `editar` | via `ProdutoRelacionadosService.criar`; o lote (até 100) segue item a item e devolve `recusados` com o motivo |
| `removerAplicacao` — `DELETE /:id/aplicacoes/:relacaoId` | `editar` | só a relação **deste** equipamento (confere `produtoId` e `tipo`) |
| `sugestoes` — `GET /:id/sugestoes?categoriaId=` | `visualizar` | compra conjunta acima da média (§3.1) |
| `comuns` — `GET /:id/comuns?minimo=&categoriaId=` | `visualizar` | itens por subcategoria entre quem está com o equipamento (§3.2) |
| `popular` — `POST /popular` | `importar` | cria/regera equipamentos a partir das remessas (§3.3) |
| `categoriasPopular` — `GET /popular/categorias` | `importar` | categorias raiz dos produtos que saíram em comodato, com contagem |
| `categoriasSugestoes` — `GET /sugestoes/categorias` | `visualizar` | categorias raiz ativas que **não** são de equipamento |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Sugestões por compra conjunta ("lift") 🟢 — `flowcharts/equipamentos-comodato-sugestoes.md`

- `cli_eq`: clientes que **algum dia** receberam o equipamento (item `comodato = true`).
- `venda`: pares (cliente, produto) de venda nos últimos **24 meses** — nota tipo `N`,
  `geraDuplicata`, não comodato.
- Para cada produto: `comEquipamento` = clientes com equipamento que compraram; `geral` =
  todos que compraram. Entra se `comEquipamento ≥ 3` **e** a taxa entre quem tem o
  equipamento for **mais de 1,5×** a taxa geral (`comEq/totalComEq > 1,5 · geral/totalGeral`).
- Saem: o próprio equipamento, o que já é aplicação, o que é equipamento, o de categoria
  marcada `equipamentoComodato`; filtro opcional de categoria **antes** do corte.
- Corte de 40 candidatos por `comEquipamento`; depois reordena pela **descrição parecida**
  (§3.4) e devolve 20.
- Constantes "medidas em 2026-10-07": `SUGESTAO_MESES=24`, `MIN_CLIENTES=3`, `MIN_LIFT=1.5`,
  `CANDIDATOS=40`, `LIMITE=20`.

#### 3.2 Itens comuns por subcategoria 🟢 — `flowcharts/equipamentos-comodato-comuns.md`

- `em_poder`: clientes **ainda** com o equipamento — remessa (saída comodato) menos
  retorno (entrada comodato), `SUM > 0`.
- Base = os que compraram algo nos últimos 24 meses; agrupa os produtos comprados por
  **subcategoria** e mantém os grupos com cobertura `≥ minimo%` da base (padrão 50).
- A cobertura do grupo conta os produtos já aplicáveis (é a família que importa), mas
  eles não voltam para seleção; até 15 produtos por grupo.
- Sem grupo que passe do mínimo, ainda devolve `totalClientes` (a tela diz "de N clientes,
  nenhum item em X%").

#### 3.3 "Popular pelas notas" 🟢

Produtos distintos de itens de saída `comodato = true` (CFOP 5908/6908), **produto ativo e
não excluído**, filtráveis por categoria/subcategoria e emissão. Em uma transação:
regera os excluídos (decisão do usuário, 2026-10-07: "quem diz o que é equipamento é o
filtro de categoria, não a exclusão") e insere os que não existem. Devolve `criados`
(novos + regerados) e `existentes`.

#### 3.4 Descrição parecida (`descricao-parecida.ts`) 🟢

Raízes de 5 letras das palavras da descrição do equipamento, **sem a primeira palavra**
(no cadastro é a marca), sem números e sem raízes genéricas (`DISPE`, `SUPOR`, cores,
materiais, `COMOD`). Conta quantas raízes aparecem na descrição do produto: mais raízes
primeiro — "TOALHA INTERF." casa `TOALH`+`INTER` e passa à frente do "PAPEL HIGIENICO INTER.".

#### 3.5 Aplicações pertencem ao produto, não ao equipamento 🟢

Excluir o equipamento não apaga as aplicações; recadastrá-lo (manual ou pelo Popular)
traz de volta as que existiam. `produtoId` é `@unique` em `equipamentos_comodato`.

#### 3.6 Achados

- 🟡 **Bases diferentes entre as duas ferramentas.** Sugestões usam quem **um dia** recebeu
  o equipamento (inclui quem devolveu em 2015); "itens comuns" usam quem **ainda está** com
  ele. O mesmo equipamento pode ter sugestões puxadas por clientes que já não o têm.
- 🟡 `totalClientes` da listagem/detalhe conta clientes que **algum dia** receberam (sem
  descontar retorno e sem filtrar item `ativo`) — não "clientes com o equipamento hoje".
- 🟡 Em `sugestoes` e `comuns`, a leitura final de produtos (`findMany` por id) não filtra
  `deletedAt`: produto excluído depois da venda pode aparecer como sugestão.
- 🟡 `cli_eq` e `clientesPorProduto` não filtram `ativo` do item; `em_poder` filtra.
- 🟡 `Promise.all` dentro da transação interativa (`findAll`, `findOne`, `comuns`).
- 🟢 O aviso de "equipamento sem consumo em 30 dias" não é deste módulo: mora em
  `clientes/comodato-sql.ts` e usa a relação `aplicacao` cadastrada aqui.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `equipamentos-comodato`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `SUGESTAO_MESES` | 24 | janela de compra (sugestões e comuns) |
| `SUGESTAO_MIN_CLIENTES` | 3 | mínimo de clientes com equipamento que compram |
| `SUGESTAO_MIN_LIFT` | 1,5 | quanto acima da taxa geral |
| `SUGESTAO_CANDIDATOS` / `SUGESTAO_LIMITE` | 40 / 20 | corte antes e depois da descrição parecida |
| `COMUNS_PRODUTOS_POR_GRUPO` | 15 | produtos mostrados por subcategoria |
| `minimo` (query de comuns) | 1–100, padrão 50 | cobertura mínima do grupo |
| `RAIZES_IGNORADAS`, `TAMANHO_RAIZ` | 10 raízes, 5 letras | descrição parecida |
| Lote de aplicações | até 100 ids | contrato |

### 6. Segurança / integridade 🟢

- Ações `visualizar`, `cadastrar`, `editar`, `excluir` e `importar` (Popular).
- Tudo em `withTenant`; SQL bruto sempre com `empresaId` parametrizado.
- `removerAplicacao` confere que a relação é do equipamento da URL (o id sozinho não basta).
- A regra "produto de categoria de equipamento não é aplicável" é aplicada no
  `ProdutoRelacionadosService.criar` (gravação), não só filtrada na sugestão.
- Exclusão em lote poupa equipamento com aplicações (o lote é para limpar o excesso do Popular).

### 7. Dependências do módulo 🟢

`PrismaService`, `ProdutoRelacionadosService` (módulo `produtos`), `@plataforma/contracts`.
Lê `notas_saida_itens`, `notas_entrada_itens` (flag `comodato`), `notas_saida`
(`geraDuplicata`), `produtos`, `categorias` (`equipamentoComodato`), `produto_relacionados`.
Consumidores: `clientes` (Posição/aviso de comodato, `comodato-baixas`), agente de IA.

### 8. Cobertura de testes 🟡

Só `descricao-parecida` (4 casos). Sem teste das consultas de sugestão, itens comuns e
Popular, nem do reaproveitamento do excluído no `create`.

---

## Módulo `vendedores`

**Caminho:** `apps/api/src/modules/vendedores/`
**Arquivos (4):** `vendedores.module.ts`, `vendedores.controller.ts` (124 linhas, 9 rotas),
`vendedores.service.ts` (658), `dto/vendedor.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Cadastro dos vendedores da empresa — a peça que define **carteira** (cliente →
vendedor) e **hierarquia** (`superiorId`), base do escopo de visibilidade de quase todo o
sistema (`common/escopo/escopo-vendedores.ts`). Além do CRUD, cria o **usuário de acesso**
do vendedor (perfil "Vendedor" do grupo ou da plataforma, senha provisória por e-mail e/ou
SMS), reenvia senha, bloqueia/desbloqueia vendedor e usuário juntos, e responde "qual
vendedor **este usuário é**" (`vendedorDoUsuario`, usado pelo agente de IA). O ERP também
grava vendedores pela integração (comissão `percComissao` é só do ERP).

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `findAll` — `GET /vendedores` | `vendedores.visualizar` | filtros `ativo`, `tipo`, `vinculo`, `usaDashboard`, `desligado`, `superiorId`; busca nome/código/e-mail; `clientesAtivos`/`clientesInativos` por linha |
| `findOne` — `GET /:id` | `visualizar` | 404 se excluído |
| `create` — `POST` | `cadastrar` | `''` → null; `desligado` espelha `ativo`; com `usuarioId`, grava o WhatsApp do usuário |
| `update` — `PATCH /:id` | `editar` | barra ciclo de hierarquia; espelha `desligado`; regrava o WhatsApp do usuário quando muda telefone ou usuário |
| `remove` — `DELETE /:id` | `excluir` | soft delete + `ativo=false` |
| `criarUsuario` — `POST /:id/criar-usuario` | `editar` | §3.3 |
| `reenviarSenha` — `POST /:id/reenviar-senha` | `editar` | nova senha provisória, histórico de senha, destrava tentativas |
| `bloquear` / `desbloquear` — `PATCH /:id/(des)bloquear` | `vendedores.bloquear` | `ativo` do vendedor **e** do usuário vinculado |
| `vendedorDoUsuario(empresaId, user)` | — (serviço) | o cadastro com `usuarioId = user.id`, ou `null` |

### 3. Algoritmos e lógica não-trivial

#### 3.1 `desligado` como controle de saída, `ativo` como espelho 🟢

`espelharDesligado`: quando a gravação traz `desligado`, `ativo = !desligado` — os selects
do sistema filtram por `ativo`. Gravar só `ativo` (ex.: integração, bloquear) continua
valendo enquanto `desligado` não vier junto. Consequência: `bloquear` deixa
`ativo=false` com `desligado=false` (estado "bloqueado, não desligado").

#### 3.2 Hierarquia sem ciclo 🟢

`garantirHierarquiaSemCiclo` (só no `update`): recusa ser superior de si mesmo e sobe a
cadeia a partir do superior escolhido até 50 degraus; se encontrar o próprio cadastro,
400 "Hierarquia circular". O teto evita laço infinito se já existir ciclo gravado. No
`create` não há verificação — um cadastro novo ainda não pode estar acima de ninguém.

#### 3.3 Criação do usuário de acesso 🟢

Na transação (timeout 15 s): vendedor sem usuário e com e-mail; e-mail livre na **base
inteira** (`withSistema` — e-mail é login único global); perfil "Vendedor" do grupo da
empresa, senão o da plataforma (`orderBy grupoEconomicoId nulls last`); senha provisória
pela política de senha (bcrypt 12); usuário com `deveTrocarSenha`, dados copiados do
vendedor (`dadosDoVendedor`), grupo da empresa e vínculo com a empresa; liga
`vendedor.usuarioId`. **Fora** da transação: e-mail (se habilitado em Administração >
E-mail) e SMS (se habilitado em Administração > SMS, para o primeiro celular do telefone
do vendedor). A senha só volta na resposta quando **nenhum** canal entregou — o admin
repassa.

#### 3.4 Carteira na listagem 🟢

`groupBy(vendedorId, ativo)` nos clientes da página. Comentário PENDENTE: cliente PJ com
CNPJ baixado deveria sair da conta, falta trazer a situação cadastral do legado.

#### 3.5 Achados

- 🟡 **`bloquear` derruba o usuário na plataforma inteira.** `usuario.ativo=false` vale para
  todas as empresas e grupos do usuário, não só para esta empresa. E `desbloquear`
  reativa o usuário mesmo que ele estivesse inativo por outro motivo.
- 🟡 **`remove` não mexe no usuário vinculado** — vendedor excluído com usuário ativo
  continua entrando; o `bloquear` faz, o excluir não.
- 🟡 **`usuarioId` não é único** em `vendedores`: o mesmo usuário pode ficar ligado a dois
  cadastros da empresa, e `vendedorDoUsuario` (`findFirst` sem ordem) — que o agente usa
  para limitar a carteira de quem pergunta — escolhe um ao acaso. `create`/`update` não
  conferem se o usuário já é de outro vendedor.
- 🟡 `create`/`update` com `usuarioId` de outro grupo: `usuario.findUniqueOrThrow` dentro
  de `withTenant` (RLS por grupo) lança erro do Prisma, que vira 500 em vez de 404/400.
- 🟡 `reenviarSenha` informa como login o **e-mail do vendedor**; o login é o e-mail do
  **usuário**. Se os dois divergirem (e-mail trocado em um só lugar), a mensagem manda o
  login errado.
- 🟡 Documentação desatualizada: o docblock de `criarUsuario` diz que falha de e-mail
  desfaz a criação (o envio foi tirado da transação); um docblock de
  `enviarSenhaPorEmail` ficou solto acima de `enviarSenhaPorSms`.
- 🟡 Tipagem contornada com `as never` nos `data` de `create`/`update`.
- 🟡 `Promise.all` dentro da transação interativa (`findAll`).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `vendedores`.

### 5. Metadados e configurações 🟢

| Constante / config | Valor | Uso |
|---|---|---|
| `SORT_FIELDS` | nome, codigoErp, email, ativo, createdAt | ordem padrão `nome` |
| `SALT_ROUNDS` | 12 | bcrypt da senha provisória |
| timeout das transações de usuário | 15 s | `criarUsuario`, `reenviarSenha` |
| Teto da subida de hierarquia | 50 degraus | `garantirHierarquiaSemCiclo` |
| Perfil padrão | nome `"Vendedor"` (grupo, senão plataforma) | `criarUsuario` |
| E-mail / SMS de senha | `disponibilidade().senhaProvisoria` | Administração > E-mail / SMS |

### 6. Segurança / integridade 🟢

- Ações `visualizar`, `cadastrar`, `editar`, `excluir` e `bloquear` (separada de editar).
- Criar usuário e reenviar senha exigem `vendedores.editar` — quem edita vendedor cria
  login com perfil "Vendedor" (perfil fixo, sem escolha de perfil pela rota).
- E-mail único checado em modo sistema (correto pelo CLAUDE.md: unicidade global).
- Senha provisória em texto vai por SMS e e-mail, e na resposta só sem entrega.
- Sem escopo hierárquico nas rotas: quem tem `vendedores.visualizar` vê todos da empresa.

### 7. Dependências do módulo 🟢

`PrismaService` (`withTenant`, `withSistema`), `PoliticaSenhaService`
(`gerarSenhaProvisoria`, `registrarHistorico`), `MailService` + `smtpDaEmpresa` +
`montarEmailAcesso`/`buscarEmpresaDoEmail`/`linkDeAcesso`, `EmailConfigService`,
`SmsService` (`primeiroCelular`, `textoSms`), `ParametrosService`,
`common/usuarios` (`gravarWhatsappDoUsuario`, `dadosDoVendedor`),
`common/perfil/perfil-do-grupo` (`grupoDaEmpresa`). Consumidores: escopo hierárquico
(todo o sistema), agente (`vendedorDoUsuario`), WhatsApp (`atendeOutrasCarteiras`),
dashboard/objetivos (`usaDashboard`), integração.

### 8. Cobertura de testes 🟡

Nenhum teste do módulo — nem da trava de ciclo, nem do espelho `desligado`/`ativo`, nem
da criação de usuário.

---

## Módulo `leads`

**Caminho:** `apps/api/src/modules/leads/`
**Arquivos (4):** `leads.module.ts`, `leads.controller.ts` (2 rotas), `leads.service.ts`
(219 linhas), `dto/lead.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Lado da **distribuição** dos leads que a IA capta no número institucional de WhatsApp.
A captação (criar/reescrever o lead, um por conversa) mora em
`WhatsappTriagemService.registrarLead` (módulo `whatsapp`); aqui a supervisão vê a fila,
entrega a um vendedor, devolve à fila, converte ou descarta. Lead é anterior ao cliente:
não tem carteira.

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `listar` — `GET /leads` | `leads.visualizar` | filtros `situacao`, `temperatura`, busca em nome/empresa informada/interesse; ordem **quente → frio**, e dentro da temperatura **mais antigo primeiro**; `vendedorNome` por linha |
| `atualizar` — `PATCH /leads/:id` | `leads.editar` | muda `situacao`, `observacao`, `vendedorId`; avisa o vendedor que recebeu |
| `distribui(tx, empresa, user, escopo)` (privada) | — | quem "distribui" vê a fila inteira |
| `avisarVendedor` (privada) | — | notificação `lead_novo` para o usuário do vendedor |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Recorte próprio: quem distribui vê tudo 🟢

`distribui` = escopo sem restrição (Administrador, Diretor), **ou** usuário sem cadastro de
vendedor, **ou** vendedor com pelo menos um subordinado direto. Quem distribui vê **todos**
os leads da empresa (não só os da equipe); quem não distribui vê só
`vendedorId ∈ escopo`. Justificativa no código: o escopo de carteira esconderia da
supervisão justamente os leads sem dono.

#### 3.2 Situação acompanha o dono 🟢

No `atualizar`, quando `vendedorId` muda e `situacao` **não** veio no mesmo PATCH:
- entregar a alguém com o lead em `novo` → `em_atendimento`;
- devolver à fila (`vendedorId: null`) com o lead em `em_atendimento` → `novo`
  (corrigido após teste em dev, 2026-09-05: sem isso o lead ficava sem dono e fora da aba
  padrão).
`situacao` explícita sempre ganha. Entregar grava `assumidoPor` (quem entregou, não quem
recebeu) e `assumidoEm`; devolver limpa os dois.

#### 3.3 Aviso ao vendedor 🟢

Só quando o dono **mudou** para alguém (não na devolução): notificação `lead_novo` com o
título "Lead para você: <empresa informada | nome | telefone>", rota
`/comercial/leads?lead=<id>`. Vendedor sem usuário não recebe (silencioso).

#### 3.4 Achados

- 🔴 **`atualizar` não aplica o recorte de `listar`.** Qualquer usuário com `leads.editar`
  — inclusive o vendedor sem equipe, que na lista só vê os próprios — pode, pela API,
  reatribuir, devolver, converter ou descartar **qualquer** lead da empresa conhecendo o
  id. Pela regra do projeto ("acesso é código"), o recorte do `listar` precisa valer
  também na escrita.
- 🔴 **`vendedorId` sem chave estrangeira.** O model `Lead` não declara relação com
  `Vendedor`, e o service não valida o id recebido: aceita vendedor inexistente,
  excluído, desligado ou de **outra empresa**. O lead some da fila (passa a
  `em_atendimento`), ninguém é avisado (`avisarVendedor` não acha o vendedor) e a lista
  mostra `vendedorNome: null`.
- 🟡 `assumidoPor` grava **quem entregou**, não quem recebeu — o nome sugere o contrário.
- 🟡 A supervisão com equipe vê leads de **toda** a empresa, inclusive os entregues a
  vendedores de outra equipe — intencional pelo comentário, mas mais largo que "distribuir".
- 🟡 Sem soft delete em `leads` (não há `deletedAt`); descarte é por `situacao`.
- 🟡 `Promise.all` dentro da transação interativa (`listar`).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `leads`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `LeadSituacao` | `novo`, `em_atendimento`, `convertido`, `descartado` |
| `LeadTemperatura` | `quente`, `morno`, `frio` (a ordem do enum é a ordem da fila) |
| Notificação | tipo `lead_novo`, rota `/comercial/leads?lead=<id>` |
| `observacao` | até 2000 caracteres |

### 6. Segurança / integridade

- 🟢 `leads.visualizar` / `leads.editar`; `withTenant` em tudo.
- 🔴 Escrita sem recorte e `vendedorId` sem validação (§3.4).
- 🟢 Os dados do lead são o que a pessoa disse à IA — o schema marca "nada aqui é
  verificado"; só `telefone` é confiável.

### 7. Dependências do módulo 🟢

`PrismaService`, `common/escopo/escopo-vendedores` (`resolverEscopoVendedores`),
`notificacoes/registrar-notificacao`, `@plataforma/contracts`. Origem dos dados:
`whatsapp/triagem/whatsapp-triagem.service.ts` (`registrarLead`).

### 8. Cobertura de testes 🟡

Nenhum teste — nem da regra "situação acompanha o dono", que já teve bug em dev.

## Módulo `oportunidades`

**Caminho:** `apps/api/src/modules/oportunidades/`
**Arquivos (4):** `oportunidades.module.ts`, `oportunidades.controller.ts` (5 rotas),
`oportunidades.service.ts` (195 linhas), `dto/oportunidade.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Funil de vendas do CRM: CRUD de oportunidades (cliente + vendedor + título + estágio +
valor/previsão), com soft delete. É o "guarda-chuva" a que `atividades` e `orcamentos`
podem se ligar (`oportunidadeId`). O service é exportado e reusado pelo agente interno
(`listar_oportunidades`, `registrar_oportunidade`, `mover_oportunidade` e o histórico
do cliente).

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `findAll` — `GET /oportunidades` | `oportunidades.visualizar` | paginado; filtros `vendedorId` (combinado ao escopo), `clienteId`, `estagio`, `ativo`, `search` (só no **título**, case-insensitive); ordenação por whitelist, padrão `createdAt` |
| `findOne` — `GET /oportunidades/:id` | `oportunidades.visualizar` | 404 se fora do escopo ou excluída |
| `create` — `POST /oportunidades` | `oportunidades.cadastrar` | vendedor e cliente precisam estar no escopo; grava `createdBy`/`updatedBy` |
| `update` — `PATCH /oportunidades/:id` | `oportunidades.editar` | a oportunidade precisa estar no escopo; revalida vendedor/cliente **se vierem** |
| `remove` — `DELETE /oportunidades/:id` | `oportunidades.excluir` | soft delete: `deletedAt`, `deletedBy`, `ativo=false` |
| `limpar` (privada) | — | `''` → `null` em todos os campos |
| `normalizarFechamento` (privada) | — | estágio `ganha`/`perdida` sem `dataFechamento` → `now()` |
| `garantirVendedorNoEscopo` / `garantirClienteNoEscopo` (privadas) | — | 404 "fora do seu escopo" |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Recorte por escopo hierárquico 🟢

Todas as rotas resolvem `resolverEscopoVendedores` (`null` = sem restrição; senão a
lista de vendedores do usuário e subordinados). Leitura e escrita aplicam o mesmo
recorte `vendedorId IN escopo` — diferente de `leads`, aqui a escrita **é** recortada.
No `findAll`, `combinarFiltroVendedor` cruza o filtro pedido com o escopo: vendedor
fora do escopo vira `IN []` (lista vazia, não erro).

#### 3.2 Cliente precisa ser da carteira do escopo 🟢

`garantirClienteNoEscopo`: cliente existe na empresa, não excluído, e — com escopo
restrito — tem `vendedorId` dentro do escopo. Cliente **sem vendedor** fica inacessível
para quem tem escopo restrito. O mesmo padrão aparece em `atividades` e `orcamentos`
(`garantirOportunidadeNoEscopo`), que checam o `vendedorId` da oportunidade.

#### 3.3 Data de fechamento automática 🟢

Ao gravar com `estagio` `ganha` ou `perdida` e sem `dataFechamento` no payload, o
service usa a data atual. Só olha o **payload**, não o registro.

#### 3.4 Uso pelo agente interno 🟢

- `registrar_oportunidade`: força `vendedorId` = vendedor do usuário logado
  (`atividades.vendedorDoUsuario`) e valida o cliente com `garantirClienteNoAlcance`.
- `mover_oportunidade`: `garantirOportunidadeNoAlcance` — o vendedor "puro" só mexe na
  própria oportunidade (403); supervisores seguem o escopo do service.
- As duas são ferramentas de escrita com confirmação na tela.

#### 3.5 Achados

- 🔴 **"Motivo obrigatório ao marcar como perdida" vive só no prompt e na tela.** O
  contrato aceita `motivoPerda` vazio e o service não exige; o kanban pergunta o motivo,
  mas o formulário e a API gravam `perdida` sem ele. Pela regra "acesso é código,
  comportamento é prompt" isso é comportamento — se a análise de perdas depende do
  motivo, a regra precisa ir para o service/contrato.
- 🟡 **Sair de `ganha`/`perdida` não limpa `dataFechamento` nem `motivoPerda`.**
  Arrastar de volta para `negociacao` no kanban deixa a oportunidade aberta com data de
  fechamento e motivo de perda antigos.
- 🟡 **Fechamento sobrescrito.** Um PATCH que reenvie `estagio: ganha` sem
  `dataFechamento` troca a data de fechamento original pela de hoje.
- 🟡 **Cliente e vendedor podem divergir.** O service só exige que **ambos** estejam no
  escopo; um supervisor pode abrir oportunidade do vendedor A para cliente da carteira
  do vendedor B.
- 🟡 `ativo` e `estagio` são independentes (oportunidade `ganha` e `ativo=true`, ou
  `negociacao` e `ativo=false`); só o soft delete força `ativo=false`.
- 🟡 `valorPrevisto` é `Float` (valor monetário em ponto flutuante).
- 🟡 `search` não procura no nome do cliente.
- 🟡 Excluir não mexe nas atividades/orçamentos vinculados: eles continuam apontando
  para uma oportunidade com `deletedAt`, e o `include` deles ainda mostra o título.
- 🟡 `Promise.all` dentro da transação interativa (`findAll`) — mesmo padrão visto em
  outros módulos.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `oportunidades`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `EstagioOportunidade` | `prospeccao` (padrão), `qualificacao`, `proposta`, `negociacao`, `ganha`, `perdida` |
| Estágios terminais | `ganha`, `perdida` (disparam `dataFechamento` automática) |
| `SORT_FIELDS` | `titulo`, `estagio`, `valorPrevisto`, `dataPrevisao`, `dataFechamento`, `ativo`, `createdAt` |
| Limites | `titulo` 150, `motivoPerda` 300, `observacao` 1000 |

### 6. Segurança / integridade

- 🟢 Quatro permissões (`visualizar`, `cadastrar`, `editar`, `excluir`); `withTenant` em tudo.
- 🟢 Escopo hierárquico na leitura **e** na escrita; id fora do escopo dá 404 (não
  revela existência).
- 🟢 FKs reais para `Empresa`, `Cliente` e `Vendedor` (ao contrário de `leads`).
- 🔴 Regra do motivo de perda só no prompt (§3.5).

### 7. Dependências do módulo 🟢

`PrismaService`, `common/escopo/escopo-vendedores` (`resolverEscopoVendedores`,
`combinarFiltroVendedor`), `common/pagination/paginate`, `@plataforma/contracts`.
Consumidores: `agente/agente-tools.service.ts`, `atividades` e `orcamentos` (vínculo por
`oportunidadeId`), `demo` (gerador e limpeza), web `/crm/oportunidades` (lista, kanban,
detalhe).

### 8. Cobertura de testes 🟡

Nenhum teste no módulo. O agente tem `agente-tools.permissao.spec.ts`, que cobre as
permissões declaradas das ferramentas, não as regras do service.

## Módulo `atividades`

**Caminho:** `apps/api/src/modules/atividades/`
**Arquivos (5):** `atividades.module.ts`, `atividades.controller.ts` (6 rotas),
`atividades.service.ts` (307 linhas), `dto/atividade.dto.ts`,
`atividades-feriados.spec.ts` (4 testes).

### 1. Responsabilidade 🟢

Agenda e histórico de atendimento do CRM. Uma atividade é **tarefa futura** (ligação,
reunião, e-mail, visita, tarefa com vencimento) **ou registro do que já aconteceu**
(entra concluída). Pode se ligar a cliente, oportunidade e orçamento. O service é
exportado e reusado pelo agente interno (`agendar_atividade`, histórico do cliente) e
pelo WhatsApp (`whatsapp-acoes.service.ts`, agendar visita). Boa parte das atividades,
porém, **não passa por este service**: é gravada direto por outros módulos como
histórico automático (§3.5).

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `findAll` — `GET /atividades` | `atividades.visualizar` | paginado; filtros `vendedorId` (combinado ao escopo), `clienteId`, `oportunidadeId`, `orcamentoId`, `tipo`, `concluida`, `ativo`, `vencidas`, `dataInicio`/`dataFim`, `search` (título); ordem padrão `dataVencimento` |
| `feriados` — `GET /atividades/feriados` | `atividades.visualizar` | feriados da empresa (data, descrição) para a agenda |
| `findOne` — `GET /atividades/:id` | `atividades.visualizar` | 404 fora do escopo |
| `create` — `POST /atividades` | `atividades.cadastrar` | valida vendedor, cliente, oportunidade e orçamento no escopo; ajusta vencimento para dia útil |
| `update` — `PATCH /atividades/:id` | `atividades.editar` | atividade no escopo; revalida vínculos que vierem; ajusta vencimento |
| `remove` — `DELETE /atividades/:id` | `atividades.excluir` | soft delete (`deletedAt`, `deletedBy`, `ativo=false`) |
| `vendedorDoUsuario` (pública) | — | o vendedor **que o usuário é**; 404 com instrução se não houver vínculo |
| `normalizarConclusao` (privada) | — | `concluida=true` sem data → agora; `concluida=false` → limpa a data |
| `limpar` (privada) | — | `''` → `null` e descarta `manterDiaNaoUtil` |
| `garantir{Vendedor,Cliente,Oportunidade,Orcamento}NoEscopo` (privadas) | — | 404 "fora do seu escopo" |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Escopo hierárquico e vínculos 🟢

Mesmo padrão de `oportunidades`: leitura e escrita recortadas por `vendedorId IN escopo`.
Na escrita, **cada vínculo** informado é conferido: cliente pela carteira (`vendedorId`
do cliente no escopo; cliente sem vendedor fica de fora), oportunidade e orçamento pelo
`vendedorId` deles.

#### 3.2 Vencimento em dia útil 🟢

`create`/`update` carregam `carregarCalendarioUtil` (feriados da empresa) quando há
`dataVencimento`, a atividade **não** está concluída e o chamador **não** mandou
`manterDiaNaoUtil`. `CalendarioUtil.ajustar` avança de 24 h em 24 h (mantendo o horário)
até cair num dia que não seja sábado, domingo nem feriado, avaliando o dia **no fuso
`America/Campo_Grande`**; desiste após 370 dias. Concluída preserva a data histórica;
`manterDiaNaoUtil` é a confirmação manual da tela e não é persistido. Coberto por
`atividades-feriados.spec.ts`.

#### 3.3 Conclusão 🟢

`concluida=true` sem `dataConclusao` → agora; `concluida=false` → `dataConclusao=null`.

#### 3.4 Dono da carteira × quem atendeu 🟢

`create(…, { ignorarEscopo, vendedorAtendimentoId })` existe só para o atendimento de
WhatsApp fora da carteira (`Vendedor.atendeOutrasCarteiras`). A atividade fica no
`vendedorId` do **dono da carteira** (é na agenda dele que aparece) e
`vendedorAtendimentoId` guarda quem de fato atendeu, só quando é outra pessoa.
`findAll` filtra só por `vendedorId`, então o atendente não vê na própria agenda o que
agendou para a carteira alheia (por desenho).

#### 3.5 Atividades gravadas fora do service 🟢

Sete pontos gravam `tx.atividade.create` direto, sem escopo e sem ajuste de calendário
(exceto o retorno de orçamento, que ajusta):

| Origem | Tipo / estado | O que registra |
|---|---|---|
| `common/atividades/registrar-atendimento-whatsapp.ts` | `tarefa`, concluída | "Atendimento por WhatsApp" — **um por cliente por dia**, contagem relida do banco |
| `common/atividades/registrar-atividade-documento.ts` | `email`/`tarefa`, concluída | envio de 2ª via, documentos |
| `orcamentos/registrar-atividade-orcamento.ts` | `tarefa`; pendente se houver pendência | eventos do orçamento |
| `orcamentos/criar-atividade-retorno.ts` | `ligacao`, pendente | "Retorno: <título>" com data ajustada ao dia útil |
| `clientes/comodato-baixas.service.ts` | `tarefa`, concluída | baixa de comodato e estorno |
| `clientes/registrar-atividade-alteracao-cliente.ts` | `tarefa`, pendente | alteração de cadastro aguardando aprovação |
| `portal-cliente/portal-cliente.service.ts` | `tarefa`, concluída | orçamento aprovado/recusado pelo cliente |

#### 3.6 Uso pelo agente e WhatsApp 🟢

- `agendar_atividade` (agente): vendedor = `vendedorDoUsuario`; cliente conferido com
  `garantirClienteNoAlcance`; `quando` no formato `AAAA-MM-DDTHH:mm` vira
  `new Date(texto)`.
- `whatsapp-acoes.service.ts` (agendar visita): dono = vendedor do cliente, senão o
  atendente; sem nenhum dos dois, 400.

#### 3.7 Achados

- 🔴 **Hora do agente sem fuso.** `new Date('2026-09-23T14:00')` é interpretado no fuso
  do processo Node. Nenhum `TZ` é definido no compose/Dockerfile; se o container roda em
  UTC, "terça às 14h" é gravado como 14:00Z = 10:00 em Campo Grande. Requer validação.
- 🟡 **`vencidas` e `dataInicio`/`dataFim` se sobrescrevem.** Os dois montam
  `dataVencimento` no mesmo objeto; com ambos, o intervalo vence e o `lt: agora` some
  (continua só `concluida=false`).
- 🟡 **Histórico automático é editável e excluível.** Os registros da §3.5 são
  atividades comuns: quem tem `atividades.editar`/`excluir` no escopo pode alterar ou
  apagar o registro de atendimento, de baixa de comodato ou da decisão do cliente no
  portal. Não há marca de origem (`origem`/`automatica`) no model.
- 🟡 **Reenviar `concluida=true` sem data troca a data de conclusão** pela de hoje.
- 🟡 Cliente, oportunidade e orçamento vinculados não são conferidos **entre si** (a
  oportunidade pode ser de outro cliente).
- 🟡 O ajuste ao dia útil só ocorre quando `dataVencimento` vem no payload; mudar só
  `concluida` para `false` reabre a atividade sem reajustar a data.
- 🟡 `Promise.all` dentro da transação interativa (`findAll`).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `atividades`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `TipoAtividade` | `ligacao`, `reuniao`, `email`, `visita`, `tarefa` (padrão) |
| `SORT_FIELDS` | `titulo`, `tipo`, `dataVencimento` (padrão), `concluida`, `ativo`, `createdAt` |
| Fuso do calendário | `HORARIO_TIMEZONE = 'America/Campo_Grande'` (`common/horario/horario-trabalho.ts`) |
| Limite do ajuste | 370 dias |
| Limites | `titulo` 150, `descricao` 1000 |

### 6. Segurança / integridade

- 🟢 Quatro permissões; `withTenant` em tudo; escopo na leitura e na escrita; cada
  vínculo conferido no escopo.
- 🟢 `ignorarEscopo` só é passado pelo WhatsApp, depois de `podeAtenderOutraCarteira`.
- 🟡 Registros automáticos mutáveis (§3.7).

### 7. Dependências do módulo 🟢

`PrismaService`, `common/escopo/escopo-vendedores`, `common/horario/calendario-util`,
`common/pagination/paginate`, `@plataforma/contracts`. Consumidores:
`agente/agente-tools.service.ts`, `whatsapp/whatsapp-acoes.service.ts`, os sete
gravadores diretos da §3.5, `demo`, web `/crm/agenda` e telas de cliente.

### 8. Cobertura de testes 🟡

`atividades-feriados.spec.ts`: ajuste no caminho do agente, `manterDiaNaoUtil`, data
histórica de concluída e retorno de orçamento. Sem teste de escopo, de conclusão nem do
filtro `vencidas`.

## Módulo `objetivos`

**Caminho:** `apps/api/src/modules/objetivos/`
**Arquivos (4):** `objetivos.module.ts` (importa `ParametrosModule`),
`objetivos.controller.ts` (11 rotas), `objetivos.service.ts` (1017 linhas),
`dto/objetivo.dto.ts`. Sem spec próprio; o corte de venda que ele usa tem
`common/vendas/venda-analitica.spec.ts`.

### 1. Responsabilidade 🟢

Duas coisas no mesmo módulo:

1. **Cadastro de metas** — objetivo mensal por vendedor (valor em R$, nº de clientes,
   novos clientes) com linhas de meta por categoria; CRUD e cópia de período com reajuste.
2. **Dashboards** — Comercial (meta × realizado do escopo, por categoria, filtro de
   município) e Gerencial (o mesmo mês por vendedor, agrupado por hierarquia, com
   indicadores de topo e detalhe por categoria). O realizado é apurado **ao vivo** de
   `notas_saida_itens` pelo corte comum `corteDeVenda`.

Os objetivos também chegam do ERP pela integração (`integracao/objetivos`, chave
`X2_UNICO`), que fica fora deste módulo.

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `dashboard` — `GET /objetivos/dashboard` | `dashboard-comercial.visualizar` | meta × realizado do mês no escopo (ou no vendedor); positivação, base, devolução, tabela por categoria **usada** |
| `municipiosDashboard` — `GET /objetivos/dashboard/municipios` | `dashboard-comercial.visualizar` | municípios distintos dos clientes **com venda** no mês |
| `dashboardGerencial` — `GET /objetivos/dashboard-gerencial` | `dashboard-gerencial.visualizar` | linhas por vendedor + resumo + responsáveis + parâmetro de agrupamento |
| `clientesSemVendedor` — `GET …/dashboard-gerencial/clientes-sem-vendedor` | `dashboard-gerencial.visualizar` | detalhe do card; vazio em escopo restrito |
| `dashboardGerencialVendedor` — `GET …/dashboard-gerencial/vendedor/:vendedorId` | `dashboard-gerencial.visualizar` | mês do vendedor por categoria; 404 fora do escopo |
| `findAll` — `GET /objetivos` | `objetivos.visualizar` | paginado; `ano`, `mes`, `vendedorId`, `ativo`; ordem padrão `ano` + `mes desc` |
| `findOne` — `GET /objetivos/:id` | `objetivos.visualizar` | 404 fora do escopo |
| `create` — `POST /objetivos` | `objetivos.cadastrar` | vendedor no escopo; sem duplicidade vendedor/mês/ano; cria as linhas por categoria |
| `copiarPeriodo` — `POST /objetivos/copiar-periodo` | `objetivos.cadastrar` | replica o mês de origem com reajuste; pula quem já tem meta no destino |
| `update` — `PATCH /objetivos/:id` | `objetivos.editar` | revalida duplicidade; `categorias` enviadas **substituem** o conjunto inteiro |
| `remove` — `DELETE /objetivos/:id` | `objetivos.excluir` | soft delete (`deletedAt`, `deletedBy`, `ativo=false`) |

As rotas `dashboard*` são declaradas antes de `GET :id` para o Nest não casar
"dashboard" como id.

### 3. Algoritmos e lógica não-trivial

#### 3.1 O que é "venda" — `corteDeVenda` 🟢

Regra única para Dashboards, Objetivos e Consultas (`common/vendas/venda-analitica.ts`).

- **Cabeçalho:** nota não excluída e ativa, `comodato=false`, `tipo='N'` e **gerou
  duplicata** (`geraDuplicata=true`, ou `geraDuplicata` nulo com condição de pagamento,
  para nota de integração antiga). Se o parâmetro `VENDAS_SERIES_NOTA` estiver
  preenchido, só entram essas séries.
- **Item:** não excluído e ativo, e a categoria do produto **não** está recusada
  (`usado` verdadeiro ou nulo; item sem produto ou sem categoria conta).
- Conferido no ERP em 2026-09-29: 10 de 11 vendedores bateram ao centavo.

**Realizado** por item = `vlrTotal − vlrDev`. É uma aproximação do `vlr_liquido` do
legado, que não foi importado no item.

#### 3.2 Dashboard Comercial 🟢

- Meta: soma dos objetivos **ativos** do mês no filtro de vendedor; `numeroCliente`
  somado; meta por categoria somada das linhas.
- Realizado: `groupBy produtoId` dos itens → categoria do produto → mapa por categoria.
- Positivação: clientes distintos com item no mês.
- Base: clientes ativos da carteira (`cliente.vendedorId`) no filtro.
- `municipio` recorta venda e base, **não** a meta (não existe meta por município).
- Tabela: só categorias com `usado=true`, ordenadas por `codigoErp`. Categoria em branco
  entra no KPI, mas não ganha linha.
- `perc(n, d)` = `round(n×10000/d)/100`; zero quando `d=0`.

#### 3.3 Dashboard Gerencial 🟢

- Seis leituras em paralelo: objetivos do mês, realizado por vendedor, pares
  (vendedor, cliente), base, clientes sem vendedor ativo e pares (nota, vendedor).
- **Linhas:** só vendedores com meta ou movimento, `tipo='vendedor'` **e**
  `usaDashboard=true`. Supervisor e gerente não viram linha: a venda é sempre do
  vendedor que atende o cliente. Eles aparecem em `responsaveis` como agrupadores (pelo
  `superiorId`).
- **Cartões do topo:** somam a operação inteira do escopo, **inclusive** quem não vira
  linha (ESCRITÓRIO, E-COMMERCE). É intencional, para bater com o Comercial e as
  Consultas.
- **Positivação do cartão** = soma das linhas: o cliente que comprou de dois vendedores
  conta duas vezes. Decisão do usuário em 2026-09-30, para bater com o sistema anterior.
- **Ticket médio** = realizado ÷ nº de notas distintas **com item que entrou no
  realizado** e com vendedor. Nota só de comodato ou de categoria recusada não conta (em
  09/2026 eram 147 de 621).
- **Clientes sem vendedor ativo** = cliente ativo com `vendedorId` nulo, ou com vendedor
  inativo ou excluído. Só é calculado com escopo livre; em escopo restrito vale 0.
- O parâmetro `DASHBOARD_GERENCIAL_HIERARQUIA` (padrão `true`) diz se a tela agrupa por
  hierarquia.

#### 3.4 Detalhe do vendedor 🟢

O vendedor fora do escopo ou inexistente responde 404. A meta e o realizado saem por
categoria (inclusive categoria só com meta ou só com venda), e o realizado de produto
sem categoria vem à parte (`realizadoSemCategoria`). **Não** filtra `usado=true`, ao
contrário do Comercial.

#### 3.5 Clientes sem vendedor 🟢

Até 1000 clientes (`LIMITE_CLIENTES_SEM_VENDEDOR`) em ordem alfabética, com o `total`
real. A "última compra" é a mais recente entre `cliente.ultimaCompra` (do import) e a
última nota de venda. A lista sai ordenada por última compra, decrescente.

#### 3.6 Cópia de período 🟢

`fator = 1 + percReajuste/100` (de −100 a 1000); `ajustar(v) = round(v×fator×100)/100`
aplicado à meta e às linhas por categoria. As quantidades (`numeroCliente`,
`novoCliente`) são copiadas sem reajuste. O vendedor que já tem objetivo no destino é
**pulado**, e o retorno diz quantos e quais foram. Respeita o escopo. `codigoErp` e
`chave` ficam nulos na cópia. O contrato proíbe destino igual à origem.

#### 3.7 Achados

- 🔴 **A unicidade ignora o soft delete.** O schema tem
  `@@unique([empresaId, vendedorId, mes, ano])` sem `deletedAt`, e o projeto não tem
  filtro global para `P2002`. Consequências:
  - excluir o objetivo de um vendedor e criar de novo no mesmo mês passa por
    `garantirSemDuplicidade` (que filtra `deletedAt: null`) e estoura erro 500 no banco;
  - `copiarPeriodo` para um mês com objetivo excluído do mesmo vendedor derruba a
    transação inteira, e **nenhum** objetivo é copiado.
- 🟡 **`update` com `categorias` apaga as linhas fisicamente** (`deleteMany`), embora a
  tabela tenha colunas de soft delete. As linhas que vieram do ERP (`chave`) perdem a
  chave, e a próxima carga da integração tende a recriá-las.
- 🟡 **Lista de clientes sem vendedor cortada antes de ordenar.** O `take: 1000` é
  aplicado em ordem alfabética, e só depois a lista é reordenada por última compra. Com
  mais de 1000 clientes, quem comprou recentemente pode ficar de fora.
- 🟡 **Positivação diferente entre os dashboards.** O Comercial conta clientes
  distintos; o Gerencial soma as linhas (§3.3). Pela decisão do usuário, o mesmo mês
  pode mostrar dois números.
- 🟡 **Categoria recusada no detalhe.** O detalhe do vendedor lista categorias com meta
  mesmo quando estão marcadas como não usadas. O realizado delas é sempre 0 (o corte
  exclui), e a linha aparece com 0% de atingimento.
- 🟡 **Base × positivação em dimensões diferentes.** A base filtra pela carteira do
  cliente (`cliente.vendedorId`); a positivação e o realizado, pelo `vendedorId` do
  **item** da nota.
- 🟡 Valores em `Float` (`valor`, `numeroCliente`, `novoCliente`). Os dois últimos são
  contagens de clientes.
- 🟡 `copiarPeriodo` copia também objetivos `ativo=false` e linhas de categorias que
  podem ter sido desativadas.
- 🟡 `Promise.all` dentro da transação interativa (vários pontos).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `objetivos`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `SORT_FIELDS` | `ano` (padrão), `mes`, `valor`, `ativo`, `createdAt` |
| `CLIENTE_SEM_VENDEDOR_ATIVO` | `vendedorId` nulo, ou vendedor `ativo=false`, ou vendedor excluído |
| `LIMITE_CLIENTES_SEM_VENDEDOR` | 1000 |
| Parâmetro `DASHBOARD_GERENCIAL_HIERARQUIA` | booleano, padrão `true` |
| Parâmetro `VENDAS_SERIES_NOTA` | séries que contam como venda; vazio = todas (via `corteDeVenda`) |
| `percReajuste` | −100 a 1000, padrão 0 |
| Permissões | `objetivos.*`, `dashboard-comercial.visualizar`, `dashboard-gerencial.visualizar` |

### 6. Segurança / integridade

- 🟢 Escopo hierárquico em todas as rotas; o detalhe do vendedor fora do escopo dá 404;
  clientes sem vendedor só com escopo livre.
- 🟢 Os dashboards têm permissões próprias, separadas do cadastro de metas.
- 🔴 Unicidade sem `deletedAt` (§3.7).

### 7. Dependências do módulo 🟢

`PrismaService`, `ParametrosService`, `common/escopo/escopo-vendedores`,
`common/vendas/venda-analitica` (`corteDeVenda`), `common/pagination/paginate`,
`@plataforma/contracts`. Também mexem nas mesmas tabelas:
`integracao/objetivos/integracao-objetivos.service.ts` (carga do ERP),
`whatsapp/triagem/triagem-funcionario-tools.service.ts` (ferramenta `objetivos` do
WhatsApp do funcionário) e `demo`. Web: `/comercial/objetivos`, Dashboard Comercial e
Dashboard Gerencial.

### 8. Cobertura de testes 🟡

Nenhum teste no módulo. `venda-analitica.spec.ts` cobre o corte de venda, mas nada
cobre a agregação dos dashboards, a cópia de período nem a duplicidade.

## Módulo `meus-atendimentos`

**Caminho:** `apps/api/src/modules/meus-atendimentos/`
**Arquivos (5):** `meus-atendimentos.module.ts`, `meus-atendimentos.controller.ts`
(1 rota), `meus-atendimentos.service.ts` (323 linhas), `dto/meus-atendimentos.dto.ts`,
`meus-atendimentos.categoria.spec.ts`.

### 1. Responsabilidade 🟢

Linha do tempo **somente leitura** do que o vendedor logado fez (ou, para quem
supervisiona, do que a equipe fez). Lê **só** a tabela `atividades`, onde os módulos
de atendimento já gravam cada passo como atividade (WhatsApp, documentos, orçamento,
agenda), para não criar uma segunda definição de "atendimento". O service é exportado
e reusado pelo agente interno (ferramenta de resumo dos atendimentos).

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `resumo` — `GET /meus-atendimentos` | `meus-atendimentos.visualizar` | feed paginado por cursor + contadores do período; `dias?`, `clienteId?`, `escopo` (`proprio`/`equipe`), `cursor?`, `limite` |
| `carteiras` (privada) | — | `proprio` = vendedor ligado ao login; `equipe` = escopo **menos** ele mesmo (escopo livre = todos os vendedores ativos) |
| `vazio` (privada) | — | resposta zerada para quem não tem vendedor nem equipe |
| `codificarCursor` / `decodificarCursor` | — | `base64url("<ISO>|<id>")`; cursor ilegível = sem cursor |
| `categoriaDoTitulo` (exportada) | — | classifica a atividade pela frase do título |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Janela de dias 🟢

`dias` conta dias inteiros **incluindo hoje**: `de = hoje − (dias − 1)` às 00:00,
`ate = agora`. Sem `dias` o feed não tem começo. Contrato: 1 a 365
(`DIAS_MAX_HISTORICO`); o agente limita a 1–7.

#### 3.2 De quem 🟢

- `proprio` (padrão): `vendedorId = proprio` **ou** `createdBy = usuário`. A segunda
  metade é o que o supervisor ou gerente executou na carteira do subordinado, onde o
  registro fica.
- `equipe`: `vendedorId IN equipe`. Só vale se `equipe` não estiver vazia; senão cai
  em `proprio`, e o service decide (o agente não consegue ampliar o alcance).
- Sem vendedor e sem equipe: resposta vazia, nunca a de outra pessoa.

#### 3.3 No período 🟢

`dataConclusao` dentro da janela **ou** `createdAt` dentro da janela: um retorno
agendado hoje para a semana que vem conta como trabalho de hoje.

#### 3.4 `AND` em vez de `OR` na raiz 🟢

Todas as condições compostas entram em `AND`. A versão anterior tinha o escopo num
`OR` de raiz, e o `OR` do cursor sobrescrevia a chave no spread. Da segunda página em
diante, o feed devolvia atividade de **qualquer** vendedor da empresa. Corrigido; o
comentário no código registra o porquê.

#### 3.5 Paginação por cursor 🟢

Ordem `createdAt desc, id desc`; busca `limite + 1` linhas, e a linha a mais indica que
há próxima página. Cursor = (`createdAt`, `id`) do último item, com desempate por id.
`quando` mostrado = `dataConclusao ?? createdAt`.

#### 3.6 Contadores do topo 🟢

Contam o **período inteiro**, não a página, numa segunda consulta com até
`TETO_TOTAIS` = 5000 linhas (só `titulo` e `clienteId`): `registros`, `clientes`
distintos e um contador por categoria.

#### 3.7 Categoria pelo título 🟢

| Regra (título em minúsculas) | Categoria |
|---|---|
| começa com "atendimento por whatsapp" | `whatsapp` |
| contém "orçamento" ou "proposta" | `orcamento` |
| contém "2ª via", "danfe", "boleto", "xml", "títulos em aberto" ou "notas fiscais" | `documento` |
| qualquer outro | `agenda` |

A tabela não tem coluna de origem. O spec amarra os títulos fixos dos três helpers
(`registrar-atendimento-whatsapp`, `registrar-atividade-documento`,
`registrar-atividade-orcamento`).

#### 3.8 Achados

- 🟡 **Categoria por texto livre.** A atividade digitada à mão com "orçamento",
  "proposta" ou "boleto" no título ("Ligar sobre o orçamento") sai como
  `orcamento`/`documento`, não `agenda`. Os registros automáticos que não vêm dos três
  helpers caem em `agenda`, entre eles "Comodato baixado", "Alteração de cadastro
  aguardando aprovação" e o "Retorno: <título>" do orçamento (a menos que o título do
  orçamento contenha a palavra). O mesmo problema do módulo `atividades`: falta uma
  coluna de origem.
- 🟡 **"Hoje" no fuso do servidor.** `setHours(0,0,0,0)` usa o fuso do processo Node.
  Em container UTC, "hoje" começa às 20:00 do dia anterior em Campo Grande. É a mesma
  lacuna de fuso de `atividades`.
- 🟡 **O teto não aparece na resposta.** Com mais de 5000 registros os contadores param
  em 5000, sem nenhum campo que diga isso. O comentário fala em "mais de", mas a
  resposta não traz esse sinal.
- 🟡 **Documentação divergente.** O `summary` da rota diz "1 a 7 dias", mas o contrato
  aceita até 365 ou nenhum recorte. O limite de 7 é só do agente.
- 🟡 Na visão `equipe` com escopo livre, ficam de fora as atividades de vendedores
  **inativos** (`ativo: true` em `carteiras`).
- 🟡 Pendências criadas no período aparecem como "o que fiz", com `quando = createdAt`.

### 4. Estruturas de dados 🟢

Não tem tabela própria; lê `Atividade`. Ver `data-dictionary.md`, seção
`meus-atendimentos`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `CategoriaAtendimento` | `whatsapp`, `documento`, `orcamento`, `agenda` |
| `EscopoAtendimento` | `proprio` (padrão), `equipe` |
| `DIAS_MIN_ATENDIMENTOS` / `DIAS_MAX_ATENDIMENTOS` / `DIAS_MAX_HISTORICO` | 1 / 7 (agente) / 365 |
| `PAGINA_ATENDIMENTOS` / `PAGINA_MAX_ATENDIMENTOS` | 25 / 50 (o agente usa 40) |
| `TETO_TOTAIS` | 5000 |

### 6. Segurança / integridade

- 🟢 O recorte sai de `resolverEscopoVendedores`, o mesmo das telas; `equipe` nunca
  amplia o alcance.
- 🟢 Não há rota de escrita.
- 🟢 A correção do vazamento entre vendedores pela paginação está documentada no código
  (§3.4). Ainda não há teste que a proteja.

### 7. Dependências do módulo 🟢

`PrismaService`, `common/escopo/escopo-vendedores`, `@plataforma/contracts`.
Consumidores: `agente/agente-tools.service.ts` e a tela web "Meus atendimentos".
Fontes dos dados: os gravadores de atividade listados em `atividades` §3.5.

### 8. Cobertura de testes 🟡

`meus-atendimentos.categoria.spec.ts` cobre `categoriaDoTitulo`. Nenhum teste cobre o
recorte `proprio`/`equipe`, a paginação (o bug do `OR` não tem teste de regressão) nem a
janela de dias.

## Módulo `consultas`

**Caminho:** `apps/api/src/modules/consultas/`
**Arquivos (4):** `consultas.module.ts` (importa `ParametrosModule`),
`consultas.controller.ts` (5 rotas), `consultas.service.ts` (917 linhas),
`dto/consulta.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Consultas gerenciais de venda em formato **pivô mensal** (uma linha por entidade, uma
coluna por mês, no máximo 12 meses): por cliente, vendedor, produto, árvore
categoria → subcategoria → produto, e evolução por vendedor em quatro indicadores. Usa
SQL bruto (`$queryRaw`), porque o query builder não pivota e a coluna do vendedor muda
conforme o parâmetro da empresa. Exportação PDF/Excel é montada no navegador; a
permissão `exportar` só controla os botões. O service é exportado e reusado pelo agente
(`vendasPorCliente`, `vendasPorProduto`).

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Agrupa por | Vendedor (base `nota`) | Mês de |
|---|---|---|---|---|
| `vendasPorCliente` — `GET /consultas/vendas-cliente` | `consulta-vendas-cliente.visualizar` | cliente | `n.vendedorId` | `n.ano/mes` |
| `vendasPorVendedor` — `GET /consultas/vendas-vendedor` | `consulta-vendas-vendedor.visualizar` | vendedor | `n.vendedorId` | `n.ano/mes` |
| `vendasPorProduto` — `GET /consultas/vendas-produto` | `consulta-vendas-produto.visualizar` | produto (+ `categoriaId?`) | `i.vendedorId` | `i.ano/mes` |
| `vendasPorCategoria` — `GET /consultas/vendas-categoria` | `consulta-vendas-categoria.visualizar` | categoria → sub → produto | `i.vendedorId` | `i.ano/mes` |
| `evolucao` — `GET /consultas/evolucao` | `consulta-evolucao.visualizar` | vendedor, por indicador | ver §3.6 | ver §3.6 |

Com a base `cliente`, a coluna do vendedor é `c.vendedorId` em todas as consultas.

Auxiliares privadas: `baseVendedor`, `condicaoEscopoClientes`, `condicaoFiltroVendedor`,
`condicoesDeVenda`, `condicaoPeriodo`, `pivotar`, `montarArvore`/`fecharNivel`/`folha`,
`mediaMesesComMovimento`, `vendedoresRef`, `cabecalho`, `evolucaoSobreNotas`,
`evolucaoNovos` e `evolucaoInativados`.

### 3. Algoritmos e lógica não-trivial

#### 3.1 Base do vendedor 🟢

`baseVendedor`: a escolha da consulta (`?baseVendedor=`) ganha; senão vale o parâmetro
`CONSULTA_VENDAS_BASE_VENDEDOR` (padrão `nota`). Com `nota`, a venda é creditada a quem
vendeu; com `cliente`, ao titular da carteira.

#### 3.2 Dupla trava de visibilidade 🟢

1. `condicaoEscopoClientes`: com escopo restrito, só clientes cujo `c.vendedorId` está
   no escopo. Escopo vazio vira `false`.
2. `condicaoFiltroVendedor`: sem filtro pedido, a **coluna da base** também precisa
   estar no escopo (regra de 30/09/2026: o vendedor vê só os próprios dados, o
   supervisor vê os do time). Com filtro pedido, os ids fora do escopo são descartados;
   se não sobrar nenhum, o resultado é vazio (`false`), nunca "todos".

#### 3.3 O que é venda e o valor 🟢

`corteDeVenda` (ver `objetivos` §3.1), nas formas `notaSql` e `itemSql`. O valor é
`SUM(i.vlrTotal)`, que é o **item**, e não mais o `vlrBruto` do cabeçalho, para
respeitar a categoria. Em troca, IPI/ST e frete do cabeçalho deixam de entrar. A
Posição de Cliente continua no `vlrBruto`.

#### 3.4 Período e pivô 🟢

- Período: `(ano×12 + mes) BETWEEN emMeses(inicial) AND emMeses(final)`, com no máximo
  12 meses (`MAX_MESES_CONSULTA`, validado no contrato).
- `pivotar`: soma cada (entidade, ano, mês) na coluna do mês, ordena pelo total
  decrescente e calcula os totais por coluna.
- **Média = total ÷ meses com valor diferente de zero**, e não ÷ tamanho do período: é
  o quanto o cliente compra quando compra.

#### 3.5 Árvore de categorias 🟢

Uma passada: cada linha (produto, ano, mês) soma no produto, na subcategoria, na
categoria e no rodapé ao mesmo tempo, então os níveis não divergem. Produto sem
classificação vai para os nós `sem-categoria` / `sem-subcategoria`, para o total bater
com a consulta por produto. Cada nível sai ordenado pelo total.

#### 3.6 Evolução 🟢

| Indicador | Medida | Origem | Base |
|---|---|---|---|
| `vendas` | `SUM(i.vlrTotal)` | notas de venda | escolhida |
| `positivados` | `COUNT(DISTINCT n.clienteId)` | notas de venda (item acompanhado) | escolhida |
| `novos` | nº de clientes cuja **primeira** nota de venda de todo o histórico cai no mês | CTE `DISTINCT ON (clienteId)` ordenada por ano, mês, `dtEmissao` | escolhida (`nota` = quem emitiu a primeira) |
| `inativados` | nº de clientes com `dataBloqueio` no mês | cadastro do cliente | sempre `cliente` (a resposta devolve `cliente`) |

`novos` e `positivados` também usam o corte por item: o cliente não "estreia" numa
remessa de brinde. `inativados` conta o bloqueio registrado mesmo se o cliente foi
reativado depois.

#### 3.7 Achados

- 🟡 **Devolução fora das Consultas** (🟡 INFERIDO quanto ao impacto). As Consultas somam
  `vlrTotal`; Dashboard e Objetivos somam `vlrTotal − vlrDev`. A nota de devolução já sai
  pelo `tipo='N'`, mas o `vlrDev` lançado no item original só é descontado nos
  Dashboards. O comentário de `mediaMesesComMovimento` fala em "líquido", mas o valor
  das Consultas é bruto de devolução. Os documentos das rotas dizem que as três telas
  usam a "mesma base". Para o mesmo mês, os números divergem sempre que houver `vlrDev`.
- 🟡 **Cabeçalho × item no vendedor e no mês.** Cliente, vendedor e evolução usam
  `n.vendedorId` e `n.ano/mes`; produto e categoria usam `i.vendedorId` e `i.ano/mes`.
  Se o vendedor ou o mês do item diferir do cabeçalho, o total por vendedor e o total
  por produto filtrado pelo mesmo vendedor não batem. O Dashboard usa os campos do item.
- 🟡 `evolucaoNovos` varre **todo o histórico** de notas de venda a cada chamada para
  achar a primeira compra.
- 🟡 `vendedoresRef` devolve o nome de qualquer vendedor da empresa cujo id venha na
  query, mesmo fora do escopo. Os números não vazam (o filtro descarta), só o nome no
  cabeçalho.
- 🟡 Mês de `inativados` sai de `EXTRACT` sobre `dataBloqueio` no fuso do banco.
- 🟡 Exportar é decidido só na tela (os dados já chegaram a quem visualiza). Está
  documentado como intencional.

### 4. Estruturas de dados 🟢

Sem tabela própria. Lê `notas_saida`, `notas_saida_itens`, `clientes`, `vendedores`,
`produtos` e `categorias`. Ver `data-dictionary.md`, seção `consultas`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| Parâmetro `CONSULTA_VENDAS_BASE_VENDEDOR` | `nota` (padrão) \| `cliente` |
| Parâmetro `VENDAS_SERIES_NOTA` | via `corteDeVenda` |
| `MAX_MESES_CONSULTA` | 12 |
| `MAX_VENDEDORES_FILTRO` | 50 (`vendedorIds` repetido ou separado por vírgula) |
| `INDICADORES_EVOLUCAO` | `vendas` (moeda), `positivados`, `novos`, `inativados` (quantidade) |
| Nós sintéticos | `sem-categoria`, `sem-subcategoria` |
| Permissões | `consulta-vendas-cliente`, `consulta-vendas-vendedor`, `consulta-vendas-produto`, `consulta-vendas-categoria`, `consulta-evolucao` (`.visualizar`; `exportar` só na tela) |

### 6. Segurança / integridade

- 🟢 SQL bruto todo parametrizado (`Prisma.sql`/`Prisma.join`); a coluna variável vem de
  um conjunto fechado de fragmentos, nunca de entrada.
- 🟢 Dupla trava de escopo (carteira do cliente e coluna da base) e filtro de vendedor
  que nunca vira "todos".
- 🟢 `withTenant` + `n/i/c."empresaId"` explícitos.

### 7. Dependências do módulo 🟢

`PrismaService`, `ParametrosService`, `common/escopo/escopo-vendedores`,
`common/vendas/venda-analitica` (`corteDeVenda`, `JOIN_CATEGORIA_DO_ITEM_SQL`),
`@plataforma/contracts` (`colunasDoPeriodo`, `emMeses`, `rotuloMes`, constantes).
Consumidores: `agente/agente-tools.service.ts` e as telas web de Consultas (com
exportação PDF/Excel no cliente).

### 8. Cobertura de testes 🟡

Nenhum teste no módulo. O pivô, a árvore, a média e as duas travas de escopo não têm
teste; só o corte de venda é testado (`venda-analitica.spec.ts`).

## Módulo `relatorios`

**Caminho:** `apps/api/src/modules/relatorios/`
**Arquivos (4):** `relatorios.module.ts` (importa `ParametrosModule`),
`relatorios.controller.ts` (5 rotas), `relatorios.service.ts` (799 linhas),
`relatorios.service.spec.ts` (7 testes). Plano: `docs/planos/2026-10-13-modulo-relatorios.md`.

### 1. Responsabilidade 🟢

Relatórios operacionais em linhas de item, para os perfis **Gerente**, **Administrativo**
e administradores, sempre da empresa ativa inteira:

- **Compras**: itens de nota de entrada de mercadoria;
- **Vendas**: itens de venda;
- **Vendas por vendedor (mensal)**: matriz cliente × mês;
- **Estoque e compra**: estoque, entradas, saídas, média e sugestão de compra por produto;
- **Opções** dos filtros (produtos, fornecedores, clientes).

A exportação PDF/Excel é feita no navegador. A página grande é tratada como exportação
e exige `exportar` (§3.1).

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Permissão | Comportamento |
|---|---|---|
| `compras` — `GET /relatorios/compras` | `relatorio-compras.visualizar` (+ `exportar` se `pageSize` > 200) | paginado, totais de quantidade/valor/IPI/ICMS/ST |
| `vendas` — `GET /relatorios/vendas` | `relatorio-vendas.visualizar` (+ `exportar` se `pageSize` > 200) | paginado, totais de quantidade e valor |
| `vendasPorVendedor` — `GET /relatorios/vendas-por-vendedor` | `relatorio-vendas.visualizar` | matriz cliente × mês (até 12), quebra por vendedor |
| `estoqueCompra` — `GET /relatorios/estoque-compra` | `relatorio-estoque-compra.visualizar` | uma linha por produto, sem paginação |
| `opcoes` — `GET /relatorios/opcoes/:tipo` | qualquer um dos três `visualizar` | até 100 opções (`produtos`, `fornecedores`, `clientes`): código, nome, detalhe |

Funções exportadas: `periodo` (período civil fechado), `ordenar`, `ESPECIES_DE_COMPRA`,
`ORDEM_COMPRAS`. A leitura passa por `ler`: `withTenant` com timeout de 60 s (o padrão
de 5 s expirava em 9 meses de vendas da RCG).

### 3. Algoritmos e lógica não-trivial

#### 3.1 Exportar = página grande 🟢

`exigirExportarSeGrande`: com `pageSize` acima de 200 (`MAXIMO_DA_TELA`), exige
`<rotina>.exportar`, exceto para `isAdmin`. O contrato aceita `pageSize` até 20000.

#### 3.2 Período civil 🟢

`periodo(inicio, fim)`: `[inicio 00:00Z, fim + 1 dia)`. Fim antes do início dá 400.

#### 3.3 O que é compra (decisões do usuário, 13–14/10/2026) 🟢

- Nota de entrada `tipo='N'`, espécie em `SPED`, `NFE`, `NF`, `NFA` (fora CT-e, serviço,
  energia, telecom, cupom, fatura e devolução de cliente).
- Gerou contas a pagar (`geraDuplicata` verdadeiro **ou nulo**, para a nota que chegou
  antes de a integração mandar o campo).
- Fornecedor **ativo** (bloqueado no ERP fica de fora dos itens e da lista do filtro).
- Período pela data de digitação (`dtEntrada`, ou `dtEmissao` quando não houver).

#### 3.4 Categoria "usada", mais estrita que o Dashboard 🟢

Os relatórios só trazem produto de categoria com `usado = true`; a categoria **em
branco fica de fora**. No `corteDeVenda` do Dashboard e das Consultas ela conta, e por
isso o Relatório de Vendas pode dar **menos** que o Dashboard (decisão de 14/10/2026,
registrada no código). O filtro de categoria aceita a categoria **ou** a subcategoria.

#### 3.5 Vendas 🟢

`corteDeVenda.item` + emissão no período + categoria usada; filtros de vendedor (pelo
**cabeçalho**), cliente, município (`contains`), categoria, número da nota e produto.
Ordem padrão: vendedor, emissão, número, item, id. A coluna clicada vem primeiro, e a
padrão desempata (sem repetir nem pular linha entre páginas).

#### 3.6 Vendas por vendedor (mensal) 🟢

SQL bruto agrupando (vendedor do cabeçalho, cliente, `to_char(dtEmissao,'YYYY-MM')`),
com a lista de meses gerada do início ao fim (até 12, pelo contrato). Monta uma linha
por (vendedor, cliente) com quantidade e valor por mês e no total. `quebraPorVendedor` =
controle da tela, senão o parâmetro `RELATORIO_VENDAS_QUEBRA_VENDEDOR` (padrão `true`).
A linha **sempre** vem por vendedor; a tela decide se agrupa. O mês **não** pode ir pelo
alias no `GROUP BY`, porque `notas_saida_itens` já tem uma coluna `mes`.

#### 3.7 Estoque e compra 🟢

- **Estoque** = soma do saldo dos armazéns com `revenda = true`.
- **Entradas** = quantidade das notas de compra (§3.3) no período.
- **Saídas** = quantidade dos itens das notas de **venda** (cabeçalho de `corteDeVenda`)
  no período, sem o filtro de categoria do item.
- **Fornecedor e último preço** = os da última nota de compra com quantidade > 0
  (`LATERAL ... LIMIT 1`, ordenado por data desc e, no empate, pelo maior unitário).
  Isso exclui o CT-e de frete, que levava o código do produto. Depois de 15/10/2026 o
  cálculo roda só para os produtos filtrados, porque era o gargalo.
- `mesesPeriodo` = atalho da tela (3 a 6) ou dias ÷ 30,44.
- **Média** = saídas ÷ `mesesPeriodo`. **A comprar** = média × `mesesCompra` − estoque,
  com 1 casa; negativo significa sobra. É a fórmula da planilha de compra, coberta pelo spec.
- Produto inativo só entra se tiver saldo ou movimento; `comMovimento` exige movimento
  de todos.

#### 3.8 Opções 🟢

A busca por termos (`condicaoBuscaTermosSql`) cobre código, nome, fantasia e CNPJ/CPF
(também só com dígitos); no produto, também Cod. Corp., código e descrição no
fabricante e código de barras. Os ativos vêm antes. Produtos só de categoria usada;
fornecedores só ativos. Limite de 100.

#### 3.9 Achados

- 🟡 **Sem escopo hierárquico.** Nenhuma rota chama `resolverEscopoVendedores`: quem tem
  a permissão vê a empresa inteira (vendas de todos os vendedores, todos os clientes nas
  opções). Para Gerente e Administrativo isso é o desenho do plano. Mas a barreira é só
  a permissão: um perfil de Vendedor que receba `relatorio-vendas` passa a ver a venda
  de todos, ao contrário das Consultas.
- 🟡 **Exportar não vale em duas rotas.** `vendas-por-vendedor` e `estoque-compra`
  devolvem tudo sem paginação e sem `exigirExportarSeGrande`. Quem só tem `visualizar`
  já recebe o conjunto inteiro, e a trava de exportar fica só no botão.
- 🟡 **Saídas sem comodato nem bonificação** (🟡 INFERIDO quanto ao efeito). As saídas
  usam o corte de **venda** (comodato e nota sem duplicata ficam de fora). Remessa de
  comodato, bonificação e transferência também tiram produto do estoque, então a média
  de saída e o "a comprar" podem ficar **abaixo** do consumo real.
- 🟡 **Comentários contraditórios sobre o fornecedor bloqueado.** O topo do arquivo
  diz que ele sai "nem na lista do filtro nem nos itens", e o código das compras
  realmente o exclui. O comentário em `opcoes` diz que "a nota antiga dele continua no
  relatório".
- 🟡 **Mês por emissão** (`to_char(dtEmissao)`) no relatório mensal, enquanto as
  Consultas usam `n.ano/mes` do ERP. O mesmo período pode distribuir valores em meses
  diferentes se as duas datas divergirem.
- 🟡 Compras e Vendas não têm limite de período; com `pageSize` 20000 e 60 s de timeout,
  a exportação de períodos longos depende do tempo do banco.

### 4. Estruturas de dados 🟢

Sem tabela própria. Ver `data-dictionary.md`, seção `relatorios`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `MAXIMO_DA_TELA` | 200 (acima disso exige `exportar`) |
| `pageSize` | 1–20000, padrão 50 |
| `TEMPO_MAXIMO_MS` | 60000 |
| `DIAS_POR_MES` | 30,44 |
| `ESPECIES_DE_COMPRA` | `SPED`, `NFE`, `NF`, `NFA` |
| `RELATORIO_VENDAS_POR_VENDEDOR_MAX_MESES` | 12 |
| `RELATORIO_OPCOES_LIMITE` | 100 |
| Parâmetro `RELATORIO_VENDAS_QUEBRA_VENDEDOR` | booleano, padrão `true` |
| Permissões | `relatorio-compras`, `relatorio-vendas`, `relatorio-estoque-compra` (`visualizar`, `exportar`) |

### 6. Segurança / integridade

- 🟢 `withTenant` + `empresaId` explícito em todo SQL; SQL bruto parametrizado.
- 🟢 Ordenação por whitelist (`Object.hasOwn`, que não aceita propriedade herdada do
  `Object`).
- 🟢 `opcoes` devolve só código, nome e detalhe a quem não tem o cadastro.
- 🟡 Sem escopo e exportar parcial (§3.9).

### 7. Dependências do módulo 🟢

`PrismaService`, `ParametrosService`, `common/vendas/venda-analitica`,
`common/busca/termos-busca`, `@plataforma/contracts`. Consumidor: telas web de
Relatórios.

### 8. Cobertura de testes 🟢

`relatorios.service.spec.ts`: `periodo` (fechado e inválido), `estoqueCompra` (fórmula
da média e do "a comprar", média por dias, leitura no tenant) e `ordenar` (coluna
clicada e propriedade herdada). Não cobre o filtro de compra (espécie, duplicata,
fornecedor ativo), a trava de exportar nem a matriz mensal.

## Módulo `whatsapp`

**Caminho:** `apps/api/src/modules/whatsapp/`
**Tamanho:** 50 arquivos `.ts`, ~21.400 linhas. Os maiores:
`whatsapp-conversas.service.ts` (4011), `triagem/whatsapp-triagem.service.ts` (1994),
`providers/evolution-go.provider.ts` (1638), `whatsapp-sessao.service.ts` (1441),
`whatsapp.controller.ts` (1369, ~90 rotas), `whatsapp-evolution.controller.ts` (1146,
webhook), `whatsapp-acoes.service.ts` (903), `triagem/triagem-funcionario-tools.service.ts`
(795). 16 specs.
**Documentação viva relacionada:** `docs/ferramentas/README.md`,
`whatsapp-cliente.md`, `whatsapp-funcionario.md` (inventário das ferramentas de IA,
com a regra "acesso é código, comportamento é prompt").

### 1. Responsabilidade 🟢

Atendimento por WhatsApp integrado ao CRM, sobre o gateway **Evolution GO** (transporte
único desde 01/10/2026; `zapo` e `cloud_api` ficaram no enum e em colunas legadas).
Dois tipos de sessão:

| Sessão | `tipo` | Dono | IA |
|---|---|---|---|
| Aparelho do vendedor | `vendedor` | vendedor + usuário que pareou | nenhuma: conversa humana |
| Número institucional | `empresa` | ninguém (`vendedorId` nulo) | **triagem** atende cliente/desconhecido e funcionário, com catálogos separados |

Blocos funcionais:

- **Recebimento** (`WhatsappEvolutionController` → `WhatsappConversasService.receber`):
  webhook autenticado por segredo da instância, grava contato, conversa e mensagem,
  baixa a mídia depois de gravar e registra o atendimento no histórico do cliente.
- **Atendimento** (`WhatsappConversasService`): lista, mensagens, envio (texto, mídia,
  interativo, template), edição, exclusão, reação, presença, vínculo com cliente,
  iniciar conversa, assumir/encerrar no institucional, indicadores, sugestão de resposta.
- **Ações na conversa** (`WhatsappAcoesService`): títulos, boleto, DANFE, notas,
  orçamentos, fichas técnicas, agendar visita. Delega aos services das telas.
- **Triagem por IA** (`triagem/`): cliente ou desconhecido (13 ferramentas, só
  `registrar_lead` grava) e funcionário pareado por código (8 ferramentas, só leitura).
- **Sessões** (`WhatsappSessaoService`): parear, desconectar, reconectar, estado,
  aceite, administração (limpar histórico, excluir instância, importar histórico).
- **Agendamento** de mensagens, **recado interno** para a equipe, **inatividade** da
  triagem, **agenda do aparelho**, **respostas rápidas**, **configuração**.
- **Gerencial**: Histórico do WhatsApp da equipe, só leitura.

### 2. Rotas (resumo) 🟢

| Grupo | Rotas | Permissão |
|---|---|---|
| Configuração | `GET/PUT config`, templates, `testar-gateway` | `whatsapp-config.visualizar/editar` |
| Status | `GET integracao`, `GET meu-numero` | **sem permissão** (só JWT), de propósito |
| Recados internos | `GET/POST/PUT/DELETE recados…`, `PATCH recados/:id/lido` | `whatsapp-recados.*` |
| Minha sessão | `GET sessao`, `POST sessao/conectar`, `GET sessao/pareamento`, `DELETE sessao`, foto, `GET sessoes` | `whatsapp-conversas.*` |
| Número institucional | `config/sessao-empresa…` | `whatsapp-config.*` |
| Institucional de outra empresa | `config/empresas/:empresaId/…` | `whatsapp-config.*` + `PlatformAdminGuard` |
| Administração de instâncias | `config/sessoes/:id/{reconectar, conversas, instancia, instancia-e-historico, historico}` | `whatsapp-config.editar/excluir` |
| Conversas | `GET conversas`, `GET conversas/:id(/mensagens,/eventos)`, `POST conversas`, mensagens, interativa, arquivos, template, editar, apagar, reação, presença, vínculo, foto, `lida`, anotações, agendamentos, `assumir`, `encerrar`, `sugerir-resposta` | `whatsapp-conversas.*` |
| Ações | `conversas/:id/acoes/{titulos, notas, danfe, boleto, agendar, orcamentos, orcamento, orcamento/novo, fichas, ficha}` | a rotina dona do dado (`titulos-receber`, `notas-saida`, `atividades`, `orcamentos`, `produtos`) |
| Agenda do aparelho | `agenda/{contatos, conversas, sincronizar, importar}` | `whatsapp-conversas.*` |
| Gerencial | `gerencial/{filtros, conversas, conversas/:id/mensagens, conversas/:id/eventos}` | `whatsapp-historico.visualizar` |
| Indicadores | `atendimento/nao-lidas`, `atendimento/indicadores` | `whatsapp-conversas.visualizar` |
| Respostas rápidas | CRUD `respostas-rapidas` | `whatsapp-conversas.*` |
| Webhook | `POST whatsapp/evolution/webhook/:empresaId/:sessaoId` | sem JWT; segredo da instância |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Webhook da Evolution GO 🟢

- Empresa e sessão vêm na URL, porque com RLS a API não acharia a sessão sem o tenant.
- **O segredo é por instância**, guardado cifrado (`WHATSAPP_CRYPTO_KEY`, separada da
  chave do agente). É aceito em `?secret=`, no header `apikey`, como `Bearer` ou como
  senha de `Basic`. A comparação é `timingSafeEqual`. Sessão inexistente responde 401,
  não 404.
- Tipo do evento por substring, sem diferenciar maiúsculas, tolerando as variações de
  nome entre versões: `recibo`, `apelido`, `conexao` (inclui `connected` e `loggedout`,
  que eram perdidos), `historico` e `mensagem`. Evento desconhecido responde 200 para
  não haver reentrega infinita.
- Lote processado mensagem a mensagem; a falha de uma vai para o log e não derruba as
  outras.
- A mídia só é baixada **depois** de a API confirmar a gravação.

#### 3.2 `receber` — gravação da mensagem 🟢

1. Descarta grupo (`@g.us`), lista de transmissão, status e canal (`@newsletter`).
2. Telefone: o resolvido pelo evento; o do `jid` só quando não é `@lid` (opaco).
3. Contato: procura primeiro pelo `telefoneNormalizado` (evita duas conversas para
   `@lid` e `@s.whatsapp.net`); senão faz upsert por `(empresaId, jid)`. **Na criação**,
   tenta `casarCliente` (§3.3). O apelido só preenche nome vazio; o nome da agenda do
   celular pode corrigir.
4. Conversa: upsert por `(empresaId, sessaoId, contatoId)`; a nova no institucional nasce
   `bot`, a do aparelho nasce `humano`. A mensagem de saída do celular não conta como não
   lida; histórico também não. O histórico só adianta `ultimaMensagemEm` se for mais novo.
5. Idempotência: `(empresaId, conversaId, externoId)` único; a mensagem gravada antes
   como `outro` é corrigida se agora o tipo for reconhecido.
6. Mensagem nova grava `registrarAtendimentoWhatsapp`: uma atividade concluída por
   cliente por dia, só com cliente e vendedor.
7. Institucional `encerrada` que recebe mensagem nova do cliente **reabre em `bot`** e
   zera atendente, assunto e saudação.
8. Devolve `triagem: true` quando é institucional em `bot`, mensagem nova, do cliente e
   não histórico. Mensagem recebida não toca o sino (decisão de 08/10/2026); conta no
   ícone pelo `naoLidas`.

#### 3.3 Vínculo automático com cliente — `casarCliente` 🟢

Na criação do contato: compara os **últimos 8 dígitos** do telefone com `telefone`,
`telefone2` e `celular` dos clientes. No aparelho do vendedor, só dentro da carteira
dele; **no institucional, na base inteira** (`vendedorId` nulo). Exatamente um candidato
→ grava `clienteId` no contato (sem `vinculadoPor`); dois ou mais → não vincula.

#### 3.4 Escopo de leitura e escrita 🟢

- **Atendimento** (`filtroSessao` / `conversaNoEscopo`): só a sessão do usuário logado:
  `tipo='vendedor'`, vendedor do usuário e `sessao.usuarioId = usuário`
  (`sessaoDoUsuarioWhere`, decisão de 06/10/2026). Sem cadastro de vendedor, não vê nada.
  Fora do escopo dá 404. Vale para lista, mensagens, envio, ações, agendamento, não lidas.
- **Gerencial** (`escopoHistoricoWhatsapp`): admin ou perfil `carteiraCompleta` vê tudo;
  os demais veem a própria árvore (CTE recursiva por `superiorId`, inclusive vendedores
  inativos). Só leitura.
- **Indicadores do institucional** (`filtroSessaoEquipe`): o escopo antigo, de equipe.
  A conversa em `bot` não é de ninguém; a direcionada é de quem recebeu; a fila sem dono
  aparece para todos que atendem.
- `escopoLeituraWhatsapp` (função solta): usado fora do módulo (Posição de Cliente);
  exige `whatsapp-equipe.visualizar` para ver o time.

#### 3.5 Triagem do institucional 🟢

`WhatsappTriagemService.processar` nunca lança: falha vira log e `paraFila` (a conversa
fica `aguardando`, sem dono, e quem está trabalhando é avisado).

1. Contexto: só sessão `empresa` com a conversa em `bot`. Carrega a ficha da empresa (do
   **cadastro**), as informações e a saudação da config, os vendedores presentes e as 12
   últimas mensagens.
2. IA desligada (`atendimentoIaAtivo=false`) → fila.
3. **Funcionário?** `WhatsappFuncionarioService.identificar`: os últimos 8 dígitos
   filtram, a **chave com DDD** decide, o vínculo usuário×empresa precisa estar ativo e a
   resposta precisa ser única. Pendente → `parear` (código de 6 dígitos, válido 10 min,
   5 tentativas, mostrado só em `GET meu-numero`); confirmado (30 dias) →
   `atenderFuncionario`, com catálogo próprio e só leitura. Falha **não** vai para a
   fila.
4. Saudação literal (sem passar pelo modelo) na primeira vez.
5. Agente da empresa (`AgenteConfigService.paraUso`); sem agente → fila.
6. Catálogo `ferramentasDaTriagem(temCliente)` **fail-closed**: sem cliente vinculado, as
   ferramentas de dado nem são descritas ao modelo, e o executor confere de novo
   (`clienteId` nulo → erro).
7. Até `MAX_VOLTAS` = 4 rodadas de ferramenta; ao direcionar, o modelo para de falar.
8. Ferramentas que valem citar:
   - `identificar_cliente`: por CNPJ/CPF ou nome (≥ 3 letras); devolve só `encontrado` e
     um `vendedorId` opaco;
   - `direcionar_para_vendedor` / `direcionar_para_administrativo`: o `vendedorId` do
     modelo é conferido (existe, da empresa, ativo); senão, fila sem dono. Grava
     `aguardando`, `atendenteVendedorId`, `assunto` (até 200) e `direcionadaEm`, e avisa:
     o destinatário escolhido ou, sem dono, quem está em expediente com sessão aberta;
   - `avisar_equipe`: o destino é um **papel**, nunca um número; até 3 por conversa;
     assinado como automático;
   - `registrar_lead`: a única que grava (ver módulo `leads`);
   - `sobre_produto`: dossiê **sem preço por construção** (`ProdutoParaAgenteService`);
   - documentos (boleto, DANFE, pedido): três travas em série — o catálogo, a resolução
     número → id recortada pelo cliente da conversa e o gerador recortando de novo por
     `QuemPede`.

#### 3.6 Ciclo do institucional 🟢

`bot` → `aguardando` (direcionada) → `humano` (`assumir`, só sessão `empresa`, não em
`bot`, sem tomar de quem está atendendo) → `encerrada` (`encerrar` ou inatividade).
Mensagem nova depois de `encerrada` volta a `bot`. `WhatsappInatividadeService` roda a
cada 5 min e encerra conversas `bot` paradas há `atendimentoInatividadeMin` (padrão 30;
0 desliga), até um lote por empresa.

#### 3.7 Rotinas agendadas 🟢

- **Mensagem agendada** (`WhatsappAgendamentoService`, a cada 60 s): autorizada na
  criação; no envio não há usuário. A trava é `updateMany pendente → enviando`. Falha vira
  `erro` visível; nada some em silêncio. Sessão desconectada não envia.
- **Recado interno** (`WhatsappRecadoService`): para a equipe, pelo número institucional;
  nunca alcança cliente.
- As duas, mais a inatividade, varrem empresa a empresa (`empresas` não tem RLS) e
  guardam timers em memória.

#### 3.8 Exclusão de histórico 🟢

`apagar-conversas.ts`: ponto único, atrás de `whatsapp-config.excluir`. Apaga em cascata
mensagens, reações, agendamentos e ações; apaga a notificação do sino
(`referenciaId`); o lead **fica** sem `conversaId`; as atividades ficam. A mídia em
disco/MinIO é apagada **depois** do commit.

#### 3.9 Achados

- 🔴 **A triagem por IA não roda desde 01/10/2026.** O commit `d7d3205` ("evogo")
  removeu `whatsapp-interno.controller.ts`, que chamava `triagem.processar()` depois de
  `receber`. O `WhatsappEvolutionController` só usa `arquivoNecessario`, e nada no código
  chama `WhatsappTriagemService.processar` (o service continua registrado no módulo).
  Efeito no número institucional: a mensagem é gravada e fica em `bot`, sem saudação,
  sem resposta, sem direcionamento, sem lead e sem aviso a ninguém, até a varredura de
  inatividade encerrá-la (30 min). O atendimento a funcionário (pareamento e consultas)
  e a captação de leads param junto. Os specs (`seguranca.spec.ts` etc.) testam o
  service isolado e continuam passando.
- 🔴 **Vínculo automático com cliente pelos 8 últimos dígitos, na base inteira.** A
  documentação (`docs/ferramentas/whatsapp-cliente.md`) diz que o vínculo número ↔
  cliente "é feito por um vendedor, na tela, e é ele que autoriza tudo o que vem depois —
  inclusive mandar boleto e nota fiscal para aquele número". O código vincula
  **sozinho**, na criação do contato, quando os 8 últimos dígitos casam com exatamente um
  cliente. No institucional a busca é na base inteira, sem DDD. Um número de outro DDD
  com o mesmo final, um número de celular reciclado pela operadora ou o telefone do
  contador cadastrado no cliente ganham as ferramentas de cliente: títulos, 2ª via de
  boleto, DANFE, pedidos. A identificação de funcionário, no mesmo módulo, exige a chave
  **com DDD** justamente por isso. O vínculo automático não grava `vinculadoPor`, então
  dá para distingui-lo do manual. Requer decisão: restringir ao vínculo manual nas
  ferramentas de documento, ou exigir DDD.
- 🔴 **A fila do institucional não tem caminho de atendimento** (conhecido: o
  institucional "ficou fora" da revisão de 06/10/2026). `conversaNoEscopo` só aceita
  sessão `tipo='vendedor'` do próprio usuário, e `assumirAtendimento` exige
  `sessao.tipo === 'empresa'` depois disso, então nunca passa (404). A conversa
  institucional direcionada não aparece na lista, não abre, não é assumida nem
  encerrada pela tela. No Gerencial só o admin ou `carteiraCompleta` a vê (a sessão não
  tem `vendedorId`). Os avisos de "cliente aguardando" levam a uma conversa que o
  destinatário não abre.
- 🟡 **`identificar_cliente` ainda é um oráculo.** O nome do cliente e o do vendedor não
  voltam ao modelo, mas `encontrado: true/false` por CNPJ confirma quem é cliente. A busca
  por nome usa `contains` com 3 letras e `findFirst`, então "mercado" acha um cliente
  qualquer e direciona a conversa ao vendedor dele.
- 🟡 **Contato único por empresa, vínculo decidido uma vez.** `WhatsappContato` é único
  por `(empresaId, jid)` e compartilhado entre as sessões. `casarCliente` só roda na
  **criação**, com o recorte da sessão que viu o número primeiro: se foi um vendedor sem o
  cliente na carteira, o institucional nunca o reconhece depois. Além disso, a busca do
  contato existente é pela **igualdade** do telefone normalizado; com e sem 9º dígito ou
  DDI viram dois contatos.
- 🟡 **Segredo do webhook aceito na query string** (`?secret=`): ele acaba nos logs de
  acesso do proxy e do gateway.
- 🟡 **Quatro rodadas sem texto final.** Se o modelo usa as 4 voltas chamando ferramentas
  sem direcionar nem responder, nada é enviado ao cliente e a conversa fica em `bot` até a
  inatividade encerrá-la.
- 🟡 **Triagem em paralelo** (quando voltar a ser chamada): nada serializa por conversa;
  duas mensagens seguidas disparariam duas execuções, com respostas duplicadas ou
  direcionamentos concorrentes.
- 🟡 **Comentários desatualizados.** O cabeçalho do webhook diz que "conversa de contato
  sem cliente vinculado não é gravada", mas desde 05/10 tudo é gravado. O de
  `WhatsappSessaoService` e o de `WhatsappAgendaService` ainda falam do supervisor lendo
  a equipe pelo Atendimento, o que acabou em 06/10.
- 🟡 Os timers de retomada, agendamento, recado e inatividade ficam em memória e varrem
  todas as empresas em série. Com mais de uma instância da API rodando, a inatividade e
  o recado dependem das próprias travas para não duplicar.
- 🟡 `ultimaMensagemEm` usa `new Date()` no update e `quando` (a data do WhatsApp) na
  criação.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `whatsapp`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `WhatsappSessaoTipo` | `vendedor`, `empresa` |
| `WhatsappAtendimentoStatus` | `bot`, `aguardando`, `humano`, `encerrada` |
| `WhatsappSessaoStatus` | `desconectada`, `pareando`, `conectada`, `banida` |
| `WhatsappTransporte` | `zapo`, `evolution_go` (o único em uso), `cloud_api` |
| `WhatsappTipoMensagem` | `texto`, `imagem`, `documento`, `audio`, `video`, `localizacao`, `contato`, `outro`, `botoes`, `lista`, `enquete`, `link`, `resposta` |
| `WhatsappStatusEntrega` | `pendente`, `enviada`, `entregue`, `lida`, `erro` |
| `WhatsappAgendamentoStatus` | `pendente`, `enviando`, `enviada`, `erro`, `cancelada` |
| Triagem | `MAX_VOLTAS` 4, `HISTORICO` 12 mensagens, `MAX_AVISOS_POR_CONVERSA` 3, `PRESENCA_MIN` 30 |
| Pareamento de funcionário | código de 6 dígitos, válido 10 min, 5 tentativas; confirmação vale 30 dias |
| Inatividade | varredura a cada 5 min; `atendimentoInatividadeMin` padrão 30 (0 desliga) |
| Agendamento | varredura a cada 60 s |
| Segredos | `WHATSAPP_CRYPTO_KEY` (AES-256-GCM): chave da Evolution, token e segredo do webhook de cada instância |
| Aceite | `WHATSAPP_ACEITE_TEXTO`, versão `2026-10-05` (tudo é monitorado) |
| Permissões | `whatsapp-config`, `whatsapp-conversas`, `whatsapp-recados`, `whatsapp-historico`, `whatsapp-equipe` + as das rotinas das ações |

### 6. Segurança / integridade

- 🟢 Webhook com segredo por instância, cifrado, comparado em tempo constante.
- 🟢 A sessão é sempre resolvida pelo usuário logado; nenhum `sessaoId` da tela amplia o
  alcance.
- 🟢 As ações delegam aos services das telas (escopo e RLS valem) e exigem a permissão da
  rotina dona do dado.
- 🟢 A triagem é fail-closed: o catálogo depende do vínculo, o modelo nunca vê id
  interno, o produto vem sem preço, `avisar_equipe` usa papel em vez de número, e
  funcionário só lê, com código confirmado.
- 🔴 Vínculo automático pelos 8 últimos dígitos (§3.9).
- 🟡 Segredo na query string; `identificar_cliente` como oráculo.

### 7. Dependências do módulo 🟢

Importa `TitulosReceberModule`, `NotasSaidaModule`, `AtividadesModule`,
`OrcamentosModule`, `ProdutosModule` (`ProdutoParaAgenteService`) e `ProvedorIaModule`;
usa `AgenteConfigService`, `common/escopo/*` (`resolverEscopoVendedores`, `quem-pede`),
`common/atividades/registrar-atendimento-whatsapp`, o armazenamento (disco/MinIO) e
`registrar-notificacao`. Exporta config, sessão, conversas, respostas rápidas, ações,
agendamento e funcionário para: agente interno (ferramentas de WhatsApp), notificações
(não lidas), Meu perfil (código de pareamento), Posição de Cliente
(`escopoLeituraWhatsapp`) e `leads`. Externo: o gateway Evolution GO 0.7.2. O
`apps/whatsapp-worker` (zapo) ainda existe no repositório, mas não é mais transporte
ativo.

### 8. Cobertura de testes 🟡

16 specs, entre eles: `seguranca.spec.ts` (invariantes e lista exata do que o
desconhecido alcança), `triagem-funcionario-tools.spec.ts` (recorte de carteira),
`whatsapp-funcionario-identidade.spec.ts`, `telefone-equipe.spec.ts`,
`proximo-expediente.spec.ts`, `ficha-da-empresa.spec.ts`, `triagem-ferramentas.spec.ts`,
`whatsapp-evolution.controller.spec.ts`, `evolution-go.provider.spec.ts`,
`iniciar-conversa.spec.ts`, `mensagem-interativa.spec.ts`, `escopo-whatsapp.spec.ts`,
`anotacao.spec.ts`, `apagar-conversas.spec.ts`, `foto-perfil-whatsapp.spec.ts` e
`midia-arquivos.spec.ts`. **Nenhum teste liga o recebimento à triagem**, que é a lacuna
que deixou a remoção da chamada passar despercebida. Também não há teste de
`casarCliente`.

## Módulo `agente`

**Caminho:** `apps/api/src/modules/agente/`
**Tamanho:** 29 arquivos, ~9.500 linhas. Os maiores: `agente-tools.service.ts` (2463,
o catálogo), `agente-chat.service.ts` (939, o laço), `agente-ferramentas.service.ts`
(620, governança), `agente-config.service.ts` (575), `agente.controller.ts` (543, 29
rotas), `codex.client.ts` (467), `codex-oauth.service.ts` (407). 6 specs.
**Documentação viva:** `docs/ferramentas/agente-interno.md` (inventário com permissão,
tipo e delegação de cada ferramenta) e `docs/ferramentas/README.md`.

### 1. Responsabilidade 🟢

Assistente de IA interno para o funcionário **logado**: chat com ferramentas que
consultam e (com confirmação) gravam no CRM, delegando aos services das telas. Também
contém:

- a camada de **provedor de IA** reaproveitada pela triagem do WhatsApp
  (`ProvedorIaModule`: Anthropic Messages, OpenAI-compatível e Codex Responses por OAuth);
- a **configuração por empresa** (provedor, chave cifrada, modelo, temperatura, limites,
  personalidade, embeddings);
- a **governança do catálogo** (ligar/desligar ferramenta, restringir por perfil,
  reescrever descrição e instruções, versões de prompt, termos de aceite, auditoria);
- a **abertura do dia** (`meu_dia`, resumo diário) e os **anexos** (ficha técnica em PDF,
  foto de produto).

### 2. Rotas 🟢

| Grupo | Rotas | Permissão |
|---|---|---|
| Uso | `GET apresentacao`, `GET resumo-diario`, `POST resumo-diario/:data/exibido`, `GET ferramentas-disponiveis` | `agente.visualizar` |
| Conversa | `GET conversas`, `GET conversas/:id`, `POST conversas/mensagens`, `POST conversas/mensagens/stream` (SSE), `POST anexos`, `POST conversas/:id/confirmar/:pendenciaId`, `POST conversas/:id/cancelar/:pendenciaId` | `agente.visualizar` |
| Configuração | `GET/PUT config`, `POST config/testar`, `config/oauth/{iniciar, concluir, importar, desconectar}` | `agente-config.visualizar/editar` |
| Governança | `GET ferramentas`, `PUT ferramentas/:chave`, `GET/POST ferramentas/termos`, `POST ferramentas/restaurar-todos`, `POST ferramentas/:chave/restaurar`, `GET ferramentas/auditoria` | `agente-config.*` |
| Prompt | `POST prompt/previa` (sem custo), `POST prompt/testar` (consome tokens) | `agente-config.visualizar/editar` |

### 3. Algoritmos e lógica não-trivial

#### 3.1 O turno — `AgenteChatService.enviar` 🟢

1. `config.paraUso` (credencial em claro, só em memória); confere o anexo (`anexos.meu`)
   **antes** de criar a conversa.
2. A conversa é sempre do usuário (`minhaConversa`: `usuarioId`; nem o admin lê a dos
   outros). Na primeira mensagem, título = 60 primeiros caracteres.
3. Grava a mensagem do usuário (**sem máscara**: texto livre vai ao provedor como foi
   digitado).
4. `governanca.filtroPara` (config da empresa + perfil + WhatsApp vinculado) **antes**
   do contexto, para a lista no prompt bater com o catálogo enviado.
5. Na conversa nova, `aberturaDoDia` (`AgenteMeuDiaService`: agenda, meta, sino e
   aniversário, cada bloco só com a permissão de origem).
6. `montarContexto`: system prompt da empresa + bloco do servidor (nome e e-mail do
   usuário, data de hoje em `America/Campo_Grande`, ferramentas liberadas, regra das
   referências `«CLI:…»`, "não afirme que gravou", "não invente número") + instruções
   por ferramenta + `REGRAS_FIXAS_AGENTE_INTERNO` + as últimas `historicoMensagens`.
7. Até `maxIteracoesFerramentas` voltas (padrão 5). Em cada chamada:
   - ferramenta inexistente → erro ao modelo;
   - **segunda trava**: `garantirPermissao` **e** estar entre as `disponiveisPara` (pega
     a ferramenta desligada que o modelo "lembra" do histórico);
   - `referencias.resolverIds`: troca `«CLI:código»` pelo id real nos argumentos;
   - `usaAnexo`: o `anexoId` é **injetado pelo servidor**, sobrescrevendo o que o modelo
     tenha inventado;
   - `escrita: true` → **não executa**: grava `AgenteMensagem` com `pendente=true`,
     argumentos e resumo, e diz ao modelo que nada foi gravado;
   - leitura → `executarLeitura`; erro de negócio volta como resultado; grava a
     auditoria com o **resumo mascarado**, não o payload cru (`posicao_cliente` tinha
     ~400 KB).
8. Sem texto final nas voltas → mensagem fixa "não consegui concluir…".
9. A resposta é gravada **mascarada** e devolvida remontada (`remontarTexto`) com até 2
   destinos (botões de tela, montados pelo servidor a partir do resultado real).

#### 3.2 Fronteira de dados — `anonimizar-agente.ts` 🟢

Mascara **por nome de chave conhecida** (não por heurística de texto): nome de cliente,
produto e vendedor viram `«CLI:código»`, `«PRD:código»`, `«VND:código»` (determinístico,
pelo código ERP, sem mapa por conversa); CNPJ/CPF, e-mail, telefone, endereço e contato
não vão. Valores, quantidades e datas **vão** (decisão de 25/08/2026). A ordem é
mascarar → podar listas (`limiteItens`, padrão 8; profundidade 4) → `garantirMascarado`
(falha a resposta se um campo de identificação escapou) → cortar no teto (padrão 4.000
caracteres). Exceção única: `identificacaoPublica` (só `consultar_cnpj`), cujo bloco
`receitaFederal` passa inteiro; o resto do payload continua sob a trava, e
`agente-tools.permissao.spec.ts` reprova se outra ferramenta declarar a exceção.

#### 3.3 Confirmação — `confirmar` / `cancelar` 🟢

`confirmar`: a conversa é do usuário, a pendência existe nela e ainda está `pendente`, a
ferramenta existe e `garantirPermissao` continua valendo. Executa
`ferramenta.executar(argumentos gravados)` e marca `pendente=false`, `confirmadaEm`,
`confirmadaPor` e `resultado`. `cancelar` só fecha a pendência e anota "(cancelada)".

#### 3.4 Catálogo e alcance 🟢

- **31 ferramentas** no código: 22 de leitura e 9 de escrita (4 exigem WhatsApp
  pareado, 2 exigem anexo). A doc lista 30; `consultar_feriados`
  (`atividades.visualizar`, leitura) não está na tabela.
- `disponiveisPara` = RBAC (`isAdmin` ou permissão) ∧ config da empresa (desligada vale
  até para o admin; restrição por perfil não vale para o admin; sem config carregada, o
  catálogo é puro) ∧ `exigeWhatsapp` (**fail-closed**) ∧ `usaAnexo` (só com arquivo no
  turno).
- `filtroCarteira`: só o vendedor "puro" (`tipo='vendedor'`) ganha `vendedorId` explícito;
  supervisor, gerente, diretor, admin e quem não tem cadastro ficam no escopo do service.
  É defesa em profundidade, porque o service já aplica `resolverEscopoVendedores`.
  `garantirClienteNoAlcance` e `garantirOportunidadeNoAlcance` barram o vendedor puro em
  id alheio (403).
- WhatsApp pelo agente: cada um lê **só a própria conexão**, inclusive supervisor
  (`mensagensDaPropriaConexao`, `historicoDoClienteNaPropriaConexao`).

#### 3.5 Governança — `AgenteFerramentasService` 🟢

Uma linha por (empresa, ferramenta): `ativa`, `nome`, `descricao`, `instrucoes`,
`versaoPrompt`, perfis. **Só restringe, nunca amplia.** Editar texto exige aceite dos
termos (`termosPromptAceitosEm/Por`); toda mudança grava `AgenteFerramentaAuditoria`
(campo, valor anterior e novo, autor). Versões (`agente-prompt-versoes.ts`): a v1 é o
texto do catálogo; `versaoPrompt` nulo acompanha a mais recente, preenchido trava;
reescrita da empresa vence a versão. Prévia do prompt (sem custo) e teste (consome
tokens).

#### 3.6 Provedores e credenciais 🟢

- `AgenteCredencial` por (empresa, provedor): trocar de provedor mantém as duas chaves e
  o modelo de cada um. A chave é cifrada (AES-256-GCM, chave mestra própria do agente,
  separada da do WhatsApp); a leitura só mostra os últimos 4 caracteres.
- **Codex por OAuth** (assinatura ChatGPT): usa o `CLIENT_ID` do CLI oficial e o
  `redirect_uri` fixo `localhost:1455`. O fluxo é em duas etapas: o administrador cola a
  URL de retorno, e o `code_verifier` do PKCE nunca sai da API. O refresh token é
  cifrado e a renovação é antecipada pela `tokenExpiraEm`.
- **Embeddings**: endpoint OpenAI-compatível opcional; sem configuração, `disponivel()`
  = false e a busca segue só lexical (decisão de 05/09/2026, infraestrutura desligada).

#### 3.7 Anexos 🟢

Material de passagem: o modelo lê uma vez (o PDF vira Markdown na ficha técnica, a foto
vai para o produto). Travas em código: `withTenant`, `usuarioId` (`meu`), `consumidoEm`
(não reusa o upload), `usaAnexo` (some do catálogo sem arquivo) e lista branca de MIME.
O anexo vale para a conversa até ser consumido (`doTurno`). A OpenAI-compatível não lê
PDF e recusa com mensagem clara.

#### 3.8 Achados

- 🟡 **Confirmação não é atômica.** `confirmar` lê `pendente=true`, executa e só depois
  grava `pendente=false`, sem trava. Dois cliques ou duas abas confirmando a mesma
  pendência ao mesmo tempo executam **duas vezes** (dois orçamentos, duas atividades,
  duas mensagens agendadas). Falta um `updateMany … where pendente=true` antes de
  executar.
- 🟡 **A confirmação revalida só a permissão.** A doc diz que "na confirmação tudo é
  revalidado", mas `confirmar` não reconfere a governança da empresa (ferramenta
  desligada ou restrita por perfil depois de preparada) nem `exigeWhatsapp`. Os services
  de destino ainda aplicam escopo, então o efeito é limitado à governança.
- 🟡 **Pendência sem validade.** Uma ação preparada semanas atrás continua confirmável
  com os argumentos da época (data de agendamento no passado, preço antigo).
- 🟡 **Nome e e-mail do usuário vão ao provedor**, no bloco de contexto. O nome do
  vendedor é mascarado nos resultados, mas o de quem está logado vai em claro.
- 🟡 **Hora do agendamento sem fuso.** O prompt informa a data em Campo Grande, mas
  `agendar_atividade` faz `new Date('AAAA-MM-DDTHH:mm')` no fuso do processo (ver
  `atividades` §3.7).
- 🟡 **Codex com o cliente OAuth do CLI oficial** num backend: depende de restrições de
  um cliente que não é nosso (redirect fixo, possível revogação) e do uso da assinatura
  ChatGPT fora do CLI. Isso é risco operacional e contratual a avaliar.
- 🟡 `todas()` recria as 31 ferramentas (com closures) a cada `buscar`/`disponiveisPara`,
  várias vezes por turno.
- 🟡 A doc lista 30 ferramentas; o código tem 31 (`consultar_feriados`).
- 🟡 `AgenteConversa` não tem índice por `(empresaId, usuarioId)`, a chave da listagem.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `agente`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| Padrões de `AgenteConfig` | `ativo=false`, provedor `anthropic`, `baseUrl` `https://api.anthropic.com`, modelo `claude-opus-5`, temperatura 0,3, `maxTokens` 2048, `maxIteracoesFerramentas` 5, `historicoMensagens` 20, nome "Assistente" |
| Resultado ao modelo | teto 4.000 caracteres, 8 itens por lista (ajustável por ferramenta) |
| Destinos por turno | até 2 (`MAX_DESTINOS`) |
| Referências | `«CLI:código»`, `«PRD:código»`, `«VND:código»` |
| Fuso do contexto | `America/Campo_Grande` |
| Permissões | `agente.visualizar`, `agente-config.visualizar/editar` + a de cada ferramenta |

### 6. Segurança / integridade

- 🟢 Duas travas de permissão (catálogo e execução), escrita sempre como pendência, anexo e
  ids injetados pelo servidor, conversa privada por usuário.
- 🟢 Fronteira de dados por chave conhecida com verificação final (`garantirMascarado`);
  histórico gravado mascarado.
- 🟢 Credenciais cifradas com chave mestra própria; nunca retornadas.
- 🟡 Confirmação sem trava de concorrência e sem revalidar governança (§3.8).

### 7. Dependências do módulo 🟢

Delega a `ConsultasService`, `ClientesService`, `ProdutosService`,
`ProdutoRelacionadosService`, `OrcamentosService`, `TitulosReceberService`,
`SugestaoCompraService`, `ObjetivosService`, `EnriquecimentoService`,
`AtividadesService`, `OportunidadesService`, `WhatsappConversasService`,
`VendedoresService`, `WhatsappAcoesService`, `WhatsappAgendamentoService`,
`MeusAtendimentosService`, `ProdutoFichasService`. Exporta `ProvedorIaModule`
(`ProvedorFactory`, `AgenteConfigService`) para a triagem do WhatsApp. Externos: API
Anthropic, provedores OpenAI-compatíveis, backend Codex (OAuth ChatGPT) e endpoint de
embeddings.

### 8. Cobertura de testes 🟢

`agente-tools.permissao.spec.ts` (toda ferramenta tem permissão; governança só
restringe; só `consultar_cnpj` declara dado público), `anonimizar-agente.spec.ts` (falha
se campo novo escapar), `agente-meu-dia.spec.ts`, `agente-resumo-diario.spec.ts`,
`agente-resumo-metas.spec.ts`. Falta teste da confirmação (concorrência, revalidação) e
do laço `enviar`.

## Módulo `notificacoes`

**Caminho:** `apps/api/src/modules/notificacoes/`
**Arquivos (5):** `notificacoes.module.ts`, `notificacoes.controller.ts` (3 rotas),
`notificacoes.service.ts` (94), `registrar-notificacao.ts` (133, funções exportadas),
`notificacoes-varredura.service.ts` (337). Sem spec.

### 1. Responsabilidade 🟢

O **sino**: uma tabela única (`notificacoes`) endereçada a um usuário. Quem provoca o
fato grava a linha **dentro da própria transação** (`registrarNotificacao`). A única
exceção é o prazo que vence com o tempo (atividade vencida, título vencido), que uma
varredura periódica grava.

### 2. Fluxo de controle — funções principais 🟢

| Função / rota | Guarda | Comportamento |
|---|---|---|
| `feed` — `GET /notificacoes` | só JWT | não lidas do usuário, sem `whatsapp_mensagem` (decisão de 08/10/2026); total + 20 mais recentes por `ocorridaEm` |
| `marcarLida` — `POST /notificacoes/:id/lida` | só JWT | `updateMany` com `usuarioId` no filtro; repetir conta como sucesso; id alheio dá 404 |
| `marcarTodasLidas` — `POST /notificacoes/lidas` | só JWT | todas do usuário |
| `registrarNotificacao(tx, n)` | — | upsert atômico (`INSERT … ON CONFLICT` no índice parcial) |
| `marcarNotificacoesDaOrigem(tx, …)` | — | fecha as pendentes de uma origem (conversa aberta, atividade concluída) |
| `usuarioDoVendedor(tx, …)` | — | destinatário de tudo que é da carteira; vendedor sem login → `null` (não notifica) |
| `NotificacoesVarreduraService.varrer` | timer 30 min + uma vez no boot | atividades vencidas e títulos vencidos, empresa a empresa |

Sem `PermissionsGuard` de propósito: a notificação foi endereçada na origem, onde o
escopo era conhecido. Não se refiltra na leitura.

### 3. Algoritmos e lógica não-trivial

#### 3.1 Deduplicação — `registrarNotificacao` 🟢

- Autor = destinatário → não grava.
- Índice único **parcial** `notificacoes_pendente_por_referencia`
  `(empresaId, usuarioId, tipo, referenciaId) WHERE lidaEm IS NULL AND referenciaId IS
  NOT NULL`: só uma pendente por origem. Sem `referenciaId`, sempre insere.
- `acumular=true` (fato que se soma): `contador+1` e `ocorridaEm` novo (volta ao topo).
  `false` (fato reafirmado): mantém o contador e a data. Título, descrição e rota são
  sempre reescritos.
- `ON CONFLICT` em vez de "procura e grava": duas gravações simultâneas não derrubam a
  transação de quem provocou o fato.

#### 3.2 Atividade vencida 🟢

Atividade aberta, ativa, com vencimento **até o fim de hoje**, de vendedor com login, que
**nunca** foi avisada (`jaAvisados`, lidas ou não, para a janela andar e não ressuscitar
o que o usuário limpou). Lote de 200 por empresa, as mais antigas primeiro.
`ocorridaEm` = data do prazo; rota `/crm/atividades/:id`. Depois, fecha as notificações
de atividades concluídas, inativas ou excluídas.

#### 3.3 Título vencido — uma linha por cliente 🟢

- Agrega no banco por (cliente, usuário do vendedor): quantidade, total, mais antigo e
  `novidadeEm = MAX(GREATEST(vencimento, createdAt))`. O `createdAt` entra porque o
  import do ERP traz parcela já vencida.
- Corte "vencido": `vencimento < calendario.corteVencidos(hoje)`, considerando os dias
  úteis com feriados.
- Só vendedor `tipo='vendedor'`, ativo, não desligado, com login. Supervisor, gerente e
  os cadastros de sistema ficam de fora.
- Lote de 200 **clientes**, os mais atrasados primeiro.
- Não insiste: se o usuário leu e nada venceu nem entrou depois (`ultimaLeitura ≥
  novidadeEm`), pula. Senão faz o upsert, que reescreve a contagem e o total da linha
  pendente. Título: razão social; descrição: "N títulos vencidos · R$ X"; rota
  `/comercial/posicao-cliente/:clienteId`.
- Fecha a linha do cliente que não tem mais título vencido daquele usuário. Isso também
  aposenta as notificações do desenho antigo, uma por título.

#### 3.4 Achados

- 🟡 **`jaAvisados` cresce sem limite.** A cada 30 min, para cada empresa, carrega
  **todos** os `referenciaId` já notificados do tipo e os passa num `notIn`. Sem
  retenção na tabela, a consulta piora com o tempo.
- 🟡 **Atividade reatribuída não avisa o novo dono.** `jaAvisados` não considera o
  `usuarioId`: se a atividade já gerou aviso para o vendedor anterior, o novo nunca
  recebe.
- 🟡 **"Fim de hoje" no fuso do servidor.** `setHours(23,59,59)` usa o fuso do processo,
  a mesma lacuna de `atividades`.
- 🟡 **Três gravações por fora do `registrarNotificacao`.** `sugestao-compra`,
  `clientes-receita-lote` e `whatsapp-recado` usam `tx.notificacao.create` e não passam
  pela deduplicação nem pela regra "autor = destinatário".
- 🟡 Não há limpeza de notificações lidas antigas.
- 🟡 `Promise.all` dentro da transação interativa (`feed`).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `notificacoes`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `NotificacaoTipo` | `whatsapp_mensagem` (fora do sino desde 08/10), `whatsapp_agendamento_erro`, `atividade_vencimento`, `orcamento_aprovado`, `orcamento_recusado`, `cliente_atribuido`, `titulo_vencido`, `whatsapp_aguardando`, `lead_novo`, `recado_interno`, `sugestao_compra_calculada` |
| `LIMITE_ITENS` (sino) | 20 |
| Varredura | a cada 30 min + no boot; `LOTE` 200 por tipo e empresa |

Quem grava: `leads`, `orcamentos/registrar-atividade-orcamento`,
`clientes/cliente-alteracoes` (`cliente_atribuido`), `whatsapp/triagem` (2 pontos),
`whatsapp-agendamento` (erro de envio), `whatsapp-recado`, `sugestao-compra`,
`clientes-receita-lote` e a varredura.

### 6. Segurança / integridade

- 🟢 Toda leitura e escrita filtra por `usuarioId` do logado; `marcarLida` não revela a
  notificação alheia.
- 🟢 A gravação junto do fato, na mesma transação, garante que os dois existem ou nenhum.

### 7. Dependências do módulo 🟢

`PrismaService`, `common/horario/calendario-util`, `whereEmpresaAcessivel`,
`@plataforma/contracts`. Consumidores: os gravadores acima e o sino da web.

### 8. Cobertura de testes 🟡

Nenhum teste no módulo: nem a deduplicação do `ON CONFLICT`, nem as regras de "não
insistir" dos títulos.

## Módulo `email`

**Caminho:** `apps/api/src/modules/email/`
**Arquivos (5):** `email-config.module.ts`, `email-config.controller.ts` (8 rotas),
`email-config.service.ts` (711), `email-config.dto.ts`, `email-config.service.spec.ts`.

### 1. Responsabilidade 🟢

Configuração do e-mail por empresa (Administração > E-mail): servidor SMTP, interruptores
por funcionalidade, modelos de assunto e texto, e identidade visual. **Sem tabela
própria**: tudo vive em `parametros_empresa` (decisão do usuário de 01/10/2026, mesmo
desenho do SMS). O envio em si é do `common/mail` (`MailService`, `layoutEmail`,
`substituirTags`, `smtpDaEmpresa`).

### 2. Rotas 🟢

| Rota | Permissão | Comportamento |
|---|---|---|
| `GET /email/configuracao` | `email.visualizar` | parâmetros SMTP e interruptores; senha só como `senhaPreenchida` |
| `PUT /email/configuracao` | `email.editar` | upsert dos parâmetros; a senha só muda quando vem preenchida |
| `POST /email/teste` | `email.editar` | e-mail de teste **para o próprio usuário**, mesmo com o envio desligado |
| `GET /email/disponivel` | só JWT | o que a tela pode oferecer (`habilitado`, `documentos`, `boleto`, `cobranca`, `senhaProvisoria`) |
| `GET /email/modelos` | `email.visualizar` | modelos + identidade visual (padrões do sistema quando vazios) |
| `PUT /email/modelos` | `email.editar` | grava os modelos |
| `POST /email/modelos/restaurar` | `email.editar` | volta ao padrão |
| `POST /email/modelos/teste` | `email.editar` | renderiza o modelo com dados de exemplo e envia (`destinatario` opcional, senão o próprio usuário) |

### 3. Algoritmos e lógica não-trivial 🟢

- **Disponibilidade:** `habilitado = EMAIL_ATIVO ∧ SMTP configurado` (da empresa, ou do
  **ambiente** quando `SMTP_HOST` está vazio). Cada funcionalidade só fica disponível com
  `habilitado` e o seu interruptor ligado. `exigir(empresa, funcionalidade)` responde 409
  com a mensagem do que ligar, e é chamado por quem envia.
- **SMTP da empresa** (`smtpDaEmpresa`): sem `SMTP_HOST`, devolve `null` e o
  `MailService` usa a configuração do ambiente. O mesmo SMTP serve à senha provisória e
  aos documentos.
- **Modelos:** tags `{{ chave.sub }}` substituídas por `substituirTags`. No corpo,
  `formatarTextoHtml` escapa **depois** da substituição (o dado do cliente não injeta
  HTML) e troca as quebras de linha por `<br />`. Cor do cabeçalho em `#rrggbb`. A
  assinatura do colaborador e o `reply-to` para o remetente são configuráveis.

### 4. Achados

- 🟡 **Senha SMTP em texto puro no banco.** `SMTP_SENHA` é um parâmetro de tipo
  `senha`: a API não a devolve, mas ela fica sem cifra em `parametros_empresa.conteudo`.
  As chaves do agente e da Evolution GO são cifradas com AES-256-GCM (chave mestra
  própria), e esta não.
- 🟡 `POST /email/modelos/teste` aceita qualquer `destinatario`: quem tem `email.editar`
  manda e-mail com a identidade da empresa para um endereço arbitrário (só com dados de
  exemplo).
- 🟡 `configuracao()` faz uma leitura de parâmetro por campo, cerca de 12 consultas por
  chamada. `GET /email/disponivel` é chamado pelas telas que mostram os botões.

### 5. Metadados e configurações 🟢

| Parâmetro | Tipo | Padrão |
|---|---|---|
| `EMAIL_ATIVO` | booleano | `true` |
| `SMTP_HOST`, `SMTP_PORTA`, `SMTP_SEGURO`, `SMTP_USUARIO`, `SMTP_SENHA` (senha), `SMTP_REMETENTE` | — | vazio (porta 587 no envio; `SEGURO` false) |
| `EMAIL_DOCUMENTOS`, `EMAIL_BOLETO`, `EMAIL_COBRANCA`, `EMAIL_SENHA_PROVISORIA` | booleano | `true` |
| `EMAIL_MODELO_{COBRANCA,NOTA,BOLETO}_{ASSUNTO,TEXTO}` | texto 200/2000 | padrão do sistema (`EMAIL_MODELOS_PADRAO`) |
| `EMAIL_COR_CABECALHO` | texto 10 | — |
| `EMAIL_REPLY_TO_USUARIO`, `EMAIL_ASSINATURA_USUARIO`, `EMAIL_ASSINATURA_TELEFONE`, `EMAIL_ASSINATURA_EMAIL` | booleano | `true` |

### 6. Dependências e testes

`PrismaService`, `ParametrosService`, `MailService` e `common/mail/*`. Consumidores:
`documentos-email`, `recuperacao-senha`/senha provisória e as telas. Spec:
`email-config.service.spec.ts`.

## Módulo `documentos-email`

**Caminho:** `apps/api/src/modules/documentos-email/`
**Arquivos (5):** `documentos-email.module.ts`, `documentos-email.controller.ts`
(3 rotas), `documentos-email.service.ts` (700), `documentos-email.dto.ts`,
`documentos-email.service.spec.ts`.

### 1. Responsabilidade 🟢

Envio por e-mail ao **e-mail do cadastro do cliente**: 2ª via do DANFE (com XML
opcional), 2ª via do boleto e cobrança dos títulos vencidos. Usa a identidade visual da
empresa e a assinatura do colaborador, e registra no histórico de atendimento
(`registrarAtividadeDocumento`).

### 2. Rotas 🟢

| Rota | Permissão (qualquer uma) | Comportamento |
|---|---|---|
| `POST /documentos-email/nota/:id` | `notas-saida.visualizar` ou `posicao-cliente.visualizar` | `exigir('documentos')` → `notas.gerarDanfe` (escopo do usuário) → XML opcional → envio → atividade `danfe_email` |
| `POST /documentos-email/titulo/:id` | `titulos-receber.visualizar` ou `posicao-cliente.visualizar` | `exigir('boleto')` → boleto atualizado ou original → envio → atividade |
| `POST /documentos-email/cobranca/:clienteId` | `titulos-receber.visualizar` ou `posicao-cliente.visualizar` | `exigir('cobranca')` → até 30 títulos vencidos (escopo do usuário) → boleto atualizado de cada um + DANFE das notas de origem → envio |

### 3. Algoritmos e lógica não-trivial 🟢

- **O destinatário é sempre o cadastro.** `extrairEmails` aceita vários e-mails
  separados por `;`, `,` ou espaço, com validação simples e sem repetição. Não há campo
  de destinatário livre na API.
- **O escopo vem dos geradores:** `gerarDanfe`, `obterXml`, `gerarBoleto` e
  `titulos.findAll` recebem o `{ tipo: 'usuario', user }` e aplicam a carteira.
- **Cobrança:** título sem boleto ou cujo boleto falha vira `aviso` em vez de derrubar o
  envio. As notas de origem são achadas pelo **número** do título (com e sem zeros à
  esquerda, completado para 6 e para 9 dígitos), do mesmo cliente, com XML recebido, uma
  por número.
- `dataBr`/`diasDeAtraso` tratam o vencimento como **data civil** (sem fuso).
- Recusa do servidor SMTP → 502 com a mensagem do servidor; sem SMTP → 409.

### 4. Achados

- 🟡 **Cobrança revela o nome do cliente fora do escopo.** `enviarCobranca` busca o
  cliente (`cliente()`, sem escopo) **antes** dos títulos. Para um `clienteId` fora da
  carteira sem e-mail cadastrado, a resposta é "O cliente <razão social> não tem e-mail
  válido…"; com e-mail, 409 "não tem títulos vencidos". Nos dois casos não sai documento,
  mas a primeira mensagem expõe a razão social.
- 🟡 **Casamento título → nota pelo número.** O título não tem vínculo com a nota; a
  busca é pelo número com variações de zeros. Uma nota de outra série com o mesmo número,
  do mesmo cliente, pode ser anexada como "nota de origem".
- 🟡 O teto de 30 títulos corta sem avisar quantos ficaram de fora.

### 5. Dependências e testes

`MailService`, `ParametrosService`, `NotasSaidaService`, `TitulosReceberService`,
`EmailConfigService`, `common/mail/*`, `common/atividades/registrar-atividade-documento`.
Spec: `documentos-email.service.spec.ts`.

## Módulo `sms`

**Caminho:** `apps/api/src/modules/sms/`
**Arquivos (9):** `sms.module.ts`, `sms.controller.ts` (2 controllers, 9 rotas),
`sms.service.ts` (446), `sms-cliente.service.ts` (230), `sms-aviso-vencimento.service.ts`
(255), `sms-webhook.service.ts` (152), `sms-relatorio.service.ts` (188), `sms.dto.ts`,
`sms.spec.ts` (324). Plano: `docs/planos/2026-10-01-sms-iagente.md`.

### 1. Responsabilidade 🟢

SMS ao cliente pelo provedor **iAgente** (`https://api.iagentesms.com.br/api/v2`):
boleto (com a linha digitável, porque SMS não leva anexo), cobrança, mensagem livre,
senha provisória e **aviso automático de vencimento**. Recebe pelo webhook o status de
entrega e as **respostas do cliente**. Tem estatística e histórico. A configuração vive
em parâmetros da empresa, como no e-mail.

### 2. Rotas 🟢

| Rota | Permissão | Comportamento |
|---|---|---|
| `POST /sms/titulo/:id` | `titulos-receber.visualizar` ou alternativa | boleto: valor (atualizado se vencido), vencimento e linha digitável |
| `POST /sms/cobranca/:clienteId` | `titulos-receber.visualizar` ou alternativa | quantidade e total dos vencidos + contato da empresa |
| `POST /sms/cliente/:clienteId` | `posicao-cliente.visualizar` ou alternativa | mensagem livre |
| `GET/PUT /sms/configuracao` | `sms.visualizar/editar` | parâmetros, saldo e URL do webhook |
| `GET /sms/disponivel` | só JWT | o que a tela oferece |
| `GET /sms/estatisticas`, `GET /sms/envios` | `sms.visualizar` | por ano/mês; histórico com respostas |
| `GET /sms/webhook/:empresaId/:segredo` | **público**, `@SkipThrottle` | status e resposta (a iAgente não autentica) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Envio pela tela — `SmsClienteService` 🟢

As mesmas regras do e-mail: o destinatário vem **só do cadastro**
(`primeiroCelular(celular, telefone, telefone2)`; sem celular → 409); o documento vem dos
serviços da tela com a carteira de quem pede; todo envio entra no histórico de
atendimento. O cliente é buscado **com o escopo** (`resolverEscopoVendedores`); fora da
carteira → 404. `textoSms` normaliza o texto para SMS.

#### 3.2 `SmsService.enviar` 🟢

Grava `SmsEnvio` (motivo, celular, mensagem, cliente, vendedor, título, autor), chama a
iAgente com `client_ref` = id do envio, e grava `status`, `provedorId` ou `erro`. A
disponibilidade = `SMS_ATIVO` ∧ token ∧ o interruptor do motivo.

#### 3.3 Aviso automático de vencimento 🟢

Timer de 30 min, com flag `rodando` para não sobrepor. Três travas:

- **Desligado por padrão** (`SMS_AVISO_VENCIMENTO_ATIVO=false`), por empresa.
- **Só de segunda a sábado, das 8h às 18h**, em Campo Grande (`podeEnviarAgora`).
- **Um aviso de cada tipo por título**, conferido em `sms_envios`
  (`[empresaId, tituloReceberId, motivo]`).

Intervalos, com "hoje" como data civil no fuso da operação:
- **antes**: vence entre hoje e hoje + `SMS_AVISO_DIAS_ANTES` (padrão 2), com a linha
  digitável quando há boleto;
- **depois**: venceu entre hoje − (`DIAS_DEPOIS` + 7) e hoje − `DIAS_DEPOIS` (padrão 3),
  com o valor atualizado.

A tolerância de 7 dias cobre a API fora do ar. Teto de 100 SMS por empresa por passagem.

#### 3.4 Webhook 🟢

- **Segredo na URL**: `HMAC-SHA256(JWT_ACCESS_SECRET, "sms-webhook:v1:<empresaId>")`,
  32 caracteres em base64url, comparado em tempo constante. `empresaId` precisa ser
  UUID. Errado → 404 sem motivo.
- **Status de entrega**: `codigosms` = id do `SmsEnvio` (`client_ref`) → atualiza
  `status`/`statusEm`. A data vem em "dd/mm/aaaa hh:mm:ss" de Brasília (`-03:00`).
- **Resposta do cliente**: liga ao envio pelo `codigosms`; sem ele (resposta espontânea),
  ao **último envio para o mesmo celular**. Deduplica por (celular, mensagem,
  `recebidaEm`), porque a iAgente repete até 10 vezes. Grava `SmsResposta` e a
  atividade `sms_resposta` no histórico do cliente (sem autor).
- Responde 200 ("OK") a tudo que tenha o segredo certo.

#### 3.5 Relatório 🟢

`situacaoDoStatus` agrupa os status textuais da iAgente em entregue, falha e pendente;
estatística por ano/mês; envios com as respostas.

#### 3.6 Achados

- 🟡 **O segredo do webhook deriva de `JWT_ACCESS_SECRET`.** Trocar a chave do JWT (por
  incidente, por exemplo) muda a URL de todas as empresas e quebra o webhook em silêncio
  até alguém reconfigurar na iAgente. Uma chave vazada do webhook não entrega a do JWT
  (é HMAC), mas os dois segredos ficam acoplados.
- 🟡 **O segredo vai no caminho da URL** (limitação da iAgente) e acaba nos logs de
  acesso.
- 🟡 **Resposta espontânea pelo último envio.** Celular compartilhado por dois clientes
  (o mesmo contador, por exemplo) registra a resposta no histórico de quem recebeu o
  último SMS.
- 🟡 **Deduplicação frágil.** Com a data do webhook ilegível, `recebidaEm = agora`, e
  cada repetição da iAgente vira uma resposta nova.
- 🟡 **`SMS_TOKEN` em texto puro** em `parametros_empresa`, como o `SMTP_SENHA`.
- 🟡 **Trava de concorrência só em memória.** Com duas instâncias da API, as duas
  varrem; a conferência em `sms_envios` não é atômica e pode mandar o mesmo aviso duas
  vezes.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `sms`.

### 5. Metadados e configurações 🟢

| Parâmetro | Padrão |
|---|---|
| `SMS_ATIVO` | `false` |
| `SMS_TOKEN` | — |
| `SMS_BOLETO`, `SMS_COBRANCA`, `SMS_MENSAGEM_LIVRE`, `SMS_SENHA_PROVISORIA` | `true` |
| `SMS_AVISO_VENCIMENTO_ATIVO` | `false` |
| `SMS_AVISO_DIAS_ANTES` / `SMS_AVISO_DIAS_DEPOIS` | 2 / 3 |
| Varredura | 30 min, até 100 por empresa, tolerância de 7 dias, seg–sáb 8h–18h (Campo Grande) |

### 6. Dependências e testes

`PrismaService`, `ParametrosService`, `TitulosReceberService`,
`common/escopo/escopo-vendedores`, `common/horario/horario-trabalho`,
`common/atividades/registrar-atividade-documento`, `common/mail/email-layout`
(dados da empresa). Externo: iAgente. `sms.spec.ts` cobre normalização de celular e texto, `enviar` (client_ref, recusa 502, desligado e sem token 409), webhook (vínculo da resposta, repetição, status, segredo errado, data) e a janela e as situações do aviso. Não cobre a seleção de títulos do aviso automático.

---

## Módulo `armazenamento`

**Caminho:** `apps/api/src/modules/armazenamento/` + núcleo em
`apps/api/src/common/armazenamento/armazenamento.ts` (486).
**Arquivos (4 + 2):** `armazenamento.module.ts`, `plataforma-armazenamento.controller.ts`
(94, 3 rotas), `midia-orfa.service.ts` (156), `midia-orfa.service.spec.ts` (117);
`common/armazenamento/armazenamento.ts`, `armazenamento.spec.ts` (300).
Plano: `docs/planos/2026-10-13-armazenamento-arquivos-minio.md`.

### 1. Responsabilidade 🟢

Onde a plataforma guarda arquivos: **em disco** (`apps/api/uploads`, o volume `uploads`)
ou num **S3, o MinIO da VPS**, escolhido **por pasta** (o primeiro segmento da chave).
A **chave é o caminho relativo a `uploads/`** (`whatsapp/<empresaId>/<uuid>.jpg`) e o
endereço gravado no banco continua `/uploads/<chave>`: trocar uma pasta para o S3 não
muda nada no banco nem na tela. O módulo Nest expõe à administração da plataforma a
**situação** do armazenamento, a **cópia disco→S3 em rodadas** e a **varredura de mídia
órfã do WhatsApp**.

### 2. Rotas 🟢

Todas com `JwtAuthGuard` + `PlatformAdminGuard` (só administrador da plataforma).

| Rota | Comportamento |
|---|---|
| `GET /plataforma/armazenamento/situacao` | S3 configurado?, bucket, teste de conexão (`HeadBucket`) e, por pasta do S3, quantos arquivos ainda estão em disco |
| `POST /plataforma/armazenamento/migrar` `{pasta}` | uma rodada de até 200 arquivos do disco para o S3; `pasta` casa `^[a-z0-9-]+$` |
| `POST /plataforma/armazenamento/midia-orfa` `{apagar}` | `false` lista os órfãos; `true` apaga |

Erros do MinIO viram **400 com o motivo em português** (`explicarErroS3`); o resto segue
para o filtro global.

### 3. Algoritmos e lógica não-trivial

#### 3.1 A classe `Armazenamento` (núcleo) 🟢

- **Singleton por função** (`armazenamento()`), não injeção do Nest, porque quem grava
  inclui funções soltas (`apagarArquivosDaMidia`) e o middleware do `main.ts`.
- **`configDoAmbiente`**: S3 só existe com as **quatro** variáveis preenchidas
  (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`); faltando uma, tudo fica
  em disco sem aviso. `S3_ENDPOINT_PUBLICO` cai no interno; região padrão `us-east-1`;
  `forcePathStyle: true` (MinIO).
- **Dois clientes S3**: o interno (`http://minio:9000`) para gravar e ler, e o **público**
  (`https://s3.rcgdist.com.br`) só para **assinar** o link temporário, porque a
  assinatura cobre o host.
- **`noS3(chave)`** = há S3 ∧ primeiro segmento ∈ `ARMAZENAMENTO_S3_PASTAS`.
- **Gravar** vai para um lugar só (S3 se a pasta está nele, senão disco).
  `gravarArquivo` faz stream para o S3 (pacote de backup) ou `copyFile` no disco.
- **Ler** procura no S3 e, não achando (404/`NoSuchKey`), no disco: os arquivos de antes
  da troca continuam servidos até serem copiados. Não existe em lugar nenhum → `null`.
- **Apagar** remove dos dois; não existir não é erro.
- **`listar(pasta)`** une disco (recursivo, com subpastas) e S3 (`ListObjectsV2` paginado)
  num `Map` por chave; o S3 sobrescreve o disco.
- **`validarChave`**: recusa vazio, `/` inicial, `\`, segmentos `.`/`..`/vazios e qualquer
  chave que `normalize` altere. Um nome vindo do banco nunca escapa de `uploads/`.
- **`chaveDoEndereco`**: `/uploads/x?exp=…` → `x` (decodificado e validado); outro
  endereço → `null`.

#### 3.2 Servir `/uploads` (middleware do `main.ts`) 🟢

Ordem das conferências: caminho normalizado → `agente/`, `fichas-importacao/` e `.tmp/`
dão **404** → prefixo assinado (mídia do WhatsApp) e `backups/` exigem **link assinado
válido** (403) → se a chave está numa pasta do S3, `linkTemporario` faz `HeadObject` e
**redireciona (302)** para o link pré-assinado de **1 h**; sem o objeto lá, segue para o
estático do disco; erro do S3 → 502.

#### 3.3 Migração disco → S3 em rodadas — `migrarParaS3(pasta, 200)` 🟢

Só para pasta já configurada no S3. Para cada um dos primeiros 200 arquivos em disco:
`PutObject` com o conteúdo lido inteiro (`readFile`) → `HeadObject` confere
`ContentLength` = tamanho em disco → só então `unlink`. Falha de um arquivo entra em
`falhas` e não interrompe. Devolve `{copiados, bytes, falhas, restantes}`; a tela chama
de novo até `restantes` zerar.

#### 3.4 Varredura de mídia órfã do WhatsApp — `MidiaOrfaService.varrer` 🟢

Origem dos órfãos: até 2026-10-13 a exclusão do histórico apagava mensagens e deixava os
arquivos; a foto de contato substituída fica; anexo cujo envio falhou fica como o multer
gravou.

1. Lista `whatsapp/` (disco + S3, inclusive `whatsapp/<empresaId>/` e os soltos).
2. **Referenciados** = `whatsapp_mensagens.arquivoUrl` ∪ `whatsapp_contatos.fotoUrl` de
   **todas** as empresas: lista as empresas em **modo sistema** (inclusive excluídas) e
   lê cada uma **em sequência** com `withTenant` (as tabelas têm RLS por empresa).
3. Órfão = não referenciado ∧ **mais de 24 h** (o multer grava o anexo antes de a
   mensagem existir; os mais novos contam em `recentesIgnorados`).
4. Com `apagar`: **trava** — se o conjunto de referenciados veio vazio, 400 e não apaga
   nada (uma leitura vazia sem erro, como RLS sem contexto, faria tudo parecer órfão).
   Apaga um a um, contando `apagados`/`falhas`, e loga em `warn`.
5. Devolve contagens, bytes e uma **amostra de 20 nomes** para a tela conferir.

#### 3.5 Achados

- ✅ **Corrigido em 5f8d319** (trava por empresa). Achado original:
  🟡 **A trava só pega o vazio total.** Se a leitura de **uma** empresa voltar vazia sem
  erro (o mesmo cenário de RLS que a trava cita) e as outras não, os arquivos daquela
  empresa passam por órfãos e são apagados. Não há conferência por empresa (por exemplo,
  "a empresa tem mensagens com arquivo, mas nenhuma foi lida").
- 🟡 **Falha de exclusão é engolida** (`catch {}` sem log do motivo): a tela vê só o
  número de `falhas`.
- 🟡 **A migração lê o arquivo inteiro na memória** (`readFile`), diferente do
  `gravarArquivo`, que faz stream. Com vídeos grandes, 200 por rodada pesam na memória
  da API.
- 🟡 **Falhas persistentes travam a migração.** A rodada pega sempre os primeiros 200 do
  disco; os que falham continuam no começo da lista. Com 200 falhas seguidas a rodada
  não copia nada e o restante nunca é tentado.
- 🟡 **Arquivo migrado parece novo.** No S3, `modificadoEm` = `LastModified` = momento da
  cópia; logo depois de uma migração, a varredura conta órfãos antigos como recentes e
  os ignora por 24 h (seguro, mas confunde a leitura).
- 🟡 **Mensagem de erro com o bucket errado.** O controller chama `explicarErroS3(erro)`
  sem o bucket, que cai no padrão `"plataforma"`: com outro `S3_BUCKET`, o texto aponta
  o bucket errado. A `situacao` passa o bucket certo.
- 🟡 **S3 meio configurado cai em disco em silêncio.** Faltando uma das quatro
  variáveis, `s3Configurado=false` e nada avisa no boot; só a tela de situação mostra.
- 🟡 **Cada acesso a arquivo no S3 faz um `HeadObject`** antes do redirecionamento: uma
  ida extra ao MinIO por imagem servida.
- 🟡 **A leitura dos referenciados carrega todas as URLs** de mensagens com arquivo de
  todas as empresas num `Set` em memória.

### 4. Estruturas de dados 🟢

Sem tabela própria. Interfaces `ConfigS3`, `ConfigArmazenamento`, `ArquivoListado`,
`ResultadoMidiaOrfa`; DTOs `VarrerMidiaOrfaDto`, `MigrarPastaDto`. Ver
`data-dictionary.md`, seção `armazenamento`.

### 5. Metadados e configurações 🟢

| Variável / constante | Padrão | Uso |
|---|---|---|
| `ARMAZENAMENTO_S3_PASTAS` | vazio | pastas (1º segmento) que vão para o S3, separadas por vírgula |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | — | as quatro são obrigatórias para haver S3 |
| `S3_ENDPOINT_PUBLICO` | = `S3_ENDPOINT` | host do link assinado |
| `S3_REGIAO` | `us-east-1` | |
| `VALIDADE_LINK_SEGUNDOS` | 3600 | link temporário |
| `IDADE_MINIMA_MS` (órfãos) | 24 h | |
| `AMOSTRA` | 20 | nomes devolvidos |
| limite da rodada de migração | 200 | |

### 6. Dependências e testes

`PrismaService` (`withSistema`, `withTenant`), `whatsapp/midia-arquivos`
(`arquivoDaMidia`), `common/uploads/uploads.config` (`UPLOADS_DIR`),
`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. Consumidores do núcleo: `main.ts`,
`whatsapp-conversas.service.ts`, `whatsapp/midia-arquivos.ts`,
`backup-empresa.service.ts`. Testes: `armazenamento.spec.ts` (chave, configuração, disco,
S3 por pasta, leitura com fallback, link com host público, migração com conferência,
subpastas, tradução de erros) e `midia-orfa.service.spec.ts` (listar sem apagar, apagar
só órfãos antigos, recusa com referência vazia). Não há teste para a leitura vazia de
**uma** empresa nem para falhas repetidas na migração.

---

## Módulo `backup-empresa`

**Caminho:** `apps/api/src/modules/backup-empresa/`
**Arquivos (11):** `backup-empresa.module.ts`, `plataforma-backups.controller.ts` (102,
6 rotas), `backups.controller.ts` (70, 4 rotas), `backup-empresa.service.ts` (383),
`backup-empresa-varredura.service.ts` (60), `backup-gerador.ts` (303),
`backup-catalogo.ts` (152), `backup-serializar.ts` (46) e três specs
(`backup-catalogo`, `backup-empresa.service`, `backup-gerador`).
Plano: `docs/planos/2026-10-13-backup-por-empresa.md`. Migration:
`20261013180000_backup_empresas`.

### 1. Responsabilidade 🟢

Gera um **pacote zip com a empresa inteira**: os dados de todas as tabelas com
`empresaId` (JSONL para restaurar e CSV para o Excel), os arquivos que esses registros
referenciam, um manifesto e um LEIA-ME. O backup pode ser **manual** (pela plataforma ou
pelo administrador da empresa) ou **agendado** (a cada N dias, guardando os M mais
recentes). O pacote vai para o armazenamento (`backups-empresas/<empresaId>/…zip`, disco
ou MinIO) e é baixado por **link assinado de 5 min**. **Não há restauração
implementada**: o formato está pronto para ela (manifesto com a versão do schema), mas
nenhum código lê o pacote de volta.

### 2. Rotas 🟢

**Administração da plataforma** (`JwtAuthGuard` + `PlatformAdminGuard`, prefixo
`/plataforma/backups`):

| Rota | Comportamento |
|---|---|
| `GET /` | todas as empresas (inclusive excluídas) com seus backups |
| `GET /config`, `PATCH /config` | `ativo`, `frequenciaDias` (1–90), `manter` (1–52) |
| `POST /:empresaId` | gera agora (202, em segundo plano) |
| `GET /:empresaId/:id/link` | link de download de 5 min |
| `DELETE /:empresaId/:id` | apaga o pacote e o registro |

**Administrador da empresa** (`JwtAuthGuard` + `PermissionsGuard`, prefixo `/backups`):
a empresa é **sempre a ativa do token** — nenhuma rota recebe `empresaId`.

| Rota | Permissão |
|---|---|
| `GET /backups` | `backups.visualizar` |
| `POST /backups` (202) | `backups.exportar` |
| `GET /backups/:id/link` | `backups.exportar` |
| `DELETE /backups/:id` | `backups.excluir` |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Catálogo — o que entra (`backup-catalogo.ts`) 🟢

- **Regra:** todo model do Prisma com `empresaId` entra, lido do DMMF
  (`Prisma.dmmf.datamodel.models`), exceto os listados em `FORA` com o motivo
  (catálogo global, perfis, termos, referência pública como município/CEP/CNAE, sessões,
  histórico de senha, links de redefinição e os próprios backups).
- **Especiais** (sem `empresaId`): a linha da `Empresa`, o `GrupoEconomico` dela e os
  `Usuario` com vínculo em `usuario_empresas`.
- **Campos mascarados** (vão `null`): hashes de senha, hash de chave de API, chaves e
  tokens cifrados do agente e do WhatsApp. **Parâmetros secretos**: `SMTP_SENHA` e
  `SMS_TOKEN` saem com `conteudo = null`.
- **Arquivos por nome**: `ProdutoFicha.arquivo` (`fichas/`),
  `ProdutoFichaImportacao.arquivo` (`fichas-importacao/`), `AgenteAnexo.arquivo`
  (`agente/`); os demais campos guardam `/uploads/...` inteiro e são achados em qualquer
  texto.
- **Testes de cobertura** garantem que um model novo não some sem decisão: todo model
  está em exatamente uma lista, e todo campo de texto que casa
  `/senha|hash|token|secret|segredo|cifrad|apikey|password/i` está mascarado ou liberado
  explicitamente (`NAO_SAO_SEGREDO`).

#### 3.2 Geração do pacote — `BackupGerador.gerar` 🟢

1. Zip em `uploads/.tmp/backup-<id>/pacote.zip` (no volume; o `main.ts` dá 404 para
   `/uploads/.tmp/`), `archiver` com zlib nível 6.
2. Exporta cada tabela da empresa, com **`UsuarioEmpresa` primeiro** (é dela que saem os
   usuários). Leitura **em páginas de 1000 por `skip/take`**, ordenada pela chave
   primária, cada página num `withTenant(empresaId)` **e** com `where empresaId` em
   código (cobre as tabelas com `empresaId` sem RLS). Cada linha vai para
   `dados/<tabela>.jsonl` e `planilhas/<tabela>.csv` (BOM, separador `;`), escritos em
   stream com respeito a `drain`.
3. Depois, `Empresa` (por id), `GrupoEconomico` (pelo `grupoEconomicoId` da empresa) e
   `Usuario` (ids coletados).
4. **`conferirDono`** — última barreira: um registro de outra empresa (ou usuário sem
   vínculo, ou grupo diferente) **derruba o backup inteiro** em vez de entrar no pacote.
5. **`observar`** coleta as chaves de arquivo; **`juntarArquivos`** põe cada uma no zip,
   uma por vez (espera o evento `entry`): do disco em stream; do S3 lido inteiro. Os que
   não existem vão para `arquivosAusentes` no manifesto.
6. `manifesto.json` (formato 1, empresa, data, origem, `versaoSchema` = última migration
   aplicada, contagem por tabela, arquivos, ausentes, o que foi mascarado, especiais e
   fora) e `LEIA-ME.txt`.

Serialização (`backup-serializar.ts`): data em ISO, `BigInt` e `Decimal` como texto (sem
perder precisão), bytes em base64; no CSV, aspas quando há `;`, `"` ou quebra de linha,
e campo JSON como JSON.

#### 3.3 Ciclo de vida — `BackupEmpresaService` 🟢

- **`solicitar`** (manual): `encerrarInterrompidos` (gerando há mais de **6 h** vira
  `falhou`) → cria `EmpresaBackup(gerando)`; o **índice único parcial**
  `empresa_backups_um_gerando` segura **um gerando por empresa** (P2002 → 409) → dispara
  `gerar` sem esperar e responde 202.
- **`gerar`**: gera, grava em `backups-empresas/<empresaId>/<iniciadoEm>-<origem>.zip`
  (`gravarArquivo`, stream para o S3), marca `pronto` com bytes/registros/arquivos; se
  agendado, poda. Em erro: `falhou` com a mensagem (até 2000 caracteres). Sempre apaga
  o temporário.
- **`link`**: só `pronto` com chave; `assinarCaminho('/uploads/<chave>', 300 s)`. O
  `main.ts` exige assinatura válida para `/uploads/backups-empresas/`.
- **`excluir`**: recusa `gerando` (409); apaga o arquivo e o registro.
- **`aoSubir`**: na subida da API, todo `gerando` de todas as empresas vira `falhou` e os
  temporários `backup-*` são apagados.

#### 3.4 Agendamento — `BackupEmpresaVarreduraService` + `agendados` 🟢

`setInterval` de **1 h** (primeira passagem 5 min depois do boot), flag `rodando` em
memória. Com a configuração ativa, para cada empresa **não excluída**: se o último
agendado `pronto` ou `gerando` começou há menos de `frequenciaDias`, pula; senão gera
**e espera** (uma empresa por vez). Falha numa empresa não para as outras.
**Poda** (`podarAgendados`, depois de cada agendado pronto): mantém os `manter` mais
recentes entre os agendados `pronto` **ou `falhou`** e apaga os demais (arquivo e
registro). Manuais nunca são podados.

#### 3.5 Achados

- ✅ **Corrigido em fb73c46** (só os prontos contam; falhas anteriores ao pronto saem). Achado original:
  🔴 **A poda conta os que falharam.** `podarAgendados` mantém os `manter` mais recentes
  entre `pronto` **e** `falhou`. Com `manter=4`, um pronto seguido de três falhas
  (gerados de hora em hora enquanto o problema persiste) apaga **todos os backups bons
  mais antigos**, ficando um só pronto. As falhas deveriam sair da conta ou ser podadas
  à parte.
- 🔴 **Não existe restauração.** O pacote e o manifesto foram desenhados para ela
  (`versaoSchema`, JSONL tipado), mas não há código que leia um pacote: o plano diz que
  a Fase 4 (restaurar, por script) "não começou". Hoje é exportação, não backup
  restaurável; as credenciais mascaradas também não voltariam.
- ✅ **Corrigido em 4c52520** (o link do MinIO vale só o que resta do `exp`). Achado original:
  🟡 **O link de 5 min vira 1 h no MinIO.** Com `backups-empresas` em
  `ARMAZENAMENTO_S3_PASTAS` (padrão no `docker-compose.dev.yml`, recomendado pelo plano
  para a produção), o `main.ts` confere a assinatura de 5 min e redireciona
  para o link pré-assinado do S3, que vale **1 h** (`VALIDADE_LINK_SEGUNDOS` do
  armazenamento). Quem tiver esse segundo link baixa a empresa inteira durante a hora.
- 🟡 **O pacote não é cifrado.** A empresa inteira (clientes, títulos, conversas de
  WhatsApp, usuários) fica num zip aberto no disco/MinIO e no computador de quem baixa.
- 🟡 **Não é um retrato consistente.** Cada página é uma transação separada e as tabelas
  são lidas em sequência; com a empresa operando, o pacote mistura momentos (um item de
  orçamento sem o cabeçalho, por exemplo).
- 🟡 **Paginação por `skip`** fica quadrática nas tabelas grandes
  (`whatsapp_mensagens`, notas): cada página relê as anteriores.
- 🟡 **Pacote órfão no armazenamento.** Se `gravarArquivo` dá certo e o `update` para
  `pronto` falha, o catch marca `falhou` sem `chave`; o zip fica no armazenamento sem
  registro que o aponte. O mesmo na poda, que engole a falha de `apagar`.
- 🟡 **`aoSubir` marca como falhou o que outra instância está gerando.** Com duas
  instâncias da API, reiniciar uma derruba o registro do backup que a outra gera (que
  depois sobrescreve com `pronto`). A flag `rodando` também é só em memória.
- 🟡 **`versaoSchema` pode sair "desconhecida".** Lê `_prisma_migrations` com o papel
  da aplicação (`plataforma_app`); sem permissão de leitura, o `catch` devolve
  `'desconhecida'` em silêncio, e a restauração futura não teria como conferir.
- 🟡 **Manuais acumulam sem limite** (só saem por exclusão).
- 🟡 **`solicitar` é *fire-and-forget*.** Se o `update` dentro do `catch` de `gerar`
  falhar, a rejeição fica sem tratamento, e o registro só sai de `gerando` em 6 h ou na
  próxima subida.
- 🟡 **O administrador da empresa baixa os dados de todos** os usuários e conversas da
  empresa com `backups.exportar`; é decisão de 2026-10-13, mas faz dessa permissão uma
  das mais sensíveis do catálogo.

### 4. Estruturas de dados 🟢

`EmpresaBackup` (`empresa_backups`, RLS por empresa), `BackupEmpresaConfig`
(`backup_empresas_config`, linha única `id='unico'`), enums `BackupEmpresaOrigem` e
`BackupEmpresaSituacao`; estrutura do pacote. Ver `data-dictionary.md`, seção
`backup-empresa`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `frequenciaDias` / `manter` / `ativo` | 7 / 4 / `true` (padrões do banco) |
| Link de download | 300 s |
| Gerando além de | 6 h → interrompido |
| Varredura | a cada 1 h; primeira em 5 min |
| Página de leitura | 1000 |
| Compressão | zlib 6 |
| `VERSAO_FORMATO` | 1 |
| Pasta temporária | `uploads/.tmp/backup-<id>` |
| Chave do pacote | `backups-empresas/<empresaId>/<iniciadoEm ISO sem : e .>-<origem>.zip` |

### 6. Dependências e testes

`PrismaService` (`withTenant`, `withSistema`, `$queryRaw`), `common/armazenamento`,
`common/uploads/link-assinado` (`assinarCaminho`), `common/uploads/uploads.config`,
`archiver`, DMMF do Prisma. Testes: `backup-catalogo.spec.ts` (todo model decidido, sem
duplicata, segredos mascarados, chave primária, tabelas grandes presentes),
`backup-gerador.spec.ts` (leitura no contexto e filtrada, sem credencial, conteúdo do
pacote, registro de outra empresa e usuário sem vínculo derrubam),
`backup-empresa.service.spec.ts` (agendados: frequência, desligado, falha isolada). Não
cobrem a poda, o link nem `aoSubir`.

---

## Módulo `assinaturas`

**Caminho:** `apps/api/src/modules/assinaturas/`
**Arquivos (4):** `assinaturas.module.ts`, `assinaturas.controller.ts` (78, 6 rotas),
`assinaturas.service.ts` (171), `assinaturas-grupo.spec.ts` (78). Contrato:
`packages/contracts/src/assinatura.ts`.

### 1. Responsabilidade 🟢

O **contrato SaaS** da plataforma: **uma assinatura por grupo econômico** (plano, ciclo,
valor cobrado, dia de vencimento, situação). Alterar a assinatura **propaga para todas as
empresas ativas do grupo** a situação de acesso e o limite de usuários do plano. Também dá
o resumo comercial (MRR, ativas, em teste, inadimplentes). Só administração da
plataforma.

### 2. Rotas 🟢

`JwtAuthGuard` + `PlatformAdminGuard`, prefixo `/plataforma`. Corpo validado por Zod
(`assinaturaUpdateSchema`).

| Rota | Comportamento |
|---|---|
| `GET /grupos/:grupoId/assinatura` | contrato do grupo, ou `null` (não cria assinatura gratuita) |
| `PATCH /grupos/:grupoId/assinatura` | cria ou altera e propaga às empresas |
| `GET /empresas/:empresaId/assinatura` | resolve o grupo da empresa e devolve o contrato dele |
| `PATCH /empresas/:empresaId/assinatura` | idem, alterando |
| `GET /assinaturas` | assinaturas de grupos não excluídos, com plano e número de empresas ativas |
| `GET /assinaturas/resumo` | MRR, total de empresas, ativas, em teste, inadimplentes |

### 3. Algoritmos e lógica não-trivial

#### 3.1 `updateAssinaturaGrupo` 🟢

Numa transação:
1. **`SELECT … FROM grupos_economicos … FOR UPDATE`**: serializa alterações concorrentes
   do mesmo grupo.
2. Grupo não excluído (404). Plano = `input.planoId` ou o atual; sem nenhum → 400.
   Plano excluído → 400. **Plano inativo só é recusado para quem troca para ele**: quem já
   está no plano continua alterando o resto.
3. `upsert` por `grupoEconomicoId`; na criação, `valorMensalidade` padrão =
   `plano.valorMensal`.
4. **Propaga às empresas não excluídas do grupo** (`updateMany`):
   - `situacao` da empresa = a da assinatura, **exceto `atrasada` → `suspensa`**;
   - `limiteUsuarios` = o do plano (sobrescreve o que havia na empresa);
   - fora de `teste`, `testeExpiraEm = null`.

A situação da empresa é a única decisão de acesso (`common/empresa/situacao-empresa.ts`,
`podeAcessar`): `ativa` entra; `teste` entra até `testeExpiraEm` (sem data, sem prazo);
`suspensa` e `cancelada` não entram. Portanto **marcar a assinatura como atrasada bloqueia
na hora o login de todas as empresas do grupo**.

#### 3.2 Resumo SaaS — MRR 🟢

`MRR = Σ (valorMensalidade / meses do ciclo)` das assinaturas `ativa` de grupos não
excluídos (mensal 1, trimestral 3, semestral 6, anual 12), arredondado a centavos. A tela
(`assinatura-section.tsx`) trata `valorMensalidade` como **"Valor Cobrado" por ciclo** e
o preenche com o preço do plano para o ciclo escolhido — coerente com a divisão.

#### 3.3 Achados

- 🟡 **`valorMensalidade` é o valor do ciclo, não da mensalidade.** O nome engana, e o
  padrão da API na criação é sempre `plano.valorMensal`, qualquer que seja o ciclo: uma
  assinatura anual criada sem valor (fora da tela) entra no MRR como `valorMensal/12`.
- 🟡 **`atrasada` suspende na hora, sem carência.** Não há passo intermediário (aviso,
  prazo); o efeito é imediato para todas as empresas e usuários do grupo.
- 🟡 **Não há cobrança automática.** `diaVencimento` e `proximoVencimentoEm` só são
  gravados e exibidos; nada calcula o vencimento nem muda a situação para `atrasada`. A
  inadimplência é marcada à mão.
- 🟡 **O limite de usuários da empresa é sobrescrito** pelo do plano a cada alteração da
  assinatura, mesmo que só tenha mudado o dia de vencimento: um limite ajustado à mão na
  empresa se perde.
- 🟡 **`teste` não define prazo.** Pôr a assinatura em `teste` mantém o `testeExpiraEm`
  que a empresa tinha; sem ele, é avaliação sem prazo (entra até alguém encerrar).
- 🟡 **Resquício por empresa.** O model ainda tem `empresaId @unique` (assinatura por
  empresa, anterior ao contrato por grupo); as listagens filtram
  `grupoEconomicoId not null`, mas as linhas antigas continuam no banco e contam para
  `removePlano` (ver `planos`).
- 🟡 **`totalEmpresas` do resumo** conta todas as empresas não excluídas, inclusive as
  de grupos sem assinatura, e não bate com a soma por assinatura.

### 4. Estruturas de dados 🟢

`Assinatura` (`assinaturas`), enums `SituacaoAssinatura` e `CicloPagamento`. Ver
`data-dictionary.md`, seção `assinaturas`.

### 5. Metadados e configurações 🟢

Padrões do banco: situação `ativa`, ciclo `mensal`, `valorMensalidade` 0,
`diaVencimento` 10. Divisores do MRR: 1/3/6/12. Mapeamento de situação assinatura →
empresa: `atrasada` → `suspensa`; as demais iguais.

### 6. Dependências e testes

`PrismaService` (transação com `FOR UPDATE`), `@plataforma/contracts`. Consumidores:
`apps/web` Plataforma > Assinaturas e a seção de assinatura da empresa;
`common/empresa/limite-empresas.ts` lê o plano da assinatura para limitar empresas.
`assinaturas-grupo.spec.ts`: duas empresas leem o mesmo contrato, consulta sem contrato
não cria gratuita, atualização propaga situação e limite. Não cobre o MRR, a recusa de
plano inativo nem a troca de plano.

---

## Módulo `planos`

**Caminho:** `apps/api/src/modules/planos/`
**Arquivos (3):** `planos.module.ts`, `planos.controller.ts` (74, 5 rotas),
`planos.service.ts` (164). Contrato: `packages/contracts/src/plano.ts`.

### 1. Responsabilidade 🟢

Catálogo dos **pacotes SaaS** (Básico, Profissional…): preço por ciclo, limite de
usuários, limite de empresas por grupo e a **allowlist de módulos, menus e rotinas** que
o plano libera. A aplicação dessa allowlist acontece em `estrutura`
(`desativadosDaEmpresa`): plano com lista vazia não restringe nada.

### 2. Rotas 🟢

`JwtAuthGuard` + `PlatformAdminGuard`, prefixo `/plataforma/planos`.

| Rota | Comportamento |
|---|---|
| `GET /` | planos não excluídos por `valorMensal`, com ids liberados e `totalEmpresas` (assinaturas de grupos ativos) |
| `GET /:id` | detalhe com ids liberados |
| `POST /` | cria; código único entre os não excluídos |
| `PATCH /:id` | altera; listas de ids enviadas **substituem** as atuais |
| `DELETE /:id` | soft delete (`ativo=false`); recusa se há assinaturas |

### 3. Algoritmos e lógica não-trivial

- **Criar**: confere `codigo` fora da transação; cria o plano e as três listas
  (`createMany`) numa transação.
- **Alterar**: para cada lista (`moduloIds`, `menuIds`, `rotinaIds`) **enviada**, apaga e
  recria; lista omitida fica como está. A mudança vale na próxima montagem do menu de
  cada empresa do plano (não há cópia por empresa).
- **Excluir**: conta **todas** as assinaturas do plano (inclusive de grupos excluídos e as
  antigas por empresa) e recusa se houver.

### 4. Achados

- ✅ **Corrigido em 9dd58d3** (DTOs Zod do contrato). Achado original:
  🟡 **O controller não valida o corpo.** `@Body() dto: any`, sem o DTO Zod que o
  contrato já tem (`planoCreateSchema`/`planoUpdateSchema`). O corpo vai direto ao
  `prisma.plano.create/update` (`...data`): campo errado dá 500, e qualquer coluna pode
  ser gravada (`deletedAt`, `createdBy`, `id`). Restrito ao administrador da plataforma,
  mas sem os padrões do Zod (`ativo`, `limiteEmpresas`) e sem as mensagens de validação.
- ✅ **Corrigido em 9dd58d3** (os quatro valores como número). Achado original:
  🟡 **Valores pela metade.** `listPlanos`/`getPlano` convertem `valorMensal` e
  `valorAnual` para número, mas `valorTrimestral`/`valorSemestral` saem como `Decimal`
  (texto no JSON). A tela de assinatura usa os quatro.
- ✅ **Corrigido em 9dd58d3** (só contratos de grupos vivos). Achado original:
  🟡 **Exclusão travada por assinaturas mortas.** A contagem inclui assinaturas de grupos
  excluídos e as antigas por empresa: um plano pode nunca mais poder ser excluído.
- ✅ **Corrigido em 9dd58d3** (código conferido inclusive entre excluídos). Achado original:
  🟡 **Código duplicado por corrida.** A unicidade é conferida fora da transação; o
  `@unique` do banco segura, mas com erro 500 (P2002) em vez de 400. O `@unique` também
  vale para planos excluídos, então o código de um plano excluído não pode ser reusado
  (a conferência do serviço olha só os não excluídos e deixaria passar até o banco
  recusar).
- 🟡 **Ids das listas não são conferidos**: id inexistente vira erro de FK (500).
- 🟡 **Plano vazio libera tudo** (regra de `estrutura`): tirar o último módulo da lista
  libera **todos** os módulos, o oposto do que a tela sugere.

### 5. Estruturas de dados 🟢

`Plano` (`planos`), `PlanoModulo`, `PlanoMenu`, `PlanoRotina`. Ver `data-dictionary.md`,
seção `planos`.

### 6. Dependências e testes

`PrismaService`. Consumidores: `assinaturas` (plano do grupo e limite de usuários),
`estrutura` (allowlist), `common/empresa/limite-empresas.ts` (`limiteEmpresas`),
`empresas` (limite de usuários na criação), `apps/web` Plataforma > Planos. **Sem
testes.**

---

## Módulo `plataforma`

**Caminho:** `apps/api/src/modules/plataforma/`
**Arquivos (6):** `plataforma.module.ts`, `plataforma.controller.ts` (271, 12 rotas),
`plataforma.service.ts` (857), `dto/plataforma.dto.ts` (Zod de
`packages/contracts/src/plataforma.ts`), `plataforma-empresa-create.spec.ts` (48),
`plataforma-uso.spec.ts` (186).

### 1. Responsabilidade 🟢

A **administração do SaaS**: quem tem acesso, por quanto tempo e com quantos usuários.
Lista as empresas com uso e último acesso; cria empresa **com o primeiro administrador
na mesma transação**; altera situação, prazo de teste e limite de usuários; vincula e
desvincula administradores de empresa; promove e revoga **administradores da
plataforma**; consulta CNPJ; e mantém um **log próprio** (`plataforma_auditoria`).

**Sem `PermissionsGuard`, de propósito:** os perfis são globais e compartilhados, e dar
uma permissão ao Administrador daria a todo administrador de tenant. O corte é o
`PlatformAdminGuard` (perfil com `administraPlataforma`, que só seed e migration
concedem).

### 2. Rotas 🟢

Prefixo `/plataforma`, `JwtAuthGuard` + `PlatformAdminGuard`, corpo e query em Zod.

| Rota | Comportamento |
|---|---|
| `GET /consulta-cnpj/:cnpj` | delega a `EnriquecimentoService.consultarCnpj` (módulo `clientes`) |
| `GET /empresas` | paginada; filtros `situacao`, `apenasExpiradas`, `search` (razão, fantasia, CNPJ) |
| `POST /empresas` | empresa + administrador (conta nova ou existente) |
| `PATCH /empresas/:id/situacao` | situação, `testeExpiraEm`, `limiteUsuarios`, com `motivo` no log |
| `GET /contas?email=` | existe conta com o e-mail? (a tela decide se pede nome e senha) |
| `GET /empresas/:id/administradores` | contas com perfil Administrador Empresa vinculadas, e em quantas empresas cada uma está |
| `POST /empresas/:id/administradores` | vincula conta existente como administradora |
| `DELETE /empresas/:id/administradores/:usuarioId` | desativa o vínculo; recusa o último administrador |
| `GET /admins`, `POST /admins` `{email}`, `PATCH /admins/:usuarioId` | lista, promove por e-mail, promove ou revoga |
| `GET /auditoria` | log, filtrado por empresa e ação, mais recente primeiro |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Listagem com uso — RLS e N+1 consciente 🟢

`empresa.findMany` + `count` em paralelo. Uso (vínculos ativos e último login) **por
empresa, dentro de `withTenant`**: `usuario_empresas` tem RLS, e fora do contexto a
leitura volta **zero sem erro** (aconteceu na primeira versão: "0 usuários" para empresa
com dez). O N+1 é aceito (20 por página). `testeExpirado` usa o mesmo `podeAcessar` do
login, no servidor, para não divergir pelo fuso do navegador.

#### 3.2 `criarEmpresa` — empresa e primeiro administrador 🟢

1. `validarDocumentoEmpresa` (CPF/CNPJ conforme `tipoPessoa`); CNPJ em uso → 409.
2. Conta com o e-mail:
   - é **administrador da plataforma** → 409 (a conta passaria a pertencer ao grupo do
     cliente; uma conta é de um grupo só);
   - **não existe** → exige `nome` e `senha` provisória (8–72);
   - **existe** → é vinculada; nome e senha do payload são ignorados.
3. Alias em uso → 409.
4. Transação: cria a empresa (situação padrão **`teste`**). **Grupo econômico**: o da
   conta existente, se ela tiver; senão um grupo novo com o nome fantasia. Perfil
   "Administrador Empresa" (global, `grupoEconomicoId null`) obrigatório; sem ele, 404
   ("rode o seed"). `set_config('app.current_empresa_id')` na transação para o insert em
   `usuario_empresas` passar no `WITH CHECK`.
   - Conta existente: cria o vínculo, move a conta para o grupo da empresa e, **se o
     perfil dela não é `sistemaBase`**, troca para Administrador Empresa ("promovida").
   - Conta nova: `bcrypt` (12 rodadas), `deveTrocarSenha = true`, perfil administrador,
     vínculo.
5. Log `empresa.criada` com situação, admin e o caso (nova, vinculada, promovida).

#### 3.3 Administradores da empresa 🟢

- **Listar**: vínculos ativos com perfil Administrador Empresa (`withTenant`); a
  contagem de empresas de cada conta usa **`withUsuario`** (policy
  `self_usuario_empresas`), porque um `groupBy` fora de contexto devolve zero.
- **Vincular**: conta precisa existir, não ser admin da plataforma e ser do **mesmo
  grupo** (ou sem grupo) — 409 se de outro grupo (decisão de 30/09/2026). Já
  administradora → 409. **Vaga** do limite de usuários só é consumida se o vínculo não
  estava ativo (`garantirVagaDeUsuario`). Upsert do vínculo e **perfil da conta =
  Administrador Empresa** (vale em todas as empresas do grupo).
- **Desvincular**: recusa se há ≤ 1 administrador ativo; desativa o vínculo (não apaga
  nem troca o perfil).

#### 3.4 Administradores da plataforma 🟢

O perfil é da conta (migration `20260930230000_dados_do_usuario`). `definirAdmin`:
promover quem já é → no-op; revogar quem não é → no-op (sem sobrescrever o perfil real);
**recusa revogar a si mesmo** e **revogar o último**. Revogar devolve a conta para
"Administrador Empresa". O log leva a primeira empresa da conta (`withUsuario`).

#### 3.5 Alterar situação — um registro de log por campo 🟢

Atualiza só os campos enviados (Zod exige ao menos um). Grava `empresa.situacao_alterada`
(se mudou), `empresa.teste_alterado` e `empresa.limite_alterado` separados, com
`motivo` como sufixo — "quando esta empresa foi suspensa" acha-se direto.

#### 3.6 Achados

- ✅ **Corrigido em 202e7ff** (garantirVagaDeEmpresa e contrato do grupo). Achado original:
  🟡 **Empresa nova num grupo existente fura o limite do plano.** Quando o administrador
  já tem conta, a empresa entra no grupo dele **sem `garantirVagaDeEmpresa`**, que o
  módulo `empresas` e o `grupos-economicos` chamam. O grupo passa do `limiteEmpresas`
  contratado.
- ✅ **Corrigido em 202e7ff** (situação e limite do contrato). Achado original:
  🟡 **Empresa nova ignora a assinatura do grupo.** Nasce com a situação e o limite de
  usuários do payload (padrão `teste`, sem limite), mesmo que o grupo tenha contrato
  `ativa` com limite; só a próxima alteração da assinatura alinha.
- ✅ **Corrigido em 766cfcc** (a assinatura só propaga o que mudou). Achado original:
  🟡 **Duas fontes para a situação da empresa.** `alterarSituacao` muda a empresa
  direto; `assinaturas` sobrescreve todas as empresas do grupo a cada alteração do
  contrato. Uma suspensão feita aqui some quando alguém muda o dia de vencimento lá (e o
  inverso).
- 🟡 **Vincular como administrador promove a conta no grupo inteiro.** O perfil é da
  conta: um vendedor de uma empresa do grupo, vinculado como administrador de outra,
  passa a administrar **todas** as empresas do grupo. Está nos comentários, mas a tela
  fala em "administrar esta empresa".
- ✅ **Corrigido em 202e7ff** (só administrador, com trava). Achado original:
  🟡 **Desvincular remove qualquer vínculo**, não só de administrador: a rota confere
  que há mais de um administrador, mas não que o `usuarioId` alvo é um deles.
- ✅ **Corrigido em 202e7ff** (contagem dentro da transação, com trava). Achado original:
  🟡 **Revogação concorrente.** "Não revogar o último" conta os administradores fora da
  transação; dois administradores revogando um ao outro ao mesmo tempo podem zerar a
  lista (saída só por UPDATE no banco).
- 🟡 **Senha provisória sem a política de senha** (só 8–72 caracteres pelo Zod).
- 🟡 **`sortBy` livre** na listagem (`z.string()`): campo inexistente vira erro do Prisma
  (500), não 400.
- 🟡 **`empresa.teste_alterado` registrado mesmo sem mudança** (diferente da situação,
  que confere).
- 🟡 **CNPJ e alias conferidos fora da transação**: a corrida esbarra no `@unique` e dá
  500 em vez de 409.

### 4. Estruturas de dados 🟢

`PlataformaAuditoria` (`plataforma_auditoria`, sem FK de usuário nem de empresa, para o
log sobreviver às exclusões); usa `Empresa`, `Usuario`, `UsuarioEmpresa`, `Perfil`,
`GrupoEconomico`. Ver `data-dictionary.md`, seção `plataforma`.

### 5. Metadados e configurações 🟢

| Item | Valor |
|---|---|
| `SALT_ROUNDS` | 12 |
| Perfis por nome | "Administrador Empresa" (`grupoEconomicoId null`); o da plataforma por `administraPlataforma = true` |
| Situação padrão na criação | `teste` |
| Ações do log | `empresa.criada`, `empresa.situacao_alterada`, `empresa.teste_alterado`, `empresa.limite_alterado`, `empresa.admin_vinculado`, `empresa.admin_desvinculado`, `admin.promovido`, `admin.revogado` |

### 6. Dependências e testes

`PrismaService` (`withTenant`, `withUsuario`, `$transaction`, `set_config`),
`EnriquecimentoService` (de `clientes`), `common/empresa/documento-empresa`,
`common/empresa/situacao-empresa`, `common/empresa/limite-usuarios`, `bcryptjs`,
`@plataforma/contracts`. Testes: `plataforma-empresa-create.spec.ts` (criação com conta
existente/nova) e `plataforma-uso.spec.ts` (uso lido dentro do tenant, contagem por
`withUsuario`). Sem teste para `definirAdmin`, desvincular nem `alterarSituacao`.

---

## Módulo `parametros`

**Caminho:** `apps/api/src/modules/parametros/`
**Arquivos (3):** `parametros.module.ts`, `parametros.controller.ts` (120, 5 rotas),
`parametros.service.ts` (290), `dto/parametro.dto.ts` (Zod de
`packages/contracts/src/parametro.ts`).

### 1. Responsabilidade 🟢

Parâmetros do sistema **por empresa** (chave/valor tipado, tabela
`parametros_empresa`). Duas funções:
- o **CRUD** da tela Administração > Parâmetros;
- a **leitura tipada** para o resto do backend (`obterNumero`, `obterBoolean`,
  `obterTexto`), com valor padrão quando o parâmetro não existe, está inativo ou vazio.

É a fonte de configuração de SMTP, SMS, tabelas de preço, validade do orçamento,
reemissão de boleto, armazém padrão e outras. Não tem rota em `/integracao` de
propósito, com uma exceção: o ERP grava `ULTIMA_COMUNICACAO_ERP` pela rota de
comunicação da integração.

### 2. Rotas 🟢

`JwtAuthGuard` + `PermissionsGuard`; a empresa é sempre a ativa do token.

| Rota | Permissão | Comportamento |
|---|---|---|
| `GET /parametros` | `parametros.visualizar` | paginada; busca por chave ou descrição; filtros `ativo`, `tipo`; ordenação só por `parametro`, `tipo`, `ativo`, `createdAt` |
| `GET /parametros/:id` | `parametros.visualizar` | |
| `POST /parametros` | `parametros.cadastrar` | chave única na empresa (409) |
| `PATCH /parametros/:id` | `parametros.editar` | senha em branco mantém a atual |
| `DELETE /parametros/:id` | `parametros.excluir` | soft delete (`ativo=false`) |

### 3. Algoritmos e lógica não-trivial 🟢

- **Tipo `senha`**: `paraLeitura` devolve `conteudo = null` e `preenchido = !!conteudo`;
  no `update`, conteúdo vazio num parâmetro que **já era** senha mantém o valor atual.
- **`validarConteudo`**: `numero` (`Number()` não pode dar `NaN`), `booleano`
  (`"true"`/`"false"`), `data` (`new Date` válido) e `tamanho` máximo. Conteúdo vazio
  passa sempre.
- **Chave**: `^[A-Z0-9_]+$`, 2–60 (Zod).
- **Leitura tipada**: só parâmetro `ativo` e não excluído; vazio ou nulo → padrão;
  `obterNumero` com texto inválido → padrão; `obterBoolean` → `conteudo === 'true'`
  (qualquer outra coisa é `false`). Aceita a transação do chamador.

Constantes exportadas: `ARMAZEM_PADRAO`, `TABELA_PRECO_PADRAO`, `TABELA_PRECO_CAPITAL`,
`TABELA_PRECO_INTERIOR`, `ORCAMENTO_EXIBIR_FOTOS_PRODUTOS`,
`BOLETO_PRAZO_MAXIMO_REEMISSAO`, `ULTIMA_COMUNICACAO_ERP`.

### 4. Achados

- ✅ **Corrigido em 5eba615** (2026-10-15: sair do tipo `senha` descarta o segredo gravado). Achado original:
  🔴 **Trocar o tipo revela a senha.** O `PATCH` aceita `tipo`. Com
  `{"tipo": "texto"}` num parâmetro `senha` (`SMTP_SENHA`, `SMS_TOKEN`), o conteúdo é
  mantido (a regra "senha em branco mantém" olha o tipo **atual**) e passa a sair em
  texto puro no `GET`. Quem tem `parametros.editar` lê a credencial que a API promete
  nunca devolver.
- ✅ **Corrigido em 7acadee** (chave fixa). Achado original:
  🟡 **A chave pode ser renomeada** pelo `PATCH` (`parametro` está no parcial), sem
  conferir duplicidade (o `@@unique` do banco devolve 500) e sem aviso de que o código
  procura a chave pelo nome: renomear `SMTP_SENHA` desliga o e-mail em silêncio.
- ✅ **Corrigido em 7acadee** (reativa a linha). Achado original:
  🟡 **Recriar depois de excluir dá 500.** O `@@unique([empresaId, parametro])` inclui as
  linhas excluídas, mas o `create` só confere as não excluídas.
- ✅ **Corrigido em 9b6277d** (`PARAMETROS_CRYPTO_KEY`, cifragem dos existentes na subida). Achado original:
  🟡 **Segredos sem cifra.** `SMTP_SENHA` e `SMS_TOKEN` ficam em texto puro em
  `parametros_empresa.conteudo` (as chaves do agente e do WhatsApp são cifradas).
- 🟡 **`validarConteudo` é permissivo.** `Number('')` e `Number(' ')` valem 0; `data`
  aceita qualquer coisa que o `Date` do JavaScript entenda (`"1"`, `"2026"`).
- 🟡 **Mudar o tipo não revalida o conteúdo existente** quando o `PATCH` não traz
  `conteudo`: um `texto` "abc" passa a `numero` e os leitores caem no padrão em
  silêncio.

### 5. Estruturas de dados 🟢

`ParametroEmpresa` (`parametros_empresa`), enum `TipoParametro`. Ver
`data-dictionary.md`, seção `parametros`.

### 6. Dependências e testes

`PrismaService`, `common/pagination`, `@plataforma/contracts`. Consumidores (via
`ParametrosService`): e-mail/SMTP, SMS, orçamentos, títulos (boleto), integração
(produtos, comunicação), WhatsApp e outros. Parâmetros padrão criados por migrations de
backfill (`20260923162000_parametros_padrao_backfill` e as de cada módulo) e pelo
`seed-base.ts`. **Sem testes próprios.**

---

## Módulo `escopo`

**Caminho:** `apps/api/src/modules/escopo/`
**Arquivos (3):** `escopo.module.ts`, `escopo.controller.ts` (31), `escopo.service.ts` (30).

### 1. Responsabilidade e rota 🟢

`GET /escopo/vendedores` (só `JwtAuthGuard`, **sem permissão de rotina**, de propósito):
os vendedores **dentro do escopo hierárquico** do usuário (`id`, `nome`,
`nomeReduzido`), para os filtros "Vendedor" das telas escopadas (notas, itens,
títulos), sem expor o `VendedoresController`, que não restringe carteira. Devolve
`{data, restrito}`; `restrito = false` significa acesso total.

### 2. Lógica 🟢

Dentro de `withTenant(empresaAtiva)`: `resolverEscopoVendedores(tx, empresaId, user)`
(`common/escopo/escopo-vendedores.ts`) devolve `null` (sem restrição: perfil
`sistemaBase` ou `carteiraCompleta`) ou a lista de ids (o vendedor do usuário e o time
abaixo dele na árvore `superiorId`; sem vendedor ligado, lista vazia). Lista os
vendedores não excluídos, ordenados por nome.

### 3. Achados

- 🟡 **Inclui vendedores inativos** (filtra só `deletedAt`); o filtro mostra quem já
  saiu. Pode ser desejado para histórico (notas antigas) — 🔴 confirmar com o negócio.
- 🟡 Sem permissão de rotina, qualquer usuário logado lista os nomes dos vendedores
  do próprio escopo; para quem tem acesso total, todos da empresa. Decisão registrada
  no código (baixa sensibilidade).

### 4. Dependências e testes

`PrismaService`, `common/escopo/escopo-vendedores` (o mesmo usado por notas, títulos,
clientes, SMS e outros). Sem testes próprios (o resolvedor tem os seus em `common`).

---

## Módulo `politica-senha`

**Caminho:** `apps/api/src/modules/politica-senha/`
**Arquivos (3):** `politica-senha.module.ts`, `politica-senha.controller.ts` (81, 3 rotas
só de leitura), `politica-senha.service.ts` (309).

### 1. Responsabilidade 🟢

A **política de senha por empresa**, guardada como parâmetros (`SENHA_*` em
Administração > Parâmetros desde 2026-08-26; antes era uma tabela global com tela
própria). O serviço resolve a política vigente, **valida** senhas (fonte de verdade da
força da senha; o Zod só garante o formato básico), valida **reuso** contra o histórico,
grava o histórico e **gera senha provisória**. Consumidores: `auth` (login, bloqueio,
expiração, troca), `usuarios` (criação e reset), `vendedores` (usuário provisório) e
`recuperacao-senha`.

### 2. Rotas 🟢

| Rota | Guarda | Política devolvida |
|---|---|---|
| `GET /politica-senha` | JWT, `@PermitirTermoPendente` | a da própria conta (`getVigenteParaUsuario`) |
| `GET /politica-senha/empresa-ativa` | JWT | a da empresa ativa (senha inicial de usuário novo) |
| `GET /politica-senha/usuario/:id` | `usuarios.editar` | a do usuário alvo (reset feito por admin) |

São três porque cada uma espelha a validação que o backend fará naquele fluxo.

### 3. Algoritmos e lógica não-trivial

#### 3.1 Política da empresa 🟢

Dez parâmetros lidos com `obterNumero`/`obterBoolean` (padrão quando ausentes):

| Parâmetro | Padrão |
|---|---|
| `SENHA_TAMANHO_MINIMO` / `SENHA_TAMANHO_MAXIMO` | 8 / 0 (sem máximo) |
| `SENHA_EXIGIR_MAIUSCULA` / `_MINUSCULA` / `_NUMERO` / `_ESPECIAL` | sim / não / sim / não |
| `SENHA_DIAS_PARA_EXPIRAR` | 0 (não expira) |
| `SENHA_HISTORICO_QUANTIDADE` | 0 (não confere reuso além da atual) |
| `SENHA_TENTATIVAS_ANTES_BLOQUEIO` / `SENHA_MINUTOS_BLOQUEIO` | 5 / 15 |

`sanear`: máximo > 0 e menor que o mínimo é tratado como "sem máximo" (cada parâmetro
é editado sozinho na tela de Parâmetros, e o par incoerente recusaria toda senha).

#### 3.2 Política da conta — a mais restritiva 🟢

A senha é da **conta**, não da empresa: vale a **mais restritiva entre as empresas com
vínculo ativo** (decisão de 2026-08-26). `maisRestritiva`, regra a regra: maior mínimo;
`menorNaoZero` para máximo, dias para expirar e tentativas (zero = sem limite e perde de
qualquer número); `OR` nas exigências; maior histórico; mais minutos de bloqueio. Sem
vínculo → padrão.

#### 3.3 Validação, reuso e histórico 🟢

- `validarSenhaContra` junta todas as violações numa mensagem só (400).
- `validarSenhaDoUsuario` (conta existente) e `validarSenhaDaEmpresa` (usuário em
  criação, sem vínculo ainda).
- `validarReuso`: recusa a senha atual (bcrypt) e as últimas N de `senha_historico`.
- `registrarHistorico` grava o hash **substituído**, aceitando a transação do chamador.

#### 3.4 Senha provisória 🟢

`max(mínimo da política, 14)` caracteres, limitado ao máximo; sempre as quatro
categorias, de um alfabeto sem ambíguos (sem `0/O`, `1/l/I`); sorteio e embaralhamento
(Fisher-Yates) com `crypto.randomInt`.

#### 3.5 Achados

- ✅ **Corrigido em 5eba615** (2026-10-15; confirmado na base de dev: 0 vínculos lidos sem contexto contra 16 ativos — agora lê com `withUsuario`). Achado original:
  🔴 **A "mais restritiva" provavelmente não é calculada.** `getVigenteParaUsuario` lê
  `usuario_empresas` com `this.prisma.usuarioEmpresa.findMany`, **sem `withUsuario`**.
  A tabela tem duas policies: `tenant_isolation` (`empresaId = app.current_empresa_id`)
  e `self` (`usuarioId = app.current_usuario_id`). O contexto automático do
  `PrismaService` só informa `app.current_empresa_id` (e só em requisição de usuário
  logado); `app.current_usuario_id` só existe dentro de `withUsuario`. Daí, 🟡 inferido
  do código e das policies:
  - **login** (sem contexto) e **"esqueci minha senha"** (sem contexto): a leitura
    volta vazia → **`POLITICA_PADRAO`**. O bloqueio por tentativas (5/15 min), a
    expiração e a força da senha nova ignoram os parâmetros das empresas.
  - **requisição logada** (troca da própria senha, `me()`): enxerga só o vínculo da
    **empresa ativa** → vale a política dela, não a mais restritiva da conta.
  É o mesmo padrão que o próprio código descreve em `plataforma.service.ts` e
  `recuperacao-senha.service.ts` ("sem `withUsuario` a consulta volta vazia, sem
  erro"). **Confirmar contra o banco** com o papel `plataforma_app`.
- 🟡 **Senha atual nunca é revalidada** quando a política aperta ou a conta ganha
  vínculo com empresa mais exigente (comportamento declarado; só a expiração força a
  troca).
- 🟡 **Senha provisória pode violar o máximo.** Com `tamanhoMaximo` < 4, o gerador ainda
  põe as quatro categorias e passa do máximo (o `sanear` só corrige máximo < mínimo).
- 🟡 **Especial = qualquer coisa fora de `[A-Za-z0-9]`**, inclusive espaço e letras
  acentuadas; "maiúscula" é só `[A-Z]` (um `É` não conta).
- 🟡 **Leituras por empresa sem cache:** dez consultas por empresa a cada login falho,
  carga de `me()` e troca de senha.

### 4. Estruturas de dados 🟢

`PoliticaSenha` (contrato), `SenhaHistorico` (`senha_historico`); parâmetros `SENHA_*`
em `parametros_empresa`. Ver `data-dictionary.md`, seção `politica-senha`.

### 5. Dependências e testes

`PrismaService`, `ParametrosService`, `bcryptjs`, `node:crypto`. Testes indiretos nos
consumidores (`auth`, `recuperacao-senha`, que simula o `withUsuario` no próprio
serviço). **Sem teste do cálculo da mais restritiva** contra a RLS.

---

## Módulo `recuperacao-senha`

**Caminho:** `apps/api/src/modules/recuperacao-senha/`
**Arquivos (4):** `recuperacao-senha.module.ts`, `recuperacao-senha.controller.ts` (54,
2 rotas públicas), `recuperacao-senha.service.ts` (239), `recuperacao-senha.service.spec.ts`
(253). Plano: `docs/planos/2026-10-13-esqueci-minha-senha.md`.

### 1. Responsabilidade 🟢

"Esqueci minha senha" por **link de uso único de 30 minutos** enviado por e-mail. Rotas
públicas, como o login; roda no "modo sistema" do papel `plataforma_app` para ler
`usuarios`/`empresas`.

### 2. Rotas 🟢

| Rota | Throttle por IP | Comportamento |
|---|---|---|
| `POST /auth/senha/esqueci` `{email, empresaAlias?}` | 5 / 15 min | resposta **sempre** `{ok: true}` |
| `POST /auth/senha/redefinir` `{token, novaSenha}` | 10 / 15 min | troca a senha |

### 3. Algoritmos e lógica não-trivial 🟢

**Pedir** (`pedir` → `enviarLink`; qualquer erro só vai para o log):
1. Conta por e-mail (sem diferenciar maiúsculas), não excluída e **ativa**; senão, nada.
2. Empresa do pedido (`withUsuario`): a do alias da tela de login, se a conta tem vínculo
   ativo com ela; senão a primeira com vínculo; senão nenhuma.
3. Sem `WEB_URL`/`CORS_ORIGIN` → só log.
4. Token `randomBytes(32)` base64url; guarda **só o SHA-256**. Numa transação: invalida
   os links vivos da conta (`usadoEm = agora`) e cria o novo com `expiraEm` e IP.
5. E-mail com o layout da empresa; **SMTP da empresa** se ela liberou o e-mail de acesso
   (`disponibilidade().senhaProvisoria`), senão o da plataforma.
6. Registro `senha_redefinicao_pedida` em acessos.
A senha atual continua valendo até o link ser usado.

**Redefinir**:
1. Busca pelo hash do token; inválido, usado, vencido, conta excluída ou inativa → a
   mesma mensagem genérica (400).
2. Política (`validarSenhaDoUsuario`) e reuso (`validarReuso`).
3. Transação: marca o uso **condicionado a `usadoEm null`** (dois envios simultâneos não
   trocam duas vezes), grava o hash antigo no histórico, troca a senha, zera
   `deveTrocarSenha`, tentativas e bloqueio, e **revoga os refresh tokens**.
4. Encerra as sessões abertas (`senha_redefinida`) e registra o evento.

### 4. Achados

- 🔴 **Política padrão na redefinição** — ver `politica-senha` §3.5: sem contexto, a
  política que valida a senha nova tende a ser a padrão, não a das empresas da conta.
- ✅ **Corrigido em 4c52520** (a rota responde antes de procurar a conta). Achado original:
  🟡 **Resposta igual, tempo diferente.** A resposta é sempre `{ok: true}`, mas com conta
  existente o servidor grava, monta e envia o e-mail antes de responder; a diferença de
  tempo revela quem tem conta (enumeração por tempo).
- ✅ **Corrigido em 0dacf4a** (3 links por conta por hora). Achado original:
  🟡 **Throttle só por IP.** Rotação de IP permite encher a caixa de uma pessoa; não há
  limite por conta (cada pedido invalida o anterior, mas manda outro e-mail).
- 🟡 **O link vai na query string** (`?token=`): fica no histórico do navegador e pode
  vazar por `Referer` se a página de redefinição carregar recurso externo.
- 🟡 **Conta bloqueada pode redefinir** e o bloqueio é zerado — desejado para quem
  esqueceu a senha, mas também é o caminho de quem tem acesso ao e-mail da vítima.
- 🟡 **Links usados e vencidos não são limpos** (`senha_redefinicoes` cresce).

### 5. Estruturas de dados 🟢

`SenhaRedefinicao` (`senha_redefinicoes`). Ver `data-dictionary.md`.

### 6. Dependências e testes

`PrismaService` (`withUsuario`, `$transaction`), `MailService`, `smtpDaEmpresa`,
`buscarEmpresaDoEmail`, `urlDoSistema`, `montarEmailRedefinicao`, `EmailConfigService`,
`ParametrosService`, `PoliticaSenhaService`, `AcessosService`. `recuperacao-senha.service.spec.ts`
cobre: resposta igual sem conta, link único que invalida o anterior, empresa pelo alias,
SMTP da empresa ou da plataforma, token inválido/vencido/usado, troca com histórico,
desbloqueio e revogação, e a corrida do uso duplo. A política é simulada (não pega o
achado da RLS).
