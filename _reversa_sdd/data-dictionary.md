# Dicionário de Dados — plataforma-comercial (rcg)

> Gerado pelo Archaeologist a partir de `apps/api/prisma/schema.prisma`.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

---

## Módulo `auth`

### `Usuario` (tabela `usuarios`) 🟢

Conta de login. Pertence a um `GrupoEconomico` (perfil, superior e dados pessoais são do
usuário, válidos em todas as empresas do grupo — decisão de 30/09/2026, antes moravam em
cada vínculo `UsuarioEmpresa`).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `grupoEconomicoId` | String? | não | — | FK `GrupoEconomico` |
| `perfilId` | String | sim | — | FK `Perfil` (RBAC, global) |
| `superiorId` | String? | não | — | auto-relação hierárquica (`UsuarioHierarquia`) |
| `codigoErp` | String? | não | — | integração com ERP externo |
| `nomeReduzido` | String? | não | — | |
| `nome` | String | sim | — | |
| `email` | String | sim | — | `@unique` global |
| `senhaHash` | String | sim | — | bcrypt, 12 rounds |
| `ativo` | Boolean | sim | `true` | login recusado se `false` |
| `ultimoLogin` | DateTime? | não | — | |
| `primeiroAcessoConcluidoEm` | DateTime? | não | — | marco de conclusão (ver 3.7 do code-analysis) |
| `avatarUrl` | String? | não | — | |
| `mfaEnabled` | Boolean | sim | `false` | não referenciado no fluxo de login atual 🔴 |
| `nomeWhatsapp` | String? | não | — | assinatura nas mensagens WhatsApp |
| `usarNomeWhatsapp` | Boolean | sim | `true` | liga/desliga sem apagar `nomeWhatsapp` |
| `telefone` / `celular` | String? | não | — | |
| `dataNascimento` | DateTime? | não | — | mesma em todas as empresas do grupo |
| `tentativasFalhas` | Boolean/Int | sim | — | lockout de login (não mostrado no trecho lido, referenciado em `auth.service.ts`) |
| `bloqueadoAte` | DateTime? | não | — | lockout temporário |
| `deveTrocarSenha` | Boolean | sim | — | força troca no próximo login |
| `senhaAlteradaEm` | DateTime? | não | — | idade da senha para expiração por política |

### `UsuarioEmpresa` (tabela `usuario_empresas`) 🟢

Vínculo usuário × empresa. Um usuário pode ter vínculo ativo com várias empresas do mesmo
grupo (multiempresa).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `usuarioId` | String | sim | — | FK `Usuario` |
| `empresaId` | String | sim | — | FK `Empresa` |
| `ativo` | Boolean | sim | `true` | vínculo desativado não autentica nesta empresa |
| `rotinaInicialId` | String? | não | — | FK `Rotina`, tela inicial escolhida pelo usuário; nulo cai no `Perfil.rotinaInicial` |
| soft delete (`deletedAt`, `createdBy`, `updatedBy`, `deletedBy`) | — | — | — | padrão de auditoria do projeto |

`@@unique([usuarioId, empresaId])` — um vínculo por par usuário/empresa.

### `RefreshToken` (tabela `refresh_tokens`) 🟢

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | String (uuid) | sim | PK |
| `usuarioId` | String | sim | FK `Usuario` |
| `empresaId` | String? | não | empresa ativa no momento da emissão |
| `tokenHash` | String | sim | `@unique`; SHA-256 do token — valor em claro **nunca** persistido |
| `expiresAt` | DateTime | sim | `now() + 7 dias` (`REFRESH_TTL_MS`) |
| `revokedAt` | DateTime? | não | setado na rotação (sempre) ou no corte por expediente/logout |
| `sessaoId` | String? | não | FK `Sessao` — carregado adiante a cada rotação, para o logout saber qual sessão encerrar |
| `ip`, `userAgent` | String? | não | metadados da requisição |

Sem RLS — é escrito no login, antes de existir empresa ativa no contexto de RLS (mesmo
motivo documentado para `Sessao`).

### `Sessao` (tabela `sessoes`) 🟢

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | String (uuid) | sim | PK |
| `usuarioId` | String | sim | FK `Usuario` |
| `empresaId` | String? | não | empresa em que a sessão foi aberta |
| `iniciadaEm` | DateTime | sim | `now()` |
| `ultimaAtividadeEm` | DateTime | sim | avança a cada rotação de refresh (~15 min) e troca de empresa — não a cada requisição |
| `encerradaEm` | DateTime? | não | nulo enquanto aberta |
| `motivoFim` | String? | não | `"logout"`, `"troca_empresa"` (não encerra na prática, reaproveita), `"fora_horario"`, `"novo_acesso"` |
| `ip`, `userAgent` | String? | não | |

Índices: `[usuarioId, iniciadaEm]`, `[usuarioId, encerradaEm]`.

### Enum `AcessoEvento` 🟢

`login_sucesso`, `login_falha`, `login_bloqueado`, `login_fora_horario`,
`acesso_fora_horario`, `logout`, `troca_empresa`, `sessao_substituida`,
`sessao_desconectada`, `senha_redefinicao_pedida`, `senha_redefinida`.

### DTOs de entrada/saída (Zod, em `@plataforma/contracts`) 🟢

Todos os DTOs do controller são gerados via `createZodDto()` a partir de schemas
centrais do pacote `contracts` (fonte única compartilhada com `apps/web`):
`loginSchema`, `refreshInputSchema`, `authTokensSchema`, `currentUserSchema`,
`switchEmpresaInputSchema`, `changePasswordSchema`, `updateOwnProfileSchema`,
`updateRotinaInicialSchema`, `completeFirstAccessSchema`, `avatarPadraoSchema`.

| DTO | Campos (inferidos do uso em `auth.service.ts`) |
|---|---|
| `LoginInput` | `email`, `senha`, `empresaAlias?` |
| `RefreshInput` | `refreshToken` |
| `ChangePasswordInput` | `senhaAtual`, `novaSenha` |
| `CompleteFirstAccessInput` | `nome`, `telefoneInstitucional`, `dataNascimento` (string `YYYY-MM-DD`) |
| `AvatarPadraoInput` | `avatar` (enum de nomes de avatar padrão) |

### Payload do JWT (access token) 🟢

```ts
{
  sub: string;              // usuarioId
  nome: string;
  email: string;
  empresaAtivaId: string;
  isAdmin: boolean;          // = perfil.sistemaBase
  administradorPlataforma?: boolean; // = perfil.administraPlataforma
  permissoes: string[];      // "<codigoRotina>.<acao>", vazio se isAdmin
  sid?: string;               // sessaoId
}
```

---

## Módulo `clientes`

### `Cliente` (tabela `clientes`) 🟢

Cadastro com ~40 campos. Origem predominante: import do ERP (`chave`/`codigoErp`).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | multi-tenant, RLS |
| `vendedorId` | String? | FK `Vendedor` — dono da carteira |
| `tabelaPrecoId`, `condicaoPagamentoId` | String? | FK |
| `chave` | String? | chave de integração ERP (`X2_UNICO`, formato FILIAL-COD); presença bloqueia exclusão via API |
| `codigoErp` | String? | informativo; presença também bloqueia exclusão |
| `tipoPessoa` | enum `TipoPessoa` | `juridica` (default) / física |
| `razaoSocial` | String | obrigatório |
| `nomeFantasia`, `cnpjCpf`, `inscricaoEstadual`, `inscricaoMunicipal` | String? | |
| `contribuinteIcms` | Boolean? | |
| `endereco`, `complemento`, `bairro`, `municipio`, `uf`, `cep`, `latitude`, `longitude` | | endereço completo |
| `ativo` | Boolean | default `true` |
| `carteira` | Boolean? | flag de filtro (uso 🔴 não detalhado neste módulo) |
| `limiteCredito`, `vencimentoLimite` | | |
| `dataBloqueio`, `observacaoBloqueio`, `dataReativacao`, `observacaoReativacao` | | bloqueio manual do cliente |
| `primeiraCompra`, `ultimaVisita`, `ultimaCompra`, `ultimoAtendimento`, `dataConsultaRfb` | DateTime? | marcos calculados/importados |

`@@unique([empresaId, chave])`. Relações: `notasSaida`, `notasEntrada` (devoluções),
`titulosReceber`, `oportunidades`, `atividades`, `comodatoBaixas`, `orcamentos`, `cnaes`,
`alteracoes`, `historico`, `enviosErp`, `sugestoesCompra`, `whatsappContatos`,
`whatsappConversas`, `contatosPortal`, `portalHabilitacao`.

### `ClienteContato` (tabela `cliente_contatos`) 🟢

Pessoa de contato do cliente (não confundir com usuário/login). Usado pelo Portal do
Cliente e pela vinculação de WhatsApp.

