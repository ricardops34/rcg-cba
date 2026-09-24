-- ============================================================================
-- Script 001: Criar Banco de Dados BJ_INTEGRADOR e Schemas
-- ATENÇÃO: Executar SOMENTE na instância de banco do serviço BJ.Integrador.
-- NUNCA executar nem criar objetos no banco de dados do Protheus.
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'BJ_INTEGRADOR')
BEGIN
    CREATE DATABASE [BJ_INTEGRADOR];
END
GO

USE [BJ_INTEGRADOR];
GO

-- Schema para tabelas de configuração, controle e log da integração
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'integ')
BEGIN
    EXEC('CREATE SCHEMA [integ]');
END
GO

-- Schema reservado para as tabelas internas do Hangfire
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'hangfire')
BEGIN
    EXEC('CREATE SCHEMA [hangfire]');
END
GO
