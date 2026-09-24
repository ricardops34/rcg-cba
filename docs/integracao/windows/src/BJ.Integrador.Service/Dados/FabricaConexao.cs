using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;
using BJ.Integrador.Service.Config;

namespace BJ.Integrador.Service.Dados;

public interface IFabricaConexao
{
    IDbConnection CriarConexaoConfig();
    IDbConnection CriarConexaoProtheus(Empresa empresa);
    IDbConnection CriarConexaoProtheus(string? customConnectionString);
}

public class FabricaConexao : IFabricaConexao
{
    private readonly IConfiguration _configuration;

    public FabricaConexao(IConfiguration configuration)
    {
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
    }

    public IDbConnection CriarConexaoConfig()
    {
        var connectionString = _configuration.GetConnectionString("Config")
            ?? throw new InvalidOperationException("Connection string 'Config' não foi encontrada no appsettings.");

        if (IsSqlite(connectionString))
        {
            return new SqliteConnection(connectionString);
        }

        return new SqlConnection(connectionString);
    }

    public IDbConnection CriarConexaoProtheus(Empresa empresa)
    {
        ArgumentNullException.ThrowIfNull(empresa);

        var connectionString = !string.IsNullOrWhiteSpace(empresa.ConnectionStringProtheus)
            ? empresa.ConnectionStringProtheus
            : _configuration.GetConnectionString("Protheus")
                ?? throw new InvalidOperationException("Connection string padrão 'Protheus' não foi encontrada no appsettings.");

        if (IsSqlite(connectionString))
        {
            return new SqliteConnection(connectionString);
        }

        return new SqlConnection(connectionString);
    }

    public IDbConnection CriarConexaoProtheus(string? customConnectionString)
    {
        var connectionString = !string.IsNullOrWhiteSpace(customConnectionString)
            ? customConnectionString
            : _configuration.GetConnectionString("Protheus")
                ?? throw new InvalidOperationException("Connection string padrão 'Protheus' não foi encontrada no appsettings.");

        if (IsSqlite(connectionString))
        {
            return new SqliteConnection(connectionString);
        }

        return new SqlConnection(connectionString);
    }

    private static bool IsSqlite(string connectionString)
    {
        return connectionString.Contains(".db", StringComparison.OrdinalIgnoreCase)
            || (connectionString.Contains("Data Source=", StringComparison.OrdinalIgnoreCase)
                && !connectionString.Contains("Server=", StringComparison.OrdinalIgnoreCase));
    }
}
