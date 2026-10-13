# "Esqueci minha senha" por link de uso único

## Decisão (13/10/2026)

Até aqui o botão só mostrava "Fale com o administrador". O usuário escolheu,
pela recomendação, o **link por e-mail** em vez de mandar uma senha provisória
direto: com senha provisória, quem digitasse o e-mail de outra pessoa trocaria
a senha dela e a deixaria sem acesso até ler o e-mail. Com o link, a senha
atual vale até o link ser usado.

## Como ficou **[verificado em dev, 2026-10-13 — com o Mailhog]**

- **Pedido** (`POST /auth/senha/esqueci`, público, 5 por 15 min por IP): a
  resposta é sempre `{ ok: true }`, exista o e-mail ou não, e falha de envio
  só vai para o log — a tela não revela quem tem conta. Pedir de novo invalida
  o link anterior.
- **Link**: `<WEB_URL>/redefinir-senha?token=...` (sem `WEB_URL`, o primeiro
  `CORS_ORIGIN`, como no e-mail de acesso), uso único, **30 minutos**. O banco
  guarda só o hash do token (`senha_redefinicoes`, sem empresaId e sem RLS,
  como `refresh_tokens`).
- **E-mail**: no nome da empresa da tela de login (alias), senão da primeira
  empresa com vínculo; pelo servidor dela quando ela liberou o e-mail de
  acesso (Administração > E-mail > senha provisória), senão pelo da plataforma.
- **Senha nova** (`POST /auth/senha/redefinir`): política de senha da empresa
  e histórico de reuso, como na troca normal; desbloqueia a conta; revoga os
  refresh tokens e encerra as sessões abertas.
- **Rastro**: `senha_redefinicao_pedida` e `senha_redefinida` em
  `acessos_log` (Administração > Acessos).
- Tela: diálogo no "Esqueci minha senha" do login e a página `/redefinir-senha`.

Achado no teste: `usuario_empresas` tem RLS por empresa ou pelo próprio
usuário; sem `withUsuario` a leitura dos vínculos voltava vazia e o e-mail saía
sem a empresa. Corrigido antes do commit.