| Campo | Tipo | Observação |
|---|---|---|
| `nome`, `email` (`@@unique` por cliente), `telefone`, `celular`, `cargo` | | |
| `principal` | Boolean default `false` | só um por cliente (aplicação em `criarContato`) |
| `ativo` | Boolean default `true` | |
| `perfilId` | FK `PortalClientePerfil?` | |

### `ClienteAlteracao` (fila de aprovação) 🟢

| Campo | Observação |
|---|---|
| `origem` | enum `OrigemAlteracaoCliente`: manual / integração (ERP) / enriquecimento (Receita) / agente 🟡 |
| `status` | `pendente` / `aprovada` / `rejeitada` |
| `alteracoes` | JSON `DiffAlteracao` — `{ campo: { de, para } }` |
| `justificativa`, `motivoRecusa` | |
| `solicitadoPor`, `solicitadoEm`, `analisadoPor`, `analisadoEm` | auditoria |

Dedupe: índice parcial único por `(empresaId, clienteId, origem, status='pendente')` 🟡
(mencionado no código, não visto diretamente no schema lido).

### `ClienteHistorico` (tabela, histórico imutável) 🟢

Uma linha por **campo** alterado (não por solicitação): `campo`, `valorAnterior`,
`valorNovo`, `status` (`aplicado`/`reprovado`), `origem`, `autor`, `alteracaoId`,
`criadoEm`. Cobre inclusive campos reprovados na aprovação parcial.

### `ClienteEnvioErp` (fila de envio ao ERP) 🟢

`alteracaoId`, `campos` (lista de nomes no formato do contrato de integração),
`situacao`, `enviadoEm`. Gerado só quando a origem não é `integracao` (evita eco) e há ao
menos 1 campo na whitelist `CAMPOS_ENVIO_ERP`.

### `ClienteCnae` (tabela, vínculo N:N com soft delete) 🟢

| Campo | Observação |
|---|---|
| `clienteId`, `cnaeId` | `@@unique` ignora soft delete — reaproveita linha ao invés de recriar |
| `principal` | Boolean — só um `true` por cliente (invariante aplicado em código, não em constraint) |

### `ClienteReceitaExecucao` (execução em lote) 🟢

| Campo | Observação |
|---|---|
| `situacao` | `rodando` / `concluida` / `falhou` |
| `parametros` | JSON do `ClientesReceitaLoteBody` (filtros do lote) |
| `resultado` | JSON `ClientesReceitaLoteResultado` (contadores, gravado incrementalmente) |
| `erro` | truncado em 1000 caracteres |

Uma execução "rodando" por empresa (constraint que gera `P2002` em concorrência → 409).

### `ComodatoBaixa` (tabela `comodato_baixas`) 🟢

| Campo | Observação |
|---|---|
| `produtoId`, `clienteId`, `quantidade` | baixa o saldo **inteiro** no momento |
| `motivo` | opcional |
| `desfeitaEm`, `desfeitaPor` | soft-revert — baixa some do cálculo de saldo quando desfeita |

### DTOs principais (Zod, `@plataforma/contracts`) 🟢

`ClienteCreate`, `ClienteUpdate`, `ClienteQuery`, `ClienteContatoCreate`,
`PosicaoClienteListQuery`/`Row`, `ClienteAlteracaoQuery`, `DiffAlteracao`,
`OrigemAlteracaoCliente`, `ClienteCnaeCreate`, `ComodatoBaixaCriar`,
`ClientesReceitaLoteBody`, `ClientesReceitaExecucao`, `ClientesReceitaLoteResultado`,
`ConsultaCnpjResultado`, `CnaeSugerido`, `ClienteCamposConfig`.

---

## Módulo `empresas`

### `Empresa` (tabela, tenant) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `grupoEconomicoId` | String | obrigatório — toda empresa pertence a um grupo (decisão de 30/09/2026) |
| `tipoPessoa` | enum `TipoPessoa` | default `juridica` |
| `razaoSocial`, `nomeFantasia` | String | obrigatórios |
| `cnpj` | String | `@unique` global |
| `alias` | String? | `@unique` global — URL de login |
| `logoUrl`, `logoDanfeUrl`, `bannerImagemUrl` | String? | caminhos de upload |
| `ePlataforma` | Boolean default `false` | marca a empresa gestora da plataforma SaaS — campo exclusivo da plataforma |
| `situacao` | enum `SituacaoEmpresa` default `ativa` | **fonte única** de "pode acessar"; substituiu um `ativo` booleano redundante — campo exclusivo da plataforma |
| `testeExpiraEm` | DateTime? | só relevante com `situacao = teste`; nulo = sem prazo — campo exclusivo da plataforma |
| `limiteUsuarios` | Int? | teto de vínculos ativos; nulo = sem limite — campo exclusivo da plataforma |
| `fusoHorario` | String default `"America/Campo_Grande"` | IANA timezone, usado para calcular horário local por empresa |
| `bannerAtivo` | Boolean default `false` | liga a faixa institucional (separado do upload da imagem) |
| `bannerCor` | String? | hex `#rrggbb`; nulo usa cor do tema |
| `inscricaoEstadual`, `inscricaoMunicipal`, `endereco`, `complemento`, `bairro`, `municipio`, `uf`, `cep` | String? | identificação fiscal/endereço para documentos emitidos (ex. PDF de orçamento) |

Sem RLS por `empresaId` (é a própria linha do tenant) — RLS nela é por grupo econômico
(ver nota no CLAUDE.md do projeto).

### DTOs (Zod) 🟢

`EmpresaCreate` (inclui `grupoEconomicoId?`), `EmpresaUpdate`, `EmpresaQuery` (`situacao?`,
`search?`, `sortBy?`, `sortOrder?`, paginação).

---

## Módulo `grupos-economicos`

### `GrupoEconomico` (tabela `grupos_economicos`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `descricao` | String | nome do grupo; empresa removida ganha grupo próprio com seu `nomeFantasia` como descrição |
| `assinatura` | `Assinatura?` | plano contratado (limites de empresas/usuários) |
| `empresas` | `Empresa[]` | relação 1:N |
| `usuarios` | `Usuario[]` | relação 1:N — conta pertence a um único grupo |
| `perfis` | `Perfil[]` | perfis (RBAC) específicos do grupo |
| soft delete | `deletedAt` | grupo esvaziado (sem empresas) é soft-deletado automaticamente |

Sem RLS por `empresaId` — é RLS **por grupo econômico** (junto com `Usuario`, `Empresa`,
`Perfil`), conforme documentado no CLAUDE.md do projeto.

### DTOs (Zod) 🟢

| DTO | Campos |
|---|---|
| `GrupoEconomicoInput` | `descricao`, `empresaIds: string[]` |
| `GrupoUsuarioInput` | `usuarioId?`, `novo?: { nome, email, senha }`, `vinculos: { empresaId, perfilId }[]` |
| `GrupoUsuario` (retorno) | `id`, `nome`, `email`, `vinculos: { empresaId, ativo, perfilId }[]` |

## Módulo `usuarios`

> `Usuario` e `UsuarioEmpresa` já estão documentados na seção `auth` (acima) — ambos são
> usados por este módulo (CRUD e vínculo), não repetidos aqui.

### `UsuarioHorario` (tabela `usuario_horarios`) 🟢

Faixa de expediente de um usuário, no máximo uma por dia da semana. Sem `empresaId` e
sem RLS: a trava é da conta, não do vínculo com uma empresa (mesmo precedente da
política de senha). Dia da semana sem linha = sem acesso naquele dia, somente quando
`Usuario.restringirHorario` está ligado.

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `usuarioId` | String | sim | — | FK `Usuario` |
| `diaSemana` | Int | sim | — | 0 = domingo … 6 = sábado |
| `horaInicio` | String | sim | — | texto `"HH:MM"`, hora de parede (fuso America/Campo_Grande), de propósito não é `DateTime` |
| `horaFim` | String | sim | — | idem |
| soft delete | — | — | — | não tem (`createdAt`/`updatedAt`/`createdBy`/`updatedBy` apenas) |

`@@unique([usuarioId, diaSemana])` — no máximo uma faixa por dia.

### DTOs (Zod, de `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `UsuarioCreate` | `nome`, `email`, `senha`, `ativo`, `perfilId` | senha validada pela política da empresa antes do hash |
| `UsuarioUpdate` | campos simples (não inclui senha nem vínculos) | |
| `UsuarioQuery` | `perfilId?`, `ativo?`, `search?` + paginação/ordenação | `sortBy` restrito a `SORT_FIELDS` no service |
| `UsuarioEmpresaCreate` | `perfilId`, `superiorId?`, `codigoErp?`, `nomeReduzido?`, `dataNascimento?`, `celular?`/`telefone?` | usado por `vincularEmpresa` |
| `ResetPasswordInput` | `novaSenha`, `deveTrocarSenha` | reset por admin, sem exigir senha atual |
| `UsuarioHorariosUpdate` | `horarios: { diaSemana, horaInicio, horaFim }[]`, `restringirHorario` | substitui o conjunto inteiro |

