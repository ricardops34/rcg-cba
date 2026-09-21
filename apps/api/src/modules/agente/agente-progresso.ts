import type { AgenteEvento } from '@plataforma/contracts';

/**
 * O que contar a quem espera, enquanto o turno acontece.
 *
 * O laço de conversa é lento por natureza: cada volta é uma ida ao provedor,
 * e cada ferramenta é uma consulta à base. Uma pergunta que encadeia
 * `buscar_cliente` → `posicao_cliente` → `titulos_em_aberto` leva dezenas de
 * segundos, e até aqui a tela não dizia nada nesse intervalo.
 *
 * O evento sai **antes** da execução, não depois: o que interessa a quem
 * espera é o que está acontecendo agora, e o passo que demora é justamente o
 * que ainda não terminou.
 */
export type EventoProgresso = AgenteEvento;

/**
 * Rótulo legível por ferramenta.
 *
 * Fica aqui, num bloco só, e não espalhado pelo catálogo: são textos de tela,
 * lidos por quem perguntou, e vê-los juntos é o que mantém o tom igual entre
 * os 26. O catálogo, ao lado, fala com o modelo — outro leitor, outra régua.
 *
 * Pelo mesmo motivo não se usa aqui o nome que a empresa reescreveu em
 * Administração > Agente IA: aquele texto existe para ensinar o modelo *quando*
 * chamar a ferramenta, e costuma ser uma frase técnica que não cabe numa linha
 * de "aguarde".
 */
const ROTULOS: Record<string, string> = {
  buscar_cliente: 'Procurando o cliente',
  verificar_cliente_na_base: 'Verificando se já é cliente',
  buscar_produto: 'Procurando o produto',
  posicao_cliente: 'Levantando a posição do cliente',
  sugerir_compras: 'Montando a sugestão de compra',
  titulos_em_aberto: 'Consultando títulos em aberto',
  listar_orcamentos: 'Listando os orçamentos',
  vendas_por_cliente: 'Apurando as vendas do cliente',
  vendas_por_produto: 'Apurando as vendas do produto',
  execucao_objetivos: 'Conferindo a execução dos objetivos',
  consultar_cnpj: 'Consultando o CNPJ na Receita',
  resumo_atendimentos: 'Resumindo os atendimentos',
  minha_agenda: 'Abrindo a agenda',
  listar_oportunidades: 'Listando as oportunidades',
  historico_atendimento_cliente: 'Reunindo o histórico do cliente',
  agendar_atividade: 'Preparando o agendamento',
  registrar_oportunidade: 'Preparando a oportunidade',
  mover_oportunidade: 'Preparando a mudança de estágio',
  atualizar_cadastro_pela_receita: 'Preparando a atualização do cadastro',
  criar_orcamento: 'Montando o orçamento',
  anexar_ficha_tecnica: 'Lendo a ficha técnica',
  anexar_foto_produto: 'Preparando a foto do produto',
  conversas_whatsapp: 'Buscando as conversas de WhatsApp',
  mensagens_whatsapp: 'Lendo as mensagens de WhatsApp',
  agendar_mensagem_whatsapp: 'Preparando a mensagem',
  enviar_documento_whatsapp: 'Preparando o envio do documento',
};

/**
 * Ferramenta sem rótulo cai num texto derivado do nome técnico.
 *
 * É de propósito que isto não quebre nem fique em branco: uma ferramenta nova
 * entra no catálogo com uma linha de código, e esquecer o rótulo não pode ser
 * o que deixa a tela muda — no pior caso ela mostra `titulos_em_aberto` virado
 * em "Titulos em aberto", que já diz mais do que um spinner.
 */
export function rotuloDe(nome: string): string {
  const conhecido = ROTULOS[nome];
  if (conhecido) return conhecido;
  const legivel = nome.replace(/_/g, ' ');
  return legivel.charAt(0).toUpperCase() + legivel.slice(1);
}
