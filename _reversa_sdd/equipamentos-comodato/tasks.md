# equipamentos-comodato — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `equipamentos-comodato`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `equipamentos-comodato`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `findAll — GET /equipamentos-comodato`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `findOne — GET /:id`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `create — POST`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `update — PATCH /:id`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `remove — DELETE /:id`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `removerLote — POST /excluir-lote`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `adicionarAplicacao / adicionarAplicacoesLote — POST /:id/aplicacoes[/lote]`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `removerAplicacao — DELETE /:id/aplicacoes/:relacaoId`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `sugestoes — GET /:id/sugestoes?categoriaId=`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-10: Implementar `comuns — GET /:id/comuns?minimo=&categoriaId=`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-11: Implementar `popular — POST /popular`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-12: Implementar `categoriasPopular — GET /popular/categorias`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-13: Implementar `categoriasSugestoes — GET /sugestoes/categorias`**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`descricao-parecida.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/equipamentos-comodato/descricao-parecida.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

