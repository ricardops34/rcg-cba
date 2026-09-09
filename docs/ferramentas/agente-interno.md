# Agente interno — 26 ferramentas

O assistente que o funcionário **logado** usa pelo ícone da topbar, em qualquer
tela. Ver [o mapa](README.md) para as outras duas famílias.

- **Catálogo e execução:** `apps/api/src/modules/agente/agente-tools.service.ts`
- **Conversa e prompt:** `agente-chat.service.ts`
- **Governança por empresa:** `agente-ferramentas.service.ts`

## As duas regras estruturais

**Nenhuma ferramenta toca o Prisma direto.** Cada uma delega ao service que a
tela já usa, passando o mesmo `AuthenticatedUser` da requisição. É isso que faz
o `withTenant`/RLS, o escopo hierárquico de carteira e as regras de comissão
continuarem valendo sem serem reimplementados — e sem poderem ser esquecidos.

**A permissão é checada duas vezes**, de propósito:

1. na montagem do prompt, filtrando o catálogo — o modelo nem enxerga o que o
   usuário não pode fazer, então não promete o que não vai entregar;
2. na execução, antes de chamar o service — porque um `tool_call` é texto
   gerado por um modelo e não vale como autorização.

## Escrita nunca executa direto

Ferramenta marcada `escrita: true` **não grava**: ela prepara a ação e vira uma
pendência que o usuário confirma na tela. Na confirmação tudo é revalidado — a
permissão pode ter mudado entre uma coisa e outra.

Por isso o prompt diz "nunca afirme que gravou algo antes de receber a
confirmação": é o modelo alinhado com o que o código já garante, não a garantia
em si.

## O catálogo

| Ferramenta | Permissão | Tipo | Delega a |
|---|---|---|---|
| `buscar_cliente` | `clientes.visualizar` | leitura | `clientes.findAll` |
| `verificar_cliente_na_base` | `clientes.visualizar` | leitura | `clientes.verificarTitularidade` |
| `buscar_produto` | `produtos.visualizar` | leitura | `produtos.findAll` |
| `posicao_cliente` | `posicao-cliente.visualizar` | leitura | `clientes.posicao` |
| `sugerir_compras` | `sugestao-compra.visualizar` | leitura | `sugestao.paraCliente` |
| `titulos_em_aberto` | `titulos-receber.visualizar` | leitura | `titulos.findAll` |
| `listar_orcamentos` | `orcamentos.visualizar` | leitura | `orcamentos.findAll` |
| `vendas_por_cliente` | `consulta-vendas-cliente.visualizar` | leitura | `consultas.vendasPorCliente` |
| `vendas_por_produto` | `consulta-vendas-produto.visualizar` | leitura | `consultas.vendasPorProduto` |
| `execucao_objetivos` | `dashboard-comercial.visualizar` | leitura | `objetivos.dashboard` |
| `consultar_cnpj` | `clientes.visualizar` | leitura | `enriquecimento.consultarCnpj` + `clientes.titularidadePorCnpj` |
| `resumo_atendimentos` | `meus-atendimentos.visualizar` | leitura | `meusAtendimentos.resumo` |
| `minha_agenda` | `atividades.visualizar` | leitura | `atividades.findAll` |
| `listar_oportunidades` | `oportunidades.visualizar` | leitura | `oportunidades.findAll` |
| `historico_atendimento_cliente` | `clientes.visualizar` | leitura | `historicoAtendimento` (monta de várias fontes) |
| `agendar_atividade` | `atividades.cadastrar` | **escrita** | `atividades.create` |
| `registrar_oportunidade` | `oportunidades.cadastrar` | **escrita** | `oportunidades.create` |
| `mover_oportunidade` | `oportunidades.editar` | **escrita** | `oportunidades.update` |
| `atualizar_cadastro_pela_receita` | `clientes.editar` | **escrita** | `clientes.atualizarPelaReceita` |
| `criar_orcamento` | `orcamentos.cadastrar` | **escrita** | `orcamentos.create` |
| `conversas_whatsapp` | `whatsapp-conversas.visualizar` | leitura + WhatsApp pareado | `conversas.listar` |
| `mensagens_whatsapp` | `whatsapp-conversas.visualizar` | leitura + WhatsApp pareado | `conversas.mensagensDaPropriaConexao` |
| `agendar_mensagem_whatsapp` | `whatsapp-conversas.cadastrar` | **escrita** + WhatsApp pareado | `agendamento.agendar` |
| `enviar_documento_whatsapp` | `whatsapp-conversas.cadastrar` | **escrita** + WhatsApp pareado | `whatsappAcoes.enviar{Titulos,Notas,Boleto,Danfe,Orcamento}` |
| `anexar_ficha_tecnica` | `produtos.editar` | **escrita** + arquivo anexado | `fichas.criar` |
| `anexar_foto_produto` | `produtos.editar` | **escrita** + arquivo anexado | `produtos.setFotoDeArquivo` |

