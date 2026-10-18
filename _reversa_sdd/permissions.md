# Matriz de Permissões e Segurança de Acesso (RBAC) — rcgcba

> Gerado pelo Detective. Nível de documentação: **detalhado**.
> Escala de confiança: 🟢 CONFIRMADO (código/policies/guards) · 🟡 INFERIDO · 🔴 LACUNA

---

## 1. Arquitetura de Autorização 🟢

A plataforma implementa um modelo de **Controle de Acesso Baseado em Papéis (RBAC)** com granularidade de rotina e ação, complementado por **Escopo Hierárquico de Carteira** e **Row-Level Security (RLS)** no banco de dados.

### 1.1 Resolução de Permissões no JWT (`buildAccessToken`)
- Cada permissão é representada pela tupla canônica: `"<codigo-da-rotina>.<acao>"` (ex.: `'clientes.visualizar'`, `'orcamentos.cadastrar'`).
- **Otimização para Administrador da Empresa:** Usuários com perfil base `sistemaBase = true` (Admin da Empresa) recebem `permissoes: []` no JWT. O `PermissionsGuard` concede acesso irrestrito pelo flag `isAdmin`, evitando que o token ultrapasse 16 KB e cause erro HTTP 431.
- **Poda Dinâmica de Módulos Desligados (`rotinaNoAr`):** Mesmo que um perfil possua permissão para uma rotina, a permissão é suprimida na geração do token se a empresa tiver desativado o módulo (`empresaModulo.ativo = false`) ou menu correspondente.

### 1.2 Guarda Especial: `PlatformAdminGuard`
- Exclusivo para usuários com `Perfil.administraPlataforma = true`.
- Concede acesso a rotinas globais de governança SaaS (gestão de planos, criação de novas empresas, acesso a logs globais de erro, métricas multi-tenant e geração de bases demo).

---

## 2. Perfis Padrão do Sistema 🟢

| Perfil | Escopo de Visibilidade | Propósito |
|---|---|---|
| **Administrador da Plataforma** | Global (todos os tenants e dados do sistema) | Gestão do SaaS, infraestrutura, planos, cobrança e suporte master. |
| **Administrador da Empresa** | Toda a empresa ativa | Configurações da empresa, gestão de usuários, parâmetros, estrutura de menus e auditoria. |
| **Gerente Comercial** | Toda a empresa / Todas as carteiras | Gestão de metas, aprovações de desconto extraordinário, dashboards gerenciais e CRM geral. |
| **Supervisor Comercial** | Carteira própria + Vendedores subordinados (`superiorId`) | Acompanhamento de equipe, roteiros semanais, aprovação de alterações cadastrais da equipe. |
| **Vendedor** | Estritamente a sua carteira (`vendedorId`) | Atendimento a clientes, emissão de orçamentos, CRM, catálogo e conversas de WhatsApp. |
| **Assistente Comercial** | Toda a empresa (leitura operacional) | Consulta de pedidos, emissão de 2ª via de DANFE e boletos, suporte a vendas. |

---

## 3. Matriz de Permissões por Rotina e Perfil 🟢

| Módulo / Rotina | Ação | Vendedor | Supervisor | Gerente | Admin Empresa | Admin Plataforma |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Início (Mural / Aniversariantes)** | `visualizar` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Clientes** | `visualizar` | ✅ (carteira) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| | `cadastrar` | ✅ | ✅ | ✅ | ✅ | ✅ |
| | `editar` | ⚠️ (gera fila) | ⚠️ (gera fila) | ✅ (direto) | ✅ (direto) | ✅ |
| | `excluir` | ❌ | ❌ | ❌ | ✅ | ✅ |
| | `alteracoes.aprovar` | ❌ | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| **Posição de Cliente** | `visualizar` | ✅ (carteira) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| | `comodato.baixar` | ✅ (carteira) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| **Produtos** | `visualizar` | ✅ | ✅ | ✅ | ✅ | ✅ |
| | `editar` (campos/fotos) | ❌ | ❌ | ❌ | ✅ | ✅ |
| | `fichas.importar` | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Orçamentos** | `visualizar` | ✅ (carteira) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| | `cadastrar` | ✅ | ✅ | ✅ | ✅ | ✅ |
| | `editar` | ✅ (rascunho) | ✅ | ✅ | ✅ | ✅ |
| | `aprovar_desconto` | ❌ | ⚠️ (limite) | ✅ | ✅ | ✅ |
| **Notas de Saída** | `visualizar` | ✅ (carteira) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| | `danfe.segunda_via` | ✅ (carteira) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| **Títulos a Receber** | `visualizar` | ✅ (carteira) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| | `boleto.segunda_via` | ✅ (carteira) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| **WhatsApp Conversas** | `visualizar` | ✅ (suas) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| | `enviar` | ✅ | ✅ | ✅ | ✅ | ✅ |
| | `vincular_contato` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Agenda / Roteiro** | `visualizar` | ✅ (sua) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| | `roteiro.aprovar` | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Dashboards** | `comercial.visualizar` | ✅ | ✅ | ✅ | ✅ | ✅ |
| | `gerencial.visualizar` | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Metas e Objetivos** | `visualizar` | ✅ (sua) | ✅ (equipe) | ✅ (todos) | ✅ | ✅ |
| | `editar` | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Administração (Usuários/Perfis)** | `visualizar/editar` | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Integração ERP (API Keys/Cargas)**| `visualizar/gerir` | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Governança SaaS (Empresas/Demo)** | `gerir` | ❌ | ❌ | ❌ | ❌ | ✅ |

*Legenda: ✅ Liberado | ❌ Bloqueado | ⚠️ Sujeito a alçada ou aprovação em fila*

---

## 4. Políticas de Isolamento de Dados (RLS + Código) 🟢

1. **Camada de Banco (Postgres RLS):** Garante isolamento entre empresas. Qualquer SELECT/UPDATE/DELETE sem correspondência com `app.current_empresa_id` retorna 0 linhas de forma transparente no banco de dados.
2. **Camada de Aplicação (Escopo Hierárquico):** Garante isolamento entre carteiras de vendedores da mesma empresa via `resolverEscopoVendedores(user)` aplicado nas cláusulas `where` do Prisma.
3. **Respostas Opacas (Anti-Enumeração):**
   - Tentativa de acesso a registro de outra empresa: **404 Not Found** (como se não existisse).
   - Tentativa de acesso a cliente fora da carteira: **404 Not Found**.
   - Credenciais de login inválidas ou usuário inativo: mensagem idêntica genérica `"Credenciais inválidas"`, sem confirmar se o e-mail existe no banco.

