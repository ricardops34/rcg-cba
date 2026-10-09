-- Corrige a carga inicial de `cliente_envios_erp` (migration
-- 20261007210000_cliente_envios_erp). Ela copiou para o envio TODOS os campos
-- aplicados de cada alteração, sem o filtro de `enfileirarEnvioErp`
-- (ClienteAlteracoesService): campo que a SA1 não recebe entrou, e a lista de
-- CNAEs (`cnaes`) não virou `cnaePrincipal`. Envio só com campo desses saía
-- para o Protheus sem nenhum campo, e o BJPLA004 recusava a cada ciclo
-- ("Alteracao sem nenhum campo reconhecido no de-para").
--
-- Só os pendentes: o que o ERP já confirmou fica como está. Idempotente —
-- rodada de novo, não acha o que mudar.
--
-- A lista abaixo é a de CAMPOS_ENVIO_ERP (cliente-alteracoes.service.ts).
-- Campo novo lá precisa entrar aqui só se houver envio pendente antigo com ele.

UPDATE "cliente_envios_erp" e
   SET "campos" = ARRAY(
         SELECT DISTINCT x.campo
           FROM (SELECT CASE WHEN c = 'cnaes' THEN 'cnaePrincipal' ELSE c END AS campo
                   FROM unnest(e."campos") AS c) x
          WHERE x.campo = ANY (ARRAY[
                  'razaoSocial', 'nomeFantasia', 'cnpjCpf', 'inscricaoEstadual',
                  'inscricaoMunicipal', 'endereco', 'complemento', 'bairro',
                  'municipio', 'uf', 'cep', 'contato', 'email', 'telefone',
                  'celular', 'vendedorId', 'tabelaPrecoId', 'condicaoPagamentoId',
                  'limiteCredito', 'vencimentoLimite', 'latitude', 'longitude',
                  'cnaePrincipal'])
          ORDER BY x.campo)
 WHERE e."situacao" = 'pendente';

-- Sem campo nenhum que a SA1 receba, não há o que enviar.
DELETE FROM "cliente_envios_erp"
 WHERE "situacao" = 'pendente' AND cardinality("campos") = 0;
