import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import type { Request } from 'express';
import {
  esqueciSenhaSchema,
  redefinirSenhaSchema,
} from '@plataforma/contracts';
import { RecuperacaoSenhaService } from './recuperacao-senha.service';

class EsqueciSenhaDto extends createZodDto(esqueciSenhaSchema) {}
class RedefinirSenhaDto extends createZodDto(redefinirSenhaSchema) {}

/**
 * "Esqueci minha senha" — rotas **públicas**, como o login. O throttle por IP
 * é mais rígido que o do login: pedir o link manda e-mail para alguém, e
 * repetir sem limite vira spam na caixa da pessoa.
 */
@ApiTags('auth')
@Controller('auth/senha')
export class RecuperacaoSenhaController {
  constructor(private readonly service: RecuperacaoSenhaService) {}

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  @ApiOperation({
    summary: 'Pedir o link de redefinição de senha',
    description:
      'Envia ao e-mail, se cadastrado, um link de uso único (30 minutos). A resposta é ' +
      'sempre a mesma, exista o e-mail ou não. A senha atual continua valendo até o link ser usado.',
  })
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('esqueci')
  @HttpCode(200)
  esqueci(@Body() dto: EsqueciSenhaDto, @Req() req: Request) {
    return this.service.pedir(dto, this.meta(req));
  }

  @ApiOperation({
    summary: 'Criar a senha nova pelo link',
    description:
      'Confere o token do link, aplica a política de senha, desbloqueia a conta e encerra as ' +
      'sessões abertas.',
  })
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('redefinir')
  @HttpCode(200)
  redefinir(@Body() dto: RedefinirSenhaDto, @Req() req: Request) {
    return this.service.redefinir(dto, this.meta(req));
  }
}
