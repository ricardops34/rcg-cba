/**
 * A ficha da empresa como a IA a recebe.
 *
 * **Por que existe:** o cadastro já tinha endereço, telefone, e-mail, site e
 * horário de atendimento, e nada disso chegava à IA. Quem quisesse que ela
 * soubesse o endereço precisava redigitá-lo no texto livre de Administração >
 * WhatsApp — e então havia dois endereços, que divergiam no dia em que a
 * empresa mudasse de sala e alguém atualizasse só um.
 *
 * Aqui a fonte é o cadastro. O texto livre continua existindo para o que não
 * cabe em campo (política de troca, condição especial), e vai **depois** desta
 * ficha no prompt.
 *
 * Campo vazio simplesmente não aparece: uma ficha com "Telefone: não informado"
 * ensina a IA a dizer que a empresa não tem telefone.
 */

const DIAS = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

export interface DadosDaEmpresa {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string | null;
  endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  telefone2: string | null;
  email: string | null;
  email2: string | null;
  site: string | null;
  fundadaEm: Date | null;
  historia: string | null;
  segmentos: string | null;
  /** `diaSemana` 0 = domingo. Um dia pode ter mais de uma faixa. */
  horarios: { diaSemana: number; horaInicio: string; horaFim: string }[];
}

/**
 * Agrupa as faixas por dia e junta dias seguidos com o mesmo horário.
 *
 * "seg a sex, 08:00–18:00" em vez de cinco linhas iguais: o prompt vai em toda
 * conversa, e cinco linhas repetidas custam em cada mensagem sem dizer nada a
 * mais.
 */
function horarioLegivel(horarios: DadosDaEmpresa['horarios']): string | null {
  if (horarios.length === 0) return null;

  const porDia = new Map<number, string[]>();
  for (const h of [...horarios].sort(
    (a, b) =>
      a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio),
  )) {
    const faixas = porDia.get(h.diaSemana) ?? [];
    faixas.push(`${h.horaInicio}–${h.horaFim}`);
    porDia.set(h.diaSemana, faixas);
  }

  const blocos: string[] = [];
  let inicio: number | null = null;
  let anterior: number | null = null;
  let faixaAtual = '';

  const fechar = () => {
    if (inicio === null || anterior === null) return;
    const dias =
      inicio === anterior
        ? DIAS[inicio]
        : `${DIAS[inicio]} a ${DIAS[anterior]}`;
    blocos.push(`${dias}: ${faixaAtual}`);
  };

  for (let dia = 0; dia <= 6; dia++) {
    const faixas = porDia.get(dia);
    if (!faixas) {
      fechar();
      inicio = null;
      anterior = null;
      continue;
    }
    const texto = faixas.join(' e ');
    if (inicio !== null && texto === faixaAtual && anterior === dia - 1) {
      anterior = dia;
      continue;
    }
    fechar();
    inicio = dia;
    anterior = dia;
    faixaAtual = texto;
  }
  fechar();

  return blocos.join('; ');
}

/** O endereço numa linha, como se diria a alguém. */
function enderecoLegivel(e: DadosDaEmpresa): string | null {
  const rua = [e.endereco, e.complemento].filter(Boolean).join(', ');
  const cidade = [e.municipio, e.uf].filter(Boolean).join('/');
  const partes = [rua, e.bairro, cidade, e.cep].filter(Boolean);
  return partes.length ? partes.join(' — ') : null;
}

/**
 * A ficha pronta para o prompt. Devolve `null` quando não há nada preenchido
 * além do nome — nesse caso não vale gastar linhas dizendo que não se sabe
 * nada.
 */
export function fichaDaEmpresa(e: DadosDaEmpresa): string | null {
  const linhas: string[] = [];

  const push = (rotulo: string, valor: string | null | undefined) => {
    if (valor && valor.trim()) linhas.push(`- ${rotulo}: ${valor.trim()}`);
  };

  push('Razão social', e.razaoSocial);
  push('CNPJ', e.cnpj);
  push('Atuação', e.segmentos);
  if (e.fundadaEm) {
    push('No mercado desde', String(e.fundadaEm.getFullYear()));
  }
  push('Endereço', enderecoLegivel(e));
  push(
    'Telefone',
    [e.telefone, e.telefone2].filter(Boolean).join(' / ') || null,
  );
  push('E-mail', [e.email, e.email2].filter(Boolean).join(' / ') || null);
  push('Site', e.site);
  push('Horário de atendimento', horarioLegivel(e.horarios));
  push('História', e.historia);

  if (linhas.length === 0) return null;

  return [
    `DADOS DA ${e.nomeFantasia.toUpperCase()} (do cadastro — pode dizer ao cliente)`,
    ...linhas,
  ].join('\n');
}
