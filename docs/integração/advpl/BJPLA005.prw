#Include "TOTVS.CH"
#Include "FWMVCDEF.CH"

// Sentido e status sao escritos como literal no ponto de uso, com o comentario
// na frente - quem documenta os valores e o combo do campo no SX3:
//
//    ZZ_TIPO     "S" saida (ERP -> plataforma)   "E" entrada (plataforma -> ERP)
//    ZZ_STATUS   "1" pendente         "2" executada    "3" erro
//    ZY_STATUS   "1" nao processado   "2" processado   "3" erro
//
//    MV_BJAPI11  Retencao da mensagem executada, em dias

/*/{Protheus.doc} BJPLA005
Monitor da integracao com a Plataforma BJ - browse MVC sobre a SZY (lotes).
@type    function
@author  Ricardo P Sotomayor
@since   01/09/2026
/*/

/*/{Protheus.doc} BJPLA005
Abre o monitor: browse dos lotes (SZY), com a SZZ como detalhe.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  Nil
@example U_BJPLA005()
/*/
User Function BJPLA005()

	Local oBrowse := Nil

	Private cCadastro := "Monitor da Integracao BJ"
	Private _lCarga := .F.
	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		If !MsgYesNo("A integracao BJ esta desligada (MV_BJAPI03 = N)." + CRLF + CRLF + ;
			"Abrir o monitor mesmo assim?", cCadastro)
			Return Nil
		EndIf
	EndIf

	// Com a SZY vazia o browse barra as acoes do menu com o Help ARQVAZIO, entao
	// a carga inicial e oferecida aqui, antes dele abrir: o primeiro lote nasce
	// fora do browse e ele ja abre com registro.
	dbSelectArea("SZY")
	SZY->(dbSetOrder(1))   // ZY_FILIAL + ZY_CODIGO

	If !SZY->(dbSeek(xFilial("SZY")))
		If MsgYesNo("Ainda nao ha nenhum lote nesta filial." + CRLF + CRLF + ;
			"Gerar a carga inicial agora?", cCadastro)
			_lCarga := .T.
			U_BJMONGER()
		EndIf
	EndIf

	oBrowse := FWmBrowse():New()
	oBrowse:SetAlias("SZY")
	oBrowse:SetDescription(cCadastro)

	// A cor sai do ZY_STATUS: e o campo que diz qual lote ainda precisa sair.
	oBrowse:AddLegend("SZY->ZY_STATUS == '1'", "BR_AMARELO" , "Coletado, aguardando envio")
	oBrowse:AddLegend("SZY->ZY_STATUS == '2'", "BR_VERDE"   , "Processado")
	oBrowse:AddLegend("SZY->ZY_STATUS == '3'", "BR_VERMELHO", "Erro")

	oBrowse:Activate()

Return Nil

/*/{Protheus.doc} MenuDef
Opcoes do monitor: as padrao do MVC e as acoes da integracao.
@type    Static Function
@author  Ricardo P Sotomayor
@since   18/09/2026
@return  array, aRotina
/*/
Static Function MenuDef()

	Local aRotina := {}

	// Com a SZY vazia (carga inicial) o browse so libera opcao de inclusao - as
	// demais dao Help ARQVAZIO. Por isso OPERATION 3 em tudo que nao depende do
	// lote posicionado: Gerar e Receber abrem lote novo, e Enviar em Bloco,
	// Limpar e Ajuda nao leem o registro do browse. Enviar e Mensagens trabalham
	// sobre o lote posicionado e ficam com 9.
	ADD OPTION aRotina TITLE "Pesquisar"       ACTION "PesqBrw"          OPERATION 0 ACCESS 0
	ADD OPTION aRotina TITLE "Visualizar"      ACTION "VIEWDEF.BJPLA005" OPERATION 2 ACCESS 0
	ADD OPTION aRotina TITLE "Gerar"           ACTION "U_BJMONGER"       OPERATION 3 ACCESS 0
	ADD OPTION aRotina TITLE "Enviar"          ACTION "U_BJMONENV"       OPERATION 9 ACCESS 0
	ADD OPTION aRotina TITLE "Receber"         ACTION "U_BJMONREC"       OPERATION 3 ACCESS 0
	ADD OPTION aRotina TITLE "Mensagens"       ACTION "U_BJMONMSG"       OPERATION 9 ACCESS 0
	ADD OPTION aRotina TITLE "Enviar em Bloco" ACTION "U_BJMONBLO"       OPERATION 3 ACCESS 0
	ADD OPTION aRotina TITLE "Exportar TXT"    ACTION "U_BJMONEXP"       OPERATION 9 ACCESS 0
	ADD OPTION aRotina TITLE "Importar TXT"    ACTION "U_BJMONIMP"       OPERATION 3 ACCESS 0
	ADD OPTION aRotina TITLE "Limpar"          ACTION "U_BJMONLIM"       OPERATION 3 ACCESS 0
	ADD OPTION aRotina TITLE "Ajuda"           ACTION "U_BJMONAJU"       OPERATION 3 ACCESS 0

Return aRotina

