# Prospecção de leads pela base da Receita

Pedido do usuário em 2026-11-20. Situação: **em implementação pela API pública**
(decisão de 20/11, abaixo); a base própria (fase 1) fica para quando houver disco e
o procedimento da stack.

## Objetivo

Supervisor e gerente **coletam** empresas da base pública da Receita (por UF,
município e CNAE), ficam só com as **novas e que não são clientes**, e **repassam**
aos vendedores conforme a **região de atuação** de cada um. O lead guarda tudo o que
veio da Receita e o rastro da operação: quando foi coletado, por quem, para quem foi
enviado, coordenada. O vendedor trabalha o lead (orçamento, WhatsApp, atividades) e,
quando ele vira cliente, o lead fica **ligado ao cliente**. Indicadores: tempo médio
até virar cliente e tempo de atendimento.

## O que já existe (20/11)

- `leads`: nasce do WhatsApp (telefone obrigatório, `conversaId`), com endereço,
  coordenadas (Google/Nominatim ao salvar e no lote), `vendedorId`, `assumidoPor/Em`,
  situação `novo | em_atendimento | convertido | descartado`, temperatura. **Não tem**
  CNPJ, origem, vínculo com o cliente nem histórico de distribuição.
- `orcamentos`: aceita quem não é cliente (`prospectNome`, `prospectDocumento`…),
  mas não aponta para um lead.
- `atividades` (Agenda/histórico): `clienteId` opcional, sem `leadId`.
- Regiões de atuação (`vendedor_regioes`, área ou município) e a regra "a área vence
  o município" — servem para sugerir o vendedor de cada lead.
- Consulta por CNPJ na MinhaReceita (enriquecimento do cadastro de cliente).

## A fonte: MinhaReceita

- **Busca paginada** (documentação em docs.minhareceita.org/como-usar, lida em
  20/11): `GET /?uf=MS&municipio=<IBGE>&cnae_fiscal=…` (também `cnae`,
  `natureza_juridica`), até 1.024 por página, `cursor` para a próxima. **Em fase de
  testes**: parâmetros podem mudar, e pode responder **429** (limite por servidor).
- **Sem filtro de situação cadastral**: vem ativa, baixada e inapta — filtrar depois.
- A consulta por CNPJ não tem limite de uso.

**Plano B — instância própria (Docker)**, administrada em **Administração > Base da
Receita**: a imagem oficial do projeto (`minha-receita`) com PostgreSQL próprio.
- Espaço: ~180 GB (ETL ~30 GB temporários; Postgres ~150 GB de tabelas + ~20 GB de
  índices). **Conferir o disco da VPS antes.**
- Atualização: a Receita publica mensalmente; não há "atualizar" — recarrega-se uma
  base nova e troca-se a ativa (download → transform → troca).
- A tela de administração mostraria: mês da base carregada, situação da última carga,
  espaço usado, botão "recarregar" (com aviso de horas de processamento) e a URL em
  uso pela plataforma.
- A plataforma fala com a fonte por um **parâmetro de URL** (como `GEO_URL`): trocar
  da pública para a própria é configuração, sem mudar código.

## Modelo proposto

### O lead passa a ter origem e dados da empresa (mesma tabela `leads`)

Um cadastro só de lead, venha do WhatsApp ou da prospecção — senão a tela de leads,
o mapa, a distribuição e os indicadores teriam de olhar duas tabelas.

- `origem`: `whatsapp | receita | manual`.
- `telefone` passa a **opcional** (empresa da Receita pode não ter).
- Dados da empresa: `cnpj` (único por empresa, quando houver), `razaoSocial`,
  `nomeFantasia`, `situacaoCadastral`, `dataAbertura`, `naturezaJuridica`, `porte`,
  `capitalSocial`, CNAE principal e secundários (`lead_cnaes`, como `cliente_cnaes`),
  e-mail e telefones da Receita, e o **retorno bruto** (`dadosReceita` JSON) — "todos
  os dados recebidos".
- Coleta: `coletaId`, `coletadoEm`, `coletadoPor`.
- Conversão: `clienteId`, `convertidoEm`.
- Atendimento: `primeiroAtendimentoEm` (primeira atividade, conversa ou orçamento).

### Tabelas novas

- `lead_coletas`: cada coleta — quem, quando, filtros (UF, municípios, CNAEs), fonte
  (pública/própria), quantos vieram, quantos eram clientes, já eram leads, inativos,
  importados; situação (rodando/concluída/erro).
- `lead_distribuicoes`: o histórico de "para quem foi enviado" — lead, de, para, quem
  distribuiu, quando, como (`regiao` automática, `manual`) e a região usada.

### Ligações

- `atividades.leadId` — o histórico do lead na Agenda (ligação, visita, WhatsApp…).
- `orcamentos.leadId` — orçamento para lead (os campos `prospect*` vêm do lead).
- WhatsApp: vincular conversa a lead (hoje só a conversa que originou o lead fica
  ligada).
