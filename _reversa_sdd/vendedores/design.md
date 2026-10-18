# vendedores — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `vendedores`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll — GET /vendedores` | ``vendedores.visualizar`` | `filtros `ativo`, `tipo`, `vinculo`, `usaDashboard`, `desligado`, `superiorId`; busca nome/código/e-mail; `clientesAtivos`/`clientesInativos` por linha` | 200 OK |
| `findOne — GET /:id` | ``visualizar`` | `404 se excluído` | 200 OK |
| `create — POST` | ``cadastrar`` | ``''` → null; `desligado` espelha `ativo`; com `usuarioId`, grava o WhatsApp do usuário` | 200 OK |
| `update — PATCH /:id` | ``editar`` | `barra ciclo de hierarquia; espelha `desligado`; regrava o WhatsApp do usuário quando muda telefone ou usuário` | 200 OK |
| `remove — DELETE /:id` | ``excluir`` | `soft delete + `ativo=false`` | 200 OK |
| `criarUsuario — POST /:id/criar-usuario` | ``editar`` | `§3.3` | 200 OK |
| `reenviarSenha — POST /:id/reenviar-senha` | ``editar`` | `nova senha provisória, histórico de senha, destrava tentativas` | 200 OK |
| `bloquear / desbloquear — PATCH /:id/(des)bloquear` | ``vendedores.bloquear`` | ``ativo` do vendedor **e** do usuário vinculado` | 200 OK |

## Fluxo Principal

### 1. 3.1 `desligado` como controle de saída, `ativo` como espelho

`espelharDesligado`: quando a gravação traz `desligado`, `ativo = !desligado` — os selects
do sistema filtram por `ativo`. Gravar só `ativo` (ex.: integração, bloquear) continua
valendo enquanto `desligado` não vier junto. Consequência: `bloquear` deixa
`ativo=false` com `desligado=false` (estado "bloqueado, não desligado").

### 2. 3.2 Hierarquia sem ciclo

`garantirHierarquiaSemCiclo` (só no `update`): recusa ser superior de si mesmo e sobe a
cadeia a partir do superior escolhido até 50 degraus; se encontrar o próprio cadastro,
400 "Hierarquia circular". O teto evita laço infinito se já existir ciclo gravado. No
`create` não há verificação — um cadastro novo ainda não pode estar acima de ninguém.

### 3. 3.3 Criação do usuário de acesso

Na transação (timeout 15 s): vendedor sem usuário e com e-mail; e-mail livre na **base
inteira** (`withSistema` — e-mail é login único global); perfil "Vendedor" do grupo da
empresa, senão o da plataforma (`orderBy grupoEconomicoId nulls last`); senha provisória
pela política de senha (bcrypt 12); usuário com `deveTrocarSenha`, dados copiados do
vendedor (`dadosDoVendedor`), grupo da empresa e vínculo com a empresa; liga
`vendedor.usuarioId`. **Fora** da transação: e-mail (se habilitado em Administração >
E-mail) e SMS (se habilitado em Administração > SMS, para o primeiro celular do telefone
do vendedor). A senha só volta na resposta quando **nenhum** canal entregou — o admin
repassa.

### 4. 3.4 Carteira na listagem

`groupBy(vendedorId, ativo)` nos clientes da página. Comentário PENDENTE: cliente PJ com
CNPJ baixado deveria sair da conta, falta trazer a situação cadastral do legado.

### 5. 3.5 Achados

- 🟡 **`bloquear` derruba o usuário na plataforma inteira.** `usuario.ativo=false` vale para
  todas as empresas e grupos do usuário, não só para esta empresa. E `desbloquear`
  reativa o usuário mesmo que ele estivesse inativo por outro motivo.
- 🟡 **`remove` não mexe no usuário vinculado** — vendedor excluído com usuário ativo
  continua entrando; o `bloquear` faz, o excluir não.
- 🟡 **`usuarioId` não é único** em `vendedores`: o mesmo usuário pode ficar ligado a dois
  cadastros da empresa, e `vendedorDoUsuario` (`findFirst` sem ordem) — que o agente usa
  para limitar a carteira de quem pergunta — escolhe um ao acaso. `create`/`update` não
  conferem se o usuário já é de outro vendedor.
- 🟡 `create`/`update` com `usuarioId` de outro grupo: `usuario.findUniqueOrThrow` dentro
  de `withTenant` (RLS por grupo) lança erro do Prisma, que vira 500 em vez de 404/400.
- 🟡 `reenviarSenha` informa como login o **e-mail do vendedor**; o login é o e-mail do
  **usuário**. Se os dois divergirem (e-mail trocado em um só lugar), a mensagem manda o
  login errado.
- 🟡 Documentação desatualizada: o docblock de `criarUsuario` diz que falha de e-mail
  desfaz a criação (o envio foi tirado da transação); um docblock de
  `enviarSenhaPorEmail` ficou solto acima de `enviarSenhaPorSms`.
- 🟡 Tipagem contornada com `as never` nos `data` de `create`/`update`.
- 🟡 `Promise.all` dentro da transação interativa (`findAll`).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService (withTenant, withSistema)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`PoliticaSenhaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`MailService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`EmailConfigService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`SmsService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/usuarios (gravarWhatsappDoUsuario, dadosDoVendedor)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/perfil/perfil-do-grupo`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/vendedores` | 🟢 |
| **Constante Parametrizada `SORT_FIELDS`:** ordem padrão `nome` | `apps/api/src/modules/vendedores` | 🟢 |
| **Constante Parametrizada `SALT_ROUNDS`:** bcrypt da senha provisória | `apps/api/src/modules/vendedores` | 🟢 |
| **Constante Parametrizada `timeout das transações de usuário`:** `criarUsuario`, `reenviarSenha` | `apps/api/src/modules/vendedores` | 🟢 |
| **Constante Parametrizada `Teto da subida de hierarquia`:** `garantirHierarquiaSemCiclo` | `apps/api/src/modules/vendedores` | 🟢 |
| **Constante Parametrizada `Perfil padrão`:** `criarUsuario` | `apps/api/src/modules/vendedores` | 🟢 |
| **Constante Parametrizada `E-mail / SMS de senha`:** Administração > E-mail / SMS | `apps/api/src/modules/vendedores` | 🟢 |

## Estado Interno e Entidades

- **`Vendedor`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

