"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  whatsappInterativoSchema,
  type WhatsappBotao,
  type WhatsappInterativo,
  type WhatsappMensagem,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TipoInterativo = WhatsappInterativo["tipo"];

const TITULOS: Record<TipoInterativo, { titulo: string; descricao: string }> = {
  botoes: {
    titulo: "Mensagem com botões",
    descricao:
      "Até 3 botões de resposta, ou botões de link, ligação e copiar. O PIX vai sozinho.",
  },
  lista: {
    titulo: "Lista de opções",
    descricao: "O cliente toca no botão e escolhe uma opção — até 10 no total.",
  },
  enquete: {
    titulo: "Enquete",
    descricao: "De 2 a 12 opções. Os votos aparecem na conversa.",
  },
  localizacao: { titulo: "Localização", descricao: "Envia um ponto no mapa." },
  contato: { titulo: "Contato", descricao: "Envia um cartão de contato (vCard)." },
  link: {
    titulo: "Link com prévia",
    descricao: "A prévia (título e imagem) é montada a partir do endereço do texto.",
  },
};

type Linha = { titulo: string; descricao: string };

/**
 * Compõe e envia uma mensagem interativa da Evolution GO.
 *
 * A validação é o mesmo `whatsappInterativoSchema` que a API aplica: o que o
 * gateway ou o WhatsApp recusam aparece aqui, antes de sair, com a mensagem
 * em português.
 */
