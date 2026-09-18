#Include "TOTVS.CH"
#Include "FWBrowse.CH"

// Sentido e status sao escritos como literal no ponto de uso, com o comentario
// na frente - quem documenta os valores e o combo do campo no SX3:
//
//    ZZ_TIPO     "S" saida (ERP -> plataforma)   "E" entrada (plataforma -> ERP)
//    ZZ_STATUS   "1" pendente         "2" executada    "3" erro
//    ZY_STATUS   "1" nao processado   "2" processado   "3" erro
//
//    MV_BJAPI11  Retencao da mensagem executada, em dias

/*/{Protheus.doc} BJPLA005
Monitor da integracao com a Plataforma BJ - browse dos lotes (SZY).
@type    function
@author  Ricardo P Sotomayor
@since   01/09/2026
/*/

/*/{Protheus.doc} BJPLA005
Abre o monitor: browse dos lotes (SZY).
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  Nil
@example U_BJPLA005()
/*/
User Function BJPLA005()

	Local oBrowse  := Nil
	Local oColumn  := Nil
	Local oDlg     := Nil
	Local cAliasBr := GetNextAlias()
	Local cQuery   := ""

	Private cCadastro := "Monitor da Integracao BJ"

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		If !MsgYesNo("A integracao BJ esta desligada (MV_BJAPI03 = N)." + CRLF + CRLF + ;
			"Abrir o monitor mesmo assim?", cCadastro)
			Return Nil
		EndIf
	EndIf

	cQuery := "SELECT ZY_FILIAL, ZY_CODIGO, ZY_DTINI, ZY_HRINI, ZY_DTFIM, ZY_HRFIM, "
	cQuery += "       ZY_STATUS, ZY_MARCA, ZY_QTDLIDO, ZY_QTDENV, ZY_QTDERR "
	cQuery += "  FROM " + RetSqlName("SZY") + " SZY "
	cQuery += " WHERE SZY.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SZY.ZY_FILIAL  = '" + xFilial("SZY") + "' "
	cQuery += " ORDER BY SZY.ZY_CODIGO DESC "

	DEFINE MSDIALOG oDlg TITLE cCadastro FROM 000, 000 TO 480, 900 PIXEL

	oBrowse := FWFormBrowse():New()
	oBrowse:SetDescription(cCadastro)
	oBrowse:SetAlias(cAliasBr)
	oBrowse:SetDataQuery()
	oBrowse:SetQuery(cQuery)
	oBrowse:SetOwner(oDlg)

	oColumn := FWBrwColumn():New()
	oColumn:SetData({|| Alltrim((cAliasBr)->ZY_CODIGO)})
	oColumn:SetTitle("Lote")
	oColumn:SetAlign(CONTROL_ALIGN_LEFT)
	oColumn:SetType("C")
	oColumn:SetSize(TamSX3("ZY_CODIGO")[1])
	oColumn:SetDecimal(0)
	oColumn:SetAutoSize(.T.)
	oBrowse:SetColumns({oColumn})

	oColumn := FWBrwColumn():New()
	oColumn:SetData({|| (cAliasBr)->ZY_STATUS})
	oColumn:SetTitle("Status")
	oColumn:SetAlign(CONTROL_ALIGN_LEFT)
	oColumn:SetType("C")
	oColumn:SetSize(20)
	oColumn:SetDecimal(0)
	oColumn:SetAutoSize(.T.)
	oBrowse:SetColumns({oColumn})

	oColumn := FWBrwColumn():New()
	oColumn:SetData({|| DtoC((cAliasBr)->ZY_DTINI) + " " + Alltrim((cAliasBr)->ZY_HRINI)})
	oColumn:SetTitle("Inicio")
	oColumn:SetAlign(CONTROL_ALIGN_LEFT)
	oColumn:SetType("C")
	oColumn:SetSize(19)
	oColumn:SetDecimal(0)
	oColumn:SetAutoSize(.T.)
	oBrowse:SetColumns({oColumn})

	oColumn := FWBrwColumn():New()
	oColumn:SetData({|| Iif(Empty((cAliasBr)->ZY_DTFIM), "", DtoC((cAliasBr)->ZY_DTFIM) + " " + Alltrim((cAliasBr)->ZY_HRFIM))})
	oColumn:SetTitle("Fim")
	oColumn:SetAlign(CONTROL_ALIGN_LEFT)
	oColumn:SetType("C")
	oColumn:SetSize(19)
	oColumn:SetDecimal(0)
	oColumn:SetAutoSize(.T.)
	oBrowse:SetColumns({oColumn})

	oColumn := FWBrwColumn():New()
	oColumn:SetData({|| Alltrim((cAliasBr)->ZY_MARCA)})
	oColumn:SetTitle("Marca d'agua (UTC)")
	oColumn:SetAlign(CONTROL_ALIGN_LEFT)
	oColumn:SetType("C")
	oColumn:SetSize(TamSX3("ZY_MARCA")[1])
	oColumn:SetDecimal(0)
	oColumn:SetAutoSize(.T.)
	oBrowse:SetColumns({oColumn})

	oColumn := FWBrwColumn():New()
	oColumn:SetData({|| (cAliasBr)->ZY_QTDLIDO})
	oColumn:SetTitle("Lidos")
	oColumn:SetAlign(CONTROL_ALIGN_RIGHT)
	oColumn:SetType("N")
	oColumn:SetSize(TamSX3("ZY_QTDLIDO")[1])
	oColumn:SetDecimal(0)
	oColumn:SetAutoSize(.T.)
	oBrowse:SetColumns({oColumn})

	oColumn := FWBrwColumn():New()
	oColumn:SetData({|| (cAliasBr)->ZY_QTDENV})
	oColumn:SetTitle("Enfileirados")
	oColumn:SetAlign(CONTROL_ALIGN_RIGHT)
	oColumn:SetType("N")
	oColumn:SetSize(TamSX3("ZY_QTDENV")[1])
	oColumn:SetDecimal(0)
	oColumn:SetAutoSize(.T.)
	oBrowse:SetColumns({oColumn})

	oColumn := FWBrwColumn():New()
	oColumn:SetData({|| (cAliasBr)->ZY_QTDERR})
	oColumn:SetTitle("Erros")
	oColumn:SetAlign(CONTROL_ALIGN_RIGHT)
	oColumn:SetType("N")
	oColumn:SetSize(TamSX3("ZY_QTDERR")[1])
	oColumn:SetDecimal(0)
	oColumn:SetAutoSize(.T.)
	oBrowse:SetColumns({oColumn})

	oBrowse:AddLegend("ZY_STATUS == '1'", "YELLOW", "1 - coletado, aguardando envio")
	oBrowse:AddLegend("ZY_STATUS == '2'", "GREEN" , "2 - processado")
	oBrowse:AddLegend("ZY_STATUS == '3'", "RED"   , "3 - erro")

	oBrowse:SetDoubleClick({|| BJVeMsgLote(cAliasBr)})

	oBrowse:AddButton("Gerar"         , {|| BJGeraLote()  , oBrowse:Refresh(.T.)})
	oBrowse:AddButton("Enviar"        , {|| BJEnviaLote(cAliasBr), oBrowse:Refresh(.T.)})
	oBrowse:AddButton("Receber"       , {|| BJRecebeLote(), oBrowse:Refresh(.T.)})
	oBrowse:AddButton("Mensagens"     , {|| BJVeMsgLote(cAliasBr)})
	oBrowse:AddButton("Enviar em Bloco", {|| BJRodaLote()  , oBrowse:Refresh(.T.)})
	oBrowse:AddButton("Limpar"        , {|| BJRodaExpurg(), oBrowse:Refresh(.T.)})
	oBrowse:AddButton("Ajuda"         , {|| BJAjuda()})

	oBrowse:Activate()

	ACTIVATE MSDIALOG oDlg CENTERED

