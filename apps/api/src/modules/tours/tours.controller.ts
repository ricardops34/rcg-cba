import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AtualizarTourDto,
  IniciarTourDto,
  TourCodigoDto,
  TourEstadoQueryDto,
} from './dto/tour.dto';
import { ToursService } from './tours.service';

@ApiTags('tours')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tours')
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @ApiOperation({ summary: 'Consulta o estado de uma versão do tour' })
  @Get(':codigo/estado')
  estado(
    @Param() params: TourCodigoDto,
    @Query() query: TourEstadoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tours.estado(user, params.codigo, query.versao);
  }

  @ApiOperation({ summary: 'Inicia uma execução automática ou manual' })
  @Post(':codigo/execucoes')
  iniciar(
    @Param() params: TourCodigoDto,
    @Body() dto: IniciarTourDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tours.iniciar(user, params.codigo, dto);
  }

  @ApiOperation({ summary: 'Salva o passo e o encerramento do tour' })
  @Patch('execucoes/:id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarTourDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tours.atualizar(user, id, dto);
  }
}
