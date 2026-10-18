# contas-bancarias — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `contas-bancarias`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll — GET /contas-bancarias` | ``contas-bancarias.visualizar`` | `busca em descrição (sem caixa), agência e conta; filtro `ativo`; ordem padrão `descricao`` | 200 OK |
| `findOne — GET /:id` | ``visualizar`` | `404 se excluída` | 200 OK |
| `create — POST` | ``cadastrar`` | `grava; se `padrao`, desmarca as outras` | 200 OK |
| `update — PATCH /:id` | ``editar`` | `404 se excluída; se ficar `padrao`, desmarca as outras` | 200 OK |
| `setLogo — POST /:id/logo (multipart file)` | ``editar`` | `apaga o arquivo anterior do disco e grava `logoUrl = /uploads/bancos/<uuid>.<ext>`` | 200 OK |
| `removeLogo — DELETE /:id/logo` | ``editar`` | `apaga o arquivo e zera `logoUrl`` | 200 OK |
| `remove — DELETE /:id` | ``excluir`` | `soft delete + `ativo=false` + `padrao=false`; **títulos continuam apontando** para a conta` | 200 OK |
| `contaPadrao(empresaId) (exportada)` | `—` | `a conta `padrao`, `ativo`, não excluída; `null` se não houver` | 200 OK |

## Fluxo Principal

### 1. 3.1 Uma conta padrão por empresa, por atualização em massa

`desmarcarOutrosPadroes` roda **depois** de gravar: marcar a nova como padrão é o jeito de
trocar a padrão, e validar antes obrigaria a desmarcar a antiga primeiro. Não há índice
único no banco.
- 🟡 Duas gravações simultâneas marcando contas diferentes como padrão podem terminar
  com **duas** padrão (cada transação desmarca só o que já estava confirmado), e
  `contaPadrao` usa `findFirst` sem ordem — escolha indefinida.
- 🟡 Uma conta pode ficar `padrao: true` e `ativo: false` (edição que só desliga o ativo):
  `contaPadrao` exige `ativo`, então a empresa fica **sem** padrão sem nenhum aviso, e a
  2ª via passa a responder 409 "nenhuma conta padrão".

### 2. 3.2 Exclusão preserva o vínculo dos títulos

Soft delete sem tocar `titulos_receber.contaBancariaId`: a 2ª via de um boleto antigo
precisa do convênio que o registrou. Observação: `gerarBoleto` lê
`include: { contaBancaria: true }` sem filtrar `deletedAt`, então título com conta
excluída **continua** emitindo com ela — coerente com a intenção.

### 3. 3.3 Logo do banco em disco local

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

### 4. 3.4 Validação do contrato × gerador do boleto

O contrato aceita `agencia` até **5** dígitos e `conta` até **9**, mas o gerador Bradesco
(`campoLivreBradesco`) recusa agência com mais de 4 e conta com mais de 7. Uma conta salva
dentro do contrato pode **nunca** gerar boleto (409 "Agência com mais de 4 dígitos").
`banco` é `enum(['237'])` — coerente com `BANCOS_SUPORTADOS`.

### 5. 3.5 Percentuais de multa e juros: guardados e não usados

`jurosMesPerc` e `multaPerc` são gravados e listados (`Multa 2% · Juros 1%/mês`), mas
nenhum código de boleto os lê desde a decisão de 2026-10-09 (só os valores do ERP no
título). O comentário do schema ("Encargos impressos nas instruções") está
desatualizado, e a tela se contradiz: `page.tsx:607` diz que "não entram no boleto",
`page.tsx:642` diz que "são calculados na atualização do valor da 2ª via".

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/uploads/uploads.config (BANCOS_DIR, bancoLogoUploadOptions)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/contas-bancarias` | 🟢 |
| **Constante Parametrizada `bancoBoletoSchema`:** contracts | `apps/api/src/modules/contas-bancarias` | 🟢 |
| **Constante Parametrizada `SORT_FIELDS`:** service | `apps/api/src/modules/contas-bancarias` | 🟢 |
| **Constante Parametrizada `LOGO_MAX_BYTES`:** `common/uploads/uploads.config.ts` | `apps/api/src/modules/contas-bancarias` | 🟢 |
| **Constante Parametrizada `LOGO_MIME_TYPES`:** idem | `apps/api/src/modules/contas-bancarias` | 🟢 |
| **Constante Parametrizada `Padrões da ficha`:** contrato e schema | `apps/api/src/modules/contas-bancarias` | 🟢 |

## Estado Interno e Entidades

- **`ContaBancaria`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

