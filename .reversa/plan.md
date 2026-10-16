# Plano de Exploração — rcg

> Criado pelo Reversa em 2026-10-06
> Marque cada tarefa com ✅ quando concluída.
> Você pode editar este plano antes de iniciar: adicione, remova ou reordene tarefas conforme necessário.

---

## Fase 1: Reconhecimento 🔍

- [x] **Scout** — Mapeamento de estrutura de pastas e tecnologias
- [x] **Scout** — Análise de dependências e gerenciadores de pacotes
- [x] **Scout** — Identificação de entry points, CI/CD e configurações

## Decisão de organização das specs 🗂️

> Entre o Scout e o Arqueólogo, o Reversa pergunta como você quer organizar as specs (por módulo, caso de uso, endpoint, híbrida, por features ou customizada). A escolha fica persistida em `.reversa/config.toml` na seção `[specs]` e não será reperguntada em execuções futuras. Para reapresentar o menu, remova manualmente a seção.

## Fase 2: Escavação 🏗️

- [x] **Arqueólogo** — Análise do módulo `auth`
- [x] **Arqueólogo** — Análise do módulo `clientes`
- [x] **Arqueólogo** — Análise do módulo `empresas`
- [x] **Arqueólogo** — Análise do módulo `grupos-economicos`
- [x] **Arqueólogo** — Análise do módulo `usuarios`
- [x] **Arqueólogo** — Análise do módulo `perfis`
- [x] **Arqueólogo** — Análise do módulo `acessos`
- [x] **Arqueólogo** — Análise do módulo `produtos`
- [x] **Arqueólogo** — Análise do módulo `produto-campos`
- [x] **Arqueólogo** — Análise do módulo `cliente-campo-config`
- [x] **Arqueólogo** — Análise do módulo `estoque`
- [x] **Arqueólogo** — Análise do módulo `estrutura`
- [x] **Arqueólogo** — Análise do módulo `fornecedores`
- [x] **Arqueólogo** — Análise do módulo `notas-entrada`
- [x] **Arqueólogo** — Análise do módulo `notas-saida`
- [x] **Arqueólogo** — Análise do módulo `sugestao-compra`
- [x] **Arqueólogo** — Análise do módulo `orcamentos`
- [x] **Arqueólogo** — Análise do módulo `orcamento-config`
- [x] **Arqueólogo** — Análise do módulo `titulos-receber`
- [x] **Arqueólogo** — Análise do módulo `contas-bancarias`
- [x] **Arqueólogo** — Análise do módulo `equipamentos-comodato`
- [x] **Arqueólogo** — Análise do módulo `vendedores`
- [x] **Arqueólogo** — Análise do módulo `leads`
- [x] **Arqueólogo** — Análise do módulo `oportunidades`
- [x] **Arqueólogo** — Análise do módulo `atividades`
- [x] **Arqueólogo** — Análise do módulo `objetivos`
- [x] **Arqueólogo** — Análise do módulo `meus-atendimentos`
- [x] **Arqueólogo** — Análise do módulo `consultas`
- [x] **Arqueólogo** — Análise do módulo `relatorios`
- [x] **Arqueólogo** — Análise do módulo `whatsapp`
- [x] **Arqueólogo** — Análise do módulo `agente`
- [x] **Arqueólogo** — Análise do módulo `notificacoes`
- [x] **Arqueólogo** — Análise do módulo `email`
- [x] **Arqueólogo** — Análise do módulo `documentos-email`
- [x] **Arqueólogo** — Análise do módulo `sms`
- [x] **Arqueólogo** — Análise do módulo `armazenamento`
- [x] **Arqueólogo** — Análise do módulo `backup-empresa`
- [x] **Arqueólogo** — Análise do módulo `assinaturas`
- [x] **Arqueólogo** — Análise do módulo `planos`
- [x] **Arqueólogo** — Análise do módulo `plataforma`
- [x] **Arqueólogo** — Análise do módulo `parametros`
- [x] **Arqueólogo** — Análise do módulo `escopo`
- [x] **Arqueólogo** — Análise do módulo `politica-senha`
- [x] **Arqueólogo** — Análise do módulo `recuperacao-senha`
- [ ] **Arqueólogo** — Análise do módulo `suporte-acesso`
- [ ] **Arqueólogo** — Análise do módulo `integracao`
- [ ] **Arqueólogo** — Análise do módulo `integracao-keys`
- [ ] **Arqueólogo** — Análise do módulo `portal-cliente`
- [ ] **Arqueólogo** — Análise do módulo `cadastros`
- [ ] **Arqueólogo** — Análise do módulo `feriados`
- [ ] **Arqueólogo** — Análise do módulo `erros`
- [ ] **Arqueólogo** — Análise do módulo `termos`
- [ ] **Arqueólogo** — Análise do módulo `tours`
- [ ] **Arqueólogo** — Análise do módulo `inicio`
- [ ] **Arqueólogo** — Análise do módulo `demo`

## Fase 3: Interpretação 🧠

- [ ] **Detetive** — Arqueologia Git e ADRs retroativos
- [ ] **Detetive** — Regras de negócio implícitas e máquinas de estado
- [ ] **Detetive** — Matriz de permissões (RBAC/ACL)
- [ ] **Arquiteto** — Diagramas C4 (Contexto, Containers, Componentes)
- [ ] **Arquiteto** — ERD completo e integrações externas
- [ ] **Arquiteto** — Spec Impact Matrix

## Fase 4: Geração 📝

- [ ] **Redator** — Specs SDD por componente
- [ ] **Redator** — OpenAPI (se aplicável)
- [ ] **Redator** — User Stories (se aplicável)
- [ ] **Redator** — Code/Spec Matrix

## Fase 5: Revisão ✅

- [ ] **Revisor** — Revisão cruzada de specs
- [ ] **Revisor** — Resolução de lacunas com o usuário
- [ ] **Revisor** — Relatório de confiança final

---

## Agentes Independentes

> Execute estes agentes quando os recursos estiverem disponíveis — podem rodar em qualquer fase.

- [ ] **Visor** — Análise de interface via screenshots
- [ ] **Data Master** — Análise completa do banco de dados
- [ ] **Design System** — Extração de tokens de design
- [ ] **Tracer** — Análise dinâmica (requer sistema acessível)

---

## Próximo passo

Após o Time de Descoberta concluir e o `_reversa_sdd/` estar populado, você pode disparar um dos fluxos seguintes:

- `/reversa-migrate`: orquestrador do **Time de Migração** (Paradigm Advisor → Curator → Strategist → Designer → Screen Translator → Inspector). Gera as specs do sistema novo. Saída em `_reversa_sdd/migration/` e `_reversa_sdd/screens/`.
- `/reversa-reconstructor`: gera plano bottom-up para reimplementar o software a partir das specs do legado (uma tarefa por sessão).
