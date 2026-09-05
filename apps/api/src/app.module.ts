import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { UPLOADS_DIR } from './common/uploads/uploads.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { MailModule } from './common/mail/mail.module';
import { ExternalHttpModule } from './common/external-http/external-http.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { PlataformaModule } from './modules/plataforma/plataforma.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { PerfisModule } from './modules/perfis/perfis.module';
import { EstruturaModule } from './modules/estrutura/estrutura.module';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { VendedoresModule } from './modules/vendedores/vendedores.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { CadastrosModule } from './modules/cadastros/cadastros.module';
import { EscopoModule } from './modules/escopo/escopo.module';
import { EstoqueModule } from './modules/estoque/estoque.module';
import { NotasSaidaModule } from './modules/notas-saida/notas-saida.module';
import { TitulosReceberModule } from './modules/titulos-receber/titulos-receber.module';
import { ContasBancariasModule } from './modules/contas-bancarias/contas-bancarias.module';
import { PoliticaSenhaModule } from './modules/politica-senha/politica-senha.module';
import { ObjetivosModule } from './modules/objetivos/objetivos.module';
import { OportunidadesModule } from './modules/oportunidades/oportunidades.module';
import { AtividadesModule } from './modules/atividades/atividades.module';
import { OrcamentosModule } from './modules/orcamentos/orcamentos.module';
import { IntegracaoModule } from './modules/integracao/integracao.module';
import { IntegracaoKeysModule } from './modules/integracao-keys/integracao-keys.module';
import { ClienteCampoConfigModule } from './modules/cliente-campo-config/cliente-campo-config.module';
import { OrcamentoConfigModule } from './modules/orcamento-config/orcamento-config.module';
import { ParametrosModule } from './modules/parametros/parametros.module';
import { ConsultasModule } from './modules/consultas/consultas.module';
import { SugestaoCompraModule } from './modules/sugestao-compra/sugestao-compra.module';
import { AgenteModule } from './modules/agente/agente.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module';
import { InicioModule } from './modules/inicio/inicio.module';
import { MeusAtendimentosModule } from './modules/meus-atendimentos/meus-atendimentos.module';
import { AcessosModule } from './modules/acessos/acessos.module';
import { ErrosModule } from './modules/erros/erros.module';
import { PortalClienteModule } from './modules/portal-cliente/portal-cliente.module';
import { validarSegredosDoAmbiente } from './common/config/validar-segredos';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => {
        validarSegredosDoAmbiente(config);
        return config;
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    // Serve os arquivos enviados (logos das empresas) em /uploads/*.
    // Fica fora do prefixo /api — o front monta a URL a partir da origem da API.
    ServeStaticModule.forRoot({
      rootPath: UPLOADS_DIR,
      serveRoot: '/uploads',
    }),
    PrismaModule,
    MailModule,
    // Global: consumido por Clientes (MinhaReceita) e CEPs (ViaCEP).
    ExternalHttpModule,
    // Antes do AuthModule: é global e fornece o registro de acessos e a
    // verificação de expediente que o login e o JwtAuthGuard consomem.
    AcessosModule,
    AuthModule,
    EmpresasModule,
    PlataformaModule,
    UsuariosModule,
    PerfisModule,
    EstruturaModule,
    ProdutosModule,
    VendedoresModule,
    ClientesModule,
    CadastrosModule,
    EscopoModule,
    EstoqueModule,
    NotasSaidaModule,
    TitulosReceberModule,
    ContasBancariasModule,
    PoliticaSenhaModule,
    ObjetivosModule,
    OportunidadesModule,
    AtividadesModule,
    OrcamentosModule,
    IntegracaoModule,
    IntegracaoKeysModule,
    ClienteCampoConfigModule,
    OrcamentoConfigModule,
    ParametrosModule,
    ConsultasModule,
    SugestaoCompraModule,
    AgenteModule,
    WhatsappModule,
    NotificacoesModule,
    InicioModule,
    MeusAtendimentosModule,
    PortalClienteModule,
    ErrosModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
