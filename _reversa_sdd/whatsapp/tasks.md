# whatsapp — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `whatsapp`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `whatsapp`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `Grupo`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `Configuração`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `Status`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `Recados internos`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `Minha sessão`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `Número institucional`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `Institucional de outra empresa`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `Administração de instâncias`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `Conversas`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-10: Implementar `Ações`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-11: Implementar `Agenda do aparelho`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-12: Implementar `Gerencial`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-13: Implementar `Indicadores`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-14: Implementar `Respostas rápidas`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-15: Implementar `Webhook`**
  - Origem no legado: `apps/api/src/modules/whatsapp`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`triagem/seguranca.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/triagem/seguranca.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-02: Testes Automatizados (`triagem/triagem-funcionario-tools.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/triagem/triagem-funcionario-tools.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-03: Testes Automatizados (`triagem/whatsapp-funcionario-identidade.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/triagem/whatsapp-funcionario-identidade.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-04: Testes Automatizados (`triagem/telefone-equipe.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/triagem/telefone-equipe.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-05: Testes Automatizados (`triagem/proximo-expediente.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/triagem/proximo-expediente.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-06: Testes Automatizados (`triagem/ficha-da-empresa.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/triagem/ficha-da-empresa.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-07: Testes Automatizados (`triagem/triagem-ferramentas.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/triagem/triagem-ferramentas.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-08: Testes Automatizados (`whatsapp-evolution.controller.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/whatsapp-evolution.controller.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-09: Testes Automatizados (`providers/evolution-go.provider.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/providers/evolution-go.provider.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-10: Testes Automatizados (`iniciar-conversa.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/iniciar-conversa.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-11: Testes Automatizados (`mensagem-interativa.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/mensagem-interativa.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-12: Testes Automatizados (`escopo-whatsapp.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/escopo-whatsapp.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-13: Testes Automatizados (`anotacao.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/anotacao.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-14: Testes Automatizados (`apagar-conversas.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/apagar-conversas.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-15: Testes Automatizados (`foto-perfil-whatsapp.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/foto-perfil-whatsapp.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-16: Testes Automatizados (`midia-arquivos.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/whatsapp/midia-arquivos.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

