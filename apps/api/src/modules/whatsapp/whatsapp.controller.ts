import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { whatsappUploadOptions } from '../../common/uploads/uploads.config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WHATSAPP_SESSAO_EXAMPLE } from '@plataforma/contracts';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { WhatsappAgendaService } from './whatsapp-agenda.service';
import { WhatsappAcoesService } from './whatsapp-acoes.service';
import { WhatsappAgendamentoService } from './whatsapp-agendamento.service';
import {
  WhatsappConectarDto,
  WhatsappConfigUpdateDto,
  WhatsappConversaQueryDto,
  WhatsappAgendarMensagemDto,
  WhatsappAgendarVisitaDto,
  WhatsappEnviarArquivoDto,
  WhatsappEnviarBoletoDto,
  WhatsappEnviarDanfeDto,
  WhatsappEnviarDto,
  WhatsappEnviarOrcamentoDto,
  WhatsappIniciarConversaDto,
  WhatsappMensagemQueryDto,
  WhatsappNovoOrcamentoDto,
  WhatsappReagirDto,
  WhatsappVincularDto,
} from './dto/whatsapp.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly config: WhatsappConfigService,
    private readonly sessao: WhatsappSessaoService,
    private readonly conversas: WhatsappConversasService,
    private readonly agenda: WhatsappAgendaService,
    private readonly acoes: WhatsappAcoesService,
    private readonly agendamento: WhatsappAgendamentoService,
  ) {}

  // ---------------- configuração da empresa ----------------

  @ApiOperation({
    summary: 'Configuração de WhatsApp da empresa ativa',
    description:
      'Singleton por empresa, criado no primeiro acesso. Requer whatsapp-config.visualizar.',
  })
  @RequirePermission('whatsapp-config', 'visualizar')
  @Get('config')
  obterConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.config.obter(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Editar a configuração de WhatsApp da empresa',
    description:
      'Transporte, endereço do worker e retenção. Requer whatsapp-config.editar.',
  })
  @RequirePermission('whatsapp-config', 'editar')
  @Put('config')
  atualizarConfig(
    @Body() dto: WhatsappConfigUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.config.atualizar(user.empresaAtivaId, user, dto);
  }

  // ---------------- sessão do vendedor ----------------

  @ApiOperation({
    summary: 'Sessão de WhatsApp do usuário logado',
    description:
      'Devolve null quando o vendedor nunca conectou. Nunca expõe a credencial ' +
      'da sessão. Requer whatsapp-conversas.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: WHATSAPP_SESSAO_EXAMPLE } })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('sessao')
  minhaSessao(@CurrentUser() user: AuthenticatedUser) {
    return this.sessao.minha(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Conectar o WhatsApp do vendedor (iniciar pareamento)',
    description:
      'Um número por vendedor: com uma sessão já conectada, é preciso desconectar ' +
      'antes de parear outra. Exige o aceite de que as conversas com clientes são ' +
      'gravadas e visíveis ao supervisor. Requer whatsapp-conversas.editar.',
  })
  @RequirePermission('whatsapp-conversas', 'editar')
  @Post('sessao/conectar')
  conectar(
    @Body() dto: WhatsappConectarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessao.conectar(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Estado do pareamento (QR)',
    description:
      'Consultado enquanto o QR não é lido. O código expira em segundos e é ' +
      'renovado pelo provedor — a tela repinta a cada consulta.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('sessao/pareamento')
  pareamento(@CurrentUser() user: AuthenticatedUser) {
    return this.sessao.pareamento(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Desconectar o próprio WhatsApp',
    description:
      'Age sempre sobre a sessão do usuário logado — não aceita id de outro ' +
      'vendedor. Requer whatsapp-conversas.editar.',
  })
  @RequirePermission('whatsapp-conversas', 'editar')
  @Delete('sessao')
  desconectar(@CurrentUser() user: AuthenticatedUser) {
    return this.sessao.desconectar(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Sessões da equipe',
    description:
      'Supervisor/gerente veem as sessões de quem supervisionam. Sem ' +
      'whatsapp-equipe.visualizar, a lista traz apenas a própria sessão.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('sessoes')
  listarEquipe(@CurrentUser() user: AuthenticatedUser) {
    return this.sessao.listarEquipe(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Conectar ou reconectar uma instância pela administração',
    description:
      'Reabre no worker uma sessão já criada pelo vendedor. Não cria o aceite ' +
      'inicial em nome dele. Requer whatsapp-config.editar.',
  })
  @RequirePermission('whatsapp-config', 'editar')
  @Post('config/sessoes/:id/reconectar')
  reconectarInstancia(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessao.reconectarAdministracao(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Remover uma instância pela administração',
    description:
      'Encerra a conexão no worker e marca a instância como desconectada, ' +
      'preservando conversas e auditoria. Requer whatsapp-config.editar.',
  })
  @RequirePermission('whatsapp-config', 'editar')
  @Delete('config/sessoes/:id')
  removerInstancia(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessao.removerAdministracao(user.empresaAtivaId, user, id);
  }

  // ---------------- atendimento ----------------

  @ApiOperation({
    summary: 'Conversas do atendimento',
    description:
      'Filtradas pela sessão: as do próprio vendedor e, com ' +
      'whatsapp-equipe.visualizar, as de quem ele supervisiona.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('conversas')
  listarConversas(
    @Query() query: WhatsappConversaQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.listar(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Mensagens de uma conversa',
    description:
      'Ordem cronológica, paginadas por cursor (`antesDe`) — o rolo carrega ' +
      'para trás. Conversa fora do escopo devolve 404.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('conversas/:id/mensagens')
  mensagens(
    @Param('id') id: string,
    @Query() query: WhatsappMensagemQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.mensagens(user.empresaAtivaId, user, id, query);
  }

  @ApiOperation({
    summary: 'Eventos comerciais internos de uma conversa',
    description:
      'Ações executadas pela central, como orçamento, documento e retorno. ' +
      'Não são mensagens enviadas ao cliente.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('conversas/:id/eventos')
  eventos(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversas.eventos(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Enviar mensagem',
    description:
      'Só o vendedor dono da sessão envia — o supervisor lê, mas não fala pelo ' +
      'aparelho do subordinado. Requer whatsapp-conversas.cadastrar.',
  })
  @RequirePermission('whatsapp-conversas', 'cadastrar')
  @Post('conversas/:id/mensagens')
  enviar(
    @Param('id') id: string,
    @Body() dto: WhatsappEnviarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.enviar(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Enviar arquivo (documento, imagem, vídeo ou áudio)',
    description:
      'Multipart com o campo `arquivo`. O tipo mostrado no WhatsApp vem do ' +
      'MIME; `ptt=true` faz o áudio virar mensagem de voz. Máximo 16 MB, que ' +
      'é o teto do próprio WhatsApp. Requer whatsapp-conversas.cadastrar.',
  })
  @RequirePermission('whatsapp-conversas', 'cadastrar')
  @Post('conversas/:id/arquivos')
  @UseInterceptors(FileInterceptor('arquivo', whatsappUploadOptions))
  enviarArquivo(
    @Param('id') id: string,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @Body() dto: WhatsappEnviarArquivoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!arquivo) throw new BadRequestException('Nenhum arquivo enviado.');
    return this.conversas.enviarArquivo(
      user.empresaAtivaId,
      user,
      id,
      {
        caminhoDisco: arquivo.path,
        nome: arquivo.originalname,
        mime: arquivo.mimetype,
        tamanho: arquivo.size,
      },
      dto,
    );
  }

  @ApiOperation({
    summary: 'Vincular o contato a um cliente',
    description:
      'É o vínculo que autoriza a gravação da conversa. O cliente precisa estar ' +
      'na carteira de quem vincula. Requer whatsapp-conversas.editar.',
  })
  @RequirePermission('whatsapp-conversas', 'editar')
  @Put('conversas/:id/vinculo')
  vincular(
    @Param('id') id: string,
    @Body() dto: WhatsappVincularDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.vincular(user.empresaAtivaId, user, id, dto);
  }

  // ---------------- agenda do aparelho ----------------

  @ApiOperation({
    summary: 'Contatos da agenda do celular do vendedor',
    description:
      'Lidos do aparelho e cruzados com a carteira na hora — não são gravados. ' +
      'Sempre da própria sessão: a agenda de um vendedor não é visível ao ' +
      'supervisor, ao contrário das conversas.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('agenda/contatos')
  contatosDaAgenda(
    @Query('busca') busca: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agenda.contatos(user.empresaAtivaId, user, busca);
  }

  @ApiOperation({
    summary: 'Conversas que já existem no celular',
    description:
      'O histórico do aparelho, para o vendedor retomar um atendimento sem ' +
      'esperar o cliente escrever primeiro.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('agenda/conversas')
  conversasDoAparelho(@CurrentUser() user: AuthenticatedUser) {
    return this.agenda.conversasDoAparelho(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Atualizar agenda e conversas a partir do celular',
    description:
      'O provedor manda só o que mudou desde a última sincronização; este ' +
      'pedido refaz a lista do zero. Requer whatsapp-conversas.editar.',
  })
  @RequirePermission('whatsapp-conversas', 'editar')
  @Post('agenda/sincronizar')
  sincronizarAgenda(@CurrentUser() user: AuthenticatedUser) {
    return this.agenda.sincronizar(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Iniciar conversa com um cliente ou contato',
    description:
      'Abre a conversa sem esperar o cliente escrever primeiro. Aceita ' +
      'clienteId (usa o telefone do cadastro), jid da agenda ou número ' +
      'digitado. Requer whatsapp-conversas.cadastrar.',
  })
  @RequirePermission('whatsapp-conversas', 'cadastrar')
  @Post('conversas')
  iniciarConversa(
    @Body() dto: WhatsappIniciarConversaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.iniciarConversa(user.empresaAtivaId, user, dto);
  }

  // ---------------- ações do sistema dentro da conversa ----------------

  @ApiOperation({
    summary: 'Enviar os títulos em aberto do cliente pela conversa',
    description:
      'Manda os dados dos títulos (número, vencimento, valor) como mensagem — a lista do que ' +
      'está em aberto. Para mandar o boleto de um título, use a rota /acoes/boleto. Exige ' +
      'contato vinculado a cliente e titulos-receber.visualizar.',
  })
  @RequirePermission('titulos-receber', 'visualizar')
  @Post('conversas/:id/acoes/titulos')
  enviarTitulos(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acoes.enviarTitulos(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Enviar as últimas notas fiscais do cliente pela conversa',
    description:
      'Número, data e valor como mensagem. Para mandar o DANFE de uma nota, use a rota ' +
      '/acoes/danfe. Requer notas-saida.visualizar.',
  })
  @RequirePermission('notas-saida', 'visualizar')
  @Post('conversas/:id/acoes/notas')
  enviarNotas(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.acoes.enviarNotas(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Títulos do cliente da conversa (seletor da 2ª via)',
    description:
      'Títulos em aberto do cliente, cada um com `temBoleto` indicando se a 2ª via pode ser ' +
      'emitida (nosso número registrado, convênio cadastrado e até 30 dias de atraso). ' +
      'Requer titulos-receber.visualizar.',
  })
  @RequirePermission('titulos-receber', 'visualizar')
  @Get('conversas/:id/acoes/titulos')
  listarTitulos(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acoes.listarTitulos(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Notas fiscais do cliente da conversa (seletor da 2ª via)',
    description:
      'As 30 mais recentes, cada uma com `temXml` indicando se o DANFE pode ser gerado. ' +
      'Requer notas-saida.visualizar.',
  })
  @RequirePermission('notas-saida', 'visualizar')
  @Get('conversas/:id/acoes/notas')
  listarNotas(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.acoes.listarNotas(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Enviar a 2ª via do DANFE pela conversa',
    description:
      'Anexa o mesmo PDF que a tela de Notas de Saída baixa, renderizado do XML autorizado. ' +
      'Com `incluirXml`, manda também o arquivo XML numa segunda mensagem. Recusa nota de outro ' +
      'cliente (400) e nota sem XML na plataforma (409). Requer notas-saida.visualizar.',
  })
  @RequirePermission('notas-saida', 'visualizar')
  @Post('conversas/:id/acoes/danfe')
  enviarDanfe(
    @Param('id') id: string,
    @Body() dto: WhatsappEnviarDanfeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acoes.enviarDanfe(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Enviar a 2ª via do boleto pela conversa',
    description:
      'Anexa o boleto em PDF e põe a linha digitável na legenda — quem paga pelo aplicativo do ' +
      'banco copia dali. Título vencido sai com valor atualizado (multa e juros do convênio); ' +
      'vencido há mais de 30 dias é recusado (409), assim como título sem nosso número ou de ' +
      'outro cliente (400). Requer titulos-receber.visualizar.',
  })
  @RequirePermission('titulos-receber', 'visualizar')
  @Post('conversas/:id/acoes/boleto')
  enviarBoleto(
    @Param('id') id: string,
    @Body() dto: WhatsappEnviarBoletoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acoes.enviarBoleto(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Agendar visita/retorno para o cliente da conversa',
    description:
      'Cria a atividade para o vendedor dono da sessão. Não manda mensagem ' +
      'para o cliente: é compromisso do vendedor. Requer atividades.cadastrar.',
  })
  @RequirePermission('atividades', 'cadastrar')
  @Post('conversas/:id/acoes/agendar')
  agendarVisita(
    @Param('id') id: string,
    @Body() dto: WhatsappAgendarVisitaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acoes.agendarVisita(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Orçamentos do cliente da conversa',
    description:
      'Os 20 mais recentes, para escolher qual proposta enviar. Mesma lista ' +
      'do módulo de orçamentos, filtrada pelo cliente da conversa e restrita ' +
      'ao escopo do vendedor. Requer orcamentos.visualizar.',
  })
  @RequirePermission('orcamentos', 'visualizar')
  @Get('conversas/:id/acoes/orcamentos')
  listarOrcamentos(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acoes.listarOrcamentos(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Enviar a proposta em PDF pela conversa',
    description:
      'Anexa o mesmo PDF que a tela de orçamento baixa. Recusa orçamento de ' +
      'outro cliente (400) e orçamento com desconto acima do máximo da regra ' +
      'sem autorização (409). Requer orcamentos.visualizar.',
  })
  @RequirePermission('orcamentos', 'visualizar')
  @Post('conversas/:id/acoes/orcamento')
  enviarOrcamento(
    @Param('id') id: string,
    @Body() dto: WhatsappEnviarOrcamentoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acoes.enviarOrcamento(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Montar um orçamento para o cliente da conversa',
    description:
      'Cria o orçamento pelo mesmo service da tela de Orçamentos (preço da ' +
      'tabela do cliente, desconto por regra, numeração) e, por padrão, já ' +
      'envia a proposta em PDF. Cliente e vendedor são os da conversa. Se o ' +
      'envio falhar, o orçamento permanece criado. Requer orcamentos.cadastrar.',
  })
  @RequirePermission('orcamentos', 'cadastrar')
  @Post('conversas/:id/acoes/orcamento/novo')
  novoOrcamento(
    @Param('id') id: string,
    @Body() dto: WhatsappNovoOrcamentoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acoes.novoOrcamento(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Reagir a uma mensagem da conversa',
    description:
      'Emoji vazio remove a reação — é a convenção do próprio WhatsApp. Cada ' +
      'lado tem no máximo uma reação por mensagem: reagir de novo substitui. ' +
      'Só o dono da sessão reage (supervisor lê, não fala pelo aparelho). ' +
      'Requer whatsapp-conversas.cadastrar.',
  })
  @RequirePermission('whatsapp-conversas', 'cadastrar')
  @Post('conversas/:id/mensagens/:mensagemId/reacao')
  reagir(
    @Param('id') id: string,
    @Param('mensagemId') mensagemId: string,
    @Body() dto: WhatsappReagirDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.reagir(
      user.empresaAtivaId,
      user,
      id,
      mensagemId,
      dto.emoji,
    );
  }

  @ApiOperation({
    summary: 'Agendar uma mensagem',
    description:
      'Texto escrito agora para sair na data e hora informadas. Passa pelas ' +
      'mesmas travas do envio imediato: conversa no escopo e só o dono da ' +
      'sessão. A rotina envia a cada minuto; se o WhatsApp estiver ' +
      'desconectado na hora, o agendamento fica com erro visível na conversa ' +
      '— não some. Requer whatsapp-conversas.cadastrar.',
  })
  @RequirePermission('whatsapp-conversas', 'cadastrar')
  @Post('conversas/:id/agendamentos')
  agendarMensagem(
    @Param('id') id: string,
    @Body() dto: WhatsappAgendarMensagemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agendamento.agendar(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Mensagens agendadas da conversa',
    description:
      'As pendentes e as que falharam — o que já saiu está no rolo da ' +
      'conversa. Requer whatsapp-conversas.visualizar.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('conversas/:id/agendamentos')
  listarAgendamentos(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agendamento.listar(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Cancelar uma mensagem agendada',
    description:
      'Recusa com 404 quando a rotina já pegou a mensagem para enviar — a ' +
      'essa altura, cancelar mentiria para o vendedor. Requer ' +
      'whatsapp-conversas.cadastrar.',
  })
  @RequirePermission('whatsapp-conversas', 'cadastrar')
  @Delete('conversas/:id/agendamentos/:agendamentoId')
  cancelarAgendamento(
    @Param('id') id: string,
    @Param('agendamentoId') agendamentoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agendamento.cancelar(
      user.empresaAtivaId,
      user,
      id,
      agendamentoId,
    );
  }

  @ApiOperation({ summary: 'Marcar a conversa como lida' })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Post('conversas/:id/lida')
  marcarLida(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversas.marcarLida(user.empresaAtivaId, user, id);
  }
}
