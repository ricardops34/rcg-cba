# Ferramentas de IA — o mapa

Este diretório documenta **todas** as ferramentas que algum modelo de IA pode
chamar neste sistema: o que cada uma faz, onde o código dela está, e — a
pergunta que mais importa — **se a regra que a governa está em código ou em
prompt**.

## A regra que organiza tudo

> **Acesso é código. Comportamento é prompt.**

Instrução de prompt **não é barreira de segurança**. Ela descreve o
comportamento desejado a um modelo que a pessoa do outro lado pode tentar levar
a outro. Serve para tom, formato e cuidado — nunca para decidir quem alcança o
quê.

Ao mexer em qualquer ferramenta, a pergunta é sempre a mesma: *se o modelo
ignorasse a instrução, o que aconteceria?* Se a resposta for "vazaria dado" ou
"gravaria algo", a regra está no lugar errado e precisa descer para o código.

| Tipo de regra | Onde vive | Exemplo |
|---|---|---|
| Quem alcança qual dado | **Código** | escopo de carteira, recorte por cliente |
| O que existe para ser chamado | **Código** | catálogo filtrado por permissão |
| O que grava | **Código** | confirmação obrigatória na tela |
| Como responder | Prompt | tom, tamanho, "não invente número" |
| O que dizer antes de agir | Prompt | "confirme qual documento antes de mandar" |

## As três famílias

São três modelos diferentes, com interlocutores diferentes. Nunca compartilham
catálogo — e a separação é deliberada.

| Família | Quem está do outro lado | Autenticação | Pode gravar? | Documento |
|---|---|---|---|---|
| [Agente interno](agente-interno.md) | funcionário **logado** | sessão + RBAC | sim, com confirmação | 24 ferramentas |
| [WhatsApp — cliente](whatsapp-cliente.md) | cliente ou desconhecido | vínculo número↔cadastro | não | 11 ferramentas |
| [WhatsApp — funcionário](whatsapp-funcionario.md) | vendedor/gerente/supervisor | telefone + código confirmado | **não** | 8 ferramentas |

A diferença entre a primeira e a terceira é o ponto que mais confunde quem
chega: o mesmo vendedor tem poderes diferentes conforme o canal. Logado, ele
cria orçamento; pelo WhatsApp, só consulta. É deliberado — no WhatsApp não há
senha, só um número confirmado, e um celular perdido não pode virar acesso de
escrita.

## Onde ficam os prompts

| Família | Arquivo | Observação |
|---|---|---|
| Agente interno | `agente-chat.service.ts` → `montarContexto()` | a personalidade é configurável por empresa em Administração > Agente IA; o resto do contexto é fixo no código |
| WhatsApp — cliente | `triagem/triagem-prompt.ts` → `montarPromptTriagem()` | as informações da empresa vêm de `whatsapp_config.atendimentoInformacoes` |
| WhatsApp — funcionário | `triagem/triagem-prompt.ts` → `montarPromptFuncionario()` | prompt próprio, e não um parágrafo a mais no do cliente |

## Como mexer numa ferramenta

1. **Achar** na tabela do documento da família. Cada linha aponta o arquivo e o
   serviço a que a ferramenta delega.
2. **Mudar o comportamento** (o que ela responde, como): mexa na `descricao` —
   é ela que o modelo lê para decidir quando chamar — e no executor.
3. **Mudar quem alcança**: mexa no recorte, **nunca** no prompt. Ver
   `common/escopo/escopo-vendedores.ts` e `common/escopo/quem-pede.ts`.
4. **Rodar os testes de garantia** antes de dar por feito:
   - `apps/api/src/modules/whatsapp/triagem/seguranca.spec.ts` — os invariantes
     do WhatsApp, inclusive a lista exata do que um número desconhecido alcança;
   - `apps/api/src/modules/agente/agente-tools.permissao.spec.ts` — permissão ×
     configuração do agente interno;
   - `apps/api/src/modules/whatsapp/triagem/triagem-funcionario-tools.spec.ts` —
     o recorte de carteira em toda consulta do funcionário.

## Como acrescentar uma ferramenta

O checklist que evita os erros que já aconteceram aqui:

- [ ] **Ela precisa de permissão?** No agente interno, `permissao` é
      obrigatória — sem ela a ferramenta fica disponível a todos.
- [ ] **Ela grava?** Marque `escrita: true`. Ação de escrita nunca executa
      direto: vira pendência que o usuário confirma na tela.
- [ ] **Ela recebe "de quem é o dado"?** Não deve. O escopo é resolvido pelo
      servidor a partir de quem está falando. Se o modelo pudesse informar o
      cliente ou a carteira, bastaria convencê-lo.
- [ ] **Ela consulta o Prisma direto?** No agente interno, não pode: delegue ao
      service que a tela já usa, para o RLS e o escopo continuarem valendo sem
      serem reimplementados.
- [ ] **Ela vale para número desconhecido?** No WhatsApp, pense duas vezes: o
      catálogo geral é o que um concorrente alcança sabendo só o número.
- [ ] **O teste de garantia continua passando?** O de `seguranca.spec.ts` lista
      nominalmente o que o desconhecido alcança — acrescentar ali quebra o
      teste de propósito, para a decisão ser consciente.

## Fronteira de dados

O texto das conversas **vai ao provedor de IA**. `agente/anonimizar-agente.ts`
troca nome de cliente, produto e vendedor por referências (`«CLI:código»`) antes
de enviar, e desfaz na volta — mas ele mascara **por nome de campo** e não lê
texto livre. O que a pessoa digitar na conversa sai sem máscara.

Decisão registrada em 2026-08-25, ao ligar as ferramentas de WhatsApp no agente.
