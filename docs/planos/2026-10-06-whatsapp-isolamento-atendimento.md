# Plano: atendimento do WhatsApp isolado por empresa / instância / vendedor

> **Status (06/10/2026): implementado; migration e conferência na tela pendentes.**

## Pedido (usuário, 06/10/2026)

"As conversas estão ficando misturadas e aparecendo entre
instâncias/vendedores/empresas."

Regras ditadas na sequência:

1. O histórico de conversas da plataforma é **independente da Evolution GO**.
2. `/comercial/atendimento` lista **só** a conversa da empresa ativa, da
   instância ligada ao vendedor logado.
3. `/gerencial/whatsapp` respeita a hierarquia do usuário e é **só auditoria**:
   não interage nem altera nada nas conversas.
4. Desabilitar, limpar e excluir instância/conversas/histórico existem só em
   Administração → WhatsApp (já era assim, ver
   `2026-10-02-historico-whatsapp-gerencial.md`).

## Diagnóstico

- Gravação e listagem já separam por sessão (`whatsapp_conversas` é única por
  empresa + sessão + contato). A sessão é linha **nossa**, uma por vendedor por
  empresa; a instância da Evolution GO é só o transporte. Apagar/recriar a
  instância não toca o histórico (`onDelete: Restrict`).
- **O atendimento abria a equipe**: supervisor/gerente/administrador tinham um
  seletor "Conexões da equipe" e o filtro (`filtroSessao`) devolvia o time, ou
  tudo para o administrador. Somado à fila do institucional, que aparecia
  para todos, a lista misturava conversas de outros vendedores.
- **Importar contatos** aceitava qualquer `sessaoId` da empresa: quem olhava a
  conexão de outro vendedor criava conversas na sessão dele.
- **Mesmo número em duas sessões**: nada impedia. O WhatsApp aceita vários
  aparelhos vinculados, então cada instância recebe tudo e a mesma conversa
  aparece nas duas (inclusive em empresas diferentes do grupo).
- Mídia recebida era procurada só pelo `externoId`, sem a sessão: quando dois
  números da plataforma conversam entre si, o arquivo podia ir para a
  mensagem da outra sessão.
- O gerencial já estava correto: só GET, escopo `escopoHistoricoWhatsapp`
  (hierarquia, incluindo inativos).

## Decisões (usuário, 06/10/2026)

1. **Institucional não é ajustado agora.** O atendimento mostra só a
   instância do vendedor; o fluxo de triagem/direcionamento não muda (os
   indicadores do institucional mantêm o escopo antigo).
2. **Importar contatos continua**, limitado ao que a Evolution GO oferece e à
   empresa/instância/vendedor do próprio usuário — sem `sessaoId` de fora.
3. **O número do vendedor é único**: conectar um número que já está conectado
   em outra sessão (qualquer empresa) é recusado.

4. **A tela segue os direitos do usuário** e a instância fica presa a
   **empresa + usuário + vendedor + número** — e "tudo no sistema tem que
   respeitar isso", não só a tela.
5. **Limitar os recursos ao que a Evolution GO oferece**
   (github.com/evolution-foundation/evolution-go). Frente separada, a seguir.

## Implementação (06/10/2026)

- **Regra única** `sessaoDoUsuarioWhere` (`escopo-whatsapp.ts`): empresa ativa,
  `tipo = vendedor`, vendedor ativo do usuário **e** `usuarioId` da sessão =
  usuário logado. Nenhum perfil alarga — nem administrador, nem
  `whatsapp-equipe`. Teste em `escopo-whatsapp.spec.ts`.
- Quem passa por ela: `filtroSessao` (lista, leitura, envio, ações, vincular,
  marcar lida, sino), `ehDono`, `minha`, `desconectar`, `iniciarConversa`,
  agente de IA (`filtroPara`), Posição de Cliente (detalhe e listagem).
- Agendamento: no disparo, a mensagem não sai se a instância passou a ser de
  outro usuário depois de agendada.
- O escopo antigo, de equipe, ficou como `filtroSessaoEquipe` só para os
  indicadores do institucional (decisão 1).
- Migration `20261006120000_whatsapp_sessao_usuario_numero_unico`:
  `whatsapp_sessoes.usuarioId` (backfill pelo vínculo vendedor → usuário) e
  função `whatsapp_numero_em_uso` (SECURITY DEFINER, porque a policy de
  `whatsapp_sessoes` só enxerga a empresa ativa). Devolve só ids, para não
  vazar outro cliente da plataforma.
- `registrarEstado`: número já conectado/pareando em outra sessão → remove a
  instância da Evolution GO, deixa a sessão desconectada e explica na tela.
  Vale para o número institucional também.
- `conectar` grava o usuário; instância conectada por outro usuário não é
  assumida (pede a Administração).
- `importarContatos` sem `sessaoId` de fora; `gravarArquivoRecebido` filtra
  pela sessão.
- Tela: sem seletor "Conexões da equipe"; nova conversa e responder pedem
  `whatsapp-conversas.cadastrar`; conectar, importar e vincular pedem
  `editar` — o mesmo que a API exige.
- Gerencial → Histórico do WhatsApp: conferido, já era só GET e com a
  hierarquia (`escopoHistoricoWhatsapp`, inclusive inativos). Sem mudança.

## Falta

- Aplicar a migration (ver runbook) e conferir na tela, com dois usuários.
- Efeito do backfill a observar: sessão de vendedor sem usuário vinculado fica
  com `usuarioId` nulo e some do Atendimento até alguém reconectar; a de um
  vendedor que trocou de usuário passa a ser do usuário atual (o histórico é
  do vendedor — decisão de 02/10).
