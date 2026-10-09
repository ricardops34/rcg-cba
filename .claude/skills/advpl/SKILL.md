---
name: advpl
description: Escrever, corrigir, revisar ou explicar fontes AdvPL/TLPP do Protheus (.prw, .tlpp) — em especial os da integração BJ com a plataforma (BJPLA002 a BJPLA005, em docs/integracao/advpl) e os do rdmake (BjBoletos, Boleto.prw, Faturamento). Use sempre que o pedido envolver um .prw, rotina automática (MSExecAuto, FWMVCRotAuto, MATA410, CRMA980), parâmetro MV_*, tabela do Protheus (SA1, SE1, SC5, SZZ, SZY...), erro ou aviso do compilador AdvPL (C2024, W0003...), ou a cópia dos fontes no G:\Totvs12 — mesmo que o usuário não diga "AdvPL".
---

# AdvPL — fontes do Protheus da integração BJ

Os fontes moram em **dois lugares**, e confundir os dois já custou caro:

| Onde | Para quê |
|---|---|
| `docs/integracao/advpl/*.prw` (este repositório) | **Fonte da verdade.** Toda mudança é feita aqui, com commit. |
| `G:\Totvs12\Protheus\Protheus\rdmake\Portal\BJ\` | O que o usuário **compila**. Recebe a cópia do repositório. |

O BjBoletos e os demais fontes do cliente ficam em `C:\VPS\protheusrcg` (só
leitura para entender regra — não fazem parte da integração).

Você não compila nem roda AdvPL aqui. Toda validação é estática: diga isso ao
entregar, e peça ao usuário para compilar e testar no ambiente dele.

## Antes de escrever

1. Leia o fonte inteiro na parte que vai mexer — o fluxo e os comentários de
   decisão explicam regras que não estão em lugar nenhum mais.
2. Confira as regras de escrita do projeto em
   `docs/integracao/advpl/PLANO.md`, seção **2. Requirements & Constraints**
   (REQ, CON, PAT, GUD e os *Critérios de revisão e aceite*). Elas são do
   usuário, não sugestões. As mais esquecidas:
   - PAT-006 `FWLogMsg`, nunca `ConOut` · PAT-007 `If/Else/EndIf`, nunca `IIf`
   - PAT-009 bloco `/*/{Protheus.doc}` em toda função · PAT-003 só `User`/`Static Function`
   - PAT-002/GUD-004 não envelopar função nativa · CON-001 marcação da fila no
     mesmo `Begin Transaction` do ExecAuto · CON-009 sem `.ch` próprio
   - O código atual ainda tem violações antigas (ConOut, IIf): **não copie o
     padrão de um trecho antigo**, siga a regra.
3. Leia `references/armadilhas.md` quando o assunto for rotina automática, erro
   de gravação, parâmetro, título/boleto, chave ou estrutura de controle.
4. Parâmetros (`MV_BJAPI*`, `MV_RGC_*`) estão listados em
   `docs/integracao/advpl/README.md`.

## Ao escrever

- **Formato do arquivo**: CP-1252 (CON-007) e CRLF. Ferramentas que gravam
  UTF-8 ou LF corrompem acento e quebram o diff. Prefira a ferramenta de edição
  (preserva o arquivo); em script, leia e grave como `latin1` e mantenha `\r\n`.
  Comentários e mensagens novas sem acento, como o resto do fonte.
- Mapeamento campo a campo visível (GUD-006): origem, transformação e destino
  na mesma linha.
- Comente a **decisão** e o **porquê** (GUD-009), com a data quando for decisão
  do usuário — não a narração do que a instrução já diz.

## Antes de entregar

Rode a conferência estática em cada fonte tocado:

```bash
node .claude/skills/advpl/scripts/conferir-prw.js docs/integracao/advpl/BJPLA004.prw
```

- **ERRO** = estrutura de controle aberta/fechada errada — o compilador
  recusaria (`C2024`). Corrija antes de entregar.
- **AVISO** = regra do PLANO ou formato. Compare com a versão anterior
  (`git stash` / `git show HEAD:<arquivo>`): o que importa é não **introduzir**
  aviso novo.

Depois, na resposta ao usuário:

1. Diga quais fontes mudaram e que eles precisam ser **copiados para o `G:`** e
   recompilados — o repositório não chega lá sozinho.
2. Diga o que **não** foi validado (sem compilação, sem execução) e como testar
   no Protheus (o caso que deve passar e o que deve ser recusado).
3. Commit no repositório, como qualquer outra entrega.

## Quando o usuário colar erro ou aviso do compilador

O VS Code mostra o caminho do `G:`. Antes de corrigir:

- Rode o conferidor no **mesmo fonte do repositório**. Se lá não há erro, a
  cópia do `G:` divergiu — não corrija às cegas: peça para copiar o fonte do
  `G:` para `C:\VPS\rcg\tmp\` e compare (`git diff --no-index`), porque o `G:`
  pode ter mudança do usuário que ainda não está no repositório.
- `W0003 variável nunca usada` num trecho de regra costuma ser **bloco perdido**,
  não sobra (ver armadilhas).
- "Source outside the workspace" não é erro: é a extensão avisando que a pasta
  do `G:` não está aberta no VS Code.
