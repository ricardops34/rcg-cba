-- Pareamento do número de WhatsApp de um funcionário com a conta dele
-- (docs/planos/whatsapp-institucional-funcionarios.md, Fatia 2).
--
-- O telefone sozinho não autoriza: ele é reconhecido em
-- `usuario_empresas.celular/telefone`, mas o acesso só abre depois de a pessoa
-- confirmar um código que aparece dentro do sistema, onde ela entrou com senha.

CREATE TABLE "whatsapp_vinculos_funcionario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "sufixo" TEXT NOT NULL,
    "codigo" TEXT,
    "codigoExpiraEm" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "confirmadoEm" TIMESTAMP(3),
    "validoAte" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_vinculos_funcionario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_vinculos_funcionario_empresaId_usuarioId_idx" ON "whatsapp_vinculos_funcionario"("empresaId", "usuarioId");

-- Um número atende uma pessoa por empresa. O sufixo (últimos 8 dígitos) é a
-- chave porque é assim que o resto do módulo compara telefone — ver
-- `casarCliente`: cobre com/sem DDI 55 e com/sem o 9º dígito.
CREATE UNIQUE INDEX "whatsapp_vinculos_funcionario_empresaId_sufixo_key" ON "whatsapp_vinculos_funcionario"("empresaId", "sufixo");

ALTER TABLE "whatsapp_vinculos_funcionario" ADD CONSTRAINT "whatsapp_vinculos_funcionario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_vinculos_funcionario" ADD CONSTRAINT "whatsapp_vinculos_funcionario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "whatsapp_vinculos_funcionario" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_whatsapp_vinculos_funcionario ON "whatsapp_vinculos_funcionario"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
