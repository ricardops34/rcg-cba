import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { montarXmlNfe, type ItemNfe } from './demo-nfe-xml';

/**
 * Popula a base com dados de **demonstração** — para ver o sistema inteiro
 * funcionando com volume, não para teste automatizado.
 *
 * Diferença para o `seed-base.ts`: aquele **apaga** os dados de negócio antes
 * de repovoar e monta a estrutura do sistema (menus, rotinas, perfis). Este
 * aqui não apaga nada que não seja dele e não toca em estrutura — só
 * acrescenta cadastro e movimento fictícios sobre uma base que já existe.
 *
 * **Como reconhecer o que é demonstração:** todo registro criado aqui leva o
 * prefixo `DEMO-` no `codigoErp` (ou, quando o modelo não tem essa coluna, o
 * vínculo com algo que leva). É o que torna o script repetível — rodar de novo
 * apaga o conjunto anterior e cria outro, sem tocar no que foi cadastrado à
 * mão. Rodar `--limpar` apaga e não recria.
 *
 * **Precisa da role dona (`plataforma`)**, como as migrations e o seed: os
 * `INSERT` acontecem fora de `withTenant`, então dependem de não haver RLS
 * filtrando. Ver docs/runbook-operacao.md.
 *
 * O que ele cobre, e por quê:
 *
 * - **quatro meses de movimento** (dois anteriores, o corrente e o seguinte):
 *   dashboards e objetivos são por mês, e uma base com vendas só no passado
 *   abre zerada no dia 1º;
 * - **XML de NF-e por nota**, porque a 2ª via do DANFE é renderizada do XML
 *   guardado — sem ele o botão não faz nada;
 * - **títulos com dados de boleto do Bradesco** (nosso número, carteira,
 *   conta padrão), que é o que a 2ª via de boleto exige;
 * - **CNAE por ramo e cesta de compra por ramo**, que é o que faz a Sugestão
 *   de Compra encontrar clientes semelhantes;
 * - **cadastro de vendedor para o usuário administrador**, senão as telas que
 *   dependem de carteira (Meus Atendimentos, Conversas) abrem vazias para
 *   quem está demonstrando o sistema.
 */

const prisma = new PrismaClient();

/** O que o script guarda de cada registro — só o que ele mesmo relê. */
interface ProdutoDemo {
  id: string;
  codigoErp: string;
  descricao: string;
  unidade: string;
  ncm: string;
  ultimoPreco: number;
  categoriaId: string;
}
interface ClienteDemo {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  vendedorId: string;
  ramo: number;
  municipio: string;
  uf: string;
  endereco: string;
  bairro: string;
  cep: string;
  celular: string;
  ativo: boolean;
}
interface NotaDemo {
  id: string;
  numero: string;
  clienteId: string;
  vendedorId: string;
  dtEmissao: Date;
  vlrBruto: number;
}
interface TituloDemo {
  id: string;
  numero: string;
  parcela: string;
  valor: number;
  saldo: number;
  vencimento: Date;
  clienteId: string;
  vendedorId: string;
  comBoleto: boolean;
}
interface OrcamentoDemo {
  id: string;
  numero: number;
  clienteId: string;
  vendedorId: string;
  vlrTotal: number;
  status: string;
  criadoEm: Date;
}
interface PessoaDemo {
  usuarioId: string;
  vendedorId: string;
  nome: string;
  chave: string;
  tipo: 'vendedor' | 'superior';
}

const PREFIXO = 'DEMO-';
/** A conta bancária não tem `codigoErp`: a descrição é o que a identifica. */
const DESCRICAO_CONTA = 'Bradesco — Cobrança (demonstração)';
const SENHA_DEMO = 'Demo@123';

/** Sorteio previsível: mesma semente, mesma base — dá para comparar rodadas. */
let semente = 20260902;
function aleatorio() {
  semente = (semente * 1103515245 + 12345) % 2147483648;
  return semente / 2147483648;
}
const entre = (min: number, max: number) =>
  Math.floor(aleatorio() * (max - min + 1)) + min;
const umDe = <T>(itens: readonly T[]): T => itens[entre(0, itens.length - 1)];

const DIA = 86_400_000;
const hoje = new Date();
hoje.setHours(0, 0, 0, 0);

/** `d` dias atrás, na hora indicada — o horário é o que ordena a timeline. */
function quando(diasAtras: number, hora: number, minuto = 0) {
  const d = new Date(hoje.getTime() - diasAtras * DIA);
  d.setHours(hora, minuto, 0, 0);
  return d;
}

/**
 * Os quatro meses que a demonstração cobre: dois antes do corrente, o
 * corrente e o seguinte. `-2` a `+1` a partir de hoje.
 *
 * O mês corrente vai só até hoje (não se fatura no futuro dentro do mês); o
 * mês seguinte é povoado inteiro, para quem navegar até ele encontrar o
 * sistema com movimento em vez de telas vazias.
 */
const MESES = [-2, -1, 0, 1].map((deslocamento) => {
  const ref = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
  return {
    deslocamento,
    ano: ref.getFullYear(),
    mes: ref.getMonth() + 1,
    ref,
    ultimoDia: new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate(),
  };
});

