# assinaturas — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `assinaturas`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Comportamento` | `Result` | 200 OK |
| `GET /grupos/:grupoId/assinatura` | `contrato do grupo, ou `null` (não cria assinatura gratuita)` | `Result` | 200 OK |
| `PATCH /grupos/:grupoId/assinatura` | `cria ou altera e propaga às empresas` | `Result` | 200 OK |
| `GET /empresas/:empresaId/assinatura` | `resolve o grupo da empresa e devolve o contrato dele` | `Result` | 200 OK |
| `PATCH /empresas/:empresaId/assinatura` | `idem, alterando` | `Result` | 200 OK |
| `GET /assinaturas` | `assinaturas de grupos não excluídos, com plano e número de empresas ativas` | `Result` | 200 OK |
| `GET /assinaturas/resumo` | `MRR, total de empresas, ativas, em teste, inadimplentes` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 `updateAssinaturaGrupo`

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

### 2. 3.2 Resumo SaaS — MRR

`MRR = Σ (valorMensalidade / meses do ciclo)` das assinaturas `ativa` de grupos não
excluídos (mensal 1, trimestral 3, semestral 6, anual 12), arredondado a centavos. A tela
(`assinatura-section.tsx`) trata `valorMensalidade` como **"Valor Cobrado" por ciclo** e
o preenche com o preço do plano para o ciclo escolhido — coerente com a divisão.

### 3. 3.3 Achados

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
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/assinaturas` | 🟢 |

## Estado Interno e Entidades

- **`Assinatura`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

