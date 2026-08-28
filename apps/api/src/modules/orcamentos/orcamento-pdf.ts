import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LOGOS_DIR, PRODUTOS_DIR } from '../../common/uploads/uploads.config';

/**
 * Proposta comercial em PDF, montada no servidor.
 *
 * Antes o arquivo era gerado no navegador (`apps/web/src/lib/orcamento-pdf.ts`,
 * jsPDF). Foi trazido para cá porque o WhatsApp precisa do PDF **existindo no
 * servidor** para anexar na conversa — o vendedor não baixa e reenvia à mão. A
 * tela de orçamento passou a baixar desta mesma rota, então existe uma única
 * proposta possível: o que o cliente recebe pelo WhatsApp é byte a byte o que
 * o vendedor imprime.
 *
 * O layout é o mesmo da versão do navegador; as duas diferenças são
 * consequência de rodar fora dele:
 *
 * - **Sem canvas.** Lá o logo era redesenhado num `<canvas>` para normalizar
 *   WEBP/SVG, que o jsPDF não embute. Aqui só PNG e JPEG entram; outro formato
 *   sai sem logo, como já acontecia quando o download do logo falhava.
 * - **Decimal do Prisma** não é `number`. Quem chama converte (ver
 *   `OrcamentosService.gerarPdf`); este módulo só recebe número.
 */

const MARGEM = 14;

/** Caixa (mm) em que o logo é encaixado no cabeçalho, preservando a proporção. */
const LOGO_LARGURA = 40;
const LOGO_ALTURA = 18;