/*/{Protheus.doc} ModelDef
O lote (SZY) como mestre e as mensagens dele (SZZ) como detalhe.
@type    Static Function
@author  Ricardo P Sotomayor
@since   18/09/2026
@return  object, FWFormModel
/*/
Static Function ModelDef()

	Local oModel    := Nil
	Local oStruSZY  := FWFormStruct(1, "SZY")
	Local oStruSZZ  := FWFormStruct(1, "SZZ")

	oModel := MPFormModel():New("M_BJPLA005", /*bPreValid*/, /*bPosValid*/, /*bCommit*/, /*bCancel*/)

	oModel:AddFields("SZYMASTER", Nil, oStruSZY)
	oModel:SetPrimaryKey({"ZY_FILIAL", "ZY_CODIGO"})

	oModel:AddGrid("SZZDETAIL", "SZYMASTER", oStruSZZ)

	// O detalhe e amarrado pelo lote: ZZ_CODIGO recebe o ZY_CODIGO do mestre.
	oModel:SetRelation("SZZDETAIL", {{"ZZ_FILIAL", "xFilial('SZZ')"}, {"ZZ_CODIGO", "ZY_CODIGO"}}, SZZ->(IndexKey(1)))

	oModel:GetModel("SZYMASTER"):SetDescription("Lote")
	oModel:GetModel("SZZDETAIL"):SetDescription("Mensagens")

Return oModel

/*/{Protheus.doc} ViewDef
O lote em cima, as mensagens dele embaixo.
@type    Static Function
@author  Ricardo P Sotomayor
@since   18/09/2026
@return  object, FWFormView
/*/
Static Function ViewDef()

	Local oView     := Nil
	Local oModel    := FWLoadModel("BJPLA005")
	Local oStruSZY  := FWFormStruct(2, "SZY")
	Local oStruSZZ  := FWFormStruct(2, "SZZ")

	oView := FWFormView():New()
	oView:SetModel(oModel)

	oView:AddField("VIEWSZY", oStruSZY, "SZYMASTER")
	oView:AddGrid ("VIEWSZZ", oStruSZZ, "SZZDETAIL")

	oView:CreateHorizontalBox("SUPERIOR", 35)
	oView:CreateHorizontalBox("INFERIOR", 65)

	oView:SetOwnerView("VIEWSZY", "SUPERIOR")
	oView:SetOwnerView("VIEWSZZ", "INFERIOR")

	oView:EnableTitleView("VIEWSZY")
	oView:EnableTitleView("VIEWSZZ")

Return oView

/*/{Protheus.doc} BJMONGER
Gera um lote: pede entidade (ou todas as ativas), chave e intervalo de datas
opcionais, e roda a coleta (U_BJVARRE) - le a origem, monta o JSON e
enfileira. Nao envia nada.
@type    User Function
@author  Ricardo P Sotomayor
@since   11/09/2026
@return  Nil
/*/
User Function BJMONGER()

	Local aCat     := U_BJCATALO()
	Local aCombo   := {}
	Local aCombEnt := {}
	Local aGrupo   := {}
	Local aPergs   := {}
	Local aTotal   := {0, 0, 0, 0, "", ""}
	Local oProcess := Nil
	Local cChave   := Space(60)
	Local cMsg     := ""
	Local dDataDe  := Date()
	Local dDataAte := Date()
	Local xEntid   := ""
	Local nOpc     := 0
	Local nEnt     := 0
	Local nX       := 0

	// O combo trabalha por grupo, na ordem em que a carga precisa acontecer:
	// "Todos" primeiro, os grupos no meio e "Individual" no fim. Cada grupo e a
	// lista de entidades que o compoe; U_BJVARRE recebe a lista e varre na ordem
	// do catalogo, que ja e a ordem de dependencia. "Todos" manda entidade vazia
	// e varre o catalogo ativo inteiro.
	aGrupo := BJGrupos()

	For nX := 1 To Len(aGrupo)
		aAdd(aCombo, cValToChar(nX) + "=" + aGrupo[nX][1])
	Next nX

	aAdd(aCombo, cValToChar(Len(aGrupo) + 1) + "=Individual")

	// A entidade so e usada quando o grupo e "Individual" - e so ai a chave vale.
	For nX := 1 To Len(aCat)
		aAdd(aCombEnt, cValToChar(nX) + "=" + aCat[nX][1])
	Next nX

	If _lCarga
		dDataDe  := CToD("01/01/2000")
		dDataAte := Date()
	EndIf
	// O combo tem 7 posicoes, e a quinta e o tamanho, numerico. O Get tem 9, com
	// o tamanho na oitava - os dois layouts sao diferentes.
	aAdd(aPergs, {2, "Grupo"                    , 1       , aCombo  , 200, ".T.", .T.})
	aAdd(aPergs, {2, "Entidade (so Individual)" , 1       , aCombEnt, 200, ".T.", .T.})
	aAdd(aPergs, {1, "Chave (opcional)"         , cChave  , "@!"    , ".T.", "", ".T.", 150, .F.})
	aAdd(aPergs, {1, "Data de"                  , dDataDe , ""      , ".T.", "", ".T.", 080, .F.})
	aAdd(aPergs, {1, "Data ate"                 , dDataAte, ""      , ".T.", "", ".T.", 080, .F.})

	If !ParamBox(aPergs, "Gerar lote - parametros da coleta")
		Return Nil
	EndIf

	// O combo devolve a posicao (numerico) se o usuario nao mexer nele, e a chave
	// da opcao (caractere) se ele trocar a selecao.
	If ValType(MV_PAR01) == "C"
		nOpc := Val(MV_PAR01)
	Else
		nOpc := MV_PAR01
	EndIf

	If ValType(MV_PAR02) == "C"
		nEnt := Val(MV_PAR02)
	Else
		nEnt := MV_PAR02
	EndIf

	cChave   := AllTrim(MV_PAR03)
	dDataDe  := MV_PAR04
	dDataAte := MV_PAR05

	If nOpc == Len(aGrupo) + 1   // Individual
		xEntid := aCat[nEnt][1]
	Else
		// Grupo: "Todos" leva a lista vazia, que varre o catalogo ativo inteiro.
		xEntid := aGrupo[nOpc][2]

		If !Empty(cChave)
			MsgStop("A chave so vale para uma entidade. Escolha Individual ou deixe a chave em branco.", cCadastro)
			Return Nil
		EndIf
	EndIf

	oProcess := MsNewProcess():New({|| aTotal := U_BJVARRE(xEntid, cChave, dDataDe, dDataAte, oProcess)}, "Gerando lote...", "Aguarde...", .F.)
	oProcess:Activate()

	cMsg := "Lote: "      + aTotal[5] + CRLF + ;
		"Lidos: "         + cValToChar(aTotal[1]) + CRLF + ;
		"Enfileirados: "  + cValToChar(aTotal[2]) + CRLF + ;
		"Erros: "         + cValToChar(aTotal[4])

	If aTotal[4] > 0
		cMsg += CRLF + CRLF + aTotal[6]
	EndIf

	MsgInfo(cMsg, cCadastro)