Return Nil

/*/{Protheus.doc} BJGeraLote
Gera um lote: pede entidade, chave e intervalo de datas opcionais, e roda a
@type    Static Function
@author  Ricardo P Sotomayor
@since   11/09/2026
@return  Nil
/*/
Static Function BJGeraLote()

	Local aCat     := U_BJCATALO()
	Local aCombo   := {}
	Local aPergs   := {}
	Local aTotal   := {0, 0, 0, 0}
	Local cChave   := Space(60)
	Local dDataDe  := CToD("")
	Local dDataAte := CToD("")
	Local cEntid   := ""
	Local nX       := 0

	For nX := 1 To Len(aCat)
		aAdd(aCombo, cValToChar(nX) + "=" + aCat[nX][1])
	Next nX

	// O combo tem 7 posicoes, e a quinta e o tamanho, numerico. O Get tem 9, com
	// o tamanho na oitava - os dois layouts sao diferentes.
	aAdd(aPergs, {2, "Entidade"          , 1       , aCombo, 200, ".T.", .T.})
	aAdd(aPergs, {1, "Chave (opcional)"  , cChave  , "@!"  , ".T.", "", ".T.", 150, .F.})
	aAdd(aPergs, {1, "Data de (opcional)", dDataDe , ""    , ".T.", "", ".T.", 080, .F.})
	aAdd(aPergs, {1, "Data ate"          , dDataAte, ""    , ".T.", "", ".T.", 080, .F.})

	If !ParamBox(aPergs, "Gerar lote - parametros da coleta")
		Return Nil
	EndIf

	cEntid   := aCat[MV_PAR01][1]
	cChave   := AllTrim(MV_PAR02)
	dDataDe  := MV_PAR03
	dDataAte := MV_PAR04

	Processa({|| aTotal := U_BJVARRE(cEntid, cChave, dDataDe, dDataAte)}, "Gerando lote...")

	MsgInfo("Lidos: "         + cValToChar(aTotal[1]) + CRLF + ;
		"Enfileirados: "      + cValToChar(aTotal[2]) + CRLF + ;
		"Erros: "             + cValToChar(aTotal[4]), cCadastro)

