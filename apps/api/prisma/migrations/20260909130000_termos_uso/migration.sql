-- Documentos e aceites são globais à conta do usuário. Não possuem empresaId
-- de negócio e, por isso, não recebem RLS por tenant. A empresa da sessão é
-- preservada somente em `empresaContextoId`, como evidência do evento.

CREATE TYPE "TermoTipo" AS ENUM ('termos_uso', 'aviso_privacidade');

CREATE TABLE "termo_documentos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "tipo" "TermoTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "conteudoHash" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "publicadoEm" TIMESTAMP(3) NOT NULL,
    "vigenteEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "termo_documentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "termo_aceites" (
    "id" TEXT NOT NULL,
    "termoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaContextoId" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "conteudoHash" TEXT NOT NULL,
    "declaracao" TEXT NOT NULL,

    CONSTRAINT "termo_aceites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "termo_documentos_codigo_versao_key"
ON "termo_documentos"("codigo", "versao");
CREATE INDEX "termo_documentos_obrigatorio_vigenteEm_idx"
ON "termo_documentos"("obrigatorio", "vigenteEm");
CREATE UNIQUE INDEX "termo_aceites_termoId_usuarioId_key"
ON "termo_aceites"("termoId", "usuarioId");
CREATE INDEX "termo_aceites_usuarioId_aceitoEm_idx"
ON "termo_aceites"("usuarioId", "aceitoEm");

ALTER TABLE "termo_aceites"
ADD CONSTRAINT "termo_aceites_termoId_fkey"
FOREIGN KEY ("termoId") REFERENCES "termo_documentos"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "termo_aceites"
ADD CONSTRAINT "termo_aceites_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Primeira versão operacional. Ela é imutável: qualquer revisão deve criar
-- outra linha, revogar esta e exigir um novo aceite. O texto deve passar por
-- revisão jurídica antes da publicação em produção.
INSERT INTO "termo_documentos" (
  "id", "codigo", "versao", "tipo", "titulo", "resumo", "conteudo",
  "conteudoHash", "obrigatorio", "publicadoEm", "vigenteEm"
) VALUES (
  '8f431731-d58c-4b66-9802-d14319235b44',
  'termos-uso-plataforma',
  '1.0',
  'termos_uso',
  'Termos de Uso da Plataforma Comercial',
  'Condições para acesso e utilização segura da Plataforma Comercial.',
  $termo$TERMOS DE USO DA PLATAFORMA COMERCIAL

1. OBJETO
Estes Termos disciplinam o acesso e o uso da Plataforma Comercial para apoiar atividades comerciais, administrativas e de relacionamento com clientes.

2. CONTA E ACESSO
O acesso é pessoal e intransferível. O usuário deve manter suas credenciais em sigilo e comunicar ao administrador qualquer suspeita de uso indevido.

3. USO ADEQUADO
A plataforma deve ser usada somente para finalidades profissionais autorizadas, em conformidade com as permissões concedidas e com a legislação aplicável. É proibido tentar acessar dados ou funções sem autorização, interferir no serviço ou utilizar informações para finalidade ilícita.

4. DADOS E REGISTROS
As informações inseridas e as operações realizadas podem ser registradas para segurança, auditoria, suporte e funcionamento do serviço. O usuário é responsável pela exatidão dos dados que cadastrar e pelas ações executadas com sua conta.

5. DISPONIBILIDADE E INTEGRAÇÕES
A plataforma pode depender de serviços de terceiros e passar por manutenção ou atualização. Interrupções serão tratadas com diligência, sem garantia de disponibilidade ininterrupta.

6. PRIVACIDADE E SEGURANÇA
Os dados pessoais são tratados para prestar, proteger e melhorar o serviço, conforme o Aviso de Privacidade aplicável. O usuário deve observar as regras internas de sua empresa ao consultar ou registrar dados pessoais.

7. ATUALIZAÇÕES DOS TERMOS
Alterações relevantes serão publicadas em uma nova versão. Quando necessário, a continuidade do uso dependerá de um novo aceite. As versões e os respectivos aceites permanecerão registrados para auditoria.

8. ACEITE
Ao marcar a opção de concordância e selecionar Li e concordo, o usuário declara que leu e aceitou esta versão dos Termos de Uso. Caso não concorde, deverá sair da plataforma e procurar o administrador responsável.$termo$,
  '67b642ba60474cd4a4e8c6a005095a773dd56365ab28af436ba5eed542518a12',
  true,
  TIMESTAMP '2026-09-09 13:00:00',
  TIMESTAMP '2026-09-09 13:00:00'
);