## Ferramentas de anexo

As duas últimas são diferentes de todas as outras: elas trabalham sobre um
**arquivo que o usuário anexou à mensagem** (`POST /agente/anexos`, depois
`anexoId` no envio). São o único ponto do sistema em que um arquivo do
usuário sobe para o provedor de IA.

### Por que o arquivo vai ao provedor

Porque quem transcreve a ficha técnica é o modelo. Ele lê o PDF **uma vez**,
no anexo, e devolve o Markdown como argumento da ferramenta; o que fica
gravado é o texto. Nenhuma pergunta futura sobre o produto reenvia o
documento.

Nem todo provedor lê todo tipo, e isso é tratado em código: Anthropic e Codex
leem PDF e imagem; a OpenAI-compatível (`chat/completions`) lê imagem e **não**
lê PDF — o cliente recusa com o motivo em vez de mandar a requisição e receber
um erro de API que não diz nada a quem anexou o arquivo.

### As travas, todas em código

| Trava | Onde | O que impede |
|---|---|---|
| `withTenant` | `AgenteAnexosService` | anexo de outra empresa |
| `usuarioId` | `AgenteAnexosService.meu` | usar o arquivo de outra pessoa |
| `consumidoEm` | `AgenteAnexosService.consumir` | gravar o mesmo upload duas vezes |
| `usaAnexo` | `AgenteToolsService.disponiveisPara` | a ferramenta existir numa conversa sem arquivo |
| lista branca de MIME | `agenteAnexoUploadOptions` | subir o que o provedor não lê |

### O anexo vale para a conversa, não para o turno

O arquivo fica pendurado na conversa (`agente_anexos.conversaId`) até virar
ficha ou foto. Isso não é conveniência: sem isso o fluxo natural quebra, e foi
o que aconteceu no primeiro teste com um PDF real — o modelo leu o documento,
perguntou "confirma que é este produto?" e, na resposta seguinte, respondeu
"não tenho acesso ao conteúdo do PDF nesta conversa". Consumido, ele para de
aparecer: ficha gravada não deve voltar como anexo da pergunta seguinte.

Pela mesma razão, a lista de ferramentas **do prompt** é montada com o mesmo
recorte que vai ao provedor. Elas divergiram na primeira versão: o catálogo
enviado trazia `anexar_ficha_tecnica` e o texto do prompt não, e o modelo
acreditou no texto — leu o PDF, achou o produto e respondeu que não tinha
permissão para anexar.

**O modelo nunca escolhe o anexo.** O `anexoId` não é parâmetro declarado: ele
chega ao provedor porque a mensagem o carrega, e à ferramenta porque o servidor
o injeta nos argumentos antes de gravar a pendência. Declarado, bastaria
convencer o modelo a informar o anexo de outra pessoa — e há um teste que
reprova qualquer ferramenta que passe a declará-lo
(`agente-tools.permissao.spec.ts`).

### E o preço