export function MensagemInterativaDialog({
  conversaId,
  tipo,
  respondeuA,
  onOpenChange,
  onEnviada,
}: {
  conversaId: string;
  /** `null` = fechado. */
  tipo: TipoInterativo | null;
  respondeuA?: string;
  onOpenChange: (aberto: boolean) => void;
  onEnviada: () => void;
}) {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  // Campos de todos os tipos num lugar só: trocar de tipo pelo menu reabre o
  // diálogo, e o que foi digitado num não precisa sobreviver no outro.
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [rodape, setRodape] = useState("");
  const [botoes, setBotoes] = useState<WhatsappBotao[]>([
    { tipo: "resposta", texto: "" },
  ]);
  const [textoBotao, setTextoBotao] = useState("Ver opções");
  const [linhas, setLinhas] = useState<Linha[]>([{ titulo: "", descricao: "" }]);
  const [tituloSecao, setTituloSecao] = useState("Opções");
  const [opcoes, setOpcoes] = useState<string[]>(["", ""]);
  const [multipla, setMultipla] = useState(false);
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [telefone, setTelefone] = useState("");
  const [empresa, setEmpresa] = useState("");

  const limpar = () => {
    setErro(null);
    setTitulo("");
    setTexto("");
    setRodape("");
    setBotoes([{ tipo: "resposta", texto: "" }]);
    setTextoBotao("Ver opções");
    setLinhas([{ titulo: "", descricao: "" }]);
    setTituloSecao("Opções");
    setOpcoes(["", ""]);
    setMultipla(false);
    setNome("");
    setEndereco("");
    setLatitude("");
    setLongitude("");
    setTelefone("");
    setEmpresa("");
  };

  const montar = (): unknown => {
    switch (tipo) {
      case "botoes":
        return { tipo, titulo, texto, rodape, botoes };
      case "lista":
        return {
          tipo,
          titulo,
          texto,
          rodape,
          textoBotao,
          secoes: [{ titulo: tituloSecao, linhas }],
        };
      case "enquete":
        return {
          tipo,
          pergunta: texto,
          opcoes: opcoes.map((o) => o.trim()).filter(Boolean),
          maxRespostas: multipla ? 0 : 1,
        };
      case "localizacao":
        return {
          tipo,
          nome,
          endereco,
          latitude: Number(latitude.replace(",", ".")),
          longitude: Number(longitude.replace(",", ".")),
        };
      case "contato":
        return { tipo, nome, telefone: telefone.replace(/[^\d+]/g, ""), empresa };
      case "link":
        return { tipo, texto };
      default:
        return null;
    }
  };

  const enviar = useMutation({
    mutationFn: (mensagem: WhatsappInterativo) =>
      apiFetch<WhatsappMensagem>(
        `/whatsapp/conversas/${conversaId}/mensagens/interativa`,
        { method: "POST", body: { mensagem, respondeuA } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
      toast.success("Mensagem enviada");
      limpar();
      onEnviada();
      onOpenChange(false);
    },
    onError: (e) =>
      setErro(e instanceof ApiError ? e.message : "Falha ao enviar a mensagem"),
  });

  const confirmar = () => {
    const resultado = whatsappInterativoSchema.safeParse(montar());
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Revise os campos");
      return;
    }
    setErro(null);
    enviar.mutate(resultado.data);
  };

  const info = tipo ? TITULOS[tipo] : null;

  return (
    <Dialog
      open={tipo !== null}
      onOpenChange={(aberto) => {
        if (!aberto) setErro(null);
        onOpenChange(aberto);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{info?.titulo}</DialogTitle>
          <DialogDescription>{info?.descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {tipo === "botoes" || tipo === "lista" ? (
            <>
              <Campo rotulo="Título (opcional)">
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={60} />
              </Campo>
              <Campo rotulo="Texto">
                <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={1024} />
              </Campo>
              <Campo rotulo="Rodapé (opcional)">
                <Input value={rodape} onChange={(e) => setRodape(e.target.value)} maxLength={60} />
              </Campo>
            </>
          ) : null}

          {tipo === "botoes" ? (
            <EditorBotoes botoes={botoes} onChange={setBotoes} />
          ) : null}

          {tipo === "lista" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Texto do botão">
                  <Input value={textoBotao} onChange={(e) => setTextoBotao(e.target.value)} maxLength={20} />
                </Campo>
                <Campo rotulo="Título da seção">
                  <Input value={tituloSecao} onChange={(e) => setTituloSecao(e.target.value)} maxLength={24} />
                </Campo>
              </div>
              <div className="space-y-2">
                <Label>Opções</Label>
                {linhas.map((linha, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="grid flex-1 gap-1.5">
                      <Input
                        placeholder="Opção"
                        value={linha.titulo}
                        maxLength={24}
                        onChange={(e) =>
                          setLinhas(linhas.map((l, j) => (j === i ? { ...l, titulo: e.target.value } : l)))
                        }
                      />
                      <Input
                        placeholder="Descrição (opcional)"
                        value={linha.descricao}
                        maxLength={72}
                        onChange={(e) =>
                          setLinhas(linhas.map((l, j) => (j === i ? { ...l, descricao: e.target.value } : l)))
                        }
                      />
                    </div>
                    <BotaoRemover
                      desabilitado={linhas.length === 1}
                      onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={linhas.length >= 10}
                  onClick={() => setLinhas([...linhas, { titulo: "", descricao: "" }])}
                >
                  <Plus className="size-4" /> Opção
                </Button>
              </div>
            </>
          ) : null}

          {tipo === "enquete" ? (
            <>
              <Campo rotulo="Pergunta">
                <Input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={255} />
              </Campo>
              <div className="space-y-2">
                <Label>Opções</Label>
                {opcoes.map((opcao, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opcao}
                      maxLength={100}
                      placeholder={`Opção ${i + 1}`}
                      onChange={(e) => setOpcoes(opcoes.map((o, j) => (j === i ? e.target.value : o)))}
                    />
                    <BotaoRemover
                      desabilitado={opcoes.length <= 2}
                      onClick={() => setOpcoes(opcoes.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={opcoes.length >= 12}
                  onClick={() => setOpcoes([...opcoes, ""])}
                >
                  <Plus className="size-4" /> Opção
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={multipla} onChange={(e) => setMultipla(e.target.checked)} />
                Permitir marcar mais de uma opção
              </label>
            </>
          ) : null}

          {tipo === "localizacao" ? (
            <>
              <Campo rotulo="Nome do local">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} />
              </Campo>
              <Campo rotulo="Endereço">
                <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={255} />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Latitude">
                  <Input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-15.601" inputMode="decimal" />
                </Campo>
                <Campo rotulo="Longitude">
                  <Input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="-56.097" inputMode="decimal" />
                </Campo>
              </div>
            </>
          ) : null}

          {tipo === "contato" ? (
            <>
              <Campo rotulo="Nome">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} />
              </Campo>
              <Campo rotulo="Telefone (com DDI e DDD)">
                <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="5565999990000" inputMode="tel" />
              </Campo>
              <Campo rotulo="Empresa (opcional)">
                <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={100} />
              </Campo>
            </>
          ) : null}

          {tipo === "link" ? (
            <Campo rotulo="Texto com o endereço">
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                placeholder="Confira: https://..."
              />
            </Campo>
          ) : null}

          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviar.isPending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={enviar.isPending}>
            {enviar.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROTULO_BOTAO: Record<WhatsappBotao["tipo"], string> = {
  resposta: "Resposta",
  url: "Abrir link",
  ligar: "Ligar",
  copiar: "Copiar texto",
  pix: "PIX",
};

/** Um botão vazio do tipo escolhido — trocar o tipo recomeça os campos dele. */
function botaoVazio(tipo: WhatsappBotao["tipo"]): WhatsappBotao {
  switch (tipo) {
    case "resposta":
      return { tipo, texto: "" };
    case "url":
      return { tipo, texto: "", url: "" };
    case "ligar":
      return { tipo, texto: "", telefone: "" };
    case "copiar":
      return { tipo, texto: "", codigo: "" };
    case "pix":
      return { tipo, nome: "", tipoChave: "cnpj", chave: "" };
  }
}

function EditorBotoes({
  botoes,
  onChange,
}: {
  botoes: WhatsappBotao[];
  onChange: (b: WhatsappBotao[]) => void;
}) {
  const trocar = (i: number, b: WhatsappBotao) =>
    onChange(botoes.map((x, j) => (j === i ? b : x)));

  return (
    <div className="space-y-2">
      <Label>Botões</Label>
      {botoes.map((botao, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border p-2">
          <div className="flex items-center gap-2">
            <Select value={botao.tipo} onValueChange={(t) => trocar(i, botaoVazio(t as WhatsappBotao["tipo"]))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROTULO_BOTAO) as WhatsappBotao["tipo"][]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ROTULO_BOTAO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {botao.tipo !== "pix" ? (
              <Input
                placeholder="Texto do botão"
                value={botao.texto}
                maxLength={25}
                onChange={(e) => trocar(i, { ...botao, texto: e.target.value })}
              />
            ) : null}
            <BotaoRemover desabilitado={botoes.length === 1} onClick={() => onChange(botoes.filter((_, j) => j !== i))} />
          </div>
          {botao.tipo === "url" ? (
            <Input placeholder="https://" value={botao.url} onChange={(e) => trocar(i, { ...botao, url: e.target.value })} />
          ) : null}
          {botao.tipo === "ligar" ? (
            <Input
              placeholder="+5565999990000"
              value={botao.telefone}
              onChange={(e) => trocar(i, { ...botao, telefone: e.target.value.replace(/[^\d+]/g, "") })}
            />
          ) : null}
          {botao.tipo === "copiar" ? (
            <Input placeholder="Texto a copiar" value={botao.codigo} onChange={(e) => trocar(i, { ...botao, codigo: e.target.value })} />
          ) : null}
          {botao.tipo === "pix" ? (
            <div className="grid gap-1.5 sm:grid-cols-3">
              <Input placeholder="Nome do recebedor" value={botao.nome} onChange={(e) => trocar(i, { ...botao, nome: e.target.value })} />
              <Select
                value={botao.tipoChave}
                onValueChange={(v) => trocar(i, { ...botao, tipoChave: v as typeof botao.tipoChave })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cnpj">CNPJ</SelectItem>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="random">Aleatória</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Chave" value={botao.chave} onChange={(e) => trocar(i, { ...botao, chave: e.target.value })} />
            </div>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={botoes.length >= 10}
        onClick={() => onChange([...botoes, botaoVazio(botoes[0]?.tipo === "resposta" ? "resposta" : "url")])}
      >
        <Plus className="size-4" /> Botão
      </Button>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{rotulo}</Label>
      {children}
    </div>
  );
}

function BotaoRemover({ desabilitado, onClick }: { desabilitado: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={desabilitado}
      onClick={onClick}
      aria-label="Remover"
      className="shrink-0 text-muted-foreground"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