const moeda = (v: number | null | undefined) =>
  v != null
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
const numero = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—';
const dataBr = (v: Date | string | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

/** Junta partes de endereço/documento ignorando as vazias. */
const juntar = (partes: (string | null | undefined)[], separador = ' · ') =>
  partes
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(separador);

// Documento/CEP/telefone são guardados sem máscara (só dígitos) — no papel
// eles precisam sair formatados. Valor fora do tamanho esperado sai como veio.
const soDigitos = (v: string) => v.replace(/\D/g, '');
const formatarDocumento = (v: string | null | undefined) => {
  if (!v) return null;
  const d = soDigitos(v);
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v;
};
const formatarCep = (v: string | null | undefined) => {
  if (!v) return null;
  const d = soDigitos(v);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : v;
};
const formatarTelefone = (v: string | null | undefined) => {
  if (!v) return null;
  const d = soDigitos(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return v;
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  expirado: 'Expirado',
};

/** Só o que o papel precisa — deliberadamente menos do que o registro tem. */
export interface OrcamentoPdfDados {
  numero: number;
  status: string;
  createdAt: Date | string;
  dataValidade: Date | string | null;
  dataRetorno: Date | string | null;
  observacao: string | null;
  vlrTotal: number | null;
  cliente: {
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpjCpf?: string | null;
    inscricaoEstadual?: string | null;
    endereco?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
    contato?: string | null;
    telefone?: string | null;
    celular?: string | null;
    email?: string | null;
  };
  vendedor: {
    nome: string;
    nomeReduzido: string | null;
    telefone: string | null;
    email: string | null;
  };
  condicaoPagamento: { descricao: string } | null;
  itens: {
    produto: {
      codigoErp: string;
      descricao: string;
      unidade: string | null;
      fotos: { url: string; principal: boolean }[];
      exibirFotoOrcamento: boolean;
    };
    quantidade: number | null;
    vlrUnitario: number | null;
    vlrTotal: number | null;
  }[];
  empresa: {
    nomeFantasia?: string | null;
    razaoSocial?: string | null;
    cnpj?: string | null;
    inscricaoEstadual?: string | null;
    inscricaoMunicipal?: string | null;
    endereco?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
    telefone?: string | null;
    email?: string | null;
    site?: string | null;
    logoUrl?: string | null;
  } | null;
}

/**
 * Lê o logo do disco e devolve um data URL, ou `null`.
 *
 * `logoUrl` é o caminho público (`/uploads/logos/<arquivo>`); só o nome do
 * arquivo é usado para montar o caminho em disco, porque o valor vem do banco
 * e não deve poder apontar para fora de `LOGOS_DIR`.
 *
 * Falha silenciosa em qualquer ponto: sem logo o PDF sai só com o nome da
 * empresa, que é melhor do que não sair.
 */
async function carregarLogo(
  logoUrl: string,
): Promise<{ dados: string; formato: 'PNG' | 'JPEG' } | null> {
  try {
    const arquivo = basename(logoUrl);
    if (!arquivo || arquivo.startsWith('.')) return null;

    const extensao = arquivo.slice(arquivo.lastIndexOf('.')).toLowerCase();
    // WEBP e SVG são aceitos no upload do logo, mas o jsPDF não os embute e
    // aqui não há canvas para rasterizar (era o que a versão do navegador
    // fazia). Nesse caso o cabeçalho sai sem imagem.
    const formato =
      extensao === '.png'
        ? 'PNG'
        : extensao === '.jpg' || extensao === '.jpeg'
          ? 'JPEG'
          : null;
    if (!formato) return null;

    const conteudo = await readFile(join(LOGOS_DIR, arquivo));
    const mime = formato === 'PNG' ? 'image/png' : 'image/jpeg';
    return {
      dados: `data:${mime};base64,${conteudo.toString('base64')}`,
      formato,
    };
  } catch {
    return null;
  }
}

/** Monta o PDF e devolve os bytes do arquivo. */
export async function montarOrcamentoPdf(
  dados: OrcamentoPdfDados,
): Promise<Buffer> {
  const { empresa, cliente } = dados;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const fotos = await Promise.all(
    dados.itens.map(async (item) => {
      const fotoPrincipal = item.produto.fotos.find((foto) => foto.principal);
      if (!item.produto.exibirFotoOrcamento || !fotoPrincipal) return null;
      try {
        const arquivo = basename(fotoPrincipal.url);
        const ext = arquivo.slice(arquivo.lastIndexOf('.')).toLowerCase();
        const formato =
          ext === '.png'
            ? 'PNG'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'JPEG'
              : null;
        if (!formato) return null;
        const conteudo = await readFile(join(PRODUTOS_DIR, arquivo));
        return {
          dados: `data:${formato === 'PNG' ? 'image/png' : 'image/jpeg'};base64,${conteudo.toString('base64')}`,
          formato,
        } as const;
      } catch {
        return null;
      }
    }),
  );
  const incluirFotos = fotos.some(Boolean);
  let y = MARGEM;

  // --- Cabeçalho: logo + cadastro da empresa à esquerda, identificação do
  // documento à direita.
  const logo = empresa?.logoUrl ? await carregarLogo(empresa.logoUrl) : null;
  let alturaLogo = 0;
  if (logo) {
    // Mantém a proporção original dentro da caixa do cabeçalho.
    const props = doc.getImageProperties(logo.dados);
    const escala = Math.min(
      LOGO_LARGURA / props.width,
      LOGO_ALTURA / props.height,
    );
    alturaLogo = props.height * escala;
    doc.addImage(
      logo.dados,
      logo.formato,
      MARGEM,
      y,
      props.width * escala,
      alturaLogo,
    );
  }

  doc.setFont('helvetica', 'bold').setFontSize(16);
  doc.text('ORÇAMENTO', larguraPagina - MARGEM, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text(
    [
      `Nº ${dados.numero}`,
      `Emissão: ${dataBr(dados.createdAt)}`,
      `Status: ${STATUS_LABEL[dados.status] ?? dados.status}`,
    ].join('\n'),
    larguraPagina - MARGEM,
    y + 11,
    { align: 'right' },
  );

  // Bloco da empresa: abaixo do logo, limitado à largura que sobra antes do
  // bloco da direita (Nº/emissão/status) pra não haver sobreposição.
  let yEmpresa = y + (logo ? alturaLogo + 5 : 5);
  const larguraEmpresa = larguraPagina - MARGEM * 2 - 50;
  const titulo = empresa?.nomeFantasia || empresa?.razaoSocial;
  if (titulo) {
    doc.setFont('helvetica', 'bold').setFontSize(12);
    doc.text(titulo, MARGEM, yEmpresa);
    yEmpresa += 5;
  }
  const linhasEmpresa = empresa
    ? [
        juntar([
          empresa.razaoSocial,
          empresa.cnpj ? `CNPJ: ${formatarDocumento(empresa.cnpj)}` : null,
          empresa.inscricaoEstadual ? `IE: ${empresa.inscricaoEstadual}` : null,
          empresa.inscricaoMunicipal
            ? `IM: ${empresa.inscricaoMunicipal}`
            : null,
        ]),
        juntar([empresa.endereco, empresa.complemento, empresa.bairro]),
        juntar([empresa.municipio, empresa.uf, formatarCep(empresa.cep)]),
        juntar([
          formatarTelefone(empresa.telefone),
          empresa.email,
          empresa.site,
        ]),
      ].filter(Boolean)
    : [];
  if (linhasEmpresa.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8);
    const quebradas = linhasEmpresa.flatMap(
      (linha) => doc.splitTextToSize(linha, larguraEmpresa) as string[],
    );
    doc.text(quebradas, MARGEM, yEmpresa);
    yEmpresa += quebradas.length * 3.6;
  }

  // O cabeçalho acaba no que for mais baixo: o bloco da direita (3 linhas) ou
  // o bloco da empresa à esquerda.
  y = Math.max(y + 22, yEmpresa);
  doc.setDrawColor(200).line(MARGEM, y, larguraPagina - MARGEM, y);
  y += 6;

  // --- Cliente
  doc.setFont('helvetica', 'bold').setFontSize(9);
  doc.text('CLIENTE', MARGEM, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal').setFontSize(9);
  const linhasCliente = [
    cliente.razaoSocial,
    juntar([
      cliente.nomeFantasia,
      cliente.cnpjCpf
        ? `CNPJ/CPF: ${formatarDocumento(cliente.cnpjCpf)}`
        : null,
      cliente.inscricaoEstadual ? `IE: ${cliente.inscricaoEstadual}` : null,
    ]),
    juntar([cliente.endereco, cliente.complemento, cliente.bairro]),
    juntar([cliente.municipio, cliente.uf, formatarCep(cliente.cep)]),
    juntar([
      cliente.contato ? `Contato: ${cliente.contato}` : null,
      formatarTelefone(cliente.telefone),
      formatarTelefone(cliente.celular),
      cliente.email,
    ]),
  ].filter(Boolean);
  doc.text(linhasCliente, MARGEM, y);
  y += linhasCliente.length * 4.2 + 4;

  // --- Condições comerciais (vendedor, pagamento, prazos)
  doc.setFont('helvetica', 'bold').setFontSize(9);
  doc.text('CONDIÇÕES', MARGEM, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal').setFontSize(9);
  const linhasCondicoes = [
    juntar([
      `Vendedor: ${dados.vendedor.nomeReduzido || dados.vendedor.nome}`,
      formatarTelefone(dados.vendedor.telefone),
      dados.vendedor.email,
    ]),
    `Condição de pagamento: ${dados.condicaoPagamento?.descricao ?? '—'}`,
    `Válido até: ${dataBr(dados.dataValidade)}    Data de retorno: ${dataBr(dados.dataRetorno)}`,
  ];
  doc.text(linhasCondicoes, MARGEM, y);
  y += linhasCondicoes.length * 4.2 + 4;

  // --- Itens (autoTable pagina sozinho quando passa da primeira folha)
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM, right: MARGEM },
    // vlrUnitario já é o preço praticado (líquido) — o desconto sobre a tabela
    // de preço é só um derivado interno, que não vai pra proposta do cliente.
    head: [
      [
        ...(incluirFotos ? ['Foto'] : []),
        'Código',
        'Produto',
        'Un.',
        'Qtd.',
        'Preço unit.',
        'Total',
      ],
    ],
    body: dados.itens.map((i) => [
      ...(incluirFotos ? [''] : []),
      i.produto.codigoErp,
      i.produto.descricao,
      i.produto.unidade ?? '—',
      numero(i.quantidade),
      moeda(i.vlrUnitario),
      moeda(i.vlrTotal),
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 1.6,
      ...(incluirFotos ? { minCellHeight: 14 } : {}),
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: 20,
      fontStyle: 'bold',
    },
    columnStyles: incluirFotos
      ? {
          0: { cellWidth: 16 },
          3: { halign: 'center' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        }
      : {
          2: { halign: 'center' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
    didDrawCell: (celula) => {
      if (
        !incluirFotos ||
        celula.section !== 'body' ||
        celula.column.index !== 0
      )
        return;
      const foto = fotos[celula.row.index];
      if (foto)
        doc.addImage(
          foto.dados,
          foto.formato,
          celula.cell.x + 1,
          celula.cell.y + 1,
          12,
          12,
        );
    },
  });
  // O autoTable grava onde a tabela terminou — daí seguimos com total/observação.
  y =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

  // Só o autoTable pagina sozinho; o que vem depois dele precisa checar se
  // ainda cabe na folha (tabela terminando no rodapé é o caso comum).
  const alturaPagina = doc.internal.pageSize.getHeight();
  const garantirEspaco = (altura: number) => {
    if (y + altura > alturaPagina - MARGEM) {
      doc.addPage();
      y = MARGEM;
    }
  };

  // --- Total
  garantirEspaco(10);
  doc.setFont('helvetica', 'bold').setFontSize(11);
  doc.text(`Total: ${moeda(dados.vlrTotal)}`, larguraPagina - MARGEM, y, {
    align: 'right',
  });
  y += 10;

  // --- Observação (só quando preenchida)
  if (dados.observacao?.trim()) {
    const linhas = doc.splitTextToSize(
      dados.observacao.trim(),
      larguraPagina - MARGEM * 2,
    ) as string[];
    garantirEspaco(4.5 + linhas.length * 4.2);
    doc.setFont('helvetica', 'bold').setFontSize(9);
    doc.text('OBSERVAÇÃO', MARGEM, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal').setFontSize(9);
    doc.text(linhas, MARGEM, y);
  }

  // --- Rodapé com paginação, em todas as folhas
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130);
    doc.text(
      `Página ${p} de ${totalPaginas}`,
      larguraPagina - MARGEM,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' },
    );
    doc.setTextColor(0);
  }

  return Buffer.from(doc.output('arraybuffer'));
}
