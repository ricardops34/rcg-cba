-- Baseline única do banco da plataforma.
--
-- Substitui as 73 migrations incrementais de 24/07 a 28/08/2026, que foram
-- consolidadas quando a base passou a ser criada do zero (o import do MySQL do
-- portal antigo foi aposentado, e com ele a necessidade de preservar o
-- histórico de alterações que levava até o schema atual).
--
-- Três blocos, nesta ordem:
--   1. estrutura (enums, tabelas, índices, chaves estrangeiras);
--   2. role de runtime `plataforma_app`, sem privilégio que contorne RLS;
--   3. Row-Level Security: isolamento por empresa, tabela a tabela.
--
-- A ordem importa: o GRANT do bloco 2 usa ON ALL TABLES, então precisa das
-- tabelas já criadas.
--
-- Módulos, menus, rotinas, perfis, parâmetros e a empresa inicial **não** estão
-- aqui — são do `seed-base.ts`, que os monta a partir de `catalogo-sistema.ts`.
-- Estrutura é migration; conteúdo é seed.

-- ---------------------------------------------------------------------------
-- 1. Estrutura
-- ---------------------------------------------------------------------------

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Acao" AS ENUM ('visualizar', 'cadastrar', 'editar', 'excluir', 'importar', 'exportar', 'aprovar', 'cancelar', 'bloquear');

-- CreateEnum
CREATE TYPE "AcessoEvento" AS ENUM ('login_sucesso', 'login_falha', 'login_bloqueado', 'login_fora_horario', 'acesso_fora_horario', 'logout', 'troca_empresa');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('fisica', 'juridica');

-- CreateEnum
CREATE TYPE "TipoVendedor" AS ENUM ('vendedor', 'supervisor', 'gerente');

-- CreateEnum
CREATE TYPE "VinculoVendedor" AS ENUM ('clt', 'representante', 'sistema');

-- CreateEnum
CREATE TYPE "OrigemAlteracaoCliente" AS ENUM ('manual', 'enriquecimento', 'integracao', 'agente');

-- CreateEnum
CREATE TYPE "StatusAlteracaoCliente" AS ENUM ('pendente', 'aprovada', 'rejeitada');

-- CreateEnum
CREATE TYPE "StatusHistoricoCliente" AS ENUM ('aplicado', 'reprovado');

-- CreateEnum
CREATE TYPE "OrigemSugestaoCompra" AS ENUM ('local', 'ia');

-- CreateEnum
CREATE TYPE "AgentePapel" AS ENUM ('usuario', 'sistema', 'assistente', 'ferramenta');

-- CreateEnum
CREATE TYPE "TipoParametro" AS ENUM ('texto', 'numero', 'booleano', 'data', 'senha');

-- CreateEnum
CREATE TYPE "EstagioOportunidade" AS ENUM ('prospeccao', 'qualificacao', 'proposta', 'negociacao', 'ganha', 'perdida');

-- CreateEnum
CREATE TYPE "TipoAtividade" AS ENUM ('ligacao', 'reuniao', 'email', 'visita', 'tarefa');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('rascunho', 'enviado', 'aprovado', 'recusado', 'expirado');

-- CreateEnum
CREATE TYPE "WhatsappTransporte" AS ENUM ('zapo', 'evolution_go', 'cloud_api');

-- CreateEnum
CREATE TYPE "WhatsappSessaoStatus" AS ENUM ('desconectada', 'pareando', 'conectada', 'banida');

-- CreateEnum
CREATE TYPE "WhatsappDirecao" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "WhatsappTipoMensagem" AS ENUM ('texto', 'imagem', 'documento', 'audio', 'video', 'localizacao', 'contato', 'outro');

-- CreateEnum
CREATE TYPE "WhatsappStatusEntrega" AS ENUM ('pendente', 'enviada', 'entregue', 'lida', 'erro');

-- CreateEnum
CREATE TYPE "WhatsappTipoContato" AS ENUM ('geral', 'financeiro', 'compras', 'contabilidade_fiscal', 'outros');

-- CreateEnum
CREATE TYPE "WhatsappLadoReacao" AS ENUM ('nos', 'contato');

-- CreateEnum
CREATE TYPE "WhatsappAgendamentoStatus" AS ENUM ('pendente', 'enviando', 'enviada', 'erro', 'cancelada');

