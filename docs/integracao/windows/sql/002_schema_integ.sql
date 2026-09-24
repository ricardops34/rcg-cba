-- ============================================================================
-- Script 002: Schema [integ] - Tabelas de Configuração, Controle e Log
-- Banco: BJ_INTEGRADOR
-- ============================================================================

USE [BJ_INTEGRADOR];
GO

-- ----------------------------------------------------------------------------
-- 1. integ.Empresa
-- Cadastro de empresas (tenants) atendidas pela integração.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'integ' AND t.name = 'Empresa')
BEGIN
    CREATE TABLE [integ].[Empresa] (
        [EmpresaId]                  CHAR(2) NOT NULL,
        [Nome]                       VARCHAR(100) NOT NULL,
        [TenantId]                   VARCHAR(100) NOT NULL,
        [BaseUrl]                    VARCHAR(500) NOT NULL,
        [AuthTipo]                   VARCHAR(20) NOT NULL, -- Bearer | Basic | ApiKey | OAuth2
        [CredencialCriptografada]    NVARCHAR(MAX) NULL,
        [ConnectionStringProtheus]   NVARCHAR(MAX) NULL,   -- Se nulo, usa a conexão padrão
        [Ativo]                      BIT NOT NULL CONSTRAINT [DF_integ_Empresa_Ativo] DEFAULT 1,
        [DataAlteracao]              DATETIME2 NOT NULL CONSTRAINT [DF_integ_Empresa_DataAlteracao] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_integ_Empresa] PRIMARY KEY CLUSTERED ([EmpresaId] ASC),
        CONSTRAINT [CK_integ_Empresa_AuthTipo] CHECK ([AuthTipo] IN ('Bearer', 'Basic', 'ApiKey', 'OAuth2'))
    );
END
GO

-- ----------------------------------------------------------------------------
-- 2. integ.Fluxo
-- Definição dos fluxos de integração por empresa.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'integ' AND t.name = 'Fluxo')
BEGIN
    CREATE TABLE [integ].[Fluxo] (
        [FluxoId]         VARCHAR(50) NOT NULL,
        [EmpresaId]       CHAR(2) NOT NULL,
        [Direcao]         VARCHAR(20) NOT NULL, -- ENVIO | RECEBIMENTO
        [TabelaFila]      VARCHAR(50) NOT NULL,
        [TabelaRetorno]   VARCHAR(50) NULL,
        [Endpoint]        VARCHAR(500) NOT NULL,
        [Metodo]          VARCHAR(10) NOT NULL,
        [Cron]            VARCHAR(50) NOT NULL,
        [TamanhoLote]     INT NOT NULL CONSTRAINT [DF_integ_Fluxo_TamanhoLote] DEFAULT 50,
        [TimeoutSeg]      INT NOT NULL CONSTRAINT [DF_integ_Fluxo_TimeoutSeg] DEFAULT 30,
        [MaxRetentativas] INT NOT NULL CONSTRAINT [DF_integ_Fluxo_MaxRetentativas] DEFAULT 3,
        [Ativo]           BIT NOT NULL CONSTRAINT [DF_integ_Fluxo_Ativo] DEFAULT 1,
        [DataAlteracao]   DATETIME2 NOT NULL CONSTRAINT [DF_integ_Fluxo_DataAlteracao] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_integ_Fluxo] PRIMARY KEY CLUSTERED ([FluxoId] ASC, [EmpresaId] ASC),
        CONSTRAINT [FK_integ_Fluxo_Empresa] FOREIGN KEY ([EmpresaId]) REFERENCES [integ].[Empresa] ([EmpresaId]),
        CONSTRAINT [CK_integ_Fluxo_Direcao] CHECK ([Direcao] IN ('ENVIO', 'RECEBIMENTO'))
    );
END
GO

