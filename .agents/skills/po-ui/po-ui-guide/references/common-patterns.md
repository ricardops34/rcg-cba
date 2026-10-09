# PO-UI — Padrões Comuns

## Índice

- [Setup do Módulo](#setup-do-módulo)
- [Padrão CRUD: Lista → Edição → Detalhe](#padrão-crud-lista--edição--detalhe)
- [Tela de Lista com po-page-list + po-table](#tela-de-lista-com-po-page-list--po-table)
- [Formulário com po-page-edit + po-dynamic-form](#formulário-com-po-page-edit--po-dynamic-form)
- [Tela de Detalhe com po-page-detail + po-dynamic-view](#tela-de-detalhe-com-po-page-detail--po-dynamic-view)
- [CRUD Dinâmico com po-page-dynamic-*](#crud-dinâmico-com-po-page-dynamic-)
- [Serviço de API com PoDataTransform](#serviço-de-api-com-podatatransform)
- [Modal de Confirmação](#modal-de-confirmação)
- [Formulário Reativo com po-dynamic-form](#formulário-reativo-com-po-dynamic-form)

---

## Setup do Módulo

```typescript
// app.module.ts
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { PoModule } from '@po-ui/ng-components';

import { AppComponent } from './app.component';
import { APP_ROUTES } from './app-routing.module';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    RouterModule.forRoot(APP_ROUTES),
    PoModule
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

---

## Padrão CRUD: Lista → Edição → Detalhe

```typescript
// app-routing.module.ts
import { Routes } from '@angular/router';
import { PeopleListComponent } from './people/people-list.component';
import { PeopleEditComponent } from './people/people-edit.component';
import { PeopleDetailComponent } from './people/people-detail.component';

export const APP_ROUTES: Routes = [
  { path: 'people', component: PeopleListComponent },
  { path: 'people/new', component: PeopleEditComponent },
  { path: 'people/:id/edit', component: PeopleEditComponent },
  { path: 'people/:id', component: PeopleDetailComponent },
  { path: '', redirectTo: 'people', pathMatch: 'full' }
];
```

---

## Tela de Lista com po-page-list + po-table

```typescript
// people-list.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  PoPageAction, PoTableColumn, PoTableAction,
  PoPageFilter, PoNotificationService
} from '@po-ui/ng-components';
import { PeopleService } from './people.service';

@Component({
  selector: 'app-people-list',
  templateUrl: './people-list.component.html'
})
export class PeopleListComponent implements OnInit {

  items: Array<any> = [];
  loading = false;

  columns: Array<PoTableColumn> = [
    { property: 'name', label: 'Nome' },
    { property: 'email', label: 'E-mail' },
    { property: 'status', label: 'Status', type: 'label',
      labels: [
        { value: 'active', color: 'color-10', label: 'Ativo' },
        { value: 'inactive', color: 'color-07', label: 'Inativo' }
      ]
    }
  ];

  tableActions: Array<PoTableAction> = [
    { label: 'Editar', action: this.edit.bind(this), icon: 'an-edit' },
    { label: 'Excluir', action: this.confirmDelete.bind(this), icon: 'an-trash', separator: true }
  ];

  pageActions: Array<PoPageAction> = [
    { label: 'Novo', action: () => this.router.navigate(['/people/new']), icon: 'an-plus' }
  ];

  filter: PoPageFilter = {
    action: this.search.bind(this),
    placeholder: 'Pesquisar por nome...'
  };

  breadcrumb = {
    items: [{ label: 'Home', link: '/' }, { label: 'Pessoas' }]
  };

  constructor(
    private router: Router,
    private peopleService: PeopleService,
    private poNotification: PoNotificationService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.peopleService.getAll().subscribe({
      next: (data) => { this.items = data; this.loading = false; },
      error: () => { this.poNotification.error('Erro ao carregar dados.'); this.loading = false; }
    });
  }

  search(term: string): void {
    this.loading = true;
    this.peopleService.search(term).subscribe({
      next: (data) => { this.items = data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  edit(row: any): void {
    this.router.navigate(['/people', row.id, 'edit']);
  }

  confirmDelete(row: any): void {
    // usar PoDialogService para confirmar — ver padrão Modal de Confirmação abaixo
  }
}
```

```html
<!-- people-list.component.html -->
<po-page-list
  p-title="Pessoas"
  [p-actions]="pageActions"
  [p-filter]="filter"
  [p-breadcrumb]="breadcrumb">

  <po-table
    [p-items]="items"
    [p-columns]="columns"
    [p-actions]="tableActions"
    [p-loading]="loading">
  </po-table>

</po-page-list>
```

---

## Formulário com po-page-edit + po-dynamic-form

```typescript
// people-edit.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { PoDynamicFormField, PoNotificationService } from '@po-ui/ng-components';
import { PeopleService } from './people.service';

@Component({
  selector: 'app-people-edit',
  templateUrl: './people-edit.component.html'
})
export class PeopleEditComponent implements OnInit {

  form: FormGroup;
  isEdit = false;
  loading = false;

  fields: Array<PoDynamicFormField> = [
    { property: 'name', label: 'Nome', required: true, gridColumns: 6 },
    { property: 'email', label: 'E-mail', type: 'email', required: true, gridColumns: 6 },
    { property: 'birthdate', label: 'Data de Nascimento', type: 'date', gridColumns: 4 },
    {
      property: 'status', label: 'Status', type: 'select', gridColumns: 4,
      options: [
        { label: 'Ativo', value: 'active' },
        { label: 'Inativo', value: 'inactive' }
      ]
    },
    { property: 'notes', label: 'Observações', type: 'string', rows: 3, gridColumns: 12 }
  ];

  breadcrumb = {
    items: [
      { label: 'Home', link: '/' },
      { label: 'Pessoas', link: '/people' },
      { label: '' }  // preenchido no ngOnInit
    ]
  };

  editActions = {
    save: { label: 'Salvar', action: this.save.bind(this) },
    cancel: { label: 'Cancelar', action: this.cancel.bind(this) }
  };

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private peopleService: PeopleService,
    private poNotification: PoNotificationService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({});
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!id;
    this.breadcrumb.items[2].label = this.isEdit ? 'Editar' : 'Novo';

    if (this.isEdit) {
      this.loading = true;
      this.peopleService.getById(id).subscribe({
        next: (data) => { this.form.patchValue(data); this.loading = false; },
        error: () => { this.poNotification.error('Erro ao carregar.'); this.loading = false; }
      });
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.poNotification.warning('Preencha os campos obrigatórios.');
      return;
    }
    this.loading = true;
    const data = this.form.value;
    const action = this.isEdit
      ? this.peopleService.update(this.route.snapshot.paramMap.get('id'), data)
      : this.peopleService.create(data);

    action.subscribe({
      next: () => {
        this.poNotification.success('Salvo com sucesso!');
        this.router.navigate(['/people']);
      },
      error: () => { this.poNotification.error('Erro ao salvar.'); this.loading = false; }
    });
  }

  cancel(): void {
    this.router.navigate(['/people']);
  }
}
```

```html
<!-- people-edit.component.html -->
<po-page-edit
  [p-title]="isEdit ? 'Editar Pessoa' : 'Nova Pessoa'"
  [p-breadcrumb]="breadcrumb"
  [p-save-action]="editActions.save"
  [p-cancel-action]="editActions.cancel">

  <form [formGroup]="form">
    <po-dynamic-form [p-fields]="fields" p-group-form></po-dynamic-form>
  </form>

</po-page-edit>
```

---

## Tela de Detalhe com po-page-detail + po-dynamic-view

```typescript
// people-detail.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PoDynamicViewField, PoNotificationService } from '@po-ui/ng-components';
import { PeopleService } from './people.service';

@Component({
  selector: 'app-people-detail',
  templateUrl: './people-detail.component.html'
})
export class PeopleDetailComponent implements OnInit {

  record: any = {};
  loading = false;

  fields: Array<PoDynamicViewField> = [
    { property: 'name', label: 'Nome', gridColumns: 6 },
    { property: 'email', label: 'E-mail', gridColumns: 6 },
    { property: 'birthdate', label: 'Data de Nascimento', type: 'date', gridColumns: 4 },
    { property: 'status', label: 'Status', gridColumns: 4 }
  ];

  breadcrumb = {
    items: [
      { label: 'Home', link: '/' },
      { label: 'Pessoas', link: '/people' },
      { label: 'Detalhe' }
    ]
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private peopleService: PeopleService,
    private poNotification: PoNotificationService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading = true;
    this.peopleService.getById(id).subscribe({
      next: (data) => { this.record = data; this.loading = false; },
      error: () => { this.poNotification.error('Erro ao carregar.'); this.loading = false; }
    });
  }

  edit(): void {
    this.router.navigate(['/people', this.record.id, 'edit']);
  }

  back(): void {
    this.router.navigate(['/people']);
  }
}
```

```html
<!-- people-detail.component.html -->
<po-page-detail
  p-title="Detalhe da Pessoa"
  [p-breadcrumb]="breadcrumb"
  [p-back-action]="{ label: 'Voltar', action: back.bind(this) }"
  [p-edit-action]="{ label: 'Editar', action: edit.bind(this) }">

  <po-dynamic-view [p-fields]="fields" [p-value]="record"></po-dynamic-view>

</po-page-detail>
```

---

## CRUD Dinâmico com po-page-dynamic-*

Para CRUDs simples onde a API segue o padrão REST PO-UI, é possível usar os componentes dinâmicos diretamente via rota:

```typescript
// app-routing.module.ts
import {
  PoPageDynamicTableComponent,
  PoPageDynamicEditComponent,
  PoPageDynamicDetailComponent
} from '@po-ui/ng-components';

export const APP_ROUTES: Routes = [
  {
    path: 'people',
    component: PoPageDynamicTableComponent,
    data: {
      serviceApi: '/api/v1/people',
      title: 'Pessoas',
      actions: { new: '/people/new', detail: '/people/:id', edit: '/people/:id/edit', remove: true }
    }
  },
  {
    path: 'people/new',
    component: PoPageDynamicEditComponent,
    data: { serviceApi: '/api/v1/people', title: 'Nova Pessoa' }
  },
  {
    path: 'people/:id/edit',
    component: PoPageDynamicEditComponent,
    data: { serviceApi: '/api/v1/people', title: 'Editar Pessoa' }
  },
  {
    path: 'people/:id',
    component: PoPageDynamicDetailComponent,
    data: { serviceApi: '/api/v1/people', title: 'Detalhe da Pessoa' }
  }
];
```

A API deve retornar a lista no formato:
```json
{ "items": [...], "hasNext": false }
```

---

## Serviço de API com PoDataTransform

Para APIs que não seguem o padrão PO-UI, usar `PoDataTransform`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PeopleService {

  private readonly API = '/api/v1/people';

  constructor(private http: HttpClient) {}

  getAll(): Observable<Array<any>> {
    return this.http.get<any>(this.API).pipe(
      map(response => response.data || response.items || response)
    );
  }

  getById(id: string): Observable<any> {
    return this.http.get<any>(`${this.API}/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post<any>(this.API, data);
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put<any>(`${this.API}/${id}`, data);
  }

  remove(id: string): Observable<any> {
    return this.http.delete<any>(`${this.API}/${id}`);
  }

  search(term: string): Observable<Array<any>> {
    return this.http.get<any>(`${this.API}?search=${term}`).pipe(
      map(response => response.items || response)
    );
  }
}
```

---

## Modal de Confirmação

### Via PoDialogService (recomendado para confirmações simples)

```typescript
import { PoDialogService } from '@po-ui/ng-components';

constructor(private poDialog: PoDialogService) {}

confirmDelete(item: any): void {
  this.poDialog.confirm({
    title: 'Excluir',
    message: `Deseja excluir "${item.name}"?`,
    confirm: () => this.delete(item.id),
    cancel: () => {}
  });
}

private delete(id: string): void {
  this.service.remove(id).subscribe({
    next: () => {
      this.poNotification.success('Registro excluído.');
      this.load();
    },
    error: () => this.poNotification.error('Erro ao excluir.')
  });
}
```

### Via po-modal (para conteúdo complexo)

```html
<po-modal #deleteModal p-title="Excluir Registro"
  [p-primary-action]="confirmAction"
  [p-secondary-action]="cancelAction">
  <p>Confirma a exclusão?</p>
</po-modal>
```

```typescript
import { ViewChild } from '@angular/core';
import { PoModalComponent, PoModalAction } from '@po-ui/ng-components';

@ViewChild('deleteModal') deleteModal: PoModalComponent;
private selectedId: string;

confirmAction: PoModalAction = {
  label: 'Confirmar',
  action: () => { this.delete(this.selectedId); this.deleteModal.close(); }
};

cancelAction: PoModalAction = {
  label: 'Cancelar',
  action: () => this.deleteModal.close()
};

openDeleteModal(item: any): void {
  this.selectedId = item.id;
  this.deleteModal.open();
}
```

---

## Formulário Reativo com po-dynamic-form

Para cenários onde é preciso controlar o formulário programaticamente:

```typescript
import { Component, ViewChild, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { PoDynamicFormComponent, PoDynamicFormField } from '@po-ui/ng-components';

@Component({
  selector: 'app-form',
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <po-dynamic-form
        #dynamicForm
        [p-fields]="fields"
        p-group-form>
      </po-dynamic-form>
      <po-button p-label="Salvar" p-type="primary" type="submit"></po-button>
    </form>
  `
})
export class FormComponent implements OnInit {

  @ViewChild('dynamicForm') dynamicForm: PoDynamicFormComponent;

  form: FormGroup;

  fields: Array<PoDynamicFormField> = [
    { property: 'name', label: 'Nome', required: true },
    { property: 'age', label: 'Idade', type: 'number' }
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({});
  }

  onSubmit(): void {
    if (this.form.valid) {
      console.log(this.form.value);
    }
  }
}
```

---

## Validação de Campos no po-dynamic-form

```typescript
// Validação via serviço (URL ou Function)
fields: Array<PoDynamicFormField> = [
  {
    property: 'cpf',
    label: 'CPF',
    required: true,
    validate: this.validateCpf.bind(this)  // ou URL de API
  }
];

validateCpf(value: string): Observable<PoDynamicFormFieldValidation> {
  // retorna Observable com { value?, error? }
  const isValid = this.cpfService.validate(value);
  return of(isValid ? {} : { error: 'CPF inválido' });
}
```

---

## Lookup Customizado

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PoLookupFilter, PoLookupFilteredItemsParams, PoLookupResponseApi } from '@po-ui/ng-components';

@Injectable({ providedIn: 'root' })
export class CustomerLookupService implements PoLookupFilter {

  constructor(private http: HttpClient) {}

  getFilteredItems(params: PoLookupFilteredItemsParams): Observable<PoLookupResponseApi> {
    const { filter, page, pageSize } = params;
    return this.http.get<any>(`/api/v1/customers?search=${filter}&page=${page}&pageSize=${pageSize}`).pipe(
      map(response => ({
        items: response.items,
        hasNext: response.hasNext
      }))
    );
  }

  getObjectByValue(value: any): Observable<any> {
    return this.http.get<any>(`/api/v1/customers/${value}`);
  }
}
```

```html
<po-lookup
  p-label="Cliente"
  [(ngModel)]="customerId"
  p-field-label="name"
  p-field-value="id"
  [p-columns]="[
    { property: 'id', label: 'Código', width: '100px' },
    { property: 'name', label: 'Nome' }
  ]"
  [p-filter-service]="customerLookupService">
</po-lookup>
```
