# Padrão das barras de listagem

Use `apps/web/src/components/crud/crud-header.tsx` (`CrudHeader`) nas listagens.

- Busca à esquerda; ações agrupadas à direita.
- Filtros e ações específicas entram na propriedade `actions`, antes de
  **Atualizar** e da ação principal **Novo**, fornecidas pelo componente.
- Ações secundárias usam `Button variant="outline"`, com o tamanho padrão.
  A criação usa o botão principal do próprio `CrudHeader`.
- Não coloque uma ação da listagem em uma segunda barra independente.
  A quebra de linha em telas estreitas é controlada pelo componente compartilhado.
- Filtros rápidos e navegação de período podem ficar abaixo da barra, à esquerda.
- Ações de geração que exigem parâmetros abrem um diálogo com campos rotulados,
  validação pelo contrato compartilhado e botões Cancelar/Confirmar. Durante o
  processamento, impeça envios duplicados. Use os parâmetros enviados na mensagem
  de sucesso, sem depender de filtros que possam mudar enquanto a requisição roda.

Referência: `/admin/feriados` mantém **Gerar feriados nacionais**, **Atualizar** e
**Novo feriado** no mesmo `CrudHeader`. A geração solicita um ano entre 2000 e
2100, sugere o ano exibido e, ao concluir, mostra a listagem do ano gerado.

Ao revisar uma listagem, confira a ordem das ações, tamanho e variante dos botões,
quebra responsiva e a ausência de barras locais duplicadas. Mudanças no padrão
devem atualizar este documento e o componente compartilhado.