## Módulo `perfis`

### `Perfil` (tabela `perfis`) 🟢

Papel RBAC. Global por natureza, mas com dono desde a migration
`20260930200000_perfil_por_grupo`: perfil da plataforma (`grupoEconomicoId` nulo) é
modelo para todos os grupos; perfil do grupo é cópia/personalização visível só às
empresas daquele grupo. Sem RLS por `empresaId` (é RLS por grupo econômico, junto com
`Usuario`/`Empresa`/`GrupoEconomico`).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `nome` | String | sim | — | único por dono (ver `@@unique` abaixo) |
| `descricao` | String? | não | — | |
| `sistemaBase` | Boolean | sim | `false` | liga `isAdmin`: acesso total dentro da empresa; não pode ser excluído |
| `administraPlataforma` | Boolean | sim | `false` | acesso acima de qualquer empresa (área `/plataforma`); só seed/migration concedem, fora de `PerfilCreate`/`PerfilUpdate` |
| `ativo` | Boolean | sim | `true` | |
| `rotinaInicialId` | String? | não | — | FK `Rotina`, tela inicial padrão do perfil |
| `grupoEconomicoId` | String? | não | — | FK `GrupoEconomico`; nulo = perfil da plataforma |
| `carteiraCompleta` | Boolean | sim | `false` | vê a carteira de clientes inteira da empresa, sem recorte por vendedor; redundante com `sistemaBase`, que já vê tudo via `isAdmin` |
| soft delete | — | — | — | `deletedAt`/`createdBy`/`updatedBy`/`deletedBy` |

`@@unique([grupoEconomicoId, nome])` — nome único por dono; para os da plataforma
(grupo nulo) quem garante é o índice parcial `perfis_nome_plataforma_key` (criado via SQL
na migration, pois nulos não colidem em `@@unique` comum).

### `PerfilPermissao` (tabela `perfil_permissoes`) 🟢

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `perfilId` | String | sim | — | FK `Perfil` |
| `rotinaId` | String | sim | — | FK `Rotina` |
| `acao` | enum `Acao` | sim | — | ex.: `visualizar`, `cadastrar`, `editar`, `excluir` 🟡 (enum não lido neste módulo) |
| `permitido` | Boolean | sim | `false` | |

`@@unique([perfilId, rotinaId, acao])` — chave composta usada pelo upsert de
`updatePermissoes`.

### DTOs (Zod, de `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `PerfilCreate` | `nome`, `descricao?`, `sistemaBase?`, `ativo?`, `rotinaInicialId?`, `carteiraCompleta?` | sem `administraPlataforma`/`grupoEconomicoId` (decididos pelo service) |
| `PerfilUpdate` | subconjunto de `PerfilCreate` | |
| `PerfilQuery` | `ativo?`, `sistemaBase?`, `search?` + paginação/ordenação | `sortBy` restrito a `SORT_FIELDS` |
| `PerfilPermissoesUpdate` | `permissoes: { rotinaId, acao, permitido }[]` | upsert parcial — itens fora da lista não mudam |

## Módulo `acessos`

### `Sessao` (tabela `sessoes`) 🟢

Sem RLS — escrita no login, antes de existir empresa ativa (ver `AcessosService`,
isolamento em código).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `usuarioId` | String | sim | — | FK `Usuario` |
| `empresaId` | String? | não | — | empresa ativa no momento (pode mudar em `tocarSessao` na troca de empresa) |
| `iniciadaEm` | DateTime | sim | `now()` | |
| `ultimaAtividadeEm` | DateTime | sim | `now()` | atualizada a cada refresh/troca de empresa |
| `encerradaEm` | DateTime? | não | — | nulo = sessão aberta |
| `motivoFim` | String? | não | — | `"logout"`, `"troca_empresa"`, `"fora_horario"`, etc., nulo enquanto aberta |
| `ip` / `userAgent` | String? | não | — | `userAgent` truncado em 300 chars |

Índices: `[usuarioId, iniciadaEm]`, `[usuarioId, encerradaEm]`.

### `AcessoLog` (tabela `acessos_log`) 🟢

Rastro de cada tentativa de autenticação, inclusive as que falharam. Sem RLS pelo mesmo
motivo de `Sessao`.

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `usuarioId` | String? | não | — | nulo quando o e-mail digitado não existe no cadastro |
| `email` | String | sim | — | gravado em minúsculas |
| `empresaId` | String? | não | — | |
| `evento` | enum `AcessoEvento` | sim | — | ver valores abaixo |
| `detalhe` | String? | não | — | |
| `ip` / `userAgent` | String? | não | — | `userAgent` truncado em 300 chars |
| `criadoEm` | DateTime | sim | `now()` | |

Índices: `[criadoEm]`, `[usuarioId, criadoEm]`.

