-- ============================================================================
-- Script 003: Seed com Dados de Exemplo
-- Banco: BJ_INTEGRADOR
-- ============================================================================

USE [BJ_INTEGRADOR];
GO

-- Inserção de Empresa de Teste '01' se não existir
IF NOT EXISTS (SELECT 1 FROM [integ].[Empresa] WHERE [EmpresaId] = '01')
BEGIN
    INSERT INTO [integ].[Empresa] (
        [EmpresaId], [Nome], [TenantId], [BaseUrl], [AuthTipo],
        [CredencialCriptografada], [ConnectionStringProtheus], [Ativo], [DataAlteracao]
    )
    VALUES (
        '01', 'Empresa Exemplo 01', 'tenant-empresa-01', 'https://api.exemplo.com.br', 'Bearer',
        NULL, NULL, 1, SYSDATETIME()
    );
END
GO

-- Inserção de Fluxo de Teste 'ORCAMENTO_ENVIO' para a Empresa '01' se não existir
IF NOT EXISTS (SELECT 1 FROM [integ].[Fluxo] WHERE [FluxoId] = 'ORCAMENTO_ENVIO' AND [EmpresaId] = '01')
BEGIN
    INSERT INTO [integ].[Fluxo] (
        [FluxoId], [EmpresaId], [Direcao], [TabelaFila], [TabelaRetorno],
        [Endpoint], [Metodo], [Cron], [TamanhoLote], [TimeoutSeg],
        [MaxRetentativas], [Ativo], [DataAlteracao]
    )
    VALUES (
        'ORCAMENTO_ENVIO', '01', 'ENVIO', 'SZZ010', 'SZY010',
        '/api/v1/orcamennto', 'POST', '*/5 * * * *', 50, 30,
        3, 1, SYSDATETIME()
    );
END
GO

-- Inserção de Parâmetros de Exemplo para Empresa '01' e Fluxo 'ORCAMENTO_ENVIO'
IF NOT EXISTS (SELECT 1 FROM [integ].[Parametro] WHERE [EmpresaId] = '01' AND [FluxoId] IS NULL AND [Chave] = 'TimeoutProcessamentoMin')
BEGIN
    INSERT INTO [integ].[Parametro] ([EmpresaId], [FluxoId], [Chave], [Valor])
    VALUES ('01', NULL, 'TimeoutProcessamentoMin', '15');
END
GO

IF NOT EXISTS (SELECT 1 FROM [integ].[Parametro] WHERE [EmpresaId] = '01' AND [FluxoId] = 'ORCAMENTO_ENVIO' AND [Chave] = 'TamanhoLotePersonalizado')
BEGIN
    INSERT INTO [integ].[Parametro] ([EmpresaId], [FluxoId], [Chave], [Valor])
    VALUES ('01', 'ORCAMENTO_ENVIO', 'TamanhoLotePersonalizado', '100');
END
GO
