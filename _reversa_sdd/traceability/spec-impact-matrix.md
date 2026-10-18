# Matriz de Impacto entre Componentes (Spec Impact Matrix)

> Mapeamento de rastreabilidade de impacto para evolução e refatoração segura.
> Escala de confiança: 🟢 CONFIRMADO

---

## 1. Visão Geral de Acoplamento

A tabela abaixo cruza os principais domínios do sistema: quando o componente da **linha** sofre alteração estrutural ou funcional, quais componentes das **colunas** sofrem impacto direto (requerem revisão de código ou testes de regressão).

| Componente Origem ↓ / Impactado → | Auth / Acessos | Empresas / Tenant | Clientes / Carteira | Produtos / Catálogo | Orçamentos | Vendas / Notas | WhatsApp / IA | Integração ERP |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Auth / Sessão** | — | 🔴 Alto | 🔴 Alto | 🟡 Médio | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🟡 Médio |
| **Empresas / RLS** | 🔴 Alto | — | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🔴 Alto |
| **Clientes / Carteira** | 🟡 Médio | 🟡 Médio | — | 🟢 Baixo | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🔴 Alto |
| **Produtos / Preços** | 🟢 Baixo | 🟢 Baixo | 🟡 Médio | — | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🔴 Alto |
| **Orçamentos** | 🟢 Baixo | 🟢 Baixo | 🟡 Médio | 🟡 Médio | — | 🟡 Médio | 🔴 Alto | 🔴 Alto |
| **Vendas / Notas Saída** | 🟢 Baixo | 🟢 Baixo | 🔴 Alto | 🟡 Médio | 🟡 Médio | — | 🟡 Médio | 🔴 Alto |
| **WhatsApp / Worker** | 🟡 Médio | 🟡 Médio | 🔴 Alto | 🟡 Médio | 🔴 Alto | 🟢 Baixo | — | 🟢 Baixo |
| **Integração / Cargas** | 🟡 Médio | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🔴 Alto | 🟡 Médio | — |

*Legenda: 🔴 Alto Impacto (quebra potencial / dependência direta) | 🟡 Médio Impacto (efeito colateral analítico / visual) | 🟢 Baixo Impacto*

---

## 2. Pontos Críticos de Rastreabilidade 🟢

### 2.1 O "Corte de Venda" (`venda-analitica.ts`)
Qualquer modificação na lógica de faturamento analítico impacta simultaneamente:
- Dashboard Comercial (`/comercial/dashboard`)
- Dashboard Gerencial (`/gerencial/dashboard`)
- Apuração de Metas dos Vendedores (`/gerencial/objetivos`)
- Consultas de Vendas por Período / Vendedor / Categoria
- Ferramentas de consulta do Agente de IA no WhatsApp

### 2.2 O Helper de Escopo de Carteira (`escopo-vendedores.ts`)
Qualquer alteração na resolução hierárquica (`superiorId`) impacta:
- Listagem e Detalhes de Clientes (Posição de Cliente)
- Visualização de Orçamentos
- Relatórios de Faturamento por Vendedor
- Caixa de Entrada e Triagem de Conversas do WhatsApp

### 2.3 Transação RLS (`PrismaService.withTenant`)
Qualquer alteração no mecanismo de transação ou nas variáveis de sessão do PostgreSQL (`app.current_empresa_id` / `app.plataforma`) impacta **100% dos módulos do sistema**.

