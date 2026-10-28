# Imagens Docker: nome neutro, versão e repositório privado

**Situação: anotado para fazer depois** (decisão do usuário, 27/10/2026). Nada
disto foi feito. Antes dele vêm a validação no dev e a publicação da stack
variável, do cookie de sessão e da imagem única do web (ver o runbook, "Imagem
única e um domínio por cliente").

## Por que anotar e não fazer agora

O usuário está no meio de uma mudança grande (stack por variável, cookie de
sessão, imagem única). Trocar o nome das imagens junto somaria uma terceira
variável: se algo falhar na VPS, seria difícil saber a causa. O nome não traz
ganho funcional imediato; a privacidade das imagens, sim, e vai junto.

## O que existe hoje

- `bjsoftware/rcgcba-api:latest` e `bjsoftware/rcgcba-web:latest`, só com a tag
  `latest` (`publish.ps1:137-144`, `docker/stack.rcgcba.prod.yml`).
- Outras imagens com o mesmo prefixo: `rcgcba-scripts` (seed e migrations, no
  runbook) e `rcgcba-portal-cliente` (`docker/stack.portal-cliente.yml`).
- **As duas imagens são públicas** (verificado em 27/10/2026: `pull` anônimo
  responde HTTP 200). Achado SEC-17 do relatório de segurança.
- Nenhum código lê o nome da imagem. Os aliases de rede `rcgcba-api` e
  `rcgcba-web` são outra coisa (nomes internos que a Evolution GO pode usar) e
  **não mudam** por causa disto.

## Problemas de deixar como está

1. A marca dos dois primeiros clientes fica no nome de um repositório público.
2. Só `latest`: não há versão anterior identificável, então o rollback "voltar a
   imagem anterior" do runbook não tem como ser executado.
3. O produto compilado (API e web, com as migrations) é baixável por qualquer
   pessoa.

## O que fazer (em duas partes independentes)

**Parte A — barata, sem trocar o nome (pode ir antes):**

1. `publish.ps1` publica também uma **tag de versão** (ex.: `2026.10.27-1`) além
   de `latest`.
2. A stack lê a imagem de variáveis: `API_IMAGE` e `WEB_IMAGE`, com padrão igual
   ao atual. Voltar uma versão passa a ser mudar a variável; a troca de nome
   futura também.

**Parte B — a troca em si, num passo isolado:**

1. Nome neutro: `bjsoftware/plataforma-api`, `plataforma-web`,
   `plataforma-scripts`, `plataforma-portal-cliente` (nome a confirmar; pode ser
   o nome comercial do produto).
2. Repositórios **privados**, e a VPS autenticada no Docker Hub (credencial de
   registry no Portainer; `--with-registry-auth` no deploy do Swarm).
3. Durante a transição, o `publish.ps1` publica nos **dois nomes**; a stack só
   passa para o novo depois de validada. Aposentar o nome antigo no fim.
4. Atualizar: `publish.ps1`, as stacks, `docker/*.Dockerfile` (comentários),
   runbook (`Publicar imagens`, `rcgcba-scripts`), `docs/whatsapp/operacao.md`,
   `apps/portal-cliente/README.md`.

## Riscos da Parte B, e como se evitam

| Risco | Consequência | Como evitar |
|---|---|---|
| Repositório novo nasce **privado** | A VPS não baixa a imagem (hoje puxa as públicas sem login) e o deploy falha | Cadastrar o login do Docker Hub no Portainer **antes** |
| Repositório novo não existe | O push do `publish.ps1` falha | Criar no Docker Hub antes |
| Stack ainda aponta para o nome antigo | O deploy segue com a imagem velha, sem aviso | Publicar nos dois nomes na transição |
| Esquecer a imagem de scripts ou do portal | Seed ou portal ficam sem imagem | Trocar tudo de uma vez, pela lista acima |
| Rollback | Com só `latest` não há versão para voltar | Parte A (tag de versão) antes |

## Decisões pendentes (do usuário)

1. Onde hospedar as imagens: Docker Hub privado ou outro registry.
2. O nome novo (`plataforma-*` ou o nome comercial do produto).
3. Quando fazer: depois da validação e da publicação da stack variável.

## Andamento (28/10/2026)

O usuário criou no Docker Hub os repositórios `bjsoftware/plataforma-api`,
`plataforma-web` e `plataforma-portal-cliente` (decisões 1 e 2: Docker Hub, nome
`plataforma-*`). **Feito no repositório** (ainda não publicado):

- `publish.ps1` publica API e web **nos dois nomes** (`plataforma-*` e `rcgcba-*`),
  cada um com `latest` e uma tag de versão `yyyy.MM.dd-HHmm` (Parte A + transição).
- A stack lê `API_IMAGE` e `WEB_IMAGE`, com padrão no nome antigo: nada muda na VPS
  até a variável ser definida.

**Falta:** (1) conferir se os repositórios novos são privados e, se forem,
cadastrar o login do Docker Hub no Portainer antes de apontar a stack; (2) rodar o
`publish.ps1`; (3) trocar `API_IMAGE`/`WEB_IMAGE` para o nome novo e validar;
(4) imagens `plataforma-scripts` e `plataforma-portal-cliente` (a stack do portal e o
runbook ainda usam `rcgcba-*`); (5) aposentar o nome antigo.

**Decisão (28/10/2026): repositórios públicos por enquanto.** Sem login na VPS; a
privacidade (SEC-17) fica para quando houver plano pago ou outro registry (então:
credencial no Portainer + `--with-registry-auth`, sem mudar código). Também feito:
`publish.ps1 -Target scripts` (imagem `plataforma-scripts`), a stack do portal e o
README dele com o nome `plataforma-portal-cliente`, e o runbook ("Publicar imagens").
O portal não entra no `publish.ps1` (o build leva a URL da API dele como argumento).
