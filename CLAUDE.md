# Instruções do projeto

## Operação (deploy, migrations, imports)

**Leia [`docs/runbook-operacao.md`](docs/runbook-operacao.md) antes de rodar ou sugerir
qualquer comando de deploy, migration ou import da base legada.**

Não deduza esses procedimentos a partir de comentários em Dockerfile/compose — vários
já estavam desatualizados e produziram comandos que falharam. Se o procedimento não
estiver no runbook, **pergunte o comando exato** em vez de montar um; depois registre a
resposta no runbook, que é a fonte única.

## Banco de dados

Dois papéis, e trocá-los quebra de formas silenciosas:

- **`plataforma`** — dona das tabelas: migrations, seed e scripts de import.
- **`plataforma_app`** — runtime da API: `NOBYPASSRLS`, sem DDL.

Toda tabela de negócio com `empresaId` tem RLS e precisa da policy criada na mesma
migration — ver `apps/api/prisma/migrations/README.md`.

## Ferramentas de IA

**Leia [`docs/ferramentas/README.md`](docs/ferramentas/README.md) antes de criar ou
alterar qualquer ferramenta que um modelo possa chamar.** Lá está o inventário das
três famílias (agente interno, WhatsApp cliente, WhatsApp funcionário) e, por
ferramenta, se a regra está em código ou em prompt.

A regra que organiza tudo: **acesso é código, comportamento é prompt**. Instrução de
prompt não é barreira — descreve o comportamento desejado a um modelo que a pessoa do
outro lado pode tentar levar a outro. Antes de dar por pronta uma regra escrita no
prompt, pergunte: *se o modelo ignorasse, o que aconteceria?*

## Cuidados

- `pnpm run lint` em `apps/api` roda com `--fix` e reformata o repositório inteiro.
  Lint apenas os arquivos tocados e confira `git diff --stat` depois.
- Os containers de dev não recarregam mudanças de forma confiável; reinicie o container
  antes de validar ponta a ponta.

## Comunicação

Responder sempre em português (pt-BR).
