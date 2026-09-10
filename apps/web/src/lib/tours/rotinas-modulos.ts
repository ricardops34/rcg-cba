import type { TourDefinicao, TourPasso } from "./tour-tipos";
import type { AjudaRotina } from "../ajuda-rotinas";

interface RotinaGuiada {
  codigo: string;
  rota: string;
  titulo: string;
  resumo: string;
  resultado: string;
  prerequisitos?: string;
  modoRota?: "descendente";
  seletorPronto: string;
  passos: TourPasso[];
}

// O conteúdo é compartilhado entre a apresentação e a ajuda para que as
// orientações permaneçam iguais nos dois pontos de acesso.
export const ROTINAS_GUIADAS: RotinaGuiada[] = [
  {
    "codigo": "produtos",
    "rota": "/comercial/produtos",
    "titulo": "Produtos",
    "resumo": "Consulte o catálogo de produtos da empresa e abra a ficha do item.",
    "resultado": "Na ficha você consulta os dados do ERP e, conforme suas permissões, mantém fotos, campos complementares, fichas técnicas e relacionamentos.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize os registros",
        "descricao": "Use a busca para localizar registros e Atualizar para recarregar a lista."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Defina o recorte",
        "descricao": "Combine situação ativo/inativo e categoria para reduzir a lista."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Leia os resultados",
        "descricao": "Confira código, descrição, marca, categoria, unidade, último preço e status. Use a paginação e clique no produto para abrir os detalhes."
      },
      {
        "titulo": "Próximo passo",
        "descricao": "Na ficha você consulta os dados do ERP e, conforme suas permissões, mantém fotos, campos complementares, fichas técnicas e relacionamentos."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "estoque",
    "rota": "/comercial/estoque",
    "titulo": "Estoque",
    "resumo": "Consulte saldos e reservas dos produtos por armazém.",
    "resultado": "Use o detalhe para identificar onde há saldo e reservas antes de planejar o atendimento.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize os registros",
        "descricao": "Use a busca para localizar registros e Atualizar para recarregar a lista."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Defina o recorte",
        "descricao": "Escolha o armazém e a opção de produtos com saldo."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Leia os resultados",
        "descricao": "Compare saldo total, reserva total, quantidade de armazéns e última compra. Clique no produto para abrir a distribuição por armazém."
      },
      {
        "titulo": "Próximo passo",
        "descricao": "Use o detalhe para identificar onde há saldo e reservas antes de planejar o atendimento."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "notas-saida",
    "rota": "/comercial/notas-saida",
    "titulo": "Notas de Saída",
    "resumo": "Localize os documentos de saída e consulte os itens faturados.",
    "resultado": "A segunda via do DANFE depende do XML disponível. A plataforma consulta o documento existente; não emite uma nova nota fiscal.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize os registros",
        "descricao": "Use a busca para localizar registros e Atualizar para recarregar a lista."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Defina o recorte",
        "descricao": "Filtre por vendedor, ano e mês dentro do seu escopo de acesso."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Leia os resultados",
        "descricao": "Compare número e série, emissão, cliente, vendedor e valores. Clique na linha para abrir o documento."
      },
      {
        "titulo": "Próximo passo",
        "descricao": "A segunda via do DANFE depende do XML disponível. A plataforma consulta o documento existente; não emite uma nova nota fiscal."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "titulos-receber",
    "rota": "/comercial/titulos-receber",
    "titulo": "Títulos a Receber",
    "resumo": "Acompanhe vencimentos, saldos e baixas dos títulos dos clientes.",
    "resultado": "Use a segunda via de boleto quando disponível. A disponibilidade depende dos dados de cobrança e das regras de emissão; a consulta não registra uma nova cobrança.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize os registros",
        "descricao": "Use a busca para localizar registros e Atualizar para recarregar a lista."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Defina o recorte",
        "descricao": "Combine vendedor e status para localizar os títulos que precisam de acompanhamento."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Leia os resultados",
        "descricao": "Compare emissão, vencimento, valor, saldo, status e data de baixa. Clique no título para abrir os detalhes."
      },
      {
        "titulo": "Próximo passo",
        "descricao": "Use a segunda via de boleto quando disponível. A disponibilidade depende dos dados de cobrança e das regras de emissão; a consulta não registra uma nova cobrança."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "produto-detalhe",
    "rota": "/comercial/produtos",
    "titulo": "Ficha do Produto",
    "resumo": "Reúna informações comerciais e materiais de apoio do produto.",
    "resultado": "Use a ficha para apoiar a venda com informações técnicas e itens relacionados.",
    "passos": [
      {
        "seletor": "[data-tour=\"rotina\"] h1",
        "titulo": "Confirme o produto",
        "descricao": "Confira a identificação do produto antes de consultar ou alterar os complementos."
      },
      {
        "seletor": "[data-tour=\"rotina\"] [data-slot=\"card\"]",
        "titulo": "Cadastro e foto",
        "descricao": "Consulte códigos, unidade, marca e classificação. Os dados principais vêm do ERP; a edição da foto depende de permissão."
      },
      {
        "titulo": "Complementos e materiais",
        "descricao": "Os quadros da ficha reúnem campos complementares, fichas técnicas e produtos relacionados. Use as ações disponíveis conforme seu perfil."
      },
      {
        "titulo": "Similar e aplicação",
        "descricao": "Similar indica produtos substitutos nos dois sentidos. Aplicação relaciona equipamento e consumível; o vínculo pode aparecer como usado em na outra ponta."
      }
    ],
    "modoRota": "descendente",
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "estoque-detalhe",
    "rota": "/comercial/estoque",
    "titulo": "Estoque por Armazém",
    "resumo": "Confira a distribuição de estoque de um produto.",
    "resultado": "Identifique os armazéns e os saldos informados para o produto.",
    "passos": [
      {
        "seletor": "[data-tour=\"rotina\"] h1",
        "titulo": "Produto consultado",
        "descricao": "Confira a descrição para confirmar o item que está sendo analisado."
      },
      {
        "seletor": "[data-tour=\"rotina\"] [data-slot=\"card\"]",
        "titulo": "Resumo do produto",
        "descricao": "Veja código ERP, unidade, categoria e saldo total."
      },
      {
        "seletor": "[data-tour=\"rotina\"] table",
        "titulo": "Distribuição por armazém",
        "descricao": "Compare os saldos e reservas apresentados por armazém. A tela é uma consulta e não movimenta o estoque."
      }
    ],
    "modoRota": "descendente",
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "nota-saida-detalhe",
    "rota": "/comercial/notas-saida",
    "titulo": "Detalhe da Nota de Saída",
    "resumo": "Confira os dados e itens de uma nota de saída.",
    "resultado": "Use o documento para esclarecer o faturamento e os itens da venda.",
    "passos": [
      {
        "seletor": "[data-tour=\"rotina\"] h1",
        "titulo": "Identifique o documento",
        "descricao": "Confira número, série e os indicadores de situação."
      },
      {
        "seletor": "[data-tour=\"rotina\"] [data-slot=\"card\"]",
        "titulo": "Dados da nota",
        "descricao": "Consulte cliente, vendedor, emissão e valores do documento."
      },
      {
        "seletor": "[data-tour=\"rotina\"] table",
        "titulo": "Itens faturados",
        "descricao": "Confira produtos, quantidades e valores apresentados no detalhamento."
      }
    ],
    "modoRota": "descendente",
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "titulo-receber-detalhe",
    "rota": "/comercial/titulos-receber",
    "titulo": "Detalhe do Título",
    "resumo": "Confira os dados financeiros de um título a receber.",
    "resultado": "Identifique o saldo e os prazos do documento para orientar o acompanhamento.",
    "passos": [
      {
        "seletor": "[data-tour=\"rotina\"] h1",
        "titulo": "Identifique o título",
        "descricao": "Confirme número, prefixo e parcela do documento consultado."
      },
      {
        "seletor": "[data-tour=\"rotina\"] [data-slot=\"card\"]",
        "titulo": "Vencimento e composição",
        "descricao": "Consulte cliente, vendedor, forma de pagamento, datas, valor, saldo, acréscimo e decréscimo."
      },
      {
        "titulo": "Leia a situação",
        "descricao": "Compare status, saldo e data de baixa para entender a situação apresentada; esta tela não altera o título."
      }
    ],
    "modoRota": "descendente",
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "produtos-fotos",
    "rota": "/comercial/produtos/fotos",
    "titulo": "Importação de Fotos",
    "resumo": "Associe fotos ao catálogo em lote.",
    "resultado": "Revise o resultado e resolva associações pendentes para que cada imagem fique no produto correto.",
    "passos": [
      {
        "seletor": "[data-tour=\"fotos-importar\"]",
        "titulo": "Prepare a importação",
        "descricao": "Escolha o critério do nome do arquivo: código ERP, código do fornecedor ou associação manual. Selecione imagens PNG ou JPEG."
      },
      {
        "seletor": "[data-tour=\"fotos-resultados\"]",
        "titulo": "Confira os resultados",
        "descricao": "Acompanhe o resultado de cada arquivo e revise o produto associado antes de confirmar as ações disponíveis."
      },
      {
        "titulo": "Resolva as pendências",
        "descricao": "Quando a associação automática não resolver, escolha o produto manualmente. A importação altera fotos do catálogo e exige a permissão correspondente."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "produtos-fichas",
    "rota": "/comercial/produtos/fichas",
    "titulo": "Importação de Fichas Técnicas",
    "resumo": "Processe PDFs e vincule as fichas técnicas aos produtos.",
    "resultado": "Acompanhe a fila e resolva os documentos que precisam de vínculo manual.",
    "passos": [
      {
        "seletor": "[data-tour=\"fichas-importar\"]",
        "titulo": "Envie os PDFs",
        "descricao": "Selecione as fichas técnicas para processamento. O vínculo considera o conteúdo do PDF, não o nome do arquivo."
      },
      {
        "seletor": "[data-tour=\"fichas-resultados\"]",
        "titulo": "Acompanhe o processamento",
        "descricao": "Confira a situação de cada documento na fila. O processamento procura o produto pelos códigos e informações extraídas."
      },
      {
        "titulo": "Revise o vínculo",
        "descricao": "Quando nenhum produto ou mais de um corresponder ao documento, confira o conteúdo identificado e escolha o produto para o vínculo manual."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "leads",
    "rota": "/comercial/leads",
    "titulo": "Leads",
    "resumo": "Organize os contatos e interesses identificados para acompanhamento comercial.",
    "resultado": "Identifique quem precisa de contato e encaminhe o lead ao responsável quando a ação estiver disponível.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize o contato",
        "descricao": "Use a busca para encontrar o lead e atualizar a listagem."
      },
      {
        "titulo": "Filtre a situação",
        "descricao": "Use os atalhos de situação para separar novos leads dos que já avançaram no atendimento."
      },
      {
        "seletor": "[data-tour=\"rotina\"] [data-slot=\"card\"]",
        "titulo": "Leia o interesse",
        "descricao": "Os cartões mostram identificação, contato, interesse, temperatura e responsável quando houver."
      },
      {
        "titulo": "Encaminhe e acompanhe",
        "descricao": "Use as ações do cartão para abrir a conversa, entregar a um vendedor ou atualizar a situação, conforme as opções disponíveis."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "meus-atendimentos",
    "rota": "/comercial/meus-atendimentos",
    "titulo": "Meus Atendimentos",
    "resumo": "Consulte a linha do tempo de conversas, documentos, orçamentos e agenda.",
    "resultado": "Recupere o contexto das ações realizadas no período e no cliente selecionado.",
    "passos": [
      {
        "seletor": "[data-tour=\"atendimentos-filtros\"]",
        "titulo": "Escolha período e cliente",
        "descricao": "Altere o período e selecione um cliente. Quem possui acesso à equipe pode alternar entre Meus e Minha equipe."
      },
      {
        "seletor": "[data-tour=\"rotina\"] [data-slot=\"card\"]",
        "titulo": "Leia os totais",
        "descricao": "Os cartões resumem as categorias de atendimento no recorte selecionado."
      },
      {
        "seletor": "[data-tour=\"rotina\"] section",
        "titulo": "Percorra a linha do tempo",
        "descricao": "Os eventos aparecem agrupados por dia. Role a lista para carregar mais registros e confira os detalhes de cada atendimento."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "atendimento",
    "rota": "/comercial/atendimento",
    "titulo": "Atendimento",
    "resumo": "Acompanhe conversas de WhatsApp e acesse o contexto comercial do contato.",
    "resultado": "Localize uma conversa, confira o cliente e use as ações de atendimento disponíveis.",
    "passos": [
      {
        "seletor": "[data-tour=\"atendimento-conexao\"]",
        "titulo": "Prepare a conexão",
        "descricao": "Use a ação de conexão para configurar o acesso ao WhatsApp. Depois que a conexão estiver disponível, refaça o tour para conhecer a lista de conversas e a área de mensagens."
      },
      {
        "seletor": "[data-tour=\"atendimento-controles\"]",
        "titulo": "Localize e organize",
        "descricao": "Busque por contato, telefone ou cliente. As ações superiores permitem iniciar conversa e gerenciar a conexão, conforme seu acesso."
      },
      {
        "seletor": "[data-tour=\"atendimento-conversas\"]",
        "titulo": "Escolha a conversa",
        "descricao": "Use os filtros da lista e selecione o contato que deseja atender."
      },
      {
        "seletor": "[data-tour=\"atendimento-mensagens\"]",
        "titulo": "Recupere o contexto",
        "descricao": "Leia o histórico da conversa antes de responder. Em telas pequenas, navegue entre lista e conversa pelos controles disponíveis."
      },
      {
        "seletor": "[data-tour=\"atendimento-acoes\"]",
        "titulo": "Acesse os dados comerciais",
        "descricao": "Os atalhos abrem a posição do cliente e a preparação de orçamento quando disponíveis."
      },
      {
        "seletor": "[data-tour=\"atendimento-composer\"]",
        "titulo": "Prepare a resposta",
        "descricao": "Use o campo de mensagem e os recursos de composição. Confira o destinatário e o conteúdo antes de enviar."
      }
    ],
    "prerequisitos": "Tenha acesso ao Atendimento e uma conexão de WhatsApp disponível para seu usuário ou equipe. O tour não envia mensagens.",
    "seletorPronto": "[data-tour=\"atendimento-controles\"], [data-tour=\"atendimento-conexao\"]"
  },
  {
    "codigo": "oportunidades",
    "rota": "/crm/oportunidades",
    "titulo": "Oportunidades",
    "resumo": "Acompanhe a evolução das negociações no funil comercial.",
    "resultado": "Identifique as negociações que precisam avançar e abra a oportunidade para revisar seus dados.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize ou cadastre",
        "descricao": "Pesquise a negociação ou use a ação de nova oportunidade."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Recorte o funil",
        "descricao": "Filtre estágio e vendedor. Os atalhos permitem alternar registros ativos e a visão Kanban ou Lista."
      },
      {
        "seletor": "[data-tour=\"oportunidades-kanban\"]",
        "titulo": "Kanban e lista",
        "descricao": "O Kanban organiza oportunidades por estágio. A Lista apresenta os registros em tabela; abrir uma oportunidade permite revisar a negociação."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Compare negociações",
        "descricao": "Na visão de lista, confira cliente, responsável, estágio, valor e previsão de fechamento."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "atividades",
    "rota": "/crm/atividades",
    "titulo": "Atividades",
    "resumo": "Organize tarefas e acompanhamentos comerciais.",
    "resultado": "Identifique pendências e abra a atividade para atualizar os dados ou registrar sua conclusão.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Encontre ou crie uma atividade",
        "descricao": "Use a busca, atualize os registros ou abra o cadastro de nova atividade."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Priorize o acompanhamento",
        "descricao": "Combine tipo e vendedor com os atalhos de situação e conclusão disponíveis na tela."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Confira o compromisso",
        "descricao": "Compare título, tipo, responsável, cliente e vencimento. Abra o registro para consultar ou editar."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "agenda",
    "rota": "/crm/agenda",
    "titulo": "Agenda",
    "resumo": "Consulte compromissos e retornos de orçamentos no calendário.",
    "resultado": "Localize o compromisso do período e abra o registro relacionado para acompanhamento.",
    "passos": [
      {
        "seletor": "[data-tour=\"rotina\"] h1",
        "titulo": "Navegue pelos meses",
        "descricao": "Os controles ao lado do mês avançam, retornam e levam ao mês atual. Nova atividade abre o cadastro de um compromisso."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Escolha o que acompanhar",
        "descricao": "Filtre por tipo e vendedor; o atalho de pendentes ajuda a priorizar o que ainda precisa de ação."
      },
      {
        "seletor": "[data-tour=\"agenda-calendario\"]",
        "titulo": "Leia o calendário",
        "descricao": "Os itens usam cores para diferenciar tipos e situações. Selecione um compromisso para abrir o registro relacionado. No celular, siga a orientação de navegação apresentada na tela."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "atividade-novo",
    "rota": "/crm/atividades/novo",
    "titulo": "Cadastro de Atividade",
    "resumo": "Registre um compromisso com responsável, contexto e prazo.",
    "resultado": "Tenha a atividade salva com responsável e prazo para acompanhamento na Agenda.",
    "passos": [
      {
        "seletor": "[data-tour=\"atividade-form\"] [for=\"titulo\"]",
        "titulo": "Identifique a tarefa",
        "descricao": "Informe um título e selecione o tipo de atividade."
      },
      {
        "seletor": "[data-tour=\"atividade-form\"] [for=\"vendedorId\"]",
        "titulo": "Defina o responsável",
        "descricao": "Escolha o vendedor e vincule o cliente e a oportunidade quando fizerem parte do acompanhamento."
      },
      {
        "seletor": "[data-tour=\"atividade-form\"] [for=\"descricao\"]",
        "titulo": "Descreva o contexto",
        "descricao": "Registre os detalhes necessários para executar a tarefa."
      },
      {
        "seletor": "[data-tour=\"atividade-form\"] [for=\"dataVencimento\"]",
        "titulo": "Prazo e conclusão",
        "descricao": "Informe o vencimento e use os campos de conclusão quando a atividade estiver concluída. Confira também se o registro está ativo."
      },
      {
        "seletor": "[data-tour=\"form-acoes\"]",
        "titulo": "Confira e salve",
        "descricao": "Revise os dados e use a ação de salvar. Caso a gravação seja recusada, confira os campos destacados. Cancelar retorna sem gravar as alterações."
      }
    ],
    "seletorPronto": "[data-tour=\"atividade-form\"]"
  },
  {
    "codigo": "atividade-detalhe",
    "rota": "/crm/atividades",
    "titulo": "Edição de Atividade",
    "resumo": "Registre um compromisso com responsável, contexto e prazo.",
    "resultado": "Tenha a atividade salva com responsável e prazo para acompanhamento na Agenda.",
    "passos": [
      {
        "seletor": "[data-tour=\"atividade-form\"] [for=\"titulo\"]",
        "titulo": "Identifique a tarefa",
        "descricao": "Informe um título e selecione o tipo de atividade."
      },
      {
        "seletor": "[data-tour=\"atividade-form\"] [for=\"vendedorId\"]",
        "titulo": "Defina o responsável",
        "descricao": "Escolha o vendedor e vincule o cliente e a oportunidade quando fizerem parte do acompanhamento."
      },
      {
        "seletor": "[data-tour=\"atividade-form\"] [for=\"descricao\"]",
        "titulo": "Descreva o contexto",
        "descricao": "Registre os detalhes necessários para executar a tarefa."
      },
      {
        "seletor": "[data-tour=\"atividade-form\"] [for=\"dataVencimento\"]",
        "titulo": "Prazo e conclusão",
        "descricao": "Informe o vencimento e use os campos de conclusão quando a atividade estiver concluída. Confira também se o registro está ativo."
      },
      {
        "seletor": "[data-tour=\"form-acoes\"]",
        "titulo": "Confira e salve",
        "descricao": "Revise os dados e use a ação de salvar. Caso a gravação seja recusada, confira os campos destacados. Cancelar retorna sem gravar as alterações."
      }
    ],
    "seletorPronto": "[data-tour=\"atividade-form\"]",
    "modoRota": "descendente"
  },
  {
    "codigo": "oportunidade-novo",
    "rota": "/crm/oportunidades/novo",
    "titulo": "Cadastro de Oportunidade",
    "resumo": "Registre uma negociação e acompanhe seu estágio comercial.",
    "resultado": "Tenha a negociação salva com estágio e previsão para acompanhamento no funil.",
    "passos": [
      {
        "seletor": "[data-tour=\"oportunidade-form\"] [for=\"titulo\"]",
        "titulo": "Identifique a negociação",
        "descricao": "Informe o título, cliente e vendedor responsável."
      },
      {
        "seletor": "[data-tour=\"oportunidade-form\"] [for=\"estagio\"]",
        "titulo": "Posicione no funil",
        "descricao": "Escolha o estágio atual. Os campos de fechamento e motivo da perda aparecem conforme a situação da oportunidade."
      },
      {
        "seletor": "[data-tour=\"oportunidade-form\"] [for=\"valorPrevisto\"]",
        "titulo": "Valor e previsão",
        "descricao": "Informe o valor previsto e a previsão de fechamento para apoiar o acompanhamento do funil."
      },
      {
        "seletor": "[data-tour=\"oportunidade-form\"] [for=\"observacao\"]",
        "titulo": "Guarde o contexto",
        "descricao": "Use a observação para registrar informações relevantes da negociação."
      },
      {
        "seletor": "[data-tour=\"form-acoes\"]",
        "titulo": "Confira e salve",
        "descricao": "Revise os dados e use a ação de salvar. Caso a gravação seja recusada, confira os campos destacados. Cancelar retorna sem gravar as alterações."
      }
    ],
    "seletorPronto": "[data-tour=\"oportunidade-form\"]"
  },
  {
    "codigo": "oportunidade-detalhe",
    "rota": "/crm/oportunidades",
    "titulo": "Edição de Oportunidade",
    "resumo": "Registre uma negociação e acompanhe seu estágio comercial.",
    "resultado": "Tenha a negociação salva com estágio e previsão para acompanhamento no funil.",
    "passos": [
      {
        "seletor": "[data-tour=\"oportunidade-form\"] [for=\"titulo\"]",
        "titulo": "Identifique a negociação",
        "descricao": "Informe o título, cliente e vendedor responsável."
      },
      {
        "seletor": "[data-tour=\"oportunidade-form\"] [for=\"estagio\"]",
        "titulo": "Posicione no funil",
        "descricao": "Escolha o estágio atual. Os campos de fechamento e motivo da perda aparecem conforme a situação da oportunidade."
      },
      {
        "seletor": "[data-tour=\"oportunidade-form\"] [for=\"valorPrevisto\"]",
        "titulo": "Valor e previsão",
        "descricao": "Informe o valor previsto e a previsão de fechamento para apoiar o acompanhamento do funil."
      },
      {
        "seletor": "[data-tour=\"oportunidade-form\"] [for=\"observacao\"]",
        "titulo": "Guarde o contexto",
        "descricao": "Use a observação para registrar informações relevantes da negociação."
      },
      {
        "seletor": "[data-tour=\"form-acoes\"]",
        "titulo": "Confira e salve",
        "descricao": "Revise os dados e use a ação de salvar. Caso a gravação seja recusada, confira os campos destacados. Cancelar retorna sem gravar as alterações."
      }
    ],
    "seletorPronto": "[data-tour=\"oportunidade-form\"]",
    "modoRota": "descendente"
  },
  {
    "codigo": "vendedor-novo",
    "rota": "/gerencial/vendedores/novo",
    "titulo": "Cadastro de Vendedor",
    "resumo": "Mantenha os dados e a posição da pessoa na estrutura comercial.",
    "resultado": "Tenha o cadastro e a hierarquia revisados para utilização nas rotinas comerciais.",
    "passos": [
      {
        "seletor": "[data-tour=\"vendedor-form\"] [for=\"nome\"]",
        "titulo": "Identificação e contato",
        "descricao": "Confira nome, nome reduzido, código ERP e os dados de contato."
      },
      {
        "seletor": "[data-tour=\"vendedor-form\"] [for=\"percComissao\"]",
        "titulo": "Comissão",
        "descricao": "Informe o percentual de comissão conforme a regra adotada pela empresa."
      },
      {
        "seletor": "[data-tour=\"vendedor-form\"] [for=\"usuarioId\"]",
        "titulo": "Vínculo com o acesso",
        "descricao": "Associe o usuário do sistema quando necessário. O vínculo identifica a pessoa no acesso à plataforma."
      },
      {
        "seletor": "[data-tour=\"vendedor-form\"] [for=\"superiorId\"]",
        "titulo": "Estrutura comercial",
        "descricao": "Confira o superior, o tipo e o vínculo. Esses dados organizam a hierarquia comercial."
      },
      {
        "titulo": "Participação nos indicadores",
        "descricao": "Revise as opções de ativo e uso no dashboard antes de salvar."
      },
      {
        "seletor": "[data-tour=\"form-acoes\"]",
        "titulo": "Confira e salve",
        "descricao": "Revise os dados e use a ação de salvar. Caso a gravação seja recusada, confira os campos destacados. Cancelar retorna sem gravar as alterações."
      }
    ],
    "seletorPronto": "[data-tour=\"vendedor-form\"]"
  },
  {
    "codigo": "vendedor-detalhe",
    "rota": "/gerencial/vendedores",
    "titulo": "Edição de Vendedor",
    "resumo": "Mantenha os dados e a posição da pessoa na estrutura comercial.",
    "resultado": "Tenha o cadastro e a hierarquia revisados para utilização nas rotinas comerciais.",
    "passos": [
      {
        "seletor": "[data-tour=\"vendedor-form\"] [for=\"nome\"]",
        "titulo": "Identificação e contato",
        "descricao": "Confira nome, nome reduzido, código ERP e os dados de contato."
      },
      {
        "seletor": "[data-tour=\"vendedor-form\"] [for=\"percComissao\"]",
        "titulo": "Comissão",
        "descricao": "Informe o percentual de comissão conforme a regra adotada pela empresa."
      },
      {
        "seletor": "[data-tour=\"vendedor-form\"] [for=\"usuarioId\"]",
        "titulo": "Vínculo com o acesso",
        "descricao": "Associe o usuário do sistema quando necessário. O vínculo identifica a pessoa no acesso à plataforma."
      },
      {
        "seletor": "[data-tour=\"vendedor-form\"] [for=\"superiorId\"]",
        "titulo": "Estrutura comercial",
        "descricao": "Confira o superior, o tipo e o vínculo. Esses dados organizam a hierarquia comercial."
      },
      {
        "titulo": "Participação nos indicadores",
        "descricao": "Revise as opções de ativo e uso no dashboard antes de salvar."
      },
      {
        "seletor": "[data-tour=\"form-acoes\"]",
        "titulo": "Confira e salve",
        "descricao": "Revise os dados e use a ação de salvar. Caso a gravação seja recusada, confira os campos destacados. Cancelar retorna sem gravar as alterações."
      }
    ],
    "seletorPronto": "[data-tour=\"vendedor-form\"]",
    "modoRota": "descendente"
  },
  {
    "codigo": "objetivo-novo",
    "rota": "/gerencial/objetivos/novo",
    "titulo": "Cadastro de Objetivo",
    "resumo": "Defina metas comerciais por vendedor e competência.",
    "resultado": "Tenha as metas da competência salvas para comparação com o realizado.",
    "passos": [
      {
        "seletor": "[data-tour=\"objetivo-form\"] [for=\"vendedorId\"]",
        "titulo": "Responsável pela meta",
        "descricao": "Selecione o vendedor ao qual o objetivo será atribuído."
      },
      {
        "seletor": "[data-tour=\"objetivo-form\"] [for=\"mes\"]",
        "titulo": "Competência",
        "descricao": "Escolha o mês e o ano. Confira o período antes de salvar para não lançar a meta na competência errada."
      },
      {
        "seletor": "[data-tour=\"objetivo-form\"] [for=\"valor\"]",
        "titulo": "Valores e clientes",
        "descricao": "Preencha a meta em valor, o número de clientes e a meta de novos clientes."
      },
      {
        "titulo": "Metas por categoria",
        "descricao": "Quando disponíveis, preencha as metas por categoria para detalhar o objetivo comercial."
      },
      {
        "seletor": "[data-tour=\"form-acoes\"]",
        "titulo": "Confira e salve",
        "descricao": "Revise os dados e use a ação de salvar. Caso a gravação seja recusada, confira os campos destacados. Cancelar retorna sem gravar as alterações."
      }
    ],
    "seletorPronto": "[data-tour=\"objetivo-form\"]"
  },
  {
    "codigo": "objetivo-detalhe",
    "rota": "/gerencial/objetivos",
    "titulo": "Edição de Objetivo",
    "resumo": "Defina metas comerciais por vendedor e competência.",
    "resultado": "Tenha as metas da competência salvas para comparação com o realizado.",
    "passos": [
      {
        "seletor": "[data-tour=\"objetivo-form\"] [for=\"vendedorId\"]",
        "titulo": "Responsável pela meta",
        "descricao": "Selecione o vendedor ao qual o objetivo será atribuído."
      },
      {
        "seletor": "[data-tour=\"objetivo-form\"] [for=\"mes\"]",
        "titulo": "Competência",
        "descricao": "Escolha o mês e o ano. Confira o período antes de salvar para não lançar a meta na competência errada."
      },
      {
        "seletor": "[data-tour=\"objetivo-form\"] [for=\"valor\"]",
        "titulo": "Valores e clientes",
        "descricao": "Preencha a meta em valor, o número de clientes e a meta de novos clientes."
      },
      {
        "titulo": "Metas por categoria",
        "descricao": "Quando disponíveis, preencha as metas por categoria para detalhar o objetivo comercial."
      },
      {
        "seletor": "[data-tour=\"form-acoes\"]",
        "titulo": "Confira e salve",
        "descricao": "Revise os dados e use a ação de salvar. Caso a gravação seja recusada, confira os campos destacados. Cancelar retorna sem gravar as alterações."
      }
    ],
    "seletorPronto": "[data-tour=\"objetivo-form\"]",
    "modoRota": "descendente"
  },
  {
    "codigo": "vendedores",
    "rota": "/gerencial/vendedores",
    "titulo": "Vendedores",
    "resumo": "Consulte as pessoas que compõem a estrutura comercial.",
    "resultado": "Abra um cadastro para revisar identificação, vínculo e hierarquia.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize ou cadastre",
        "descricao": "Pesquise pelo vendedor, atualize a lista ou abra um novo cadastro."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Recorte a equipe",
        "descricao": "Combine os filtros disponíveis com as abas de tipo e a situação ativo/inativo. Confira a opção de participação no dashboard."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Confira a estrutura",
        "descricao": "Compare os dados da equipe e abra o registro para consultar a identificação e a hierarquia."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "objetivos",
    "rota": "/gerencial/objetivos",
    "titulo": "Objetivos",
    "resumo": "Consulte metas comerciais de vendedores por mês e ano.",
    "resultado": "Identifique as metas da competência e abra um objetivo para revisão.",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize ou cadastre",
        "descricao": "Use a busca, atualize a lista ou cadastre um objetivo."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Selecione a competência",
        "descricao": "Filtre por vendedor, mês e ano e confira a situação ativo/inativo."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Compare as metas",
        "descricao": "Consulte os objetivos cadastrados e abra um registro para conferir os valores."
      },
      {
        "titulo": "Copie com atenção ao período",
        "descricao": "A ação de copiar objetivos permite reaproveitar metas. Confira origem, destino e opções apresentadas no diálogo antes de confirmar."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "dashboard-gerencial",
    "rota": "/gerencial/dashboard",
    "titulo": "Dashboard Gerencial",
    "resumo": "Compare metas e resultados da equipe dentro do seu escopo de acesso.",
    "resultado": "Identifique desvios de desempenho e abra os detalhes disponíveis para investigar.",
    "passos": [
      {
        "seletor": "[data-tour=\"gerencial-parametros\"]",
        "titulo": "Defina os parâmetros",
        "descricao": "Escolha período, vendedor e a opção de mostrar valores. Clique em Aplicar para usar o novo recorte."
      },
      {
        "seletor": "[data-tour=\"gerencial-indicadores\"]",
        "titulo": "Leia os indicadores",
        "descricao": "Os cartões resumem os resultados do período. Indicadores com ação abrem o detalhamento correspondente."
      },
      {
        "seletor": "[data-tour=\"gerencial-equipe\"]",
        "titulo": "Compare a equipe",
        "descricao": "Confira a apuração por vendedor e os indicadores de atingimento. Abra os detalhes disponíveis para entender a composição."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]"
  },
  {
    "codigo": "recados-equipe",
    "rota": "/gerencial/recados",
    "titulo": "Recado para a Equipe",
    "resumo": "Prepare recados de WhatsApp destinados à equipe comercial.",
    "resultado": "Revise destinatários e texto, envie ou agende quando necessário e acompanhe a situação do recado.",
    "passos": [
      {
        "seletor": "[data-tour=\"recados-equipe\"]",
        "titulo": "Selecione os destinatários",
        "descricao": "Marque as pessoas da equipe que devem receber o recado. Confira os avisos sobre destinatários sem contato disponível."
      },
      {
        "seletor": "[data-tour=\"recados-mensagem\"]",
        "titulo": "Escreva o recado",
        "descricao": "Preencha a mensagem e, se desejar, a data e hora para enviar depois. Confira o conteúdo e os destinatários antes de confirmar o envio."
      },
      {
        "seletor": "[data-tour=\"recados-historico\"]",
        "titulo": "Acompanhe a entrega",
        "descricao": "Meus recados mostra a situação dos envios e eventuais falhas. Use cancelar quando a ação estiver disponível."
      }
    ],
    "seletorPronto": "[data-tour=\"rotina\"]",
    "prerequisitos": "É necessário ter permissão para recados e destinatários disponíveis no seu escopo de equipe. Os recados são para a equipe, não para clientes. O tour não envia nem agenda mensagens."
  },
  {
    "codigo": "consulta-vendas-cliente",
    "rota": "/consultas/vendas-cliente",
    "titulo": "Vendas por Cliente",
    "resumo": "Compare o resultado por cliente e por período para identificar concentração de vendas e clientes que precisam de acompanhamento.",
    "resultado": "Use a comparação para identificar variações e orientar o acompanhamento comercial. Exporte o resultado quando seu perfil permitir.",
    "seletorPronto": "[data-tour=\"consulta\"]",
    "passos": [
      {
        "seletor": "[data-tour=\"consulta-parametros\"]",
        "titulo": "Defina a análise",
        "descricao": "Abra Parâmetros, escolha o período e os filtros disponíveis e clique em Aplicar. As opções e resultados respeitam seu escopo de acesso."
      },
      {
        "seletor": "[data-tour=\"consulta-resumo\"]",
        "titulo": "Confirme o recorte",
        "descricao": "Confira o resumo dos parâmetros aplicados antes de comparar os números. A base do vendedor pode considerar o cadastro do cliente ou a nota, conforme a opção apresentada."
      },
      {
        "seletor": "[data-tour=\"consulta\"] table",
        "titulo": "Compare os resultados",
        "descricao": "Compare o resultado por cliente e por período para identificar concentração de vendas e clientes que precisam de acompanhamento. Em telas pequenas, deslize a tabela horizontalmente para ver as demais colunas."
      },
      {
        "seletor": "[data-tour=\"consulta-exportar\"]",
        "titulo": "Exporte a análise",
        "descricao": "PDF e Excel ficam disponíveis conforme a permissão de exportação desta rotina e a existência de resultados. Confira os parâmetros antes de gerar o arquivo."
      }
    ]
  },
  {
    "codigo": "consulta-vendas-produto",
    "rota": "/consultas/vendas-produto",
    "titulo": "Vendas por Produto",
    "resumo": "Compare os produtos vendidos nos períodos apresentados e identifique os itens com maior ou menor participação.",
    "resultado": "Use a comparação para identificar variações e orientar o acompanhamento comercial. Exporte o resultado quando seu perfil permitir.",
    "seletorPronto": "[data-tour=\"consulta\"]",
    "passos": [
      {
        "seletor": "[data-tour=\"consulta-parametros\"]",
        "titulo": "Defina a análise",
        "descricao": "Abra Parâmetros, escolha o período e os filtros disponíveis e clique em Aplicar. As opções e resultados respeitam seu escopo de acesso."
      },
      {
        "seletor": "[data-tour=\"consulta-resumo\"]",
        "titulo": "Confirme o recorte",
        "descricao": "Confira o resumo dos parâmetros aplicados antes de comparar os números. A base do vendedor pode considerar o cadastro do cliente ou a nota, conforme a opção apresentada."
      },
      {
        "seletor": "[data-tour=\"consulta\"] table",
        "titulo": "Compare os resultados",
        "descricao": "Compare os produtos vendidos nos períodos apresentados e identifique os itens com maior ou menor participação. Em telas pequenas, deslize a tabela horizontalmente para ver as demais colunas."
      },
      {
        "seletor": "[data-tour=\"consulta-exportar\"]",
        "titulo": "Exporte a análise",
        "descricao": "PDF e Excel ficam disponíveis conforme a permissão de exportação desta rotina e a existência de resultados. Confira os parâmetros antes de gerar o arquivo."
      }
    ]
  },
  {
    "codigo": "consulta-vendas-vendedor",
    "rota": "/consultas/vendas-vendedor",
    "titulo": "Vendas por Vendedor",
    "resumo": "Compare o resultado dos vendedores dentro da hierarquia permitida ao seu perfil.",
    "resultado": "Use a comparação para identificar variações e orientar o acompanhamento comercial. Exporte o resultado quando seu perfil permitir.",
    "seletorPronto": "[data-tour=\"consulta\"]",
    "passos": [
      {
        "seletor": "[data-tour=\"consulta-parametros\"]",
        "titulo": "Defina a análise",
        "descricao": "Abra Parâmetros, escolha o período e os filtros disponíveis e clique em Aplicar. As opções e resultados respeitam seu escopo de acesso."
      },
      {
        "seletor": "[data-tour=\"consulta-resumo\"]",
        "titulo": "Confirme o recorte",
        "descricao": "Confira o resumo dos parâmetros aplicados antes de comparar os números. A base do vendedor pode considerar o cadastro do cliente ou a nota, conforme a opção apresentada."
      },
      {
        "seletor": "[data-tour=\"consulta\"] table",
        "titulo": "Compare os resultados",
        "descricao": "Compare o resultado dos vendedores dentro da hierarquia permitida ao seu perfil. Em telas pequenas, deslize a tabela horizontalmente para ver as demais colunas."
      },
      {
        "seletor": "[data-tour=\"consulta-exportar\"]",
        "titulo": "Exporte a análise",
        "descricao": "PDF e Excel ficam disponíveis conforme a permissão de exportação desta rotina e a existência de resultados. Confira os parâmetros antes de gerar o arquivo."
      }
    ]
  },
  {
    "codigo": "consulta-vendas-categoria",
    "rota": "/consultas/vendas-categoria",
    "titulo": "Vendas por Categoria",
    "resumo": "Expanda a árvore de categoria, subcategoria e produto para investigar a composição das vendas.",
    "resultado": "Use a comparação para identificar variações e orientar o acompanhamento comercial. Exporte o resultado quando seu perfil permitir.",
    "seletorPronto": "[data-tour=\"consulta\"]",
    "passos": [
      {
        "seletor": "[data-tour=\"consulta-parametros\"]",
        "titulo": "Defina a análise",
        "descricao": "Abra Parâmetros, escolha o período e os filtros disponíveis e clique em Aplicar. As opções e resultados respeitam seu escopo de acesso."
      },
      {
        "seletor": "[data-tour=\"consulta-resumo\"]",
        "titulo": "Confirme o recorte",
        "descricao": "Confira o resumo dos parâmetros aplicados antes de comparar os números. A base do vendedor pode considerar o cadastro do cliente ou a nota, conforme a opção apresentada."
      },
      {
        "seletor": "[data-tour=\"consulta\"] table",
        "titulo": "Compare os resultados",
        "descricao": "Expanda a árvore de categoria, subcategoria e produto para investigar a composição das vendas. Em telas pequenas, deslize a tabela horizontalmente para ver as demais colunas."
      },
      {
        "seletor": "[data-tour=\"consulta-exportar\"]",
        "titulo": "Exporte a análise",
        "descricao": "PDF e Excel ficam disponíveis conforme a permissão de exportação desta rotina e a existência de resultados. Confira os parâmetros antes de gerar o arquivo."
      }
    ]
  },
  {
    "codigo": "consulta-evolucao",
    "rota": "/consultas/evolucao",
    "titulo": "Evolução Mensal",
    "resumo": "Compare a evolução dos indicadores mês a mês no intervalo escolhido e confira a base usada na apuração.",
    "resultado": "Use a comparação para identificar variações e orientar o acompanhamento comercial. Exporte o resultado quando seu perfil permitir.",
    "seletorPronto": "[data-tour=\"consulta\"]",
    "passos": [
      {
        "seletor": "[data-tour=\"consulta-parametros\"]",
        "titulo": "Defina a análise",
        "descricao": "Abra Parâmetros, escolha o período e os filtros disponíveis e clique em Aplicar. As opções e resultados respeitam seu escopo de acesso."
      },
      {
        "seletor": "[data-tour=\"consulta-resumo\"]",
        "titulo": "Confirme o recorte",
        "descricao": "Confira o resumo dos parâmetros aplicados antes de comparar os números. A base do vendedor pode considerar o cadastro do cliente ou a nota, conforme a opção apresentada."
      },
      {
        "seletor": "[data-tour=\"consulta\"] table",
        "titulo": "Compare os resultados",
        "descricao": "Compare a evolução dos indicadores mês a mês no intervalo escolhido e confira a base usada na apuração. Em telas pequenas, deslize a tabela horizontalmente para ver as demais colunas."
      },
      {
        "seletor": "[data-tour=\"consulta-exportar\"]",
        "titulo": "Exporte a análise",
        "descricao": "PDF e Excel ficam disponíveis conforme a permissão de exportação desta rotina e a existência de resultados. Confira os parâmetros antes de gerar o arquivo."
      }
    ]
  },
  {
    "codigo": "consulta-sugestao-compra",
    "rota": "/consultas/sugestao-compra",
    "titulo": "Sugestão de Compra",
    "resumo": "Acompanhe, por cliente, quando a sugestão de produtos foi calculada pela última vez.",
    "resultado": "Visualize a sugestão já calculada de um cliente ou dispare um novo cálculo, linha a linha ou em lote.",
    "seletorPronto": "[data-tour=\"rotina\"]",
    "passos": [
      {
        "seletor": "[data-tour=\"crud-busca\"]",
        "titulo": "Localize o cliente",
        "descricao": "Busque por razão social, código ou CNPJ e atualize a lista."
      },
      {
        "seletor": "[data-tour=\"crud-filtros\"]",
        "titulo": "Refine a lista",
        "descricao": "Filtre por vendedor, UF, município e clientes bloqueados — bloqueado não entra no cálculo."
      },
      {
        "seletor": "[data-tour=\"crud-lista\"]",
        "titulo": "Leia o último cálculo",
        "descricao": "A coluna \"Último cálculo\" mostra quando a sugestão de cada cliente foi gerada. Abra o menu da linha para visualizar o que já foi sugerido ou recalcular só aquele cliente."
      },
      {
        "titulo": "Calcule em lote",
        "descricao": "O botão Calcular na barra recalcula os clientes elegíveis do seu escopo, com período de referência e faixa de código opcionais. Confira o texto do diálogo: ele substitui a sugestão já gravada para cada cliente atingido."
      }
    ]
  }
];

export const TOURS_MODULOS: TourDefinicao[] = ROTINAS_GUIADAS.map((rotina) => ({
  codigo: rotina.codigo,
  versao: 1,
  rota: rotina.rota,
  modoRota: rotina.modoRota,
  seletorPronto: rotina.seletorPronto,
  passos: [
    { titulo: rotina.titulo, descricao: rotina.resumo },
    ...rotina.passos,
    {
      titulo: "Ajuda e replay",
      descricao: "Reabra este tour pela barra superior ou pelo menu da conta em telas pequenas. A ajuda contextual reúne as orientações desta rotina.",
    },
  ],
}));

export const AJUDAS_MODULOS: AjudaRotina[] = ROTINAS_GUIADAS.map((rotina) => ({
  codigo: rotina.codigo,
  rota: rotina.rota,
  modoRota: rotina.modoRota ?? "exata",
  titulo: rotina.titulo,
  resumo: rotina.resumo,
  finalidade: rotina.resumo,
  secoes: [
    {
      titulo: "Pré-requisitos",
      texto: rotina.prerequisitos ?? "É necessário ter acesso à rotina na empresa ativa. Os dados e as ações disponíveis respeitam as permissões e o escopo do seu perfil.",
    },
    ...rotina.passos.map((passo) => ({ titulo: passo.titulo, texto: passo.descricao })),
    { titulo: "Resultado esperado", texto: rotina.resultado },
  ],
}));
