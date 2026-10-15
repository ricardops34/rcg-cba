# Fluxograma — Módulo `estrutura`

```mermaid
flowchart TD
    A["GET /modulos"] --> S1[EstruturaService.listModulos]
    B["GET /estrutura/arvore"] --> S2[EstruturaService.listArvore]
    C["PATCH /estrutura/empresa/modulos/:id"] --> S3[definirModuloDaEmpresa]
    D["PATCH /estrutura/empresa/menus/:id"] --> S4[definirMenuDaEmpresa]
    E["POST/PATCH/DELETE /modulos|menus|rotinas (PlatformAdminGuard)"] --> S5[CRUD catalogo global]

    S1 --> F1[desativadosDaEmpresa]
    S2 --> F1
    F1 --> F2[EmpresaModulo/Menu/Rotina ativo=false -> set desativados]
    F1 --> F3[assinatura.plano.modulos/menus/rotinas]
    F3 --> F4{plano restringe (size>0)?}
    F4 -- sim --> F5[tudo que nao esta na lista do plano -> set desativados]
    F4 -- não --> F6[sem restricao adicional]
    F2 --> F7[retorna 3 sets]
    F5 --> F7
    F6 --> F7

    S1 --> F8[busca arvore so ativos no catalogo]
    F8 --> F9[filtra recursivamente pelos sets desativados]
    F9 --> R1[arvore so com o que esta ligado]

    S2 --> F10[busca arvore inteira, incluindo inativos no catalogo]
    F10 --> F11[marca ativoNaEmpresa = !desativados.has id, em cada nivel]
    F11 --> R2[arvore completa com flag]

    S5 --> F12{entidade e Menu com menuPaiId?}
    F12 -- sim --> F13[validarMenuPai: nao auto-pai, pai existe, mesmo modulo, pai nao e submenu, menu sem filhos]
    F13 --> F14[grava]
    F12 -- não --> F14
```