-- ----------------------------------------------------------------------------
-- 3. integ.Parametro
-- Parâmetros dinâmicos por empresa e opcionalmente por fluxo.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'integ' AND t.name = 'Parametro')
BEGIN
    CREATE TABLE [integ].[Parametro] (
        [Id]            INT IDENTITY(1,1) NOT NULL,
        [EmpresaId]     CHAR(2) NOT NULL,
        [FluxoId]       VARCHAR(50) NULL,
        [Chave]         VARCHAR(100) NOT NULL,
        [Valor]         NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_integ_Parametro] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_integ_Parametro_Empresa] FOREIGN KEY ([EmpresaId]) REFERENCES [integ].[Empresa] ([EmpresaId])
    );

    -- Índice Único tratando FluxoId NULL (para suportar unicidade em EmpresaId + FluxoId + Chave)
    CREATE UNIQUE NONCLUSTERED INDEX [UIX_integ_Parametro_Empresa_Fluxo_Chave_NotNull]
    ON [integ].[Parametro] ([EmpresaId], [FluxoId], [Chave])
    WHERE [FluxoId] IS NOT NULL;

    CREATE UNIQUE NONCLUSTERED INDEX [UIX_integ_Parametro_Empresa_Chave_NullFluxo]
    ON [integ].[Parametro] ([EmpresaId], [Chave])
    WHERE [FluxoId] IS NULL;
END
GO

-- ----------------------------------------------------------------------------
-- 4. integ.Controle
-- Controle interno do serviço para cada registro processado, sem alterar o Protheus.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'integ' AND t.name = 'Controle')
BEGIN
    CREATE TABLE [integ].[Controle] (
        [EmpresaId]          CHAR(2) NOT NULL,
        [Tabela]             VARCHAR(50) NOT NULL,
        [Recno]              BIGINT NOT NULL,
        [Status]             VARCHAR(20) NOT NULL, -- PENDENTE | PROCESSANDO | PROCESSADO | ERRO
        [Tentativas]         INT NOT NULL CONSTRAINT [DF_integ_Controle_Tentativas] DEFAULT 0,
        [InicioProcessamento] DATETIME2 NULL,
        [UltimoErro]         NVARCHAR(MAX) NULL,
        [JobId]              VARCHAR(100) NULL,
        [DataAlteracao]      DATETIME2 NOT NULL CONSTRAINT [DF_integ_Controle_DataAlteracao] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_integ_Controle] PRIMARY KEY CLUSTERED ([EmpresaId] ASC, [Tabela] ASC, [Recno] ASC),
        CONSTRAINT [FK_integ_Controle_Empresa] FOREIGN KEY ([EmpresaId]) REFERENCES [integ].[Empresa] ([EmpresaId])
    );
END
GO

-- ----------------------------------------------------------------------------
-- 5. integ.Log
-- Histórico detalhado de requisições e respostas de integração.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'integ' AND t.name = 'Log')
BEGIN
    CREATE TABLE [integ].[Log] (
        [Id]               BIGINT IDENTITY(1,1) NOT NULL,
        [EmpresaId]        CHAR(2) NOT NULL,
        [FluxoId]          VARCHAR(50) NOT NULL,
        [Tabela]           VARCHAR(50) NOT NULL,
        [Recno]            BIGINT NULL,
        [Direcao]          VARCHAR(20) NOT NULL,
        [Url]              VARCHAR(500) NOT NULL,
        [Metodo]           VARCHAR(10) NOT NULL,
        [PayloadEnviado]   NVARCHAR(MAX) NULL,
        [RespostaRecebida] NVARCHAR(MAX) NULL,
        [HttpStatus]       INT NULL,
        [DuracaoMs]        BIGINT NULL,
        [Sucesso]          BIT NOT NULL,
        [MensagemErro]     NVARCHAR(MAX) NULL,
        [DataHora]         DATETIME2 NOT NULL CONSTRAINT [DF_integ_Log_DataHora] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_integ_Log] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_integ_Log_Empresa_Fluxo_DataHora]
    ON [integ].[Log] ([EmpresaId] ASC, [FluxoId] ASC, [DataHora] DESC);
END
GO