- Ao converter: o cliente recebe o histórico (atividades e orçamentos do lead passam
  a apontar também para o cliente).

## Fluxos

1. **Coletar** (supervisor/gerente): escolhe UF, municípios, CNAEs → a plataforma
   busca página a página, devagar → **prévia** com contagens (novas, já clientes, já
   leads, inativas) → importa as marcadas como leads `origem = receita`, sem vendedor.
2. **Coordenadas**: o lote de geocodificação que já existe (leads entram nele).
3. **Distribuir**: sugestão pela região de atuação (área > município); lead fora de
   região ou em região livre fica na fila da supervisão. Supervisor confirma (ou
   ajusta) e envia; cada envio vai para `lead_distribuicoes` e avisa o vendedor (sino).
4. **Trabalhar** (vendedor): atividades, WhatsApp, orçamento — tudo no histórico do lead.
5. **Converter**: quando o cliente com o mesmo CNPJ aparece (cadastro na tela ou
   vindo do ERP), a plataforma liga lead → cliente e marca `convertido`.
6. **Indicadores**: tempo médio coleta → cliente, distribuição → primeiro atendimento,
   primeiro atendimento → cliente; conversão por vendedor, região, CNAE e coleta;
   orçamentos por lead.

## Permissões

- Nova rotina **Prospecção de leads** (coletar e distribuir): Supervisor e Gerente
  (e administradores). O Vendedor só vê os leads que recebeu (escopo de carteira).
- **Base da Receita** (Administração): só administradores.

## Fases

1. **Base própria da Receita** (decisão: já no começo): serviço Docker
   `minha-receita` + PostgreSQL dedicado, carga do mês, e Administração > Base da
   Receita (mês carregado, situação da carga, espaço, recarregar, URL em uso).
   Pré-requisitos: **disco** (~180 GB, de preferência volume separado) e o
   **procedimento de subir o serviço na stack** de dev e de produção — não deduzir
   (CLAUDE.md): perguntar ao usuário e registrar no runbook.
2. Modelo (lead com origem/dados da empresa, coletas, distribuições, ligações) e a
   tela de leads mostrando os novos campos.
3. Coleta pela base própria (a pública fica como alternativa no parâmetro), com
   prévia e deduplicação.
4. Distribuição sugerida pela região, confirmada pelo supervisor, com histórico e
   aviso no sino.
5. Histórico (atividades, orçamento e WhatsApp ligados ao lead) e conversão automática
   por CNPJ.
6. Indicadores.

## Decisões (usuário, 2026-11-20)

1. **Mesma tabela** de leads, com `origem` (whatsapp, receita, manual).
2. Distribuição **sugerida pela região e confirmada** pelo supervisor (em lote); fora
   de região ou em região livre fica na fila.
3. Conversão **automática pelo CNPJ** quando surge o cliente (tela ou ERP).
4. **Base própria já no começo** (fase 1).

Adotadas sem pergunta (podem mudar): quadro societário fica só no retorno bruto
(`dadosReceita`), já com o CPF mascarado pela fonte — sem campos próprios nem busca
por sócio; limite de 5.000 empresas por coleta.

## Decisão de 2026-11-20: começar pela API pública

O usuário aprovou começar pelas **fases 2 a 5 usando a API pública** da MinhaReceita.
A fase 1 (base própria) fica para quando o disco da VPS e o procedimento de subir o
serviço na stack estiverem resolvidos. A troca para a base própria é só configuração
(`MINHARECEITA_BASE_URL`), sem mudar código. Por causa do limite da API pública
(429), a coleta anda devagar, página a página, e respeita o limite de 5.000 empresas
por coleta.

## Base própria: enxugar o que não interessa (pedido de 2026-11-20)

O usuário pediu, na base própria, opções para **remover dados que não interessam**:

- **Empresas baixadas** (e, por extensão, as que não estão ativas: baixada, nula,
  inapta, suspensa), já que a prospecção só usa as ativas.
- **Por estado:** manter só as UFs escolhidas (as da operação) e apagar as demais.

Na tela Administração > Base da Receita: escolher as UFs mantidas e a regra de
situação, ver quanto cada opção libera, e um botão "aplicar limpeza", que também roda
depois de cada recarga mensal. Isso derruba o espaço bem abaixo dos ~180 GB da base
inteira; o tamanho real depende das UFs (estimar quando houver a base).

A conferir antes de implementar: se o `minha-receita` aceita filtrar na carga (o que
evita até gravar o que será apagado) ou se a limpeza é feita depois, direto no
Postgres dele.

**Reduzir o tamanho de fato** (pedido do usuário, mesmo dia): no Postgres, apagar
linhas não devolve espaço ao disco. Depois da limpeza é preciso compactar (`VACUUM
FULL` nas tabelas da base, que trava a tabela durante a operação: rodar fora do
horário e com a coleta parada) e recriar os índices. A tela mostra o tamanho antes e
depois de cada limpeza.

