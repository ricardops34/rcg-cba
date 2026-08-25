"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClienteCamposConfig } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

// Mesmos campos e agrupamento do formulário de Cliente (cliente-form.tsx) —
// só rótulos de exibição pra esta tela; a validação de verdade continua no
// schema de Cliente (packages/contracts/src/cliente.ts).
const GRUPOS: { legenda: string; campos: { campo: string; label: string }[] }[] = [
  {
    legenda: "Identificação",
    campos: [
      { campo: "tipoPessoa", label: "Tipo de pessoa" },
      { campo: "codigoErp", label: "Código ERP" },
      { campo: "cnpjCpf", label: "CNPJ/CPF" },
      { campo: "razaoSocial", label: "Razão social / Nome" },
      { campo: "nomeFantasia", label: "Nome fantasia" },
      { campo: "inscricaoEstadual", label: "Inscrição estadual" },
      { campo: "inscricaoMunicipal", label: "Inscrição municipal" },
      { campo: "contribuinteIcms", label: "Contribuinte ICMS" },
      { campo: "rg", label: "RG" },
      { campo: "dataNascimento", label: "Data de nascimento" },
      // Coleção, não coluna (`cliente_cnaes`), mas a pergunta é a mesma: quem
      // pode mexer? Travado aqui, a seção de CNAE do formulário fica só de
      // leitura e a API recusa vincular/remover.
      { campo: "cnaes", label: "Ramo de atividade (CNAE)" },
    ],
  },
  {
    legenda: "Contato",
    campos: [
      { campo: "contato", label: "Pessoa de contato" },
      { campo: "email", label: "E-mail" },
      { campo: "telefone", label: "Telefone" },
      { campo: "telefone2", label: "Telefone 2" },
      { campo: "celular", label: "Celular" },
      { campo: "site", label: "Site" },
    ],
  },
  {
    legenda: "Endereço",
    campos: [
      { campo: "endereco", label: "Endereço" },
      { campo: "complemento", label: "Complemento" },
      { campo: "bairro", label: "Bairro" },
      { campo: "municipio", label: "Município" },
      { campo: "uf", label: "UF" },
      { campo: "cep", label: "CEP" },
      { campo: "latitude", label: "Latitude" },
      { campo: "longitude", label: "Longitude" },
    ],
  },
  {
    legenda: "Comercial",
    campos: [
      { campo: "vendedorId", label: "Vendedor" },
      { campo: "tabelaPrecoId", label: "Tabela de preço" },
      { campo: "carteira", label: "Cliente de carteira" },
      { campo: "limiteCredito", label: "Limite de crédito" },
      { campo: "vencimentoLimite", label: "Vencimento do limite" },
      { campo: "observacao", label: "Observação" },
      { campo: "ativo", label: "Cliente ativo" },
    ],
  },
  {
    legenda: "Bloqueio",
    campos: [
      { campo: "dataBloqueio", label: "Data de bloqueio" },
      { campo: "observacaoBloqueio", label: "Motivo do bloqueio" },
      { campo: "dataReativacao", label: "Data de reativação" },
      { campo: "observacaoReativacao", label: "Observação da reativação" },
    ],
  },
];

export default function ClientesConfigPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["clientes-config"],
    queryFn: () => apiFetch<ClienteCamposConfig>("/clientes-config/campos"),
  });

  // Só guarda o que o usuário alterou nesta sessão — evita ter que
  // sincronizar estado local a partir dos dados da query via efeito.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const config: ClienteCamposConfig = { ...data, ...overrides };

  const update = useMutation({
    mutationFn: (campos: { campo: string; editavel: boolean }[]) =>
      apiFetch<ClienteCamposConfig>("/clientes-config/campos", {
        method: "PATCH",
        body: { campos },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["clientes-config"], data);
      setOverrides({});
      toast.success("Configuração de campos atualizada");
    },
  });

  const handleSave = async () => {
    const campos = Object.entries(config).map(([campo, editavel]) => ({ campo, editavel }));
    try {
      await update.mutateAsync(campos);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar configuração");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Campos do Cliente</h1>
        <p className="text-sm text-muted-foreground">
          Define quais campos do cadastro de cliente podem ser alterados na opção &quot;Alterar
          Cliente&quot;. Campos desmarcados aparecem desabilitados na tela de edição.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardContent>
          <FieldGroup>
            {GRUPOS.map((grupo) => (
              <FieldSet key={grupo.legenda}>
                <FieldLegend>{grupo.legenda}</FieldLegend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {grupo.campos.map(({ campo, label }) => (
                    <label key={campo} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={config[campo] ?? true}
                        onCheckedChange={(v) =>
                          setOverrides((prev) => ({ ...prev, [campo]: v === true }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </FieldSet>
            ))}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave} disabled={update.isPending}>
            Salvar
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
