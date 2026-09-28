/* ============================================================================
   CARGA INICIAL POR SQL - gravar os arquivos em disco
   ----------------------------------------------------------------------------
   Rode no mesmo banco do 01-instalar.sql. Grava um arquivo por entidade e
   ano:

       C:\carga-bj\regras-desconto.json
       ...
       C:\carga-bj\notas-saida-2025.json
       C:\carga-bj\notas-saida-2026.json
       ...
       C:\carga-bj\titulos-receber-2026.json

   Dentro, um registro por linha (JSON Lines), no formato do POST
   /integracao/cargas. A plataforma precisa receber na ORDEM DE CARGA - a da
   lista @ordem abaixo, que e a mesma da tabela devolvida no fim: vendedor
   antes de cliente, cliente antes de titulo.

   Cadastros nao tem data que os separe por ano: saem num arquivo cada. Notas
   (emissao) e titulos (emissao) saem um arquivo por ano.

   @EXECUTAR = 1 grava os arquivos daqui mesmo, chamando o bcp pelo
   xp_cmdshell. Os arquivos ficam no disco do SERVIDOR SQL, e a pasta precisa
   existir e aceitar gravacao pela conta do servico do SQL Server.
   @EXECUTAR = 0 so lista os comandos bcp, para rodar num Prompt de Comando.

   O xp_cmdshell costuma vir desligado. Para ligar so durante a carga (precisa
   ser sysadmin), e desligar depois:

       EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
       EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;
       -- ... roda este script ...
       EXEC sp_configure 'xp_cmdshell', 0; RECONFIGURE;
   ========================================================================== */

SET NOCOUNT ON;

-- ---------------------------------------------------------------------------
-- AJUSTE
-- ---------------------------------------------------------------------------
DECLARE @PASTA     nvarchar(260) = N'C:\carga-bj';   -- pasta no servidor SQL (precisa existir)
DECLARE @EXECUTAR  bit           = 1;                -- 1 = grava agora; 0 = so lista os comandos
DECLARE @SERVIDOR  sysname       = @@SERVERNAME;     -- instancia para o bcp (-S)
DECLARE @AUTENTIC  nvarchar(200) = N'-T';            -- -T = conta do Windows; ou N'-U usuario -P senha'
DECLARE @ENTIDADE  varchar(40)   = NULL;             -- NULL = todas; ou so uma: 'titulos-receber'
DECLARE @ANO       int           = NULL;             -- NULL = todos os anos; ou so um: 2026 (so notas e titulos - cadastros saem sempre)

-- ---------------------------------------------------------------------------
DECLARE @banco sysname = DB_NAME();   -- onde estao as procedures

-- Data inicial para o MV_BJAPI14 depois da carga: o inicio desta geracao
-- menos 10 minutos (a mesma margem do U_BJVARRE), em UTC como o S_T_A_M_P_.
-- O que mudar dai em diante a coleta do Protheus pega; o trecho de 10 minutos
-- lido duas vezes nao duplica, a API faz upsert pela chave.
DECLARE @dataInicial varchar(19) = CONVERT(varchar(19), DATEADD(minute, -10, SYSUTCDATETIME()), 120);

DECLARE @ordem TABLE (n int, entidade varchar(40), porAno bit);
INSERT @ordem VALUES
    ( 1, 'regras-desconto',     0),
    ( 2, 'categorias',          0),
    ( 3, 'condicoes-pagamento', 0),
    ( 4, 'armazens',            0),
    ( 5, 'vendedores',          0),
    ( 6, 'fornecedores',        0),
    ( 7, 'produtos',            0),
    ( 8, 'estoque',             0),
    ( 9, 'tabelas-preco',       0),
    (10, 'clientes',            0),
    (11, 'notas-saida',         1),
    (12, 'notas-entrada',       1),
    (13, 'titulos-receber',     1);

IF @ENTIDADE IS NOT NULL
    DELETE @ordem WHERE entidade <> @ENTIDADE;

-- Os anos de cada entidade transacional
IF OBJECT_ID('tempdb..#anos') IS NOT NULL DROP TABLE #anos;
CREATE TABLE #anos (entidade varchar(40), ano int, qtd int);