Return Nil

/*/{Protheus.doc} BJGrupos
Grupos de coleta do monitor, na ordem em que a carga precisa acontecer.
Cada grupo e a lista de entidades que o compoe; U_BJVARRE varre a lista na
ordem do catalogo, que ja e a ordem de dependencia (uma referencia precisa
existir antes de quem aponta para ela). "Todos" leva a lista vazia, que varre
o catalogo ativo inteiro. Entidade fora de grupo - objetivos, hoje inativa -
so pela opcao Individual.
@type    Static Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@return  array, {{cTitulo, aIdsDasEntidades}, ...}
/*/
Static Function BJGrupos()

	Local aRet := {}

	aAdd(aRet, {"Todos"           , {}})
	aAdd(aRet, {"Cadastros"       , {"regras-desconto", "categorias", "condicoes-pagto", "armazens", ;
		"vendedores", "fornecedores", "produtos", "tabelas-preco", "clientes"}})
	aAdd(aRet, {"Financeiro"      , {"titulos-receber"}})
	aAdd(aRet, {"Estoque"         , {"estoque"}})
	aAdd(aRet, {"Notas de Saida"  , {"notas-saida", "notas-saida-xml"}})
	aAdd(aRet, {"Notas de Entrada", {"notas-entrada"}})

Return aRet

/*/{Protheus.doc} BJMONENV
Drena so as mensagens do lote posicionado no browse (SZZ, por ZZ_CODIGO).
@type    User Function
@author  Ricardo P Sotomayor
@since   11/09/2026
@return  Nil
/*/
User Function BJMONENV()

	Local aTotal  := {0, 0, 0}
	Local oProcess := Nil
	Local cSeqMae := ""

	If SZY->(Eof()) .Or. Empty(SZY->ZY_CODIGO)
		MsgStop("Nao ha lote posicionado.", cCadastro)
		Return Nil
	EndIf

	cSeqMae := AllTrim(SZY->ZY_CODIGO)

	If !MsgYesNo("Enviar so as mensagens do lote " + cSeqMae + "?", cCadastro)
		Return Nil
	EndIf

	oProcess := MsNewProcess():New({|| aTotal := U_BJDRENA(0, cSeqMae, oProcess)}, "Enviando o lote...", "Aguarde...", .F.)
	oProcess:Activate()

	MsgInfo("Lidas: "    + cValToChar(aTotal[1]) + CRLF + ;
		"Enviadas: "     + cValToChar(aTotal[2]) + CRLF + ;
		"Erros: "        + cValToChar(aTotal[3]), cCadastro)

Return Nil

