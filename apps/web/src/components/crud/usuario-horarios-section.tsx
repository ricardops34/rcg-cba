"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DIAS_SEMANA,
  HORARIO_COMERCIAL_PADRAO,
  type UsuarioHorario,
  type UsuarioHorarios,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription } from "@/components/ui/field";
import { CalendarClock } from "lucide-react";

/** Linha da grade: o dia pode estar desmarcado (= não acessa naquele dia). */
interface LinhaDia {
  diaSemana: number;
  marcado: boolean;
  horaInicio: string;
  horaFim: string;
}

const PADRAO_INICIO = "08:00";
const PADRAO_FIM = "18:00";

function montarLinhas(horarios: UsuarioHorario[]): LinhaDia[] {
  return DIAS_SEMANA.map((dia) => {
    const cadastrado = horarios.find((h) => h.diaSemana === dia.valor);
    return {
      diaSemana: dia.valor,
      marcado: !!cadastrado,
      horaInicio: cadastrado?.horaInicio ?? PADRAO_INICIO,
      horaFim: cadastrado?.horaFim ?? PADRAO_FIM,
    };
  });
}

/**
 * Horário de trabalho do usuário (Cadastro de usuários). Com a chave ligada, o
 * sistema recusa login e derruba a sessão fora das faixas — a verificação é do
 * servidor, no fuso da operação; esta tela só cadastra.
 *
 * Vive dentro do <form> de edição do usuário, então é uma <div> com submit
 * manual (mesmo motivo do bloco de redefinir senha).
 */
export function UsuarioHorariosSection({ usuarioId }: { usuarioId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["usuarios", usuarioId, "horarios"],
    queryFn: () => apiFetch<UsuarioHorarios>(`/usuarios/${usuarioId}/horarios`),
  });

  const [restringir, setRestringir] = useState(false);
  const [linhas, setLinhas] = useState<LinhaDia[]>(() => montarLinhas([]));

  // Uma carga só, quando a consulta responde: daí em diante o estado é da
  // tela (o usuário está editando).
  const [carregado, setCarregado] = useState(false);
  useEffect(() => {
    if (!data || carregado) return;
    setRestringir(data.restringirHorario);
    setLinhas(montarLinhas(data.horarios));
    setCarregado(true);
  }, [data, carregado]);

  const alterarLinha = (diaSemana: number, mudanca: Partial<LinhaDia>) =>
    setLinhas((atual) =>
      atual.map((l) => (l.diaSemana === diaSemana ? { ...l, ...mudanca } : l)),
    );

  const aplicarComercial = () => setLinhas(montarLinhas(HORARIO_COMERCIAL_PADRAO));

  const salvar = useMutation({
    mutationFn: (body: UsuarioHorarios) =>
      apiFetch<UsuarioHorarios>(`/usuarios/${usuarioId}/horarios`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["usuarios", usuarioId, "horarios"] });
    },
  });

  const onSalvar = async () => {
    const horarios = linhas
      .filter((l) => l.marcado)
      .map(({ diaSemana, horaInicio, horaFim }) => ({ diaSemana, horaInicio, horaFim }));

    // As mesmas duas recusas do servidor, ditas antes de ir até lá.
    if (restringir && horarios.length === 0) {
      toast.error("Marque ao menos um dia de expediente para restringir o acesso.");
      return;
    }
    const invertido = horarios.find((h) => h.horaInicio >= h.horaFim);
    if (invertido) {
      const dia = DIAS_SEMANA.find((d) => d.valor === invertido.diaSemana);
      toast.error(`Em ${dia?.nome.toLowerCase()}, a hora final deve ser maior que a inicial.`);
      return;
    }

    try {
      await salvar.mutateAsync({ restringirHorario: restringir, horarios });
      toast.success(
        restringir
          ? "Horário de trabalho salvo — o acesso fora dele fica bloqueado"
          : "Restrição de horário desligada",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar o horário");
    }
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4" />
          Horário de trabalho
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            checked={restringir}
            disabled={isLoading}
            onCheckedChange={(v) => {
              setRestringir(v);
              // Ligar a restrição sem nenhum dia marcado trancaria o usuário
              // fora do sistema — já entra com a semana comercial.
              if (v && linhas.every((l) => !l.marcado)) aplicarComercial();
            }}
          />
          Restringir acesso ao expediente
        </label>
      </div>

      <FieldDescription className="pt-2">
        {restringir
          ? "O usuário só entra (e permanece) no sistema dentro das faixas marcadas, no horário de Mato Grosso do Sul. Dia desmarcado é dia sem acesso."
          : "Sem restrição: o usuário acessa a qualquer hora. Ligue a chave para limitar ao expediente."}
      </FieldDescription>

      <div className={`space-y-2 pt-3 ${restringir ? "" : "pointer-events-none opacity-50"}`}>
        {linhas.map((linha) => {
          const dia = DIAS_SEMANA.find((d) => d.valor === linha.diaSemana);
          return (
            <div key={linha.diaSemana} className="flex items-center gap-2">
              <label className="flex w-32 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={linha.marcado}
                  onCheckedChange={(v) =>
                    alterarLinha(linha.diaSemana, { marcado: v === true })
                  }
                />
                {dia?.nome}
              </label>
              <Input
                type="time"
                className="w-32"
                aria-label={`Início ${dia?.nome}`}
                value={linha.horaInicio}
                disabled={!linha.marcado}
                onChange={(e) => alterarLinha(linha.diaSemana, { horaInicio: e.target.value })}
              />
              <span className="text-sm text-muted-foreground">até</span>
              <Input
                type="time"
                className="w-32"
                aria-label={`Fim ${dia?.nome}`}
                value={linha.horaFim}
                disabled={!linha.marcado}
                onChange={(e) => alterarLinha(linha.diaSemana, { horaFim: e.target.value })}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 pt-3">
        <Button type="button" variant="outline" size="sm" onClick={aplicarComercial}>
          Seg a sex, 08:00–18:00
        </Button>
        <Button type="button" size="sm" onClick={onSalvar} disabled={salvar.isPending}>
          Salvar horário
        </Button>
      </div>
    </div>
  );
}
