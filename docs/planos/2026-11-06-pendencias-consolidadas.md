| D6 | **FEITO 06/11:** `ceps/consulta` com limite próprio (30/min), cache do ViaCEP vence em 180 dias (se o ViaCEP cair, vale o cache) e CEP excluído volta ao cache | código || D5 | Etapas 28/29: **feito 06/11** — regra do ERP só leitura (403 + selo "ERP") e **bloqueio de excluir regra em uso** (categoria/produto/item de tabela, 409 com contagem). Faltam só: trava para regra padrão e para código. **Não dar `chave` à regra criada na tela** | código || D4 | **FEITO 06/11:** unicidade das 5 globais — código repetido dá 409 (antes 500) e recriar sobre excluído reativa a linha (`cadastros/unicidade.ts`) | código || D5 | Etapas 28/29: **trava de regra do ERP feita 06/11** (API 403 + lista com selo "ERP", só "Ver"). Faltam: bloquear excluir regra em uso, trava para padrão e código. **Não dar `chave` à regra criada na tela** (é o que a distingue do ERP) | código || D3 | **FEITO 06/11:** `PlatformAdminGuard` em criar/editar/excluir de estados, municípios, países, CEPs e CNAEs (leitura segue liberada). Falta, se quiser, tirar cadastrar/editar/excluir dos perfis de empresa (migration + catálogo) e esconder os botões na tela | código || D2 | **DECIDIDO 06/11:** a tela edita/exclui só regra criada nela; regra do ERP (com `chave`) só no ERP | — || D1 | **DECIDIDO 06/11: sim** — escrita nas 5 tabelas globais só da plataforma | — |# Pendências consolidadas — 2026-11-06

Índice do que está aberto em `docs/planos/` e nas notas de estado. **Este arquivo não
substitui os planos de origem**: o detalhe e o histórico ficam lá. Aqui ficam o
inventário, a classificação (quem destrava) e a ordem sugerida. Cada item é tratado
individualmente; ao fechar um, marque aqui **e** no plano de origem.

Legenda — **Quem destrava:** `código` (posso fazer sozinho) · `decisão` (depende de
resposta do usuário) · `Protheus` (compilar/rodar no ERP, pelo usuário) · `deploy` ·
`conferência` (o usuário olha a tela).

Foco declarado em 27/10: ERP + ferramentas + relatórios para vender mais. Portal do Cliente
fica para depois (grupo F).

---

## A. Publicação (bloqueia levar tudo a produção)

Nada do trabalho de segurança (28/10) nem da plataforma multicliente foi publicado.

| # | Item | Quem | Origem |
|---|------|------|--------|
| A1 | Criar `PARAMETROS_CRYPTO_KEY` na stack antes do deploy (SMTP_SENHA/SMS_TOKEN cifrados) | deploy | memória `parametros_crypto_key_pendente` |
| A2 | Validar o que a auditoria de segurança mudou antes do deploy (riscos aceitos listados na nota) | código + conferência | memória `seguranca_estado_2026_10_28` |
| A3 | Publicar as imagens (`publish.ps1`) e redeploy; a migration roda no boot da API | deploy | `2026-09-22-chave-integracao.md:169` |
| A4 | Imagens Docker: nome neutro (`plataforma-*`), tag de versão, repositório privado (SEC-17) | decisão + deploy | `2026-10-27-imagens-docker-nome-e-privacidade.md` |

## B. Integração com o ERP — chave e `codigoErp` (núcleo do foco)