/*/{Protheus.doc} BJMONREC
Le as pendencias da plataforma (orcamentos aprovados, alteracoes de cliente),
grava o lote e ja aplica no ERP (U_BJRETORNO).
@type    User Function
@author  Ricardo P Sotomayor
@since   11/09/2026
@return  Nil
/*/
User Function BJMONREC()

	Local aTotal := {0, 0, 0, 0}

	If !MsgYesNo("Perguntar na plataforma se ha dados para receber, gravar o lote e" + CRLF + ;
		"aplicar no ERP agora?" + CRLF + CRLF + ;
		"Orcamentos aprovados viram Pedido de Venda (SC5/SC6) direto, por MATA410.", cCadastro)
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJRETORNO()}, "Recebendo...")

	MsgInfo("Lidos: "    + cValToChar(aTotal[1]) + CRLF + ;
		"Aplicados: "    + cValToChar(aTotal[2]) + CRLF + ;
		"Ignorados: "    + cValToChar(aTotal[3]) + CRLF + ;
		"Erros: "        + cValToChar(aTotal[4]), cCadastro)

Return Nil

/*/{Protheus.doc} BJMONEXP
Exporta as mensagens do lote posicionado no browse para um arquivo TXT.
@type    User Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@return  Nil
/*/
User Function BJMONEXP()

	Local aTotal   := {0, 0, 0}
	Local cSeqMae  := ""
	Local cCaminho := ""

	If SZY->(Eof()) .Or. Empty(SZY->ZY_CODIGO)
		MsgStop("Nao ha lote posicionado.", cCadastro)
		Return Nil
	EndIf

	cSeqMae := AllTrim(SZY->ZY_CODIGO)

	cCaminho := cGetFile("Arquivos TXT (*.txt)|*.txt", "Salvar JSONs do Lote " + cSeqMae, 1, "C:\", .F., nOR(GETF_LOCALHARD, GETF_LOCALFLOPPY), .T.)

	If Empty(cCaminho)
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJEXPTOARQ(cSeqMae, cCaminho)}, "Exportando Lote " + cSeqMae + "...")

	MsgInfo("Lidas: "      + cValToChar(aTotal[1]) + CRLF + ;
		"Exportadas: " + cValToChar(aTotal[2]) + CRLF + ;
		"Erros: "      + cValToChar(aTotal[3]) + CRLF + CRLF + ;
		"Arquivo salvo em: " + cCaminho, cCadastro)

Return Nil

/*/{Protheus.doc} BJMONIMP
Importa mensagens de um arquivo TXT da Plataforma BJ para a SZY/SZZ do Protheus.
@type    User Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@return  Nil
/*/
User Function BJMONIMP()

	Local aTotal   := {0, 0, 0}
	Local cCaminho := ""

	cCaminho := cGetFile("Arquivos TXT (*.txt)|*.txt", "Selecione Arquivo TXT da Plataforma", 1, "C:\", .T., nOR(GETF_LOCALHARD, GETF_LOCALFLOPPY), .T.)

	If Empty(cCaminho) .Or. !File(cCaminho)
		Return Nil
	EndIf

	If !MsgYesNo("Importar o arquivo " + cCaminho + " para o Protheus agora?", cCadastro)
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJIMPDOARQ(cCaminho)}, "Importando Arquivo...")

	MsgInfo("Lidos: "        + cValToChar(aTotal[1]) + CRLF + ;
		"Enfileirados: " + cValToChar(aTotal[2]) + CRLF + ;
		"Erros: "        + cValToChar(aTotal[3]), cCadastro)

Return Nil

