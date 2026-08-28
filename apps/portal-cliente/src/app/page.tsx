"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { Check, ChevronRight, Clock3, FileText, LogOut, ShieldCheck, X } from "lucide-react";
import { api, login, readSession, saveSession, type Session } from "@/lib/api";

type Me = {
  contato: { nome: string; email: string };
  cliente: { razaoSocial: string; nomeFantasia: string | null };
  empresa: { nomeFantasia: string; logoUrl: string | null };
};
type Orcamento = {
  id: string;
  numero: number;
  titulo: string;
  status: "enviado" | "aprovado" | "recusado" | "expirado";
  dataValidade: string | null;
  vlrTotal: number;
  vendedor: { nome: string };
  itens: { id: string; quantidade: number; vlrTotal: number; produto: { codigoErp: string; descricao: string } }[];
};

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = new Intl.DateTimeFormat("pt-BR");

export default function PortalPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => setSession(readSession()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!session) return;
    Promise.all([api<Me>("/me"), api<Orcamento[]>("/orcamentos")])
      .then(([perfil, propostas]) => {
        setMe(perfil);
        setOrcamentos(propostas);
      })
      .catch((error: Error) => {
        setErro(error.message);
        saveSession(null);
        setSession(null);
      });
  }, [session]);

  function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const nova = await login({
          empresaAlias: String(form.get("empresaAlias")),
          email: String(form.get("email")),
          senha: String(form.get("senha")),
        });
        saveSession(nova);
        setSession(nova);
      } catch (error) {
        setErro(error instanceof Error ? error.message : "Não foi possível entrar.");
      }
    });
  }

  function decidir(id: string, decisao: "aprovar" | "recusar") {
    setErro("");
    startTransition(async () => {
      try {
        await api(`/orcamentos/${id}/${decisao}`, { method: "PATCH", body: "{}" });
        const propostas = await api<Orcamento[]>("/orcamentos");
        setOrcamentos(propostas);
      } catch (error) {
        setErro(error instanceof Error ? error.message : "Não foi possível registrar a decisão.");
      }
    });
  }

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-story">
          <p className="eyebrow">Área exclusiva do cliente</p>
          <h1>Sua relação comercial, sem espera.</h1>
          <p>Consulte propostas, acompanhe documentos e registre decisões diretamente com sua fornecedora.</p>
          <div className="trust-line"><ShieldCheck size={19} /> Acesso protegido e vinculado à sua empresa</div>
        </section>
        <section className="login-panel" aria-labelledby="login-title">
          <p className="sequence">ACESSO / 01</p>
          <h2 id="login-title">Entre no portal</h2>
          <form onSubmit={entrar}>
            <label>Empresa<input name="empresaAlias" autoComplete="organization" placeholder="Alias informado pela fornecedora" required /></label>
            <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
            <label>Senha<input name="senha" type="password" autoComplete="current-password" minLength={8} required /></label>
            {erro ? <p className="error" role="alert">{erro}</p> : null}
            <button disabled={carregando}>{carregando ? "Verificando…" : "Entrar"}<ChevronRight size={18} /></button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <header>
        <div><p className="eyebrow">Portal do Cliente</p><strong>{me?.empresa.nomeFantasia ?? "Carregando…"}</strong></div>
        <button className="quiet" onClick={() => { saveSession(null); setSession(null); setMe(null); }}><LogOut size={17} /> Sair</button>
      </header>
      <section className="account-band">
        <div><span>Conta atendida</span><h1>{me?.cliente.nomeFantasia ?? me?.cliente.razaoSocial ?? "—"}</h1></div>
        <div><span>Contato autorizado</span><p>{me?.contato.nome ?? "—"}</p><small>{me?.contato.email}</small></div>
        <div><span>Propostas aguardando</span><p className="big-number">{orcamentos.filter((item) => item.status === "enviado").length}</p></div>
      </section>
      <section className="content">
        <div className="section-title"><div><p className="sequence">COMERCIAL / ORÇAMENTOS</p><h2>Propostas para sua decisão</h2></div><FileText size={27} /></div>
        {erro ? <p className="error" role="alert">{erro}</p> : null}
        <div className="proposals">
          {orcamentos.map((orcamento) => (
            <article className="proposal" key={orcamento.id}>
              <div className="proposal-head"><div><small>ORÇAMENTO #{orcamento.numero}</small><h3>{orcamento.titulo}</h3><p>{orcamento.vendedor.nome} · {orcamento.itens.length} itens</p></div><span className={`status ${orcamento.status}`}>{orcamento.status}</span></div>
              <div className="proposal-value"><strong>{dinheiro.format(orcamento.vlrTotal)}</strong><span><Clock3 size={15} /> {orcamento.dataValidade ? `Válido até ${data.format(new Date(orcamento.dataValidade))}` : "Sem validade definida"}</span></div>
              {orcamento.status === "enviado" ? <div className="actions"><button className="decline" disabled={carregando} onClick={() => decidir(orcamento.id, "recusar")}><X size={17} /> Recusar</button><button disabled={carregando} onClick={() => decidir(orcamento.id, "aprovar")}><Check size={17} /> Aprovar e enviar</button></div> : null}
            </article>
          ))}
          {!orcamentos.length && me ? <div className="empty"><FileText size={30} /><h3>Nenhuma proposta disponível</h3><p>Os orçamentos enviados pela equipe comercial aparecerão aqui.</p></div> : null}
        </div>
      </section>
    </main>
  );
}
