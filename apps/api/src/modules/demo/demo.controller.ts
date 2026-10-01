import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DemoService } from './demo.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Base de demonstração de uma empresa.
 *
 * Restrito exclusivamente a Administradores da Plataforma.
 */
@ApiTags('demo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('empresas/:empresaId/demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @ApiOperation({
    summary: 'Popular a empresa com dados de demonstração',
    description:
      'Cria oito meses de movimento fictício (seis meses fechados, o corrente e o seguinte): ' +
      'clientes com CNAE, produtos, notas com XML de NF-e, títulos com boleto reemitível, ' +
      'orçamentos, metas, CRM e conversas de WhatsApp. Tudo com prefixo `DEMO-`. ' +
      'Rodar de novo apaga o conjunto anterior e cria outro — **não toca em cadastro real**. ' +
      'Requer demo-dados.cadastrar e alcance sobre a empresa.',
  })
  // Uma operação longa e pesada. O limite evita que dois cliques seguidos
  // abram duas transações de dez minutos sobre as mesmas tabelas.
  @Throttle({ default: { limit: 2, ttl: 300_000 } })
  @Post('dados')
  gerar(
    @Param('empresaId') empresaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.demo.gerar(user, empresaId);
  }

  @ApiOperation({
    summary: 'Remover os dados de demonstração',
    description:
      'Apaga só o conjunto `DEMO-`. O cadastro feito à mão fica onde está.',
  })
  @Delete('dados')
  async removerDemo(
    @Param('empresaId') empresaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.demo.removerDemo(user, empresaId);
    return { removido: true };
  }

  @ApiOperation({
    summary: 'LIMPAR a base de negócio da empresa',
    description:
      'Apaga **todo** o dado de negócio da empresa — clientes, produtos, notas, títulos, ' +
      'orçamentos, CRM e conversas —, inclusive o que foi cadastrado à mão. Preserva acesso, ' +
      'configuração, credenciais (chave do agente, pareamento do WhatsApp) e a trilha de ' +
      'auditoria. **Irreversível.** Exige `confirmacao` igual à razão social da empresa.',
  })
  @Throttle({ default: { limit: 2, ttl: 300_000 } })
  @Delete('base')
  async limparBase(
    @Param('empresaId') empresaId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { confirmacao?: string },
  ) {
    // A confirmação é digitada, não clicada — e com a empresa vindo da rota
    // ela passa a carregar o peso todo: é o que prova que quem clicou olhou
    // **qual** empresa tinha escolhido na lista. Um "tem certeza?" com dois
    // botões é respondido no automático.
    const razaoSocial = await this.demo.razaoSocialDe(user, empresaId);
    const digitado = (dto?.confirmacao ?? '').trim();

    if (digitado.toLowerCase() !== razaoSocial.trim().toLowerCase()) {
      throw new BadRequestException(
        `Para confirmar, informe a razão social exata da empresa: "${razaoSocial}".`,
      );
    }

    return this.demo.limparBase(user, empresaId);
  }
}
