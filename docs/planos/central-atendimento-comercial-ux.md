# Central de Atendimento Comercial — plano de UX e implementação

> Registrado em 2026-08-26 para preservar as decisões e permitir a retomada
> após reiniciar o ambiente. Este documento complementa
> [`whatsapp-vendedor.md`](./whatsapp-vendedor.md); não substitui as regras
> técnicas e de privacidade registradas naquele plano.

## Objetivo

Transformar `/comercial/atendimento` em uma **Central de Atendimento Comercial**:
a conversa do WhatsApp permanece como área principal e as ferramentas de vendas e
suporte aparecem ao lado, sem fechar ou perder o contexto do atendimento.

A experiência deve ser familiar para quem usa WhatsApp Web, mas deve respeitar a
identidade visual, os componentes, a terminologia e as permissões da plataforma.
Não copiar a paleta, o fundo ilustrado ou outros elementos de marca do WhatsApp.

## Decisões confirmadas

- A conversa é o centro da experiência, não mais um módulo dentro de um dashboard.
- Lista de conversas à esquerda, conversa no centro e contexto comercial à direita.
- Posição do cliente, orçamento e agendamento devem abrir como **cortinas laterais**.
- A cortina substitui o painel contextual; não abre sobre outra cortina.
- A conversa, novas mensagens e o compositor continuam disponíveis com a cortina aberta.
- Orçamento pode ser criado, alterado e encaminhado para aprovação dentro do atendimento.
- Retornos e mensagens podem ser agendados sem abandonar a conversa.
- Eventos comerciais devem aparecer no histórico interno do atendimento, separados das
  mensagens efetivamente enviadas ao cliente.
- Não criar cálculos, validações, consultas ou fluxos paralelos para a central.

## Regra obrigatória de reutilização

Antes de alterar uma ferramenta comercial, analisar sua tela original e reutilizar,
nesta ordem de preferência:

1. o mesmo componente;
2. os mesmos hooks, schemas e serviços;
3. os mesmos endpoints e validações do backend.

A API continua sendo a autoridade para preço, desconto, totais, permissões, estados e
aprovação. Uma ação feita na central deve produzir o mesmo resultado da tela original.

## Inventário técnico já confirmado

### Central atual

- `apps/web/src/app/(app)/comercial/atendimento/page.tsx`
- `apps/web/src/components/whatsapp/composer.tsx`
- `apps/web/src/components/whatsapp/acoes-cliente.tsx`
- `apps/web/src/components/whatsapp/mensagem-bolha.tsx`

### Posição do cliente

- Componente reutilizado: `apps/web/src/components/comercial/posicao-cliente-conteudo.tsx`
- A central já renderiza `PosicaoClienteConteudo` diretamente.
- Portanto, consultas, abas e filtros existentes já são compartilhados.
- Problema atual é principalmente de composição: o conteúdo completo é comprimido em
  uma coluna padrão de 384 px, causando cortes, sobreposição e rolagem horizontal.

### Orçamento

- Componente reutilizado: `apps/web/src/components/crud/orcamento-form.tsx`
- A central já renderiza `OrcamentoFormContent` com o cliente selecionado.
- A tela original e a central compartilham formulário, regras e fluxo de gravação.
- O formulário já contém geração de PDF, cópia, histórico, integração e travas de
  desconto/aprovação.
- A largura atual de 736 px ainda é apertada para o formulário completo.

### Agenda e retornos

- Tela existente: `apps/web/src/app/(app)/crm/agenda/page.tsx`
- Serviços do WhatsApp: `whatsapp-agendamento.service.ts` e
  `whatsapp-agenda.service.ts` na API.
- Antes de criar uma cortina de retorno, mapear também o formulário existente de
  atividade e reutilizar seu schema/serviço.

### Backend e contratos