A instrução da ferramenta pede que o Markdown não traga preço, mas isso é
prompt, e prompt não é barreira. A garantia de verdade é a tela: o Markdown é
um **campo editável** do cadastro (detalhe do produto → Fichas técnicas), então
quem administra vê exatamente o que a IA vai ler e retira o que não deve estar
lá. `visivelAgente: false` tira a ficha inteira do alcance do modelo sem
apagá-la.

## A consulta de CNPJ responde duas perguntas

`consultar_cnpj` junta o que vinha separado, porque ninguém consulta um CNPJ
sem querer saber as duas coisas:

1. **quem é a empresa** — o cadastro da Receita Federal inteiro: razão social,
   nome fantasia, situação cadastral com a data, endereço, telefones, e-mail e
   os CNAEs;
2. **se ela já é nossa** — se existe cadastro com aquele CNPJ, se está ativo e
   qual vendedor atende, **inclusive fora da carteira de quem perguntou**.

Os dois blocos são tratados de forma diferente na fronteira de dados: o da
Receita vai ao provedor inteiro (é base pública); o nosso sai mascarado — código,
situação e a referência do vendedor, que a plataforma remonta na resposta. Por
isso o bloco da base **não repete a razão social**: a pergunta "quem é" já foi
respondida pela fonte pública, e mandar o nosso cadastro junto seria vazar o que
a máscara existe para proteger.

O casamento é **por dígitos**, no banco (`regexp_replace`): o CNPJ chega do ERP
como está lá, com ou sem máscara, e comparar a string crua erraria justamente o
cadastro formatado — o falso "não é cliente" é o erro caro aqui, porque manda o
vendedor prospectar quem já é de alguém.

A Receita fora do ar não engole a outra metade: a base é consultada primeiro, e
uma falha na fonte pública volta como `erroReceita` com o que já sabemos do
cadastro.

**Quem atualiza o cadastro é outra conversa.** `atualizar_cadastro_pela_receita`
passa por `clientes.findOne`, que aplica o escopo hierárquico: o vendedor
responsável, quem está acima dele e quem tem acesso total. Para os demais o
cliente **nem é encontrado** — a regra é do service, não do prompt, e vale
igual pela tela. Consultar o CNPJ, portanto, não é poder alterar o cliente de
outro vendedor.

## As guardas além da permissão

**`exigeWhatsapp`** — as quatro últimas só aparecem para quem tem aparelho
pareado. Não substitui a permissão, **soma-se** a ela: a permissão diz que o
usuário *pode* atender por WhatsApp; isto diz que ele *tem* por onde falar.
É **fail-closed**: sem o filtro carregado, a ferramenta não aparece.

**Pelo agente, cada um lê só a própria conexão.** Nem supervisor nem gerente
alcançam a equipe por aqui, embora alcancem na tela de Atendimento. Daí
`mensagensDaPropriaConexao` em vez de `mensagens`. O raciocínio, decidido em
2026-08-25: monitorar é olhar o que está gravado; perguntar ao assistente manda
o texto para fora.

**Governança por empresa** — `agente-ferramentas.service.ts` permite restringir
o catálogo por empresa. Ele **só restringe, nunca amplia**: uma empresa não
consegue habilitar o que a permissão do usuário não dá.

## O comportamento fica no cadastro, não no código

Em Administração > Agente IA, cada ferramenta tem dois textos editáveis, e eles
respondem a perguntas diferentes:

| Campo | Responde | Vai ao modelo |
|---|---|---|
| **Descrição** | *quando* chamar a ferramenta | no catálogo |
| **Como se portar ao usar** (`instrucoes`) | *como* se portar ao usar | no bloco "COMO USAR CADA FERRAMENTA" do prompt |

Vazio nos dois casos volta ao texto do código. Só as instruções das ferramentas
**disponíveis** entram no prompt — mandar a de uma ferramenta que o usuário não
tem seria ensinar o modelo a se portar com algo que ele nem enxerga, e gastar
prompt em toda mensagem para isso.