DECLARE @ent varchar(40);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT entidade FROM @ordem WHERE porAno = 1;
OPEN cur;
FETCH NEXT FROM cur INTO @ent;
WHILE @@FETCH_STATUS = 0
BEGIN
    INSERT #anos (ano, qtd) EXEC dbo.BJ_CARGA_ANOS @ent;
    UPDATE #anos SET entidade = @ent WHERE entidade IS NULL;
    FETCH NEXT FROM cur INTO @ent;
END
CLOSE cur;
DEALLOCATE cur;

IF @ANO IS NOT NULL
    DELETE #anos WHERE ano <> @ANO;

-- Um arquivo por entidade, ou por entidade e ano
IF OBJECT_ID('tempdb..#arq') IS NOT NULL DROP TABLE #arq;
CREATE TABLE #arq (
    seq       int IDENTITY PRIMARY KEY,
    arquivo   nvarchar(200),
    registros int,
    comando   nvarchar(2000),
    resultado nvarchar(max) NULL,
    ok        bit NULL
);

INSERT #arq (arquivo, registros, comando)
SELECT nome, qtd,
       N'bcp "EXEC ' + QUOTENAME(@banco) + N'.dbo.BJ_CARGA_JSONL ''' + entidade + N''', '
       + ISNULL(CAST(ano AS nvarchar(4)), N'NULL')
       + N' WITH RESULT SETS ((linha nvarchar(max)))" queryout "' + @PASTA + N'\' + nome + N'"'
       + N' -S ' + @SERVIDOR + N' ' + @AUTENTIC + N' -c -C 65001'
  FROM (
    SELECT o.n, o.entidade, CAST(NULL AS int) AS ano, CAST(NULL AS int) AS qtd
      FROM @ordem o WHERE o.porAno = 0   -- cadastros saem sempre: notas e titulos dependem deles
    UNION ALL
    SELECT o.n, o.entidade, a.ano, a.qtd
      FROM @ordem o JOIN #anos a ON a.entidade = o.entidade
  ) x
 CROSS APPLY (SELECT nome = x.entidade
                            + ISNULL(N'-' + RIGHT('0000' + CAST(x.ano AS varchar(4)), 4), N'') + N'.json') a
 ORDER BY x.n, x.ano;

-- ---------------------------------------------------------------------------
-- Grava
-- ---------------------------------------------------------------------------
IF @EXECUTAR = 1
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.configurations WHERE name = 'xp_cmdshell' AND value_in_use = 1)
    BEGIN
        RAISERROR('xp_cmdshell esta desligado - veja o cabecalho do script, ou rode com @EXECUTAR = 0.', 16, 1);
        RETURN;
    END

    DECLARE @seq int, @cmd nvarchar(2000), @arq nvarchar(200), @t0 datetime2;
    DECLARE @saida TABLE (linha nvarchar(4000));

    DECLARE cur2 CURSOR LOCAL FAST_FORWARD FOR SELECT seq, comando, arquivo FROM #arq ORDER BY seq;
    OPEN cur2;
    FETCH NEXT FROM cur2 INTO @seq, @cmd, @arq;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @t0 = SYSDATETIME();
        RAISERROR('Gerando %s ...', 0, 1, @arq) WITH NOWAIT;

        DELETE @saida;
        INSERT @saida EXEC master..xp_cmdshell @cmd;

        -- O bcp termina com "N rows copied."; erro vem com SQLState ou Error
        UPDATE #arq
           SET resultado = STUFF((SELECT N' | ' + linha FROM @saida WHERE linha IS NOT NULL
                                   FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 3, N'')
                           + N' (' + CAST(DATEDIFF(second, @t0, SYSDATETIME()) AS nvarchar(10)) + N's)',
               ok = CASE WHEN EXISTS (SELECT 1 FROM @saida WHERE linha LIKE '%rows copied%')
                          AND NOT EXISTS (SELECT 1 FROM @saida WHERE linha LIKE '%SQLState%' OR linha LIKE '%Error%')
                         THEN 1 ELSE 0 END
         WHERE seq = @seq;

        FETCH NEXT FROM cur2 INTO @seq, @cmd, @arq;
    END

    CLOSE cur2;
    DEALLOCATE cur2;
END

SELECT arquivo, registros, ok, resultado, comando FROM #arq ORDER BY seq;

SELECT MV_BJAPI14 = @dataInicial,
       observacao = 'Data inicial da carga para o Protheus, em UTC - ver README';
