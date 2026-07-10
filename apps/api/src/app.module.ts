import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { UPLOADS_DIR } from './common/uploads/uploads.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { PerfisModule } from './modules/perfis/perfis.module';
import { EstruturaModule } from './modules/estrutura/estrutura.module';
import { ColaboradoresModule } from './modules/colaboradores/colaboradores.module';
import { MetasModule } from './modules/metas/metas.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { NotasSaidaModule } from './modules/notas-saida/notas-saida.module';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { TitulosReceberModule } from './modules/titulos-receber/titulos-receber.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    // Serve os arquivos enviados (logos das empresas) em /uploads/*.
    // Fica fora do prefixo /api — o front monta a URL a partir da origem da API.
    ServeStaticModule.forRoot({
      rootPath: UPLOADS_DIR,
      serveRoot: '/uploads',
    }),
    PrismaModule,
    AuthModule,
    EmpresasModule,
    UsuariosModule,
    PerfisModule,
    EstruturaModule,
    ColaboradoresModule,
    MetasModule,
    ClientesModule,
    NotasSaidaModule,
    ProdutosModule,
    TitulosReceberModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
