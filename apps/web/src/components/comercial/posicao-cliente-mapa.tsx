"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  campoClienteTravado,
  type ClienteCamposConfig,
  type ClienteUpdateResultado,
  type PosicaoCliente,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { MapaLocal } from "@/components/mapa/mapa-local";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Aba Mapa da Posição de Cliente (20/11/2026): o cliente, a empresa e, se
 * pedido, quem está usando. Quem pode editar o cliente grava a posição na
 * hora — preencher uma vazia (ou 0/0) entra direto; trocar uma existente vira
 * solicitação (regra da API). Campo travado em Campos do Cliente não edita.
 */
export function PosicaoClienteMapa({ cliente }: { cliente: PosicaoCliente["cliente"] }) {
  const queryClient = useQueryClient();
  const podeEditarCliente = useAuthStore((s) => s.hasPermission("clientes", "editar"));
  const { data: config } = useQuery({
    queryKey: ["clientes-config"],
    queryFn: () => apiFetch<ClienteCamposConfig>("/clientes-config/campos"),
    enabled: podeEditarCliente,
  });
  const travado =
    campoClienteTravado(config, "latitude", cliente.latitude) ||
    campoClienteTravado(config, "longitude", cliente.longitude);

  const gravar = async (p: { latitude: number; longitude: number }) => {
    const resultado = await apiFetch<ClienteUpdateResultado>(`/clientes/${cliente.id}`, {
      method: "PATCH",
      body: p,
    });
    void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    toast.success(
      resultado?.aplicado === false
        ? "Posição enviada para aprovação — o cadastro só muda depois de liberada."
        : "Posição gravada",
    );
  };

  return (
    <MapaLocal
      rotulo={cliente.razaoSocial}
      latitude={cliente.latitude}
      longitude={cliente.longitude}
      endereco={{
        endereco: cliente.endereco ?? "",
        bairro: cliente.bairro,
        municipio: cliente.municipio ?? "",
        uf: cliente.uf ?? "",
        cep: cliente.cep,
      }}
      podeEditar={podeEditarCliente && !!config && !travado}
      onGravar={gravar}
    />
  );
}