/*/{Protheus.doc} BJMONMSG
Lista as mensagens do lote posicionado no browse (SZZ, por ZZ_CODIGO) e abre
a escolhida para ver o JSON e o retorno.
@type    User Function
@author  Ricardo P Sotomayor
@since   11/09/2026
@return  Nil
/*/
User Function BJMONMSG()

	Local aLista  := {}
	Local aSeq    := {}
	Local cQuery  := ""
	Local cSeqMae := ""
	Local cStat   := ""
	Local cDtCria := ""
	Local cTmp    := ""
	Local nOpc    := 0
	Local oStmt   := Nil

	If SZY->(Eof()) .Or. Empty(SZY->ZY_CODIGO)
		MsgStop("Nao ha lote posicionado.", cCadastro)
		Return Nil
	EndIf

	cSeqMae := AllTrim(SZY->ZY_CODIGO)

	cQuery := "SELECT ZZ_SEQUEN, ZZ_TIPO, ZZ_ENTID, ZZ_CHVORI, ZZ_VERBO, ZZ_STATUS, "
	cQuery += "       ZZ_HTTP, ZZ_DTCRIA, ZZ_HRCRIA "
	cQuery += "  FROM " + RetSqlName("SZZ") + " SZZ "
	cQuery += " WHERE SZZ.D_E_L_E_T_ = ? "
	cQuery += "   AND SZZ.ZZ_FILIAL  = ? "
	cQuery += "   AND SZZ.ZZ_CODIGO  = ? "
	// A mesma ordem em que a drenagem processa: lote e, dentro dele, sequencia
	cQuery += " ORDER BY ZZ_CODIGO, ZZ_SEQUEN "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, xFilial("SZZ"))
	oStmt:SetString(3, cSeqMae)

	cTmp := oStmt:OpenAlias()

	While (cTmp)->(!Eof()) .And. Len(aLista) < 500

		Do Case
			Case (cTmp)->ZZ_STATUS == "1"
				cStat := "PENDENTE"
			Case (cTmp)->ZZ_STATUS == "3"
				cStat := "ERRO"
			Case (cTmp)->ZZ_STATUS == "2"
				cStat := "OK"
			Otherwise
				cStat := "?"
		EndCase

		cDtCria := ""
		If ValType((cTmp)->ZZ_DTCRIA) == "D"
			cDtCria := DtoC((cTmp)->ZZ_DTCRIA)
		ElseIf ValType((cTmp)->ZZ_DTCRIA) == "C"
			If Len(AllTrim((cTmp)->ZZ_DTCRIA)) == 8
				cDtCria := DtoC(StoD((cTmp)->ZZ_DTCRIA))
			Else
				cDtCria := AllTrim((cTmp)->ZZ_DTCRIA)
			EndIf
		EndIf

		aAdd(aLista, PadR((cTmp)->ZZ_SEQUEN, 10) + ;
			PadR((cTmp)->ZZ_TIPO, 2) + ;
			PadR(AllTrim((cTmp)->ZZ_ENTID), 18) + ;
			PadR(AllTrim((cTmp)->ZZ_CHVORI), 26) + ;
			PadR(AllTrim((cTmp)->ZZ_VERBO), 7) + ;
			PadR(cStat, 9) + ;
			PadL(cValToChar((cTmp)->ZZ_HTTP), 4) + "  " + ;
			cDtCria + " " + AllTrim((cTmp)->ZZ_HRCRIA))

		aAdd(aSeq, (cTmp)->ZZ_SEQUEN)

		(cTmp)->(dbSkip())
	End

	(cTmp)->(dbCloseArea())
	oStmt:Destroy()

	If Len(aLista) == 0
		MsgInfo("O lote " + cSeqMae + " nao tem mensagens.", cCadastro)
		Return Nil
	EndIf

	nOpc := BJEscolhe(aLista, "Mensagens do lote " + cSeqMae + " - SEQ TP ENTIDADE CHAVE VERBO STATUS HTTP DATA")

	If nOpc > 0 .And. nOpc <= Len(aSeq)
		BJAbreMsg(cSeqMae, aSeq[nOpc])
	EndIf

Return Nil

/*/{Protheus.doc} BJAbreMsg
Abre uma mensagem: payload, resposta e a opcao de reenviar.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cSeq, character, Sequencia da mensagem
@return  Nil
/*/
Static Function BJAbreMsg(cLote, cSeq)

	Local aArea  := GetArea()
	Local oDlg   := Nil
	Local oFont  := Nil
	Local oMemo  := Nil
	Local cTexto := ""
	Local cEntid := ""
	Local cChave := ""
	Local cSentid := ""
	Local cStatMsg := ""
	Local lPode  := .F.

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(1))   // ZZ_FILIAL + ZZ_CODIGO + ZZ_SEQUEN

	If !SZZ->(dbSeek(xFilial("SZZ") + PadR(cLote, TamSX3("ZZ_CODIGO")[1]) + PadR(cSeq, TamSX3("ZZ_SEQUEN")[1])))
		MsgStop("Mensagem " + cSeq + " nao encontrada.", cCadastro)
		RestArea(aArea)
		Return Nil
	EndIf

	cEntid := AllTrim(SZZ->ZZ_ENTID)
	cChave := AllTrim(SZZ->ZZ_CHVORI)

	// So mensagem de saida se reenvia por aqui. A de entrada e reprocessada pelo
	// agendamento de retorno, que le a plataforma de novo.
	lPode := (SZZ->ZZ_TIPO == "S")   // saida

	cSentid := "?"

	If SZZ->ZZ_TIPO == "S"
		cSentid := "S - ERP para a plataforma"
	ElseIf SZZ->ZZ_TIPO == "E"
		cSentid := "E - plataforma para o ERP"
	EndIf

	cStatMsg := "?"

	Do Case
		Case SZZ->ZZ_STATUS == "1"
			cStatMsg := "1 - pendente, esperando envio"
		Case SZZ->ZZ_STATUS == "2"
			cStatMsg := "2 - executada"
		Case SZZ->ZZ_STATUS == "3"
			cStatMsg := "3 - erro, volta no proximo ciclo"
	EndCase

	cTexto := "MENSAGEM " + cSeq + CRLF
	cTexto += Replicate("=", 100) + CRLF + CRLF
	cTexto += "Lote       " + AllTrim(SZZ->ZZ_CODIGO) + CRLF
	cTexto += "Entidade   " + cEntid + CRLF
	cTexto += "Chave      " + cChave + CRLF
	cTexto += "Sentido    " + cSentid + CRLF
	cTexto += "Verbo      " + AllTrim(SZZ->ZZ_VERBO) + CRLF
	cTexto += "Status     " + cStatMsg + CRLF
	cTexto += "HTTP       " + cValToChar(SZZ->ZZ_HTTP) + CRLF
	cTexto += "Criada em  " + DtoC(SZZ->ZZ_DTCRIA) + " " + AllTrim(SZZ->ZZ_HRCRIA) + CRLF
	cTexto += "Executada  " + DtoC(SZZ->ZZ_DTEXEC) + " " + AllTrim(SZZ->ZZ_HREXEC) + CRLF

	If !Empty(SZZ->ZZ_CHVDES)
		cTexto += "Doc no ERP " + AllTrim(SZZ->ZZ_CHVDES) + CRLF
	EndIf

	cTexto += CRLF + Replicate("-", 100) + CRLF
	cTexto += "PAYLOAD ENVIADO" + CRLF
	cTexto += Replicate("-", 100) + CRLF
	cTexto += SZZ->ZZ_JSON + CRLF + CRLF
	cTexto += Replicate("-", 100) + CRLF
	cTexto += "RESPOSTA DA API" + CRLF
	cTexto += Replicate("-", 100) + CRLF
	cTexto += SZZ->ZZ_RETORN + CRLF

	oFont := TFont():New("Courier New", , -12, .T.)

	DEFINE MSDIALOG oDlg TITLE "Mensagem " + cSeq FROM 000, 000 TO 420, 800 PIXEL

	@ 008, 008 GET oMemo VAR cTexto MEMO SIZE 780, 350 OF oDlg PIXEL
	oMemo:oFont := oFont
	oMemo:bWhen := {|| .F.}

	If lPode
		@ 368, 008 BUTTON "Reenviar entidade" SIZE 090, 016 OF oDlg PIXEL ;
			ACTION (BJReenvia(cEntid, ""), oDlg:End())

		@ 368, 108 BUTTON "Reenviar esta chave" SIZE 090, 016 OF oDlg PIXEL ;
			ACTION (BJReenvia(cEntid, cChave), oDlg:End())
	EndIf

	@ 368, 713 BUTTON "Fechar" SIZE 075, 016 OF oDlg PIXEL ACTION oDlg:End()

	ACTIVATE MSDIALOG oDlg CENTERED

	RestArea(aArea)