- `apps/api/src/modules/whatsapp/whatsapp-acoes.service.ts`
- `apps/api/src/modules/whatsapp/whatsapp-agendamento.service.ts`
- `apps/api/src/modules/orcamentos/**`
- `packages/contracts/src/whatsapp.ts`
- `packages/contracts/src/orcamento.ts`
- `packages/contracts/src/posicao-cliente.ts`

## Problemas de UX observados

1. Os três painéis parecem caixas independentes e deixam a tela com aparência remontada.
2. A posição do cliente não cabe na coluna e gera conteúdo ilegível.
3. O chat não tem cabeçalho contextual forte como no WhatsApp Web.
4. Telefones de contato, cliente, conexão e atendente têm significado ambíguo.
5. A lista de conversas não apresenta avatar, prévia, horário e status com hierarquia clara.
6. Indicadores comerciais usam ícones pequenos e dependem de tooltip.
7. Ações comerciais importantes ficam escondidas atrás da chave inglesa.
8. O compositor não possui botão de envio explícito.
9. O fluxo sem cliente vinculado precisa tornar a confirmação mais segura.
10. O layout abaixo de `xl` oculta o painel direito, mas ainda não oferece uma cortina
    equivalente para tablet e celular.

## Direção visual

### Composição

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Busca / conexão                              Nova conversa / status  │
├──────────────────┬─────────────────────────────┬─────────────────────┤
│ Conversas        │ Cabeçalho do atendimento   │ Contexto/cortina    │
│                  ├─────────────────────────────┤                     │
│                  │ Mensagens e eventos         │ Cliente             │
│                  │                             │ Posição             │
│                  │                             │ Orçamento           │
│                  ├─────────────────────────────┤ Agenda              │
│                  │ Ações | Mensagem | Enviar   │                     │
└──────────────────┴─────────────────────────────┴─────────────────────┘
```

- Um contêiner visual único envolve lista, conversa e painel direito.
- Divisórias, e não vários cartões arredondados, separam as três áreas.
- A coluna central tem prioridade e largura flexível.
- Cada área possui sua própria rolagem vertical; não deve existir rolagem horizontal
  da página ou da cortina inteira.
- Cabeçalho da conversa e compositor permanecem fixos.

### Identidade

- Usar `primary`, `background`, `muted`, `border` e `destructive` do tema atual.
- Manter tipografia e componentes shadcn já adotados pelo sistema.
- Não importar verde, preto ou textura do WhatsApp Web.
- Assinatura própria: contexto comercial persistente, com próxima ação e orçamento
  relacionados ao atendimento.

## Cortinas e larguras iniciais

- Contato: 320 px.
- Posição do cliente: 680 px.
- Orçamento: 820 px (redimensionável).
- Agendamento: entre 480 e 560 px, após analisar o formulário existente.
- Em viewport menor que `xl`, usar `Sheet/ResizableSheetContent` em vez de ocultar a
  funcionalidade.
- Em celular, a cortina ocupa a tela e oferece retorno explícito à conversa.

## Plano de execução

### Etapa 1 — estrutura e hierarquia

- [x] Transformar as três caixas atuais em uma superfície única com divisórias.
- [x] Criar cabeçalho da conversa com avatar, nome, WhatsApp e responsável.
- [x] Adicionar atalhos rotulados para Posição e Orçamento no cabeçalho.
- [x] Aumentar as larguras padrão das cortinas conforme definido acima.
- [x] Impedir overflow horizontal no painel direito.
- [x] Manter o redimensionamento e as preferências já salvas em `localStorage`.

### Etapa 2 — lista de atendimentos

- [x] Adicionar avatar e estado selecionado inequívoco.
- [x] Verificar se o contrato já fornece horário e prévia da última mensagem.
- [x] Exibir prévia, horário e não lidas. O responsável permanece no cabeçalho para
  evitar excesso de informação em cada item.
- [x] Exibir retorno e aprovação como badges curtos na lista.
- [x] Adicionar filtros suportados pelo contrato atual: todas, não lidas e sem vínculo.
- [x] Incluir próximo retorno e aprovação pendente no contrato, respeitando permissões.

### Etapa 3 — contexto do cliente

- [x] Separar visualmente WhatsApp da conversa, conexão de envio e responsável.
- [x] Exibir telefones cadastrados e comparar divergência com o WhatsApp da conversa.
- [x] Alertar quando WhatsApp e telefone cadastrado divergirem.
- [x] Agrupar contato, situação comercial, responsável e conexão de envio.
- [x] Manter vínculo manual e confirmação existente para desfazer o vínculo.

### Etapa 4 — ferramentas comerciais

- [x] Preservar `PosicaoClienteConteudo` e ajustar apenas o invólucro responsivo.
- [x] Preservar `OrcamentoFormContent`, incluindo suas regras de edição e aprovação.
- [x] Confirmar que retorno usa contrato e endpoint específicos, que delegam ao mesmo
  `AtividadesService` e fixam cliente/vendedor no servidor.
- [x] Reorganizar `AcoesCliente` em Financeiro, Fiscal, Comercial e Relacionamento.
- [x] Expor Posição e Orçamento no cabeçalho; retorno permanece em Ferramentas porque
  o diálogo e sua permissão pertencem a `AcoesCliente`.

### Etapa 5 — conversa e compositor

- [x] Diferenciar eventos internos de mensagens enviadas ao WhatsApp usando
  `WhatsappAcaoRegistro`, que já possuía RLS e auditoria.
- [x] Apresentar listas fiscais/financeiras extensas como cartões expansíveis.
- [x] Adicionar botão de envio explícito sem remover os atalhos existentes.
- [x] Preservar resposta, anexos, áudio e mensagens agendadas.
- [x] Manter a cortina montada e a conversa utilizável durante orçamento/consulta.
- [x] Substituir a coluna contextual direita por cortina sobreposta para contato,
  posição e orçamento, removendo o controle de recolhimento defeituoso.
- [x] Tornar a cortina redimensionável no desktop, persistir sua largura e usar
  largura total responsiva em celular, sem alça de redimensionamento por toque.

### Etapa 6 — responsividade e validação

- [x] Implementar navegação responsiva lista → conversa e cortinas abaixo de `xl`.
- [x] Conferir visualmente em 1440, 1280, 1024, 768 e 390 px com sessão autenticada.
- [x] Validar navegação somente por teclado e foco visível.
- [x] Validar contraste e tooltips de botões apenas com ícone.
- [x] Executar TypeScript e lint do app web.
- [x] Fazer teste visual com conversa longa, cliente sem vínculo, posição cheia e
  orçamento com muitos itens.
- [x] Fazer teste funcional das mesmas operações na central e nas telas originais.

## Primeira alteração preparada (ainda não aplicada)

Na sessão de 2026-08-26 foi preparado, mas não gravado por falha do helper de escrita,
um primeiro patch para `atendimento/page.tsx`:

- incluir avatar na lista e no cabeçalho da conversa;
- criar cabeçalho contextual com nome, telefone e responsável;
- adicionar atalhos `Posição` e `Orçamento`;
- usar um contêiner único com divisórias;
- alterar larguras de contato/posição/orçamento para 320/680/820 px;
- adicionar `overflow-x-hidden` à cortina;
- manter `PosicaoClienteConteudo` e `OrcamentoFormContent` sem alterar suas regras.

Esse patch deve ser refeito a partir do arquivo atual depois do reinício, para evitar
aplicar contexto desatualizado.

## Critérios de aceite

- A conversa nunca é desmontada ao consultar ou editar dados comerciais.
- Posição do cliente não apresenta texto sobreposto nem barra horizontal global.
- Orçamento criado pela central respeita as mesmas regras da tela de CRM.
- Desconto e aprovação produzem os mesmos estados e erros nas duas entradas.
- O usuário identifica sem ambiguidade contato, cliente, conexão e responsável.
- Ações indisponíveis explicam o motivo.
- Nenhuma informação de outro tenant ou atendimento pode aparecer.
- A central continua utilizável em notebook, tablet e celular.
- Nenhuma regra comercial é duplicada no componente da central.

## Estado ao encerrar esta sessão

- [x] Referência visual e objetivo definidos com o usuário.
- [x] Implementação atual da central localizada.
- [x] Reutilização de posição e orçamento confirmada no código.
- [x] Problemas principais e direção de layout registrados.
- [x] Primeira etapa de alterações do frontend aplicada.
- [x] TypeScript e lint dos arquivos alterados executados no container web.

### Ao retomar

1. Ler este documento e `docs/planos/whatsapp-vendedor.md`.
2. Conferir `git status` e reler `atendimento/page.tsx`.
3. Analisar o formulário de atividade/agendamento ainda não inventariado.
4. Implementar primeiro a Etapa 1 em mudanças pequenas e verificáveis.
5. Rodar TypeScript/lint e inspecionar visualmente antes de avançar para as outras etapas.

## Atualização de execução — 2026-08-26

O planejamento técnico foi implementado. Esta seção substitui as notas antigas
de “primeira alteração preparada” e “ao retomar”, que foram mantidas acima como
histórico da retomada após o reinício.

- [x] Layout contínuo inspirado na organização do WhatsApp Web e adaptado à
  identidade visual do sistema.
- [x] Lista, conversa e contexto comercial responsivos; no espaço reduzido,
  posição, contato e orçamento abrem em cortinas sem desmontar a conversa.
- [x] Posição do cliente e formulário de orçamento originais reutilizados, sem
  duplicar validações comerciais.
- [x] Sinais de retorno agendado e orçamento aguardando aprovação adicionados à
  lista de conversas.
- [x] Telefones do vínculo comparados com o número do WhatsApp, com aviso quando
  houver divergência.
- [x] Múltiplos contatos de WhatsApp por cliente exibidos na Posição do Cliente,
  com nome, número, e-mail e finalidade: Geral, Financeiro, Compras,
  Contabilidade/Fiscal ou Outros. Cada contato abre sua própria conversa.
- [x] Foto do perfil do WhatsApp copiada para o contato no vínculo, com fallback
  para iniciais quando indisponível por privacidade.
- [x] Nome do próprio usuário editável em Meu perfil e usado como assinatura
  das mensagens enviadas ao cliente.
- [x] Eventos comerciais integrados à linha do tempo e resumos extensos exibidos
  em cartões compactos expansíveis.
- [x] Contratos compartilhados, endpoint de eventos e documentação atualizados.
- [x] TypeScript e lint dos arquivos alterados validados em frontend e backend.
- [x] Rota web respondeu HTTP 200 e o novo endpoint protegido respondeu HTTP 401
  sem autenticação, confirmando que foi registrado e está sob o guard esperado.

Os itens de aceite manual foram concluídos após restaurar o backup MySQL de
2026-08-26 e reimportar os dados legados. O teste autenticado percorreu as cinco
resoluções, vínculo de cliente, conversa, posição e orçamento usando o cliente
00434801. As capturas confirmaram a conversa preservada ao lado das ferramentas.
Durante o aceite foram corrigidos o empilhamento da barra móvel, a grade compacta
da posição, a repetição de telefones e o estado de erro para usuário sem vendedor.

## Atualização de responsividade — 2026-08-28

- [x] Cadastro de disponibilidade em telas pequenas nos níveis módulo, menu e rotina.
- [x] Interruptor visível diretamente em cada linha da Estrutura de Menu, sem abrir a edição.
- [x] Regra hierárquica: módulo bloqueado prevalece sobre menus e rotinas; menu só aparece
  no celular quando ele, seu módulo e ao menos uma rotina permitida estiverem liberados.
- [x] Menu lateral móvel, busca global e proteção de acesso direto usam a mesma regra.
- [x] Migration aplicada e validações de contratos, TypeScript do frontend e lint concluídas.
