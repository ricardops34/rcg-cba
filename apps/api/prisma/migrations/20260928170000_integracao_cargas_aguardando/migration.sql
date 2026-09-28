-- Carga subida pela tela fica "aguardando" ate alguem mandar processar (aba
-- Processamento, em Administracao > Integracao). O CargasProcessador so pega
-- "recebida", entao a que aguarda fica parada; a que o ERP manda pela chave
-- de API continua entrando como "recebida" e processa direto.
-- Ver docs/planos/2026-09-28-carga-por-arquivo.md, *Tela de cargas*.
ALTER TYPE "IntegracaoCargaSituacao" ADD VALUE IF NOT EXISTS 'aguardando' BEFORE 'recebida';
