/* ============================================================================
   CARGA INICIAL POR SQL - instalacao
   ----------------------------------------------------------------------------
   Gera, direto do SQL Server, as mesmas linhas que os mapeadores do BJPLA003
   (U_BJMAP*) montam na carga inicial - sem excluidos e com o corte do
   MV_BJAPI14 - no formato JSON Lines do POST /integracao/cargas:

       {"entidade":"armazens","registro":{...o item do PUT...}}

   So LE o Protheus. Nada aqui grava em tabela do ERP: os objetos criados
   (tabela de configuracao, views BJ_<alias> e as procedures) ficam no banco
   em que este script rodar - pode ser o proprio banco do Protheus ou um banco
   separado. Rodar de novo recria tudo e preserva a configuracao ja ajustada.

   Requer SQL Server 2016 ou mais novo (FOR JSON).
   Ver docs/integracao/sql/README.md.
   ========================================================================== */

SET NOCOUNT ON;

-- ---------------------------------------------------------------------------
-- 1. AJUSTE ANTES DE RODAR
-- ---------------------------------------------------------------------------
DECLARE @BANCO   sysname     = N'PROTHEUS';   -- banco onde estao as tabelas do Protheus
DECLARE @EMPRESA varchar(2)  = '01';          -- empresa: SB1010 -> 01
DECLARE @FILIAL  varchar(12) = '01';          -- filial logada (cFilAnt) da integracao

-- ---------------------------------------------------------------------------
-- 2. Configuracao
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.BJ_CARGA_CONFIG') IS NULL
    CREATE TABLE dbo.BJ_CARGA_CONFIG (
        nome      varchar(40)   NOT NULL PRIMARY KEY,
        valor     nvarchar(400) NULL,
        descricao nvarchar(400) NULL
    );

MERGE dbo.BJ_CARGA_CONFIG AS c
USING (VALUES
    ('BANCO',        @BANCO,   N'Banco do Protheus'),
    ('EMPRESA',      @EMPRESA, N'Empresa (sufixo das tabelas)'),
    ('FILIAL',       @FILIAL,  N'Filial da integracao (cFilAnt)'),
    ('CORTE',        NULL,     N'Igual ao MV_BJAPI14, em UTC: AAAA-MM-DD HH:MM:SS. Vazio = origem inteira. Le so o que tem S_T_A_M_P_ >= corte'),
    ('ARMAZENS',     NULL,     N'MV_BJAPI16 - armazens de revenda do estoque, separados por virgula. Vazio = todos'),
    ('TIPOS_TITULO', NULL,     N'MV_BJAPI17 - tipos de titulo que sobem, separados por virgula. Vazio = todos'),
    ('PERC_JUROS',   NULL,     N'MV_RGC_PJUR - juros do boleto quando o titulo nao tem o valor gravado. Sem parametro, 0.02 (padrao do BjBoletos)'),
    ('PERC_MULTA',   NULL,     N'MV_RGC_PMUL - multa do boleto quando o titulo nao tem E1_TXMULTA. Sem parametro, 0.02 (padrao do BjBoletos)'),
    ('BEN_NOME',     NULL,     N'Beneficiario do boleto: M0_NOMECOM + " - " + filial da SE1'),
    ('BEN_DOC',      NULL,     N'Beneficiario do boleto: CNPJ formatado'),
    ('BEN_ENDERECO', NULL,     N'Beneficiario do boleto: endereco de cobranca'),
    ('LINHAS_POR_ARQUIVO', NULL, N'MV_BJAPI12 - registros por arquivo gerado, o mesmo tamanho do lote da fila. Sem parametro, 2000')
) AS n (nome, valor, descricao)
ON c.nome = n.nome
WHEN NOT MATCHED THEN INSERT (nome, valor, descricao) VALUES (n.nome, n.valor, n.descricao)
WHEN MATCHED AND n.nome IN ('BANCO', 'EMPRESA', 'FILIAL') THEN UPDATE SET valor = n.valor;
GO

CREATE OR ALTER FUNCTION dbo.BJ_CFG (@nome varchar(40))
RETURNS nvarchar(400)
AS
BEGIN
    RETURN (SELECT valor FROM dbo.BJ_CARGA_CONFIG WHERE nome = @nome);
END;
GO

-- ---------------------------------------------------------------------------
-- 3. Views BJ_<alias>
--
-- Os mapeadores leem varios campos so "se existirem" (FieldPos). A view
-- expoe a tabela inteira e acrescenta como NULL o campo opcional que nao
-- existir neste dicionario - assim as procedures nao quebram na compilacao.
-- ---------------------------------------------------------------------------
SET NOCOUNT ON;

DECLARE @BANCO sysname = dbo.BJ_CFG('BANCO');
DECLARE @EMP   varchar(2) = dbo.BJ_CFG('EMPRESA');
DECLARE @sql   nvarchar(max);

-- alias : campos opcionais (c = caractere, n = numero, d = data/hora)
DECLARE @tabs TABLE (alias varchar(3) PRIMARY KEY, opcionais varchar(max));
INSERT @tabs VALUES
    ('SZ0', ''),
    ('SZ1', ''),
    ('SBM', 'BM_MSBLQL:c,BM_YTIPO:c'),
    ('SE4', 'E4_FORMA:c,E4_MSBLQL:c'),
    ('NNR', 'NNR_MSBLQL:c'),
    ('SA3', 'A3_COMIS:n,A3_SUPER:c,A3_GEREN:c,A3_CEL:c,A3_MSBLQL:c'),
    ('SA2', 'A2_CEL:c,A2_INSCRM:c,A2_MSBLQL:c'),
    ('SB1', 'B1_QE:n,B1_PRV1:n,B1_CODGTIN:c,B1_PESO:n,B1_PROC:c,B1_LOJPROC:c,B1_XFOR:c,B1_XDESFOR:c,B1_XTEC:c,B1_TPRCG:c,B1_MSBLQL:c'),
    ('SB2', 'B2_CM1:n,B2_DTUCOM:c'),
    ('DA0', ''),
    ('DA1', 'DA1_XDESC:c'),
    ('SA1', 'A1_XLAT:c,A1_XLNG:c,A1_LC:n,A1_VENCLC:c,A1_INSCRM:c,A1_PFISICA:c,A1_ULTCOM:c,A1_PRICOM:c,A1_OBSERV:c,A1_DESCFIN:n,A1_MSBLQL:c'),
    ('SF2', 'F2_VALIPI:n,F2_FRETE:n,F2_MENNOTA:c'),
    ('SD2', 'D2_COMIS1:n,D2_PRUNIT:n,D2_QTDEDEV:n,D2_VALDEV:n,D2_YDESC:c,D2_TIPO:c'),
    ('SF1', 'F1_COND:c,F1_DTDIGIT:c,F1_VALMERC:n,F1_DESCONT:n,F1_VALICM:n,F1_VALSOLI:n,F1_VALIPI:n,F1_FRETE:n,F1_SEGURO:n,F1_DESPESA:n,F1_MENNOTA:c'),
    ('SD1', 'D1_LOCAL:c,D1_VUNIT:n,D1_VALDESC:n,D1_VALICM:n,D1_ICMSRET:n,D1_VALIPI:n,D1_PESO:n'),
    ('SE1', 'E1_CODBAR:c,E1_CODDIG:c,E1_CTRBOL:c,E1_AGEDEP:c,E1_CONTA:c,E1_DACNOSS:c,E1_MORADIA:n,E1_TXMULTA:n'),
    ('SA6', 'A6_DVAGE:c,A6_DVCTA:c'),
    -- pedidos (BJMAPPED): sem C5_ORGPED a entidade sai vazia, como no ADVPL
    ('SC5', 'C5_ORGPED:c,C5_LIBDESC:c'),
    ('SC6', 'C6_BLQ:c'),
    ('SC9', '');

-- Nome fisico de cada tabela: o X2_ARQUIVO da SX2 da empresa (o RetSQLName
-- do Protheus). Tabela fora da SX2 cai na regra padrao: alias + empresa + "0".
IF OBJECT_ID('tempdb..#fisico') IS NOT NULL DROP TABLE #fisico;
CREATE TABLE #fisico (alias varchar(3) PRIMARY KEY, tabela sysname);

DECLARE @sx2 nvarchar(400) = QUOTENAME(@BANCO) + N'.dbo.' + QUOTENAME('SX2' + @EMP + '0');

IF OBJECT_ID(@sx2) IS NULL
    PRINT 'ATENCAO: ' + @sx2 + ' nao encontrada - nomes das tabelas pela regra alias + empresa + 0.';
