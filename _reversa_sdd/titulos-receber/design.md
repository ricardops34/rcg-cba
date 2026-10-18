# titulos-receber — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `titulos-receber`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll(empresaId, user, query, {ignorarEscopo?}) — GET /titulos-receber (titulos-receber.visualizar)` | `filtros (status, cliente, vendedor, ativo, busca), paginação, ordem` | `página com `vencimentoEfetivo`, `status`, `temBoleto` por linha` | Média — status filtrado no banco com o mesmo corte do badge |
| `findOne(…, id, {ignorarEscopo?}) — GET /titulos-receber/:id (+ posicao-cliente.visualizar)` | `id` | `título + `baixas` (só no detalhe) + os mesmos derivados` | Baixa |
| `gerarBoleto(empresaId, quem, id, {registrarEvento?, atualizado?}) — GET /:id/boleto?atualizado=` | ``QuemPede` (usuário ou cliente do WhatsApp), id` | ``{conteudo: Buffer, nomeArquivo, numeroDocumento, valor, encargos, …}`` | Alta — ver §3.3 e `flowcharts/titulos-receber-gerarBoleto.md` |
| `descreverBoleto(vencimento, encargos)` | `—` | `linha do histórico ("Venc. … · R$ … · valor atualizado — N dia(s)…")` | Baixa |
| `calcularStatusTituloReceber(titulo, hoje) (titulo-receber-status.ts)` | ``dtBaixa`, `vencimento`` | ``baixado` / `vencido` / `aberto`` | Baixa — compartilhado com a Posição de Cliente |
| `calcularEncargos, diasEmAtraso, foraDoPrazoDeReemissao, podeEmitirBoleto (boleto-atualizacao.ts)` | `saldo, vencimento, multa/juros do ERP` | `valor atualizado / decisão` | Média — puro, testado |
| `montarBoleto, fatorVencimento, campoLivreBradesco, DVs (boleto-codigo.ts)` | `dados de cobrança` | `código de barras (44), linha digitável (47), nosso número formatado` | Alta — FEBRABAN, puro, testado; ver `flowcharts/titulos-receber-montarBoleto.md` |
| `montarBoletoPdf (boleto-pdf.ts)` | `dados já resolvidos` | `PDF A4 com 3 vias (Empresa, Pagador, Ficha de Compensação)` | Média — layout jsPDF |
| `montarInstrucoes(titulo, conta, usarAtualizado) (exportada)` | `instruções do título e da conta` | `linhas ao caixa, sem duplicar encargo` | Baixa |

## Fluxo Principal

### 1. 3.1 Status e "vencimento efetivo" com feriados

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

### 2. 3.2 Valor atualizado do título vencido (`calcularEncargos`)

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

### 3. 3.3 `gerarBoleto` — ordem das guardas e precedência dos dados

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

### 4. 3.4 Código de barras FEBRABAN + campo livre Bradesco

- Fator de vencimento: dias desde 07/10/1997; abaixo de 1000 é inválido; **depois de 9999
  (21/02/2025) recomeça em 1000**, em ciclo de 9000 — títulos antigos mantêm o fator linear.
- DV geral: módulo 11, pesos 2..9, resto 0/10/11 → 1. DVs da linha digitável: módulo 10.
- Campo livre Bradesco: agência(4) + carteira(2) + nosso número(11) + conta(7, sem DV) + `0`.
- DV do nosso número (só impresso): módulo 11, pesos 2..7, sobre carteira + nosso número;
  resto 1 → `P`.
- Valor em centavos com `Math.round` (evita perder 1 centavo em `1260.5 × 100`).
- **Código de barras e linha digitável do ERP prevalecem** quando vêm com 44/47 dígitos.
- Só o banco **237** tem gerador (`BANCOS_SUPORTADOS`).

### 5. 3.5 Instruções ao caixa sem duplicar encargo

`montarInstrucoes` gera "Importancia por Dia de Atraso…" e "Após Vencimento Cobrar
Multa…" a partir dos valores do título e **descarta** as linhas equivalentes que o ERP
manda em `instrucoes` (`BJInstrBol` no BJPLA003; comparação sem acento e em minúsculas) —
antes saíam duplicadas. Depois: instruções restantes do título e da conta, protesto
(`conta.diasProtesto`), a marca "2º Via" e o aviso de valor atualizado.

### 6. 3.6 Achados — onde o comentário e o código divergem

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

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`ContasBancariasService.contaPadrao`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService (BOLETO_PRAZO_MAXIMO_REEMISSAO)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/horario/calendario-util`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo (resolverEscopoVendedores, recorteDoSolicitante, autorDoEvento)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/atividades/registrar-atividade-documento`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pdf/barcode`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`jspdf`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/titulos-receber` | 🟢 |
| **Constante Parametrizada `BOLETO_PRAZO_MAXIMO_REEMISSAO (parâmetro)`:** `parametros.service`; lido em `findAll`, `findOne` e `gerarBoleto` | `apps/api/src/modules/titulos-receber` | 🟢 |
| **Constante Parametrizada `PRAZO_MAXIMO_REEMISSAO_DIAS`:** `boleto-atualizacao.ts` (padrão das funções puras) | `apps/api/src/modules/titulos-receber` | 🟢 |
| **Constante Parametrizada `BANCOS_SUPORTADOS`:** `boleto-codigo.ts` | `apps/api/src/modules/titulos-receber` | 🟢 |
| **Constante Parametrizada `SORT_FIELDS`:** service; padrão `vencimento desc` | `apps/api/src/modules/titulos-receber` | 🟢 |
| **Constante Parametrizada `Data-base FEBRABAN`:** `fatorVencimento` | `apps/api/src/modules/titulos-receber` | 🟢 |
| **Constante Parametrizada `Busca (search)`:** `findAll` | `apps/api/src/modules/titulos-receber` | 🟢 |

## Estado Interno e Entidades

- **`TituloReceber`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`TituloReceberBaixa`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

