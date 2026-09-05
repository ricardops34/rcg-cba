# WhatsApp — atendimento ao cliente

A triagem do número institucional, quando quem escreve **não** é da equipe. Ver
[o mapa](README.md) para as outras famílias.

- **Catálogo:** `apps/api/src/modules/whatsapp/triagem/triagem-ferramentas.ts`
- **Execução:** `whatsapp-triagem.service.ts` → `executarFerramenta()` e
  `ferramentaDeDocumento()`
- **Prompt:** `triagem-prompt.ts` → `montarPromptTriagem()`

## Quem é "cliente" aqui

O número que escreveu está associado a um cadastro em
`whatsapp_contatos.clienteId`. Esse vínculo é feito **por um vendedor**, na
tela, e é ele que autoriza tudo o que vem depois — inclusive mandar boleto e
nota fiscal para aquele número.

Não há autenticação além disso. É a mesma confiança de um atendimento por
telefone: quem ligou daquele número é tratado como aquele cliente.

## Dois catálogos, e o corte é fail-closed

```
ferramentasDaTriagem(temCliente)
  temCliente === true  → FERRAMENTAS_DO_CLIENTE + FERRAMENTAS_GERAIS
  temCliente === false → FERRAMENTAS_GERAIS
```

Sem cliente associado, as ferramentas de dado **nem são descritas ao modelo**.
Descrevê-las e recusar na execução ensinaria a IA a prometer o que não pode
cumprir — o cliente ouviria "vou te mandar o boleto" antes do erro.

### `FERRAMENTAS_DO_CLIENTE` — exigem cliente associado

| Ferramenta | O que faz | Onde executa |
|---|---|---|
| `titulos_em_aberto` | títulos em aberto do cliente da conversa | `titulosEmAberto()` |
| `ultimas_notas` | últimas notas fiscais de venda | `ultimasNotas()` |
| `meus_pedidos` | últimos orçamentos, com número, data, situação e valor | `listarPedidosDoCliente()` |
| `segunda_via_boleto` | manda o boleto em PDF | `enviarBoletoAoCliente()` → `TitulosReceberService.gerarBoleto` |
| `copia_da_nota` | manda a 2ª via do DANFE em PDF | `enviarDanfeAoCliente()` → `NotasSaidaService.gerarDanfe` |
| `copia_do_pedido` | manda o PDF do pedido | `enviarPedidoAoCliente()` → `OrcamentosService.gerarPdf` |
| `procurar_vendedor` | acha um vendedor ativo pelo nome | `procurarVendedor()` |

### `FERRAMENTAS_GERAIS` — valem para qualquer número

Esta lista é **o que um concorrente alcança sabendo só o número da empresa**.
Acrescentar algo aqui é uma decisão de segurança, não de produto.

| Ferramenta | O que faz | Cuidado |
|---|---|---|
| `identificar_cliente` | confirma se um CNPJ/nome é cliente | devolve **só** um `vendedorId` opaco — nome nenhum |
| `direcionar_para_vendedor` | encerra a triagem e entrega a conversa | — |
| `direcionar_para_administrativo` | entrega ao administrativo | — |
| `avisar_equipe` | recado curto no WhatsApp de quem trabalha aqui | teto de 3 por conversa |
| `registrar_lead` | anota quem procurou a empresa e o que quer | **a única que grava** — ver abaixo |

#### Por que `registrar_lead` grava, se nenhuma outra geral grava

É a exceção, e ela foi pesada. O que a ferramenta escreve é **o que a própria
pessoa acabou de dizer**, numa tabela que só guarda lead, no máximo **uma linha
por conversa** (`@@unique(empresaId, conversaId)` — a segunda chamada atualiza a
mesma). Ela não lê nada, não confirma nada e não devolve nada além de "anotado".

O pior caso de um número mal-intencionado é um lead falso na fila da supervisão
— o mesmo que um trote por telefone já produz, e que a tela resolve com o botão
de descartar. Em troca, quem procura a empresa pela primeira vez para de se
perder: antes disso, a conversa acabava e não sobrava registro nenhum.

O sino toca **uma vez**, na criação, e só para quem tem equipe (gerente e
supervisor). Vendedor não é avisado: o lead ainda não tem dono, e tocar o sino
de todo mundo a cada curioso é o que este número existe para evitar.

