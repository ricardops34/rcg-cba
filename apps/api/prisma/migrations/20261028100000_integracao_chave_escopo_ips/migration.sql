-- SEC-12 (auditoria de 27/10/2026): chave de API da integração com escopo por
-- entidade e lista de IPs. Lista vazia = sem restrição, então as chaves que já
-- existem seguem valendo como valiam até alguém restringi-las.
ALTER TABLE "integracao_api_keys" ADD COLUMN "escopo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "integracao_api_keys" ADD COLUMN "ipsPermitidos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
