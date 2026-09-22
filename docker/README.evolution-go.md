# Evolution GO independente na VPS

Stack: `stack.evolution-go.prod.yml`. Nome sugerido no Portainer: `evogo`.
Endereco: https://evogo.bjsoft.com.br.

## Origem da imagem

O [guia oficial de instalacao](https://docs.evolutionfoundation.com.br/evolution-go/installation)
apresenta duas opcoes: compilar o repositorio
`https://git.evoai.app/Evolution/evolution-go.git` ou usar a imagem pronta
`evoapicloud/evolution-go:latest`. Esta stack usa esse mesmo repositorio de
imagens Docker, fixado na tag `0.7.2` ja validada no projeto.

Em 2026-09-21, o endereco Git indicado retornou 404 tanto por HTTP quanto por
`git ls-remote`. Portanto, esta stack nao foi compilada a partir dele e a
correspondencia entre seu codigo e a imagem nao foi verificada. Para trocar
por um build proprio, primeiro e necessario obter acesso ao codigo, conferir
o Dockerfile e as variaveis da versao escolhida, e publicar a imagem em um
registro acessivel ao Swarm.

## Preparacao

1. Aponte o DNS `evogo.bjsoft.com.br` para a VPS.
2. O Traefik e o PostgreSQL existente devem estar na rede externa
   `network_public`. A stack usa o DNS `postgres_postgres`, seguindo a stack
   da Evolution API, e o resolver TLS `letsencryptresolver` no `websecure`.
3. No console do PostgreSQL, conectado como administrador, crie um banco e
   usuario exclusivos (substitua a senha por um segredo gerado):

   ```sql
   CREATE ROLE evogo LOGIN PASSWORD 'SUBSTITUA_PELA_SENHA_GERADA';
   CREATE DATABASE evogo OWNER evogo;
   ```

   Use essa mesma senha em `EVOLUTION_GO_POSTGRES_PASSWORD`. O usuario deve
   poder executar as migrations da Evolution GO no proprio banco.
4. Cadastre as variaveis de `.env.evolution-go.prod.example` no Portainer,
   substituindo os dois segredos, e publique o YAML como stack `evogo`.

A stack sobe somente a Evolution GO. As sessoes ficam no PostgreSQL;
inclua o banco `evogo` nos backups. Redis nao e configurado: a configuracao
da GO usada aqui nao depende dele. As variaveis `CACHE_REDIS_*` da Evolution
API sao de outro produto.

## Acesso e verificacao

- Manager: https://evogo.bjsoft.com.br/manager/login
- Swagger: https://evogo.bjsoft.com.br/swagger/index.html
- Verificacao do servidor: https://evogo.bjsoft.com.br/server/ok

No Manager, informe a URL publica e a chave `EVOLUTION_GO_API_KEY`. A versao
0.7.2 exige ativacao de licenca; ate ativar, as rotas da API respondem
`503 LICENSE_REQUIRED`. Consulte os logs do servico para verificar a conexao
com o banco e a inicializacao.

Esta stack publica o gateway por HTTPS, conforme o dominio solicitado.
Mantenha a chave administrativa restrita aos administradores.

## Relacao com a stack auxiliar

`stack.servicos.prod.yml` continua independente. Esta nova stack usa banco
`evogo` e nao reutiliza o alias `rcgcba-evolution-go`. Se a intencao for migrar
as sessoes da stack auxiliar, pare o gateway antigo antes de apontar o novo
para o mesmo banco; nunca rode os dois sobre as mesmas sessoes. Para integrar
esta stack a plataforma, configure a URL e a chave correspondentes em
Administracao > WhatsApp > Evolution GO.

Referencias: [configuracao oficial](https://github.com/evolution-foundation/evolution-go/blob/main/.env.example),
[licenciamento](https://github.com/evolution-foundation/evolution-go#license-activation)
e [validacao local da versao 0.7.2](../docs/whatsapp/integracao-evolution-go.md).