Return Nil

/*/{Protheus.doc} BJReenvia
Recoleta e reenfileira uma entidade, ou uma chave dela. Gera um lote novo.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cEntid, character, Id da entidade
@param   cChave, character, Chave unica, ou vazio para a entidade inteira
@return  Nil
/*/
Static Function BJReenvia(cEntid, cChave)

	Local aTotal := {0, 0, 0, 0, ""}
	Local aEnvio := {0, 0, 0}
	Local oProcess := Nil
	Local cMsg   := ""

	If !MsgYesNo("Recoletar e reenviar " + ;
		IfBJAlvo(cEntid, cChave) + "?" + CRLF + CRLF + ;
		"A coleta le a origem de novo; o payload guardado na mensagem nao e reaproveitado.", cCadastro)
		Return Nil
	EndIf

	oProcess := MsNewProcess():New({|| aTotal := U_BJVARRE(cEntid, cChave, , , oProcess)}, "Coletando...", "Aguarde...", .F.)
	oProcess:Activate()

	// Drena so o lote que esta recoleta abriu (aTotal[5]), nao a fila inteira
	oProcess := MsNewProcess():New({|| aEnvio := U_BJDRENA(0, aTotal[5], oProcess)}, "Enviando...", "Aguarde...", .F.)
	oProcess:Activate()

	cMsg := "Coleta: " + cValToChar(aTotal[2]) + " enfileiradas, " + cValToChar(aTotal[4]) + " erros." + CRLF + ;
		"Envio: " + cValToChar(aEnvio[2]) + " enviadas, " + cValToChar(aEnvio[3]) + " erros."

	MsgInfo(cMsg, cCadastro)

Return Nil

/*/{Protheus.doc} BJMONBLO
Envia em bloco, por PUT, tudo que esta pendente na fila agora, pela tela.
@type    User Function
@author  Ricardo P Sotomayor
@since   09/09/2026
@return  Nil
/*/
User Function BJMONBLO()

	Local aTotal   := {0, 0, 0}
	Local oProcess := Nil

	If !MsgYesNo("Enviar agora tudo que esta pendente na fila, em blocos de ate 1.000 registros por PUT?" + CRLF + CRLF + ;
		"E o caminho da carga inicial. A rota de XML da nota fiscal nao entra no" + CRLF + ;
		"bloco e continua exigindo o Enviar individual.", cCadastro)
		Return Nil
	EndIf

	oProcess := MsNewProcess():New({|| aTotal := U_BJLOTE(0, oProcess)}, "Enviando em bloco...", "Aguarde...", .F.)
	oProcess:Activate()

	MsgInfo("Lidas: "    + cValToChar(aTotal[1]) + CRLF + ;
		"Enviadas: "     + cValToChar(aTotal[2]) + CRLF + ;
		"Erros: "        + cValToChar(aTotal[3]), cCadastro)

Return Nil

