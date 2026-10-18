# ADR 005 — Emissão Sob Demanda de DANFE (via XML) e Boletos Bancários (com Módulo 11)

- **Status:** Implementado 🟢
- **Data:** 2026-09-20 (Módulos `notas-saida`, `titulos-receber`, `demo`)
- **Autores / Decisores:** Engenharia de Backend & Faturamento

---

## 1. Contexto

A 2ª via de DANFE e a 2ª via de boleto bancário são duas das ferramentas mais acionadas por vendedores no cotidiano comercial. Originalmente, sistemas legados armazenavam arquivos PDF pré-renderizados no sistema de arquivos ou dependiam de chamadas síncronas lentas ao ERP para recuperar documentos.

O armazenamento de PDFs gerava milhões de arquivos estáticos órfãos, consumindo centenas de gigabytes de storage, enquanto a dependência do ERP tornava a emissão indisponível durante instabilidades do servidor Protheus.

## 2. Decisão

Eliminar o armazenamento estático de arquivos PDF e adotar a **renderização sob demanda (on-the-fly)** a partir de metadados brutos armazenados no banco:

1. **DANFE a partir do XML Autorizado (`nota_saida_xml`):**
   - O ERP transmite apenas o XML autorizado da NF-e (`conteudoXml`).
   - A plataforma armazena o XML e, quando o usuário clica em "2ª Via DANFE", o backend extrai os dados via parser de alta performance e monta o PDF vetorial em memória para visualização ou download.
2. **2ª Via de Boleto Reemitível via Módulo 11:**
   - A tabela `titulos_receber` armazena os dados cadastrais do título, convênio bancário (ex.: Bradesco código 237), carteira, nosso número e vencimento.
   - O código de barras (44 posições) e a linha digitável (47 posições) são recalculados em tempo de execução via algoritmo Módulo 11 da FEBRABAN com instruções de juros e multa calculadas dinamicamente sobre o saldo atualizado.
3. **Disponibilidade Offline do ERP:**
   - Uma vez sincronizados a nota (com XML) e o título, a 2ª via pode ser emitida a qualquer momento, mesmo com o ERP desligado para manutenção ou backup noturno.

## 3. Alternativas Consideradas

- **Armazenamento de PDFs em Storage S3 / MinIO:**
  - *Descarte:* Alto consumo de disco e risco de inconsistência caso o ERP cancelasse ou retificasse uma nota e o PDF antigo continuasse em cache no bucket.
- **Chamada Síncrona REST/SOAP ao Protheus na hora do clique:**
  - *Descarte:* Lentidão de 5 a 15 segundos por documento e indisponibilidade quando o ERP estivesse fora do ar.

## 4. Consequências

### Positivas
- **Economia Gigantesca de Storage:** O banco armazena apenas strings XML comprimidas e metadados de títulos em vez de centenas de gigabytes em arquivos PDF binários.
- **Velocidade Extrema:** A renderização sob demanda em Node.js leva menos de 100ms.
- **Cálculo Dinâmico de Encargos:** Boletos vencidos podem ter juros e multas calculados para a data do pagamento sem necessidade de reprocessamento no ERP.

### Negativas / Trade-offs
- **Dependência Estrita do XML:** Notas sem XML armazenado em `nota_saida_xml` não conseguem emitir DANFE (exigem que o ERP envie o XML via carga).

