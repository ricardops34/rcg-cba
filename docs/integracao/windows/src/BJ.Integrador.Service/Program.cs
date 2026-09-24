using Serilog;
using Serilog.Events;
using Microsoft.AspNetCore.DataProtection;
using Hangfire;
using Hangfire.SqlServer;
using Hangfire.MemoryStorage;
using BJ.Integrador.Service;
using BJ.Integrador.Service.Dados;
using BJ.Integrador.Service.Seguranca;
using BJ.Integrador.Service.Jobs;
using BJ.Integrador.Service.Integracao;

var builder = WebApplication.CreateBuilder(args);

// Configure Data Protection
var keysDirectory = Path.Combine(AppContext.BaseDirectory, "keys");
if (!Directory.Exists(keysDirectory))
{
    Directory.CreateDirectory(keysDirectory);
}

builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keysDirectory))
    .ProtectKeysWithDpapi(protectToLocalMachine: true)
    .SetApplicationName("BJ.Integrador");

builder.Services.AddSingleton<ICofreCredenciais, CofreCredenciais>();

// Configure Serilog
var logDirectory = Path.Combine(AppContext.BaseDirectory, "logs");
if (!Directory.Exists(logDirectory))
{
    Directory.CreateDirectory(logDirectory);
}

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Information)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File(
        path: Path.Combine(logDirectory, "log-.txt"),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 31,
        shared: true)
    .CreateLogger();

builder.Host.UseSerilog();

// Configure Windows Service integration
builder.Host.UseWindowsService(options =>
{
    options.ServiceName = "BJ.Integrador";
});

// Configure Kestrel listen port from appsettings (default 5080)
var portaConfig = builder.Configuration.GetValue<int?>("Dashboard:Porta") ?? 5080;
builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.ListenAnyIP(portaConfig);
});

// Registrar serviços de dados e infraestrutura
builder.Services.AddSingleton<IFabricaConexao, FabricaConexao>();
builder.Services.AddSingleton<IValidadorTabela, ValidadorTabela>();
builder.Services.AddScoped<IConfigRepositorio, ConfigRepositorio>();
builder.Services.AddScoped<IEnvioRepositorio, EnvioRepositorio>();
builder.Services.AddScoped<IRecebimentoRepositorio, RecebimentoRepositorio>();

// Registrar Clientes HTTP Resilientes
builder.Services.AddHttpClient<IClienteHttpResiliente, ClienteHttpResiliente>();
builder.Services.AddHttpClient<IProcessadorRecebimento, ProcessadorRecebimento>();

// Registrar Jobs Hangfire
builder.Services.AddScoped<ISincronizadorFluxosJob, SincronizadorFluxosJob>();
builder.Services.AddScoped<IExecutarFluxoJob, ExecutarFluxoJob>();

// Registrar Hangfire com storage SQL Server ou MemoryStorage (SQLite)
var connectionStringConfig = builder.Configuration.GetConnectionString("Config") ?? string.Empty;
var isSqliteConfig = connectionStringConfig.Contains(".db", StringComparison.OrdinalIgnoreCase)
    || (connectionStringConfig.Contains("Data Source=", StringComparison.OrdinalIgnoreCase) && !connectionStringConfig.Contains("Server=", StringComparison.OrdinalIgnoreCase));

builder.Services.AddHangfire(configuration =>
{
    configuration
        .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
        .UseSimpleAssemblyNameTypeSerializer()
        .UseRecommendedSerializerSettings();

    if (isSqliteConfig)
    {
        configuration.UseMemoryStorage();
    }
    else
    {
        configuration.UseSqlServerStorage(connectionStringConfig, new SqlServerStorageOptions
        {
            SchemaName = "hangfire",
            CommandBatchMaxTimeout = TimeSpan.FromMinutes(5),
            SlidingInvisibilityTimeout = TimeSpan.FromMinutes(5),
            QueuePollInterval = TimeSpan.Zero,
            UseRecommendedIsolationLevel = true,
            DisableGlobalLocks = true
        });
    }
});

builder.Services.AddHangfireServer(options =>
{
    options.WorkerCount = Math.Max(2, Environment.ProcessorCount * 2);
});

var app = builder.Build();

// Inicializar banco SQLite se for a conexão de configuração
using (var scope = app.Services.CreateScope())
{
    var fabrica = scope.ServiceProvider.GetRequiredService<IFabricaConexao>();
    InicializadorBancoSqlite.InicializarSeNecessario(fabrica);
}

// Servir arquivos estáticos (Dashboard HTML/CSS/JS)
app.UseDefaultFiles();
app.UseStaticFiles();

// Tratar comando CLI: --proteger <texto>
for (int i = 0; i < args.Length; i++)
{
    if (string.Equals(args[i], "--proteger", StringComparison.OrdinalIgnoreCase))
    {
        if (i + 1 < args.Length && !string.IsNullOrWhiteSpace(args[i + 1]))
        {
            var textoParaProteger = args[i + 1];
            var cofre = app.Services.GetRequiredService<ICofreCredenciais>();
            var textoProtegido = cofre.Proteger(textoParaProteger);

            Console.WriteLine();
            Console.WriteLine("================================================================================");
            Console.WriteLine("BJ.Integrador - Proteção de Credencial (DPAPI)");
            Console.WriteLine("================================================================================");
            Console.WriteLine("TEXTO ORIGINAL: " + textoParaProteger);
            Console.WriteLine("VALOR CRIPTOGRAFADO: " + textoProtegido);
            Console.WriteLine("================================================================================");
            Console.WriteLine("Grave este valor na coluna integ.Empresa.CredencialCriptografada no banco.");
            Console.WriteLine();

            return;
        }
        else
        {
            Console.WriteLine("Erro: Nenhum texto fornecido para o comando --proteger.");
            Console.WriteLine("Uso: BJ.Integrador.Service.exe --proteger \"seu_token_ou_senha\"");
            return;
        }
    }
}

// Registrar endpoints REST da API do Dashboard
app.MapDashboardEndpoints();

// Configurar Hangfire Dashboard em /monitor com Autenticação Basic
app.UseHangfireDashboard("/monitor", new DashboardOptions
{
    Authorization = new[] { new HangfireDashboardBasicAuthFilter(app.Configuration) },
    DashboardTitle = "BJ.Integrador - Monitor de Integração"
});

// Agendar Job SincronizadorFluxos a cada 2 minutos
try
{
    using (var scope = app.Services.CreateScope())
    {
        var recurringJobManager = scope.ServiceProvider.GetRequiredService<IRecurringJobManager>();
        recurringJobManager.AddOrUpdate<ISincronizadorFluxosJob>(
            recurringJobId: "SincronizadorFluxos",
            methodCall: job => job.SincronizarAsync(),
            cronExpression: "*/2 * * * *",
            options: new RecurringJobOptions { TimeZone = TimeZoneInfo.Local });
    }
}
catch (Exception ex)
{
    Log.Warning(ex, "Não foi possível agendar o SincronizadorFluxos na inicialização (banco BJ_INTEGRADOR pode estar indisponível ou em ambiente de teste).");
}

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "BJ.Integrador",
    timestamp = DateTime.UtcNow
}));

Log.Information("Iniciando o serviço BJ.Integrador na porta {Porta} (Painel Web em http://localhost:{Porta})...", portaConfig);

try
{
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "O serviço BJ.Integrador finalizou inesperadamente.");
}
finally
{
    Log.CloseAndFlush();
}

public partial class Program { }