ELSE
BEGIN
    SET @sql = N'SELECT RTRIM(X2_CHAVE), RTRIM(X2_ARQUIVO) FROM ' + @sx2 +
               N' WHERE D_E_L_E_T_ = '' '' AND RTRIM(X2_ARQUIVO) <> ''''';
    IF OBJECT_ID('tempdb..#sx2') IS NOT NULL DROP TABLE #sx2;
    CREATE TABLE #sx2 (chave varchar(10), arquivo sysname);
    INSERT #sx2 EXEC sp_executesql @sql;
    INSERT #fisico (alias, tabela)
    SELECT t.alias, s.arquivo FROM @tabs t JOIN #sx2 s ON s.chave = t.alias;
END

INSERT #fisico (alias, tabela)
SELECT t.alias, t.alias + @EMP + '0' FROM @tabs t
 WHERE NOT EXISTS (SELECT 1 FROM #fisico f WHERE f.alias = t.alias);

-- Colunas que existem de fato, so das tabelas usadas
IF OBJECT_ID('tempdb..#cols') IS NOT NULL DROP TABLE #cols;
CREATE TABLE #cols (tabela sysname, coluna sysname);

DECLARE @lista nvarchar(max) = STUFF((SELECT N', ''' + tabela + N'''' FROM #fisico FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, N'');
SET @sql = N'SELECT TABLE_NAME, COLUMN_NAME FROM ' + QUOTENAME(@BANCO) + N'.INFORMATION_SCHEMA.COLUMNS ' +
           N'WHERE TABLE_SCHEMA = ''dbo'' AND TABLE_NAME IN (' + @lista + N')';
INSERT #cols EXEC sp_executesql @sql;

DECLARE @alias varchar(3), @opc varchar(max), @tab sysname, @full nvarchar(400);
DECLARE @extra nvarchar(max), @item varchar(100), @col sysname, @tipo char(1), @pos int;

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT alias, opcionais FROM @tabs;
OPEN cur;
FETCH NEXT FROM cur INTO @alias, @opc;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @tab  = (SELECT tabela FROM #fisico WHERE alias = @alias);
    PRINT 'BJ_' + @alias + ' -> ' + @tab;
    SET @full = QUOTENAME(@BANCO) + N'.dbo.' + QUOTENAME(@tab);

    SET @sql = N'DROP VIEW IF EXISTS dbo.BJ_' + @alias;
    EXEC sp_executesql @sql;

    IF NOT EXISTS (SELECT 1 FROM #cols WHERE tabela = @tab)
    BEGIN
        PRINT 'ATENCAO: tabela ' + @tab + ' nao existe em ' + @BANCO + ' - a view BJ_' + @alias + ' nao foi criada.';
    END
    ELSE
    BEGIN
        -- S_T_A_M_P_ so e lido com CORTE preenchido; sem ele na tabela, vira NULL
        SET @opc   = 'S_T_A_M_P_:d' + CASE WHEN @opc > '' THEN ',' + @opc ELSE '' END + ',';
        SET @extra = N'';

        WHILE LEN(@opc) > 0
        BEGIN
            SET @pos  = CHARINDEX(',', @opc);
            SET @item = LEFT(@opc, @pos - 1);
            SET @opc  = SUBSTRING(@opc, @pos + 1, LEN(@opc));
            SET @col  = LEFT(@item, CHARINDEX(':', @item) - 1);
            SET @tipo = RIGHT(@item, 1);

            IF NOT EXISTS (SELECT 1 FROM #cols WHERE tabela = @tab AND coluna = @col)
            BEGIN
                SET @extra += N', CAST(NULL AS ' +
                    CASE @tipo WHEN 'n' THEN N'float' WHEN 'd' THEN N'datetime' ELSE N'varchar(250)' END +
                    N') AS ' + QUOTENAME(@col);
                PRINT 'BJ_' + @alias + ': campo ' + @col + ' nao existe - vai como nulo';
            END
        END

        SET @sql = N'CREATE VIEW dbo.BJ_' + @alias + N' AS SELECT T.*' + @extra + N' FROM ' + @full + N' T';
        EXEC sp_executesql @sql;
    END

    FETCH NEXT FROM cur INTO @alias, @opc;
END

CLOSE cur;
DEALLOCATE cur;
GO

-- ---------------------------------------------------------------------------
-- 4. Filial de cada tabela (o xFilial do Protheus)
--
-- Tabela exclusiva guarda a filial; compartilhada guarda branco; com gestao
-- corporativa, um pedaco dela. Vale o valor gravado que for o MAIOR prefixo
-- da filial da integracao. Recalculado a cada instalacao - confira no fim.
-- ---------------------------------------------------------------------------
SET NOCOUNT ON;

DECLARE @FIL varchar(12) = dbo.BJ_CFG('FILIAL');
DECLARE @alias varchar(3), @fcol sysname, @f varchar(20), @sql nvarchar(max);

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT REPLACE(name, 'BJ_', '') FROM sys.views WHERE name LIKE 'BJ[_]___';
OPEN cur;
FETCH NEXT FROM cur INTO @alias;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @fcol = CASE WHEN LEFT(@alias, 1) = 'S' THEN SUBSTRING(@alias, 2, 2) ELSE @alias END + '_FILIAL';
    SET @f    = NULL;

    SET @sql = N'SELECT TOP 1 @f = ' + @fcol + N' FROM dbo.BJ_' + @alias +
               N' WHERE D_E_L_E_T_ = '' '' AND LEFT(@fil, LEN(' + @fcol + N')) = RTRIM(' + @fcol + N')' +
               N' GROUP BY ' + @fcol + N' ORDER BY LEN(' + @fcol + N') DESC';
    EXEC sp_executesql @sql, N'@fil varchar(12), @f varchar(20) OUTPUT', @fil = @FIL, @f = @f OUTPUT;

    IF @f IS NULL
        SET @f = REPLICATE(' ', ISNULL(COL_LENGTH('dbo.BJ_' + @alias, @fcol), 2));

    MERGE dbo.BJ_CARGA_CONFIG AS c
    USING (SELECT 'FIL_' + @alias AS nome) AS n ON c.nome = n.nome
    WHEN MATCHED THEN UPDATE SET valor = @f
    WHEN NOT MATCHED THEN INSERT (nome, valor, descricao)
        VALUES (n.nome, @f, N'xFilial("' + @alias + N'") - valor gravado em ' + @fcol);

    FETCH NEXT FROM cur INTO @alias;
END

CLOSE cur;
DEALLOCATE cur;
GO

-- ---------------------------------------------------------------------------
-- 5. Parametros (SX6) e beneficiario do boleto (SYS_COMPANY)
--
-- So preenche o que ainda estiver vazio: o que voce ajustar a mao fica.
-- ---------------------------------------------------------------------------
SET NOCOUNT ON;

DECLARE @BANCO sysname = dbo.BJ_CFG('BANCO');
DECLARE @EMP   varchar(2) = dbo.BJ_CFG('EMPRESA');
DECLARE @FIL   varchar(12) = dbo.BJ_CFG('FILIAL');
DECLARE @sx6   nvarchar(400) = QUOTENAME(@BANCO) + N'.dbo.' + QUOTENAME('SX6' + @EMP + '0');
DECLARE @sql   nvarchar(max), @v nvarchar(400);
DECLARE @par TABLE (cfg varchar(40), mv varchar(20));

INSERT @par VALUES
    ('ARMAZENS', 'MV_BJAPI16'), ('TIPOS_TITULO', 'MV_BJAPI17'),
    ('PERC_JUROS', 'MV_RGC_PJUR'), ('PERC_MULTA', 'MV_RGC_PMUL'),
    ('LINHAS_POR_ARQUIVO', 'MV_BJAPI12'),
    ('MV_BJAPI14', 'MV_BJAPI14');

IF OBJECT_ID(@sx6) IS NULL
    PRINT 'ATENCAO: ' + @sx6 + ' nao encontrada - preencha ARMAZENS, TIPOS_TITULO, PERC_JUROS e PERC_MULTA a mao.';
ELSE
BEGIN
    DECLARE @cfg varchar(40), @mv varchar(20);
    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT cfg, mv FROM @par;
    OPEN cur;
    FETCH NEXT FROM cur INTO @cfg, @mv;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @v = NULL;
        SET @sql = N'SELECT TOP 1 @v = RTRIM(X6_CONTEUD) FROM ' + @sx6 +
                   N' WHERE D_E_L_E_T_ = '' '' AND X6_VAR = @mv AND RTRIM(X6_FIL) IN (@fil, '''')' +
                   N' ORDER BY CASE WHEN RTRIM(X6_FIL) = @fil THEN 0 ELSE 1 END';
        EXEC sp_executesql @sql, N'@mv varchar(20), @fil varchar(12), @v nvarchar(400) OUTPUT',
             @mv = @mv, @fil = @FIL, @v = @v OUTPUT;

        IF @cfg = 'MV_BJAPI14'
            -- O corte NAO e copiado: o MV_BJAPI14 aceita DD/MM/AAAA em hora local, e
            -- aqui ele precisa estar em UTC. Fica so o aviso.
            PRINT 'MV_BJAPI14 no Protheus = ''' + ISNULL(@v, '') + ''' - ajuste CORTE (em UTC) se quiser o mesmo recorte.';
        ELSE
            UPDATE dbo.BJ_CARGA_CONFIG SET valor = @v WHERE nome = @cfg AND valor IS NULL;

        FETCH NEXT FROM cur INTO @cfg, @mv;
    END

    CLOSE cur;
    DEALLOCATE cur;
END

-- Juros e multa sem parametro na SX6: o BjBoletos le os dois com
-- SuperGetMV(..., .T., '0.02'), entao sem cadastro vale 0.02. Mesmo padrao aqui.
UPDATE dbo.BJ_CARGA_CONFIG SET valor = '0.02'
 WHERE nome IN ('PERC_JUROS', 'PERC_MULTA') AND valor IS NULL;
IF @@ROWCOUNT > 0
    PRINT 'PERC_JUROS/PERC_MULTA sem MV_RGC_PJUR/MV_RGC_PMUL na SX6 - usando 0.02, o padrao do BjBoletos.';

-- Registros por arquivo: o MV_BJAPI12 (tamanho do lote na fila); o U_BJVARRE
-- usa 2000 quando ele esta zerado, e aqui tambem
UPDATE dbo.BJ_CARGA_CONFIG SET valor = '2000'
 WHERE nome = 'LINHAS_POR_ARQUIVO' AND (valor IS NULL OR TRY_CAST(valor AS int) IS NULL OR TRY_CAST(valor AS int) <= 0);

-- Beneficiario: o SM0 fica na SYS_COMPANY quando o dicionario esta no banco
BEGIN TRY
    DECLARE @nome nvarchar(200), @cgc varchar(20), @end nvarchar(400);

    SET @sql = N'SELECT TOP 1 ' +
        N'@nome = RTRIM(LTRIM(M0_NOMECOM)), @cgc = RTRIM(LTRIM(M0_CGC)), ' +
        N'@end = LEFT(LTRIM(RTRIM(' +
        N'  CASE WHEN RTRIM(M0_ENDCOB) > '''' THEN RTRIM(LTRIM(M0_ENDCOB)) ELSE RTRIM(LTRIM(M0_ENDENT)) END' +
        N'  + CASE WHEN RTRIM(M0_BAIRCOB) > '''' THEN '' - '' + RTRIM(LTRIM(M0_BAIRCOB)) ELSE '''' END' +
        N'  + CASE WHEN RTRIM(M0_CIDCOB)  > '''' THEN '' - '' + RTRIM(LTRIM(M0_CIDCOB))  ELSE '''' END' +
        N'  + CASE WHEN RTRIM(M0_ESTCOB)  > '''' THEN ''/''   + RTRIM(LTRIM(M0_ESTCOB))  ELSE '''' END' +
        N'  + CASE WHEN RTRIM(M0_CEPCOB)  > '''' THEN '' - CEP '' + RTRIM(LTRIM(M0_CEPCOB)) ELSE '''' END' +
        N')), 200) ' +
        N'FROM ' + QUOTENAME(@BANCO) + N'.dbo.SYS_COMPANY ' +
        N'WHERE D_E_L_E_T_ = '' '' AND M0_CODIGO = @emp AND RTRIM(M0_CODFIL) = @fil';

    EXEC sp_executesql @sql,
         N'@emp varchar(2), @fil varchar(12), @nome nvarchar(200) OUTPUT, @cgc varchar(20) OUTPUT, @end nvarchar(400) OUTPUT',
         @emp = @EMP, @fil = @FIL, @nome = @nome OUTPUT, @cgc = @cgc OUTPUT, @end = @end OUTPUT;

    IF @nome IS NULL
        PRINT 'ATENCAO: empresa/filial nao encontrada na SYS_COMPANY - preencha BEN_NOME, BEN_DOC e BEN_ENDERECO a mao.';
    ELSE
    BEGIN
        -- M0_NOMECOM + " - " + xFilial("SE1"), como no BJMAPTIT
        UPDATE dbo.BJ_CARGA_CONFIG SET valor = @nome + N' - ' + dbo.BJ_CFG('FIL_SE1')
         WHERE nome = 'BEN_NOME' AND valor IS NULL;

        -- Transform(M0_CGC, PesqPict("SA1", "A1_CGC")): mascara de CNPJ
        UPDATE dbo.BJ_CARGA_CONFIG
           SET valor = CASE WHEN LEN(@cgc) = 14
                            THEN STUFF(STUFF(STUFF(STUFF(@cgc, 13, 0, '-'), 9, 0, '/'), 6, 0, '.'), 3, 0, '.')
                            ELSE @cgc END
         WHERE nome = 'BEN_DOC' AND valor IS NULL;

        UPDATE dbo.BJ_CARGA_CONFIG SET valor = NULLIF(@end, N'')
         WHERE nome = 'BEN_ENDERECO' AND valor IS NULL;
    END
END TRY
BEGIN CATCH
    PRINT 'ATENCAO: nao foi possivel ler a SYS_COMPANY (' + ERROR_MESSAGE() + ') - preencha BEN_NOME, BEN_DOC e BEN_ENDERECO a mao.';
END CATCH
GO

-- ---------------------------------------------------------------------------
-- 6. Anos de cada entidade transacional (um arquivo por ano)
-- ---------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.BJ_CARGA_ANOS
    @entidade varchar(40)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @corte datetime    = TRY_CONVERT(datetime, dbo.BJ_CFG('CORTE'), 120);
    DECLARE @tipos varchar(400) = REPLACE(ISNULL(dbo.BJ_CFG('TIPOS_TITULO'), ''), ' ', '');

    -- Ano 0 = data em branco
    IF @entidade = 'notas-saida'
        SELECT ano = ISNULL(TRY_CAST(NULLIF(LEFT(F2_EMISSAO, 4), '') AS int), 0), qtd = COUNT(*)
          FROM dbo.BJ_SF2
         WHERE D_E_L_E_T_ = ' ' AND F2_FILIAL = dbo.BJ_CFG('FIL_SF2')
           AND F2_SERIE IN ('1', '3')
           AND (@corte IS NULL OR S_T_A_M_P_ >= @corte)
         GROUP BY ISNULL(TRY_CAST(NULLIF(LEFT(F2_EMISSAO, 4), '') AS int), 0)
         ORDER BY 1;
    ELSE IF @entidade = 'notas-entrada'
        SELECT ano = ISNULL(TRY_CAST(NULLIF(LEFT(F1_EMISSAO, 4), '') AS int), 0), qtd = COUNT(*)
          FROM dbo.BJ_SF1
         WHERE D_E_L_E_T_ = ' ' AND F1_FILIAL = dbo.BJ_CFG('FIL_SF1')
           AND (@corte IS NULL OR S_T_A_M_P_ >= @corte)
         GROUP BY ISNULL(TRY_CAST(NULLIF(LEFT(F1_EMISSAO, 4), '') AS int), 0)
         ORDER BY 1;
    ELSE IF @entidade = 'titulos-receber'
        SELECT ano = ISNULL(TRY_CAST(NULLIF(LEFT(E1_EMISSAO, 4), '') AS int), 0), qtd = COUNT(*)
          FROM dbo.BJ_SE1
         WHERE D_E_L_E_T_ = ' ' AND E1_FILIAL = dbo.BJ_CFG('FIL_SE1')
           AND (@tipos = '' OR ',' + @tipos + ',' LIKE '%,' + RTRIM(E1_TIPO) + ',%')
           AND (@corte IS NULL OR S_T_A_M_P_ >= @corte)
         GROUP BY ISNULL(TRY_CAST(NULLIF(LEFT(E1_EMISSAO, 4), '') AS int), 0)
         ORDER BY 1;
    ELSE
        RAISERROR('BJ_CARGA_ANOS: %s nao e separada por ano.', 16, 1, @entidade);