| # | Item | Quem | Origem |
|---|------|------|--------|
| B1 | Compilar BJPLA002, BJPLA003 e BJPLA004 no Protheus e reenviar tudo | Protheus | `chave-integracao:171` |
| B2 | Teste da parte 1 (Protheus → plataforma), por entidade: categorias/subcategorias; vendedores (recompilar/reenviar); regras de desconto, condições, armazéns, produtos, clientes, fornecedores; tabela de preço; estoque; notas e títulos | Protheus + conferência | `chave-integracao:200-217` |
| B3 | Teste de exclusão de item de tabela de preço e de incluir+excluir entre duas coletas | Protheus | `chave-integracao:218-221` |
| B4 | Parte 2 (plataforma → Protheus): pedido gerado do orçamento, chaves do SC5/SC6; `vincular` nunca foi testado de ponta a ponta | código + Protheus | `chave-integracao:225` |
| B5 | Fontes do ERP: `codigoErp` de cada mapeador no lugar de `R_E_C_N_O_` (BJIN120/BJIN110) | Protheus (fontes em `C:\VPS\protheusrcg`) | `integracao-codigo-erp.md:291` |
| B6 | Exclusões: chave do `DELETE` igual à do envio (BJIN130) | Protheus | `integracao-codigo-erp.md:296` |
| B7 | Vínculo do pedido gerado: `SC5->(Recno())` → `C5_NUM` (BJIN210) | Protheus | `integracao-codigo-erp.md:300` |
| B8 | Motor: remover o "POST → 409 → PATCH" (BJIN002) | Protheus | `integracao-codigo-erp.md:303` |
| B9 | README da integração (seções codigoLegado, fallback, cobertura) | código | `integracao-codigo-erp.md:306` |
| B10 | Campo "Integração" na visualização do registro (fora do escopo anterior) | código | `chave-integracao:174` |

Observação: B5–B8 e B1 são o mesmo pacote do lado Protheus; vale tratar juntos.

## C. Correções da integração (achados do Reversa)

Etapas 1–2, 4–5, 7–8, 10–14 já feitas. Faltam:

| # | Item | Quem | Origem |
|---|------|------|--------|
| C1 | ~~**Etapa 3** — `arquivo/exportar`~~ **FEITO 2026-11-06:** retirado (envio é por API; `codigoErp` é informativo, controle pelo ID da plataforma) | — | `correcoes-integracao-reversa:81` |
| C2 | ~~**Etapa 6** — `resolverContaBancaria`~~ **FECHADO 06/11:** mantém o cadastro automático da conta; sem mudança | — | `:84` |
| C3 | **Etapa 9** — cliente novo da plataforma → ERP: **API pronta 06/11** (fila `incluir` + `aplicada` com chave/codigoErp, 203 testes); falta aplicar a migration em dev, conferir e o BJPLA004 (usuário). `2026-11-06-cliente-novo-id-codigoerp.md` | Protheus (BJPLA004) | `:87` |
| C4 | **Etapa 15** — `tsc` + suíte da API e validar em dev (recriar o container da API) | código | `:95` |

## D. Cadastros (achados do Reversa, etapas 26–32)

| # | Item | Quem |
|---|------|------|
| D1 | Decisão C.1: escrita nas 5 tabelas globais (estados, municípios, países, CEPs, CNAEs) só da plataforma? Conferir antes quais perfis têm `editar`/`excluir` | decisão |
| D2 | Decisão C.2: regra de desconto vinda do ERP — a tela pode editar? | decisão |
| D3 | Etapa 26: restringir a escrita das globais (guard, ou migration + catálogo para o seed não devolver) | código (após D1) |
| D4 | Etapa 27: unicidade — conferir antes de criar, 409 claro, recriar excluído reativa a linha | código |
| D5 | Etapas 28/29: regra de desconto — bloquear excluir em uso, trava para padrão e código, `chave` na regra criada pela tela | código (após D2) |
| D6 | Etapa 30: limite próprio de `ceps/consulta` e validade do cache de CEP | código |
| D7 | Etapa 31: permissão de relatório em categorias, `limpar` nos campos obrigatórios | código |
| D8 | Etapa 32: testes do módulo | código |

## E. WhatsApp e equipe