/*/{Protheus.doc} BJMONLIM
Roda o expurgo da fila agora, pela tela.
@type    User Function
@author  Ricardo P Sotomayor
@since   09/09/2026
@return  Nil
/*/
User Function BJMONLIM()

	Local nApagadas := 0
	Local nLotes    := 0

	If !MsgYesNo("Apagar da fila as mensagens executadas ha mais de " + ;
		cValToChar(SuperGetMV("MV_BJAPI11", .F., 90)) + " dias?" + CRLF + CRLF + ;
		"Pendentes e com erro nao sao apagadas. Lote que ficar sem nenhuma mensagem sai junto, " + ;
		"menos o mais recente com marca - e dele que sai a janela da proxima coleta.", cCadastro)
		Return Nil
	EndIf

	Processa({|| nApagadas := U_BJEXPURG(0, @nLotes)}, "Limpando a fila...")

	MsgInfo("Mensagens apagadas: " + cValToChar(nApagadas) + CRLF + ;
		"Lotes apagados: " + cValToChar(nLotes), cCadastro)

Return Nil

/*/{Protheus.doc} BJEscolhe
Mostra uma lista e devolve a posicao escolhida.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aLista, array    , Linhas a exibir
@param   cTitulo, character, Titulo da janela
@return  numeric, Posicao escolhida, ou zero quando o usuario desistiu
/*/
Static Function BJEscolhe(aLista, cTitulo)

	Local nRet := 0
	Local oDlg := Nil
	Local oLbx := Nil
	Local oFont := Nil
	Local nSel := 1

	Default cTitulo := ""

	If Len(aLista) == 0
		Return 0
	EndIf

	oFont := TFont():New("Courier New", , -12, .T.)

	DEFINE MSDIALOG oDlg TITLE cTitulo FROM 000, 000 TO 400, 800 PIXEL

	@ 008, 008 LISTBOX oLbx VAR nSel ITEMS aLista SIZE 780, 330 OF oDlg PIXEL
	oLbx:oFont := oFont

	@ 348, 613 BUTTON "Abrir"    SIZE 075, 016 OF oDlg PIXEL ACTION (nRet := oLbx:nAt, oDlg:End())
	@ 348, 713 BUTTON "Cancelar" SIZE 075, 016 OF oDlg PIXEL ACTION (nRet := 0, oDlg:End())

	ACTIVATE MSDIALOG oDlg CENTERED

Return nRet

/*/{Protheus.doc} IfBJAlvo
Descreve o alvo do reenvio para a pergunta de confirmacao.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cEntid, character, Id da entidade
@param   cChave, character, Chave, ou vazio
@return  character, Descricao
/*/
Static Function IfBJAlvo(cEntid, cChave)

	Local cRet := "a entidade " + cEntid + " inteira"

	If !Empty(cChave)
		cRet := "so a chave " + cChave + " de " + cEntid
	EndIf

Return cRet

