using Dapper;

namespace BJ.Integrador.Service.Dados;

public static class InicializadorBancoSqlite
{
    public static void InicializarSeNecessario(IFabricaConexao fabricaConexao)
    {
        try
        {
            using var conn = fabricaConexao.CriarConexaoConfig();
            if (conn.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
            {
                conn.Open();

                const string sqlSchema = @"
                    -- 1. integ_Empresa
                    CREATE TABLE IF NOT EXISTS integ_Empresa (
                        EmpresaId TEXT NOT NULL PRIMARY KEY,
                        Nome TEXT NOT NULL,
                        TenantId TEXT NOT NULL,
                        BaseUrl TEXT NOT NULL,
                        AuthTipo TEXT NOT NULL,
                        CredencialCriptografada TEXT NULL,
                        ConnectionStringProtheus TEXT NULL,
                        Ativo INTEGER NOT NULL DEFAULT 1,
                        DataAlteracao TEXT NOT NULL DEFAULT (datetime('now'))
                    );

                    -- 2. integ_Fluxo
                    CREATE TABLE IF NOT EXISTS integ_Fluxo (
                        FluxoId TEXT NOT NULL,
                        EmpresaId TEXT NOT NULL,
                        Direcao TEXT NOT NULL,
                        TabelaFila TEXT NOT NULL,
                        TabelaRetorno TEXT NULL,
                        Endpoint TEXT NOT NULL,
                        Metodo TEXT NOT NULL,
                        Cron TEXT NOT NULL,
                        TamanhoLote INTEGER NOT NULL DEFAULT 50,
                        TimeoutSeg INTEGER NOT NULL DEFAULT 30,
                        MaxRetentativas INTEGER NOT NULL DEFAULT 3,
                        Ativo INTEGER NOT NULL DEFAULT 1,
                        DataAlteracao TEXT NOT NULL DEFAULT (datetime('now')),
                        PRIMARY KEY (FluxoId, EmpresaId)
                    );

                    -- 3. integ_Parametro
                    CREATE TABLE IF NOT EXISTS integ_Parametro (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        EmpresaId TEXT NOT NULL,
                        FluxoId TEXT NULL,
                        Chave TEXT NOT NULL,
                        Valor TEXT NULL
                    );

                    -- 4. integ_Controle
                    CREATE TABLE IF NOT EXISTS integ_Controle (
                        EmpresaId TEXT NOT NULL,
                        Tabela TEXT NOT NULL,
                        Recno INTEGER NOT NULL,
                        Status TEXT NOT NULL,
                        Tentativas INTEGER NOT NULL DEFAULT 0,
                        InicioProcessamento TEXT NULL,
                        UltimoErro TEXT NULL,
                        JobId TEXT NULL,
                        DataAlteracao TEXT NOT NULL DEFAULT (datetime('now')),
                        PRIMARY KEY (EmpresaId, Tabela, Recno)
                    );

                    -- 5. integ_Log
                    CREATE TABLE IF NOT EXISTS integ_Log (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        EmpresaId TEXT NOT NULL,
                        FluxoId TEXT NOT NULL,
                        Tabela TEXT NOT NULL,
                        Recno INTEGER NULL,
                        Direcao TEXT NOT NULL,
                        Url TEXT NOT NULL,
                        Metodo TEXT NOT NULL,
                        PayloadEnviado TEXT NULL,
                        RespostaRecebida TEXT NULL,
                        HttpStatus INTEGER NULL,
                        DuracaoMs INTEGER NULL,
                        Sucesso INTEGER NOT NULL,
                        MensagemErro TEXT NULL,
                        DataHora TEXT NOT NULL DEFAULT (datetime('now'))
                    );

                    -- 6. Tabelas SZY e SZZ para compatibilidade com o Monitor AdvPL BJPLA005
                    CREATE TABLE IF NOT EXISTS SZY (
                        ZY_FILIAL TEXT NOT NULL DEFAULT '  ',
                        ZY_CODIGO TEXT NOT NULL PRIMARY KEY,
                        ZY_DATA TEXT NOT NULL,
                        ZY_HORA TEXT NOT NULL,
                        ZY_STATUS TEXT NOT NULL DEFAULT '1',
                        ZY_LIDOS INTEGER NOT NULL DEFAULT 0,
                        ZY_ENFILE INTEGER NOT NULL DEFAULT 0,
                        ZY_ENVIAD INTEGER NOT NULL DEFAULT 0,
                        ZY_ERROS INTEGER NOT NULL DEFAULT 0,
                        ZY_OBS TEXT NULL,
                        D_E_L_E_T_ TEXT NOT NULL DEFAULT ' '
                    );

                    CREATE TABLE IF NOT EXISTS SZZ (
                        ZZ_FILIAL TEXT NOT NULL DEFAULT '  ',
                        ZZ_CODIGO TEXT NOT NULL,
                        ZZ_SEQUEN TEXT NOT NULL,
                        ZZ_TIPO TEXT NOT NULL,
                        ZZ_ENTID TEXT NOT NULL,
                        ZZ_CHVORI TEXT NOT NULL,
                        ZZ_VERBO TEXT NOT NULL,
                        ZZ_STATUS TEXT NOT NULL DEFAULT '1',
                        ZZ_HTTP INTEGER NULL,
                        ZZ_DTCRIA TEXT NOT NULL,
                        ZZ_HRCRIA TEXT NOT NULL,
                        ZZ_DTEXEC TEXT NULL,
                        ZZ_HREXEC TEXT NULL,
                        ZZ_CHVDES TEXT NULL,
                        ZZ_JSON TEXT NULL,
                        ZZ_RETORN TEXT NULL,
                        D_E_L_E_T_ TEXT NOT NULL DEFAULT ' ',
                        PRIMARY KEY (ZZ_CODIGO, ZZ_SEQUEN)
                    );
                ";

                conn.Execute(sqlSchema);

                // Seed Empresa e Fluxos Padrão se vazia
                const string sqlCheckEmpresa = @"SELECT COUNT(1) FROM integ_Empresa;";
                var totalEmpresas = conn.ExecuteScalar<int>(sqlCheckEmpresa);
                if (totalEmpresas == 0)
                {
                    const string sqlSeedEmpresa = @"
                        INSERT INTO integ_Empresa (EmpresaId, Nome, TenantId, BaseUrl, AuthTipo, Ativo)
                        VALUES ('01', 'Empresa Matriz Exemplo', 'tenant-01', 'http://localhost:5000/api/v1/integracao', 'Bearer', 1);

                        INSERT INTO integ_Fluxo (FluxoId, EmpresaId, Direcao, TabelaFila, Endpoint, Metodo, Cron, Ativo)
                        VALUES 
                        ('produtos', '01', 'ENVIO', 'SZZ', '/produtos', 'POST', '*/5 * * * *', 1),
                        ('clientes', '01', 'ENVIO', 'SZZ', '/clientes', 'POST', '*/5 * * * *', 1),
                        ('pedidos', '01', 'RECEBIMENTO', 'SZZ', '/orcamentos/pendentes', 'GET', '*/2 * * * *', 1);

                        INSERT INTO SZY (ZY_FILIAL, ZY_CODIGO, ZY_DATA, ZY_HORA, ZY_STATUS, ZY_LIDOS, ZY_ENFILE, ZY_ENVIAD, ZY_ERROS, ZY_OBS)
                        VALUES ('01', '000001', date('now'), time('now'), '2', 15, 15, 15, 0, 'Lote Inicial de Exemplo Carga SQLite');
                    ";
                    conn.Execute(sqlSeedEmpresa);
                }
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Error(ex, "Erro ao inicializar schema SQLite.");
        }
    }
}
