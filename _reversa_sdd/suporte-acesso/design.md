# suporte-acesso — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `suporte-acesso`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Permissão` | `Comportamento` | 200 OK |
| `GET /suporte-acesso/ativo` | `só JWT` | `liberação vigente (não revogada, `validoAte` futuro)` | 200 OK |
| `POST /suporte-acesso/conceder {motivo, duracaoHoras}` | ``empresa.editar`` | `revoga as vigentes e cria uma nova` | 200 OK |
| `POST /suporte-acesso/revogar/:id` | ``empresa.editar`` | `marca `revogadoEm`/`revogadoPorId`` | 200 OK |
| `GET /suporte-acesso/historico` | `só JWT` | `concessões, com quem concedeu e revogou` | 200 OK |
| `GET /suporte-acesso/logs` | `só JWT` | `as 500 ações mais recentes do suporte` | 200 OK |

## Fluxo Principal

### 1. 3.1 Concessão

`validoAte = agora + duracaoHoras`. Uma vigente por vez: conceder revoga as anteriores
ainda válidas (em transações separadas da criação).

### 2. 3.2 O guard global (`SuporteAcessoGuard`)

Para cada requisição: sem `request.user` → libera; usuário que não administra a
plataforma → libera; caminho começando com `/plataforma`, `/auth`, `/termos`,
`/tours` ou `/integracao` → libera; empresa ativa com `ePlataforma` → libera; senão
exige liberação vigente (403 com a mensagem "Solicite ao cliente a liberação…") e
grava o log da ação.

### 3. 3.3 Achados

- ✅ **Corrigido no lote de 2026-10-16** (virou interceptor, que roda depois do JwtAuthGuard). Achado original:
  🔴 **O guard não faz nada.** É registrado como `APP_GUARD` e guards globais rodam
  **antes** dos guards do controller; o `JwtAuthGuard` só existe nos controllers (o
  único outro global é o `ThrottlerGuard`). Quando o `SuporteAcessoGuard` roda,
  `request.user` ainda não existe, e a primeira linha devolve `true`. Nenhuma
  requisição é bloqueada e **nenhum log de suporte é gravado**, nunca (0 linhas em
  `empresa_suporte_logs` no dev e no dump da produção).
- ✅ **Corrigido no lote de 2026-10-16** (caminho sem o prefixo /api/v1). Achado original:
  🔴 **As exceções de caminho nunca casam.** `request.path` traz o prefixo global
  (`/api/v1/plataforma/...`), e o guard compara com `/plataforma`. Se o guard passasse
  a ver o usuário, ele bloquearia e registraria também as rotas da plataforma, de
  login e da integração.
- ✅ **Corrigido no lote de 2026-10-16** ("Entrar como suporte", decisão do usuário em 2026-10-16). Achado original:
  🟡 **Não há como o suporte entrar no cliente.** A troca de empresa
  (`AuthService.switchEmpresa`) exige vínculo em `usuario_empresas`, e tanto
  `plataforma.criarEmpresa` quanto `vincularAdministrador` recusam conta de
  administrador da plataforma. A tela de liberação existe (Administração > Suporte),
  o cliente concede, e nada usa a concessão. Por isso o guard inerte não é
  explorável hoje — mas o primeiro caminho de entrada que surgir chega sem bloqueio
  nem auditoria. 🔴 confirmar com o usuário como o suporte deveria entrar.
- ✅ **Corrigido no lote de 2026-10-16** (DTO Zod do contrato). Achado original:
  🟡 **`conceder` sem validação.** `@Body() dto: any`, apesar do
  `concederSuporteSchema` no contrato. `duracaoHoras` ausente vira data inválida
  (500); como texto, `getHours() + "100"` concatena ("13100") e a liberação dura
  meses; o limite de 72 h não vale.
- ✅ **Corrigido no lote de 2026-10-16** (rotina suporte-acesso, com menu). Achado original:
  🟡 **Logs e histórico sem permissão de rotina**: qualquer usuário da empresa lê as
  ações do suporte, inclusive o corpo das requisições.
- ✅ **Corrigido no lote de 2026-10-16** (campos de senha/token mascarados). Achado original:
  🟡 **O corpo vai inteiro para o log** (até 2000 caracteres), sem mascarar senha:
  uma troca de senha feita pelo suporte ficaria gravada em texto puro.
- ✅ **Corrigido no lote de 2026-10-16** (409 para liberação encerrada). Achado original:
  🟡 **Revogar não confere estado**: revogar de novo, ou uma concessão já vencida,
  sobrescreve `revogadoEm`/`revogadoPorId`.
- ✅ **Corrigido no lote de 2026-10-16** (uma transação só). Achado original:
  🟡 **Conceder não é atômico**: revogar as vigentes e criar a nova são duas
  transações; dois pedidos simultâneos deixam duas vigentes.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/suporte-acesso` | 🟢 |

## Estado Interno e Entidades

- **`EmpresaSuporteAcesso`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`EmpresaSuporteLog`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