Return Nil

/*/{Protheus.doc} BJEnviaLote
Drena so as mensagens do lote posicionado no browse (SZZ, por ZZ_CODIGO).
@type    Static Function
@author  Ricardo P Sotomayor
@since   11/09/2026
@param   cAliasBr, character, Alias do browse posicionado no lote
@return  Nil
/*/
Static Function BJEnviaLote(cAliasBr)

	Local aTotal  := {0, 0, 0}
	Local cSeqMae := ""

	If (cAliasBr)->(Eof())
		MsgStop("Nao ha lote posicionado.", cCadastro)
		Return Nil
	EndIf

	cSeqMae := Alltrim((cAliasBr)->ZY_CODIGO)

	If !MsgYesNo("Enviar so as mensagens do lote " + cSeqMae + "?", cCadastro)
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJDRENA(0, cSeqMae)}, "Enviando o lote...")

	MsgInfo("Lidas: "    + cValToChar(aTotal[1]) + CRLF + ;
		"Enviadas: "     + cValToChar(aTotal[2]) + CRLF + ;
		"Erros: "        + cValToChar(aTotal[3]), cCadastro)

Return Nil

/*/{Protheus.doc} BJRecebeLote
Le as pendencias da plataforma (orcamentos aprovados, alteracoes de cliente),
@type    Static Function
@author  Ricardo P Sotomayor
@since   11/09/2026
@return  Nil
/*/
Static Function BJRecebeLote()

	Local aTotal := {0, 0, 0, 0}

	If !MsgYesNo("Perguntar na plataforma se ha dados para receber, gravar o lote e" + CRLF + ;
		"aplicar no ERP agora?" + CRLF + CRLF + ;
		"Orcamentos aprovados viram Orcamento no ERP e sao efetivados em Pedido de Venda.", cCadastro)
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJRETORNO()}, "Recebendo...")

	MsgInfo("Lidos: "    + cValToChar(aTotal[1]) + CRLF + ;
		"Aplicados: "    + cValToChar(aTotal[2]) + CRLF + ;
		"Ignorados: "    + cValToChar(aTotal[3]) + CRLF + ;
		"Erros: "        + cValToChar(aTotal[4]), cCadastro)

Return Nil

