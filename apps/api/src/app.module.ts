import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AssinarUploadsInterceptor } from './common/uploads/assinar-uploads.interceptor';
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
import { EquipamentosComodatoModule } from './modules/equipamentos-comodato/equipamentos-comodato.module';
import { VendedoresModule } from './modules/vendedores/vendedores.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { CadastrosModule } from './modules/cadastros/cadastros.module';
import { EscopoModule } from './modules/escopo/escopo.module';
import { EstoqueModule } from './modules/estoque/estoque.module';
import { NotasSaidaModule } from './modules/notas-saida/notas-saida.module';
import { FornecedoresModule } from './modules/fornecedores/fornecedores.module';
import { NotasEntradaModule } from './modules/notas-entrada/notas-entrada.module';
import { TitulosReceberModule } from './modules/titulos-receber/titulos-receber.module';
import { DocumentosEmailModule } from './modules/documentos-email/documentos-email.module';
import { SmsModule } from './modules/sms/sms.module';
import { EmailConfigModule } from './modules/email/email-config.module';
import { ContasBancariasModule } from './modules/contas-bancarias/contas-bancarias.module';
import { FeriadosModule } from './modules/feriados/feriados.module';
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
import { DemoModule } from './modules/demo/demo.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module';
import { InicioModule } from './modules/inicio/inicio.module';
import { MeusAtendimentosModule } from './modules/meus-atendimentos/meus-atendimentos.module';
import { AcessosModule } from './modules/acessos/acessos.module';
import { ErrosModule } from './modules/erros/erros.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ProdutoCamposModule } from './modules/produto-campos/produto-campos.module';
import { PortalClienteModule } from './modules/portal-cliente/portal-cliente.module';
import { validarSegredosDoAmbiente } from './common/config/validar-segredos';
import { TermosModule } from './modules/termos/termos.module';
import { ToursModule } from './modules/tours/tours.module';

import { PlanosModule } from './modules/planos/planos.module';
import { AssinaturasModule } from './modules/assinaturas/assinaturas.module';
import { SuporteAcessoModule } from './modules/suporte-acesso/suporte-acesso.module';
import { GruposEconomicosModule } from './modules/grupos-economicos/grupos-economicos.module';

@Module({
  imports: [
    GruposEconomicosModule,
    PlanosModule,
    AssinaturasModule,
    SuporteAcessoModule,
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
      serveStaticOptions: {
        // Logo em SVG é aceito (empresas, bancos), e SVG pode levar <script>.
        // Aberto direto pelo endereço, rodaria na origem da API — a CSP global
        // está desligada (API JSON). Em <img> o navegador já não executa; isto
        // cobre o acesso direto. Só no .svg: `sandbox` em tudo impediria o
        // navegador de abrir os PDFs de fichas técnicas.
        setHeaders: (res, caminho) => {
          if (caminho.toLowerCase().endsWith('.svg')) {
            res.setHeader(
              'Content-Security-Policy',
              "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
            );
          }
        },
      },
    }),
    PrismaModule,
    MailModule,
    // Global: consumido por Clientes (MinhaReceita) e CEPs (ViaCEP).
    ExternalHttpModule,
    // Antes do AuthModule: é global e fornece o registro de acessos e a
    // verificação de expediente que o login e o JwtAuthGuard consomem.
    AcessosModule,
    // Global porque JwtAuthGuard é usado em módulos diferentes e consulta o
    // aceite antes de liberar qualquer rota de negócio.
    TermosModule,
    ToursModule,
    AuthModule,
    EmpresasModule,
    PlataformaModule,
    UsuariosModule,
    PerfisModule,
    EstruturaModule,
    ProdutosModule,
    EquipamentosComodatoModule,
    VendedoresModule,
    ClientesModule,
    CadastrosModule,
    EscopoModule,
    EstoqueModule,
    NotasSaidaModule,
    FornecedoresModule,
    NotasEntradaModule,
    TitulosReceberModule,
    DocumentosEmailModule,
    SmsModule,
    EmailConfigModule,
    ContasBancariasModule,
    FeriadosModule,
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
    DemoModule,
    WhatsappModule,
    NotificacoesModule,
    InicioModule,
    MeusAtendimentosModule,
    PortalClienteModule,
    ErrosModule,
    LeadsModule,
    ProdutoCamposModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Assina a mídia do WhatsApp nas respostas (ver common/uploads/link-assinado.ts).
    { provide: APP_INTERCEPTOR, useClass: AssinarUploadsInterceptor },
  ],
})
export class AppModule {}
