# ADR 006 — Fila de Aprovação Assíncrona para Alterações Cadastrais de Clientes

- **Status:** Implementado 🟢
- **Data:** 2026-09-25 (Commit `e2b0b31`)
- **Autores / Decisores:** Equipe de Integração ERP & Crédito/Cobrança

---

## 1. Contexto

Dados cadastrais de clientes comerciais (especialmente CNPJ, Inscrição Estadual, Razão Social, Limite de Crédito e Condição de Pagamento) têm impacto fiscal, tributário e financeiro direto no faturamento e na emissão de NF-e.

No sistema legado, se um vendedor alterasse o endereço de entrega ou a razão social na plataforma web e a gravação fosse direta no ERP, erros de digitação poderiam travar o faturamento na SEFAZ ou gerar risco de fraude em concessão indevida de crédito. Por outro lado, bloquear edições forçava processos burocráticos via e-mail ou planilhas externas.

## 2. Decisão

Implementar uma **Fila de Aprovação de Alterações (`ClienteAlteracao`)** com integração assíncrona bidirecional:

1. **Campos Monitorados (`CAMPOS_ACOMPANHADOS`):**
   - Cerca de 34 campos de alta sensibilidade são interceptados ao serem editados na interface ou propostos por agentes de IA ou enriquecimento pela Receita Federal.
   - Em vez de sobrescrever o registro em `clientes`, o sistema grava uma proposta com status `pendente` contendo o `diff` (valor atual vs. valor proposto).
2. **Aprovação Granular por Alçada:**
   - Supervisores e Administradores analisam a proposta em uma tela dedicada, podendo aprovar ou rejeitar campo a campo individualmente (`aplicarCampos`).
3. **Despacho Transacional ao ERP (`ClienteEnvioErp`):**
   - Ao aprovar a alteração, o cliente é atualizado na plataforma e uma linha é enfileirada em `cliente_envios_erp`.
   - O worker de integração consome essa fila e dispara rotina automática no ERP Protheus (`CRMA980` / `MATA030`), registrando sucesso ou erro na auditoria.

## 3. Alternativas Consideradas

- **Atualização Direta Síncrona:** A tela chama o endpoint do ERP e atualiza na hora.
  - *Descarte:* Vendedores poderiam introduzir dados inconsistentes que invalidariam notas futuras; além disso, a tela ficaria travada aguardando o processamento do ERP.
- **Apenas Notificação por E-mail ao Faturamento:** O sistema avisa o faturamento para atualizar o ERP manualmente.
  - *Descarte:* Lentidão operacional, retrabalho e descompasso permanente entre a base da web e a base do ERP.

## 4. Consequências

### Positivas
- **Governança Cadastral e Fiscal:** Nenhum dado crítico vai para o ERP sem validação humana por quem detém a alçada de crédito.
- **Resiliência e Rastreabilidade:** Toda alteração tem autoria (`propostoPorId`, `aprovadoPorId`), data e histórico completo de transição.

### Negativas / Trade-offs
- **Fluxo em Duas Etapas:** Vendedores precisam aguardar a aprovação gerencial para que certas alterações reflitam em orçamentos dependentes de novos limites de crédito.