> **O limite disto é o de sempre.** Comportamento é prompt, e prompt não é
> barreira. Nada que dependa desse texto pode ser a única coisa entre alguém e
> um dado: quem alcança o quê é decidido no servidor, e o modelo não contorna
> por mais que o texto peça. A tela diz isso a quem edita.

### Editar exige aceite, e tudo fica registrado

Alterar **texto** exige aceitar os termos uma vez; ligar/desligar e escolher
perfis, não. A distinção é entre configuração e redação: desligar uma ferramenta
é reversível e visível na própria tela; reescrever o prompt muda como o
assistente fala com cliente, e o efeito só aparece numa conversa, depois.

Toda alteração vai para `agente_ferramenta_auditoria` com o **antes e o
depois**, por campo, dentro da mesma transação da gravação — inclusive a troca
de versão e o "restaurar padrão".

### Versões de prompt

`agente-prompt-versoes.ts` guarda as versões que acompanham o sistema. A **v1 é
sempre o texto do próprio catálogo** e não é repetida lá: duplicá-la criaria
duas fontes para o mesmo texto.

Quando uma atualização melhora o texto de uma ferramenta, ela **oferece** a
versão nova em vez de impor. Cada versão traz `resumo` (o que muda) e
`exemplos` (perguntas em que ela se comporta diferente) — sem isso, escolher
entre "v1" e "v2" é escolher no escuro.

| Estado | Significado |
|---|---|
| `versaoPrompt` nulo | acompanha a **mais recente**; atualização futura vale |
| `versaoPrompt` preenchido | travado naquela versão |
| `descricao`/`instrucoes` preenchidos | reescrita da empresa, **vence a versão** |

`restaurar padrão` apaga a reescrita e devolve a ferramenta a seguir a versão —
apaga, não reescreve com o texto de hoje, que congelaria a cópia de novo.

### Ver antes de decidir

| Ação | Custo | Responde |
|---|---|---|
| `POST /agente/prompt/previa` | zero, não chama o provedor | "o que o modelo está lendo?" — mostra o texto montado, na ordem real |
| `POST /agente/prompt/testar` | **tokens da conta da empresa** | "essa versão ficou melhor?" |

Os dois aceitam `versoes` para aplicar uma versão **só naquela montagem**, sem
gravar: dá para ver o efeito antes de adotar, que é a ordem certa da decisão.

O teste não grava nada — nem conversa, nem resposta — e ferramentas de escrita
não executam: o assistente diz o que faria. A pré-visualização funciona mesmo
com o agente desligado, porque é o que se olha enquanto se configura.

## O que está em prompt, e portanto não é garantia

Montado em `agente-chat.service.ts` → `montarContexto()`:

- o nome do agente e a personalidade (configuráveis por empresa);
- "só enxerga dados da carteira que este usuário alcança — se uma busca não
  retorna nada, diga que não encontrou, não suponha que o dado não existe";
- a instrução de escrever as referências `«CLI:código»` exatamente como
  recebidas;
- "ações que gravam exigem confirmação; nunca afirme que gravou antes";
- "nunca invente número, valor ou código".

Todas são **alinhamento**, não barreira. O recorte de carteira, a confirmação de
escrita e a substituição das referências acontecem no código, independente do
que o modelo faça com a instrução.

## Mexendo aqui

- **Nova ferramenta:** siga o checklist do [mapa](README.md). `permissao` é
  obrigatória; sem ela a ferramenta fica disponível a todo mundo.
- **Mudar quando o modelo chama:** a `descricao` é o que ele lê. `perguntas`
  ajuda o roteamento.
- **Mudar o que ela alcança:** no service delegado, nunca aqui.
- **Teste:** `agente-tools.permissao.spec.ts` cobre a interação entre permissão
  do RBAC e configuração da empresa — que é onde o erro passa despercebido, nos
  dois sentidos (liberar o que devia estar fechado, ou fechar o que o
  administrador acabou de configurar).
