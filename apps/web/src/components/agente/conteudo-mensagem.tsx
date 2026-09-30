import { Fragment, memo } from "react";

/** Formatação limitada, renderizada como texto React; nunca interpreta HTML ou links. */
function Inline({ texto }: { texto: string }) {
  return <>{texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**")
      ? <strong key={i}>{parte.slice(2, -2)}</strong>
      : <Fragment key={i}>{parte}</Fragment>)}</>;
}

const celulas = (linha: string) => linha.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const separador = (linha: string) => linha.includes("|") && celulas(linha).every((c) => /^:?-{3,}:?$/.test(c));

export const ConteudoMensagem = memo(function ConteudoMensagem({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const iniciaTabela = (i: number) => linhas[i].includes("|") && i + 1 < linhas.length && separador(linhas[i + 1]) && celulas(linhas[i]).length === celulas(linhas[i + 1]).length;
  const blocos = [];
  for (let i = 0; i < linhas.length;) {
    if (iniciaTabela(i)) {
      const inicio = i;
      const cabecalho = celulas(linhas[i]);
      const alinhamentos = celulas(linhas[i + 1]);
      const rows: string[][] = [];
      i += 2;
      while (i < linhas.length && linhas[i].trim() && linhas[i].includes("|") && celulas(linhas[i]).length === cabecalho.length) rows.push(celulas(linhas[i++]));
      const alinhamento = (coluna: number) => alinhamentos[coluna]?.endsWith(":") ? "text-right" : "text-left";
      blocos.push(<div key={inicio} className="my-2 max-w-full overflow-x-auto" role="region" aria-label="Tabela da resposta" tabIndex={0}>
        <table className="w-full border-collapse text-xs"><thead><tr>{cabecalho.map((c, j) => <th scope="col" key={j} className={`border-b p-2 font-semibold ${alinhamento(j)}`}><Inline texto={c} /></th>)}</tr></thead>
          <tbody>{rows.map((row, r) => <tr key={r}>{row.map((c, j) => <td key={j} className={`border-b border-border/50 p-2 tabular-nums ${alinhamento(j)}`}><Inline texto={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>);
    } else {
      const inicio = i++;
      while (i < linhas.length && !iniciaTabela(i)) i++;
      blocos.push(<div key={inicio} className="whitespace-pre-wrap break-words"><Inline texto={linhas.slice(inicio, i).join("\n")} /></div>);
    }
  }
  return <>{blocos}</>;
});
