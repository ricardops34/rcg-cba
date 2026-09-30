import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeriadosService } from './feriados.service';
import {
  FeriadoCreateDto,
  FeriadoGerarNacionaisDto,
  FeriadoQueryDto,
  FeriadoUpdateDto,
} from './dto/feriado.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('feriados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('feriados')
export class FeriadosController {
  constructor(private readonly service: FeriadosService) {}

  @ApiOperation({
    summary: 'Listar feriados do ano',
    description:
      'Feriados da empresa ativa no ano pedido (padrão: o atual). Requer feriados.visualizar.',
  })
  @RequirePermission('feriados', 'visualizar')
  @Get()
  findAll(@Query() query: FeriadoQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query.ano);
  }

  @ApiOperation({
    summary: 'Gerar feriados nacionais do ano',
    description:
      'Grava os feriados nacionais (fixos e móveis) do ano; data que já tem feriado fica como está. ' +
      'Requer feriados.cadastrar.',
  })
  @RequirePermission('feriados', 'cadastrar')
  @Post('gerar-nacionais')
  gerarNacionais(
    @Body() dto: FeriadoGerarNacionaisDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.gerarNacionais(user.empresaAtivaId, user, dto.ano);
  }

  @ApiOperation({ summary: 'Detalhar feriado', description: 'Requer feriados.visualizar.' })
  @RequirePermission('feriados', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Cadastrar feriado',
    description:
      'Feriado municipal, estadual ou ponto facultativo. Quem tem restrição de horário no ' +
      'cadastro não acessa o sistema no dia. Requer feriados.cadastrar.',
  })
  @RequirePermission('feriados', 'cadastrar')
  @Post()
  create(@Body() dto: FeriadoCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar feriado', description: 'Requer feriados.editar.' })
  @RequirePermission('feriados', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: FeriadoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir feriado', description: 'Requer feriados.excluir.' })
  @RequirePermission('feriados', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, id);
  }
}
