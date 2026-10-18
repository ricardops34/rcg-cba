# politica-senha — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `politica-senha`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Guarda` | `Política devolvida` | 200 OK |
| `GET /politica-senha` | `JWT, `@PermitirTermoPendente`` | `a da própria conta (`getVigenteParaUsuario`)` | 200 OK |
| `GET /politica-senha/empresa-ativa` | `JWT` | `a da empresa ativa (senha inicial de usuário novo)` | 200 OK |
| `GET /politica-senha/usuario/:id` | ``usuarios.editar`` | `a do usuário alvo (reset feito por admin)` | 200 OK |

## Fluxo Principal

### 1. 3.1 Política da empresa

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

### 2. 3.2 Política da conta — a mais restritiva

A senha é da **conta**, não da empresa: vale a **mais restritiva entre as empresas com
vínculo ativo** (decisão de 2026-08-26). `maisRestritiva`, regra a regra: maior mínimo;
`menorNaoZero` para máximo, dias para expirar e tentativas (zero = sem limite e perde de
qualquer número); `OR` nas exigências; maior histórico; mais minutos de bloqueio. Sem
vínculo → padrão.

### 3. 3.3 Validação, reuso e histórico

- `validarSenhaContra` junta todas as violações numa mensagem só (400).
- `validarSenhaDoUsuario` (conta existente) e `validarSenhaDaEmpresa` (usuário em
  criação, sem vínculo ainda).
- `validarReuso`: recusa a senha atual (bcrypt) e as últimas N de `senha_historico`.
- `registrarHistorico` grava o hash **substituído**, aceitando a transação do chamador.

### 4. 3.4 Senha provisória

`max(mínimo da política, 14)` caracteres, limitado ao máximo; sempre as quatro
categorias, de um alfabeto sem ambíguos (sem `0/O`, `1/l/I`); sorteio e embaralhamento
(Fisher-Yates) com `crypto.randomInt`.

### 5. 3.5 Achados

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

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`bcryptjs`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`node:crypto`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/politica-senha` | 🟢 |

## Estado Interno e Entidades

- **`SenhaHistorico`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

