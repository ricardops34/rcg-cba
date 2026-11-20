# Prospecção de leads pela base da Receita

Pedido do usuário em 2026-11-20. Situação: **planejamento — aguardando decisões**
(seção "Decisões em aberto"). Nada implementado.

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

1. Modelo (lead com origem/dados da empresa, coletas, distribuições, ligações) e a
   tela de leads mostrando os novos campos.
2. Coleta pela MinhaReceita pública com prévia e deduplicação.
3. Distribuição por região, com histórico e aviso no sino.
4. Histórico (atividades, orçamento e WhatsApp ligados ao lead) e conversão automática
   por CNPJ.
5. Indicadores.
6. (Se a pública for instável) instância própria em Docker + Administração > Base da
   Receita.

## Decisões em aberto

1. Lead da prospecção na **mesma tabela** dos leads do WhatsApp (proposta) ou cadastro
   separado que vira lead ao distribuir.
2. Distribuição **automática** pela região ou **sugerida** com confirmação do
   supervisor (proposta: sugerida e confirmada em lote).
3. Conversão **automática** quando surge cliente com o mesmo CNPJ (proposta) ou manual.
4. Dados de sócios: a MinhaReceita já mascara CPF; guardar o quadro societário no
   lead ou não (LGPD).
5. Limite por coleta (ex.: 5.000 empresas) para não esgotar a busca pública.
6. Instância própria: começar já ou só se a pública falhar (depende do disco da VPS).