**`AcessoEvento` (enum) 🟢:** `login_sucesso`, `login_falha`, `login_bloqueado`,
`login_fora_horario`, `acesso_fora_horario`, `logout`, `troca_empresa`,
`sessao_substituida` (sessão única por usuário — novo login encerra as outras),
`sessao_desconectada` (desconexão manual pela administração),
`senha_redefinicao_pedida`, `senha_redefinida`. `EVENTOS_FALHA` (filtro "somente sem
sucesso" do service) = `login_falha`, `login_bloqueado`, `login_fora_horario`,
`acesso_fora_horario`.

### `UsoRotina` (tabela `uso_rotinas`) 🟢

Contador de abertura de tela por usuário/rotina/dia. Tem RLS por tenant (lido/escrito
via `withTenant`).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `empresaId` | String | sim | — | |
| `usuarioId` | String | sim | — | FK `Usuario`, `onDelete: Cascade` |
| `rotinaId` | String | sim | — | FK `Rotina`, `onDelete: Cascade` |
| `dia` | DateTime (`@db.Date`) | sim | — | no fuso da operação, sem hora |
| `acessos` | Int | sim | `0` | incrementado a cada chamada de `registrarUso` |
| `ultimoAcessoEm` | DateTime | sim | — | |

`@@unique([empresaId, usuarioId, rotinaId, dia])` — chave do upsert diário.

### DTOs (Zod, de `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `AcessoQuery` | `dataInicio?`, `dataFim?`, `usuarioId?`, `evento?`, `somenteFalhas?`, `search?` + paginação/ordenação | compartilhado pelas abas Eventos/Sessões/Uso-rotinas/Resumo |
| `RegistrarUso` (schema `registrarUsoSchema`) | `rota: string` | usado só por `UsoRotinaController` |

---

## Módulo `produtos`

### `Produto` (tabela `produtos`) 🟢

Origem predominante: import do ERP (`chave`/`codigoErp`). `chave` presente trava a edição
dos campos de `CAMPOS_DO_ERP` e impede exclusão via API (ver code-analysis).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | multi-tenant, RLS |
| `codigoErp` | String | obrigatório |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])` |
| `descricao` | String | obrigatório, máx. 120 (contrato) |
| `unidade`, `marca`, `codigoBarras`, `codigoFornecedor`, `ncm` | String? | |
| `categoriaId`, `subCategoriaId` | String? | FK `Categoria` (duas relações nomeadas: `ProdutoCategoria`/`ProdutoSubCategoria`) |
| `armazemId` | String? | FK `Armazem` |
| `fabricanteId` | String? | FK `Fornecedor` |
| `codigoFabricante`, `descricaoFabricante` | String? | nomes antigos: na verdade código/descrição no **fornecedor** (B1_XFOR/B1_XDESFOR) |
| `codigoNoFabricante`, `descricaoNoFabricante` | String? | no fabricante de fato (B1_XCOD/B1_XXDESC) |
| `produtoAllia` | Boolean? | B1_XALLIA: 1=Sim/2=Não; nulo = não informado |
| `dadosTecnicos` | String? | 🔴 uso não detalhado neste módulo |
| `qtdEmbalagem`, `peso`, `ultimoPreco` | Float? | `ultimoPreco` nunca é lido por `ProdutoParaAgenteService` (ver segurança) |
| `exibirFotoOrcamento` | Boolean | default `false`; é config de exibição, não campo do produto para a IA |
| `ativo` | Boolean | default `true` |
| `regraDescontoId` | String? | FK `RegraDesconto` (SZ0); leitura apenas — só o ERP grava |
| `observacao` | String? | |

`@@unique([empresaId, chave])`. Relações: `estoques`, `tabelasPrecoItens`,
`notasSaidaItens`, `notasEntradaItens`, `orcamentoItens`, `sugestoesCompra`, `fotos`,
`camposValores` (módulo `produto-campos`), `relacionados`/`relacionadoDe`
(`ProdutoRelacionado`, duas pontas), `equipamentoComodato`, `comodatoEnviosErp`,
`comodatoBaixas`, `fichas`.

### `ProdutoFoto` (tabela `produto_fotos`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `produtoId` | String? | nulo = foto importada em lote sem correspondência, pendente de vínculo manual |
| `url` | String | caminho público; `onDelete: Cascade` do produto |
| `nomeArquivo` | String | nome original, sanitizado (`basename`, máx. 255) |
| `principal` | Boolean | default `false`; só uma por produto (gerenciado em código, não em constraint) |
| `ordem` | Int | default `0` |

### `ProdutoFicha` (tabela `produto_fichas`) 🟢

PDF do fabricante + Markdown extraído. Vários documentos por produto (ficha, FISPQ,
certificado).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `produtoId` | String | `produto` com `onDelete: Cascade` |
| `arquivo` | String | nome em disco (UUID + extensão); nunca o nome original |
| `arquivoNome`, `mime`, `tamanho` | | metadados do upload original |
| `titulo` | String | máx. 200 (contrato) |
| `markdown` | String | editável na tela; máx. 200.000 (contrato) |
| `visivelAgente` | Boolean | default `true`; `false` tira a ficha do alcance da IA sem apagar |
| `deletedAt`/`deletedBy` | | soft delete; remove o PDF do disco junto (serviço) |

### `ProdutoFichaTrecho` (tabela `produto_ficha_trechos`) 🟢

Pedaço indexável de uma ficha, com o vetor que o representa.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `fichaId` | String | `ficha` com `onDelete: Cascade` |
| `produtoId` | String | desnormalizado da ficha — evita join extra na busca |
| `ordem` | Int | posição do trecho na ficha |
| `texto` | String | sempre o que foi gravado, mesmo sem vetor |
| `embedding` | `Unsupported("vector(768)")?` | dimensão fixa (nomic-embed-text/Ollama); nulo até vetorizar; tipo `Unsupported` — lido/escrito por SQL cru |
| `modelo` | String? | qual modelo gerou o vetor, para reindexar seletivamente ao trocar de modelo |

### `ProdutoFichaImportacao` (tabela `produto_ficha_importacoes`) 🟢

Fila de PDFs em processamento. Vínculo pelo **conteúdo**, não pelo nome do arquivo.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `arquivo`, `arquivoNome`, `mime`, `tamanho` | | metadados do upload |
| `situacao` | enum `FichaImportacaoSituacao` | `pendente` (default) / `processando` / `vinculada` / `sem_correspondencia` / `ambiguo` / `erro` |
| `codigoDetectado`, `nomeDetectado`, `titulo`, `markdown` | String? | o que o modelo leu — gravado mesmo quando não casa com nada, para explicar a pendência |
| `produtoId`, `fichaId` | String? | preenchidos só quando a importação vincula e grava |
| `erro` | String? | mensagem truncada a 500 chars, só quando `situacao = erro` |
| `tentativas` | Int | default `0`; 3 tentativas e desiste |
| `processadoEm` | DateTime? | |

### `ProdutoRelacionado` (tabela `produto_relacionados`) 🟢

Similar (simétrico) ou aplicação (direcional) entre dois produtos. Nada aqui vem do ERP.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `produtoId`, `relacionadoId` | String | FK `Produto`, `onDelete: Cascade` nos dois lados |
| `tipo` | enum `ProdutoRelacaoTipo` | `similar` / `aplicacao` |
| `observacao` | String? | máx. 200 (contrato); "por que estão relacionados" |
| `ordem` | Int | default `0` |

`@@unique([empresaId, produtoId, relacionadoId, tipo])`. Índice adicional por
`[empresaId, relacionadoId, tipo]` — a consulta pela ponta de destino ("em que
equipamentos este químico é usado") é tão comum quanto pela de origem.

### DTOs principais (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `ProdutoCreate`/`ProdutoUpdate` | `codigoErp`, `descricao`, `unidade?`, `categoriaId?`, `subCategoriaId?`, `armazemId?`, `marca?`, `codigoBarras?`, `codigoFornecedor?`, `ncm?`, `qtdEmbalagem?`, `peso?`, `ultimoPreco?`, `observacao?`, `ativo` | `Update` = `Create.partial()`; strings vazias do form viram `null` no service (`limpar`) |
| `ProdutoQuery` | paginação + `ativo?`, `regraDescontoId?`, `categoriaIds?`/`categoriaId?`, `fabricanteIds?`, `subCategoriaId?`, `armazemId?`, `categoriaAtiva?`, `search?`, `sortBy?`/`sortOrder?` | `categoriaIds`/`fabricanteIds` aceitam csv ou repetido, máx. 100 |
| `ProdutoFotoVincular` | `produtoId: uuid` | |
| `ProdutoFotoCriterio` (enum) | `codigo_erp` / `codigo_fornecedor` / `manual` | query string da importação de fotos |
| `ProdutoRelacionadoCriar` | `relacionadoId: uuid`, `tipo`, `observacao?`, `ordem` (default `0`) | |
| `ProdutoFichaAtualizar` | `titulo?`, `markdown?`, `visivelAgente?` | todos opcionais (patch parcial) |
| `FichaImportacaoVincular` | `produtoId: uuid` | decisão manual de PDF ambíguo/sem correspondência |

---

## Módulo `produto-campos`

### `ProdutoCampo` (tabela `produto_campos`) 🟢

Definição de um campo complementar — o cadastro de quais dados extras a empresa quer
guardar.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `chave` | String | identificador estável (`^[a-z0-9]+(-[a-z0-9]+)*$`); referenciado pela IA/integrações; `@@unique([empresaId, chave])`; nunca editável depois de criado |
| `nome` | String | rótulo exibido, editável |
| `tipo` | enum `ProdutoCampoTipo` | `texto` (default) / `texto_longo` / `numero` / `booleano` / `data` / `lista`; travado se já houver valor preenchido |
| `unidade` | String? | só rótulo ("mm", "kg", "L") — sem conversão |
| `opcoes` | String[] | default `[]`; só relevante quando `tipo = lista` |
| `grupo` | String? | agrupamento na tela; nulo cai num grupo geral |
| `ajuda` | String? | texto de apoio a quem preenche |
| `ordem` | Int | default `0` |
| `obrigatorio` | Boolean | default `false` |
| `visivelAgente` | Boolean | default `true`; recorte do que a IA pode citar |
| `ativo` | Boolean | default `true`; desativar some da tela sem apagar valores |
| `deletedAt`/`deletedBy` | | soft delete; não remove `ProdutoCampoValor` |

### `ProdutoCampoValor` (tabela `produto_campo_valores`) 🟢

Valor de um campo complementar num produto. Sempre texto, em formato canônico (número com
ponto decimal, booleano `"true"`/`"false"`, data `AAAA-MM-DD`) — conversão de exibição é
responsabilidade de quem lê, a partir do `tipo` da definição.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `produtoId`, `campoId` | String | `produto`/`campo` com `onDelete: Cascade` |
| `valor` | String | formato canônico; ausência de linha = não preenchido |

`@@unique([empresaId, produtoId, campoId])` — chave do `upsert` em `gravarValores`.

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `ProdutoCampoCreate` | `chave`, `nome`, `tipo` (default `texto`), `unidade?`, `opcoes` (default `[]`, máx. 50), `grupo?`, `ajuda?`, `ordem` (default `0`), `obrigatorio` (default `false`), `visivelAgente` (default `true`), `ativo` (default `true`) | `.refine`: `tipo='lista'` exige `opcoes.length > 0` |
| `ProdutoCampoUpdate` | mesmos campos exceto `chave` (imutável), todos opcionais | mesmo `.refine` de lista |
| `ProdutoCampoValor` (leitura) | `campoId`, `chave`, `nome`, `tipo`, `unidade`, `opcoes`, `grupo`, `ajuda`, `obrigatorio`, `valor?` | é a definição + o valor do produto, combinados |
| `ProdutoCamposGravar` | `valores: { campoId: uuid, valor: string \| null }[]` (máx. 200) | `valor` nulo/vazio apaga o preenchimento |

---

## Módulo `cliente-campo-config`

### `ClienteCampoConfig` (tabela `cliente_campo_config`) 🟢

Uma linha por campo travado — campo sem linha é editável por default.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `campo` | String | nome do campo (um dos `CAMPOS_CLIENTE_CONFIGURAVEIS`); não é enum no banco |
| `editavel` | Boolean | default `true` |

`@@unique([empresaId, campo])` — chave do `upsert` em `atualizar`.

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `ClienteCampoConfigItem` | `campo` (enum dinâmico `CAMPOS_CLIENTE_CONFIGURAVEIS`), `editavel: boolean` | |
| `ClienteCamposConfigUpdate` | `campos: ClienteCampoConfigItem[]` (mín. 1) | payload do `PATCH /clientes-config/campos` |
| `ClienteCamposConfig` (leitura) | `Record<string, boolean>` | mapa campo → editável, resposta do `GET /clientes-config/campos` |

---

## Módulo `estoque`

### `Estoque` (tabela `estoques`) 🟢

Espelho read-only do ERP — sem create/update manual, dados entram só pelo import.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `produtoId`, `armazemId` | String | FK |
| `codigoErp` | String | |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])` |
| `saldo` | Float | default `0` |
| `disponivel` | Float? | `SaldoSB2()` do Protheus — o que dá para vender; nulo = enviado antes de existir |
| `reserva`, `custo`, `ultimoPreco` | Float? | |
| `ultimaCompra` | DateTime? (`@db.Date`) | |
| `dataEnvio` | DateTime | default `now()`; carimbo do import |