| # | Item | Quem | Origem |
|---|------|------|--------|
| E1 | Achados do Reversa de 15/10: triagem IA não é chamada desde `d7d3205`; vínculo automático por 8 dígitos libera boleto | decisão | memória `whatsapp_achados_reversa_2026_10_15` |
| E2 | WhatsApp do vendedor: sino, orçamento, governança; duas decisões pendentes | decisão | memória `whatsapp_vendedor_estado` |
| E3 | WhatsApp da instância do usuário: limitar ao que a EvoGo oferece | código | memória `whatsapp_instancia_do_usuario` |
| E4 | Acompanhamento da equipe: conferir a tela; tempo médio de primeira resposta usa média | conferência | `2026-10-27-acompanhamento-equipe.md` |
| E5 | Roteiro semanal: questionário com ~24 caixas sem resposta; sem isso não há o que codar | decisão | `2026-10-16-questionario-roteiro-semanal.md` |

## F. Portal do Cliente (adiado por decisão de 27/10)

Etapas 16–25 de `2026-10-16-correcoes-integracao-reversa.md`. Antes de qualquer código,
quatro decisões: **P.1** trava de desconto na aprovação do cliente · **P.2** escopo do
portal (fazer ou tirar do catálogo as rotinas e opções) · **P.3** o que `observacao`
guarda · **P.4** tela de administração e troca de senha.

## G. Conferência visual e outros

| # | Item | Quem |
|---|------|------|
| G1 | Comodato: conferir as telas (nenhum equipamento tem aplicável cadastrado ainda) | conferência |
| G2 | Comodato → ERP: definir em que tabela do Protheus ficam os aplicáveis e criar a rotina que lê a fila; regra do equipamento que perde todos os aplicáveis | decisão + Protheus |
| G3 | Log de erros: conferência visual da tela | conferência |
| G4 | Entrar como suporte: conferência visual | conferência |
| G5 | MinIO/backup: verificado em dev, falta produção | deploy |
| G6 | WhatsApp institucional (funcionários): o que ainda não rodou de verdade | conferência |
| G7 | VPS: `crm_api` 0/1 pendente | código/deploy |
| G9 | Teste `demo-limpeza.spec.ts` **já falha** (anterior a 06/11): 5 tabelas com `empresaId` sem classificar na limpeza — `UsuarioPersonificacaoLog`, `WhatsappEtiqueta`, `WhatsappContatoEtiqueta`, `WhatsappRoteiro`, `WhatsappRoteiroItem` | código |
| G8 | **ADIADO (decisão 06/11):** movimentação dos títulos a receber (baixas: juros, multa, desconto, abatimento, conta onde o dinheiro entrou). O envio atual de títulos atende; `U_BJMAPTIT` não lê SE5/FKx. Plataforma pronta; retomar pelo Passo 1 (diagnóstico SE5) de `2026-09-25-baixas-titulo-receber.md` | Protheus |

---

## Ordem sugerida

1. **Decisões rápidas que destravam código:** C1, C2, D1, D2 (4 respostas).
2. **Código sem dependência:** C4, D4, D6, D7, B9, B10 (e D3/D5 depois das decisões).
3. **Pacote Protheus (B1, B5–B8) + testes B2/B3**, seguindo o foco em ERP.
4. **Publicação (A1–A4)** quando 2 e 3 estiverem estáveis.
5. WhatsApp (E), conferências (G) e Portal (F) conforme prioridade.

## Andamento

_(registrar aqui a data e o item ao fechar cada um)_

- 2026-11-06 — **C1** fechado: `arquivo/exportar` retirado (controller, service, guard, doc);
  165 testes da integração passam.
  - Princípio confirmado pelo usuário: **enviamos por API; o `codigoErp` é a chave que o ERP
    devolve após gravar/atualizar e é só informativo; o controle é pelo ID da plataforma.**
  - Ao tratar **C3 (cliente por PUT/carga)**: a fila `clientes/alteracoes` hoje deixa de fora
    cliente sem chave ("ainda não está na SA1"). Confirmar com o usuário como um cliente
    **novo** da plataforma chega ao ERP e como o `codigoErp` volta.
