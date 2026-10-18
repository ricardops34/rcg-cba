# ADR 003 — Perfis por Grupo Econômico e Hierarquia de Carteiras

- **Status:** Implementado 🟢
- **Data:** 2026-09-30 (Commit `e557377`)
- **Autores / Decisores:** Engenharia de Dados & Equipe Comercial

---

## 1. Contexto

Muitos clientes operam como grupos econômicos formados por múltiplas empresas (matriz, filiais de distribuição, fábricas). Antes desta decisão, perfis de acesso eram duplicados em cada filial, obrigando o administrador a cadastrar e manter os mesmos perfis repetidamente. 

Adicionalmente, gerentes e supervisores comerciais precisavam acompanhar os orçamentos, vendas e mensagens de WhatsApp de suas respectivas equipes sem ter acesso aos dados das equipes de outros gerentes da mesma empresa.

## 2. Decisão

1. **Governança de Perfis por Grupo Econômico:**
   - Perfis de acesso (`Perfil`) passam a ser vinculados ao `grupoEconomicoId` da empresa (com exceção dos perfis base do sistema e do perfil de Administrador da Plataforma, que são globais).
   - Uma regra de autorização em uma empresa do grupo torna-se imediatamente utilizável nas demais empresas do mesmo conglomerado.
2. **Hierarquia de Carteiras Baseada no Vínculo:**
   - A hierarquia não utiliza uma tabela separada de "Colaboradores": o vínculo `UsuarioEmpresa` carrega `superiorId` apontando para outro `UsuarioEmpresa` da mesma empresa.
   - O algoritmo `resolverEscopoVendedores` percorre a árvore hierárquica de forma recursiva:
     - Vendedores enxergam apenas a sua carteira.
     - Supervisores/Gerentes enxergam as carteiras de todos os vendedores subordinados a eles na hierarquia.
     - Administradores enxergam todas as carteiras da empresa ativa.
3. **Respostas Opacas contra Enumeração de Carteiras:**
   - Requisições direcionadas a clientes, orçamentos ou notas fora da carteira do vendedor retornam **HTTP 404** (Not Found), mantendo total sigilo sobre a existência do cliente.

## 3. Alternativas Consideradas

- **Perfis Isolados por Empresa (Sem Grupo):**
  - *Descarte:* Alto custo de manutenção para grupos com 5+ empresas, com frequentes divergências de configuração entre filiais.
- **Controle de Carteira por Lista Estática em Tabela de Ligação:**
  - *Descarte:* Tabela N:N `vendedor_carteiras` exigiria reatribuir clientes manualmente a cada mudança de cargo ou contratação, gerando desatualização constante.

## 4. Consequências

### Positivas
- **Centralização Administrativa:** Facilidade de gestão de cargos e permissões para grupos empresariais.
- **Autonomia Supervisionada:** Supervisores acompanham em tempo real os atendimentos de seus times sem interferência na carteira de terceiros.

### Negativas / Trade-offs
- **Complexidade de Queries:** Consultas analíticas precisam resolver a hierarquia recursiva antes de aplicar os filtros nas tabelas de fatos (`notas_saida`, `orcamentos`).

