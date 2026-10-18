# grupos-economicos — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `grupos-economicos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `contexto(user)` | `lista grupos visíveis + empresas "disponíveis" (de outros grupos, candidatas a mover)` | `Result` | 200 OK |
| `usuarios(id, user)` | `lista contas do grupo com seus vínculos por empresa` | `Result` | 200 OK |
| `salvarUsuario(id, input, user)` | `cria usuário novo no grupo ou dá acesso a um existente, com mesmo perfil em todas as empresas do vínculo` | `Result` | 200 OK |
| `removerAcesso(id, usuarioId, empresaId, user)` | `desativa o vínculo `UsuarioEmpresa` (não apaga a conta)` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Escopo de administração (`exigirAdmin`, `empresasAdministradas`)

- Só `isAdmin` (perfil `sistemaBase`) gerencia grupos.
- Administrador da plataforma: sem restrição (`empresasAdministradas` retorna `null`).
- Administrador de empresa: só administra as empresas às quais tem vínculo ativo com
  perfil `sistemaBase` — `empresasAdministradas` retorna a lista explícita de ids.

### 2. 3.2 Recomposição de grupo (`salvar`) — a operação mais delicada do sistema

Como "toda empresa tem grupo" (invariante do domínio), incluir uma empresa num grupo é
sempre **mover** essa empresa de onde ela estava. A função:

1. Confere que só administradores da plataforma podem **criar** grupo novo.
2. Para cada empresa a incluir que não estava antes no grupo, exige que o ator administre
   essa empresa diretamente — impede "roubar" empresa de outro administrador.
3. Toda a recomposição roda em `withSistema` (modo sistema) — porque a operação atravessa
   múltiplos grupos e a RLS por grupo não permitiria ver/mover uma empresa de outro grupo
   a partir do contexto de uma única empresa ativa.
4. **Lock explícito com `SELECT ... FOR UPDATE`** no próprio grupo e em todas as empresas
   envolvidas (ordenado por id, para evitar deadlock entre duas chamadas concorrentes que
   tocam os mesmos registros em ordem diferente) — serializa recomposições concorrentes.
5. Confere vaga no plano do grupo (`garantirVagaDeEmpresa`) antes de mover empresa nova
   para dentro (exceto para admin da plataforma).
6. Para cada empresa que muda de grupo: usuários com vínculo **ativo** nela acompanham a
   empresa para o novo grupo — mas só se o `grupoEconomicoId` atual do usuário for nulo,
   o grupo de origem da empresa, ou o grupo de destino; senão lança `ConflictException`
   ("usuário vinculado a outro grupo. Revise os vínculos antes de agrupá-la") — proteção
   contra mover silenciosamente a conta de alguém que pertence a um terceiro grupo.
7. Perfis acompanham a empresa: `planejarPerfisParaGrupo`/`aplicarPerfisNoGrupo`
   (helper em `common/perfil/perfil-do-grupo`) resolve, pelo nome, o perfil equivalente
   no grupo de destino — planejado **antes** da troca de grupo (enquanto a RLS de
   `Perfil` ainda mostra o grupo de origem) e aplicado **depois**.
8. Empresa que é **removida** do grupo atual ganha um grupo próprio (novo, com o nome
   dela como descrição) e é marcada `situacao: 'suspensa'` + `testeExpiraEm: null` —
   nunca fica sem grupo.
9. Grupo de origem que ficar sem nenhuma empresa é soft-deletado.
10. Transação com timeout estendido (`20_000`ms) — operação com múltiplas idas ao banco
    por empresa envolvida.

### 3. 3.3 Perfil é do usuário, não do vínculo (`salvarUsuario`)

- Todos os vínculos informados (`input.vinculos`) devem ter o **mesmo** `perfilId` —
  reforça a decisão de 30/09/2026 de que o perfil é da conta, válido em todas as empresas
  do grupo que ela acessa.
- `validarPerfil`: perfil deve existir, pertencer ao grupo da empresa de referência
  (`garantirPerfilDoGrupo`), e só a administração da plataforma pode atribuir ou já ter
  atribuído o perfil "Administrador da Plataforma" (`administraPlataforma: true`).
- Usuário novo: e-mail único **na base inteira** (`withSistema`), valida a senha contra
  a política de **cada** empresa do vínculo, `deveTrocarSenha: true` forçado.
- Reaproveitamento de cadastro de vendedor: se já existe um `Vendedor` sem `usuarioId`
  com o mesmo e-mail em alguma das empresas do vínculo, os dados dele (nome, telefone,
  etc. via `dadosDoVendedor`) alimentam o novo usuário, e o vendedor é vinculado
  (`usuarioId`) ao final — evita duplicar identidade entre o cadastro comercial e o
  login.
- Locks explícitos (`FOR UPDATE`) no grupo e em cada empresa do vínculo, processados em
  ordem determinística (`sort` por id) — mesma proteção contra deadlock de `salvar`.
- `garantirVagaDeUsuario` só é chamado quando o vínculo **não estava ativo antes** — reativar
  um vínculo existente não deveria contar contra o teto se já contava antes 🟡 (inferido
  da condição `if (!atual?.ativo)`).

### 4. 3.4 Remoção de acesso (`removerAcesso`)

- Usuário não pode remover o próprio acesso por esta tela (proteção contra lockout
  acidental).
- `validarPerfil` é chamado de novo aqui — mesma trava: não é possível desativar o
  acesso de um Administrador da Plataforma por esta rota (só a própria plataforma).
- Ao desativar, também remove `WhatsappVinculoFuncionario` do usuário naquela empresa —
  evita vínculo de atendimento órfão apontando para quem perdeu acesso.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`PoliticaSenhaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`garantirVagaDeUsuario`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`garantirVagaDeEmpresa`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/perfil/perfil-do-grupo`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`dadosDoVendedor`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/grupos-economicos` | 🟢 |

## Estado Interno e Entidades

- **`GrupoEconomico`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

