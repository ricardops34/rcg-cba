# Tela inicial escolhida pelo usuário

## Origem (29/09/2026)

O administrador de uma empresa tentou alterar um perfil em `/admin/perfis` e
recebeu *"Apenas administradores da plataforma podem alterar o catálogo
global"*. Não é defeito: perfis e `perfil_permissoes` são **globais**, sem
`empresaId`, e as rotas de escrita de `/perfis` passam pelo
`PlatformAdminGuard`. Se a empresa alterasse um perfil, a alteração valeria para
todos os clientes.

## Perfis por empresa — suspenso

Foi discutido tornar os perfis por empresa, com a empresa recebendo um
"espelho" dos perfis da plataforma. **O usuário suspendeu** antes da decisão
de formato: cópia independente ou espelho que continua seguindo a plataforma e
grava só as diferenças. A necessidade real era a tela inicial, tratada abaixo.

Se voltar, isto depende de perfil e precisa ser revisto: `auth.service`
(token e `/me`), `usuarios.service` (atribuição), `vendedores.service` (procura
"Vendedor" pelo nome), `plataforma.service` (criação de empresa), `seed-base`,
a trava do Diretor em `catalogo-sistema.ts` e as migrations `perm_*`, que
concedem por `sistemaBase`.

**Pendente:** a tela `/admin/perfis` ainda mostra os controles de edição para
quem não é administrador da plataforma, que só descobre o bloqueio ao salvar. A
Estrutura já trata isso escondendo os controles e mostrando um aviso.

## Rotina inicial por usuário — feito em 29/09/2026

Decisão: cada usuário escolhe a própria tela inicial, entre as rotinas a que
tem acesso. Sem escolha, vale a rotina inicial do perfil.

- **Onde fica:** `usuario_empresas.rotinaInicialId` (migration
  `20260930130000_usuario_rotina_inicial`). Fica no vínculo, não em `usuarios`,
  porque o acesso às rotinas muda de uma empresa para outra. A tabela já tem
  RLS (tenant + self), então não precisou de policy nova. `ON DELETE SET NULL`.
- **Acesso** é o mesmo critério da barra lateral: `<rotina>.visualizar`, já
  podado por módulo ou menu desligado, e o menu precisa ter rota.
- **Gravação:** `PATCH /auth/me/rotina-inicial { rotinaId | null }` recusa com
  400 a rotina que o usuário não enxerga.
- **Leitura:** o `/me` confere de novo a cada chamada. Se o usuário perdeu o
  acesso, vale a do perfil, e a gravação fica guardada: volta a valer se o
  acesso voltar. O `/me` também devolve `rotinaInicialId` e
  `rotinaInicialPerfilNome`.
- **Tela:** card "Tela inicial" em Meu perfil (`/perfil`), com uma opção por
  tela (menu com rota), não por rotina, porque as rotinas de um mesmo menu
  abrem a mesma rota.
- A rotina inicial do perfil continua existindo como padrão e só é editável
  pela plataforma.

**Migration aplicada em 30/09/2026** na base de dev, que passou a ser cópia da
produção (ver runbook, "Base de dev a partir da cópia da produção").

**Testado pela API em 30/09/2026** com `vendedor1.demo`, contra a base de dev:
grava uma tela que ele vê (200); recusa uma tela da Administração e uma rotina
inexistente (400, e a gravação anterior fica); com a gravação apontando para uma
tela sem acesso, o `/me` cai no perfil; `null` volta ao padrão.

**Falta:** a conferência visual do card em Meu perfil.
