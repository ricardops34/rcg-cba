import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { IntegracaoModule } from './modules/integracao/integracao.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ErrosLogService } from './modules/erros/erros-log.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // A API é consumida por outra origem (web) e serve assets embutidos via <img>
  // (logos em /uploads). O CORP padrão "same-origin" bloquearia esse embed
  // cross-origin, então liberamos para "cross-origin" (o acesso já é controlado
  // por CORS + autenticação nas rotas de dados).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });
  // O padrão do Express é 100 kB, e a mídia de WhatsApp chega do worker em
  // base64 pela rota interna — um áudio de meio minuto já estoura esse teto.
  // 24 MB cobre o limite de 16 MB do próprio WhatsApp mais o inchaço do
  // base64. Vale só para JSON; upload de arquivo continua indo por multipart.
  app.useBodyParser('json', { limit: '24mb' });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // O filtro é `@Catch()` global e captura tudo num ponto só — é por ele que o
  // log de erros recebe o lado servidor (ver docs/planos/log-de-erros.md). O
  // serviço vem do container em vez de o filtro ser registrado por
  // `APP_FILTER`, para não mexer na ordem de registro já estabelecida aqui.
  app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrosLogService)));
  app.useGlobalPipes(new ZodValidationPipe());

  const config = new DocumentBuilder()
    .setTitle('Plataforma Comercial — API de Integração ERP')
    .setDescription(
      'Documentação pública só da API de integração com ERP externo — as rotas ' +
        'de uso interno do frontend (login, cadastros, permissões etc.) não são ' +
        'documentadas aqui.\n\n' +
        '**Autenticação**: só via header `x-api-key` (nunca login de usuário). ' +
        'Chaves são criadas e revogadas na tela Administração > Integração ' +
        '(requer permissão integracao.cadastrar); a chave em claro só é exibida ' +
        'uma única vez, na criação.',
    )
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description:
          'Chave da API de integração ERP — ver Administração > Integração',
      },
      'apiKey',
    )
    .build();
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, config, { include: [IntegracaoModule] }),
  );
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
