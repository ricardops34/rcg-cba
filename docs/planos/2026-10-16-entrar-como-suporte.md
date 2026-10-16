# Entrar como suporte no ambiente do cliente (2026-10-16)

## Problema

A liberação de suporte (Administração > Suporte) existe desde antes, mas não fazia
nada (achado do Reversa, `_reversa_sdd/code-analysis.md`, módulo `suporte-acesso`):

- **não havia como o suporte entrar**: a troca de empresa exige vínculo em
  `usuario_empresas`, e a plataforma recusa vincular conta de administrador da
  plataforma a cliente;
- **o guard não fazia nada**: registrado como `APP_GUARD`, roda antes do
  `JwtAuthGuard` dos controllers, quando `request.user` ainda não existe — nenhum
  bloqueio, nenhum log (0 registros no dev e na produção);
- as exceções de caminho comparavam sem o prefixo `/api/v1`.

## Decisões

- **Do usuário (2026-10-16):** a entrada é um **botão "Entrar como suporte"** em
  Plataforma > Empresas, que só funciona com a liberação do cliente vigente.
- Do Claude (ajustar se o usuário discordar):
  - **Sem vínculo.** A sessão de suporte é um token com a marca da concessão
    (`suporte` no JWT); nada é gravado em `usuario_empresas` — não ocupa vaga do
    limite de usuários, não aparece na lista de usuários do cliente e não fere a
    regra "uma conta é de um grupo só".
  - **Poderes:** os do perfil da conta (Administrador da Plataforma, que é
    `sistemaBase`), dentro do que o plano e os módulos do cliente liberam. Toda
    requisição da sessão vai para o log que o cliente lê.
  - **Duração:** até o `validoAte` da liberação. A revogação vale **na hora**:
    cada requisição confere a concessão; a renovação do token também.
  - **Sair:** o aviso amarelo de suporte ganha "Sair do ambiente do cliente",
    que volta para a empresa da plataforma (troca de empresa comum).
  - **Log:** campos com cara de senha/token no corpo vão mascarados.

## Etapas

- [x] 1. API: `POST /auth/suporte/:empresaId` (entrar; ficou em `auth` por ser
      emissão de token, como a troca de empresa) e `GET /plataforma/empresas/:id/suporte`
      (liberação vigente), registrando a entrada
- [x] 2. API: refresh e `me()` reconhecem a sessão de suporte
- [x] 3. API: o bloqueio e o log passam a rodar depois da autenticação
      (interceptor), com a concessão conferida a cada requisição e senha mascarada
- [x] 4. API: `conceder` validado pelo contrato; histórico e log com permissão
- [x] 5. Web: botão na empresa e aviso com "Sair"
- [x] 6. Testes, validação no dev e runbook

## Achados no caminho

- **Não havia menu** para a tela de liberação: o cliente não chegava nela. Entrou
  no catálogo, com a migration `20261016100000_menu_suporte_acesso`.
- As rotas pediam `empresa.editar`, código que **não existe** no catálogo (é
  `empresas`): só administrador passava. Agora é a rotina `suporte-acesso`.
- **O log do suporte não abria para o cliente** ("Inconsistent query result"):
  quem agiu é de outro grupo econômico e `usuarios` tem RLS por grupo. Nunca
  apareceu porque nunca houve log. O nome passa a vir em modo sistema.
- Conceder agora é uma transação só; revogar o que já está encerrado dá 409.

## Validação em dev (2026-10-16)

Migration aplicada e catálogo sincronizado (comandos do runbook). Roteiro de
ponta a ponta com tokens de dev de um administrador da plataforma e de um
administrador de cliente (CUIABA DISTRIBUIDORA):

1. sem liberação: `POST /auth/suporte` → 403;
2. `conceder` com `duracaoHoras: "1"` → 1 h; com 500 → 400 (limite de 72 h);
3. a plataforma vê a liberação e entra; o token leva `suporte` e a empresa do
   cliente; `me()` traz `suporte` com o prazo;
4. uma ação (`GET /clientes`) vai para o log; a renovação mantém a sessão;
5. o cliente lê o log com o nome de quem atuou;
6. revogada, a ação seguinte → 403, `/auth/me` segue (sem `suporte`), revogar de
   novo → 409, e a troca para a empresa da plataforma funciona.

Os registros do teste foram apagados depois. Falta a conferência visual das
telas (botão, faixa e menu) no navegador.
