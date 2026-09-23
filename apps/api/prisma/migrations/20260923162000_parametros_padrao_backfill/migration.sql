-- O seed não roda em produção. Insere nas empresas existentes todo o
-- catálogo de parâmetros padrão que antes era criado apenas pelo seed-base.
--
-- ON CONFLICT preserva conteúdo, tipo, status e descrição que a empresa já
-- tenha configurado. ARMAZEM_PADRAO também está na lista para manter esta
-- migration autossuficiente, mas não altera a linha criada pela migration
-- anterior.

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  p."parametro",
  p."tipo"::"TipoParametro",
  p."tamanho",
  p."conteudo",
  p."descricao",
  true,
  now(),
  now()
FROM "empresas" e
CROSS JOIN (
  VALUES
    ('ARMAZEM_PADRAO', 'texto', 30, NULL, 'Chave do armazém usada na integração de produtos quando armazemChave vier vazio'),
    ('ORCAMENTO_DIAS_VALIDADE', 'numero', 3, '30', 'Dias somados à emissão para sugerir a validade do orçamento'),
    ('DESCONTO_ACIMA_LIMITE_BLOQUEIA', 'booleano', NULL, 'false', 'Recusa a gravação do orçamento com desconto acima do limite da regra; falso apenas avisa na tela'),
    ('CONSULTA_VENDAS_BASE_VENDEDOR', 'texto', 10, 'nota', 'Vendedor considerado nas Consultas de venda: nota (quem vendeu) ou cliente (titular da carteira)'),
    ('DASHBOARD_GERENCIAL_HIERARQUIA', 'booleano', NULL, 'true', 'Agrupa o Dashboard Gerencial pela hierarquia comercial (gerente, supervisor e seus vendedores); falso mostra a lista plana'),
    ('COMISSAO_OCULTA_PARA_TODOS', 'booleano', NULL, 'false', 'Esconde os valores de comissão de todos os perfis, ignorando a permissão comissao.visualizar'),
    ('SMTP_HOST', 'texto', 120, NULL, 'Servidor de e-mail; vazio usa a configuração do servidor'),
    ('SMTP_PORTA', 'numero', 5, NULL, 'Porta do servidor de e-mail (ex.: 587)'),
    ('SMTP_SEGURO', 'booleano', NULL, 'false', 'Conexão SSL/TLS direta com o servidor de e-mail'),
    ('SMTP_USUARIO', 'texto', 120, NULL, 'Usuário de autenticação no servidor de e-mail'),
    ('SMTP_SENHA', 'senha', 120, NULL, 'Senha de autenticação no servidor de e-mail'),
    ('SMTP_REMETENTE', 'texto', 150, NULL, 'Endereço exibido como remetente dos e-mails'),
    ('SENHA_TAMANHO_MINIMO', 'numero', 2, '8', 'Mínimo de caracteres da senha'),
    ('SENHA_TAMANHO_MAXIMO', 'numero', 3, '0', 'Máximo de caracteres da senha; 0 = sem limite'),
    ('SENHA_EXIGIR_MAIUSCULA', 'booleano', NULL, 'true', 'Exige ao menos uma letra maiúscula na senha'),
    ('SENHA_EXIGIR_MINUSCULA', 'booleano', NULL, 'false', 'Exige ao menos uma letra minúscula na senha'),
    ('SENHA_EXIGIR_NUMERO', 'booleano', NULL, 'true', 'Exige ao menos um número na senha'),
    ('SENHA_EXIGIR_ESPECIAL', 'booleano', NULL, 'false', 'Exige ao menos um caractere especial na senha'),
    ('SENHA_DIAS_PARA_EXPIRAR', 'numero', 4, '0', 'Dias até a senha expirar e exigir troca; 0 = nunca expira'),
    ('SENHA_HISTORICO_QUANTIDADE', 'numero', 2, '0', 'Quantas senhas anteriores não podem ser reutilizadas; 0 = não valida'),
    ('SENHA_TENTATIVAS_ANTES_BLOQUEIO', 'numero', 2, '5', 'Tentativas de login sem sucesso antes de bloquear a conta'),
    ('SENHA_MINUTOS_BLOQUEIO', 'numero', 4, '15', 'Minutos que a conta fica bloqueada após exceder as tentativas')
) AS p("parametro", "tipo", "tamanho", "conteudo", "descricao")
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;
