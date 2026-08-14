import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SUGESTAO_COMPRA_EXAMPLE } from '@plataforma/contracts';
import { SugestaoCompraService } from './sugestao-compra.service';
import { SugestaoCompraQueryDto } from './dto/sugestao-compra.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('sugestao-compra')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sugestao-compra')
export class SugestaoCompraController {
  constructor(private readonly service: SugestaoCompraService) {}

  @ApiOperation({
    summary: 'O que oferecer a este cliente',
    description:
      'Produtos que clientes semelhantes compram e o cliente-alvo não. A semelhança soma dois ' +
      'eixos: a cesta de compras (índice de Jaccard sobre os produtos do período) e o ramo de ' +
      'atividade (CNAEs compartilhados, com bônus para o principal coincidente), mais um ' +
      'desempate por mesma região. `baseSemelhanca` permite isolar um dos eixos. ' +
      'Tudo restrito à carteira que o usuário alcança — a sugestão nunca se apoia em cliente de ' +
      'outra equipe. Devolve a evidência (quais semelhantes compram, quantos, ticket médio) e o ' +
      'preço na tabela do cliente, quando resolvível. Requer sugestao-compra.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: SUGESTAO_COMPRA_EXAMPLE } })
  @RequirePermission('sugestao-compra', 'visualizar')
  @Get('cliente/:clienteId')
  paraCliente(
    @Param('clienteId') clienteId: string,
    @Query() query: SugestaoCompraQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.paraCliente(
      user.empresaAtivaId,
      user,
      clienteId,
      query,
    );
  }
}
