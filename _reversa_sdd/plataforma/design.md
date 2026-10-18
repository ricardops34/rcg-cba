# plataforma — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `plataforma`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Comportamento` | `Result` | 200 OK |
| `GET /consulta-cnpj/:cnpj` | `delega a `EnriquecimentoService.consultarCnpj` (módulo `clientes`)` | `Result` | 200 OK |
| `GET /empresas` | `paginada; filtros `situacao`, `apenasExpiradas`, `search` (razão, fantasia, CNPJ)` | `Result` | 200 OK |
| `POST /empresas` | `empresa + administrador (conta nova ou existente)` | `Result` | 200 OK |
| `PATCH /empresas/:id/situacao` | `situação, `testeExpiraEm`, `limiteUsuarios`, com `motivo` no log` | `Result` | 200 OK |
| `GET /contas?email=` | `existe conta com o e-mail? (a tela decide se pede nome e senha)` | `Result` | 200 OK |
| `GET /empresas/:id/administradores` | `contas com perfil Administrador Empresa vinculadas, e em quantas empresas cada uma está` | `Result` | 200 OK |
| `POST /empresas/:id/administradores` | `vincula conta existente como administradora` | `Result` | 200 OK |
| `DELETE /empresas/:id/administradores/:usuarioId` | `desativa o vínculo; recusa o último administrador` | `Result` | 200 OK |
| `GET /admins, POST /admins {email}, PATCH /admins/:usuarioId` | `lista, promove por e-mail, promove ou revoga` | `Result` | 200 OK |
| `GET /auditoria` | `log, filtrado por empresa e ação, mais recente primeiro` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Listagem com uso — RLS e N+1 consciente

`empresa.findMany` + `count` em paralelo. Uso (vínculos ativos e último login) **por
empresa, dentro de `withTenant`**: `usuario_empresas` tem RLS, e fora do contexto a
leitura volta **zero sem erro** (aconteceu na primeira versão: "0 usuários" para empresa
com dez). O N+1 é aceito (20 por página). `testeExpirado` usa o mesmo `podeAcessar` do
login, no servidor, para não divergir pelo fuso do navegador.

### 2. 3.2 `criarEmpresa` — empresa e primeiro administrador

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

### 3. 3.3 Administradores da empresa

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

### 4. 3.4 Administradores da plataforma

O perfil é da conta (migration `20260930230000_dados_do_usuario`). `definirAdmin`:
promover quem já é → no-op; revogar quem não é → no-op (sem sobrescrever o perfil real);
**recusa revogar a si mesmo** e **revogar o último**. Revogar devolve a conta para
"Administrador Empresa". O log leva a primeira empresa da conta (`withUsuario`).

### 5. 3.5 Alterar situação — um registro de log por campo

Atualiza só os campos enviados (Zod exige ao menos um). Grava `empresa.situacao_alterada`
(se mudou), `empresa.teste_alterado` e `empresa.limite_alterado` separados, com
`motivo` como sufixo — "quando esta empresa foi suspensa" acha-se direto.

### 6. 3.6 Achados

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

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`EnriquecimentoService (clientes)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/empresa/documento-empresa`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/empresa/situacao-empresa`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/empresa/limite-usuarios`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`bcryptjs`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/plataforma` | 🟢 |

## Estado Interno e Entidades

- **`PlataformaAuditoria`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

