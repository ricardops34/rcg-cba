import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { IntegracaoModule } from './modules/integracao/integracao.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ErrosLogService } from './modules/erros/erros-log.service';

async function bootstrap() {
  // `rawBody: true` é o que faz `req.rawBody` existir — só passa a ser lido
  // pelo webhook da WhatsApp Cloud API, que precisa do corpo bruto para
  // conferir a assinatura HMAC-SHA256 da Meta. Não afeta as demais rotas: o
  // corpo continua sendo parseado como JSON normalmente.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // A API é consumida por outra origem (web) e serve assets embutidos via <img>
  // (logos em /uploads). O CORP padrão "same-origin" bloquearia esse embed
  // cross-origin, então liberamos para "cross-origin" (o acesso já é controlado
  // por CORS + autenticação nas rotas de dados).
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: process.env.NODE_ENV === 'production',
      contentSecurityPolicy: false,
    }),
  );
  const allowedOrigins = (
    process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000', 'http://localhost:3002']
  ).map((s) => s.trim());
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== 'production' &&
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
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

  const swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';
  if (swaggerEnabled) {
    const jwtService = new JwtService();

    app.use(['/api/docs', '/api/docs-json'], (req: any, res: any, next: any) => {
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test' ||
        process.env.SWAGGER_PUBLIC === 'true'
      ) {
        return next();
      }

      const authHeader = req.headers?.authorization;
      let token: string | undefined;

      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (req.cookies && req.cookies.access_token) {
        token = req.cookies.access_token;
      } else if (req.query && typeof req.query.token === 'string') {
        token = req.query.token;
      }

      if (token && process.env.JWT_ACCESS_SECRET) {
        try {
          jwtService.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
          return next();
        } catch {
          // Token inválido ou expirado
        }
      }

      const swaggerUser = process.env.SWAGGER_USER;
      const swaggerPass = process.env.SWAGGER_PASSWORD;
      if (
        swaggerUser &&
        swaggerPass &&
        authHeader &&
        typeof authHeader === 'string' &&
        authHeader.startsWith('Basic ')
      ) {
        const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
        const [user, pass] = credentials.split(':');
        if (user === swaggerUser && pass === swaggerPass) {
          return next();
        }
      }

      res.setHeader('WWW-Authenticate', 'Basic realm="Documentacao ERP (Swagger)"');
      return res.status(401).send('Acesso à documentação Swagger requer autenticação.');
    });

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
  }

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
