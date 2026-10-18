# titulos-receber — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `titulos-receber`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `titulos-receber`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `findAll(empresaId, user, query, {ignorarEscopo?}) — GET /titulos-receber (titulos-receber.visualizar)`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `findOne(…, id, {ignorarEscopo?}) — GET /titulos-receber/:id (+ posicao-cliente.visualizar)`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `gerarBoleto(empresaId, quem, id, {registrarEvento?, atualizado?}) — GET /:id/boleto?atualizado=`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `descreverBoleto(vencimento, encargos)`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `calcularStatusTituloReceber(titulo, hoje) (titulo-receber-status.ts)`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `calcularEncargos, diasEmAtraso, foraDoPrazoDeReemissao, podeEmitirBoleto (boleto-atualizacao.ts)`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `montarBoleto, fatorVencimento, campoLivreBradesco, DVs (boleto-codigo.ts)`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `montarBoletoPdf (boleto-pdf.ts)`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `montarInstrucoes(titulo, conta, usarAtualizado) (exportada)`**
  - Origem no legado: `apps/api/src/modules/titulos-receber`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`boleto-atualizacao.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/titulos-receber/boleto-atualizacao.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-02: Testes Automatizados (`boleto-codigo.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/titulos-receber/boleto-codigo.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-03: Testes Automatizados (`boleto-pdf.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/titulos-receber/boleto-pdf.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-04: Testes Automatizados (`montar-instrucoes.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/titulos-receber/montar-instrucoes.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-05: Testes Automatizados (`titulos-feriados.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/titulos-receber/titulos-feriados.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