`@@unique([empresaId, produtoId, armazemId])` e `@@unique([empresaId, chave])`.

### `Armazem` (tabela `armazens`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `codigoErp` | String | |
| `chave` | String? | chave de integração; `@@unique([empresaId, chave])` |
| `descricao` | String | |
| `ativo` | Boolean | default `true` |
| `revenda` | Boolean | default `true`; marca `MV_BJAPI16` do Protheus — só estoque de armazém `revenda=true` conta na plataforma |

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `EstoqueQuery` | paginação + `armazemId?`, `categoriaId?`, `comSaldo?` | `sortBy` aceita `'categoria'`/`'codigoErp'`/`'descricao'`/`'saldoTotal'` (não tipado no schema — tratado no service) |
| `EstoqueProdutoResumo` (leitura) | `id`, `codigoErp`, `descricao`, `unidade`, `categoria`, `saldoTotal`, `reservaTotal`, `qtdArmazens`, `ultimaCompra`, `ativo` | linha da listagem — agregado por produto |
| `EstoqueSaldoArmazem`/`EstoqueDetalhe` (leitura) | `Estoque` sem `produtoId` + `armazem` ref | detalhe aberto por armazém |

---

## Módulo `estrutura`

### `Modulo` (tabela `modulos`) 🟢

Catálogo global — sem `empresaId`, sem RLS. Só `PlatformAdminGuard` grava.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `nome` | String | 2–80 chars (contrato) |
| `icone` | String? | nome de ícone lucide-react |
| `ordem` | Int | default `0` |
| `ativo` | Boolean | default `true`; inativo = oculto do menu globalmente |
| `disponivelTelaPequena` | Boolean | default `true` |

Relações: `menus`, `ativacoes` (`EmpresaModulo`), `planos` (`PlanoModulo`).

### `Menu` (tabela `menus`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `moduloId` | String | FK `Modulo` |
| `menuPaiId` | String? | auto-referência (`MenuSubmenu`); hierarquia de no máx. 2 níveis (validado em código) |
| `nome` | String | 2–80 chars |
| `icone`, `rota` | String? | |
| `ordem` | Int | default `0` |
| `ativo` | Boolean | default `true` |
| `disponivelTelaPequena` | Boolean | default `true` |

Relações: `modulo`, `menuPai`/`submenus`, `rotinas`, `ativacoes` (`EmpresaMenu`), `planos`
(`PlanoMenu`).

### `Rotina` (tabela `rotinas`) 🟢

Funcionalidade permissionável — `codigo` é a chave usada em `@RequirePermission`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `menuId` | String | FK `Menu` |
| `nome` | String | 2–80 chars |
| `codigo` | String | regex `^[a-z0-9._-]+$`, 2–60 chars; identificador do RBAC (ex.: `clientes`, `produtos-campos`) |
| `ativo` | Boolean | default `true`; inativa não pode receber permissões |
| `disponivelTelaPequena` | Boolean | default `true` |

### `EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina` (tabelas `empresa_modulos`/`empresa_menus`/`empresa_rotinas`) 🟢

O outro lado do catálogo: liga/desliga **por empresa**. Mesma forma nas três.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `moduloId`/`menuId`/`rotinaId` | String | FK |
| `ativo` | Boolean | default `true`; **ausência de linha = ligado** (ver code-analysis 3.1) |

`@@unique([empresaId, moduloId\|menuId\|rotinaId])` — chave do upsert.

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `ModuloCreate`/`ModuloUpdate` | `nome`, `icone?`, `ordem`, `ativo`, `disponivelTelaPequena` | `Update` = `Create.partial()` |
| `MenuCreate`/`MenuUpdate` | `moduloId`, `menuPaiId` (default `null`), `nome`, `icone?`, `rota?`, `ordem`, `ativo`, `disponivelTelaPequena` | |
| `RotinaCreate`/`RotinaUpdate` | `menuId`, `nome`, `codigo` (regex), `ativo`, `disponivelTelaPequena` | |
| `EmpresaEstruturaToggle` | `ativo: boolean` | payload do liga/desliga por empresa (módulo e menu) |

---

## Módulo `fornecedores`

### `Fornecedor` (tabela `fornecedores`) 🟢

Espelho read-only do ERP — cadastro entra e sai só por `/integracao/fornecedores`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `codigoErp` | String? | informativo |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])`; é o que o upsert do import casa |
| `tipoPessoa` | enum `TipoPessoa` | `juridica` (default) / `fisica` |
| `razaoSocial` | String | obrigatório |
| `nomeFantasia`, `cnpjCpf`, `inscricaoEstadual`, `inscricaoMunicipal` | String? | |
| `contato`, `email`, `telefone`, `celular` | String? | |
| `endereco`, `complemento`, `bairro`, `municipio`, `uf`, `cep` | String? | endereço |
| `observacao` | String? | |
| `ativo` | Boolean | default `true` |

Relações: `notasEntrada`, `notasEntradaItens`, `notasSaida`, `produtos` (como
fabricante — ver módulo `produtos`).

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `FornecedorQuery` | paginação (inclui `search` genérico) + `ativo?`, `uf?` (máx. 2 chars) | `search` vem de `paginationQuerySchema` (busca textual livre) |
| `Fornecedor` (leitura) | espelha a tabela inteira (sem `chave`, que fica interno à integração) | |

---

## Módulo `notas-entrada`

### `NotaEntrada` (tabela `notas_entrada`) 🟢

Espelho read-only da SF1 — cabeçalho da nota de compra; entra e sai só por
`/integracao/notas-entrada`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `codigoErp` | String? | informativo |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])` — é o que o upsert do import casa |
| `fornecedorId` | String? FK `Fornecedor` | preenchido quando `tipo` ≠ `'D'` |
| `clienteId` | String? FK `Cliente` | preenchido quando `tipo` = `'D'` (devolução de venda) |
| `condicaoPagamentoId` | String? FK `CondicaoPagamento` | |
| `numero` | String | obrigatório |
| `serie`, `especieFiscal` | String? | |
| `tipo` | String? | `'N'` compra · `'D'` devolução de venda — só um dos dois lados (fornecedor/cliente) vem preenchido |
| `dtEmissao` | DateTime? (date) | data do documento do fornecedor; alimenta `ano`/`mes` (casa com a apuração de venda, que também usa emissão) |
| `dtEntrada` | DateTime? (date) | data de recebimento da mercadoria; raramente coincide com `dtEmissao` |
| `ano`, `mes` | Int? | derivados de `dtEmissao` |
| `vlrBruto`, `vlrMercadoria`, `vlrItens`, `vlrDesconto` | Float | default `0` |
| `vlrIcms`, `vlrIcmsSt` (F1_ICMSRET), `vlrIpi` | Float | default `0` |
| `vlrFrete`, `vlrSeguro`, `vlrDespesa` | Float | default `0`; mantidos separados (espelham a SF1) em vez de um "outras despesas" agregado, para permitir conferência contra o documento do fornecedor |
| `chaveNfe` | String? | chave da NF-e |
| `dtNfe` | DateTime? (date) | |
| `mensagem` | String? | |
| `comodato` | Boolean | default `false`; marcado pela integração quando todos os itens vivos têm CFOP 1909/2909 (retorno de comodato) — o ERP não informa isso diretamente |
| `ativo` | Boolean | default `true` |
| `duplicata` | String? | F1_DUPL — número da duplicata gerada |
| `geraDuplicata` | Boolean? | `true`/`false` = ERP informou; `null` = integração ainda não mandava o campo (campo adicionado 2026-10-13, ver commit `F1_DUPL`) |

Índices: `@@unique([empresaId, chave])`; `[empresaId, codigoErp]`; `[empresaId, numero]`;
`[empresaId, fornecedorId]`; `[empresaId, dtEmissao]`; `[empresaId, ano, mes]`;
`[empresaId, clienteId, dtEmissao]` (atende a aba Devoluções da Posição de Cliente —
um cliente, notas `'D'` dele, mais recente primeiro).

