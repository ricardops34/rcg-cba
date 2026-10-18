# empresas — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `empresas`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll(query, user?)` | `admin da plataforma vê todas; demais só as empresas do próprio grupo econômico (ou as vinculadas, se não for admin)` | `Result` | 200 OK |
| `findOneDoAtor(id, user)` | `valida escopo antes de devolver o detalhe (rota pública ao usuário logado)` | `Result` | 200 OK |
| `create / createDoAtor` | ``create` é uso interno (sem validação de ator); `createDoAtor` é o caminho da API — exige `isAdmin` ou `administradorPlataforma`` | `Result` | 200 OK |
| `update` | `remove campos exclusivos da plataforma do payload se o ator não for admin de plataforma` | `Result` | 200 OK |
| `setLogo / setLogoDanfe / setBanner` | `grava caminho do upload, remove arquivo anterior do disco (best-effort)` | `Result` | 200 OK |
| `remove` | `soft delete + `situacao: 'cancelada'`` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Escopo de acesso a empresas (`garantirEscopo`)

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

### 2. 3.2 Campos exclusivos da plataforma (`CAMPOS_DA_PLATAFORMA`)

`ePlataforma`, `situacao`, `testeExpiraEm`, `limiteUsuarios` são removidos do payload de
`update` antes de chegar ao Prisma, a menos que `user.administradorPlataforma === true`.
Comentário no código: um administrador de empresa que alcançasse esses campos "se
liberaria sozinho" — estenderia o próprio período de teste, sairia do estado suspenso ou
apagaria o próprio teto de usuários. Por isso a exclusão é feita no payload, não apenas
escondida na tela (reforço server-side).

### 3. 3.3 Criação de empresa dentro de um grupo (`createDoAtor`)

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

### 4. 3.4 Unicidade de alias (`ensureAliasDisponivel`)

Alias é a URL de login (`?empresa=<alias>`) e precisa ser único **na base inteira**
(modo sistema), não só no grupo/empresa — dois tenants não podem compartilhar a mesma
URL de entrada.

### 5. 3.5 Upload de logo/banner/logo-DANFE

Os três seguem o mesmo padrão: grava o novo caminho, e se havia um arquivo anterior,
tenta removê-lo do disco de forma best-effort (`unlink` sem `await`, erro ignorado) —
evita acumular arquivos órfãos sem bloquear a resposta em caso de falha na remoção.
`setBanner` não liga a faixa automaticamente — enviar a imagem e publicá-la
(`bannerAtivo`) são ações separadas, decisão explícita no comentário.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`garantirVagaDeEmpresa`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`validarDocumentoEmpresa`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`EnriquecimentoService (clientes)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/uploads`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/empresas` | 🟢 |

## Estado Interno e Entidades

- **`Empresa`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

