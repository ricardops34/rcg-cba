# Abertura diária do agente

No primeiro acesso do dia, por usuário e empresa ativa, a janela do agente abre
com saudação, aniversário do próprio usuário, agenda, meta individual e contagem
dos avisos não lidos. Termina com “Como posso ajudar mais?”. O usuário pode
minimizar e continuar trabalhando normalmente.

Administradores e superiores também recebem metas atingidas na equipe autorizada,
quando têm acesso à ferramenta de indicadores gerenciais. Aniversariantes da
equipe exigem acesso a vendedores e seguem a mesma hierarquia comercial.
Não são exibidos idade nem ano de nascimento.

O agente e a ferramenta `meu_dia` precisam estar ativos. O resumo usa consultas
determinísticas, sem chamada automática ao provedor de IA. A apresentação não
cria uma conversa no histórico; as perguntas seguintes usam o fluxo normal do chat.

O dia segue o fuso operacional já utilizado pela agenda (`America/Campo_Grande`).
A janela verifica novamente ao retornar à aba e na virada do dia. O recibo é
confirmado no servidor após a mensagem ser entregue à janela; falhas na consulta
não registram leitura. Web Locks serializa abas do mesmo navegador. Dois dispositivos
abertos simultaneamente antes da confirmação ainda podem apresentar o mesmo resumo.

Aplicar a migration `20260930210000_agente_resumo_diario` no deploy. A tabela guarda
somente a última data apresentada por usuário/empresa, tem RLS e é acessada por
`withTenant`. Não há armazenamento adicional dos dados comerciais do resumo.
