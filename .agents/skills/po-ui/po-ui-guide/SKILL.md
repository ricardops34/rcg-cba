---
name: po-ui-guide
description: "Guia para geração de componentes e páginas Angular usando a biblioteca PO-UI da TOTVS (@po-ui/ng-components). Cobre componentes de formulário, tabelas, páginas (po-page-list, po-page-edit, po-page-detail, po-page-dynamic-*), serviços (PoNotification, PoDialog), padrões de integração com API e configuração de módulos. Use quando o usuário pede para criar telas Angular com PO-UI, usar componentes po-*, configurar rotas com po-page-dynamic, ou integrar formulários dinâmicos."
license: MIT
metadata:
  domain: Angular / PO-UI
  maintainer: Customizações Frontend
  author: Ricardo Patay Sotomayor
  version: '1.0.0'
  category: Code Generation
---

# PO-UI Guide

## Visão Geral

PO-UI (`@po-ui/ng-components`) é a biblioteca de componentes Angular da TOTVS para aplicações corporativas. Oferece mais de 60 componentes prontos, serviços, diretivas e interfaces.

**Documentação local completa**: `po-ui/doc/llms-generated/<nome-do-componente>.md`
**Índice de componentes**: `po-ui/doc/sources/llms.txt`

Antes de gerar código para qualquer componente, leia o arquivo de documentação correspondente em `po-ui/doc/llms-generated/`.

---

## Instalação

```bash
ng add @po-ui/ng-components
```

Importar no `AppModule`:

```typescript
import { PoModule } from '@po-ui/ng-components';

@NgModule({
  imports: [PoModule]
})
export class AppModule {}
```

---

## Arquivos de Referência

| Referência | Quando Ler | Conteúdo |
|---|---|---|
| [references/components-catalog.md](references/components-catalog.md) | Escolher o componente certo, ver inputs/outputs principais, componentes de formulário, tabela, páginas, serviços | Catálogo completo por categoria com propriedades essenciais |
| [references/common-patterns.md](references/common-patterns.md) | Gerar código de telas completas, padrões CRUD, integração com API, formulários dinâmicos | Templates de código para padrões mais comuns |

Documentação detalhada de cada componente (inputs, outputs, métodos, tipos):

```
po-ui/doc/llms-generated/po-<nome>.md
```

---

## Categorias de Componentes

### Páginas (Page Templates)

| Componente | Uso |
|---|---|
| `po-page-default` | Container genérico sem template definido |
| `po-page-list` | Listagem com filtro e ações |
| `po-page-edit` | Formulário de edição/criação |
| `po-page-detail` | Visualização de registro |
| `po-page-dynamic-table` | Tabela dinâmica via API + metadados |
| `po-page-dynamic-edit` | Formulário dinâmico via API + metadados |
| `po-page-dynamic-detail` | Detalhe dinâmico via API + metadados |
| `po-page-dynamic-search` | Pesquisa avançada dinâmica |

### Formulários

| Componente | Uso |
|---|---|
| `po-input` | Campo texto |
| `po-number` | Campo numérico |
| `po-decimal` | Campo decimal com formatação |
| `po-email` | Campo e-mail |
| `po-password` | Campo senha |
| `po-textarea` | Área de texto |
| `po-datepicker` | Seletor de data |
| `po-datepicker-range` | Intervalo de datas |
| `po-timepicker` | Seletor de horário |
| `po-combo` | Combobox com filtro e serviço |
| `po-select` | Select simples |
| `po-multiselect` | Seleção múltipla |
| `po-radio-group` | Radio buttons |
| `po-checkbox` / `po-checkbox-group` | Checkboxes |
| `po-switch` | Toggle switch |
| `po-lookup` | Lookup com janela de busca |
| `po-upload` | Upload de arquivos |
| `po-rich-text` | Editor de texto rico |
| `po-dynamic-form` | Formulário dinâmico a partir de array de fields |

### Dados e Listas

| Componente | Uso |
|---|---|
| `po-table` | Tabela com ordenação, seleção, ações |
| `po-list-view` | Lista com template customizável |
| `po-dynamic-view` | Visualização dinâmica de dados |
| `po-tree-view` | Árvore de dados |

### Navegação

| Componente | Uso |
|---|---|
| `po-menu` | Menu lateral |
| `po-menu-panel` | Menu lateral só com ícones |
| `po-navbar` | Barra de navegação |
| `po-breadcrumb` | Trilha de navegação |
| `po-tabs` / `po-tab` | Abas |
| `po-stepper` / `po-step` | Assistente em etapas |
| `po-context-menu` | Menu lateral de contexto |

### Feedback e Overlays

| Componente | Uso |
|---|---|
| `po-modal` | Modal/diálogo |
| `po-page-slide` | Painel lateral deslizante |
| `po-popover` | Popover |
| `po-tooltip` (diretiva) | Tooltip |
| `po-loading-overlay` | Loading de tela inteira |
| `po-skeleton` | Placeholder de carregamento |
| `po-progress` | Barra de progresso |
| `po-toaster` | Toast de notificação |

### Serviços

| Serviço | Uso |
|---|---|
| `PoNotificationService` | Exibir notificações (success, error, warning, info) |
| `PoDialogService` | Exibir diálogos de alerta e confirmação |
| `PoI18nService` | Internacionalização |
| `PoThemeService` | Customização de tema |

### Outros Componentes

| Componente | Uso |
|---|---|
| `po-button` | Botão |
| `po-button-group` | Grupo de botões |
| `po-dropdown` | Dropdown com ações |
| `po-tag` | Tag/label colorida |
| `po-badge` | Badge de notificação |
| `po-avatar` | Avatar de usuário |
| `po-chart` | Gráficos (bar, line, pie, donut, etc.) |
| `po-container` | Container com agrupamento visual |
| `po-divider` | Divisor de seções |
| `po-info` | Exibição label + valor |

---

## Fluxo de Geração de Código

1. **Identificar o requisito**: Qual tipo de tela/componente é necessário
2. **Ler a documentação local**: `po-ui/doc/llms-generated/po-<componente>.md`
3. **Verificar interfaces**: Ler docs dos tipos referenciados (ex: `PoTableAction`, `PoDynamicFormField`)
4. **Gerar o código** seguindo os padrões em [references/common-patterns.md](references/common-patterns.md)
5. **Verificar obrigatoriedade**: Propriedades marcadas com `Opcional: não` são obrigatórias

---

## Regras Importantes

- **Sempre ler o arquivo de doc local antes de gerar** — as propriedades mudam entre versões
- **Usar Angular reactive forms** com `po-dynamic-form [p-group-form]` para integrar ao formulário pai
- **Interfaces são tipagens** — `PoTableColumn`, `PoPageAction`, `PoDynamicFormField` etc. devem ser importadas
- **Serviços são injetáveis** — injetar no construtor do componente via DI do Angular
- **`p-items` vs `p-columns`** no `po-table`: ambos são obrigatórios (`Opcional: não`)
- **`po-page-dynamic-*`** pode ser usado via rota (configuração em `app-routing.module.ts`) ou via binding de propriedades

---

## Documentação Adicional

- Tema e tokens CSS: `po-ui/doc/sources/po-theme-readme.md`
- Índice completo com links: `po-ui/doc/sources/llms.txt`
