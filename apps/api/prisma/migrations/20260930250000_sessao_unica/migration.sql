-- Sessão única por usuário (decisão de 30/09/2026): um novo login encerra as
-- sessões abertas do mesmo usuário em outro navegador ou computador, e a
-- administração pode desconectar uma sessão pela tela de Acessos. Os dois
-- desfechos entram no rastro de acessos.
ALTER TYPE "AcessoEvento" ADD VALUE IF NOT EXISTS 'sessao_substituida';
ALTER TYPE "AcessoEvento" ADD VALUE IF NOT EXISTS 'sessao_desconectada';

-- O JwtAuthGuard confere a cada requisição se a sessão do token segue aberta
-- (por id, pela chave primária); as buscas de sessões abertas de um usuário
-- usam este índice.
CREATE INDEX IF NOT EXISTS "sessoes_usuarioId_encerradaEm_idx" ON "sessoes"("usuarioId", "encerradaEm");