/*/{Protheus.doc} BJMONAJU
Explica como a integracao decide o que enviar.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  Nil
/*/
User Function BJMONAJU()

	Local oDlg   := Nil
	Local oFont  := Nil
	Local oMemo  := Nil
	Local cTexto := ""

	cTexto := "COMO A INTEGRACAO DECIDE O QUE ENVIAR" + CRLF
	cTexto += Replicate("=", 90) + CRLF + CRLF
	cTexto += "Cada linha do monitor e um LOTE: um registro da SZY, com inicio, fim," + CRLF
	cTexto += "status e contadores de um processamento. O detalhe de um lote (as" + CRLF
	cTexto += "mensagens que ele gerou, na SZZ) fica em Mensagens." + CRLF + CRLF
	cTexto += "1. GERAR" + CRLF
	cTexto += "   Pede a entidade (ou todas as ativas) e, opcionalmente, uma chave ou" + CRLF
	cTexto += "   intervalo de datas. A chave so vale com uma entidade escolhida." + CRLF
	cTexto += "   Le a origem procurando o que mudou desde a marca d'agua da entidade," + CRLF
	cTexto += "   monta o JSON e grava na fila (SZZ) - um lote novo por chamada. Nao" + CRLF
	cTexto += "   envia nada. Sem chave nem intervalo de datas, terminando sem erro, a" + CRLF
	cTexto += "   marca da entidade avanca para a proxima Gerar." + CRLF + CRLF
	cTexto += "2. ENVIAR" + CRLF
	cTexto += "   Drena so as mensagens do lote posicionado na lista, na ordem de" + CRLF
	cTexto += "   chegada. Cada uma grava o resultado. A que falhar continua na fila e" + CRLF
	cTexto += "   volta sozinha no proximo envio, sem arrastar as outras." + CRLF + CRLF
	cTexto += "3. RECEBER" + CRLF
	cTexto += "   Pergunta na plataforma se ha orcamentos aprovados ou alteracoes de" + CRLF
	cTexto += "   cliente pendentes. Se houver, grava um lote (SZY/SZZ) e ja aplica no" + CRLF
	cTexto += "   ERP, confirmando o status na plataforma - tudo na mesma chamada." + CRLF
	cTexto += "   Orcamento aprovado vira Pedido de Venda (SC5/SC6) por MATA410, e" + CRLF
	cTexto += "   cliente novo ou alterado vai para a SA1 por CRMA980." + CRLF + CRLF
	cTexto += "Gerar e caro e nao precisa ser frequente; Enviar e limitado pela API" + CRLF
	cTexto += "(60 requisicoes por minuto, contadas por IP). Por isso sao agendamentos" + CRLF
	cTexto += "diferentes (U_BJVARRE, U_BJDRENA, U_BJRETORNO)." + CRLF + CRLF
	cTexto += Replicate("-", 90) + CRLF
	cTexto += "A MARCA D'AGUA" + CRLF
	cTexto += Replicate("-", 90) + CRLF + CRLF
	cTexto += "Cada entidade tem a sua, guardada no lote mais recente concluido sem erro" + CRLF
	cTexto += "(SZY). Por isso um erro em produtos nao trava a coleta de clientes." + CRLF + CRLF
	cTexto += "A hora vem em UTC porque a coluna S_T_A_M_P_ e escrita pelo DBAccess em" + CRLF
	cTexto += "UTC. Uma marca em horario de Brasilia ficaria tres horas adiantada, e" + CRLF
	cTexto += "tudo que mudasse nesse intervalo sairia da varredura sem deixar rastro." + CRLF + CRLF
	cTexto += "A hora e lida ANTES da coleta, nunca depois. Marcar a hora do fim" + CRLF
	cTexto += "descartaria em silencio o que fosse alterado durante a leitura." + CRLF + CRLF
	cTexto += Replicate("-", 90) + CRLF
	cTexto += "PRIMEIRA CARGA E REPROCESSAMENTO" + CRLF
	cTexto += Replicate("-", 90) + CRLF + CRLF
	cTexto += "Entidade sem marca comeca 30 dias atras. Para carregar a base inteira, ou" + CRLF
	cTexto += "reprocessar um periodo especifico, use Gerar informando o intervalo de" + CRLF
	cTexto += "datas - isso nao mexe na marca automatica, so cobre o periodo pedido." + CRLF + CRLF
	cTexto += "Respeite a ordem do catalogo: a API nao aceita referencia a registro" + CRLF
	cTexto += "inexistente. Regra de desconto antes de categoria e produto, categoria" + CRLF
	cTexto += "antes de produto, vendedor antes de cliente, produto antes de estoque." + CRLF + CRLF
	cTexto += "Estimativa de tempo pelo Enviar individual, teto de 60 req/min:" + CRLF
	cTexto += "   1.000 registros    ~17 minutos" + CRLF
	cTexto += "   5.000 registros    ~1h25" + CRLF
	cTexto += "  20.000 registros    ~5h40" + CRLF + CRLF
	cTexto += "Use Enviar em Bloco em vez de Enviar para a carga inicial: agrupa as" + CRLF
	cTexto += "pendentes por entidade e manda ate 1.000 por chamada PUT, contando como" + CRLF
	cTexto += "uma so contra o teto de 60 req/min. 120 mil registros caem de ~33h para" + CRLF
	cTexto += "~14 minutos. A rota de XML da nota nao entra no bloco." + CRLF + CRLF
	cTexto += Replicate("-", 90) + CRLF
	cTexto += "EXCLUSOES" + CRLF
	cTexto += Replicate("-", 90) + CRLF + CRLF
	cTexto += "A coleta le alteracoes sem filtrar D_E_L_E_T_. Registro ativo vira POST," + CRLF
	cTexto += "que a API trata como upsert; registro excluido vira DELETE com a mesma" + CRLF
	cTexto += "chave. Nao existe varredura separada de exclusoes." + CRLF + CRLF
	cTexto += "Registro removido fisicamente do banco (reccar, purge) nao aparece em" + CRLF
	cTexto += "varredura nenhuma - ai a exclusao tem de ser pedida por Gerar, com a" + CRLF
	cTexto += "chave especifica." + CRLF + CRLF
	cTexto += Replicate("-", 90) + CRLF
	cTexto += "LIMPAR A FILA" + CRLF
	cTexto += Replicate("-", 90) + CRLF + CRLF
	cTexto += "Apaga so mensagens ja executadas com mais de " + cValToChar(SuperGetMV("MV_BJAPI11", .F., 90)) + " dias." + CRLF
	cTexto += "Pendentes e com erro nunca sao apagadas - mesma regra do expurgo" + CRLF
	cTexto += "automatico diario, so que na hora que voce pedir. Nao ha expurgo de" + CRLF
	cTexto += "lotes (SZY) ainda." + CRLF

	oFont := TFont():New("Courier New", , -12, .F.)

	DEFINE MSDIALOG oDlg TITLE "Ajuda - Integracao BJ" FROM 000, 000 TO 420, 700 PIXEL

	@ 008, 008 GET oMemo VAR cTexto MEMO SIZE 680, 350 OF oDlg PIXEL
	oMemo:oFont := oFont
	oMemo:bWhen := {|| .F.}

	@ 368, 613 BUTTON "Fechar" SIZE 075, 016 OF oDlg PIXEL ACTION oDlg:End()

	ACTIVATE MSDIALOG oDlg CENTERED

Return Nil