Detalhe que já mordeu, verificado em dev: um argumento **ausente** não é o
mesmo que o valor padrão. A segunda chamada, que costuma vir só com o nome da
empresa, chegava a rebaixar a temperatura de "quente" para "morno" porque o
`temperatura` ausente virava o padrão e sobrescrevia a classificação. Hoje o
padrão só vale no nascimento do lead.

**Do lead para frente é tela, não IA.** A distribuição está em
`modules/leads/` (`/comercial/leads`): quem tem equipe abaixo vê a fila
inteira porque distribuir é o trabalho dele; quem não tem vê só o que lhe foi
entregue. Entregar a alguém move o lead para "em atendimento" e avisa quem
recebeu; devolvê-lo à fila desfaz as duas coisas.

## As travas dos documentos

Três em série, e nenhuma delas é prompt:

1. **O catálogo** não oferece a ferramenta sem cliente associado.
2. **O modelo nunca vê id interno.** Ele pede pelo **número** que a listagem
   devolveu, e a resolução número → id já sai recortada pelo cliente da
   conversa. Ele não consegue pedir documento de outro cliente nem inventando
   um identificador.
3. **O gerador recorta de novo**, por cliente (`QuemPede`, em
   `common/escopo/quem-pede.ts`).

As regras de negócio do documento — título pago, janela de 30 dias para
reemissão, encargos do vencido, XML da nota ausente — ficam num caminho só,
compartilhado com o que o vendedor usa na tela. Não há uma cópia para o bot que
possa divergir.

Quando o gerador recusa, o motivo volta ao modelo com o texto original, para ele
explicar ao cliente e direcionar ao administrativo em vez de dizer "não deu".

## O que está em prompt

Tom, formato e cuidado — `montarPromptTriagem()`:

- fala em nome da empresa, nunca diz que é uma IA de terceiros;
- não negocia preço, prazo ou desconto;
- não promete entrega, data ou valor que não leu de uma ferramenta;
- confirma **qual** documento antes de mandar, e só diz o que enviou depois;
- direciona na hora se pedirem uma pessoa.

**Uma exceção importante:** "não peça senha" também está no prompt, mas
**deixou de depender dele**. `sem-credencial.ts` bloqueia a mensagem antes de
sair e encaminha a conversa para uma pessoa. Ver
[o mapa](README.md#a-regra-que-organiza-tudo).

## Contexto que o prompt recebe

| Dado | De onde vem | Quem vê |
|---|---|---|
| **Ficha da empresa** | cadastro de Empresa + horários (`fichaDaEmpresa`) | todos |
| Outras informações | `whatsapp_config.atendimentoInformacoes` | todos |
| Saudação | `whatsapp_config.atendimentoSaudacao` | todos (texto literal, não passa pelo modelo) |
| Nome do cliente e do vendedor da carteira | cadastro | só quem já é cliente |
| **Nomes de quem está de plantão** | sessão + expediente | **só quem já é cliente** |

A **ficha** sai do cadastro e se mantém sozinha: razão social, CNPJ, segmentos,
ano de fundação, endereço, telefones, e-mails, site, horário de atendimento e a
história. Até 2026-09-05 nada disso chegava à IA — quem quisesse que ela
soubesse o endereço tinha de redigitá-lo no texto livre, e então havia dois
endereços, que divergiam no dia em que a empresa mudasse de sala.

Campo vazio **não aparece** na ficha. Uma linha "Telefone: não informado"
ensinaria a IA a afirmar que a empresa não tem telefone.

O texto livre continua existindo para o que não cabe em campo — política de
troca, condição especial — e vai depois da ficha.

A última linha é uma correção de 2026-09-05: a escala da equipe ia no prompt de
qualquer desconhecido. A IA não precisa dos nomes para direcionar — ela
direciona sem `vendedorId` e a conversa cai para quem estiver livre.

## Mexendo aqui

- **Nova ferramenta de dado:** entra em `FERRAMENTAS_DO_CLIENTE`, nunca nas
  gerais.
- **Nova ferramenta que manda arquivo:** use `responderComArquivo()` e trate a
  recusa do gerador — o modelo precisa do motivo para explicar.
- **Teste:** `seguranca.spec.ts` lista **nominalmente** o que um número
  desconhecido alcança. Acrescentar às gerais quebra o teste de propósito.
