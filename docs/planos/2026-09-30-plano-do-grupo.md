# Plano contratado pelo grupo econômico

Decisões do usuário: o grupo contrata **um plano**; o administrador pode criar
empresas dentro da quantidade contratada. Usuários pertencem ao grupo e recebem
acesso explícito às empresas selecionadas no cadastro, com um único login.

## Uso

- Em Plataforma → Planos, configurar **Empresas permitidas no grupo** (mínimo 1).
- Em Plataforma → Grupos econômicos, selecionar o grupo e configurar seu plano,
  situação, ciclo e mensalidade. A aba de assinatura de uma empresa também
  edita este mesmo contrato, deixando essa abrangência explícita na tela.
- Administração → Grupo econômico mostra o plano e a quantidade utilizada.
- O Admin da Empresa cria empresas sempre no próprio grupo. A empresa nova
  herda situação e limite de usuários do plano, sem nova assinatura ou cobrança.
- Criação e inclusão de empresa existente conferem a cota no servidor.
  Todas as empresas não excluídas contam, inclusive suspensas/canceladas.
  A plataforma pode fazer ajustes administrativos fora da cota.
- Se o plano for reduzido, as empresas existentes não são apagadas; novas
  inclusões ficam bloqueadas até adequar o grupo ou ampliar a contratação.
- Tirar uma empresa do grupo cria um grupo próprio **sem contrato** e suspende
  seu acesso até a plataforma configurar o novo plano, preservando os dados.

## Implementação

`planos.limiteEmpresas` é obrigatório, com padrão 1. `assinaturas.grupoEconomicoId`
é único. `empresaId` na assinatura passa a ser opcional e permanece apenas como
referência histórica das contratações anteriores. Leituras de recursos e menus
consultam o plano pelo grupo, não pela empresa de origem da assinatura.
MRR e listagem de assinaturas consideram somente os contratos atuais dos grupos.
Consultar assinatura inexistente retorna null; não cria plano gratuito implícito.

O teto é conferido sob bloqueio `FOR UPDATE` no grupo, na mesma transação de
criação da empresa. Assim, duas requisições simultâneas não usam a mesma vaga.
Alterar o contrato também bloqueia o grupo e aplica sua situação e limite de
usuários às empresas. Os dados comerciais mantêm o isolamento por empresa/RLS.
O limite de usuários continua por empresa, como já funcionava anteriormente.

## Migração e implantação

Aplicar `20260930190000_plano_empresas_grupo` antes de publicar a API.
Não foi aplicada automaticamente ao banco de desenvolvimento/produção.

A migração mantém todos os contratos antigos. Para grupos com várias assinaturas,
escolhe primeiro uma ativa, depois em teste e, dentro da prioridade, a mais antiga.
As excedentes ficam com `grupoEconomicoId` nulo, preservadas como histórico e
excluídas da cobrança/MRR corrente. **Revisar o contrato escolhido por grupo e
os limites antes de publicar**, especialmente onde existiam planos diferentes.
Planos existentes recebem limite 1; isso não remove empresas nem bloqueia as
já existentes, mas impede ampliar grupos acima da cota até ajustar o plano.

Não há nova tabela com `empresaId`. Assinaturas continuam sendo catálogo global
de cobrança acessível administrativamente apenas pela plataforma.

## Verificação

Testes cobrem última vaga, teto atingido, bloqueio antes da contagem, contratos
inativos/ausentes, inclusão de empresas existentes, plano reduzido, criação no
grupo do ator, campos privilegiados ignorados e contrato único compartilhado.
Os testes de bloqueio verificam a ordem/SQL; a concorrência real depende de
homologação com PostgreSQL após aplicar a migration.