/** Um dia útil qualquer dentro do mês, respeitando "não passa de hoje". */
function diaDoMes(m: (typeof MESES)[number], hora = entre(8, 17)) {
  const limite = m.deslocamento === 0 ? hoje.getDate() : m.ultimoDia;
  const d = new Date(m.ano, m.mes - 1, entre(1, Math.max(limite, 1)));
  d.setHours(hora, entre(0, 59), 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Catálogo fictício
// ---------------------------------------------------------------------------

/**
 * Os ramos de cliente. O CNAE é o de verdade (a tabela de referência já vem
 * populada pelo IBGE), e é o que a Sugestão de Compra usa para achar
 * semelhantes — sem ramo, "clientes parecidos" não existe e a tela responde
 * "0 semelhantes", que foi o que aconteceu na primeira rodada.
 */
const RAMOS = [
  { nome: 'Restaurantes', cnae: '5611201', prefixos: ['Restaurante', 'Cantina', 'Bistrô'] },
  { nome: 'Bares', cnae: '5611204', prefixos: ['Bar', 'Petiscaria', 'Adega'] },
  { nome: 'Padarias', cnae: '4721102', prefixos: ['Padaria', 'Confeitaria', 'Panificadora'] },
  { nome: 'Mercados', cnae: '4711302', prefixos: ['Mercado', 'Supermercado', 'Mercearia'] },
  { nome: 'Hotéis', cnae: '5510801', prefixos: ['Hotel', 'Pousada', 'Motel'] },
  { nome: 'Lanchonetes', cnae: '5611203', prefixos: ['Lanchonete', 'Espetinho', 'Food Truck'] },
];

const SOBRENOMES_EMPRESA = [
  'São Jorge', 'Bom Preço', 'Central', 'do Zé', 'Pantanal', 'Nova Aurora',
  'Vila Nova', 'Primavera', 'Aurora', 'Real', 'Colonial', 'Imperial',
  'do Porto', 'da Praça', 'Girassol', 'Bela Vista', 'Ipiranga', 'Rio Verde',
  'Guanandi', 'Aquidauana', 'Cerrado', 'Horizonte', 'Estrela', 'Céu Azul',
  'Boa Sorte', 'Progresso', 'União', 'Familiar', 'Popular', 'Express',
];

const MUNICIPIOS: [string, string, string][] = [
  ['Campo Grande', 'MS', '5002704'],
  ['Dourados', 'MS', '5003702'],
  ['Três Lagoas', 'MS', '5008305'],
  ['Corumbá', 'MS', '5003207'],
  ['Ponta Porã', 'MS', '5006606'],
  ['Naviraí', 'MS', '5005903'],
  ['Sidrolândia', 'MS', '5007935'],
  ['Maracaju', 'MS', '5005400'],
];

/** Catálogo por categoria — a cesta de cada ramo se monta a partir daqui. */
const CATEGORIAS = ['Limpeza', 'Descartáveis', 'Higiene', 'Alimentos', 'Bebidas'];

const PRODUTOS: [string, string, string, number, number][] = [
  // descrição, unidade, NCM, preço, índice da categoria
  ['Detergente neutro 500ml', 'CX', '34022000', 4.9, 0],
  ['Desinfetante lavanda 2L', 'CX', '38089419', 12.5, 0],
  ['Água sanitária 1L', 'CX', '28289011', 5.2, 0],
  ['Sabão em pó 1kg', 'FD', '34022000', 18.9, 0],
  ['Limpador multiuso 500ml', 'CX', '34029039', 6.7, 0],
  ['Papel toalha interfolha', 'FD', '48181000', 42.0, 1],
  ['Copo descartável 200ml', 'CX', '39241000', 22.4, 1],
  ['Guardanapo 24x24', 'FD', '48181000', 15.8, 1],
  ['Saco de lixo 100L', 'PC', '39232110', 28.7, 1],
  ['Marmitex alumínio n8', 'CX', '76129090', 54.3, 1],
  ['Papel higiênico 300m', 'FD', '48181000', 78.5, 2],
  ['Luva de látex M', 'CX', '40151900', 34.9, 2],
  ['Álcool 70% 1L', 'CX', '22072019', 9.8, 2],
  ['Sabonete líquido 5L', 'GL', '34011190', 39.9, 2],
  ['Arroz tipo 1 5kg', 'FD', '10063021', 24.9, 3],
  ['Feijão carioca 1kg', 'FD', '07133399', 8.3, 3],
  ['Óleo de soja 900ml', 'CX', '15079011', 7.4, 3],
  ['Açúcar refinado 1kg', 'FD', '17019900', 4.6, 3],
  ['Farinha de trigo 5kg', 'FD', '11010010', 19.5, 3],
  ['Molho de tomate 2kg', 'CX', '20029000', 14.7, 3],
  ['Café torrado 500g', 'FD', '09012100', 16.2, 3],
  ['Refrigerante 2L', 'CX', '22021000', 8.9, 4],
  ['Água mineral 500ml', 'CX', '22011000', 1.8, 4],
  ['Suco concentrado 1L', 'CX', '20098900', 11.4, 4],
];

/** Como o vendedor escreve no WhatsApp — e como o cliente responde. */
const CONVERSA_SAIDA = [
  'Bom dia! Passando para saber se precisa de reposição esta semana.',
  'Consegui um preço melhor no papel toalha, quer que eu monte o orçamento?',
  'Sua entrega saiu hoje de manhã, deve chegar até as 16h.',
  'Segue o boleto em anexo, qualquer coisa me chama.',
  'Fechei o pedido com o desconto que combinamos.',
  'Passo aí na quinta pela manhã, pode ser?',
  'O produto que faltou chegou no estoque, quer que eu reserve?',
];
const CONVERSA_ENTRADA = [
  'Bom dia! Pode passar aqui amanhã?',
  'Me manda o orçamento por favor',
  'Chegou certinho, obrigado!',
  'Consegue melhorar o prazo?',
  'Preciso da segunda via do boleto do mês passado',
  'Vou verificar com o meu sócio e te falo',
  'Pode mandar mais 5 caixas do detergente',
];

const CONDICOES: [string, string][] = [
  ['À vista', 'dinheiro'],
  ['28 dias', 'boleto'],
  ['28/56 dias', 'boleto'],
  ['30/60/90 dias', 'boleto'],
];

const COMUNICADOS: [string, string, boolean][] = [
  [
    'Campanha do mês',
    'Linha de descartáveis com 12% de desconto para pedidos acima de R$ 2.000. O desconto já entra no orçamento — não precisa pedir autorização.',
    true,
  ],
  [
    'Reunião comercial na sexta',
    'Sexta-feira, 8h, na sala grande. Levem a posição dos clientes que estão sem comprar há mais de 60 dias.',
    false,
  ],
  [
    'Prazo de entrega do Norte',
    'As entregas para Corumbá e Ladário passam a sair às terças. Combinem o prazo com o cliente antes de fechar o pedido.',
    false,
  ],
];

/**
 * Como as origens se distribuem na demonstração: a maioria é do vendedor,
 * que é o caso normal — o resto existe para a coluna ter o que mostrar.
 */
const ORIGENS_VENDA = [
  'vendedor',
  'vendedor',
  'vendedor',
  'superior',
  'vendedor',
  'vendedor',
  'superior',
  'vendedor',
  'cliente',
  'vendedor',
  'administrador',
] as const;

const RETORNOS = [
  'Retornar contato sobre a reposição',
  'Ligar para confirmar o pedido',
  'Visita para apresentar a linha nova',
  'Cobrar o retorno do orçamento',
  'Reunião de fechamento do mês',
];

const TRANSPORTADORAS = [
  'Rodoviário Pantanal',
  'Expresso MS Cargas',
  'TransCerrado Logística',
];

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main() {
  const limpar = process.argv.includes('--limpar');

  const empresa = await prisma.empresa.findFirstOrThrow({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const empresaId = empresa.id;

  await apagarDemo(empresaId);
  if (limpar) {
    console.log('Dados de demonstração removidos.');
    return;
  }

  const perfis = await prisma.perfil.findMany({
    where: { deletedAt: null },
    select: { id: true, nome: true },
  });
  const perfilPor = (nome: string) => {
    const p = perfis.find((x) => x.nome === nome);
    if (!p) throw new Error(`Perfil "${nome}" não existe — rode o seed antes.`);
    return p.id;
  };

  // ---- conta bancária: Bradesco, padrão ------------------------------------
  //
  // A 2ª via do boleto exige uma conta **padrão** (ou a conta no próprio
  // título) e o nosso número. Bradesco porque é o único banco com gerador de
  // código de barras implementado (ver `boleto-codigo.ts`).
  const conta = await prisma.contaBancaria.create({
    data: {
      empresaId,
      descricao: DESCRICAO_CONTA,
      banco: '237',
      agencia: '1234',
      agenciaDv: '5',
      conta: '0056789',
      contaDv: '0',
      carteira: '09',
      beneficiarioNome: empresa.razaoSocial,
      beneficiarioDocumento: empresa.cnpj,
      beneficiarioEndereco: 'Av. Afonso Pena, 1000 - Centro - Campo Grande/MS',
      localPagamento: 'Pagável em qualquer banco até o vencimento',
      aceite: 'N',
      especieDocumento: 'DM',
      instrucoes:
        'Após o vencimento, cobrar multa de 2% e juros de 1% ao mês. Não receber após 30 dias.',
      multaPerc: 2,
      jurosMesPerc: 1,
      padrao: true,
      ativo: true,
    },
  });

  // ---- cadastros de apoio ---------------------------------------------------
  const categorias: { id: string }[] = [];
  for (const [i, descricao] of CATEGORIAS.entries()) {
    categorias.push(
      await prisma.categoria.create({
        data: {
          empresaId,
          codigoErp: `${PREFIXO}CAT${i + 1}`,
          descricao,
          // "Usada nas análises": sem isto a categoria não entra na tabela
          // Vendas Categoria do Dashboard (ver `venda-analitica.ts`).
          usado: true,
          ativo: true,
        },
      }),
    );
  }

  const armazens: { id: string }[] = [];
  for (const [i, descricao] of ['Armazém Central', 'Armazém Filial'].entries()) {
    armazens.push(
      await prisma.armazem.create({
        data: { empresaId, codigoErp: `${PREFIXO}A${i + 1}`, descricao, ativo: true },
      }),
    );
  }

  const condicoes: { id: string; descricao: string; forma: string | null }[] = [];
  for (const [i, [descricao, forma]] of CONDICOES.entries()) {
    condicoes.push(
      await prisma.condicaoPagamento.create({
        data: {
          empresaId,
          codigoErp: `${PREFIXO}CP${i + 1}`,
          descricao,
          forma,
          ativo: true,
        },
      }),
    );
  }

  const tabelaPreco = await prisma.tabelaPreco.create({
    data: {
      empresaId,
      codigoErp: `${PREFIXO}TP1`,
      descricao: 'Tabela Geral',
      dtInicio: quando(365, 0),
      ativo: true,
    },
  });

  // ---- produtos, preço de tabela e estoque ---------------------------------
  const produtos: ProdutoDemo[] = [];
  for (const [i, [descricao, unidade, ncm, preco, cat]] of PRODUTOS.entries()) {
    const codigoErp = `${PREFIXO}P${String(i + 1).padStart(3, '0')}`;
    const produto = await prisma.produto.create({
      data: {
        empresaId,
        codigoErp,
        descricao,
        unidade,
        ncm,
        categoriaId: categorias[cat].id,
        armazemId: armazens[i % armazens.length].id,
        marca: umDe(['Alfa', 'Bela Vista', 'Primor', 'Nacional']),
        qtdEmbalagem: entre(6, 24),
        peso: Math.round(entre(5, 180) * 10) / 100,
        ultimoPreco: preco,
        ativo: true,
      },
    });
    produtos.push({
      id: produto.id,
      codigoErp,
      descricao,
      unidade,
      ncm,
      ultimoPreco: preco,
      categoriaId: categorias[cat].id,
    });

    await prisma.tabelaPrecoItem.create({
      data: {
        empresaId,
        tabelaPrecoId: tabelaPreco.id,
        produtoId: produto.id,
        preco,
        ativo: true,
      },
    });

    for (const [j, armazem] of armazens.entries()) {
      await prisma.estoque.create({
        data: {
          empresaId,
          codigoErp: `${PREFIXO}E${i + 1}-${j + 1}`,
          produtoId: produto.id,
          armazemId: armazem.id,
          // O segundo armazém fica enxuto de propósito: dá o que olhar na tela
          // de Estoque, com item em falta num lugar e sobrando no outro.
          saldo: j === 0 ? entre(20, 900) : entre(0, 60),
          reserva: entre(0, 15),
          custo: Math.round(preco * 0.62 * 100) / 100,
          ultimoPreco: preco,
          ultimaCompra: quando(entre(5, 90), 9),
        },
      });
    }
  }

  // ---- a equipe -------------------------------------------------------------
  //
  // Um gerente, dois supervisores e seis vendedores, com a hierarquia montada
  // — é o que faz o escopo (carteira própria × equipe) ter o que mostrar.
  const equipe = [
    // `tipo` diz só se atende cliente ou responde por outros; o degrau vem da
    // cadeia `superiorId` montada logo abaixo.
    { nome: 'Marina Prado', chave: 'gerente.demo', tipo: 'superior' as const, perfil: 'Gerente' },
    { nome: 'Sérgio Almeida', chave: 'supervisor1.demo', tipo: 'superior' as const, perfil: 'Supervisor' },
    { nome: 'Regina Matos', chave: 'supervisor2.demo', tipo: 'superior' as const, perfil: 'Supervisor' },
    { nome: 'Paulo Vieira', chave: 'vendedor1.demo', tipo: 'vendedor' as const, perfil: 'Vendedor' },
    { nome: 'Carla Nunes', chave: 'vendedor2.demo', tipo: 'vendedor' as const, perfil: 'Vendedor' },
    { nome: 'Diego Ramos', chave: 'vendedor3.demo', tipo: 'vendedor' as const, perfil: 'Vendedor' },
    { nome: 'Bianca Lopes', chave: 'vendedor4.demo', tipo: 'vendedor' as const, perfil: 'Vendedor' },
    { nome: 'Rafael Torres', chave: 'vendedor5.demo', tipo: 'vendedor' as const, perfil: 'Vendedor' },
    { nome: 'Juliana Peixoto', chave: 'vendedor6.demo', tipo: 'vendedor' as const, perfil: 'Vendedor' },
  ];

  const senhaHash = await bcrypt.hash(SENHA_DEMO, 12);
  const pessoas: Record<string, PessoaDemo> = {};

  for (const [i, pessoa] of equipe.entries()) {
    const email = `${pessoa.chave}@bjsoft.com.br`;
    const usuario = await prisma.usuario.upsert({
      where: { email },
      create: { nome: pessoa.nome, email, senhaHash, ativo: true },
      update: { nome: pessoa.nome, senhaHash, ativo: true },
    });
    await prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId } },
      create: {
        usuarioId: usuario.id,
        empresaId,
        perfilId: perfilPor(pessoa.perfil),
        ativo: true,
      },
      update: { perfilId: perfilPor(pessoa.perfil), ativo: true },
    });
    const vendedor = await prisma.vendedor.create({
      data: {
        empresaId,
        usuarioId: usuario.id,
        codigoErp: `${PREFIXO}V${String(i + 1).padStart(2, '0')}`,
        nome: pessoa.nome,
        nomeReduzido: pessoa.nome.split(' ')[0],
        email,
        telefone: `6799${entre(1000000, 9999999)}`,
        // Aniversários nos próximos dias: é o que o cartão da tela inicial lê
        // (do cadastro de Vendedor, não do de Cliente).
        dataNascimento: new Date(
          1980 + i,
          hoje.getMonth(),
          Math.min(hoje.getDate() + i, 28),
        ),
        percComissao: 2 + (i % 3) * 0.5,
        tipo: pessoa.tipo,
        vinculo: 'clt',
        usaDashboard: true,
        ativo: true,
      },
    });
    pessoas[pessoa.chave] = {
      usuarioId: usuario.id,
      vendedorId: vendedor.id,
      nome: pessoa.nome,
      chave: pessoa.chave,
      tipo: pessoa.tipo,
    };
  }

  /**
   * O usuário administrador também ganha cadastro de vendedor.
   *
   * Sem isso, quem está demonstrando o sistema logado como administrador abre
   * Meus Atendimentos vazio e Conversas com "seu usuário não está vinculado a
   * um cadastro de vendedor" — as duas telas dependem de carteira, não de
   * permissão. Entra como **gerente**, com a equipe inteira abaixo.
   */
  const admin = await prisma.usuario.findFirst({
    where: { administradorPlataforma: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, nome: true },
  });
  if (admin) {
    const vendedorAdmin = await prisma.vendedor.create({
      data: {
        empresaId,
        usuarioId: admin.id,
        codigoErp: `${PREFIXO}V00`,
        nome: admin.nome,
        nomeReduzido: admin.nome.split(' ')[0],
        tipo: 'superior',
        vinculo: 'clt',
        // **Fora das telas gerenciais.** Ele tem cadastro de vendedor para as
        // telas que dependem de carteira (Meus Atendimentos, Conversas)
        // funcionarem para quem demonstra o sistema — mas não é time de
        // venda, e aparecer no Dashboard Gerencial como um vendedor sem meta
        // e sem equipe só sujava a leitura. É exatamente o caso de uso do
        // campo `usaDashboard`.
        usaDashboard: false,
        dataNascimento: new Date(1979, hoje.getMonth(), Math.min(hoje.getDate() + 4, 28)),
        ativo: true,
      },
    });
    pessoas['admin'] = {
      usuarioId: admin.id,
      vendedorId: vendedorAdmin.id,
      nome: admin.nome,
      chave: 'admin',
      tipo: 'superior',
    };
  }

  const vendedores = equipe
    .filter((p) => p.tipo === 'vendedor')
    .map((p) => pessoas[p.chave]);
  const supervisores = [pessoas['supervisor1.demo'], pessoas['supervisor2.demo']];
  const gerente = pessoas['gerente.demo'];

  // A cadeia: vendedor → supervisor → gerente. Cada um aponta só a quem
  // responde, e o escopo de acesso sobe a árvore sozinho.
  for (const [i, v] of vendedores.entries()) {
    await prisma.vendedor.update({
      where: { id: v.vendedorId },
      data: {
        superiorId: supervisores[i % 2].vendedorId,
      },
    });
  }
  for (const s of supervisores) {
    await prisma.vendedor.update({
      where: { id: s.vendedorId },
      data: { superiorId: gerente.vendedorId },
    });
  }
  // A gerente é o topo da hierarquia comercial. O administrador **não** entra
  // como gerente dela: administrar o sistema não é comandar a operação, e
  // pendurá-la nele criava um grupo de time no Dashboard Gerencial para quem
  // não tem time.


  // ---- clientes, por ramo ---------------------------------------------------
  const cnaes = await prisma.cnae.findMany({
    where: { codigoErp: { in: RAMOS.map((r) => r.cnae) } },
    select: { id: true, codigoErp: true },
  });
  const cnaePorCodigo = new Map(cnaes.map((c) => [c.codigoErp, c.id]));

  const clientes: ClienteDemo[] = [];
  const CLIENTES_POR_RAMO = 15;
  for (const [indiceRamo, ramo] of RAMOS.entries()) {
    for (let n = 0; n < CLIENTES_POR_RAMO; n++) {
      const i = clientes.length;
      const [municipio, uf] = umDe(MUNICIPIOS);
      const nomeFantasia = `${ramo.prefixos[n % ramo.prefixos.length]} ${SOBRENOMES_EMPRESA[i % SOBRENOMES_EMPRESA.length]}`;
      const razaoSocial = `${nomeFantasia.toUpperCase()} LTDA`;
      const cnpj = `${entre(10000000, 99999999)}0001${entre(10, 99)}`;
      // A carteira gira entre os seis vendedores — e **só** entre eles. O
      // administrador não tem clientes: ele tem cadastro de vendedor para as
      // telas que dependem de carteira funcionarem, mas dar-lhe clientes
      // punha faturamento em nome de quem não vende e criava uma linha órfã
      // no Dashboard Gerencial ("Sem hierarquia definida").
      const dono = vendedores[i % vendedores.length];
      const ativo = i % 12 !== 7;

      const cliente = await prisma.cliente.create({
        data: {
          empresaId,
          vendedorId: dono.vendedorId,
          tabelaPrecoId: tabelaPreco.id,
          condicaoPagamentoId: umDe(condicoes).id,
          codigoErp: `${PREFIXO}C${String(i + 1).padStart(4, '0')}`,
          tipoPessoa: 'juridica',
          razaoSocial,
          nomeFantasia,
          cnpjCpf: cnpj,
          inscricaoEstadual: String(entre(100000000, 999999999)),
          contribuinteIcms: true,
          contato: umDe(['João', 'Maria', 'Ana', 'Carlos', 'Fernanda', 'Roberto']),
          telefone: `673${entre(1000000, 3999999)}`,
          celular: `6799${entre(1000000, 9999999)}`,
          email: `contato${i + 1}@exemplo.com.br`,
          endereco: `Rua ${umDe(['das Flores', 'Sete de Setembro', 'Brasil', 'Rio Branco', 'Marechal Rondon'])}`,
          complemento: `nº ${entre(10, 1999)}`,
          bairro: umDe(['Centro', 'Vila Nova', 'Jardim dos Estados', 'Tiradentes', 'Coophavila']),
          municipio,
          uf,
          cep: `790${entre(10000, 99999)}`,
          limiteCredito: entre(5, 50) * 1000,
          ativo,
          primeiraCompra: quando(entre(200, 900), 10),
        },
      });

      // O ramo, para a Sugestão de Compra achar semelhantes.
      const cnaeId = cnaePorCodigo.get(ramo.cnae);
      if (cnaeId) {
        await prisma.clienteCnae.create({
          data: { empresaId, clienteId: cliente.id, cnaeId, principal: true },
        });
      }

      for (let c = 0; c < entre(1, 3); c++) {
        await prisma.clienteContato.create({
          data: {
            empresaId,
            clienteId: cliente.id,
            nome: ['Ana Souza', 'Carlos Lima', 'Fernanda Rocha'][c],
            email: `contato${c + 1}.c${i + 1}@exemplo.com.br`,
            telefone: `673${entre(1000000, 3999999)}`,
            celular: `6799${entre(1000000, 9999999)}`,
            cargo: umDe(['Compras', 'Financeiro', 'Proprietário', 'Gerente']),
            principal: c === 0,
            ativo: true,
          },
        });
      }

      clientes.push({
        id: cliente.id,
        razaoSocial,
        nomeFantasia,
        cnpj,
        vendedorId: dono.vendedorId,
        ramo: indiceRamo,
        municipio,
        uf,
        endereco: cliente.endereco ?? '',
        bairro: cliente.bairro ?? '',
        cep: cliente.cep ?? '',
        celular: cliente.celular ?? '',
        ativo,
      });
    }
  }

  /**
   * A cesta de cada ramo — os produtos que aquele tipo de cliente compra.
   *
   * A Sugestão de Compra compara a cesta do cliente com a de quem é parecido:
   * se cada cliente comprar produtos sorteados, não há padrão a encontrar e a
   * tela responde "os semelhantes não compram nada além". Cada ramo tem um
   * núcleo comum e alguns itens que só parte dos clientes leva — é essa
   * diferença que vira sugestão.
   */
  const cestaDoRamo = RAMOS.map((_, indiceRamo) => {
    const nucleo = produtos.filter((_, i) => i % RAMOS.length !== indiceRamo % RAMOS.length);
    return nucleo.slice(0, 10 + (indiceRamo % 4));
  });

  // ---- notas, itens, XML e títulos -----------------------------------------
  const notas: NotaDemo[] = [];
  const titulos: TituloDemo[] = [];
  let numeroNota = 10500;
  let nossoNumero = 20260000;

  const municipioEmitente = MUNICIPIOS[0];

  for (const [indiceCliente, cliente] of clientes.entries()) {
    if (!cliente.ativo) continue;
    const cesta = cestaDoRamo[cliente.ramo];

    for (const m of MESES) {
      // Nem todo cliente compra todo mês: positivação de 100% da base não
      // existe, e é justamente o número em destaque no Dashboard Comercial.
      //
      // O sorteio é aleatório de propósito. A primeira versão usava
      // `(indice + mes) % 3`, que se alinhava com o `% 6` da distribuição de
      // carteira: dois dos seis vendedores perdiam o mês inteiro, ficavam com
      // meta e zero de venda, e derrubavam o atingimento da empresa.
      if (aleatorio() < 0.25) continue;

      for (let n = 0; n < entre(1, 2); n++) {
        const emissao = diaDoMes(m);
        numeroNota += 1;

        // Os itens vêm primeiro: o valor da nota é a soma deles. A cesta do
        // ramo dá o núcleo; o índice do cliente decide o que ele leva a mais.
        const escolhidos = cesta.filter(
          (_, i) => (i + indiceCliente) % 3 !== 0 || i < 3,
        );
        const linhas = escolhidos.slice(0, entre(3, 7)).map((produto) => {
          const qtd = entre(2, 40);
          const unitario =
            Math.round(produto.ultimoPreco * (1 - entre(0, 10) / 100) * 100) / 100;
          return {
            produto,
            quantidade: qtd,
            vlrUnitario: unitario,
            vlrTotal: Math.round(qtd * unitario * 100) / 100,
            devolvido: entre(1, 14) === 1,
          };
        });
        const valor = Math.round(
          linhas.reduce((s, l) => s + l.vlrTotal, 0) * 100,
        ) / 100;

        const condicao = umDe(condicoes);
        const parcelas = condicao.descricao === 'À vista' ? 1 : entre(1, 3);
        const duplicatas = Array.from({ length: parcelas }, (_, p) => ({
          numero: `${numeroNota}/${p + 1}`,
          vencimento: new Date(emissao.getTime() + (p + 1) * 28 * DIA),
          valor: Math.round((valor / parcelas) * 100) / 100,
        }));

        const nota = await prisma.notaSaida.create({
          data: {
            empresaId,
            codigoErp: `${PREFIXO}NF${numeroNota}`,
            clienteId: cliente.id,
            vendedorId: cliente.vendedorId,
            condicaoPagamentoId: condicao.id,
            numero: String(numeroNota),
            serie: '1',
            especieFiscal: 'NFE',
            // `N` = Normal. **Sem isto nada conta como venda**: o corte de
            // `venda-analitica.ts` exige tipo N, comodato falso e condição de
            // pagamento preenchida.
            tipo: 'N',
            comodato: false,
            dtEmissao: emissao,
            ano: emissao.getFullYear(),
            mes: emissao.getMonth() + 1,
            vlrBruto: valor,
            vlrMercadoria: valor,
            vlrItens: valor,
            vlrIcms: Math.round(valor * 0.17 * 100) / 100,
            ativo: true,
            itens: {
              create: linhas.map((l, item) => ({
                empresaId,
                codigoErp: `${PREFIXO}NFI${numeroNota}-${item + 1}`,
                clienteId: cliente.id,
                vendedorId: cliente.vendedorId,
                produtoId: l.produto.id,
                item: item + 1,
                dtEmissao: emissao,
                ano: emissao.getFullYear(),
                mes: emissao.getMonth() + 1,
                cfop: '5102',
                tipo: 'N',
                quantidade: l.quantidade,
                vlrUnitario: l.vlrUnitario,
                vlrTabela: l.produto.ultimoPreco,
                vlrTotal: l.vlrTotal,
                // Devolução parcial numa linha a cada catorze: é o que alimenta
                // o card Devolução e o realizado líquido.
                ...(l.devolvido
                  ? {
                      quantidadeDev: Math.max(Math.round(l.quantidade * 0.2), 1),
                      vlrDev: Math.round(l.vlrTotal * 0.2 * 100) / 100,
                    }
                  : {}),
                ativo: true,
              })),
            },
          },
        });

        // O XML autorizado — é dele que sai a 2ª via do DANFE.
        const itensNfe: ItemNfe[] = linhas.map((l) => ({
          codigo: l.produto.codigoErp,
          descricao: l.produto.descricao,
          ncm: l.produto.ncm,
          cfop: '5102',
          unidade: l.produto.unidade,
          quantidade: l.quantidade,
          valorUnitario: l.vlrUnitario,
          valorTotal: l.vlrTotal,
        }));
        const conteudoXml = montarXmlNfe({
          numero: String(numeroNota),
          serie: '1',
          emissao,
          naturezaOperacao: 'VENDA DE MERCADORIA ADQUIRIDA DE TERCEIROS',
          emitente: {
            cnpj: empresa.cnpj ?? '11222333000181',
            razaoSocial: empresa.razaoSocial,
            fantasia: empresa.nomeFantasia ?? empresa.razaoSocial,
            endereco: 'Av. Afonso Pena',
            numero: '1000',
            bairro: 'Centro',
            municipio: municipioEmitente[0],
            codigoMunicipio: municipioEmitente[2],
            uf: municipioEmitente[1],
            cep: '79002070',
            inscricaoEstadual: '283456789',
            fone: '6733210000',
          },
          destinatario: {
            cnpj: cliente.cnpj,
            razaoSocial: cliente.razaoSocial,
            endereco: cliente.endereco,
            numero: String(entre(10, 1999)),
            bairro: cliente.bairro,
            municipio: cliente.municipio,
            codigoMunicipio:
              MUNICIPIOS.find((mu) => mu[0] === cliente.municipio)?.[2] ?? '5002704',
            uf: cliente.uf,
            cep: cliente.cep,
            inscricaoEstadual: String(entre(100000000, 999999999)),
            fone: cliente.celular,
          },
          itens: itensNfe,
          duplicatas,
          transportadora: umDe(TRANSPORTADORAS),
          protocolo: `150${entre(100000000000, 999999999999)}`,
        });

        await prisma.notaSaidaXml.create({
          data: {
            empresaId,
            notaSaidaId: nota.id,
            conteudo: conteudoXml,
            tamanhoBytes: Buffer.byteLength(conteudoXml, 'utf8'),
            recebidoPor: `${PREFIXO}integracao`,
          },
        });

        notas.push({
          id: nota.id,
          numero: String(numeroNota),
          clienteId: cliente.id,
          vendedorId: cliente.vendedorId,
          dtEmissao: emissao,
          vlrBruto: valor,
        });

        // Um título por duplicata. Vencido e pago, vencido em aberto (com
        // boleto reemitível dentro dos 30 dias) e a vencer — os três estados
        // que a tela de Títulos e a cobrança precisam mostrar.
        for (const [p, dup] of duplicatas.entries()) {
          const venceu = dup.vencimento < hoje;
          const diasAtraso = Math.round(
            (hoje.getTime() - dup.vencimento.getTime()) / DIA,
          );
          const pago = venceu && aleatorio() > 0.4;
          // O boleto só é reemitível até 30 dias depois do vencimento — é a
          // regra de `podeEmitirBoleto`, e é o que decide se o botão da tela
          // aparece habilitado.
          const comBoleto = !pago && diasAtraso <= 30;
          nossoNumero += 1;

          const titulo = await prisma.tituloReceber.create({
            data: {
              empresaId,
              codigoErp: `${PREFIXO}T${numeroNota}-${p + 1}`,
              clienteId: cliente.id,
              vendedorId: cliente.vendedorId,
              numero: String(numeroNota),
              parcela: String(p + 1),
              prefixo: '001',
              tipo: 'NF',
              emissao,
              vencimento: dup.vencimento,
              vencimentoReal: dup.vencimento,
              valor: dup.valor,
              saldo: pago ? 0 : dup.valor,
              dtBaixa: pago ? new Date(dup.vencimento.getTime() - DIA) : null,
              formaPgto: condicao.forma,
              historico: `NF ${numeroNota} — ${condicao.descricao}`,
              ativo: true,
              // Dados da cobrança registrada no banco: sem nosso número, a 2ª
              // via não sai (o boleto nunca foi registrado).
              ...(comBoleto
                ? {
                    contaBancariaId: conta.id,
                    nossoNumero: String(nossoNumero).padStart(11, '0'),
                    carteira: '09',
                    banco: '237',
                    bancoNome: 'BRADESCO',
                    bancoCodigoCompensacao: '237',
                    agencia: conta.agencia,
                    agenciaDv: conta.agenciaDv,
                    conta: conta.conta,
                    contaDv: conta.contaDv,
                    beneficiarioNome: conta.beneficiarioNome,
                    beneficiarioDocumento: conta.beneficiarioDocumento,
                    beneficiarioEndereco: conta.beneficiarioEndereco,
                    localPagamento: conta.localPagamento,
                    aceite: conta.aceite,
                    especieDocumento: conta.especieDocumento,
                    instrucoes: conta.instrucoes,
                  }
                : {}),
            },
          });

          titulos.push({
            id: titulo.id,
            numero: String(numeroNota),
            parcela: String(p + 1),
            valor: dup.valor,
            saldo: pago ? 0 : dup.valor,
            vencimento: dup.vencimento,
            clienteId: cliente.id,
            vendedorId: cliente.vendedorId,
            comBoleto,
          });
        }
      }
    }
  }

  // ---- orçamentos: aprovados, pendentes e recusados -------------------------
  const orcamentos: OrcamentoDemo[] = [];
  let numeroOrcamento = 1;
  const STATUS_ORCAMENTO = [
    'aprovado',
    'enviado',
    'recusado',
    'rascunho',
    'aprovado',
    'enviado',
  ] as const;

  for (const [i, cliente] of clientes.entries()) {
    // Sorteio, e não `i % 2`: a carteira gira entre seis vendedores, então
    // pegar um cliente sim, um não punha **todos** os orçamentos nos três
    // vendedores de índice par — que por acaso são os do mesmo supervisor. O
    // outro time abria a tela zerada, e parecia falha de escopo.
    if (aleatorio() < 0.5) continue;
    const m = MESES[i % MESES.length];
    const criadoEm = diaDoMes(m, entre(8, 18));
    const status = STATUS_ORCAMENTO[i % STATUS_ORCAMENTO.length];
    const cesta = cestaDoRamo[cliente.ramo];

    const itens = cesta.slice(0, entre(2, 6)).map((produto) => {
      const qtd = entre(2, 40);
      const unitario = produto.ultimoPreco;
      return {
        empresaId,
        produtoId: produto.id,
        quantidade: qtd,
        vlrTabela: unitario,
        vlrUnitario: Math.round(unitario * (1 - entre(0, 8) / 100) * 100) / 100,
        vlrTotal: 0,
      };
    });
    for (const item of itens) {
      item.vlrTotal = Math.round(item.quantidade * item.vlrUnitario * 100) / 100;
    }
    const total = Math.round(itens.reduce((s, it) => s + it.vlrTotal, 0) * 100) / 100;

    const orcamento = await prisma.orcamento.create({
      data: {
        empresaId,
        codigoErp: `${PREFIXO}O${numeroOrcamento}`,
        numero: numeroOrcamento,
        clienteId: cliente.id,
        vendedorId: cliente.vendedorId,
        titulo: `Reposição ${criadoEm.toLocaleDateString('pt-BR', { month: 'long' })}`,
        status,
        // A venda é sempre do vendedor do cliente; a origem diz quem a montou.
        // Um em cada cinco sai do supervisor ou da gerência (eles vendem na
        // carteira do subordinado) e um em cada nove vem do próprio cliente —
        // é o que dá o que olhar na coluna Vendedor da lista.
        origem: ORIGENS_VENDA[i % ORIGENS_VENDA.length],
        dataValidade: new Date(criadoEm.getTime() + 15 * DIA),
        dataRetorno: status === 'enviado' ? new Date(criadoEm.getTime() + 7 * DIA) : null,
        vlrTotal: total,
        // A decisão do cliente é o que separa aprovado de recusado nas telas —
        // sem ela o status fica sem lastro no histórico.
        ...(status === 'aprovado' || status === 'recusado'
          ? {
              clienteDecididoEm: new Date(criadoEm.getTime() + 3 * DIA),
              clienteDecisao: status === 'aprovado' ? 'aprovado' : 'recusado',
              clienteDecisaoObservacao:
                status === 'recusado'
                  ? umDe(['Preço acima do concorrente', 'Sem verba este mês', 'Prazo longo demais'])
                  : 'Pode faturar',
            }
          : {}),
        ativo: true,
        createdAt: criadoEm,
        itens: { create: itens },
      },
    });
    orcamentos.push({
      id: orcamento.id,
      numero: numeroOrcamento,
      clienteId: cliente.id,
      vendedorId: cliente.vendedorId,
      vlrTotal: total,
      status,
      criadoEm,
    });
    numeroOrcamento += 1;
  }

  // O contador de numeração precisa saber que estes números já existem: ele é
  // a fonte do "Nº" do orçamento, e o par (empresa, número) é único. Sem isto,
  // o primeiro orçamento criado pela tela depois da demonstração tentava o
  // número 1 e morria em unique constraint — a tela de Orçamentos ficava
  // quebrada até alguém passar de 45.
  await prisma.orcamentoConfig.upsert({
    where: { empresaId },
    create: { empresaId, ultimoNumero: numeroOrcamento - 1 },
    update: { ultimoNumero: numeroOrcamento - 1 },
  });

  // ---- funil de oportunidades ----------------------------------------------
  const ESTAGIOS = [
    'prospeccao',
    'qualificacao',
    'proposta',
    'negociacao',
    'ganha',
    'perdida',
  ] as const;
  for (const [i, cliente] of clientes.entries()) {
    if (aleatorio() < 0.66) continue;
    const estagio = ESTAGIOS[i % ESTAGIOS.length];
    const fechada = estagio === 'ganha' || estagio === 'perdida';
    await prisma.oportunidade.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        vendedorId: cliente.vendedorId,
        titulo: umDe([
          'Reposição mensal',
          'Troca de fornecedor',
          'Linha de descartáveis',
          'Contrato anual de limpeza',
          'Abertura de filial',
        ]),
        estagio,
        valorPrevisto: entre(1500, 45000),
        dataPrevisao: quando(-entre(5, 45), 12),
        dataFechamento: fechada ? quando(entre(1, 40), 15) : null,
        motivoPerda:
          estagio === 'perdida'
            ? umDe(['Preço', 'Prazo de entrega', 'Ficou com o concorrente'])
            : null,
        ativo: true,
        createdAt: quando(entre(10, 100), 10),
      },
    });
  }

  // ---- objetivos: os quatro meses ------------------------------------------
  const faturadoPorVendedorMes = new Map<string, number>();
  for (const nota of notas) {
    const chave = `${nota.vendedorId}-${nota.dtEmissao.getFullYear()}-${nota.dtEmissao.getMonth() + 1}`;
    faturadoPorVendedorMes.set(
      chave,
      (faturadoPorVendedorMes.get(chave) ?? 0) + nota.vlrBruto,
    );
  }

  const todasAsPessoas = Object.values(pessoas);
  // Só quem vende tem meta. Supervisor, gerente e administrador respondem pela
  // soma do time: dar meta própria a eles faria o objetivo agregado do
  // Dashboard contar a mesma venda duas vezes — e, como eles não faturam em
  // carteira própria, o atingimento da empresa despencava sem motivo.
  for (const pessoa of todasAsPessoas.filter((p) => p.tipo === 'vendedor')) {
    for (const m of MESES) {
      const faturado =
        faturadoPorVendedorMes.get(`${pessoa.vendedorId}-${m.ano}-${m.mes}`) ?? 0;
      // A meta acompanha o que foi vendido, com folga: o atingimento cai numa
      // faixa plausível (70% a 95%) em vez de 5% ou 300%. O mês seguinte ganha
      // meta cheia mesmo com pouco movimento — é meta de mês que vai começar.
      const folga = m.deslocamento === 1 ? entre(130, 160) : entre(105, 140);
      const base = faturado > 0 ? faturado : entre(25, 60) * 1000;
      const meta = Math.round((base * folga) / 100);

      const objetivo = await prisma.objetivoVendedorMes.create({
        data: {
          empresaId,
          vendedorId: pessoa.vendedorId,
          codigoErp: `${PREFIXO}OBJ-${pessoa.chave}-${m.ano}${String(m.mes).padStart(2, '0')}`,
          mes: m.mes,
          ano: m.ano,
          valor: meta,
          numeroCliente: entre(8, 22),
          novoCliente: entre(1, 4),
          ativo: true,
        },
      });

      // Meta por categoria: a soma bate com a meta do mês, que é o que a tela
      // de Objetivos cobra ao editar.
      let restante = meta;
      for (const [i, categoria] of categorias.entries()) {
        const ultimo = i === categorias.length - 1;
        const valor = ultimo
          ? restante
          : Math.round(meta / categorias.length + entre(-1500, 1500));
        restante -= valor;
        await prisma.objetivoVendedorCategoria.create({
          data: {
            empresaId,
            objetivoVendedorMesId: objetivo.id,
            categoriaId: categoria.id,
            valor: Math.max(valor, 0),
          },
        });
      }
    }
  }

  // ---- mural ----------------------------------------------------------------
  for (const [titulo, texto, fixado] of COMUNICADOS) {
    await prisma.comunicado.create({
      data: {
        empresaId,
        titulo,
        texto,
        fixado,
        ativo: true,
        inicioEm: quando(entre(1, 10), 8),
        createdBy: gerente.usuarioId,
      },
    });
  }

  // ---- WhatsApp -------------------------------------------------------------
  //
  // A integração precisa estar ativa: com ela desligada, Conversas some do
  // menu (regra de `useWhatsappIntegracao`) e a demonstração fica sem a tela
  // que as conversas abaixo populam. O `--limpar` desliga de novo.
  await prisma.whatsappConfig.upsert({
    where: { empresaId },
    create: { empresaId, ativo: true },
    update: { ativo: true },
  });

  // Vendedores, supervisores e o administrador atendem — todos com aparelho.
  const comAparelho = [...vendedores, ...supervisores, ...(pessoas['admin'] ? [pessoas['admin']] : [])];
  const sessoes = new Map<string, string>();
  for (const pessoa of comAparelho) {
    const sessao = await prisma.whatsappSessao.create({
      data: {
        empresaId,
        vendedorId: pessoa.vendedorId,
        numero: `5567 9${entre(1000, 9999)}-${entre(1000, 9999)}`,
        jid: `55679${entre(10000000, 99999999)}@s.whatsapp.net`,
        status: 'conectada',
        transporte: 'zapo',
        ultimaConexao: quando(0, 8),
        aceiteEm: quando(45, 9),
      },
    });
    sessoes.set(pessoa.vendedorId, sessao.id);
  }

  /** Quantas mensagens cada cliente trocou em cada dia — vira a atividade. */
  const conversaPorClienteDia = new Map<
    string,
    { clienteId: string; vendedorId: string; dia: number; saida: number; entrada: number }
  >();

  const clientesComConversa = clientes.filter((c) => c.ativo).slice(0, 45);
  for (const [indice, cliente] of clientesComConversa.entries()) {
    // A cada seis conversas, quem atende é o supervisor: ele trabalha na
    // carteira do subordinado, e a conversa é da conexão **dele**.
    const dono =
      aleatorio() < 0.18
        ? supervisores[indice % 2].vendedorId
        : cliente.vendedorId;
    const sessaoId = sessoes.get(dono);
    if (!sessaoId) continue;

    const contato = await prisma.whatsappContato.create({
      data: {
        empresaId,
        jid: `55679${entre(10000000, 99999999)}@s.whatsapp.net`,
        nomeExibicao: cliente.nomeFantasia,
        telefoneNormalizado: `55${cliente.celular.replace(/\D/g, '')}`,
        clienteId: cliente.id,
        vinculadoEm: quando(entre(20, 90), 10),
        tipo: 'geral',
      },
    });
    const conversa = await prisma.whatsappConversa.create({
      data: {
        empresaId,
        sessaoId,
        contatoId: contato.id,
        clienteId: cliente.id,
        naoLidas: indice % 7 === 0 ? entre(1, 3) : 0,
      },
    });

    // Conversa espalhada: parte na última semana (que é o que a timeline de
    // Meus Atendimentos alcança) e parte nos meses anteriores, para o
    // histórico do cliente não começar na segunda-feira.
    let ultima: Date | null = null;
    const dias = [...new Set([entre(0, 6), entre(0, 6), entre(7, 90)])];
    for (const dia of dias) {
      let saida = 0;
      let entrada = 0;
      for (let msg = 0; msg < entre(2, 8); msg++) {
        const direcao = msg % 2 === 0 ? 'entrada' : 'saida';
        const criadaEm = quando(dia, entre(8, 18), entre(0, 59));
        await prisma.whatsappMensagem.create({
          data: {
            empresaId,
            conversaId: conversa.id,
            externoId: `${PREFIXO}${conversa.id.slice(0, 8)}-${dia}-${msg}`,
            direcao,
            tipo: 'texto',
            conteudo:
              direcao === 'saida' ? umDe(CONVERSA_SAIDA) : umDe(CONVERSA_ENTRADA),
            enviadaPor:
              direcao === 'saida'
                ? todasAsPessoas.find((p) => p.vendedorId === dono)?.usuarioId
                : null,
            statusEntrega: direcao === 'saida' ? 'lida' : 'entregue',
            criadaEm,
          },
        });
        if (direcao === 'saida') saida += 1;
        else entrada += 1;
        if (!ultima || criadaEm > ultima) ultima = criadaEm;
      }
      if (dia <= 6) {
        conversaPorClienteDia.set(`${cliente.id}-${dia}`, {
          clienteId: cliente.id,
          vendedorId: dono,
          dia,
          saida,
          entrada,
        });
      }
    }
    await prisma.whatsappConversa.update({
      where: { id: conversa.id },
      data: { ultimaMensagemEm: ultima },
    });
  }

  // ---- atividades: o histórico que a timeline lê ---------------------------
  //
  // Os títulos são **exatamente** os que os helpers do servidor geram
  // (`registrar-atendimento-whatsapp.ts`, `registrar-atividade-documento.ts`,
  // `registrar-atividade-orcamento.ts`): é o que faz a tela Meus Atendimentos
  // classificar cada linha na categoria certa.
  const atividades: {
    clienteId: string;
    vendedorId: string;
    autor?: string;
    titulo: string;
    descricao?: string;
    quando: Date;
    concluida: boolean;
    tipo?: 'ligacao' | 'reuniao' | 'email' | 'visita' | 'tarefa';
  }[] = [];

  const plural = (n: number, s: string, p: string) => `${n} ${n > 1 ? p : s}`;
  for (const registro of conversaPorClienteDia.values()) {
    atividades.push({
      clienteId: registro.clienteId,
      vendedorId: registro.vendedorId,
      titulo: 'Atendimento por WhatsApp',
      descricao: [
        registro.saida ? plural(registro.saida, 'enviada', 'enviadas') : null,
        registro.entrada ? plural(registro.entrada, 'recebida', 'recebidas') : null,
      ]
        .filter(Boolean)
        .join(' · '),
      quando: quando(registro.dia, entre(9, 18), entre(0, 59)),
      concluida: true,
    });
  }

  // Documentos: 2ª via gerada na tela e documento enviado pela conversa.
  for (const titulo of titulos.filter((t) => t.comBoleto).slice(0, 60)) {
    const dia = entre(0, 6);
    atividades.push({
      clienteId: titulo.clienteId,
      vendedorId: titulo.vendedorId,
      titulo: `2ª via de boleto gerada — título ${titulo.numero}`,
      descricao: `venc. ${titulo.vencimento.toLocaleDateString('pt-BR')} · ${moeda(titulo.valor)}`,
      quando: quando(dia, entre(8, 18), entre(0, 59)),
      concluida: true,
    });
    if (aleatorio() > 0.5) {
      atividades.push({
        clienteId: titulo.clienteId,
        vendedorId: titulo.vendedorId,
        titulo: `Boleto enviado pelo WhatsApp — título ${titulo.numero}`,
        quando: quando(dia, entre(8, 18), entre(0, 59)),
        concluida: true,
      });
    }
  }

  for (const nota of notas.slice(-40)) {
    atividades.push({
      clienteId: nota.clienteId,
      vendedorId: nota.vendedorId,
      titulo: `DANFE enviado pelo WhatsApp — NF ${nota.numero}`,
      quando: quando(entre(0, 6), entre(8, 18), entre(0, 59)),
      concluida: true,
    });
  }

  for (const cliente of clientesComConversa.slice(0, 20)) {
    atividades.push({
      clienteId: cliente.id,
      vendedorId: cliente.vendedorId,
      titulo: 'Títulos em aberto enviados pelo WhatsApp',
      descricao: `${entre(2, 6)} título(s) · ${moeda(entre(400, 7000))}`,
      quando: quando(entre(0, 6), entre(8, 18), entre(0, 59)),
      concluida: true,
    });
  }

  for (const orcamento of orcamentos) {
    atividades.push({
      clienteId: orcamento.clienteId,
      vendedorId: orcamento.vendedorId,
      titulo: `Orçamento nº ${orcamento.numero} cadastrado`,
      descricao: moeda(orcamento.vlrTotal),
      quando: orcamento.criadoEm,
      concluida: true,
    });
    if (orcamento.status !== 'rascunho') {
      atividades.push({
        clienteId: orcamento.clienteId,
        vendedorId: orcamento.vendedorId,
        titulo: `Proposta enviada pelo WhatsApp — orçamento nº ${orcamento.numero}`,
        quando: new Date(orcamento.criadoEm.getTime() + 2 * 3600_000),
        concluida: true,
      });
    }
    if (orcamento.status === 'aprovado') {
      atividades.push({
        clienteId: orcamento.clienteId,
        vendedorId: orcamento.vendedorId,
        titulo: `Orçamento nº ${orcamento.numero} aprovado pelo cliente`,
        quando: new Date(orcamento.criadoEm.getTime() + 3 * DIA),
        concluida: true,
      });
    }
    if (orcamento.status === 'recusado') {
      atividades.push({
        clienteId: orcamento.clienteId,
        vendedorId: orcamento.vendedorId,
        titulo: `Orçamento nº ${orcamento.numero} recusado pelo cliente`,
        quando: new Date(orcamento.criadoEm.getTime() + 3 * DIA),
        concluida: true,
      });
    }
  }

  // Agenda: o que o vendedor marcou. Parte concluída (nos últimos dias) e
  // parte pendente — inclusive no mês que vem, para o calendário ter futuro.
  for (const [i, cliente] of clientes.entries()) {
    if (aleatorio() < 0.5) continue;
    const pendente = aleatorio() > 0.35;
    atividades.push({
      clienteId: cliente.id,
      vendedorId: cliente.vendedorId,
      titulo: umDe(RETORNOS),
      quando: pendente
        ? quando(-entre(1, 40), entre(8, 17))
        : quando(entre(0, 20), entre(8, 17)),
      concluida: !pendente,
      tipo: umDe(['ligacao', 'visita', 'reuniao', 'tarefa'] as const),
    });
  }

  // O que supervisor, gerente e administrador fizeram **na carteira dos
  // subordinados** — eles atendem por eles, e o registro fica na carteira de
  // quem é o cliente. O autor é o que faz esse trabalho aparecer na linha do
  // tempo de quem o executou (ver Meus Atendimentos).
  const chefes = [...supervisores, gerente, ...(pessoas['admin'] ? [pessoas['admin']] : [])];
  for (const [i, chefe] of chefes.entries()) {
    for (const cliente of clientes.filter(() => aleatorio() < 0.08).slice(0, 6)) {
      atividades.push({
        clienteId: cliente.id,
        vendedorId: cliente.vendedorId,
        autor: chefe.usuarioId,
        titulo: umDe([
          'Visita para apresentar a linha nova',
          'Reunião de fechamento do mês',
          'Ligar para confirmar o pedido',
        ]),
        descricao: 'Acompanhamento junto com o vendedor da carteira',
        quando: quando(entre(0, 6), entre(8, 17), entre(0, 59)),
        concluida: true,
        tipo: umDe(['visita', 'reuniao', 'ligacao'] as const),
      });
    }
  }

  for (const a of atividades) {
    await prisma.atividade.create({
      data: {
        empresaId,
        clienteId: a.clienteId,
        vendedorId: a.vendedorId,
        tipo: a.tipo ?? 'tarefa',
        titulo: a.titulo,
        descricao: a.descricao ?? null,
        // Registro do que aconteceu não tem vencimento; compromisso pendente
        // tem, e é o que a Agenda mostra no calendário.
        dataVencimento: a.concluida ? null : a.quando,
        concluida: a.concluida,
        dataConclusao: a.concluida ? a.quando : null,
        ativo: true,
        createdAt: a.quando,
        // Sem autor explícito, quem registrou foi o dono da carteira.
        createdBy: a.autor ?? null,
      },
    });
  }

  const periodo = MESES.map((m) => `${String(m.mes).padStart(2, '0')}/${m.ano}`).join(', ');
  console.log(
    [
      `Base de demonstração criada em "${empresa.nomeFantasia ?? empresa.razaoSocial}":`,
      `  período: ${periodo}`,
      `  ${equipe.length} usuários (1 gerente, 2 supervisores, 6 vendedores)${admin ? ' + o administrador, agora com cadastro de vendedor' : ''}`,
      `  ${clientes.length} clientes em ${RAMOS.length} ramos (com CNAE), ${produtos.length} produtos`,
      `  ${notas.length} notas com XML de NF-e, ${titulos.length} títulos ` +
        `(${titulos.filter((t) => t.comBoleto).length} com boleto Bradesco reemitível)`,
      `  ${orcamentos.length} orçamentos (aprovados, pendentes e recusados)`,
      `  ${clientesComConversa.length} conversas de WhatsApp, ${atividades.length} atividades`,
      '',
      `Entre com a senha ${SENHA_DEMO}:`,
      ...equipe.map((p) => `  ${p.chave}@bjsoft.com.br — ${p.perfil}`),
    ].join('\n'),
  );
}