### `NotaEntradaItem` (tabela não mapeada por `@@map` explícito no trecho lido — FK `notaEntradaId`) 🟢

Item da nota, com `empresaId`/`fornecedorId`/`clienteId`/`dtEmissao`/`ano`/`mes`
denormalizados do cabeçalho (mesma decisão de `NotaSaidaItem`): a apuração por produto
varre a tabela de itens, e um join com o cabeçalho em cima da maior tabela do módulo
custaria caro à toa. Não tem `ncm` — vem de `Produto.ncm` (B1_POSIPI), para não duplicar
o dado.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `notaEntradaId` | String | FK |
| `chave` | String? | chave de integração (X2_UNICO), única dentro do cabeçalho — o upsert casa item a item por ela, em vez de apagar/recriar o conjunto |
| `fornecedorId`, `clienteId` | String? | espelham o participante do cabeçalho |
| `produtoId`, `armazemId` | String? | `armazemId` pode ficar nulo se o código do ERP não existir na plataforma — decisão de negócio (28/09/2026): não recusa a nota inteira por um `D1_LOCAL` digitado errado |
| `item` | Int? | número do item na nota |
| `dtEmissao`, `ano`, `mes` | — | denormalizados do cabeçalho |
| `cfop` | String? | 1909/2909 = retorno de comodato (ver `NotaEntrada.comodato`) |
| `quantidade`, `vlrUnitario`, `vlrDesconto`, `vlrTotal` | Float | default `0` |
| `vlrIcms`, `vlrIcmsSt`, `vlrIpi` | Float | default `0` |
| `aliqIpi`, `aliqIcms` | Float? | alíquotas do item (D1_IPI, D1_PICM) em %; nulas até a integração mandar (desde 2026-10-13) |
| `peso` | Float? | |
| `comodato` | Boolean | default `false`; calculado por item a partir do CFOP (`itemEhComodato`) |
| `ativo` | Boolean | default `true` |

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `NotaEntradaQuery` | paginação + `ativo?`, `fornecedorId?`, `clienteId?`, `tipo?` (máx. 10 chars), `ano?`, `mes?` (1–12) | sem `search` tipado explícito no schema — tratado como string livre no service |
| `NotaEntrada` (leitura) | espelha a tabela, sem campos de NF-e de saída (`situacaoNfe`/`protocoloNfe`/`temXml`) — o documento de entrada foi emitido por terceiro, a plataforma não reimprime segunda via | |
| `NotaEntradaItem` (leitura) | espelha a tabela do item | |

---

## Módulo `notas-saida`

### `NotaSaida` (tabela `notas_saida`) 🟢