END;
GO

-- ---------------------------------------------------------------------------
-- 7. As linhas da carga
--
-- Uma entidade por chamada; notas e titulos tambem por ano (@ano NULL = todos,
-- 0 = data em branco). Devolve uma coluna, "linha", na ordem em que a API
-- precisa receber. Cada bloco espelha um mapeador do BJPLA003 - o nome dele
-- vai no comentario, e as regras que nao sao obvias tambem.
--
-- Chaves: filial + "-" + codigo SEM trim, como no ADVPL. A API grava a chave
-- do registro como vem, com os espacos do campo (conferido em 28/09/2026) -
-- entao ela tem de sair igual a que o Protheus manda, senao o mesmo registro
-- vira dois. Nas chaves de referencia (clienteChave, vendedorChave...) a API
-- tira os espacos das pontas, e "01-" com codigo em branco vira nulo.
-- ---------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.BJ_CARGA_JSONL
    @entidade varchar(40),
    @ano      int = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @corte    datetime     = TRY_CONVERT(datetime, dbo.BJ_CFG('CORTE'), 120);
    DECLARE @anoTxt   char(4)      = RIGHT('0000' + CAST(ISNULL(@ano, 0) AS varchar(4)), 4);
    DECLARE @agora    varchar(20)  = CONVERT(varchar(19), SYSUTCDATETIME(), 126) + 'Z';
    DECLARE @armazens varchar(400) = REPLACE(ISNULL(dbo.BJ_CFG('ARMAZENS'), ''), ' ', '');
    DECLARE @tipos    varchar(400) = REPLACE(ISNULL(dbo.BJ_CFG('TIPOS_TITULO'), ''), ' ', '');
    -- Sem valor, 0.02: o padrao do SuperGetMV do BjBoletos
    DECLARE @pJur     float        = ISNULL(TRY_CAST(REPLACE(dbo.BJ_CFG('PERC_JUROS'), ',', '.') AS float), 0.02);
    DECLARE @pMul     float        = ISNULL(TRY_CAST(REPLACE(dbo.BJ_CFG('PERC_MULTA'), ',', '.') AS float), 0.02);
    DECLARE @benNome  nvarchar(400) = NULLIF(LTRIM(RTRIM(dbo.BJ_CFG('BEN_NOME'))), '');
    DECLARE @benDoc   nvarchar(400) = NULLIF(LTRIM(RTRIM(dbo.BJ_CFG('BEN_DOC'))), '');
    DECLARE @benEnd   nvarchar(400) = NULLIF(LTRIM(RTRIM(dbo.BJ_CFG('BEN_ENDERECO'))), '');

    -- xFilial de cada tabela, como gravado (com os espacos)
    DECLARE @fSZ0 varchar(20) = dbo.BJ_CFG('FIL_SZ0'), @fSZ1 varchar(20) = dbo.BJ_CFG('FIL_SZ1'),
            @fSBM varchar(20) = dbo.BJ_CFG('FIL_SBM'), @fSE4 varchar(20) = dbo.BJ_CFG('FIL_SE4'),
            @fNNR varchar(20) = dbo.BJ_CFG('FIL_NNR'), @fSA3 varchar(20) = dbo.BJ_CFG('FIL_SA3'),
            @fSA2 varchar(20) = dbo.BJ_CFG('FIL_SA2'), @fSB1 varchar(20) = dbo.BJ_CFG('FIL_SB1'),
            @fSB2 varchar(20) = dbo.BJ_CFG('FIL_SB2'), @fDA0 varchar(20) = dbo.BJ_CFG('FIL_DA0'),
            @fSA1 varchar(20) = dbo.BJ_CFG('FIL_SA1'), @fSF2 varchar(20) = dbo.BJ_CFG('FIL_SF2'),
            @fSF1 varchar(20) = dbo.BJ_CFG('FIL_SF1'), @fSE1 varchar(20) = dbo.BJ_CFG('FIL_SE1'),
            @fSA6 varchar(20) = dbo.BJ_CFG('FIL_SA6'), @fSC5 varchar(20) = dbo.BJ_CFG('FIL_SC5'),
            @fSC9 varchar(20) = dbo.BJ_CFG('FIL_SC9'), @fSD2 varchar(20) = dbo.BJ_CFG('FIL_SD2');

    DECLARE @crlf char(2) = CHAR(13) + CHAR(10);

    -- =======================================================================
    -- regras-desconto (BJMAPRGD): a linha "001" e o cabecalho; todas as linhas
    -- do codigo, inclusive a 001, sao as faixas.
    -- =======================================================================
    IF @entidade = 'regras-desconto'
    BEGIN
        SELECT linha = N'{"entidade":"regras-desconto","registro":' + r.j + N'}'
          FROM dbo.BJ_SZ0 SZ0
         CROSS APPLY (SELECT
                SZ0.Z0_FILIAL + '-' + SZ0.Z0_CODIGO                          AS chave,
                LTRIM(RTRIM(SZ0.Z0_CODIGO))                                  AS codigoErp,
                LTRIM(RTRIM(SZ0.Z0_DESC))                                    AS descricao,
                CAST(SZ0.Z0_DESCAUT AS decimal(19, 6))                       AS percDescontoAutorizado,
                CAST(SZ0.Z0_PERMAX  AS decimal(19, 6))                       AS percDescontoMaximo,
                CAST(SZ0.Z0_COMISS  AS decimal(19, 6))                       AS percComissao,
                CAST(CASE WHEN LTRIM(RTRIM(SZ0.Z0_PADRAO)) = '1' THEN 1 ELSE 0 END AS bit) AS padrao,
                CAST(CASE WHEN LTRIM(RTRIM(SZ0.Z0_MSBLQL)) = '1' THEN 0 ELSE 1 END AS bit) AS ativo,
                JSON_QUERY(COALESCE((
                    SELECT ISNULL(TRY_CAST(LTRIM(RTRIM(F.Z0_SEQ)) AS int), 0) AS sequencia,
                           CAST(F.Z0_PERCDE  AS decimal(19, 6))                AS percInicial,
                           CAST(F.Z0_PERCATE AS decimal(19, 6))                AS percFinal,
                           CAST(F.Z0_BASE    AS decimal(19, 6))                AS percBaseComissao,
                           CAST(0 AS bit)                                      AS [delete]
                      FROM dbo.BJ_SZ0 F
                     WHERE F.D_E_L_E_T_ = ' ' AND F.Z0_FILIAL = SZ0.Z0_FILIAL AND F.Z0_CODIGO = SZ0.Z0_CODIGO
                     ORDER BY F.R_E_C_N_O_
                       FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]'))           AS faixas
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SZ0.D_E_L_E_T_ = ' ' AND SZ0.Z0_FILIAL = @fSZ0 AND SZ0.Z0_SEQ = '001'
           AND (@corte IS NULL OR SZ0.S_T_A_M_P_ >= @corte
                OR EXISTS (SELECT 1 FROM dbo.BJ_SZ0 D
                            WHERE D.Z0_FILIAL = SZ0.Z0_FILIAL AND D.Z0_CODIGO = SZ0.Z0_CODIGO
                              AND D.S_T_A_M_P_ >= @corte))
         ORDER BY SZ0.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- categorias (BJMAPCAT): as raizes (SZ1) antes das filhas (SBM)
    -- =======================================================================
    IF @entidade = 'categorias'
    BEGIN
        SELECT linha FROM (
            SELECT 1 AS grupo, SZ1.R_E_C_N_O_ AS rec,
                   linha = N'{"entidade":"categorias","registro":' + r.j + N'}'
              FROM dbo.BJ_SZ1 SZ1
             CROSS APPLY (SELECT
                    SZ1.Z1_FILIAL + '-' + SZ1.Z1_TIPO  AS chave,
                    LTRIM(RTRIM(SZ1.Z1_TIPO))          AS codigoErp,
                    LTRIM(RTRIM(SZ1.Z1_DESCRIC))       AS descricao,
                    CAST(NULL AS varchar(1))           AS categoriaPaiChave,
                    CAST(NULL AS varchar(1))           AS regraDescontoChave,
                    CAST(1 AS bit)                     AS ativo
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
             WHERE SZ1.D_E_L_E_T_ = ' ' AND SZ1.Z1_FILIAL = @fSZ1
               AND (@corte IS NULL OR SZ1.S_T_A_M_P_ >= @corte)

            UNION ALL

            SELECT 2, SBM.R_E_C_N_O_,
                   N'{"entidade":"categorias","registro":' + r.j + N'}'
              FROM dbo.BJ_SBM SBM
             CROSS APPLY (SELECT
                    SBM.BM_FILIAL + '-' + SBM.BM_GRUPO  AS chave,
                    LTRIM(RTRIM(SBM.BM_GRUPO))          AS codigoErp,
                    LTRIM(RTRIM(SBM.BM_DESC))           AS descricao,
                    CAST(NULL AS varchar(1))            AS regraDescontoChave,
                    -- Grupo sem tipo sobe como raiz
                    CASE WHEN SBM.BM_YTIPO > '' THEN @fSZ1 + '-' + LTRIM(RTRIM(SBM.BM_YTIPO)) END AS categoriaPaiChave,
                    CAST(CASE WHEN LTRIM(RTRIM(ISNULL(SBM.BM_MSBLQL, '2'))) = '1' THEN 0 ELSE 1 END AS bit) AS ativo
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
             WHERE SBM.D_E_L_E_T_ = ' ' AND SBM.BM_FILIAL = @fSBM
               AND (@corte IS NULL OR SBM.S_T_A_M_P_ >= @corte)
        ) x
        ORDER BY grupo, rec;
        RETURN;
    END

    -- =======================================================================
    -- condicoes-pagamento (BJMAPCND)
    -- =======================================================================
    IF @entidade = 'condicoes-pagamento'
    BEGIN
        SELECT linha = N'{"entidade":"condicoes-pagamento","registro":' + r.j + N'}'
          FROM dbo.BJ_SE4 SE4
         CROSS APPLY (SELECT
                SE4.E4_FILIAL + '-' + SE4.E4_CODIGO   AS chave,
                LTRIM(RTRIM(SE4.E4_CODIGO))           AS codigoErp,
                LTRIM(RTRIM(SE4.E4_DESCRI))           AS descricao,
                CAST(CASE WHEN LTRIM(RTRIM(ISNULL(SE4.E4_MSBLQL, ''))) = '1' THEN 0 ELSE 1 END AS bit) AS ativo,
                NULLIF(LTRIM(RTRIM(SE4.E4_FORMA)), '') AS forma
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SE4.D_E_L_E_T_ = ' ' AND SE4.E4_FILIAL = @fSE4
           AND (@corte IS NULL OR SE4.S_T_A_M_P_ >= @corte)
         ORDER BY SE4.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- armazens (BJMAPARM)
    -- =======================================================================
    IF @entidade = 'armazens'
    BEGIN
        SELECT linha = N'{"entidade":"armazens","registro":' + r.j + N'}'
          FROM dbo.BJ_NNR NNR
         CROSS APPLY (SELECT
                NNR.NNR_FILIAL + '-' + NNR.NNR_CODIGO  AS chave,
                LTRIM(RTRIM(NNR.NNR_CODIGO))           AS codigoErp,
                LTRIM(RTRIM(NNR.NNR_DESCRI))           AS descricao,
                CAST(CASE WHEN LTRIM(RTRIM(ISNULL(NNR.NNR_MSBLQL, ''))) = '1' THEN 0 ELSE 1 END AS bit) AS ativo
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE NNR.D_E_L_E_T_ = ' ' AND NNR.NNR_FILIAL = @fNNR
           AND (@corte IS NULL OR NNR.S_T_A_M_P_ >= @corte)
         ORDER BY NNR.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- vendedores (BJMAPVND + BJOrdSup)
    -- Gerente = codigo que aparece em algum A3_GEREN; supervisor = em algum
    -- A3_SUPER; o resto e vendedor. Gerente nao responde a ninguem, supervisor
    -- responde ao A3_GEREN, vendedor ao A3_SUPER. O superior sai antes de quem
    -- responde a ele (nivel na hierarquia); ciclo no cadastro vai por ultimo.
    -- =======================================================================
    IF @entidade = 'vendedores'
    BEGIN
        WITH ger AS (
            SELECT DISTINCT LTRIM(RTRIM(A3_GEREN)) AS cod FROM dbo.BJ_SA3
             WHERE D_E_L_E_T_ = ' ' AND A3_FILIAL = @fSA3 AND A3_GEREN > ''
        ), sup AS (
            SELECT DISTINCT LTRIM(RTRIM(A3_SUPER)) AS cod FROM dbo.BJ_SA3
             WHERE D_E_L_E_T_ = ' ' AND A3_FILIAL = @fSA3 AND A3_SUPER > ''
        ), v AS (
            SELECT SA3.*, p.ehGer, p.ehSup,
                   SA3.A3_FILIAL + '-' + SA3.A3_COD AS chave,
                   CASE WHEN o.supOri > '' AND LTRIM(RTRIM(o.supOri)) <> LTRIM(RTRIM(SA3.A3_COD))
                         AND EXISTS (SELECT 1 FROM dbo.BJ_SA3 X
                                      WHERE X.D_E_L_E_T_ = ' ' AND X.A3_FILIAL = @fSA3 AND X.A3_COD = o.supOri)
                        THEN @fSA3 + '-' + o.supOri END AS supChave
              FROM dbo.BJ_SA3 SA3
             CROSS APPLY (SELECT
                    ehGer = CASE WHEN EXISTS (SELECT 1 FROM ger WHERE ger.cod = LTRIM(RTRIM(SA3.A3_COD))) THEN 1 ELSE 0 END) g
             CROSS APPLY (SELECT
                    ehGer = g.ehGer,
                    ehSup = CASE WHEN g.ehGer = 0 AND EXISTS (SELECT 1 FROM sup WHERE sup.cod = LTRIM(RTRIM(SA3.A3_COD))) THEN 1 ELSE 0 END) p
             CROSS APPLY (SELECT supOri = CASE WHEN p.ehGer = 1 THEN NULL
                                               WHEN p.ehSup = 1 THEN SA3.A3_GEREN
                                               ELSE SA3.A3_SUPER END) o
             WHERE SA3.D_E_L_E_T_ = ' ' AND SA3.A3_FILIAL = @fSA3
               AND (@corte IS NULL OR SA3.S_T_A_M_P_ >= @corte)
        ), niv AS (
            -- Compara sem espacos nas DUAS pontas: a SA3 guarda a filial ora
            -- vazia, ora com espacos, e "-000035" e "  -000035" sao o mesmo
            -- vendedor (a API tira os espacos da referencia).
            SELECT v.chave, 0 AS nivel FROM v
             WHERE v.supChave IS NULL OR LTRIM(RTRIM(v.supChave)) = LTRIM(RTRIM(v.chave))
                OR NOT EXISTS (SELECT 1 FROM v p WHERE LTRIM(RTRIM(p.chave)) = LTRIM(RTRIM(v.supChave)))
            UNION ALL
            SELECT c.chave, n.nivel + 1 FROM v c
              JOIN niv n ON LTRIM(RTRIM(c.supChave)) = LTRIM(RTRIM(n.chave))
             WHERE LTRIM(RTRIM(c.supChave)) <> LTRIM(RTRIM(c.chave))
        )
        SELECT linha = N'{"entidade":"vendedores","registro":' + r.j + N'}'
          FROM v
          LEFT JOIN niv ON niv.chave = v.chave
         CROSS APPLY (SELECT tel = CASE WHEN v.A3_CEL > '' THEN LTRIM(RTRIM(v.A3_CEL))
                                        ELSE LTRIM(RTRIM(v.A3_DDDTEL)) + LTRIM(RTRIM(v.A3_TEL)) END,
                             bloq = CASE WHEN LTRIM(RTRIM(ISNULL(v.A3_MSBLQL, ''))) = '1' THEN 1 ELSE 0 END) t
         CROSS APPLY (SELECT
                v.chave                                  AS chave,
                LTRIM(RTRIM(v.A3_COD))                   AS codigoErp,
                LTRIM(RTRIM(v.A3_NOME))                  AS nome,
                CAST(NULL AS varchar(1))                 AS dataNascimento,
                CAST(1 - t.bloq AS bit)                  AS ativo,
                CAST(t.bloq AS bit)                      AS desligado,
                NULLIF(LTRIM(RTRIM(v.A3_NREDUZ)), '')    AS nomeReduzido,
                NULLIF(LTRIM(RTRIM(v.A3_EMAIL)), '')     AS email,
                NULLIF(t.tel, '')                        AS telefone,
                CAST(v.A3_COMIS AS decimal(19, 6))       AS percComissao,
                v.supChave                               AS supervisorChave,
                CAST(CASE WHEN v.ehGer = 1 OR v.ehSup = 1 THEN 1 ELSE 0 END AS bit) AS supervisor,
                CAST(CASE WHEN v.ehGer = 1 OR v.ehSup = 1 THEN 0 ELSE 1 END AS bit) AS vendedor
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         ORDER BY ISNULL(niv.nivel, 9999), v.R_E_C_N_O_
        OPTION (MAXRECURSION 1000);
        RETURN;
    END

    -- =======================================================================
    -- fornecedores (BJMAPFOR)
    -- =======================================================================
    IF @entidade = 'fornecedores'
    BEGIN
        SELECT linha = N'{"entidade":"fornecedores","registro":' + r.j + N'}'
          FROM dbo.BJ_SA2 SA2
         CROSS APPLY (SELECT
                SA2.A2_FILIAL + '-' + SA2.A2_COD + '-' + SA2.A2_LOJA   AS chave,
                LTRIM(RTRIM(SA2.A2_COD + SA2.A2_LOJA))                 AS codigoErp,
                LTRIM(RTRIM(SA2.A2_NOME))                              AS razaoSocial,
                CAST(CASE WHEN LTRIM(RTRIM(ISNULL(SA2.A2_MSBLQL, ''))) = '1' THEN 0 ELSE 1 END AS bit) AS ativo,
                -- A2_TIPO em branco: decide o documento (11 digitos = CPF)
                CASE WHEN LTRIM(RTRIM(SA2.A2_TIPO)) = 'F' THEN 'fisica'
                     WHEN SA2.A2_TIPO > '' THEN 'juridica'
                     WHEN LEN(LTRIM(RTRIM(SA2.A2_CGC))) = 11 THEN 'fisica'
                     ELSE 'juridica' END                               AS tipoPessoa,
                NULLIF(LTRIM(RTRIM(SA2.A2_NREDUZ)), '')                AS nomeFantasia,
                NULLIF(LTRIM(RTRIM(SA2.A2_CGC)), '')                   AS cnpjCpf,
                NULLIF(LTRIM(RTRIM(SA2.A2_INSCR)), '')                 AS inscricaoEstadual,
                NULLIF(LTRIM(RTRIM(SA2.A2_END)), '')                   AS endereco,
                NULLIF(LTRIM(RTRIM(SA2.A2_COMPLEM)), '')               AS complemento,
                NULLIF(LTRIM(RTRIM(SA2.A2_BAIRRO)), '')                AS bairro,
                NULLIF(LTRIM(RTRIM(SA2.A2_MUN)), '')                   AS municipio,
                NULLIF(LTRIM(RTRIM(SA2.A2_EST)), '')                   AS uf,
                NULLIF(LTRIM(RTRIM(SA2.A2_CEP)), '')                   AS cep,
                NULLIF(LTRIM(RTRIM(SA2.A2_EMAIL)), '')                 AS email,
                CASE WHEN SA2.A2_TEL > '' THEN LTRIM(RTRIM(SA2.A2_DDD)) + LTRIM(RTRIM(SA2.A2_TEL)) END AS telefone,
                NULLIF(LTRIM(RTRIM(SA2.A2_INSCRM)), '')                AS inscricaoMunicipal,
                NULLIF(LTRIM(RTRIM(SA2.A2_CONTATO)), '')               AS contato,
                NULLIF(LTRIM(RTRIM(SA2.A2_CEL)), '')                   AS celular
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SA2.D_E_L_E_T_ = ' ' AND SA2.A2_FILIAL = @fSA2
           AND (@corte IS NULL OR SA2.S_T_A_M_P_ >= @corte)
         ORDER BY SA2.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- produtos (BJMAPPRD)
    -- =======================================================================
    IF @entidade = 'produtos'
    BEGIN
        SELECT linha = N'{"entidade":"produtos","registro":' + r.j + N'}'
          FROM dbo.BJ_SB1 SB1
         CROSS APPLY (SELECT
                SB1.B1_FILIAL + '-' + SB1.B1_COD                         AS chave,
                LTRIM(RTRIM(SB1.B1_COD))                                 AS codigoErp,
                LTRIM(RTRIM(SB1.B1_DESC))                                AS descricao,
                CASE WHEN SB1.B1_LOCPAD > '' THEN @fNNR + '-' + SB1.B1_LOCPAD END AS armazemChave,
                CAST(NULL AS varchar(1))                                 AS regraDescontoChave,
                CAST(CASE WHEN LTRIM(RTRIM(ISNULL(SB1.B1_MSBLQL, ''))) = '1' THEN 0 ELSE 1 END AS bit) AS ativo,
                NULLIF(LTRIM(RTRIM(SB1.B1_UM)), '')                      AS unidade,
                NULLIF(LTRIM(RTRIM(SB1.B1_POSIPI)), '')                  AS ncm,
                -- Tipo e a categoria raiz; grupo e a subcategoria
                CASE WHEN SB1.B1_TPRCG > '' THEN @fSZ1 + '-' + LTRIM(RTRIM(SB1.B1_TPRCG)) END AS categoriaChave,
                CASE WHEN SB1.B1_GRUPO > '' THEN @fSBM + '-' + LTRIM(RTRIM(SB1.B1_GRUPO)) END AS subCategoriaChave,
                -- GTIN quando existir, senao o codigo de barras classico
                CASE WHEN SB1.B1_CODGTIN > '' THEN LTRIM(RTRIM(SB1.B1_CODGTIN))
                     ELSE NULLIF(LTRIM(RTRIM(SB1.B1_CODBAR)), '') END    AS codigoBarras,
                CAST(SB1.B1_QE   AS decimal(19, 6))                      AS qtdEmbalagem,
                CAST(SB1.B1_PESO AS decimal(19, 6))                      AS peso,
                CAST(SB1.B1_PRV1 AS decimal(19, 6))                      AS ultimoPreco,
                CASE WHEN SB1.B1_PROC > '' THEN @fSA2 + '-' + LTRIM(RTRIM(SB1.B1_PROC)) + '-' + LTRIM(RTRIM(SB1.B1_LOJPROC)) END AS fabricanteChave,
                NULLIF(LTRIM(RTRIM(SB1.B1_XFOR)), '')                    AS codigoFabricante,
                NULLIF(LTRIM(RTRIM(SB1.B1_XDESFOR)), '')                 AS descricaoFabricante,
                NULLIF(LTRIM(RTRIM(SB1.B1_XTEC)), '')                    AS dadosTecnicos
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SB1.D_E_L_E_T_ = ' ' AND SB1.B1_FILIAL = @fSB1
           AND (@corte IS NULL OR SB1.S_T_A_M_P_ >= @corte)
         ORDER BY SB1.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- estoque (BJMAPEST): so saldo de produto e armazem que existem, e so os
    -- armazens de revenda (ARMAZENS = MV_BJAPI16)
    -- =======================================================================
    IF @entidade = 'estoque'
    BEGIN
        SELECT linha = N'{"entidade":"estoque","registro":' + r.j + N'}'
          FROM dbo.BJ_SB2 SB2
          JOIN dbo.BJ_SB1 SB1 ON SB1.B1_FILIAL = @fSB1 AND SB1.B1_COD = SB2.B2_COD AND SB1.D_E_L_E_T_ = ' '
          JOIN dbo.BJ_NNR NNR ON NNR.NNR_FILIAL = @fNNR AND NNR.NNR_CODIGO = SB2.B2_LOCAL AND NNR.D_E_L_E_T_ = ' '
         CROSS APPLY (SELECT
                SB2.B2_FILIAL + '-' + SB2.B2_COD + '-' + SB2.B2_LOCAL   AS chave,
                LTRIM(RTRIM(SB2.B2_COD))                                AS codigoErp,
                SB1.B1_FILIAL + '-' + SB2.B2_COD                        AS produtoChave,
                NNR.NNR_FILIAL + '-' + SB2.B2_LOCAL                     AS armazemChave,
                CAST(SB2.B2_QATU    AS decimal(19, 6))                  AS saldo,
                @agora                                                  AS dataEnvio,
                CAST(SB2.B2_RESERVA AS decimal(19, 6))                  AS reserva,
                CAST(SB2.B2_CM1     AS decimal(19, 6))                  AS custo,
                CASE WHEN SB2.B2_DTUCOM > '' THEN STUFF(STUFF(SB2.B2_DTUCOM, 7, 0, '-'), 5, 0, '-') END AS ultimaCompra
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SB2.D_E_L_E_T_ = ' ' AND SB2.B2_FILIAL = @fSB2
           AND (@armazens = '' OR ',' + @armazens + ',' LIKE '%,' + RTRIM(SB2.B2_LOCAL) + ',%')
           AND (@corte IS NULL OR SB2.S_T_A_M_P_ >= @corte)
         ORDER BY SB2.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- tabelas-preco (BJMAPTAB): vale a ultima linha (maior R_E_C_N_O_) de cada
    -- tabela e de cada item - inclusive quando ela esta excluida, e ai nao sobe
    -- =======================================================================
    IF @entidade = 'tabelas-preco'
    BEGIN
        SELECT linha = N'{"entidade":"tabelas-preco","registro":' + r.j + N'}'
          FROM dbo.BJ_DA0 DA0
         CROSS APPLY (SELECT
                DA0.DA0_FILIAL + '-' + DA0.DA0_CODTAB   AS chave,
                LTRIM(RTRIM(DA0.DA0_CODTAB))            AS codigoErp,
                LTRIM(RTRIM(DA0.DA0_DESCRI))            AS descricao,
                CAST(CASE WHEN LTRIM(RTRIM(DA0.DA0_ATIVO)) = '1' THEN 1 ELSE 0 END AS bit) AS ativo,
                CASE WHEN DA0.DA0_DATDE  > '' THEN STUFF(STUFF(DA0.DA0_DATDE,  7, 0, '-'), 5, 0, '-') END AS dtInicio,
                CASE WHEN DA0.DA0_DATATE > '' THEN STUFF(STUFF(DA0.DA0_DATATE, 7, 0, '-'), 5, 0, '-') END AS dtFim,
                JSON_QUERY(COALESCE((
                    SELECT DA1.DA1_FILIAL + '-' + DA0.DA0_CODTAB + '-' + DA1.DA1_CODPRO + '-' + DA1.DA1_ITEM AS chave,
                           @fSB1 + '-' + DA1.DA1_CODPRO                                    AS produtoChave,
                           CAST(DA1.DA1_PRCVEN AS decimal(19, 6))                          AS preco,
                           CAST(CASE WHEN LTRIM(RTRIM(DA1.DA1_ATIVO)) = '1' THEN 1 ELSE 0 END AS bit) AS ativo,
                           CAST(0 AS bit)                                                  AS [delete],
                           CASE WHEN DA1.DA1_XDESC > '' THEN @fSZ0 + '-' + LTRIM(RTRIM(DA1.DA1_XDESC)) END AS regraDescontoChave
                      FROM dbo.BJ_DA1 DA1
                     WHERE DA1.DA1_FILIAL = DA0.DA0_FILIAL AND DA1.DA1_CODTAB = DA0.DA0_CODTAB
                       AND DA1.D_E_L_E_T_ = ' ' AND DA1.DA1_CODPRO > ''
                       AND DA1.R_E_C_N_O_ = (SELECT MAX(X.R_E_C_N_O_) FROM dbo.BJ_DA1 X
                                              WHERE X.DA1_FILIAL = DA1.DA1_FILIAL AND X.DA1_CODTAB = DA1.DA1_CODTAB
                                                AND X.DA1_CODPRO = DA1.DA1_CODPRO AND X.DA1_ITEM = DA1.DA1_ITEM)
                     ORDER BY DA1.R_E_C_N_O_
                       FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]'))                    AS itens
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE DA0.D_E_L_E_T_ = ' ' AND DA0.DA0_FILIAL = @fDA0
           AND DA0.R_E_C_N_O_ = (SELECT MAX(X.R_E_C_N_O_) FROM dbo.BJ_DA0 X
                                  WHERE X.DA0_FILIAL = DA0.DA0_FILIAL AND X.DA0_CODTAB = DA0.DA0_CODTAB)
           AND (@corte IS NULL OR DA0.S_T_A_M_P_ >= @corte
                OR EXISTS (SELECT 1 FROM dbo.BJ_DA1 D
                            WHERE D.DA1_FILIAL = DA0.DA0_FILIAL AND D.DA1_CODTAB = DA0.DA0_CODTAB
                              AND D.S_T_A_M_P_ >= @corte))
         ORDER BY DA0.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- clientes (BJMAPCLI)
    -- =======================================================================
    IF @entidade = 'clientes'
    BEGIN
        SELECT linha = N'{"entidade":"clientes","registro":' + r.j + N'}'
          FROM dbo.BJ_SA1 SA1
         CROSS APPLY (SELECT
                SA1.A1_FILIAL + '-' + SA1.A1_COD + '-' + SA1.A1_LOJA   AS chave,
                LTRIM(RTRIM(SA1.A1_COD + SA1.A1_LOJA))                 AS codigoErp,
                LTRIM(RTRIM(SA1.A1_NOME))                              AS razaoSocial,
                @fSA3 + '-' + SA1.A1_VEND                              AS vendedorChave,
                CASE WHEN SA1.A1_TABELA > '' THEN @fDA0 + '-' + SA1.A1_TABELA END AS tabelaPrecoChave,
                CASE WHEN SA1.A1_COND   > '' THEN @fSE4 + '-' + SA1.A1_COND   END AS condicaoPagamentoChave,
                CAST(CASE WHEN LTRIM(RTRIM(ISNULL(SA1.A1_MSBLQL, ''))) = '1' THEN 0 ELSE 1 END AS bit) AS ativo,
                NULLIF(LTRIM(RTRIM(SA1.A1_NREDUZ)), '')                AS nomeFantasia,
                NULLIF(LTRIM(RTRIM(SA1.A1_CGC)), '')                   AS cnpjCpf,
                NULLIF(LTRIM(RTRIM(SA1.A1_INSCR)), '')                 AS inscricaoEstadual,
                NULLIF(LTRIM(RTRIM(SA1.A1_END)), '')                   AS endereco,
                NULLIF(LTRIM(RTRIM(SA1.A1_COMPLEM)), '')               AS complemento,
                NULLIF(LTRIM(RTRIM(SA1.A1_BAIRRO)), '')                AS bairro,
                NULLIF(LTRIM(RTRIM(SA1.A1_MUN)), '')                   AS municipio,
                NULLIF(LTRIM(RTRIM(SA1.A1_EST)), '')                   AS uf,
                NULLIF(LTRIM(RTRIM(SA1.A1_CEP)), '')                   AS cep,
                NULLIF(LTRIM(RTRIM(SA1.A1_CONTATO)), '')               AS contato,
                NULLIF(LTRIM(RTRIM(SA1.A1_EMAIL)), '')                 AS email,
                NULLIF(LTRIM(RTRIM(SA1.A1_CELULAR)), '')               AS celular,
                CASE WHEN LTRIM(RTRIM(SA1.A1_PESSOA)) = 'F' THEN 'fisica' ELSE 'juridica' END AS tipoPessoa,
                CAST(CASE WHEN LTRIM(RTRIM(SA1.A1_CONTRIB)) = '1' THEN 1 ELSE 0 END AS bit) AS contribuinteIcms,
                CASE WHEN SA1.A1_TEL > '' THEN LTRIM(RTRIM(SA1.A1_DDD)) + LTRIM(RTRIM(SA1.A1_TEL)) END AS telefone,
                NULLIF(LTRIM(RTRIM(SA1.A1_INSCRM)), '')                AS inscricaoMunicipal,
                NULLIF(LTRIM(RTRIM(SA1.A1_PFISICA)), '')               AS rg,
                NULLIF(LTRIM(RTRIM(SA1.A1_OBSERV)), '')                AS observacao,
                CAST(SA1.A1_LC AS decimal(19, 6))                      AS limiteCredito,
                CASE WHEN SA1.A1_VENCLC > '' THEN STUFF(STUFF(SA1.A1_VENCLC, 7, 0, '-'), 5, 0, '-') END AS vencimentoLimite,
                CASE WHEN SA1.A1_ULTCOM > '' THEN STUFF(STUFF(SA1.A1_ULTCOM, 7, 0, '-'), 5, 0, '-') END AS ultimaCompra,
                CASE WHEN SA1.A1_PRICOM > '' THEN STUFF(STUFF(SA1.A1_PRICOM, 7, 0, '-'), 5, 0, '-') END AS primeiraCompra,
                -- Val() do ADVPL: vazio vira 0
                ISNULL(TRY_CAST(REPLACE(LTRIM(RTRIM(SA1.A1_XLAT)), ',', '.') AS decimal(12, 8)), 0) AS latitude,
                ISNULL(TRY_CAST(REPLACE(LTRIM(RTRIM(SA1.A1_XLNG)), ',', '.') AS decimal(12, 8)), 0) AS longitude
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SA1.D_E_L_E_T_ = ' ' AND SA1.A1_FILIAL = @fSA1
           AND (@corte IS NULL OR SA1.S_T_A_M_P_ >= @corte)
         ORDER BY SA1.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- notas-saida (BJMAPNFS): series 1 e 3, por ano de emissao
    -- =======================================================================
    IF @entidade = 'notas-saida'
    BEGIN
        SELECT linha = N'{"entidade":"notas-saida","registro":' + r.j + N'}'
          FROM dbo.BJ_SF2 SF2
         CROSS APPLY (SELECT
                SF2.F2_FILIAL + '-' + SF2.F2_DOC + '-' + SF2.F2_SERIE + '-' + SF2.F2_CLIENTE + '-' +
                    SF2.F2_LOJA + '-' + SF2.F2_FORMUL + '-' + SF2.F2_TIPO             AS chave,
                LTRIM(RTRIM(SF2.F2_DOC))                                              AS codigoErp,
                LTRIM(RTRIM(SF2.F2_DOC))                                              AS numero,
                -- Devolucao de compra (D): o F2_CLIENTE e um fornecedor
                CASE WHEN LTRIM(RTRIM(SF2.F2_TIPO)) = 'D' THEN @fSA2 + '-' + SF2.F2_CLIENTE + '-' + SF2.F2_LOJA END AS fornecedorChave,
                CASE WHEN LTRIM(RTRIM(SF2.F2_TIPO)) = 'D' THEN NULL ELSE @fSA1 + '-' + SF2.F2_CLIENTE + '-' + SF2.F2_LOJA END AS clienteChave,
                @fSA3 + '-' + SF2.F2_VEND1                                            AS vendedorChave,
                @fSE4 + '-' + SF2.F2_COND                                             AS condicaoChave,
                CAST(SF2.F2_VALBRUT AS decimal(19, 6))                                AS vlrBruto,
                CAST(SF2.F2_VALMERC AS decimal(19, 6))                                AS vlrMercadoria,
                CAST(SF2.F2_VALMERC AS decimal(19, 6))                                AS vlrItens,
                CAST(SF2.F2_DESCONT AS decimal(19, 6))                                AS vlrDesconto,
                CAST(SF2.F2_VALICM  AS decimal(19, 6))                                AS vlrIcms,
                CAST(0 AS bit)                                                        AS comodato,
                CAST(1 AS bit)                                                        AS ativo,
                NULLIF(LTRIM(RTRIM(SF2.F2_SERIE)), '')                                AS serie,
                NULLIF(LTRIM(RTRIM(SF2.F2_ESPECIE)), '')                              AS especieFiscal,
                NULLIF(LTRIM(RTRIM(SF2.F2_TIPO)), '')                                 AS tipo,
                NULLIF(LTRIM(RTRIM(SF2.F2_CHVNFE)), '')                               AS chaveNfe,
                CASE WHEN SF2.F2_EMISSAO > '' THEN STUFF(STUFF(SF2.F2_EMISSAO, 7, 0, '-'), 5, 0, '-') END AS dtEmissao,
                CASE WHEN SF2.F2_EMISSAO > '' AND SF2.F2_CHVNFE > '' THEN STUFF(STUFF(SF2.F2_EMISSAO, 7, 0, '-'), 5, 0, '-') END AS dtNfe,
                CAST(ISNULL(SF2.F2_VALIPI, 0) AS decimal(19, 6))                      AS vlrIpi,
                CAST(ISNULL(SF2.F2_FRETE, 0)  AS decimal(19, 6))                      AS vlrFrete,
                NULLIF(LTRIM(RTRIM(SF2.F2_MENNOTA)), '')                              AS mensagem,
                -- F2_DUPL decide se a nota e venda nas analises. Vai sempre, mesmo
                -- vazio ('' = nao gerou); nulo a plataforma trataria como "nao sei".
                ISNULL(LTRIM(RTRIM(SF2.F2_DUPL)), '')                                 AS duplicata,
                CAST(ISNULL((SELECT SUM(D.D2_VALDEV) FROM dbo.BJ_SD2 D
                              WHERE D.D2_FILIAL = SF2.F2_FILIAL AND D.D2_DOC = SF2.F2_DOC AND D.D2_SERIE = SF2.F2_SERIE
                                AND D.D2_CLIENTE = SF2.F2_CLIENTE AND D.D2_LOJA = SF2.F2_LOJA
                                AND ISNULL(D.D2_TIPO, SF2.F2_TIPO) = SF2.F2_TIPO
                                AND D.D_E_L_E_T_ = ' '), 0) AS decimal(19, 6))        AS vlrDevolucao,
                JSON_QUERY(COALESCE((
                    SELECT SD2.D2_FILIAL + '-' + SD2.D2_DOC + '-' + SD2.D2_SERIE + '-' + SD2.D2_CLIENTE + '-' +
                               SD2.D2_LOJA + '-' + SD2.D2_COD + '-' + SD2.D2_ITEM          AS chave,
                           ISNULL(TRY_CAST(LTRIM(RTRIM(SD2.D2_ITEM)) AS int), 0)            AS item,
                           @fSB1 + '-' + SD2.D2_COD                                         AS produtoChave,
                           CAST(SD2.D2_QUANT  AS decimal(19, 6))                            AS quantidade,
                           CAST(SD2.D2_PRCVEN AS decimal(19, 6))                            AS vlrUnitario,
                           CAST(SD2.D2_DESCON AS decimal(19, 6))                            AS vlrDesconto,
                           CAST(SD2.D2_TOTAL  AS decimal(19, 6))                            AS vlrTotal,
                           CAST(0 AS bit)                                                   AS comodato,
                           CAST(1 AS bit)                                                   AS ativo,
                           CAST(0 AS bit)                                                   AS [delete],
                           NULLIF(LTRIM(RTRIM(SD2.D2_CF)), '')                              AS cfop,
                           NULLIF(LTRIM(RTRIM(SD2.D2_TP)), '')                              AS tipo,
                           CAST(SD2.D2_PRUNIT  AS decimal(19, 6))                           AS vlrTabela,
                           CAST(SD2.D2_COMIS1  AS decimal(19, 6))                           AS percComissao,
                           CAST(SD2.D2_QTDEDEV AS decimal(19, 6))                           AS quantidadeDev,
                           CAST(SD2.D2_VALDEV  AS decimal(19, 6))                           AS vlrDev,
                           NULLIF(LTRIM(RTRIM(SD2.D2_YDESC)), '')                           AS regraDescontoCodigo,
                           CAST(CASE WHEN SD2.D2_TOTAL + SD2.D2_DESCON > 0
                                     THEN ROUND(SD2.D2_DESCON / (SD2.D2_TOTAL + SD2.D2_DESCON) * 100, 4)
                                     ELSE 0 END AS decimal(19, 4))                          AS percDesconto
                      FROM dbo.BJ_SD2 SD2
                     WHERE SD2.D2_FILIAL = SF2.F2_FILIAL AND SD2.D2_DOC = SF2.F2_DOC AND SD2.D2_SERIE = SF2.F2_SERIE
                       AND SD2.D2_CLIENTE = SF2.F2_CLIENTE AND SD2.D2_LOJA = SF2.F2_LOJA
                       AND ISNULL(SD2.D2_TIPO, SF2.F2_TIPO) = SF2.F2_TIPO
                       AND SD2.D_E_L_E_T_ = ' ' AND SD2.D2_ITEM > ''
                     ORDER BY SD2.R_E_C_N_O_
                       FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]'))                     AS itens
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SF2.D_E_L_E_T_ = ' ' AND SF2.F2_FILIAL = @fSF2
           AND SF2.F2_SERIE IN ('1', '3')
           AND (@ano IS NULL OR (@ano = 0 AND SF2.F2_EMISSAO = '') OR SF2.F2_EMISSAO LIKE @anoTxt + '%')
           AND (@corte IS NULL OR SF2.S_T_A_M_P_ >= @corte)
         ORDER BY SF2.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- notas-entrada (BJMAPNFE): por ano de emissao
    -- O relacionamento com a SD1 usa os SETE campos (com formulario e tipo).
    -- ICMS-ST: o F1_VALSOLI quando existe; senao, a soma do D1_ICMSRET.
    -- =======================================================================
    IF @entidade = 'notas-entrada'
    BEGIN
        SELECT linha = N'{"entidade":"notas-entrada","registro":' + r.j + N'}'
          FROM dbo.BJ_SF1 SF1
         CROSS APPLY (SELECT
                SF1.F1_FILIAL + '-' + SF1.F1_DOC + '-' + SF1.F1_SERIE + '-' + SF1.F1_FORNECE + '-' +
                    SF1.F1_LOJA + '-' + SF1.F1_FORMUL + '-' + SF1.F1_TIPO             AS chave,
                LTRIM(RTRIM(SF1.F1_DOC))                                              AS codigoErp,
                LTRIM(RTRIM(SF1.F1_DOC))                                              AS numero,
                CAST(SF1.F1_VALBRUT AS decimal(19, 6))                                AS vlrBruto,
                CAST(1 AS bit)                                                        AS ativo,
                -- Devolucao (D): o F1_FORNECE e um cliente
                CASE WHEN LTRIM(RTRIM(SF1.F1_TIPO)) = 'D' THEN @fSA1 + '-' + SF1.F1_FORNECE + '-' + SF1.F1_LOJA END AS clienteChave,
                CASE WHEN LTRIM(RTRIM(SF1.F1_TIPO)) = 'D' THEN NULL ELSE @fSA2 + '-' + SF1.F1_FORNECE + '-' + SF1.F1_LOJA END AS fornecedorChave,
                NULLIF(LTRIM(RTRIM(SF1.F1_SERIE)), '')                                AS serie,
                NULLIF(LTRIM(RTRIM(SF1.F1_ESPECIE)), '')                              AS especieFiscal,
                NULLIF(LTRIM(RTRIM(SF1.F1_TIPO)), '')                                 AS tipo,
                NULLIF(LTRIM(RTRIM(SF1.F1_CHVNFE)), '')                               AS chaveNfe,
                CASE WHEN SF1.F1_EMISSAO > '' THEN STUFF(STUFF(SF1.F1_EMISSAO, 7, 0, '-'), 5, 0, '-') END AS dtEmissao,
                CASE WHEN SF1.F1_EMISSAO > '' AND SF1.F1_CHVNFE > '' THEN STUFF(STUFF(SF1.F1_EMISSAO, 7, 0, '-'), 5, 0, '-') END AS dtNfe,
                CASE WHEN SF1.F1_DTDIGIT > '' THEN STUFF(STUFF(SF1.F1_DTDIGIT, 7, 0, '-'), 5, 0, '-') END AS dtEntrada,
                @fSE4 + '-' + SF1.F1_COND                                             AS condicaoChave,
                CAST(ISNULL(SF1.F1_VALMERC, 0) AS decimal(19, 6))                     AS vlrMercadoria,
                CAST(ISNULL(SF1.F1_VALMERC, 0) AS decimal(19, 6))                     AS vlrItens,
                CAST(ISNULL(SF1.F1_DESCONT, 0) AS decimal(19, 6))                     AS vlrDesconto,
                CAST(ISNULL(SF1.F1_VALICM, 0)  AS decimal(19, 6))                     AS vlrIcms,
                CAST(COALESCE(SF1.F1_VALSOLI,
                              (SELECT SUM(ISNULL(D.D1_ICMSRET, 0)) FROM dbo.BJ_SD1 D
                                WHERE D.D1_FILIAL = SF1.F1_FILIAL AND D.D1_DOC = SF1.F1_DOC AND D.D1_SERIE = SF1.F1_SERIE
                                  AND D.D1_FORNECE = SF1.F1_FORNECE AND D.D1_LOJA = SF1.F1_LOJA
                                  AND D.D1_FORMUL = SF1.F1_FORMUL AND D.D1_TIPO = SF1.F1_TIPO
                                  AND D.D_E_L_E_T_ = ' '),
                              0) AS decimal(19, 6))                                   AS vlrIcmsSt,
                CAST(ISNULL(SF1.F1_VALIPI, 0)  AS decimal(19, 6))                     AS vlrIpi,
                CAST(ISNULL(SF1.F1_FRETE, 0)   AS decimal(19, 6))                     AS vlrFrete,
                CAST(ISNULL(SF1.F1_SEGURO, 0)  AS decimal(19, 6))                     AS vlrSeguro,
                CAST(ISNULL(SF1.F1_DESPESA, 0) AS decimal(19, 6))                     AS vlrDespesa,
                NULLIF(LTRIM(RTRIM(SF1.F1_MENNOTA)), '')                              AS mensagem,
                JSON_QUERY(COALESCE((
                    SELECT SD1.D1_FILIAL + '-' + SD1.D1_DOC + '-' + SD1.D1_SERIE + '-' + SD1.D1_FORNECE + '-' +
                               SD1.D1_LOJA + '-' + SD1.D1_COD + '-' + SD1.D1_ITEM          AS chave,
                           ISNULL(TRY_CAST(LTRIM(RTRIM(SD1.D1_ITEM)) AS int), 0)            AS item,
                           @fSB1 + '-' + SD1.D1_COD                                         AS produtoChave,
                           CAST(SD1.D1_QUANT AS decimal(19, 6))                             AS quantidade,
                           CAST(SD1.D1_TOTAL AS decimal(19, 6))                             AS vlrTotal,
                           CAST(1 AS bit)                                                   AS ativo,
                           CAST(0 AS bit)                                                   AS [delete],
                           NULLIF(LTRIM(RTRIM(SD1.D1_CF)), '')                              AS cfop,
                           @fNNR + '-' + SD1.D1_LOCAL                                       AS armazemChave,
                           CAST(ISNULL(SD1.D1_VUNIT, 0)   AS decimal(19, 6))                AS vlrUnitario,
                           CAST(ISNULL(SD1.D1_VALDESC, 0) AS decimal(19, 6))                AS vlrDesconto,
                           CAST(ISNULL(SD1.D1_VALICM, 0)  AS decimal(19, 6))                AS vlrIcms,
                           CAST(ISNULL(SD1.D1_ICMSRET, 0) AS decimal(19, 6))                AS vlrIcmsSt,
                           CAST(ISNULL(SD1.D1_VALIPI, 0)  AS decimal(19, 6))                AS vlrIpi,
                           CAST(SD1.D1_PESO AS decimal(19, 6))                              AS peso
                      FROM dbo.BJ_SD1 SD1
                     WHERE SD1.D1_FILIAL = SF1.F1_FILIAL AND SD1.D1_DOC = SF1.F1_DOC AND SD1.D1_SERIE = SF1.F1_SERIE
                       AND SD1.D1_FORNECE = SF1.F1_FORNECE AND SD1.D1_LOJA = SF1.F1_LOJA
                       AND SD1.D1_FORMUL = SF1.F1_FORMUL AND SD1.D1_TIPO = SF1.F1_TIPO
                       AND SD1.D_E_L_E_T_ = ' ' AND SD1.D1_ITEM > ''
                     ORDER BY SD1.R_E_C_N_O_
                       FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]'))                     AS itens
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SF1.D_E_L_E_T_ = ' ' AND SF1.F1_FILIAL = @fSF1
           AND (@ano IS NULL OR (@ano = 0 AND SF1.F1_EMISSAO = '') OR SF1.F1_EMISSAO LIKE @anoTxt + '%')
           AND (@corte IS NULL OR SF1.S_T_A_M_P_ >= @corte)
         ORDER BY SF1.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- titulos-receber (BJMAPTIT + BJContaTit, BJDadosSA6, BJCodCompen,
    -- BJInstrBol): por ano de emissao, so os tipos de TIPOS_TITULO.
    -- Titulo sem carteira (E1_CTRBOL) nao tem boleto: os campos do boleto vao
    -- nulos. O digito do nosso numero vai do E1_DACNOSS; sem ele, nulo - o
    -- U_DACBRA do BjBoletos nao e reproduzido aqui, e a plataforma recalcula.
    -- =======================================================================
    IF @entidade = 'titulos-receber'
    BEGIN
        SELECT linha = N'{"entidade":"titulos-receber","registro":' + r.j + N'}'
          FROM dbo.BJ_SE1 SE1
          LEFT JOIN dbo.BJ_SA1 SA1
            ON SA1.D_E_L_E_T_ = ' ' AND SA1.A1_FILIAL = @fSA1
           AND SA1.A1_COD = SE1.E1_CLIENTE AND SA1.A1_LOJA = SE1.E1_LOJA
         CROSS APPLY (SELECT
                port = LTRIM(RTRIM(ISNULL(SE1.E1_PORTADO, ''))),
                age  = LTRIM(RTRIM(ISNULL(SE1.E1_AGEDEP, ''))),
                cta  = LTRIM(RTRIM(ISNULL(SE1.E1_CONTA, ''))),
                cart = LTRIM(RTRIM(ISNULL(SE1.E1_CTRBOL, ''))),
                -- Val() do ADVPL: os digitos do comeco
                nbco = LEFT(LTRIM(RTRIM(SE1.E1_NUMBCO)), PATINDEX('%[^0-9]%', LTRIM(RTRIM(SE1.E1_NUMBCO)) + 'x') - 1)) t
         OUTER APPLY (SELECT TOP 1 SA6.A6_COD, SA6.A6_NOME,
                        ageA6 = LTRIM(RTRIM(SA6.A6_AGENCIA)), dvAge = LTRIM(RTRIM(ISNULL(SA6.A6_DVAGE, ''))),
                        ctaA6 = LTRIM(RTRIM(SA6.A6_NUMCON)),  dvCta = LTRIM(RTRIM(ISNULL(SA6.A6_DVCTA, '')))
                        FROM dbo.BJ_SA6 SA6
                       WHERE SA6.D_E_L_E_T_ = ' ' AND SA6.A6_FILIAL = @fSA6
                         AND SA6.A6_COD = t.port AND SA6.A6_AGENCIA = t.age AND SA6.A6_NUMCON = t.cta
                       ORDER BY SA6.R_E_C_N_O_) a6
         CROSS APPLY (SELECT
                banco = CASE WHEN a6.A6_COD IS NULL THEN t.port ELSE LTRIM(RTRIM(a6.A6_COD)) END,
                bancoNome = LTRIM(RTRIM(ISNULL(a6.A6_NOME, ''))),
                -- Agencia: o digito proprio quando existe; senao, o ultimo caractere
                agencia = CASE WHEN a6.A6_COD IS NULL THEN t.age
                               WHEN a6.dvAge > '' THEN a6.ageA6
                               WHEN LEN(a6.ageA6) > 1 THEN LEFT(a6.ageA6, LEN(a6.ageA6) - 1)
                               ELSE a6.ageA6 END,
                agenciaDv = CASE WHEN a6.A6_COD IS NULL THEN ''
                                 WHEN a6.dvAge > '' THEN a6.dvAge
                                 WHEN LEN(a6.ageA6) > 1 THEN RIGHT(a6.ageA6, 1)
                                 ELSE '' END,
                -- Conta: "0630524-5", ou o digito em A6_DVCTA, ou colado
                conta = CASE WHEN a6.A6_COD IS NULL THEN t.cta
                             WHEN CHARINDEX('-', a6.ctaA6) > 0 AND a6.dvCta = ''
                                  THEN REPLACE(LEFT(a6.ctaA6, LEN(a6.ctaA6) - CHARINDEX('-', REVERSE(a6.ctaA6))), '-', '')
                             WHEN a6.dvCta > '' THEN a6.ctaA6
                             WHEN LEN(a6.ctaA6) > 1 THEN LEFT(a6.ctaA6, LEN(a6.ctaA6) - 1)
                             ELSE a6.ctaA6 END,
                contaDv = CASE WHEN a6.A6_COD IS NULL THEN ''
                               WHEN CHARINDEX('-', a6.ctaA6) > 0 AND a6.dvCta = ''
                                    THEN SUBSTRING(a6.ctaA6, LEN(a6.ctaA6) - CHARINDEX('-', REVERSE(a6.ctaA6)) + 2, 1)
                               WHEN a6.dvCta > '' THEN a6.dvCta
                               WHEN LEN(a6.ctaA6) > 1 THEN RIGHT(a6.ctaA6, 1)
                               ELSE '' END) bk
         CROSS APPLY (SELECT
                nBanco = TRY_CAST(LEFT(bk.banco, PATINDEX('%[^0-9]%', bk.banco + 'x') - 1) AS int)) nb
         CROSS APPLY (SELECT
                -- Juros: o gravado pelo boleto (E1_VALJUR, E1_MORADIA); senao, pelo parametro
                juros = ROUND(CASE WHEN SE1.E1_VALJUR > 0 THEN SE1.E1_VALJUR
                                   WHEN ISNULL(SE1.E1_MORADIA, 0) > 0 THEN SE1.E1_MORADIA
                                   ELSE ROUND((SE1.E1_SALDO * @pJur) / 10, 2) END, 2),
                -- Multa: o percentual do titulo vale mais que o do parametro
                multa = ROUND(SE1.E1_SALDO * CASE WHEN ISNULL(SE1.E1_TXMULTA, 0) > 0 THEN SE1.E1_TXMULTA ELSE @pMul END, 2),
                -- Desconto financeiro do cliente (A1_DESCFIN)
                descf = ROUND((SE1.E1_SALDO * ISNULL(SA1.A1_DESCFIN, 0)) / 100, 2)) v
         CROSS APPLY (SELECT
                SE1.E1_FILIAL + '-' + SE1.E1_PREFIXO + '-' + SE1.E1_NUM + '-' + SE1.E1_PARCELA + '-' + SE1.E1_TIPO AS chave,
                LTRIM(RTRIM(SE1.E1_NUM))                                   AS codigoErp,
                LTRIM(RTRIM(SE1.E1_NUM))                                   AS numero,
                @fSA1 + '-' + SE1.E1_CLIENTE + '-' + SE1.E1_LOJA           AS clienteChave,
                @fSA3 + '-' + SE1.E1_VEND1                                 AS vendedorChave,
                CAST(SE1.E1_VALOR   AS decimal(19, 6))                     AS valor,
                CAST(SE1.E1_SALDO   AS decimal(19, 6))                     AS saldo,
                CAST(SE1.E1_ACRESC  AS decimal(19, 6))                     AS acrescimo,
                CAST(SE1.E1_DECRESC AS decimal(19, 6))                     AS decrescimo,
                CAST(1 AS bit)                                             AS ativo,
                NULLIF(LTRIM(RTRIM(SE1.E1_PREFIXO)), '')                   AS prefixo,
                NULLIF(LTRIM(RTRIM(SE1.E1_PARCELA)), '')                   AS parcela,
                NULLIF(LTRIM(RTRIM(SE1.E1_TIPO)), '')                      AS tipo,
                NULLIF(LTRIM(RTRIM(SE1.E1_FORPGT)), '')                    AS formaPgto,
                NULLIF(LTRIM(RTRIM(SE1.E1_HIST)), '')                      AS historico,
                CASE WHEN SE1.E1_EMISSAO > '' THEN STUFF(STUFF(SE1.E1_EMISSAO, 7, 0, '-'), 5, 0, '-') END AS emissao,
                CASE WHEN SE1.E1_VENCTO  > '' THEN STUFF(STUFF(SE1.E1_VENCTO,  7, 0, '-'), 5, 0, '-') END AS vencimento,
                CASE WHEN SE1.E1_VENCREA > '' THEN STUFF(STUFF(SE1.E1_VENCREA, 7, 0, '-'), 5, 0, '-') END AS vencimentoReal,
                CASE WHEN SE1.E1_BAIXA   > '' THEN STUFF(STUFF(SE1.E1_BAIXA,   7, 0, '-'), 5, 0, '-') END AS dtBaixa,
                -- Nosso numero com 11 digitos, como o Ret_cBarra
                CASE WHEN TRY_CAST(t.nbco AS bigint) > 0
                     THEN RIGHT(REPLICATE('0', 11) + CAST(TRY_CAST(t.nbco AS bigint) AS varchar(20)), 11) END AS nossoNumero,
                NULLIF(t.cart, '')                                         AS carteira,
                NULLIF(LTRIM(RTRIM(SE1.E1_CODBAR)), '')                    AS codigoBarras,
                NULLIF(LTRIM(RTRIM(SE1.E1_CODDIG)), '')                    AS linhaDigitavel,
                CASE WHEN t.port = '' THEN NULL
                     ELSE LEFT(t.port + CASE WHEN t.age  > '' THEN '/' + t.age  ELSE '' END
                                      + CASE WHEN t.cta  > '' THEN '/' + t.cta  ELSE '' END
                                      + CASE WHEN t.cart > '' THEN '/' + t.cart ELSE '' END, 80) END AS contaBancariaDescricao,
                -- ---- Boleto: so com carteira ----
                CASE WHEN t.cart > '' THEN NULLIF(bk.banco, '') END        AS banco,
                CASE WHEN t.cart > '' THEN NULLIF(bk.bancoNome, '') END    AS bancoNome,
                CASE WHEN t.cart > '' AND ISNULL(nb.nBanco, 0) > 0
                     THEN RIGHT('000' + CAST(nb.nBanco AS varchar(10)), 3)
                          + ISNULL('-' + (SELECT cc.dv FROM (VALUES
                                ('001', '9'), ('033', '7'), ('041', '8'), ('077', '9'), ('104', '0'),
                                ('237', '2'), ('341', '7'), ('356', '5'), ('389', '8'), ('399', '9'),
                                ('422', '7'), ('453', '1'), ('745', '7'), ('748', 'X'), ('756', '0')) cc (b, dv)
                                WHERE cc.b = RIGHT('000' + CAST(nb.nBanco AS varchar(10)), 3)), '') END AS bancoCodigoCompensacao,
                CASE WHEN t.cart > '' THEN NULLIF(bk.agencia, '') END      AS agencia,
                CASE WHEN t.cart > '' THEN NULLIF(bk.agenciaDv, '') END    AS agenciaDv,
                CASE WHEN t.cart > '' THEN NULLIF(bk.conta, '') END        AS conta,
                CASE WHEN t.cart > '' THEN NULLIF(bk.contaDv, '') END      AS contaDv,
                CASE WHEN t.cart > '' THEN @benNome END                    AS beneficiarioNome,
                CASE WHEN t.cart > '' THEN @benDoc END                     AS beneficiarioDocumento,
                CASE WHEN t.cart > '' THEN @benEnd END                     AS beneficiarioEndereco,
                CASE WHEN t.cart > '' THEN 'Pagavel preferencialmente em qualquer Agencia Bradesco' END AS localPagamento,
                CASE WHEN t.cart > '' THEN 'Sim' END                       AS aceite,
                CASE WHEN t.cart > '' THEN 'DM' END                        AS especieDocumento,
                CASE WHEN t.cart > '' THEN LEFT(NULLIF(LTRIM(RTRIM(SE1.E1_DACNOSS)), ''), 2) END AS nossoNumeroDac,
                CASE WHEN t.cart > '' THEN CAST(v.juros AS decimal(19, 2)) END AS jurosValorDia,
                CASE WHEN t.cart > '' THEN CAST(v.multa AS decimal(19, 2)) END AS multaValor,
                CASE WHEN t.cart > '' THEN CAST(v.descf AS decimal(19, 2)) END AS descontoValor,
                CASE WHEN t.cart > '' THEN NULLIF(LEFT(CONCAT(
                        CASE WHEN v.juros > 0 THEN N'Importancia por Dia de Atraso de R$ ' + FORMAT(v.juros, 'N2', 'pt-BR') END,
                        CASE WHEN v.multa > 0 THEN CONCAT(CASE WHEN v.juros > 0 THEN @crlf END,
                             N'Apos Vencimento Cobrar Multa de R$ ', FORMAT(v.multa, 'N2', 'pt-BR')) END,
                        CASE WHEN v.descf > 0 THEN CONCAT(CASE WHEN v.juros > 0 OR v.multa > 0 THEN @crlf END,
                             N'Conceder Desconto de R$ ', FORMAT(v.descf, 'N2', 'pt-BR'), N' ate o vencimento.') END
                     ), 1000), N'') END                                    AS instrucoes
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SE1.D_E_L_E_T_ = ' ' AND SE1.E1_FILIAL = @fSE1
           AND (@tipos = '' OR ',' + @tipos + ',' LIKE '%,' + RTRIM(SE1.E1_TIPO) + ',%')
           AND (@ano IS NULL OR (@ano = 0 AND SE1.E1_EMISSAO = '') OR SE1.E1_EMISSAO LIKE @anoTxt + '%')
           AND (@corte IS NULL OR SE1.S_T_A_M_P_ >= @corte)
         ORDER BY SE1.R_E_C_N_O_;
        RETURN;
    END

    -- =======================================================================
    -- pedidos (BJMAPPED): situacao dos pedidos que vieram da plataforma
    -- (C5_ORGPED = 'P'). Precisa que o orcamento ja esteja vinculado la - o
    -- pedido e achado pela chave C5_FILIAL-C5_NUM. Situacao, nesta ordem
    -- (decisoes do usuario, 28 e 29/09/2026):
    --   todo item encerrado e algum por residuo (C6_BLQ = 'R') -> cancelado
    --   todo item com C6_QTDENT >= C6_QTDVEN                 -> faturado
    --   algum item com C6_QTDENT > 0                         -> faturado_parcial ("Faturando")
    --   C5_LIBDESC = '2'                                     -> bloqueado_desconto
    --   SC9 nao faturada com C9_BLCRED preenchido e <> '10'  -> bloqueado_credito
    --   idem C9_BLEST (com o credito liberado)               -> bloqueado_estoque
    --   SC9 nao faturada sem bloqueio                        -> liberado
    --   senao                                                -> pendente
    -- Carga inicial: sem excluidos. O CORTE vale como a janela do ADVPL: o
    -- pedido entra se a SC5, a SC6, a SC9 ou a SD2 dele mudou depois do corte.
    -- =======================================================================
    IF @entidade = 'pedidos'
    BEGIN
        SELECT linha = N'{"entidade":"pedidos","registro":' + r.j + N'}'
          FROM dbo.BJ_SC5 SC5
         CROSS APPLY (SELECT
                -- Itens ativos, uma leitura so para os tres indicadores
                lResid = CASE WHEN EXISTS (SELECT 1 FROM dbo.BJ_SC6 I
                                            WHERE I.D_E_L_E_T_ = ' ' AND I.C6_FILIAL = SC5.C5_FILIAL AND I.C6_NUM = SC5.C5_NUM
                                              AND ISNULL(I.C6_BLQ, '') LIKE '%R%') THEN 1 ELSE 0 END,
                lTudo  = CASE WHEN EXISTS (SELECT 1 FROM dbo.BJ_SC6 I
                                            WHERE I.D_E_L_E_T_ = ' ' AND I.C6_FILIAL = SC5.C5_FILIAL AND I.C6_NUM = SC5.C5_NUM)
                               AND NOT EXISTS (SELECT 1 FROM dbo.BJ_SC6 I
                                                WHERE I.D_E_L_E_T_ = ' ' AND I.C6_FILIAL = SC5.C5_FILIAL AND I.C6_NUM = SC5.C5_NUM
                                                  AND ISNULL(I.C6_BLQ, '') NOT LIKE '%R%'
                                                  AND I.C6_QTDENT < I.C6_QTDVEN) THEN 1 ELSE 0 END,
                lAlgum = CASE WHEN EXISTS (SELECT 1 FROM dbo.BJ_SC6 I
                                            WHERE I.D_E_L_E_T_ = ' ' AND I.C6_FILIAL = SC5.C5_FILIAL AND I.C6_NUM = SC5.C5_NUM
                                              AND I.C6_QTDENT > 0) THEN 1 ELSE 0 END,
                -- Liberacao ainda nao faturada; "10" e faturado, nao bloqueio
                lCred  = CASE WHEN EXISTS (SELECT 1 FROM dbo.BJ_SC9 L
                                            WHERE L.D_E_L_E_T_ = ' ' AND L.C9_FILIAL = @fSC9 AND L.C9_PEDIDO = SC5.C5_NUM
                                              AND RTRIM(L.C9_NFISCAL) = ''
                                              AND RTRIM(L.C9_BLCRED) NOT IN ('', '10')) THEN 1 ELSE 0 END,
                lEst   = CASE WHEN EXISTS (SELECT 1 FROM dbo.BJ_SC9 L
                                            WHERE L.D_E_L_E_T_ = ' ' AND L.C9_FILIAL = @fSC9 AND L.C9_PEDIDO = SC5.C5_NUM
                                              AND RTRIM(L.C9_NFISCAL) = ''
                                              AND RTRIM(L.C9_BLCRED) IN ('', '10')
                                              AND RTRIM(L.C9_BLEST) NOT IN ('', '10')) THEN 1 ELSE 0 END,
                lLib   = CASE WHEN EXISTS (SELECT 1 FROM dbo.BJ_SC9 L
                                            WHERE L.D_E_L_E_T_ = ' ' AND L.C9_FILIAL = @fSC9 AND L.C9_PEDIDO = SC5.C5_NUM
                                              AND RTRIM(L.C9_NFISCAL) = ''
                                              AND RTRIM(L.C9_BLCRED) IN ('', '10')
                                              AND RTRIM(L.C9_BLEST) IN ('', '10')) THEN 1 ELSE 0 END
                ) f
         CROSS APPLY (SELECT
                SC5.C5_FILIAL + '-' + SC5.C5_NUM                                      AS chave,
                LTRIM(RTRIM(SC5.C5_NUM))                                              AS codigoErp,
                CASE WHEN f.lTudo = 1 AND f.lResid = 1                     THEN 'cancelado'
                     WHEN f.lTudo = 1                                      THEN 'faturado'
                     WHEN f.lAlgum = 1                                     THEN 'faturado_parcial'
                     WHEN LTRIM(RTRIM(ISNULL(SC5.C5_LIBDESC, ''))) = '2'   THEN 'bloqueado_desconto'
                     WHEN f.lCred = 1                                      THEN 'bloqueado_credito'
                     WHEN f.lEst = 1                                       THEN 'bloqueado_estoque'
                     WHEN f.lLib = 1                                       THEN 'liberado'
                     ELSE 'pendente' END                                              AS situacao,
                JSON_QUERY(COALESCE((
                    -- Chave do item: a mesma do BJVincula (C6_FILIAL-C6_NUM-C6_ITEM-C6_PRODUTO)
                    SELECT SC6.C6_FILIAL + '-' + SC6.C6_NUM + '-' + SC6.C6_ITEM + '-' + SC6.C6_PRODUTO AS chave,
                           @fSB1 + '-' + SC6.C6_PRODUTO                                  AS produtoChave,
                           CAST(SC6.C6_QTDVEN AS decimal(19, 6))                         AS quantidade,
                           CAST(SC6.C6_PRCVEN AS decimal(19, 6))                         AS vlrUnitario,
                           CAST(SC6.C6_QTDENT AS decimal(19, 6))                         AS quantidadeEntregue
                      FROM dbo.BJ_SC6 SC6
                     WHERE SC6.D_E_L_E_T_ = ' ' AND SC6.C6_FILIAL = SC5.C5_FILIAL AND SC6.C6_NUM = SC5.C5_NUM
                     ORDER BY SC6.C6_ITEM
                       FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]'))                    AS itens,
                JSON_QUERY(COALESCE((
                    SELECT n.numero, n.serie, n.emissao
                      FROM (SELECT DISTINCT
                                   LTRIM(RTRIM(SD2.D2_DOC))                              AS numero,
                                   LTRIM(RTRIM(SD2.D2_SERIE))                            AS serie,
                                   STUFF(STUFF(SD2.D2_EMISSAO, 7, 0, '-'), 5, 0, '-')    AS emissao
                              FROM dbo.BJ_SD2 SD2
                             WHERE SD2.D_E_L_E_T_ = ' ' AND SD2.D2_FILIAL = @fSD2 AND SD2.D2_PEDIDO = SC5.C5_NUM) n
                     ORDER BY n.emissao, n.numero
                       FOR JSON PATH, INCLUDE_NULL_VALUES), N'[]'))                    AS notas
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) r(j)
         WHERE SC5.D_E_L_E_T_ = ' ' AND SC5.C5_FILIAL = @fSC5
           AND SC5.C5_ORGPED = 'P'   -- plataforma
           AND (@corte IS NULL
                OR SC5.S_T_A_M_P_ >= @corte
                OR EXISTS (SELECT 1 FROM dbo.BJ_SC6 I WHERE I.C6_FILIAL = SC5.C5_FILIAL AND I.C6_NUM = SC5.C5_NUM AND I.S_T_A_M_P_ >= @corte)
                OR EXISTS (SELECT 1 FROM dbo.BJ_SC9 L WHERE L.C9_FILIAL = @fSC9 AND L.C9_PEDIDO = SC5.C5_NUM AND L.S_T_A_M_P_ >= @corte)
                OR EXISTS (SELECT 1 FROM dbo.BJ_SD2 D WHERE D.D2_FILIAL = @fSD2 AND D.D2_PEDIDO = SC5.C5_NUM AND D.S_T_A_M_P_ >= @corte))
         ORDER BY SC5.R_E_C_N_O_;
        RETURN;
    END

    RAISERROR('BJ_CARGA_JSONL: entidade "%s" desconhecida.', 16, 1, @entidade);
END;
GO

-- ---------------------------------------------------------------------------
-- 8. Preparar uma entidade/ano para exportar em partes
--
-- Gera as linhas UMA vez numa tabela de trabalho (neste banco, nao no
-- Protheus), numeradas na ordem de carga. O 02-comandos-exportar.sql tira
-- dela as partes de LINHAS_POR_ARQUIVO registros sem refazer a consulta.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.BJ_CARGA_LINHAS') IS NULL
    CREATE TABLE dbo.BJ_CARGA_LINHAS (
        entidade varchar(40)   NOT NULL,
        ano      int           NOT NULL,   -- -1 = entidade sem ano (cadastro)
        n        int           NOT NULL,   -- ordem da linha dentro da entidade/ano
        linha    nvarchar(max) NOT NULL,
        CONSTRAINT PK_BJ_CARGA_LINHAS PRIMARY KEY (entidade, ano, n)
    );
GO

CREATE OR ALTER PROCEDURE dbo.BJ_CARGA_PREPARAR
    @entidade  varchar(40),
    @ano       int = NULL,
    -- Por OUTPUT, e nao por SELECT: quem chama nao pode usar INSERT...EXEC,
    -- porque esta procedure ja usa um (o SQL Server nao aninha os dois)
    @registros int = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @chaveAno int = ISNULL(@ano, -1);

    DELETE dbo.BJ_CARGA_LINHAS WHERE entidade = @entidade AND ano = @chaveAno;

    -- A identidade guarda a ordem em que a procedure devolveu as linhas
    CREATE TABLE #l (n int IDENTITY(1, 1) PRIMARY KEY, linha nvarchar(max));
    INSERT #l (linha) EXEC dbo.BJ_CARGA_JSONL @entidade, @ano;

    INSERT dbo.BJ_CARGA_LINHAS (entidade, ano, n, linha)
    SELECT @entidade, @chaveAno, n, linha FROM #l;

    SET @registros = (SELECT COUNT(*) FROM #l);
END;
GO

-- ---------------------------------------------------------------------------
-- 9. Confira a configuracao
-- ---------------------------------------------------------------------------
SELECT nome, '[' + valor + ']' AS valor, descricao FROM dbo.BJ_CARGA_CONFIG ORDER BY nome;
