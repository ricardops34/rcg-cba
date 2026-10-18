# estrutura — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `estrutura`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `listModulos` | `Árvore do menu para montar a navegação — só o que está ativo (catálogo + empresa + plano)` | `Result` | 200 OK |
| `listArvore` | `Mesma árvore, mas **com** o que está inativo, marcado em `ativoNaEmpresa` — para a tela de administração religar` | `Result` | 200 OK |
| `desativadosDaEmpresa` | `Calcula os sets de módulos/menus/rotinas desativados, combinando `Empresa*` (exceção manual) com o plano da assinatura (allowlist)` | `Result` | 200 OK |
| `definirModuloDaEmpresa/definirMenuDaEmpresa/definirRotinaDaEmpresa` | `Upsert do liga/desliga por empresa` | `Result` | 200 OK |
| `createModulo/updateModulo/removeModulo, idem Menu/Rotina` | `CRUD do catálogo global (sem `empresaId` — não passa por `withTenant`)` | `Result` | 200 OK |
| `validarMenuPai` | `Regras de hierarquia de menu (máx. 2 níveis, não auto-referência, mesmo módulo)` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 "Ausência de linha = ligado" (dupla camada: exceção manual + allowlist do plano)

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

### 2. 3.2 `listModulos` filtra em cascata; `listArvore` só marca

`listModulos` remove do retorno módulo/menu/submenu/rotina desativados (filtro recursivo
nos 4 níveis) — é o que monta o menu lateral de verdade. `listArvore` devolve a árvore
**inteira**, incluindo inativos no catálogo global (`deletedAt: null` sem `ativo: true`),
e anota `ativoNaEmpresa` em cada nível — sem isso a tela de administração não teria como
religar o que foi desligado (um item filtrado não aparece para ser clicado de novo).

### 3. 3.3 Hierarquia de menu — máximo 2 níveis (`validarMenuPai`)

Regras, na ordem: não pode ser pai de si mesmo; o pai precisa existir; o pai precisa estar
no **mesmo módulo** do filho (`updateMenu` propaga a troca de módulo do pai para todos os
submenus via `updateMany`, para não deixar submenu órfão de módulo); o pai não pode já ser
submenu de outro (`pai.menuPaiId` truthy); e o menu que está se tornando submenu não pode
já ter os próprios submenus — a hierarquia trava em 2 níveis por construção, não por
constraint de banco.

### 4. 3.4 Exclusão de menu bloqueada por submenu (`removeMenu`)

Menu com submenus ativos não pode ser excluído (`BadRequestException`) — força "exclua ou
mova os submenus antes", em vez de um soft delete em cascata que deixaria submenu
apontando para um pai inexistente na prática.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`PlatformAdminGuard`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`Assinatura/Plano (assinaturas/planos)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/estrutura` | 🟢 |

## Estado Interno e Entidades

- **`Modulo`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Menu`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Rotina`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`EmpresaModulo`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`EmpresaMenu`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`EmpresaRotina`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