/*/{Protheus.doc} BJVeMsgLote
Lista as mensagens do lote posicionado no browse (SZZ, por ZZ_CODIGO) e abre
@type    Static Function
@author  Ricardo P Sotomayor
@since   11/09/2026
@param   cAliasBr, character, Alias do browse posicionado no lote
@return  Nil
/*/
Static Function BJVeMsgLote(cAliasBr)

	Local aLista  := {}
	Local aSeq    := {}
	Local cQuery  := ""
	Local cSeqMae := ""
	Local cStat   := ""
	Local cTmp    := ""
	Local nOpc    := 0
	Local oStmt   := Nil

	If (cAliasBr)->(Eof())
		MsgStop("Nao ha lote posicionado.", cCadastro)
		Return Nil
	EndIf

	cSeqMae := Alltrim((cAliasBr)->ZY_CODIGO)

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

		aAdd(aLista, PadR((cTmp)->ZZ_SEQUEN, 10) + ;
			PadR((cTmp)->ZZ_TIPO, 2) + ;
			PadR(AllTrim((cTmp)->ZZ_ENTID), 18) + ;
			PadR(AllTrim((cTmp)->ZZ_CHVORI), 26) + ;
			PadR(AllTrim((cTmp)->ZZ_VERBO), 7) + ;
			PadR(cStat, 9) + ;
			PadL(cValToChar((cTmp)->ZZ_HTTP), 4) + "  " + ;
			DtoC((cTmp)->ZZ_DTCRIA) + " " + AllTrim((cTmp)->ZZ_HRCRIA))

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
	Local cMsg   := ""

	If !MsgYesNo("Recoletar e reenviar " + ;
		IfBJAlvo(cEntid, cChave) + "?" + CRLF + CRLF + ;
		"A coleta le a origem de novo; o payload guardado na mensagem nao e reaproveitado.", cCadastro)
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJVARRE(cEntid, cChave)}, "Coletando...")

	// Drena so o lote que esta recoleta abriu (aTotal[5]), nao a fila inteira
	Processa({|| aEnvio := U_BJDRENA(0, aTotal[5])}, "Enviando...")

	cMsg := "Coleta: " + cValToChar(aTotal[2]) + " enfileiradas, " + cValToChar(aTotal[4]) + " erros." + CRLF + ;
		"Envio: " + cValToChar(aEnvio[2]) + " enviadas, " + cValToChar(aEnvio[3]) + " erros."

	MsgInfo(cMsg, cCadastro)

Return Nil

/*/{Protheus.doc} BJRodaLote
Envia em bloco, por PUT, tudo que esta pendente na fila agora, pela tela.
@type    Static Function
@author  Ricardo P Sotomayor
@since   09/09/2026
@return  Nil
/*/
Static Function BJRodaLote()

	Local aTotal := {0, 0, 0}

	If !MsgYesNo("Enviar agora tudo que esta pendente na fila, em blocos de ate 1.000 registros por PUT?" + CRLF + CRLF + ;
		"E o caminho da carga inicial. A rota de XML da nota fiscal nao entra no" + CRLF + ;
		"bloco e continua exigindo o Enviar individual.", cCadastro)
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJLOTE(0)}, "Enviando em bloco...")

	MsgInfo("Lidas: "    + cValToChar(aTotal[1]) + CRLF + ;
		"Enviadas: "     + cValToChar(aTotal[2]) + CRLF + ;
		"Erros: "        + cValToChar(aTotal[3]), cCadastro)

Return Nil

/*/{Protheus.doc} BJRodaExpurg
Roda o expurgo da fila agora, pela tela.
@type    Static Function
@author  Ricardo P Sotomayor
@since   09/09/2026
@return  Nil
/*/
Static Function BJRodaExpurg()

	Local nApagadas := 0

	If !MsgYesNo("Apagar da fila as mensagens executadas ha mais de " + ;
		cValToChar(SuperGetMV("MV_BJAPI11", .F., 90)) + " dias?" + CRLF + CRLF + ;
		"Pendentes e com erro nao sao apagadas. A marca d'agua (SZY) nao e afetada.", cCadastro)
		Return Nil
	EndIf

	Processa({|| nApagadas := U_BJEXPURG(0)}, "Limpando a fila...")

	MsgInfo("Apagadas: " + cValToChar(nApagadas), cCadastro)

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

/*/{Protheus.doc} BJAjuda
Explica como a integracao decide o que enviar.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  Nil
/*/
Static Function BJAjuda()

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
	cTexto += "   Pede a entidade e, opcionalmente, uma chave ou intervalo de datas." + CRLF
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
	cTexto += "   ERP, confirmando o status na plataforma - tudo na mesma chamada." + CRLF + CRLF
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