/**
 * Apaga o que este script criou — e só isso.
 *
 * A ordem segue as dependências (item antes do documento, mensagem antes da
 * conversa). O reconhecimento é pelo `DEMO-` no `codigoErp`, exceto onde o
 * modelo não tem a coluna: aí o vínculo com o vendedor de demonstração é o
 * critério, o que também basta para não tocar em cadastro real.
 */
async function apagarDemo(empresaId: string) {
  const vendedores = await prisma.vendedor.findMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
    select: { id: true, usuarioId: true },
  });
  const vendedorIds = vendedores.map((v) => v.id);
  if (vendedorIds.length === 0) return;

  const conversas = await prisma.whatsappConversa.findMany({
    where: { empresaId, sessao: { vendedorId: { in: vendedorIds } } },
    select: { id: true, contatoId: true },
  });
  const conversaIds = conversas.map((c) => c.id);

  await prisma.whatsappMensagemAgendada.deleteMany({
    where: { conversaId: { in: conversaIds } },
  });
  await prisma.whatsappAcaoRegistro.deleteMany({
    where: { conversaId: { in: conversaIds } },
  });
  await prisma.whatsappMensagem.deleteMany({
    where: { conversaId: { in: conversaIds } },
  });
  await prisma.whatsappConversa.deleteMany({ where: { id: { in: conversaIds } } });
  await prisma.whatsappContato.deleteMany({
    where: { id: { in: conversas.map((c) => c.contatoId) } },
  });
  await prisma.whatsappSessao.deleteMany({
    where: { vendedorId: { in: vendedorIds } },
  });
  // Sem as conversas de demonstração não há o que atender: a integração volta
  // a desligada, como estava antes de o script rodar pela primeira vez.
  await prisma.whatsappConfig.updateMany({
    where: { empresaId },
    data: { ativo: false },
  });

  const usuarioIds = vendedores
    .map((v) => v.usuarioId)
    .filter((id): id is string => !!id);

  await prisma.atividade.deleteMany({
    where: { empresaId, vendedorId: { in: vendedorIds } },
  });
  await prisma.oportunidade.deleteMany({
    where: { empresaId, vendedorId: { in: vendedorIds } },
  });
  await prisma.objetivoVendedorCategoria.deleteMany({
    where: { objetivo: { vendedorId: { in: vendedorIds } } },
  });
  await prisma.objetivoVendedorMes.deleteMany({
    where: { empresaId, vendedorId: { in: vendedorIds } },
  });
  await prisma.comunicado.deleteMany({
    where: { empresaId, createdBy: { in: usuarioIds } },
  });
  // Orçamento criado **pela tela** sobre um cliente de demonstração não tem
  // `codigoErp`, mas prende o cliente pela FK: o critério aqui é o vendedor,
  // que cobre os dois casos. Sem isto, a segunda rodada do script morria em
  // violação de chave estrangeira ao apagar os clientes.
  await prisma.orcamentoItem.deleteMany({
    where: { orcamento: { vendedorId: { in: vendedorIds } } },
  });
  await prisma.orcamento.deleteMany({
    where: { empresaId, vendedorId: { in: vendedorIds } },
  });
  await prisma.tituloReceber.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  // O XML cai junto com a nota (cascade); os itens, não.
  await prisma.notaSaidaItem.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.notaSaida.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.clienteCnae.deleteMany({
    where: { cliente: { codigoErp: { startsWith: PREFIXO } } },
  });
  // Contato do cliente cai junto com o cliente (cascade no schema).
  await prisma.cliente.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.estoque.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.tabelaPrecoItem.deleteMany({
    where: { tabelaPreco: { codigoErp: { startsWith: PREFIXO } } },
  });
  await prisma.tabelaPreco.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.produto.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.contaBancaria.deleteMany({
    where: { empresaId, descricao: DESCRICAO_CONTA },
  });
  await prisma.condicaoPagamento.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.armazem.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.categoria.deleteMany({
    where: { empresaId, codigoErp: { startsWith: PREFIXO } },
  });
  await prisma.vendedor.deleteMany({ where: { id: { in: vendedorIds } } });
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
