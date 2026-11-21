# Tabelas de referência compartilhadas com a Receita

**Pedido (2026-11-21):** guardar os códigos da Receita nas tabelas de referência da
plataforma (município, UF, CNAE, CEP e outras que possam ser compartilhadas), para que
a plataforma seja a fonte única e o lead não precise repetir texto.

**Origem do pedido:** Boa Esperança do Norte-MT, emancipado em 2023, ficou sem código
IBGE na base própria. Há 606 empresas ativas nele. A Receita grava o código municipal
dela (1182). O IBGE vem de uma tabela do Tesouro (`tabmun.csv`, sem atualização desde
2021-12), e a coleta busca pelo IBGE. A nossa tabela de municípios tem o município
(5101837), mas não tem o código da Receita.

## Inventário (conferido em dev, 2026-11-21)

| Tabela | Plataforma | Receita | Proposta |
|---|---|---|---|
| UF | `estados`: 27, sigla e IBGE | só a sigla | já casam pela sigla; nada a criar |
| Município | `municipios`: 5.571, todos com IBGE | código próprio (TOM/SIAFI, 4 dígitos) | coluna `codigoReceita` |
| CNAE | `cnaes`: 1.332 subclasses, `codigoErp` com 7 dígitos | o mesmo código; 1.188 em uso em MS+MT | o código já é o mesmo; `lead_cnaes` aponta para `cnaes` |
| Natureza jurídica | não existe; `leads.naturezaJuridica` é texto | 4 dígitos; 72 em uso em MS+MT | tabela nova `naturezas_juridicas` |
| País | `paises`: 193, `codigoErp` ISO numérico (Brasil = 76) | código Siscomex (Brasil = 105) | coluna `codigoReceita` (só empresa com sede no exterior usa) |
| CEP | `ceps`: vazia por desenho, preenchida pelo ViaCEP sob demanda | só o CEP no endereço de cada empresa | não compartilhar: endereço de empresa não é tabela de CEP |

Ficam fora: a qualificação do sócio, o motivo da situação e o porte. Só aparecem no
retorno bruto (`dadosReceita`) e em nenhuma tela.

## Desenho

1. **Migration:** `municipios.codigoReceita` e `paises.codigoReceita`, ambas com
   índice. Tabela `naturezas_juridicas` (código e descrição) global, como as outras
   referências.
2. **Sync `sync:receita`**, no mesmo molde do `sync:ibge`: idempotente e rodado pela
   role dona.
   - Municípios: pelo `tabmun.csv` do Tesouro (código da Receita ↔ IBGE). Quem não
     estiver nele é casado pelo nome + UF com a lista de municípios da própria Receita
     (`Municipios.zip`).
   - Naturezas: pelo `Naturezas.zip` da Receita.
   - Países: pelo `Paises.zip` da Receita, casando pelo nome.
3. **Carga da base própria:** a API manda ao controle os pares código da Receita → IBGE
   da nossa tabela. O transform usa esses pares quando o Tesouro não traz o município
   (patch 0005).
4. **Lead da Receita aponta para as tabelas** em vez de copiar texto:
   - `municipioId` (o texto `municipio`/`uf` fica para o lead do WhatsApp, informado à
     mão);
   - `naturezaJuridicaId`;
   - `lead_cnaes.cnaeId`.

## Decisões do usuário (2026-11-21)

- **Entram:** município, CNAE e natureza jurídica. País fica fora.
- **CEP: popular pela Receita** (contra a recomendação de não compartilhar). Entram só
  os CEPs que a tabela ainda não tem; o ViaCEP não é sobrescrito.
- **Só o lead da Receita** aponta para o município. O cliente do ERP fica como está,
  porque trocar mexe no import da integração.

## Como ficou

- **Migration `20261121100000_referencias_receita`:**
  - `municipios.codigoReceita`;
  - tabela `naturezas_juridicas`;
  - `leads.municipioId` e `leads.naturezaJuridicaId`;
  - `lead_cnaes.cnaeId`;
  - preenchimento dos leads que já existiam: município pelo IBGE e CNAE pelo código.
- **Administração > Base da Receita > "Tabelas de referência":**
  - **Atualizar referências** (`POST /receita-base/referencias`): o controle baixa a
    tabela do Tesouro e as da Receita (`GET /referencias`, patch 0005). A API grava:
    - o código da Receita nos municípios: pelo Tesouro e, para quem não está nele, pelo
      nome, só quando o nome é único entre os ainda sem código;
    - as naturezas jurídicas;
    - os CNAEs que faltam.
  - **Atualizar CEPs** (`POST /receita-base/ceps`): o controle lê os CEPs distintos da
    base (`GET /ceps`), cada um com o endereço mais frequente. A API grava só os novos,
    com `origem = receita`.
- **Carga:** a API manda ao controle os pares código da Receita → IBGE da nossa tabela.
  O controle grava `tabmun-plataforma.csv`, que o transform lê junto com o
  `tabmun.csv` do Tesouro, porque lê todo arquivo que começa com "tabmun". Nenhuma linha
  do transform mudou.
- **Coleta:** o lead da Receita grava `municipioId` (pelo IBGE ou, sem IBGE, pelo código
  da Receita), `naturezaJuridicaId` e `cnaeId` em cada CNAE.

## Andamento

- **2026-11-21, verificado em dev:**
  - Atualizar referências (9 s):
    - 5.571 de 5.571 municípios com código da Receita: 5.570 pelo Tesouro e Boa
      Esperança do Norte (1182) pelo nome;
    - 92 naturezas;
    - 27 CNAEs que a Receita usa e a tabela do IBGE não tinha.
  - Atualizar CEPs (2 min 20 s): 41.763 CEPs de MS e MT, todos com município.
  - Os 257 leads de teste ficaram ligados ao município e à natureza, e os 1.413 CNAEs
    deles ao `cnaes`.
  - **Recarga da base com os pares da plataforma: rodando.**
- **Produção:** a migration preenche o município e o CNAE dos leads da Receita, mas não
  a natureza, porque a tabela nasce vazia. Hoje não há lead da Receita na produção.
  Rodar "Atualizar referências" **antes** da primeira carga e da primeira coleta.
