# PO-UI — Catálogo de Componentes

## Índice

- [Páginas (Page Templates)](#páginas-page-templates)
- [Componentes de Formulário](#componentes-de-formulário)
- [Tabelas e Listas](#tabelas-e-listas)
- [Navegação](#navegação)
- [Feedback e Overlays](#feedback-e-overlays)
- [Serviços](#serviços)
- [Componentes de Layout e Exibição](#componentes-de-layout-e-exibição)
- [Interfaces Comuns](#interfaces-comuns)

> Para documentação completa de cada componente (todos os inputs/outputs/métodos), leia:
> `po-ui/doc/llms-generated/po-<nome>.md`

---

## Páginas (Page Templates)

### `po-page-default`

Container principal genérico sem template fixo.

```html
<po-page-default p-title="Título" [p-actions]="actions" [p-breadcrumb]="breadcrumb">
  <!-- conteúdo -->
</po-page-default>
```

Inputs obrigatórios: `p-title`

---

### `po-page-list`

Container para telas de listagem com campo de filtro, ações e breadcrumb.

```html
<po-page-list p-title="Pessoas" [p-actions]="actions" [p-filter]="filter">
  <po-table [p-items]="items" [p-columns]="columns"></po-table>
</po-page-list>
```

Inputs obrigatórios: `p-title`
Inputs relevantes: `p-actions` (`PoPageAction[]`), `p-filter` (`PoPageFilter`), `p-breadcrumb`, `p-disclaimer-group`

**Interface `PoPageFilter`**:
```typescript
{ action: string | Function; advancedAction?: string | Function; placeholder?: string; width?: number }
```

---

### `po-page-edit`

Container para telas de edição/criação com botões de salvar/cancelar no header.

```html
<po-page-edit p-title="Editar Pessoa" [p-actions]="editActions" [p-breadcrumb]="breadcrumb">
  <!-- formulário -->
</po-page-edit>
```

Inputs obrigatórios: `p-title`

---

### `po-page-detail`

Container para visualização de registro com botões de editar/remover/voltar.

```html
<po-page-detail p-title="Detalhe" [p-actions]="detailActions" [p-breadcrumb]="breadcrumb">
  <!-- conteúdo de detalhe -->
</po-page-detail>
```

---

### `po-page-dynamic-table`

Tabela dinâmica que carrega dados e metadados via API. Suporta configuração via rota.

```typescript
// app-routing.module.ts
{
  path: 'people',
  component: PoPageDynamicTableComponent,
  data: {
    serviceApi: 'http://localhost:3000/v1/people',
    serviceMetadataApi: 'http://localhost:3000/v1/metadata'
  }
}
```

Ou via binding:
```html
<po-page-dynamic-table
  p-title="Pessoas"
  p-service-api="http://localhost:3000/v1/people"
  [p-fields]="fields"
  [p-actions]="tableActions">
</po-page-dynamic-table>
```

---

### `po-page-dynamic-edit`

Formulário dinâmico de edição/criação via API.

```html
<po-page-dynamic-edit
  p-title="Editar Pessoa"
  p-service-api="http://localhost:3000/v1/people"
  [p-fields]="fields">
</po-page-dynamic-edit>
```

---

### `po-page-dynamic-detail`

Detalhe dinâmico via API com botões de ação automáticos.

```html
<po-page-dynamic-detail
  p-title="Detalhe da Pessoa"
  p-service-api="http://localhost:3000/v1/people"
  [p-fields]="fields">
</po-page-dynamic-detail>
```

---

## Componentes de Formulário

### `po-input`

```html
<po-input p-label="Nome" [(ngModel)]="name" p-required="true" [p-max-length]="100"></po-input>
```

Inputs principais: `p-label`, `p-placeholder`, `p-required`, `p-disabled`, `p-readonly`, `p-max-length`, `p-min-length`, `p-pattern`, `p-mask`, `p-help`

---

### `po-combo`

Combobox com filtro. Aceita lista estática (`p-options`) ou serviço (`p-filter-service`).

```html
<po-combo p-label="UF" [(ngModel)]="uf" [p-options]="ufs" p-filter-mode="startsWith"></po-combo>
```

**Interface `PoComboOption`**: `{ label: string; value: any; disabled?: boolean }`

Com serviço (implementar `PoComboFilter`):
```typescript
interface PoComboFilter {
  getFilteredData(params: { property: string; value: string }): Observable<Array<PoComboOption>>;
  getObjectByValue(value: any, filterParams?: any): Observable<PoComboOption>;
}
```

---

### `po-select`

```html
<po-select p-label="Status" [(ngModel)]="status" [p-options]="statusOptions"></po-select>
```

**Interface `PoSelectOption`**: `{ label: string; value: any }`

---

### `po-multiselect`

```html
<po-multiselect p-label="Categorias" [(ngModel)]="categories" [p-options]="categoryOptions"></po-multiselect>
```

---

### `po-datepicker`

```html
<po-datepicker p-label="Data" [(ngModel)]="date" p-format="dd/mm/yyyy"></po-datepicker>
```

---

### `po-lookup`

Abre janela de busca com tabela.

```html
<po-lookup
  p-label="Cliente"
  [(ngModel)]="customer"
  p-field-label="name"
  p-field-value="id"
  [p-columns]="lookupColumns"
  [p-filter-service]="customerService">
</po-lookup>
```

Serviço deve implementar `PoLookupFilter`:
```typescript
interface PoLookupFilter {
  getFilteredItems(params: PoLookupFilteredItemsParams): Observable<PoLookupResponseApi>;
  getObjectByValue(value: any, filterParams?: any): Observable<any>;
}
```

---

### `po-dynamic-form`

Formulário dinâmico gerado a partir de um array de `PoDynamicFormField`.

```html
<po-dynamic-form [p-fields]="fields" [(p-value)]="formValue"></po-dynamic-form>
```

```typescript
import { PoDynamicFormField } from '@po-ui/ng-components';

fields: Array<PoDynamicFormField> = [
  { property: 'name', label: 'Nome', required: true, gridColumns: 6 },
  { property: 'email', label: 'E-mail', type: 'email', gridColumns: 6 },
  { property: 'birthdate', label: 'Nascimento', type: 'date', gridColumns: 4 },
  { property: 'status', label: 'Status', type: 'select', options: [...], gridColumns: 4 }
];
```

Tipos de `PoDynamicFormField.type`: `'boolean'`, `'currency'`, `'date'`, `'dateRange'`, `'decimal'`, `'email'`, `'number'`, `'password'`, `'select'`, `'time'`, `'combo'`, `'multiselect'`, `'radioGroup'`, `'checkboxGroup'`, `'lookup'`, `'upload'`, `'richText'`, `'codeEditor'`

Integração com Reactive Forms (formulário pai):
```html
<form [formGroup]="form">
  <po-dynamic-form [p-fields]="fields" p-group-form></po-dynamic-form>
</form>
```

---

## Tabelas e Listas

### `po-table`

```html
<po-table
  [p-columns]="columns"
  [p-items]="items"
  [p-actions]="tableActions"
  p-selectable="true"
  (p-selected)="onRowSelected($event)">
</po-table>
```

Inputs obrigatórios: `p-items`, `p-columns`

**Interface `PoTableColumn`**:
```typescript
{
  property: string;     // campo do objeto
  label?: string;       // cabeçalho
  type?: 'text' | 'date' | 'dateTime' | 'time' | 'number' | 'currency' | 'boolean' | 'link' | 'icon' | 'label' | 'subtitle' | 'detail' | 'columnTemplate' | 'cellTemplate';
  width?: string;       // ex: '100px'
  sortable?: boolean;
  visible?: boolean;
}
```

**Interface `PoTableAction`**:
```typescript
{
  label: string;
  action: Function;
  icon?: string;
  disabled?: boolean | Function;
  visible?: boolean | Function;
  separator?: boolean;
}
```

Inputs de seleção: `p-selectable`, `p-single-select`, `p-hide-select-all`
Inputs de paginação: `p-show-more-disabled`, evento `p-show-more`
Inputs de loading: `p-loading`, `p-loading-show-more`

---

### `po-dynamic-view`

```html
<po-dynamic-view [p-fields]="viewFields" [p-value]="record"></po-dynamic-view>
```

**Interface `PoDynamicViewField`**: similar ao `PoDynamicFormField` mas para visualização somente-leitura.

---

## Navegação

### `po-menu`

```html
<po-menu [p-menus]="menus" p-logo="assets/logo.png"></po-menu>
```

**Interface `PoMenuItem`**:
```typescript
{
  label: string;
  link?: string;
  icon?: string;
  shortLabel?: string;
  subItems?: Array<PoMenuItem>;
  action?: Function;
  badge?: PoMenuItemBadge;
}
```

---

### `po-breadcrumb`

```html
<po-breadcrumb [p-items]="breadcrumbItems"></po-breadcrumb>
```

**Interface `PoBreadcrumbItem`**: `{ label: string; link?: string }`

---

### `po-tabs`

```html
<po-tabs>
  <po-tab p-label="Geral" p-active="true">
    <!-- conteúdo da aba -->
  </po-tab>
  <po-tab p-label="Endereço">
    <!-- conteúdo da aba -->
  </po-tab>
</po-tabs>
```

---

### `po-stepper`

```html
<po-stepper>
  <po-step p-label="Identificação" p-status="done"><!-- conteúdo --></po-step>
  <po-step p-label="Endereço" p-status="active"><!-- conteúdo --></po-step>
  <po-step p-label="Confirmação"><!-- conteúdo --></po-step>
</po-stepper>
```

---

## Feedback e Overlays

### `po-modal`

```html
<po-modal #modal p-title="Confirmar" [p-primary-action]="confirm" [p-secondary-action]="cancel">
  <p>Deseja confirmar a operação?</p>
</po-modal>
```

```typescript
import { PoModalAction } from '@po-ui/ng-components';

@ViewChild('modal') modal: PoModalComponent;

confirm: PoModalAction = {
  label: 'Confirmar',
  action: () => { this.doConfirm(); this.modal.close(); }
};
cancel: PoModalAction = {
  label: 'Cancelar',
  action: () => this.modal.close()
};
```

---

### `po-loading-overlay`

```html
<po-loading-overlay [p-screen-lock]="isLoading" p-text="Carregando..."></po-loading-overlay>
```

---

## Serviços

### `PoNotificationService`

```typescript
import { PoNotificationService } from '@po-ui/ng-components';

constructor(private poNotification: PoNotificationService) {}

this.poNotification.success('Operação realizada com sucesso!');
this.poNotification.error('Erro ao processar.');
this.poNotification.warning('Atenção: dados incompletos.');
this.poNotification.information('Informação do sistema.');
```

**Interface `PoNotification`**: `{ message: string; orientation?: string; action?: Function; actionLabel?: string; duration?: number }`

---

### `PoDialogService`

```typescript
import { PoDialogService } from '@po-ui/ng-components';

constructor(private poDialog: PoDialogService) {}

// Alerta
this.poDialog.alert({
  title: 'Atenção',
  message: 'Ocorreu um erro.',
  ok: () => console.log('fechou')
});

// Confirmação
this.poDialog.confirm({
  title: 'Excluir',
  message: 'Deseja excluir este registro?',
  confirm: () => this.delete(),
  cancel: () => console.log('cancelou')
});
```

---

## Componentes de Layout e Exibição

### `po-info`

Exibe um label e um valor formatado.

```html
<po-info p-label="CPF" p-value="000.000.000-00"></po-info>
```

---

### `po-tag`

```html
<po-tag p-label="Ativo" p-color="color-10" p-type="success"></po-tag>
```

Tipos: `'success'`, `'warning'`, `'danger'`, `'info'`

---

### `po-container`

```html
<po-container p-title="Dados Pessoais" [p-no-padding]="false">
  <!-- conteúdo agrupado -->
</po-container>
```

---

### `po-divider`

```html
<po-divider p-label="Informações Adicionais"></po-divider>
```

---

### `po-skeleton`

```html
<po-skeleton [p-loading]="isLoading">
  <!-- conteúdo real -->
</po-skeleton>
```

---

## Interfaces Comuns

### `PoPageAction`

```typescript
{
  label: string;
  action?: Function;
  icon?: string;
  disabled?: boolean;
  url?: string;
}
```

### `PoBreadcrumb`

```typescript
{ favorite?: PoPageFavorite; items: Array<PoBreadcrumbItem> }
```

### `PoSelectOption` / `PoComboOption`

```typescript
{ label: string; value: any; disabled?: boolean }
```

---

## Ícones

PO-UI usa ícones do pacote próprio. Referência: https://po-ui.io/icons

Usar como string no formato `'an-<nome>'`, ex: `'an-plus'`, `'an-edit'`, `'an-trash'`, `'an-magnifying-glass'`.
