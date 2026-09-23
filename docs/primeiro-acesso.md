# Primeiro acesso e dados do perfil

Após trocar a senha provisória, quando exigido, e aceitar os termos vigentes,
o usuário confirma nome, telefone celular com DDD e data de nascimento.
Os três campos são obrigatórios. A fotografia é opcional: o usuário pode
escolher um dos avatares corporativos da plataforma ou enviar uma imagem
própria. Uma foto existente é preservada e pode ser substituída posteriormente
em Meu perfil.

- Nome e fotografia pertencem à conta (`usuarios`).
- Telefone celular e nascimento usam os campos existentes do cadastro
  do usuário na empresa ativa (`usuario_empresas.telefone` e `dataNascimento`).
- Ao confirmar, nome, telefone e nascimento são sincronizados com os vendedores
  vinculados ao usuário na empresa ativa, apenas nos campos diferentes.
  A fotografia pertence ao usuário associado, sem cópia em vendedores.
- O aviso de aniversariantes do início usa usuários e vínculos ativos da
  empresa, incluindo usuários que não são vendedores. Exibe nome, dia e mês,
  sem divulgar o ano de nascimento.
- A conclusão é persistida em `usuarios.primeiroAcessoConcluidoEm`. Reabrir a
  sessão antes de concluir mantém a etapa pendente. O marco só libera o acesso
  quando nome, telefone e nascimento também continuam válidos; assim, cadastros
  antigos que foram preservados pela migration, mas estão incompletos, passam
  pela confirmação uma vez.

## API e implantação

`PATCH /auth/me/primeiro-acesso` recebe `nome`, `telefoneInstitucional` e
`dataNascimento` (`YYYY-MM-DD`). O usuário e a empresa vêm da sessão autenticada.
O salvamento e a sincronização ocorrem na mesma transação com contexto RLS.

`POST /auth/me/foto` recebe multipart com campo `file`: PNG, JPEG ou WEBP de
até 2 MB. Os arquivos ficam em `uploads/avatares`, no volume de uploads existente.
`PATCH /auth/me/avatar-padrao` recebe o identificador de um dos avatares
corporativos permitidos e associa o asset estático ao usuário.
`GET /auth/me` informa os dados e `mustCompleteFirstAccess`.

Aplicar a migration `20260922180000_primeiro_acesso_perfil` antes de iniciar a
nova versão da API. Ela preserva o marco dos usuários com `ultimoLogin`
preenchido, mas a API ainda solicita a confirmação quando um dos três dados
obrigatórios está ausente ou inválido. Contas sem login e contas novas também
devem confirmar os dados. Não altera as políticas RLS existentes nem cria
tabelas de negócio.
