# plataforma — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `plataforma`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `plataforma`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `Rota`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `GET /consulta-cnpj/:cnpj`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `GET /empresas`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `POST /empresas`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `PATCH /empresas/:id/situacao`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `GET /contas?email=`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `GET /empresas/:id/administradores`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `POST /empresas/:id/administradores`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `DELETE /empresas/:id/administradores/:usuarioId`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-10: Implementar `GET /admins, POST /admins {email}, PATCH /admins/:usuarioId`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-11: Implementar `GET /auditoria`**
  - Origem no legado: `apps/api/src/modules/plataforma`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`plataforma-empresa-create.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/plataforma/plataforma-empresa-create.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-02: Testes Automatizados (`plataforma-uso.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/plataforma/plataforma-uso.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

