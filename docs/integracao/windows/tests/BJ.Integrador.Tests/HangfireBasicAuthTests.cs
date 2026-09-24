using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;
using Hangfire;
using Hangfire.Dashboard;
using BJ.Integrador.Service.Jobs;

namespace BJ.Integrador.Tests;

public class HangfireBasicAuthTests
{
    [Fact]
    public void Authorize_ComCredenciaisValidas_RetornaTrue()
    {
        // Arrange
        var inMemoryConfig = new Dictionary<string, string?>
        {
            {"Dashboard:Usuario", "admin"},
            {"Dashboard:Senha", "senha123"}
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(inMemoryConfig).Build();

        var filter = new HangfireDashboardBasicAuthFilter(config);

        var httpContext = new DefaultHttpContext();
        var services = new ServiceCollection().BuildServiceProvider();
        httpContext.RequestServices = services;

        var rawCredentials = Encoding.UTF8.GetBytes("admin:senha123");
        httpContext.Request.Headers["Authorization"] = "Basic " + Convert.ToBase64String(rawCredentials);

        var context = CreateDashboardContext(httpContext);

        // Act
        var isAuthorized = filter.Authorize(context);

        // Assert
        Assert.True(isAuthorized);
    }

    [Fact]
    public void Authorize_ComCredenciaisInvalidas_RetornaFalseE401()
    {
        // Arrange
        var inMemoryConfig = new Dictionary<string, string?>
        {
            {"Dashboard:Usuario", "admin"},
            {"Dashboard:Senha", "senha123"}
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(inMemoryConfig).Build();

        var filter = new HangfireDashboardBasicAuthFilter(config);

        var httpContext = new DefaultHttpContext();
        var services = new ServiceCollection().BuildServiceProvider();
        httpContext.RequestServices = services;

        var rawCredentials = Encoding.UTF8.GetBytes("admin:senha_errada");
        httpContext.Request.Headers["Authorization"] = "Basic " + Convert.ToBase64String(rawCredentials);

        var context = CreateDashboardContext(httpContext);

        // Act
        var isAuthorized = filter.Authorize(context);

        // Assert
        Assert.False(isAuthorized);
        Assert.Equal(StatusCodes.Status401Unauthorized, httpContext.Response.StatusCode);
    }

    private static DashboardContext CreateDashboardContext(HttpContext httpContext)
    {
        var storageMock = new Mock<JobStorage>();
        return new AspNetCoreDashboardContext(storageMock.Object, new DashboardOptions(), httpContext);
    }
}
