# integracao — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `integracao`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `integracao`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `Entidade (endpointKey)`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `categorias, armazens, condicoes-pagamento, fornecedores, vendedores`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `regras-desconto`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `produtos`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `estoque`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `tabelas-preco`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `clientes`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `titulos-receber`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `notas-saida / notas-entrada`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-10: Implementar `objetivos`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-11: Implementar `orcamentos`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-12: Implementar `pedidos`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-13: Implementar `equipamentos-comodato`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-14: Implementar `comunicacao`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-15: Implementar `arquivo`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-16: Implementar `cargas`**
  - Origem no legado: `apps/api/src/modules/integracao`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`chave-integracao.contract.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/chave-integracao.contract.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-02: Testes Automatizados (`chaves-opcionais.contract.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/chaves-opcionais.contract.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-03: Testes Automatizados (`data-civil.contract.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/data-civil.contract.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-04: Testes Automatizados (`itens-delete.contract.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/itens-delete.contract.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-05: Testes Automatizados (`lote.contract.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/lote.contract.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-06: Testes Automatizados (`common/*.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/common/*.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-07: Testes Automatizados (`cargas/*.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/cargas/*.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-08: Testes Automatizados (`clientes/integracao-clientes.service.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/clientes/integracao-clientes.service.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-09: Testes Automatizados (`comunicacao/integracao-comunicacao.service.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/integracao/comunicacao/integracao-comunicacao.service.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