-- CreateEnum
CREATE TYPE "NotificacaoTipo" AS ENUM ('whatsapp_mensagem', 'whatsapp_agendamento_erro', 'atividade_vencimento', 'orcamento_aprovado', 'orcamento_recusado', 'cliente_atribuido', 'titulo_vencido');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "alias" TEXT,
    "logoUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "bannerAtivo" BOOLEAN NOT NULL DEFAULT false,
    "bannerCor" TEXT,
    "bannerImagemUrl" TEXT,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "endereco" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "site" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLogin" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "senhaAlteradaEm" TIMESTAMP(3),
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "deveTrocarSenha" BOOLEAN NOT NULL DEFAULT false,
    "restringirHorario" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_horarios" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "usuario_horarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_empresas" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "superiorId" TEXT,
    "codigoErp" TEXT,
    "nomeReduzido" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "usuario_empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfis" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "sistemaBase" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "icone" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "disponivelTelaPequena" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "modulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "menuPaiId" TEXT,
    "nome" TEXT NOT NULL,
    "icone" TEXT,
    "rota" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "disponivelTelaPequena" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotinas" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "disponivelTelaPequena" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "rotinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_permissoes" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "rotinaId" TEXT NOT NULL,
    "acao" "Acao" NOT NULL,
    "permitido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "perfil_permissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "sessaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaAtividadeEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradaEm" TIMESTAMP(3),
    "motivoFim" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acessos_log" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "email" TEXT NOT NULL,
    "empresaId" TEXT,
    "evento" "AcessoEvento" NOT NULL,
    "detalhe" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acessos_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao_api_keys" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chaveHash" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3),
    "ultimoUso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "integracao_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT,
    "categoriaId" TEXT,
    "subCategoriaId" TEXT,
    "armazemId" TEXT,
    "marca" TEXT,
    "codigoBarras" TEXT,
    "codigoFornecedor" TEXT,
    "ncm" TEXT,
    "qtdEmbalagem" DOUBLE PRECISION,
    "peso" DOUBLE PRECISION,
    "ultimoPreco" DOUBLE PRECISION,
    "observacao" TEXT,
    "exibirFotoOrcamento" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "regraDescontoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_fotos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "url" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "produto_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "codigoErp" TEXT,
    "nome" TEXT NOT NULL,
    "nomeReduzido" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "percComissao" DOUBLE PRECISION,
    "tipo" "TipoVendedor" NOT NULL DEFAULT 'vendedor',
    "vinculo" "VinculoVendedor",
    "usaDashboard" BOOLEAN NOT NULL DEFAULT true,
    "supervisorId" TEXT,
    "gerenteId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "desligado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT,
    "tabelaPrecoId" TEXT,
    "condicaoPagamentoId" TEXT,
    "codigoErp" TEXT,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'juridica',
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpjCpf" TEXT,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "contribuinteIcms" BOOLEAN,
    "rg" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "contato" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "telefone2" TEXT,
    "celular" TEXT,
    "endereco" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "carteira" BOOLEAN,
    "site" TEXT,
    "limiteCredito" DOUBLE PRECISION,
    "vencimentoLimite" TIMESTAMP(3),
    "observacao" TEXT,
    "dataBloqueio" TIMESTAMP(3),
    "observacaoBloqueio" TEXT,
    "dataReativacao" TIMESTAMP(3),
    "observacaoReativacao" TEXT,
    "primeiraCompra" TIMESTAMP(3),
    "ultimaVisita" TIMESTAMP(3),
    "ultimaCompra" TIMESTAMP(3),
    "ultimoAtendimento" TIMESTAMP(3),
    "dataConsultaRfb" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_contatos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "perfilId" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "celular" TEXT,
    "cargo" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "cliente_contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_cliente_configs" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "permitirAtualizarCadastro" BOOLEAN NOT NULL DEFAULT false,
    "permitirManterContatos" BOOLEAN NOT NULL DEFAULT false,
    "exibirDesconto" BOOLEAN NOT NULL DEFAULT false,
    "permitirSolicitarDesconto" BOOLEAN NOT NULL DEFAULT false,
    "descontoMaximoSolicitavel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exibirEstoque" BOOLEAN NOT NULL DEFAULT false,
    "permitirProdutoForaMix" BOOLEAN NOT NULL DEFAULT true,
    "diasValidadeCarrinho" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "portal_cliente_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_cliente_perfis" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "sistemaBase" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "portal_cliente_perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_cliente_rotinas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "portal_cliente_rotinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_cliente_perfil_permissoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "rotinaId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "portal_cliente_perfil_permissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_cliente_habilitacoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "portal_cliente_habilitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_cliente_credenciais" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "empresaAlias" TEXT NOT NULL,
    "emailNormalizado" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "ultimoLogin" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_cliente_credenciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_cliente_sessoes" (
    "id" TEXT NOT NULL,
    "credencialId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_cliente_sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_cliente_acessos_log" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "contatoId" TEXT,
    "email" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "detalhe" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_cliente_acessos_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_alteracoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "origem" "OrigemAlteracaoCliente" NOT NULL DEFAULT 'manual',
    "status" "StatusAlteracaoCliente" NOT NULL DEFAULT 'pendente',
    "alteracoes" JSONB NOT NULL,
    "justificativa" TEXT,
    "solicitadoPor" TEXT,
    "solicitadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analisadoPor" TEXT,
    "analisadoEm" TIMESTAMP(3),
    "motivoRecusa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_alteracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_historico" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "alteracaoId" TEXT,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "origem" "OrigemAlteracaoCliente" NOT NULL,
    "autor" TEXT,
    "status" "StatusHistoricoCliente" NOT NULL DEFAULT 'aplicado',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "provedor" TEXT NOT NULL DEFAULT 'anthropic',
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.anthropic.com',
    "modelo" TEXT NOT NULL DEFAULT 'claude-opus-5',
    "apiKeyCifrada" TEXT,
    "apiKeyUltimos4" TEXT,
    "nomeAgente" TEXT NOT NULL DEFAULT 'Assistente',
    "mensagemBoasVindas" TEXT,
    "systemPrompt" TEXT,
    "temperatura" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 2048,
    "maxIteracoesFerramentas" INTEGER NOT NULL DEFAULT 5,
    "historicoMensagens" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "agente_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_ferramentas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "nome" TEXT,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "agente_ferramentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_ferramenta_perfis" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ferramentaId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_ferramenta_perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_credenciais" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "apiKeyCifrada" TEXT,
    "apiKeyUltimos4" TEXT,
    "modelo" TEXT,
    "accessTokenCifrado" TEXT,
    "refreshTokenCifrado" TEXT,
    "contaId" TEXT,
    "contaEmail" TEXT,
    "tokenExpiraEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "agente_credenciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_conversas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agente_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_mensagens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" "AgentePapel" NOT NULL,
    "conteudo" TEXT,
    "ferramenta" TEXT,
    "argumentos" JSONB,
    "resultado" JSONB,
    "pendente" BOOLEAN NOT NULL DEFAULT false,
    "confirmadaEm" TIMESTAMP(3),
    "confirmadaPor" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSaida" INTEGER,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sugestoes_compra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "origem" "OrigemSugestaoCompra" NOT NULL DEFAULT 'local',
    "ordem" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "motivo" TEXT,
    "modelo" TEXT,
    "loteId" TEXT NOT NULL,
    "geradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugestoes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_campo_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "editavel" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "cliente_campo_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_empresa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "parametro" TEXT NOT NULL,
    "tipo" "TipoParametro" NOT NULL DEFAULT 'texto',
    "tamanho" INTEGER,
    "conteudo" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "parametros_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ultimoNumero" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "orcamento_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paises" (
    "id" TEXT NOT NULL,
    "codigoErp" TEXT,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "comexId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "paises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estados" (
    "id" TEXT NOT NULL,
    "codigoErp" TEXT,
    "sigla" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "codigoIbge" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "estados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipios" (
    "id" TEXT NOT NULL,
    "estadoId" TEXT,
    "codigoErp" TEXT,
    "descricao" TEXT NOT NULL,
    "codigoIbge" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "municipios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ceps" (
    "id" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "estadoId" TEXT,
    "municipioId" TEXT,
    "bairro" TEXT,
    "endereco" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "origem" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "ceps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cnaes" (
    "id" TEXT NOT NULL,
    "codigoErp" TEXT,
    "secao" TEXT,
    "divisao" TEXT,
    "grupo" TEXT,
    "classe" TEXT,
    "subclasse" TEXT,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "cnaes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_cnaes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "cnaeId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "cliente_cnaes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoriaPaiId" TEXT,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "usado" BOOLEAN,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "regraDescontoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condicoes_pagamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "forma" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "condicoes_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armazens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "armazens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabelas_preco" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "dtInicio" TIMESTAMP(3),
    "dtFim" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "tabelas_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabela_preco_itens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tabelaPrecoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "preco" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "regraDescontoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "tabela_preco_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_desconto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "descricao" TEXT NOT NULL,
    "percDescontoAutorizado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percDescontoMaximo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percComissao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "regras_desconto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_desconto_faixas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "regraDescontoId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "percInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percFinal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percBaseComissao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "regras_desconto_faixas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoques" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "armazemId" TEXT NOT NULL,
    "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserva" DOUBLE PRECISION,
    "custo" DOUBLE PRECISION,
    "ultimoPreco" DOUBLE PRECISION,
    "ultimaCompra" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "estoques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_saida" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "condicaoPagamentoId" TEXT,
    "numero" TEXT NOT NULL,
    "serie" TEXT,
    "especieFiscal" TEXT,
    "tipo" TEXT,
    "dtEmissao" TIMESTAMP(3),
    "ano" INTEGER,
    "mes" INTEGER,
    "vlrBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrMercadoria" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrItens" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIcms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIpi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrFrete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrDevolucao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chaveNfe" TEXT,
    "dtNfe" TIMESTAMP(3),
    "mensagem" TEXT,
    "comodato" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "xmlRecebidoEm" TIMESTAMP(3),
    "protocoloNfe" TEXT,
    "situacaoNfe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "notas_saida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_saida_xml" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "notaSaidaId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebidoPor" TEXT,

    CONSTRAINT "nota_saida_xml_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_saida_itens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "notaSaidaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "produtoId" TEXT,
    "item" INTEGER,
    "dtEmissao" TIMESTAMP(3),
    "ano" INTEGER,
    "mes" INTEGER,
    "cfop" TEXT,
    "tipo" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrTabela" DOUBLE PRECISION,
    "percDesconto" DOUBLE PRECISION,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantidadeDev" DOUBLE PRECISION,
    "vlrDev" DOUBLE PRECISION,
    "peso" DOUBLE PRECISION,
    "comodato" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "percComissao" DOUBLE PRECISION,
    "regraDescontoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "notas_saida_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_bancarias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "agenciaDv" TEXT,
    "conta" TEXT NOT NULL,
    "contaDv" TEXT,
    "carteira" TEXT NOT NULL,
    "beneficiarioNome" TEXT,
    "beneficiarioDocumento" TEXT,
    "beneficiarioEndereco" TEXT,
    "localPagamento" TEXT NOT NULL DEFAULT 'Pagável em qualquer banco até o vencimento',
    "aceite" TEXT NOT NULL DEFAULT 'N',
    "especieDocumento" TEXT NOT NULL DEFAULT 'DM',
    "instrucoes" TEXT,
    "demonstrativo" TEXT,
    "jurosMesPerc" DOUBLE PRECISION,
    "multaPerc" DOUBLE PRECISION,
    "diasProtesto" INTEGER,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "contas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titulos_receber" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "numero" TEXT NOT NULL,
    "parcela" TEXT,
    "prefixo" TEXT,
    "tipo" TEXT,
    "emissao" TIMESTAMP(3),
    "vencimento" TIMESTAMP(3),
    "vencimentoReal" TIMESTAMP(3),
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acrescimo" DOUBLE PRECISION,
    "decrescimo" DOUBLE PRECISION,
    "dtBaixa" TIMESTAMP(3),
    "formaPgto" TEXT,
    "historico" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "contaBancariaId" TEXT,
    "nossoNumero" TEXT,
    "carteira" TEXT,
    "codigoBarras" TEXT,
    "linhaDigitavel" TEXT,
    "nossoNumeroDac" TEXT,
    "banco" TEXT,
    "bancoNome" TEXT,
    "bancoCodigoCompensacao" TEXT,
    "agencia" TEXT,
    "agenciaDv" TEXT,
    "conta" TEXT,
    "contaDv" TEXT,
    "beneficiarioNome" TEXT,
    "beneficiarioDocumento" TEXT,
    "beneficiarioEndereco" TEXT,
    "localPagamento" TEXT,
    "aceite" TEXT,
    "especieDocumento" TEXT,
    "jurosValorDia" DOUBLE PRECISION,
    "multaValor" DOUBLE PRECISION,
    "descontoValor" DOUBLE PRECISION,
    "instrucoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "titulos_receber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "estagio" "EstagioOportunidade" NOT NULL DEFAULT 'prospeccao',
    "valorPrevisto" DOUBLE PRECISION,
    "dataPrevisao" TIMESTAMP(3),
    "dataFechamento" TIMESTAMP(3),
    "motivoPerda" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividades" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "oportunidadeId" TEXT,
    "orcamentoId" TEXT,
    "vendedorId" TEXT NOT NULL,
    "tipo" "TipoAtividade" NOT NULL DEFAULT 'tarefa',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataVencimento" TIMESTAMP(3),
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "dataConclusao" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "oportunidadeId" TEXT,
    "condicaoPagamentoId" TEXT,
    "titulo" TEXT NOT NULL,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'rascunho',
    "dataValidade" TIMESTAMP(3),
    "dataRetorno" TIMESTAMP(3),
    "observacao" TEXT,
    "vlrTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "descontoSolicitadoEm" TIMESTAMP(3),
    "descontoSolicitadoPor" TEXT,
    "descontoAutorizadoEm" TIMESTAMP(3),
    "descontoAutorizadoPor" TEXT,
    "clienteDecididoEm" TIMESTAMP(3),
    "clienteDecididoPorContatoId" TEXT,
    "clienteDecisao" TEXT,
    "clienteDecisaoObservacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_itens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "vlrTabela" DOUBLE PRECISION,
    "vlrUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percDesconto" DOUBLE PRECISION,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regraDescontoId" TEXT,
    "percComissao" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objetivos_vendedor_mes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "numeroCliente" DOUBLE PRECISION,
    "novoCliente" DOUBLE PRECISION,
    "tipo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "objetivos_vendedor_mes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objetivos_vendedor_categoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "objetivoVendedorMesId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "objetivos_vendedor_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "usuarioId" TEXT,
    "valorAnterior" JSONB,
    "valorNovo" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senha_historico" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "senha_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sessoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "numero" TEXT,
    "jid" TEXT,
    "status" "WhatsappSessaoStatus" NOT NULL DEFAULT 'desconectada',
    "transporte" "WhatsappTransporte" NOT NULL DEFAULT 'zapo',
    "credencialCifrada" TEXT,
    "ultimaConexao" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "instanciaExterna" TEXT,
    "instanciaId" TEXT,
    "instanciaTokenCifrado" TEXT,
    "webhookSegredoCifrado" TEXT,
    "aceiteEm" TIMESTAMP(3),
    "aceiteVersao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "whatsapp_sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_contatos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "nomeExibicao" TEXT,
    "telefoneNormalizado" TEXT,
    "tipo" "WhatsappTipoContato" NOT NULL DEFAULT 'geral',
    "email" TEXT,
    "fotoUrl" TEXT,
    "clienteId" TEXT,
    "vinculadoPor" TEXT,
    "vinculadoEm" TIMESTAMP(3),
    "ignorado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "clienteId" TEXT,
    "ultimaMensagemEm" TIMESTAMP(3),
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_mensagens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "direcao" "WhatsappDirecao" NOT NULL,
    "tipo" "WhatsappTipoMensagem" NOT NULL DEFAULT 'texto',
    "conteudo" TEXT,
    "arquivoUrl" TEXT,
    "arquivoNome" TEXT,
    "arquivoMime" TEXT,
    "enviadaPor" TEXT,
    "statusEntrega" "WhatsappStatusEntrega" NOT NULL DEFAULT 'pendente',
    "respondeuA" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_reacoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "deQuem" "WhatsappLadoReacao" NOT NULL,
    "reagiuPor" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_reacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_mensagens_agendadas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "enviarEm" TIMESTAMP(3) NOT NULL,
    "status" "WhatsappAgendamentoStatus" NOT NULL DEFAULT 'pendente',
    "erro" TEXT,
    "mensagemId" TEXT,
    "criadaPor" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_mensagens_agendadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_acoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "orcamentoId" TEXT,
    "atividadeId" TEXT,
    "tituloReceberId" TEXT,
    "detalhe" JSONB,
    "executadaPor" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_acoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "transporte" "WhatsappTransporte" NOT NULL DEFAULT 'zapo',
    "workerUrl" TEXT,
    "evolutionUrl" TEXT,
    "evolutionApiKeyCifrada" TEXT,
    "evolutionVersao" TEXT,
    "dddPadrao" TEXT,
    "retencaoDias" INTEGER NOT NULL DEFAULT 0,
    "historicoDias" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "whatsapp_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "NotificacaoTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "rota" TEXT,
    "referenciaId" TEXT,
    "contador" INTEGER NOT NULL DEFAULT 1,
    "ocorridaEm" TIMESTAMP(3) NOT NULL,
    "lidaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicados" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimEm" TIMESTAMP(3),
    "fixado" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicado_perfis" (
    "empresaId" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,

    CONSTRAINT "comunicado_perfis_pkey" PRIMARY KEY ("comunicadoId","perfilId")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_alias_key" ON "empresas"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_horarios_usuarioId_diaSemana_key" ON "usuario_horarios"("usuarioId", "diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_empresas_usuarioId_empresaId_key" ON "usuario_empresas"("usuarioId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_nome_key" ON "perfis"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "rotinas_codigo_key" ON "rotinas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_permissoes_perfilId_rotinaId_acao_key" ON "perfil_permissoes"("perfilId", "rotinaId", "acao");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "sessoes_usuarioId_iniciadaEm_idx" ON "sessoes"("usuarioId", "iniciadaEm");

-- CreateIndex
CREATE INDEX "acessos_log_criadoEm_idx" ON "acessos_log"("criadoEm");

-- CreateIndex
CREATE INDEX "acessos_log_usuarioId_criadoEm_idx" ON "acessos_log"("usuarioId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "integracao_api_keys_chaveHash_key" ON "integracao_api_keys"("chaveHash");

-- CreateIndex
CREATE INDEX "integracao_api_keys_empresaId_idx" ON "integracao_api_keys"("empresaId");

-- CreateIndex
CREATE INDEX "produtos_empresaId_descricao_idx" ON "produtos"("empresaId", "descricao");

-- CreateIndex
CREATE INDEX "produtos_empresaId_categoriaId_idx" ON "produtos"("empresaId", "categoriaId");

-- CreateIndex
CREATE INDEX "produtos_empresaId_regraDescontoId_idx" ON "produtos"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE INDEX "produtos_empresaId_codigoFornecedor_idx" ON "produtos"("empresaId", "codigoFornecedor");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_empresaId_codigoErp_key" ON "produtos"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "produto_fotos_empresaId_produtoId_ordem_idx" ON "produto_fotos"("empresaId", "produtoId", "ordem");

-- CreateIndex
CREATE INDEX "vendedores_empresaId_nome_idx" ON "vendedores"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_empresaId_codigoErp_key" ON "vendedores"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "clientes_empresaId_razaoSocial_idx" ON "clientes"("empresaId", "razaoSocial");

-- CreateIndex
CREATE INDEX "clientes_empresaId_vendedorId_idx" ON "clientes"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "clientes_empresaId_tabelaPrecoId_idx" ON "clientes"("empresaId", "tabelaPrecoId");

-- CreateIndex
CREATE INDEX "clientes_empresaId_condicaoPagamentoId_idx" ON "clientes"("empresaId", "condicaoPagamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_empresaId_codigoErp_key" ON "clientes"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "cliente_contatos_empresaId_clienteId_ativo_idx" ON "cliente_contatos"("empresaId", "clienteId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_contatos_empresaId_clienteId_email_key" ON "cliente_contatos"("empresaId", "clienteId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_cliente_configs_empresaId_key" ON "portal_cliente_configs"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_cliente_perfis_empresaId_nome_key" ON "portal_cliente_perfis"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "portal_cliente_rotinas_codigo_key" ON "portal_cliente_rotinas"("codigo");

-- CreateIndex
CREATE INDEX "portal_cliente_perfil_permissoes_empresaId_perfilId_idx" ON "portal_cliente_perfil_permissoes"("empresaId", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_cliente_perfil_permissoes_perfilId_rotinaId_acao_key" ON "portal_cliente_perfil_permissoes"("perfilId", "rotinaId", "acao");

-- CreateIndex
CREATE UNIQUE INDEX "portal_cliente_habilitacoes_clienteId_key" ON "portal_cliente_habilitacoes"("clienteId");

-- CreateIndex
CREATE INDEX "portal_cliente_habilitacoes_empresaId_ativo_idx" ON "portal_cliente_habilitacoes"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "portal_cliente_credenciais_contatoId_key" ON "portal_cliente_credenciais"("contatoId");

-- CreateIndex
CREATE INDEX "portal_cliente_credenciais_empresaId_idx" ON "portal_cliente_credenciais"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_cliente_credenciais_empresaAlias_emailNormalizado_key" ON "portal_cliente_credenciais"("empresaAlias", "emailNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "portal_cliente_sessoes_tokenHash_key" ON "portal_cliente_sessoes"("tokenHash");

-- CreateIndex
CREATE INDEX "portal_cliente_sessoes_credencialId_expiresAt_idx" ON "portal_cliente_sessoes"("credencialId", "expiresAt");

-- CreateIndex
CREATE INDEX "portal_cliente_acessos_log_empresaId_criadoEm_idx" ON "portal_cliente_acessos_log"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "cliente_alteracoes_empresaId_status_idx" ON "cliente_alteracoes"("empresaId", "status");

-- CreateIndex
CREATE INDEX "cliente_alteracoes_empresaId_clienteId_idx" ON "cliente_alteracoes"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "cliente_historico_empresaId_clienteId_criadoEm_idx" ON "cliente_historico"("empresaId", "clienteId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "agente_config_empresaId_key" ON "agente_config"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "agente_ferramentas_empresaId_chave_key" ON "agente_ferramentas"("empresaId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "agente_ferramenta_perfis_ferramentaId_perfilId_key" ON "agente_ferramenta_perfis"("ferramentaId", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "agente_credenciais_empresaId_provedor_key" ON "agente_credenciais"("empresaId", "provedor");

-- CreateIndex
CREATE INDEX "agente_conversas_empresaId_usuarioId_updatedAt_idx" ON "agente_conversas"("empresaId", "usuarioId", "updatedAt");

-- CreateIndex
CREATE INDEX "agente_mensagens_empresaId_conversaId_criadaEm_idx" ON "agente_mensagens"("empresaId", "conversaId", "criadaEm");

-- CreateIndex
CREATE INDEX "sugestoes_compra_empresaId_clienteId_origem_ordem_idx" ON "sugestoes_compra"("empresaId", "clienteId", "origem", "ordem");

-- CreateIndex
CREATE INDEX "sugestoes_compra_empresaId_loteId_idx" ON "sugestoes_compra"("empresaId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "sugestoes_compra_clienteId_produtoId_origem_key" ON "sugestoes_compra"("clienteId", "produtoId", "origem");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_campo_config_empresaId_campo_key" ON "cliente_campo_config"("empresaId", "campo");

-- CreateIndex
CREATE INDEX "parametros_empresa_empresaId_parametro_idx" ON "parametros_empresa"("empresaId", "parametro");

-- CreateIndex
CREATE UNIQUE INDEX "parametros_empresa_empresaId_parametro_key" ON "parametros_empresa"("empresaId", "parametro");

-- CreateIndex
CREATE UNIQUE INDEX "orcamento_config_empresaId_key" ON "orcamento_config"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "paises_codigoErp_key" ON "paises"("codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "estados_sigla_key" ON "estados"("sigla");

-- CreateIndex
CREATE INDEX "municipios_descricao_idx" ON "municipios"("descricao");

-- CreateIndex
CREATE UNIQUE INDEX "municipios_codigoErp_key" ON "municipios"("codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "municipios_codigoIbge_key" ON "municipios"("codigoIbge");

-- CreateIndex
CREATE UNIQUE INDEX "ceps_cep_key" ON "ceps"("cep");

-- CreateIndex
CREATE UNIQUE INDEX "cnaes_codigoErp_key" ON "cnaes"("codigoErp");

-- CreateIndex
CREATE INDEX "cliente_cnaes_empresaId_clienteId_idx" ON "cliente_cnaes"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "cliente_cnaes_empresaId_cnaeId_idx" ON "cliente_cnaes"("empresaId", "cnaeId");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_cnaes_clienteId_cnaeId_key" ON "cliente_cnaes"("clienteId", "cnaeId");

-- CreateIndex
CREATE INDEX "categorias_empresaId_descricao_idx" ON "categorias"("empresaId", "descricao");

-- CreateIndex
CREATE INDEX "categorias_empresaId_regraDescontoId_idx" ON "categorias"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_empresaId_codigoErp_key" ON "categorias"("empresaId", "codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "condicoes_pagamento_empresaId_codigoErp_key" ON "condicoes_pagamento"("empresaId", "codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "armazens_empresaId_codigoErp_key" ON "armazens"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "tabelas_preco_empresaId_descricao_idx" ON "tabelas_preco"("empresaId", "descricao");

-- CreateIndex
CREATE UNIQUE INDEX "tabelas_preco_empresaId_codigoErp_key" ON "tabelas_preco"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "tabela_preco_itens_tabelaPrecoId_produtoId_idx" ON "tabela_preco_itens"("tabelaPrecoId", "produtoId");

-- CreateIndex
CREATE INDEX "tabela_preco_itens_empresaId_produtoId_idx" ON "tabela_preco_itens"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "tabela_preco_itens_empresaId_regraDescontoId_idx" ON "tabela_preco_itens"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE UNIQUE INDEX "tabela_preco_itens_empresaId_codigoErp_key" ON "tabela_preco_itens"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "regras_desconto_empresaId_descricao_idx" ON "regras_desconto"("empresaId", "descricao");

-- CreateIndex
CREATE UNIQUE INDEX "regras_desconto_empresaId_codigoErp_key" ON "regras_desconto"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "regras_desconto_faixas_empresaId_regraDescontoId_idx" ON "regras_desconto_faixas"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE UNIQUE INDEX "regras_desconto_faixas_regraDescontoId_sequencia_key" ON "regras_desconto_faixas"("regraDescontoId", "sequencia");

-- CreateIndex
CREATE INDEX "estoques_empresaId_armazemId_idx" ON "estoques"("empresaId", "armazemId");

-- CreateIndex
CREATE UNIQUE INDEX "estoques_empresaId_produtoId_armazemId_key" ON "estoques"("empresaId", "produtoId", "armazemId");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_numero_idx" ON "notas_saida"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_vendedorId_ano_mes_idx" ON "notas_saida"("empresaId", "vendedorId", "ano", "mes");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_clienteId_idx" ON "notas_saida"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_dtEmissao_idx" ON "notas_saida"("empresaId", "dtEmissao");

-- CreateIndex
CREATE UNIQUE INDEX "notas_saida_empresaId_codigoErp_key" ON "notas_saida"("empresaId", "codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "nota_saida_xml_notaSaidaId_key" ON "nota_saida_xml"("notaSaidaId");

-- CreateIndex
CREATE INDEX "nota_saida_xml_empresaId_recebidoEm_idx" ON "nota_saida_xml"("empresaId", "recebidoEm");

-- CreateIndex
CREATE INDEX "notas_saida_itens_notaSaidaId_idx" ON "notas_saida_itens"("notaSaidaId");

-- CreateIndex
CREATE INDEX "notas_saida_itens_empresaId_produtoId_idx" ON "notas_saida_itens"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "notas_saida_itens_empresaId_vendedorId_dtEmissao_idx" ON "notas_saida_itens"("empresaId", "vendedorId", "dtEmissao");

-- CreateIndex
CREATE INDEX "notas_saida_itens_empresaId_regraDescontoId_idx" ON "notas_saida_itens"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE INDEX "notas_saida_itens_empresaId_clienteId_produtoId_idx" ON "notas_saida_itens"("empresaId", "clienteId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_saida_itens_empresaId_codigoErp_key" ON "notas_saida_itens"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "contas_bancarias_empresaId_ativo_idx" ON "contas_bancarias"("empresaId", "ativo");

-- CreateIndex
CREATE INDEX "titulos_receber_empresaId_clienteId_idx" ON "titulos_receber"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "titulos_receber_empresaId_vendedorId_vencimento_idx" ON "titulos_receber"("empresaId", "vendedorId", "vencimento");

-- CreateIndex
CREATE INDEX "titulos_receber_empresaId_vencimento_idx" ON "titulos_receber"("empresaId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "titulos_receber_empresaId_codigoErp_key" ON "titulos_receber"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_vendedorId_idx" ON "oportunidades"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_clienteId_idx" ON "oportunidades"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_estagio_idx" ON "oportunidades"("empresaId", "estagio");

-- CreateIndex
CREATE INDEX "atividades_empresaId_vendedorId_idx" ON "atividades"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "atividades_empresaId_clienteId_idx" ON "atividades"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "atividades_empresaId_oportunidadeId_idx" ON "atividades"("empresaId", "oportunidadeId");

-- CreateIndex
CREATE INDEX "atividades_empresaId_orcamentoId_idx" ON "atividades"("empresaId", "orcamentoId");

-- CreateIndex
CREATE INDEX "atividades_empresaId_dataVencimento_idx" ON "atividades"("empresaId", "dataVencimento");

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_vendedorId_idx" ON "orcamentos"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_clienteId_idx" ON "orcamentos"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_status_idx" ON "orcamentos"("empresaId", "status");

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_clienteDecididoPorContatoId_idx" ON "orcamentos"("empresaId", "clienteDecididoPorContatoId");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_empresaId_codigoErp_key" ON "orcamentos"("empresaId", "codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_empresaId_numero_key" ON "orcamentos"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "orcamento_itens_empresaId_produtoId_idx" ON "orcamento_itens"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "orcamento_itens_orcamentoId_idx" ON "orcamento_itens"("orcamentoId");

-- CreateIndex
CREATE INDEX "orcamento_itens_empresaId_regraDescontoId_idx" ON "orcamento_itens"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE INDEX "objetivos_vendedor_mes_empresaId_ano_mes_idx" ON "objetivos_vendedor_mes"("empresaId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_vendedor_mes_empresaId_vendedorId_mes_ano_key" ON "objetivos_vendedor_mes"("empresaId", "vendedorId", "mes", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_vendedor_mes_empresaId_codigoErp_key" ON "objetivos_vendedor_mes"("empresaId", "codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_vendedor_categoria_objetivoVendedorMesId_categori_key" ON "objetivos_vendedor_categoria"("objetivoVendedorMesId", "categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_vendedor_categoria_empresaId_codigoErp_key" ON "objetivos_vendedor_categoria"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "audit_logs_entidade_entidadeId_idx" ON "audit_logs"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "senha_historico_usuarioId_createdAt_idx" ON "senha_historico"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_sessoes_empresaId_status_idx" ON "whatsapp_sessoes"("empresaId", "status");

-- CreateIndex
CREATE INDEX "whatsapp_sessoes_empresaId_instanciaExterna_idx" ON "whatsapp_sessoes"("empresaId", "instanciaExterna");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessoes_empresaId_vendedorId_key" ON "whatsapp_sessoes"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "whatsapp_contatos_empresaId_telefoneNormalizado_idx" ON "whatsapp_contatos"("empresaId", "telefoneNormalizado");

-- CreateIndex
CREATE INDEX "whatsapp_contatos_empresaId_clienteId_idx" ON "whatsapp_contatos"("empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contatos_empresaId_jid_key" ON "whatsapp_contatos"("empresaId", "jid");

-- CreateIndex
CREATE INDEX "whatsapp_conversas_empresaId_clienteId_idx" ON "whatsapp_conversas"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "whatsapp_conversas_empresaId_sessaoId_ultimaMensagemEm_idx" ON "whatsapp_conversas"("empresaId", "sessaoId", "ultimaMensagemEm");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversas_empresaId_sessaoId_contatoId_key" ON "whatsapp_conversas"("empresaId", "sessaoId", "contatoId");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_empresaId_conversaId_criadaEm_idx" ON "whatsapp_mensagens"("empresaId", "conversaId", "criadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_mensagens_empresaId_conversaId_externoId_key" ON "whatsapp_mensagens"("empresaId", "conversaId", "externoId");

-- CreateIndex
CREATE INDEX "whatsapp_reacoes_empresaId_mensagemId_idx" ON "whatsapp_reacoes"("empresaId", "mensagemId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_reacoes_empresaId_mensagemId_deQuem_key" ON "whatsapp_reacoes"("empresaId", "mensagemId", "deQuem");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_agendadas_status_enviarEm_idx" ON "whatsapp_mensagens_agendadas"("status", "enviarEm");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_agendadas_empresaId_conversaId_enviarEm_idx" ON "whatsapp_mensagens_agendadas"("empresaId", "conversaId", "enviarEm");

-- CreateIndex
CREATE INDEX "whatsapp_acoes_empresaId_conversaId_criadaEm_idx" ON "whatsapp_acoes"("empresaId", "conversaId", "criadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_config_empresaId_key" ON "whatsapp_config"("empresaId");

-- CreateIndex
CREATE INDEX "notificacoes_empresaId_usuarioId_lidaEm_ocorridaEm_idx" ON "notificacoes"("empresaId", "usuarioId", "lidaEm", "ocorridaEm");

-- CreateIndex
CREATE INDEX "notificacoes_empresaId_tipo_referenciaId_idx" ON "notificacoes"("empresaId", "tipo", "referenciaId");

-- CreateIndex
CREATE INDEX "comunicados_empresaId_ativo_inicioEm_idx" ON "comunicados"("empresaId", "ativo", "inicioEm");

-- CreateIndex
CREATE INDEX "comunicado_perfis_empresaId_perfilId_idx" ON "comunicado_perfis"("empresaId", "perfilId");

-- AddForeignKey
ALTER TABLE "usuario_horarios" ADD CONSTRAINT "usuario_horarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_superiorId_fkey" FOREIGN KEY ("superiorId") REFERENCES "usuario_empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_menuPaiId_fkey" FOREIGN KEY ("menuPaiId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotinas" ADD CONSTRAINT "rotinas_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_permissoes" ADD CONSTRAINT "perfil_permissoes_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_permissoes" ADD CONSTRAINT "perfil_permissoes_rotinaId_fkey" FOREIGN KEY ("rotinaId") REFERENCES "rotinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "sessoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acessos_log" ADD CONSTRAINT "acessos_log_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao_api_keys" ADD CONSTRAINT "integracao_api_keys_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_subCategoriaId_fkey" FOREIGN KEY ("subCategoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_armazemId_fkey" FOREIGN KEY ("armazemId") REFERENCES "armazens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_fotos" ADD CONSTRAINT "produto_fotos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_fotos" ADD CONSTRAINT "produto_fotos_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_gerenteId_fkey" FOREIGN KEY ("gerenteId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "tabelas_preco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_contatos" ADD CONSTRAINT "cliente_contatos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_contatos" ADD CONSTRAINT "cliente_contatos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_contatos" ADD CONSTRAINT "cliente_contatos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "portal_cliente_perfis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_configs" ADD CONSTRAINT "portal_cliente_configs_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_perfis" ADD CONSTRAINT "portal_cliente_perfis_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_perfil_permissoes" ADD CONSTRAINT "portal_cliente_perfil_permissoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_perfil_permissoes" ADD CONSTRAINT "portal_cliente_perfil_permissoes_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "portal_cliente_perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_perfil_permissoes" ADD CONSTRAINT "portal_cliente_perfil_permissoes_rotinaId_fkey" FOREIGN KEY ("rotinaId") REFERENCES "portal_cliente_rotinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_habilitacoes" ADD CONSTRAINT "portal_cliente_habilitacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_habilitacoes" ADD CONSTRAINT "portal_cliente_habilitacoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_credenciais" ADD CONSTRAINT "portal_cliente_credenciais_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "cliente_contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_cliente_sessoes" ADD CONSTRAINT "portal_cliente_sessoes_credencialId_fkey" FOREIGN KEY ("credencialId") REFERENCES "portal_cliente_credenciais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_alteracoes" ADD CONSTRAINT "cliente_alteracoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_alteracoes" ADD CONSTRAINT "cliente_alteracoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_historico" ADD CONSTRAINT "cliente_historico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_historico" ADD CONSTRAINT "cliente_historico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_config" ADD CONSTRAINT "agente_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_ferramentas" ADD CONSTRAINT "agente_ferramentas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_ferramenta_perfis" ADD CONSTRAINT "agente_ferramenta_perfis_ferramentaId_fkey" FOREIGN KEY ("ferramentaId") REFERENCES "agente_ferramentas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_ferramenta_perfis" ADD CONSTRAINT "agente_ferramenta_perfis_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_credenciais" ADD CONSTRAINT "agente_credenciais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_conversas" ADD CONSTRAINT "agente_conversas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_mensagens" ADD CONSTRAINT "agente_mensagens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_mensagens" ADD CONSTRAINT "agente_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "agente_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_campo_config" ADD CONSTRAINT "cliente_campo_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametros_empresa" ADD CONSTRAINT "parametros_empresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_config" ADD CONSTRAINT "orcamento_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipios" ADD CONSTRAINT "municipios_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "estados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ceps" ADD CONSTRAINT "ceps_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "estados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ceps" ADD CONSTRAINT "ceps_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_cnaes" ADD CONSTRAINT "cliente_cnaes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_cnaes" ADD CONSTRAINT "cliente_cnaes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_cnaes" ADD CONSTRAINT "cliente_cnaes_cnaeId_fkey" FOREIGN KEY ("cnaeId") REFERENCES "cnaes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_categoriaPaiId_fkey" FOREIGN KEY ("categoriaPaiId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condicoes_pagamento" ADD CONSTRAINT "condicoes_pagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armazens" ADD CONSTRAINT "armazens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabelas_preco" ADD CONSTRAINT "tabelas_preco_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "tabelas_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_desconto" ADD CONSTRAINT "regras_desconto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_desconto_faixas" ADD CONSTRAINT "regras_desconto_faixas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_desconto_faixas" ADD CONSTRAINT "regras_desconto_faixas_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_armazemId_fkey" FOREIGN KEY ("armazemId") REFERENCES "armazens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_saida_xml" ADD CONSTRAINT "nota_saida_xml_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_saida_xml" ADD CONSTRAINT "nota_saida_xml_notaSaidaId_fkey" FOREIGN KEY ("notaSaidaId") REFERENCES "notas_saida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_notaSaidaId_fkey" FOREIGN KEY ("notaSaidaId") REFERENCES "notas_saida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_clienteDecididoPorContatoId_fkey" FOREIGN KEY ("clienteDecididoPorContatoId") REFERENCES "cliente_contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_mes" ADD CONSTRAINT "objetivos_vendedor_mes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_mes" ADD CONSTRAINT "objetivos_vendedor_mes_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_categoria" ADD CONSTRAINT "objetivos_vendedor_categoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_categoria" ADD CONSTRAINT "objetivos_vendedor_categoria_objetivoVendedorMesId_fkey" FOREIGN KEY ("objetivoVendedorMesId") REFERENCES "objetivos_vendedor_mes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_categoria" ADD CONSTRAINT "objetivos_vendedor_categoria_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "senha_historico" ADD CONSTRAINT "senha_historico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessoes" ADD CONSTRAINT "whatsapp_sessoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessoes" ADD CONSTRAINT "whatsapp_sessoes_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_contatos" ADD CONSTRAINT "whatsapp_contatos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_contatos" ADD CONSTRAINT "whatsapp_contatos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "whatsapp_sessoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "whatsapp_contatos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_reacoes" ADD CONSTRAINT "whatsapp_reacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_reacoes" ADD CONSTRAINT "whatsapp_reacoes_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "whatsapp_mensagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens_agendadas" ADD CONSTRAINT "whatsapp_mensagens_agendadas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens_agendadas" ADD CONSTRAINT "whatsapp_mensagens_agendadas_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_acoes" ADD CONSTRAINT "whatsapp_acoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_acoes" ADD CONSTRAINT "whatsapp_acoes_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_config" ADD CONSTRAINT "whatsapp_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicado_perfis" ADD CONSTRAINT "comunicado_perfis_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "comunicados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicado_perfis" ADD CONSTRAINT "comunicado_perfis_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicado_perfis" ADD CONSTRAINT "comunicado_perfis_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Role de runtime sem privilégios que contornem RLS
-- ---------------------------------------------------------------------------
-- O role que executa migrations continua sendo o dono das tabelas. A API usa
-- plataforma_app, sem SUPERUSER/BYPASSRLS e sem privilégios de DDL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plataforma_app') THEN
    CREATE ROLE plataforma_app WITH
      LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      PASSWORD 'plataforma_app_dev_only';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO plataforma_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plataforma_app;

ALTER DEFAULT PRIVILEGES FOR ROLE plataforma IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plataforma_app;

-- A senha acima é placeholder de desenvolvimento; em produção troque logo após
-- o primeiro deploy (ver docker/.env.prod.example).

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security por empresa (multi-tenant)
-- ---------------------------------------------------------------------------
-- Toda tabela com empresaId de negócio entra aqui. As exceções deliberadas
-- (refresh_tokens, integracao_api_keys, acessos_log, sessoes) estão
-- documentadas em migrations/README.md: são consultadas antes de existir
-- tenant ativo, então a policy filtraria tudo.
--
-- usuario_empresas tem duas policies: a de tenant e a 'self', que deixa o
-- usuário enxergar os próprios vínculos no login, antes de haver empresa
-- ativa. Postgres combina policies permissivas com OR.

ALTER TABLE "agente_config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agente_config ON "agente_config"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "agente_conversas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agente_conversas ON "agente_conversas"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "agente_credenciais" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agente_credenciais ON "agente_credenciais"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "agente_ferramenta_perfis" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agente_ferramenta_perfis ON "agente_ferramenta_perfis"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "agente_ferramentas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agente_ferramentas ON "agente_ferramentas"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "agente_mensagens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agente_mensagens ON "agente_mensagens"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "armazens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_armazens ON "armazens"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "atividades" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_atividades ON "atividades"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "categorias" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_categorias ON "categorias"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "cliente_alteracoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cliente_alteracoes ON "cliente_alteracoes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "cliente_campo_config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cliente_campo_config ON "cliente_campo_config"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "cliente_cnaes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cliente_cnaes ON "cliente_cnaes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "cliente_contatos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cliente_contatos ON "cliente_contatos"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "cliente_historico" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cliente_historico ON "cliente_historico"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_clientes ON "clientes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "comunicado_perfis" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_comunicado_perfis ON "comunicado_perfis"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "comunicados" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_comunicados ON "comunicados"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "condicoes_pagamento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_condicoes_pagamento ON "condicoes_pagamento"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "contas_bancarias" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contas_bancarias ON "contas_bancarias"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "estoques" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_estoques ON "estoques"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "nota_saida_xml" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_nota_saida_xml ON "nota_saida_xml"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "notas_saida" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notas_saida ON "notas_saida"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "notas_saida_itens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notas_saida_itens ON "notas_saida_itens"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "notificacoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notificacoes ON "notificacoes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "objetivos_vendedor_categoria" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_objetivos_vendedor_categoria ON "objetivos_vendedor_categoria"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "objetivos_vendedor_mes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_objetivos_vendedor_mes ON "objetivos_vendedor_mes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "oportunidades" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_oportunidades ON "oportunidades"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "orcamento_config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_orcamento_config ON "orcamento_config"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "orcamento_itens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_orcamento_itens ON "orcamento_itens"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "orcamentos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_orcamentos ON "orcamentos"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "parametros_empresa" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_parametros_empresa ON "parametros_empresa"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "portal_cliente_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_cliente_configs ON "portal_cliente_configs"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "portal_cliente_habilitacoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_cliente_habilitacoes ON "portal_cliente_habilitacoes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "portal_cliente_perfil_permissoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_cliente_perfil_permissoes ON "portal_cliente_perfil_permissoes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "portal_cliente_perfis" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_cliente_perfis ON "portal_cliente_perfis"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "produto_fotos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_produto_fotos ON "produto_fotos"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "produtos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_produtos ON "produtos"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "regras_desconto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_regras_desconto ON "regras_desconto"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "regras_desconto_faixas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_regras_desconto_faixas ON "regras_desconto_faixas"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "sugestoes_compra" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sugestoes_compra ON "sugestoes_compra"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "tabela_preco_itens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tabela_preco_itens ON "tabela_preco_itens"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "tabelas_preco" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tabelas_preco ON "tabelas_preco"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "titulos_receber" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_titulos_receber ON "titulos_receber"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "usuario_empresas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_usuario_empresas ON "usuario_empresas"
  USING (("usuarioId" = current_setting('app.current_usuario_id'::text, true)));
CREATE POLICY tenant_isolation_usuario_empresas ON "usuario_empresas"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "vendedores" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vendedores ON "vendedores"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_acoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_acoes ON "whatsapp_acoes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_config ON "whatsapp_config"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_contatos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_contatos ON "whatsapp_contatos"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_conversas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_conversas ON "whatsapp_conversas"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_mensagens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_mensagens ON "whatsapp_mensagens"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_mensagens_agendadas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_mensagens_agendadas ON "whatsapp_mensagens_agendadas"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_reacoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_reacoes ON "whatsapp_reacoes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_sessoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_sessoes ON "whatsapp_sessoes"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

