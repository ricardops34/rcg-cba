"use client";

import { useAuthStore } from "@/stores/auth-store";
import { ChangePasswordForm } from "@/components/perfil/change-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export default function PerfilPage() {
  const { user } = useAuthStore();
  const empresaAtiva = user?.empresas.find((e) => e.empresaId === user.empresaAtivaId);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Dados da conta</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Nome</FieldLabel>
              <p className="text-sm">{user?.nome}</p>
            </Field>
            <Field>
              <FieldLabel>E-mail</FieldLabel>
              <p className="text-sm">{user?.email}</p>
            </Field>
            <Field>
              <FieldLabel>Empresa ativa</FieldLabel>
              <p className="text-sm">{empresaAtiva?.nomeFantasia}</p>
            </Field>
            <Field>
              <FieldLabel>Perfil</FieldLabel>
              <p className="text-sm">{empresaAtiva?.perfilNome}</p>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <ChangePasswordForm />
    </div>
  );
}
