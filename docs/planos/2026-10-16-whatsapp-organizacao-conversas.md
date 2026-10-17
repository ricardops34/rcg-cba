# WhatsApp e Agenda — Importante, fixar no topo e etiquetas

> Criado em 2026-10-16. **Documento vivo.** Pedido do usuário: marcar **Importante** (bandeira vermelha que
> liga e desliga) nos agendamentos e nas conversas; **fixar até 4** contatos no topo; **etiquetas** nos
> contatos; **filtros** por CNAE, cidade e etiqueta personalizada pelo usuário.

## O que foi feito (código + testes de API; conferência em aparelho pendente)

| Recurso | Como funciona | Onde |
|---|---|---|
| **Importante — conversa** | Bandeira vermelha no cabeçalho da conversa: um toque marca, outro desmarca. Na lista: bandeira, fundo e borda vermelhos; aba **Importantes** (filtra no servidor). | `PATCH /whatsapp/conversas/:id/importante` |
| **Importante — agendamentos** | Atividade (Agenda) ganha o campo. Marcável no cadastro da atividade, ao agendar mensagem ou atendimento, e por bandeira em cada item da lista de agendamentos da conversa. Na Agenda: bandeira no evento, destaque vermelho, importantes no alto do dia, filtro **Só os importantes**. | `atividades.importante`; `PATCH …/agendamentos/:id` e `…/atendimentos-agendados/:id` aceitam `importante` |
| **Fixar no topo** | Até **4 por conexão**; a quinta é recusada com aviso. Só o dono da conexão fixa (supervisor não reordena a lista do vendedor). Fixadas vêm primeiro, a mais antiga no alto. | `PATCH /whatsapp/conversas/:id/fixada` |
| **Etiquetas** | **Pessoais**: cada usuário cria as dele (nome até 30 caracteres, 8 cores, até 30 etiquetas), aplica ao **contato** e só ele as vê. Criar, aplicar e excluir pelo botão de etiqueta no cabeçalho da conversa. Aparecem como chips na lista. | `GET/POST/PATCH/DELETE /whatsapp/etiquetas`, `PUT /whatsapp/conversas/:id/etiquetas` |
| **Filtros** | Botão de filtros ao lado da busca: **Etiqueta** (a do usuário), **Cidade** e **CNAE** do cadastro do cliente. As opções de cidade e CNAE são só as que existem nas conversas do usuário. Filtra no servidor (vale para a lista toda, não só a página). | `GET /whatsapp/filtros-conversas`; `etiquetaId`, `cidade`, `cnaeId`, `importantes` em `GET /whatsapp/conversas` |

**Migrations (aplicadas em dev; produção precisa de `migrate deploy` antes do deploy):**
`20261016140000_marcador_importante`, `20261016150000_whatsapp_fixar_etiquetas` (tabelas novas com RLS).

## Decisões assumidas (corrigir se não for isso)

| # | Assumi | Alternativa |
|---|---|---|
| E1 | Etiquetas são **pessoais** (só quem criou vê e filtra) | Catálogo da empresa, compartilhado |
| E2 | Etiqueta fica no **contato**; a conversa herda | Etiqueta por conversa |
| E3 | O **importante** da conversa é uma marca da conversa (vale para quem a vê, inclusive supervisor) | Marca pessoal de cada usuário |
| E4 | Fixar vale só para o **dono da conexão** | Supervisor também poderia fixar para si |
| E5 | Orçamento não tem marcador de importante; com "Só os importantes" ele sai da Agenda | Marcar orçamento também |

## Pendências

- ⬜ Conferir em aparelho: bandeira, fixar, etiquetas e filtros (cabeçalho com 3 ícones novos em tela estreita).
- ⬜ Filtro por etiqueta na lista **da equipe** (supervisor) não foi tratado: a tela de atendimento é a do próprio usuário.
- ⬜ Cor das etiquetas: conjunto fixo de 8; paleta livre só se pedirem.

## Registro

| Data | O quê |
|---|---|
| 2026-10-16 | API, tela e testes (9 de fixar/etiquetas) entregues. |
