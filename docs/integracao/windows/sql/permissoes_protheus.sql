-- ============================================================================
-- Script: permissoes_protheus.sql
-- ATENÇÃO: Script PARA O DBA EXECUTAR no Banco de Dados do Protheus.
-- Este script NÃO é executado automaticamente pelo installer.
-- ============================================================================
-- Objetivo: Criar login e usuário de aplicação para o serviço BJ.Integrador
-- com permissões MÍNIMAS (Princípio do Menor Privilégio).
-- NENHUMA permissão de DDL (CREATE/ALTER/DROP) ou db_owner é concedida.
-- ============================================================================

USE [master];
GO

-- 1. Criar Login no Servidor SQL Server (alterar a senha no ambiente de produção)
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = N'usr_bj_integrador')
BEGIN
    CREATE LOGIN [usr_bj_integrador] 
    WITH PASSWORD = N'Mudar@Senha#12345', 
         CHECK_EXPIRATION = OFF, 
         CHECK_POLICY = ON;
END
GO

-- 2. Criar Usuário no Banco de Dados do Protheus (substitua [PROTHEUS] pelo nome correto da sua base)
USE [PROTHEUS];
GO

IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = N'usr_bj_integrador')
BEGIN
    CREATE USER [usr_bj_integrador] FOR LOGIN [usr_bj_integrador];
END
GO

-- 3. Conceder permissão de leitura de metadados em sys.tables
GRANT VIEW DEFINITION TO [usr_bj_integrador];
GO

-- 4. Permissões Mínimas em Tabelas de Fila do Protheus (Apenas SELECT e UPDATE nas tabelas de fila SZZ)
-- Substitua 'SZZ010' pelo nome das tabelas de fila das empresas atendidas
GRANT SELECT, UPDATE ON [dbo].[SZZ010] TO [usr_bj_integrador];
GO

-- 5. Permissões Mínimas em Tabelas de Lote/Retorno do Protheus (SELECT e INSERT para recebimentos)
-- Substitua 'SZY010' e 'SC5010' pelas tabelas de lote e retorno atendidas
GRANT SELECT, UPDATE, INSERT ON [dbo].[SZY010] TO [usr_bj_integrador];
GRANT SELECT, INSERT ON [dbo].[SC5010] TO [usr_bj_integrador];
GO