## Andamento

- **Fase 2 (modelo): feita** (commit a5efdd58). A tela de Leads mostra origem, CNPJ,
  CNAE principal, porte e abertura, com filtro por origem.
- **Fase 3 (coleta): feita.** CRM > Prospecção de Leads (rotina
  `prospeccao-leads`: Supervisor, Gerente, Diretor e administradores; migration
  20261120230000_prospeccao_leads).
  - O que a API pública impõe, conferido em 20/11: **um município (IBGE) e um CNAE
    por busca** (com dois CNAEs ela responde "busca muito custosa… tente novamente em
    1 minuto"); até 1.000 por página; `cursor: null` no fim. Por isso a coleta
    percorre cada combinação, com teto de 60 combinações e de 5.000 empresas lidas,
    1,5 s entre buscas e espera de 61 s quando a fonte pede.
  - **Diferente do plano:** não há a etapa "prévia e marcar". A coleta importa
    direto as ativas que não são clientes nem leads, e a prévia virou o resumo da
    coleta (lidas, importadas, já clientes, já leads, inativas). Lead indesejado se
    descarta na tela de Leads.
  - Testado na API de dev: Terenos-MS × minimercados leu 124, importou 34 e descartou
    90 inativas, em 3 s. A segunda rodada deu 34 "já leads" e 0 importadas. Uma
    segunda coleta simultânea é recusada (409). Os 34 leads de teste ficaram na base
    de dev para a conferência visual.
  - Coleta que estava rodando quando a API reiniciou é marcada como interrompida.
    Rodar de novo continua sem repetir.

## Base própria: o que a instância nossa permite (conferido no código, 2026-11-20)

O `minha-receita` é código aberto, **licença MIT** (pode ser usado e alterado), em Go.
Saiu do GitHub (arquivado) para o Codeberg: `codeberg.org/cuducos/minha-receita`.

- **O limite de "busca muito custosa" é configuração, não regra do programa.** Ele só
  existe quando a variável `SEARCH_SCAN_GUARD` (segundos) está definida
  (`db/postgres.go`). Sem ela, a instância própria não limita. Nesse caso a coleta pode
  dispensar a pausa e a espera de 61 s, e o teto de combinações pode subir.
- **Vários valores numa busca são aceitos** ("repetindo o parâmetro ou separando por
  vírgulas", vale para `uf`, `municipio`, `cnae_fiscal`, `cnae`,
  `natureza_juridica`). Na pública, a recusa vinha do limite acima. Na nossa, a coleta
  pode buscar vários CNAEs e municípios de uma vez. Isso vira um parâmetro da coleta
  (fonte pública: um por busca; própria: vários).
- **A carga (`transform`) não filtra por UF nem por situação.** As opções são
  `--clean-up`, `--batch-size`, `--no-privacy`, `--stream`, `--skip-graph`,
  `--graph-only`. Há dois caminhos para o pedido de enxugar a base:
  1. **Limpar depois da carga**, por SQL no Postgres dela (a FAQ do projeto mostra o
     filtro por `descricao_situacao_cadastral` no JSON), seguido de `VACUUM FULL`. O
     pico de disco continua sendo o da base inteira (~180 GB) durante a carga.
  2. **Filtrar na carga**, com um ajuste nosso no `transform` (licença MIT permite):
     gravar só as UFs escolhidas e só as ativas. Nunca ocupa o tamanho cheio, mas
     passa a ser um fork a manter a cada versão nova do projeto.
  Recomendação: começar pelo caminho 1, que não exige manter fork, e partir para o 2
  se o pico de disco da carga for o problema.

**Decisão do usuário (2026-11-20): a instância própria é de consumo exclusivo da
plataforma.** Consequências:

- **Sem trava de busca:** `SEARCH_SCAN_GUARD` fica sem valor. Com a fonte própria, a
  coleta busca vários CNAEs e municípios de uma vez, sem pausa entre buscas nem a
  espera de 61 s, e com teto maior (definir quando a base existir).
- **Sem acesso de fora:** o serviço não ganha rota no Traefik nem porta publicada.
  Só a API da plataforma fala com ele, pela rede interna do Docker
  (`MINHARECEITA_BASE_URL=http://<serviço>:<porta>`). Assim o "exclusivo" é garantido
  pela rede, não por combinação.
- A administração (mês carregado, limpeza, recarga) passa pela API da plataforma, em
  Administração > Base da Receita, nunca acessando o serviço diretamente.

**Decisões do usuário (2026-11-20, continuação):**
- **Filtrar na carga**: alterar o `transform` do minha-receita (MIT) para gravar só o
  que interessa. A base nunca ocupa o tamanho cheio e cabe no dev (164 GB livres) e
  na VPS.
- **Os estados mantidos são parametrizáveis** em Administração > Base da Receita (não
  fixos no código nem na stack). A situação (só ativas) segue o mesmo caminho.