Espelho read-only da SF2 — cabeçalho da nota de venda; entra e sai só por
`/integracao/notas-saida` (módulo irmão, não analisado nesta passada). É o único dos dois
(venda/compra) com 2ª via de documento fiscal (DANFE/XML) — a nota de entrada foi emitida
por terceiro, a plataforma não reimprime.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `codigoErp` | String? | informativo |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])` — o que o upsert do import casa |
| `clienteId` | String? FK `Cliente` | nulo na devolução de compra (`tipo = 'D'`) |
| `fornecedorId` | String? FK `Fornecedor` | só preenchido na devolução de compra — espelho invertido de `NotaEntrada.clienteId` |
| `vendedorId` | String? FK `Vendedor` | quem efetivamente fez a venda (exibido na tela); **não** é o que decide quem enxerga a nota — ver `Cliente.vendedorId` e §3.1 do code-analysis |
| `condicaoPagamentoId` | String? FK `CondicaoPagamento` | |
| `numero` | String | obrigatório |
| `serie`, `especieFiscal` | String? | |
| `tipo` | String? | `'D'` = devolução de compra (destinatário é fornecedor); apurações de venda filtram tipo ≠ `'D'` |
| `dtEmissao` | DateTime? (date) | alimenta `ano`/`mes` |
| `ano`, `mes` | Int? | derivados de `dtEmissao` |
| `vlrBruto`, `vlrMercadoria`, `vlrItens`, `vlrDesconto` | Float | default `0` |
| `vlrIcms`, `vlrIpi`, `vlrFrete`, `vlrDevolucao` | Float | default `0` |
| `chaveNfe` | String? | chave de acesso da NF-e (44 dígitos) |
| `dtNfe` | DateTime? (date) | |
| `mensagem` | String? | |
| `comodato` | Boolean | default `false`; todos os itens vivos com CFOP 5908/6908, ou o ERP informou |
| `ativo` | Boolean | default `true` |
| `duplicata` | String? | F2_DUPL — número da duplicata gerada pela nota |
| `geraDuplicata` | Boolean? | `true`/`false` = ERP informou; `null` = integração anterior ao campo (cai no critério antigo: condição de pagamento) — é o que decide se a nota conta como venda nas análises (nota sem duplicata pode ser remessa em comodato, bonificação, transferência) |
| `xmlRecebidoEm` | DateTime? | não-nulo = "tem 2ª via?" sem tocar no XML (ver `comFlagXml`); metadado curto que a tela usa, propositalmente fora da tabela acessória |
| `protocoloNfe` | String? | protocolo de autorização (infProt/nProt) |
| `situacaoNfe` | String? | `"autorizada"` \| `"cancelada"` \| `"denegada"`, como veio do ERP |

Índices: `@@unique([empresaId, chave])`; `[empresaId, codigoErp]`; `[empresaId, numero]`;
`[empresaId, vendedorId, ano, mes]`; `[empresaId, clienteId]`; `[empresaId, fornecedorId]`;
`[empresaId, dtEmissao]`.

**Nota de design:** o XML autorizado **não** é coluna de `NotaSaida` — vive em
`NotaSaidaXml` à parte, porque o Prisma traz todas as colunas quando a consulta não tem
`select` explícito, e tanto a listagem paginada quanto a Posição de Cliente (que carrega o
histórico inteiro sem paginar) fariam toda abertura de tela arrastar megabytes de XML. O
DANFE também **não é cacheado** — é sempre renderizado sob demanda a partir do XML
(cachear um PDF barato de refazer só criaria risco de layout desatualizado).

### `NotaSaidaXml` (tabela `nota_saida_xml`) 🟢

Tabela acessória 1:1 com `NotaSaida` (`notaSaidaId` único, `onDelete: Cascade`). Um XML
por nota — reenvio do ERP substitui o anterior (a nota autorizada é uma só; versionar um
documento fiscal corrigido só criaria dúvida sobre qual vale).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `notaSaidaId` | String | FK; `notaSaidaId` único |
| `conteudo` | String (TEXT) | o XML completo; Postgres TOAST comprime automaticamente (~5–8x em XML), sem compressão em código |
| `tamanhoBytes` | Int | tamanho do que foi recebido — tela de operação confere sem ler o XML inteiro |
| `recebidoEm` | DateTime | default `now()` |
| `recebidoPor` | String? | chave de API da integração que enviou |

Índice: `[empresaId, recebidoEm]`.

### `NotaSaidaItem` (tabela `notas_saida_itens`) 🟢

Item de nota com `empresaId`/`clienteId`/`vendedorId`/`produtoId`/`dtEmissao`/`ano`/`mes`
denormalizados do cabeçalho (mesma decisão de `NotaEntradaItem`): viabiliza a tela própria
de itens com RLS e escopo sem join na nota, e alimenta a Sugestão de Compra (índice
dedicado) e a apuração por produto sem varrer o cabeçalho.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `notaSaidaId` | String | FK |
| `chave` | String? | chave de integração (X2_UNICO), única dentro do cabeçalho (`@@unique([notaSaidaId, chave])`) — upsert casa item a item, não apaga/recria o conjunto |
| `clienteId`, `vendedorId`, `produtoId` | String? | espelham o participante/vendedor/produto do cabeçalho |
| `item` | Int? | número do item na nota |
| `dtEmissao`, `ano`, `mes` | — | denormalizados do cabeçalho |
| `cfop` | String? | 5908/6908 = remessa de comodato (ver `NotaSaida.comodato`) |
| `tipo` | String? | espelha o tipo do cabeçalho |
| `quantidade`, `vlrUnitario`, `vlrDesconto`, `vlrTotal` | Float | default `0` |
| `vlrTabela` | Float? | preço de tabela antes do desconto |
| `percDesconto` | Float? | percentual de desconto aplicado |
| `quantidadeDev`, `vlrDev` | Float? | quantidade/valor devolvido deste item (devolução de venda — distinto do cabeçalho `tipo='D'`, que é devolução de *compra*) |
| `peso` | Float? | |
| `comodato` | Boolean | default `false`; calculado por item a partir do CFOP |
| `ativo` | Boolean | default `true` |
| `percComissao` | Float? | percentual de comissão apurado pela regra de desconto; nulo = ainda não apurado. Ocultado da resposta da API quando `COMISSAO_OCULTA_PARA_TODOS` está ligado e o usuário não pode ver comissão (`ocultarComissaoDosItens`) |
| `regraDescontoId` | String? FK `RegraDesconto` | regra de desconto aplicada (SZ0 do ERP); nulo = sem regra própria |

Índices: `[notaSaidaId]`; `[empresaId, produtoId]`; `[empresaId, vendedorId, dtEmissao]`;
`[empresaId, regraDescontoId]`; `[empresaId, clienteId, produtoId]` (Sugestão de Compra).

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `NotaSaidaQuery` | paginação + `ativo?`, `clienteId?`, `vendedorId?`, `comodato?`, `tipo?` (máx. 10 chars), `devolucao?` (bool), `ano?`, `mes?` (1–12) | `devolucao`: `true` = só tipo `'D'`; `false` = exclui tipo `'D'`; ausente = todas (ver §3.2 do code-analysis) |
| `NotaSaida` (leitura) | espelha a tabela + `temXml: boolean` calculado (`comFlagXml`, não persistido) | inclui campos de NF-e de saída que `NotaEntrada` não tem (`situacaoNfe`/`protocoloNfe`/`temXml`) |
| `NotaSaidaItem` (leitura) | espelha a tabela do item, incluindo `percComissao` (opcional) e os campos de vínculo de `RegraDesconto` | |

### Estruturas internas de `nfe-xml.ts` (não persistidas) 🟢

Tipos usados só na extração do XML para o DANFE — não são tabela, não são DTO de API:

| Tipo | Campos principais | Observação |
|---|---|---|
| `NoXml` | `nome`, `atributos`, `filhos`, `texto` | nó genérico da árvore que `lerXml` produz a partir do XML bruto |
| `NfeDados` | `chave`, `numero`, `emitente`/`destinatario` (`NfeParte`), `itens` (`NfeItem[]`), `duplicatas`, `totais`, `transporte`, `issqn`, `cancelada`, `protocolo` | "o que o DANFE precisa do XML — nem mais, nem menos" (comentário no código) |
| `NfeItem` | `codigo`, `descricao`, `ncm`, `cst`, `cfop`, `unidade`, `quantidade`, `valorUnitario`, `valorTotal`, bases/valores/alíquotas de ICMS e IPI | `cst` concatena `orig` + (`CST` ou `CSOSN`, conforme o regime tributário do item) |
| `NfeParte` | `nome`, `fantasia`, `documento` (CNPJ ou CPF), `inscricaoEstadual`, `inscricaoEstadualSt`, `inscricaoMunicipal`, `endereco` | usado para emitente e destinatário |

---

## Módulo `sugestao-compra`

### `SugestaoCompraGerada` (tabela `sugestoes_compra`) 🟢

O resultado **gravado** do motor — o que `calculadaDoCliente`/a aba "Visualizar" leem.
Uma linha por produto sugerido a um cliente; `gerarLote`/`gerarParaCliente` apagam e
recriam por cliente a cada rodada (nunca `update`).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `clienteId`, `produtoId` | String | FK; `cliente` com `onDelete: Cascade` |
| `origem` | enum `OrigemSugestaoCompra` (`local` \| `ia`) | hoje só `local` é gravado (motor determinístico) — `ia` existe no schema mas sem produtor neste módulo (ver `anonimizar.ts`, code-analysis §3.8) |
| `ordem` | Int | posição de exibição (1 = mais relevante) |
| `score` | Float? | `clientes / total` da referência (§3.4 do code-analysis) |
| `motivo` | String? | frase pronta para a tela ("N de M clientes do mesmo ramo... compram este produto") |
| `modelo` | String? | reservado para quando `origem = 'ia'` registrar qual modelo gerou — não preenchido hoje |
| `loteId` | String | agrupa as linhas de uma mesma rodada (`randomUUID()` por chamada de `gerarLote`/`gerarParaCliente`) |
| `geradaEm` | DateTime | default `now()` |

Índices: `@@unique([clienteId, produtoId, origem])` — upsert natural por recálculo;
`[empresaId, clienteId, origem, ordem]` (leitura ordenada por cliente);
`[empresaId, loteId]` (auditoria de uma rodada).

### `SugestaoCompraExecucao` (tabela `sugestao_compra_execucoes`) 🟢

Acompanhamento do "Calcular" em lote, que roda em segundo plano (§3.7 do code-analysis).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `usuarioId` | String | quem disparou |
| `situacao` | enum `SituacaoExecucaoSugestao` (`rodando` \| `concluida` \| `falhou`) | default `rodando` |
| `parametros` | Json? | `meses`/`clienteCodigoDe`/`clienteCodigoAte` do pedido |
| `resultado` | Json? | `clientesProcessados`/`clientesComSugestao`/`sugestoesGravadas`, só quando concluída |
| `erro` | String? | mensagem truncada em 1000 chars quando falhou |
| `iniciadaEm`, `concluidaEm` | DateTime | `concluidaEm` nulo enquanto roda |

Índice: `[empresaId, iniciadaEm]`. **Uma execução `rodando` por empresa** garantida por
índice parcial único da migration `20260930190000_sugestao_compra_execucoes` (não
reforçado em código — a checagem do service existe só para devolver 409 amigável antes do
banco rejeitar).

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `SugestaoCompraQuery` | `meses` (1–60, default 12), `limite` (1–50, default 10), `semelhantes` (3–100, default 30), `baseSemelhanca` (`ambos`\|`cesta`\|`cnae`), `afinidadeCnae` (`hierarquica`\|`exata`) | parâmetros da consulta ao vivo (`paraCliente`) |
| `SugestaoCompraResultado` | `clienteId`, `razaoSocial`, `produtosNaCesta`, `cnaes[]`, `clientesSemelhantes[]`, `sugestoes[]`, `aviso` | `aviso` não-nulo = diagnóstico de por que não há sugestão (cliente inelegível, sem cesta, sem semelhante...) em vez de lista vazia muda |
| `ClienteSemelhante` | `clienteId` (string, não uuid — pode vir `''`), `razaoSocial`, `codigoErp`, `municipio`, `uf`, `score`, `indiceCesta`, `cnaesEmComum`, `nivelCnae`, `naCarteira`, `mesmoCnaePrincipal`, `mesmaRegiao`, `produtosEmComum` | campos de identificação ficam vazios/nulos quando `naCarteira = false` (ver code-analysis §3.2) |
| `ProdutoSugerido` | `produtoId`, `codigoErp`, `descricao`, `score`, `semelhantesQueCompram`, `totalSemelhantes`, `cobertura`, `valorMedio`, `ultimaCompraNoGrupo`, `precoTabelaCliente`, `evidencia[]` | `evidencia` só nomeia clientes da carteira do usuário |
| `SugestaoCompraListQuery` | paginação + `ativo?`, `uf?`, `municipio?`, `vendedorId?`, `bloqueado?` | consulta da listagem administrativa |
| `SugestaoCompraListRow` | `id`, `codigoErp`, `razaoSocial`, `municipio`, `uf`, `ativo`, `bloqueado`, `ultimoCalculo`, `qtdSugestoes` | uma linha por cliente, não por produto |
| `SugestaoCompraCalculada` / `SugestaoCompraCalculadaItem` | cliente + itens gravados (`produtoId`, `ordem`, `score`, `motivo`, `origem`, `geradaEm`, `precoTabelaCliente`) | preço é recalculado na leitura (tabela atual), não o do momento do cálculo |
| `SugestaoCompraGerarClienteBody` | `meses?` (1–60) | corpo de `POST .../gerar` (1 cliente) |
| `SugestaoCompraGerarLoteBody` | `meses?`, `clienteCodigoDe?`, `clienteCodigoAte?` | corpo de `POST /sugestao-compra/gerar` (lote) |
| `SugestaoCompraExcluirBody` | `clienteCodigoDe?`, `clienteCodigoAte?` (sem `meses`) | corpo de `POST /sugestao-compra/excluir` |
| `SugestaoCompraExcluirResultado` | `clientes`, `sugestoesExcluidas` | contadores do que foi apagado |
| `SugestaoCompraGerarResultado` | `loteId`, `clientesProcessados`, `clientesComSugestao`, `sugestoesGravadas`, `aviso?` | resultado síncrono de `gerarParaCliente`/`gerarLote` |
| `SugestaoCompraExecucao` | `id`, `situacao`, `iniciadaEm`, `concluidaEm`, `usuarioNome`, `resultado`, `erro` | o que `GET /sugestao-compra/execucoes/ultima` devolve |

### Estruturas internas de `anonimizar.ts` (não persistidas) 🟢

| Tipo | Campos | Observação |
|---|---|---|
| `ClienteParaAnonimizar` | `id`, `codigoErp`, `razaoSocial?`, `nomeFantasia?`, `cnpjCpf?`, `municipio?`, `uf?`, `limiteCredito?`, `cnaes[]`, `produtos[]` | entrada bruta, como sai do banco — contém propositalmente os campos que NÃO podem trafegar |
| `ClienteAnonimo` | `ref` (`"C0"`, `"C1"`...), `cnaes: string[]`, `produtos: string[]` | o que efetivamente é enviado à IA — só códigos |
| `PayloadAnonimo` | `alvo: ClienteAnonimo`, `comparaveis: ClienteAnonimo[]` | payload completo da consulta |

---

## Módulo `orcamentos`

### `Orcamento` (tabela `orcamentos`) 🟢

Proposta comercial — nasce na plataforma (diferente das notas, que são espelho do ERP).
Único módulo comercial com CRUD completo analisado até aqui.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `codigoErp` | String? | número do Pedido de Venda gerado a partir do orçamento aprovado; nulo até o ERP integrar, nulo para sempre no orçamento que não vira pedido |
| `chave` | String? | chave de integração (X2_UNICO); `@@unique([empresaId, chave])` |
| `numero` | Int? | número sequencial por empresa, visível desde o rascunho (ver `proximoNumeroOrcamento`, code-analysis §3.6); nulo no pedido vindo do ERP como histórico (`origem: 'erp'`), que mostra `codigoErp` no lugar (ver `numeroOrcamento()`) |
| `clienteId`, `vendedorId` | String | FK; `vendedorId` sempre herdado do cadastro do cliente (code-analysis §3.2) |
| `oportunidadeId` | String? FK `Oportunidade` | |
| `condicaoPagamentoId` | String? FK `CondicaoPagamento` | |
| `titulo` | String | |
| `status` | enum `StatusOrcamento` (`rascunho`/`enviado`/`aprovado`/`recusado`/`expirado`) | default `rascunho`; máquina de estado — ver code-analysis §3.4 |
| `origem` | enum `OrigemVenda` (`vendedor`/`superior`/`administrador`/`cliente`/`erp`) | default `vendedor`; quem de fato montou o orçamento — ver code-analysis §3.2. Histórico anterior a 02/09/2026 gravado como `vendedor` por padrão (não recuperável) |
| `dataValidade` | DateTime? (date) | ajustada para dia útil só na ponta final (`ajustarValidadeOrcamento`) |
| `dataRetorno` | DateTime? | ao ser definida/alterada, gera `Atividade` de follow-up (`criarAtividadeRetorno`) |
| `observacao` | String? | |
| `vlrTotal` | Float | default `0`; soma dos itens, recalculada a cada save |
| `ativo` | Boolean | default `true` |
| `situacaoErp` | enum `SituacaoErpOrcamento`? | gravada só pela integração (`PUT /integracao/pedidos`); nula até o ERP mandar o pedido pela 1ª vez |
| `situacaoErpEm` | DateTime? | |
| `comQuebra` | Boolean | default `false`; pedido no ERP difere do orçamento aprovado (item incluído/retirado, quantidade/preço diferente) — calculado comparando `itensErp` com os itens do orçamento (fora deste módulo) |
| `erroIntegracao` | String? | motivo da recusa do pedido pelo ERP (MATA410); orçamento recusado sai da fila de pendentes e fica assim — caminho é copiar (decisão 29/09/2026) |
| `erroIntegracaoEm` | DateTime? | |
| `notasErp` | Json? | `[{numero, serie, emissao}]` das notas do pedido |
| `itensErp` | Json? | `[{chave, produtoChave, quantidade, vlrUnitario, quantidadeEntregue}]` como o ERP mandou por último |
| `descontoSolicitadoEm`/`Por`, `descontoAutorizadoEm`/`Por` | DateTime?/String? | fluxo de autorização em duas etapas — ver code-analysis §3.3; zeradas quando os itens mudam |
| `clienteDecididoEm` | DateTime? | quando o cliente respondeu (aprovou/recusou) |
| `clienteDecididoPorContatoId` | String? FK `ClienteContato` | qual contato do cliente decidiu (relação nomeada `OrcamentoDecisaoContato`) |
| `clienteDecisao` | String? | |
| `clienteDecisaoObservacao` | String? | |

Índices: `@@unique([empresaId, chave])`; `@@unique([empresaId, numero])`;
`[empresaId, codigoErp]`; `[empresaId, vendedorId]`; `[empresaId, clienteId]`;
`[empresaId, status]`; `[empresaId, clienteDecididoPorContatoId]`.

### `OrcamentoItem` (tabela `orcamento_itens`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `orcamentoId`, `produtoId` | String | FK; `orcamento` com `onDelete: Cascade`, `produto` com `onDelete: Restrict` (não se apaga produto referenciado por orçamento) |
| `chave` | String? | chave de integração (X2_UNICO); nula no item criado pela tela (caso normal aqui — orçamento nasce na plataforma); `@@unique([orcamentoId, chave])` |
| `quantidade` | Float | default `1` |
| `vlrTabela` | Float? | preço da Tabela de Preço do cliente; `null` sem tabela aplicável/preço cadastrado — ver code-analysis §3.1 |
| `vlrUnitario` | Float | default `0`; informado pelo vendedor, preço praticado (líquido) |
| `percDesconto`, `vlrDesconto` | Float?/Float | calculados a partir de `vlrTabela` vs. `vlrUnitario`; `vlrDesconto` default `0` |
| `vlrTotal` | Float | default `0`; `vlrUnitario * quantidade` |
| `regraDescontoId` | String? FK `RegraDesconto` | regra aplicável resolvida (tabela de preço > produto > categoria > regra padrão); nulo = sem regra própria |
| `percComissao` | Float? | apurado a partir do `percComissao` base do vendedor + faixa da regra de desconto; `null` = sem percentual base cadastrado (não apurável), nunca `0` |

Índices: `[empresaId, produtoId]`; `[orcamentoId]`; `[empresaId, regraDescontoId]`.

### `OrcamentoConfig` (tabela `orcamento_config`) 🟢

Só o contador do número sequencial (code-analysis §3.6) — não confundir com o módulo
`orcamento-config` (pendente de análise), que pode ter regras de negócio adicionais sobre
orçamento além deste contador.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | `@unique` — uma linha por empresa |
| `ultimoNumero` | Int | default `0`; incrementado atomicamente por `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` (`proximoNumeroOrcamento`) |

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `OrcamentoCreate` | `clienteId`, `vendedorId` (sobrescrito pelo do cliente quando houver), `oportunidadeId?`, `condicaoPagamentoId?`, `titulo` (1–150), `status` (default `rascunho`), `dataValidade?`, `dataRetorno?`, `observacao?` (≤1000), `ativo` (default `true`), `itens[]` (default `[]`) | |
| `OrcamentoUpdate` | `OrcamentoCreate.partial()` | quando `itens` é enviado, substitui o conjunto inteiro (sem endpoint por linha) |
| `OrcamentoItemLinha` | `produtoId`, `quantidade` (inteiro positivo), `vlrUnitario` (≥0) | input de item — o resto (`vlrTabela`/`percDesconto`/`vlrDesconto`/`vlrTotal`) é calculado pelo servidor |
| `OrcamentoQuery` | paginação + `ativo?`, `status?`, `origem?`, `vendedorId?`, `clienteId?`, `oportunidadeId?`, `dataInicio?`, `dataFim?` (sobre `createdAt`, uso: tela de Agenda) | |
| `Orcamento` (leitura) | espelha a tabela | |
| `OrcamentoItem` (leitura) | espelha a tabela do item + `produto` embutido (evita segundo fetch no form) | |

### Funções/helpers compartilhados (não persistidos) 🟢

| Função | Arquivo | Observação |
|---|---|---|
| `situacaoIntegracaoOrcamento(o)` | `@plataforma/contracts` | deriva `SituacaoIntegracaoOrcamento` (`nao_enviado`/`aguardando`/`erro_integracao` + os valores de `SituacaoErpOrcamento`) combinando `status`, `chave`/`codigoErp`, `situacaoErp`, `erroIntegracao` — usada pela listagem e pela aba de integração |
| `podeExcluirOrcamento(o)` | `@plataforma/contracts` | `origem === 'erp'` nunca pode; senão, só `situacao === 'nao_enviado'` ou `'erro_integracao'` — ver code-analysis §6 |
| `numeroOrcamento(o)` | `@plataforma/contracts` | `numero` como string, ou `codigoErp` quando `numero` é nulo (pedido histórico do ERP) |
| `calcularComissaoItem(regra, percDesconto, percBaseVendedor)` | `@plataforma/contracts` | aplica a faixa da regra de desconto sobre o percentual base do vendedor — usado por `calcularItensOrcamento` |
