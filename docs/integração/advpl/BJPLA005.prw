#Include "TOTVS.CH"
#Include "FWMVCDef.ch"

// Sentido e status da mensagem na SZZ
#Define BJ_SAIDA          "S"
#Define BJ_ENTRADA        "E"
#Define BJ_PENDENTE       "0"
#Define BJ_PENDENTE_ALT   "1"
#Define BJ_EXECUTADA      "2"
#Define BJ_ERRO           "3"

/*/{Protheus.doc} BJPLA005
Monitor interativo da fila de integracao da Plataforma BJ (Tabela SZZ).
Construido em FWMBrowse para cadastro no Menu do Protheus (U_BJPLA005).

Permite:
- Visualizar a fila de mensagens com status por cores (Amarelo=Pendente, Vermelho=Erro, Verde=Concluida)
- Filtrar por padrao as mensagens que exigem acao (Pendentes e com Erro)
- Coleta manual com tela de parametros por entidade e chave
- Envio manual com parametro de limite de mensagens
- Retorno manual de orcamentos aprovados
- Visualizacao detalhada do JSON enviado e da resposta/erro da API
- Reprocessamento de mensagens com falha
- Consulta e ajuste do horario de corte de cada entidade

@type    User Function
@author  Ricardo P Sotomayor
@since   08/09/2026
@return  Nil
@example U_BJPLA005()
/*/
User Function BJPLA005()

	Local oBrowse   := Nil
	Local cCadastro := "Monitor da Integracao - Plataforma BJ"

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		If !MsgYesNo("A integracao BJ esta desabilitada (MV_BJAPI03 = N)." + CRLF + CRLF + ;
			"Deseja abrir o monitor mesmo assim?", cCadastro)
			Return Nil
		EndIf
	EndIf

	oBrowse := FWMBrowse():New()
	oBrowse:SetAlias("SZZ")
	oBrowse:SetDescription(cCadastro)
	oBrowse:SetMenuDef("BJPLA005")

	// Filtro padrao: exibe pendentes e erros, ocultando registros internos de controle
	oBrowse:SetFilterDefault("ZZ_CHVORI <> '*CONTROLE*' .AND. ZZ_STATUS $ '0|1|3'")

	// Legenda de cores
	oBrowse:AddLegend("ZZ_STATUS == '0' .Or. ZZ_STATUS == '1'", "YELLOW", "Pendente")
	oBrowse:AddLegend("ZZ_STATUS == '2'", "GREEN" , "Concluida")
	oBrowse:AddLegend("ZZ_STATUS == '3'", "RED"   , "Erro")

	oBrowse:Activate()
	oBrowse:Destroy()

Return Nil

/*/{Protheus.doc} MenuDef
Operacoes disponiveis no menu da rotina.
/*/
Static Function MenuDef()

	Local aRotina := {}

	aAdd(aRotina, {"Coletar (Parametros)"    , "U_BJColePar"  , 0, 3, 0, Nil})
	aAdd(aRotina, {"Visualizar Payload / Log", "U_BJVerMsg"   , 0, 2, 0, Nil})
	aAdd(aRotina, {"Enviar (Parametros)"     , "U_BJEnviPar"  , 0, 3, 0, Nil})
	aAdd(aRotina, {"Retorno (Orcamentos)"    , "U_BJRetoPar"  , 0, 3, 0, Nil})
	aAdd(aRotina, {"Reprocessar Erro"        , "U_BJReproc"   , 0, 4, 0, Nil})
	aAdd(aRotina, {"Painel de Resumo"        , "U_BJResumo"   , 0, 3, 0, Nil})
	aAdd(aRotina, {"Horario de Corte"        , "U_BJMudaCorte", 0, 3, 0, Nil})

Return aRotina

/*/{Protheus.doc} BJVerMsg
Visualizacao detalhada da mensagem selecionada (Payload enviado e Resposta da API).
/*/
User Function BJVerMsg()

	Local aArea    := GetArea()
	Local oDlg     := Nil
	Local oFont    := Nil
	Local oFontTit := Nil
	Local oMemoEnv := Nil
	Local oMemoRet := Nil
	Local cTextoEnv:= ""
	Local cTextoRet:= ""
	Local cSeq     := ""
	Local cEntid   := ""
	Local cChave   := ""
	Local cStatus  := ""
	Local cHeader  := ""

	If Eof() .Or. SZZ->ZZ_CHVORI == "*CONTROLE*"
		MsgInfo("Selecione uma mensagem valida na fila.", "Visualizar")
		RestArea(aArea)
		Return Nil
	EndIf

	cSeq   := AllTrim(SZZ->ZZ_SEQUEN)
	cEntid := AllTrim(SZZ->ZZ_ENTID)
	cChave := AllTrim(SZZ->ZZ_CHVORI)

	Do Case
		Case SZZ->ZZ_STATUS == "0" .Or. SZZ->ZZ_STATUS == "1"
			cStatus := "PENDENTE"
		Case SZZ->ZZ_STATUS == "2"
			cStatus := "CONCLUIDA (SUCESSO)"
		Case SZZ->ZZ_STATUS == "3"
			cStatus := "ERRO"
		Otherwise
			cStatus := SZZ->ZZ_STATUS
	EndCase

	cHeader := "Sequencia: " + cSeq + " | Entidade: " + cEntid + " | Chave: " + cChave + CRLF + ;
		"Tipo: " + Iif(SZZ->ZZ_TIPO == "S", "Saida (ERP -> BJ)", "Entrada (BJ -> ERP)") + ;
		" | Verbo: " + AllTrim(SZZ->ZZ_VERBO) + " | Status: " + cStatus + CRLF + ;
		"HTTP Code: " + cValToChar(SZZ->ZZ_HTTP) + " | Tentativas: " + cValToChar(SZZ->ZZ_TENTAT) + ;
		" | Criado em: " + DtoC(SZZ->ZZ_DTCRIA) + " " + AllTrim(SZZ->ZZ_HRCRIA) + ;
		" | Executado: " + DtoC(SZZ->ZZ_DTEXEC) + " " + AllTrim(SZZ->ZZ_HREXEC)

	If !Empty(SZZ->ZZ_CHVDES)
		cHeader += CRLF + "Documento gerado no ERP: " + AllTrim(SZZ->ZZ_CHVDES)
	EndIf

	cTextoEnv := SZZ->ZZ_JSON
	cTextoRet := SZZ->ZZ_RETORN

	oFont    := TFont():New("Courier New", , -11, .F.)
	oFontTit := TFont():New("Arial", , -12, .T.)

	DEFINE MSDIALOG oDlg TITLE "Detalhes da Mensagem " + cSeq FROM 000, 000 TO 540, 850 PIXEL

	@ 006, 008 SAY cHeader SIZE 415, 035 OF oDlg PIXEL FONT oFontTit COLOR CLR_HBLUE

	@ 045, 008 SAY "Payload JSON Enviado:" SIZE 200, 010 OF oDlg PIXEL FONT oFontTit
	@ 058, 008 GET oMemoEnv VAR cTextoEnv MEMO SIZE 410, 095 OF oDlg PIXEL FONT oFont
	oMemoEnv:bWhen := {|| .F.}

	@ 160, 008 SAY "Resposta da API / Log de Retorno:" SIZE 200, 010 OF oDlg PIXEL FONT oFontTit
	@ 173, 008 GET oMemoRet VAR cTextoRet MEMO SIZE 410, 070 OF oDlg PIXEL FONT oFont
	oMemoRet:bWhen := {|| .F.}

	If SZZ->ZZ_STATUS == "3"
		@ 248, 008 BUTTON "Reprocessar Mensagem" SIZE 085, 016 OF oDlg PIXEL ;
			ACTION (U_BJReproc(), oDlg:End())
	EndIf

	@ 248, 333 BUTTON "Fechar" SIZE 085, 016 OF oDlg PIXEL ACTION oDlg:End()

	ACTIVATE MSDIALOG oDlg CENTERED

	// Os controles GET/MEMO (oMemoEnv, oMemoRet) podem liberar a fonte que
	// usam ao fechar o dialogo, junto com o proprio oDlg:End(). Quando isso
	// acontece, o :Destroy() manual abaixo vira uma segunda liberacao do
	// mesmo objeto, e a AdvPL reporta "Cannot find method TFONT:DESTROY" em
	// vez de simplesmente ignorar. BEGIN SEQUENCE evita que essa falha
	// aborte a rotina e deixe o RestArea (linha seguinte) sem executar.
	BEGIN SEQUENCE
		oFont:Destroy()
	RECOVER
	END SEQUENCE

	BEGIN SEQUENCE
		oFontTit:Destroy()
	RECOVER
	END SEQUENCE

	RestArea(aArea)

Return Nil

/*/{Protheus.doc} BJColePar
Dispara a coleta com tela de parametros por entidade (Sim/Nao) e datas.
/*/
User Function BJColePar()

	Local aParam    := {}
	Local aRet      := {}
	Local aCat      := U_BJCATALO()
	Local aSelEnt   := {}
	Local aTotal    := {0, 0, 0, 0}
	Local nX        := 0
	Local nPosRet   := 0
	Local dDataDe   := Date() - 30
	Local dDataAte  := Date()

	// ParamBox:
	// 1. Data Inicial
	// 2. Data Final
	// 3..N. Sim/Nao para cada entidade do catalogo (semelhante ao SINCMAX)
	aAdd(aParam, {1, "Data Inicial", dDataDe , "", ".T.", "", ".T.", 60, .T.})
	aAdd(aParam, {1, "Data Final"  , dDataAte, "", ".T.", "", ".T.", 60, .T.})

	For nX := 1 To Len(aCat)
		// 1 = Sim, 2 = Nao. Por padrao, 1 se ativa no catalogo, 2 se inativa.
		aAdd(aParam, {2, "Atu. " + aCat[nX][2] + "?", Iif(aCat[nX][5], 1, 2), {"1 - Sim", "2 - Nao"}, 80, ".T.", .F.})
	Next nX

	If !ParamBox(aParam, "Parametros para Coleta de Dados", @aRet)
		Return Nil
	EndIf

	dDataDe  := aRet[1]
	dDataAte := aRet[2]

	If !Empty(dDataDe) .And. !Empty(dDataAte) .And. dDataDe > dDataAte
		MsgStop("A data inicial nao pode ser maior que a data final.", "Parametros de Coleta")
		Return Nil
	EndIf

	// Monta a lista de entidades selecionadas com "1 - Sim"
	For nX := 1 To Len(aCat)
		nPosRet := 2 + nX
		If nPosRet <= Len(aRet) .And. aRet[nPosRet] == 1
			aAdd(aSelEnt, aCat[nX][1])
		EndIf
	Next nX

	If Len(aSelEnt) == 0
		MsgInfo("Nenhuma entidade foi selecionada para atualizacao.", "Coleta de Dados")
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJCOLETA(.F., aSelEnt, "", dDataDe, dDataAte)}, "Coletando dados para a Plataforma BJ...")

	MsgInfo("Coleta finalizada!" + CRLF + CRLF + ;
		"Lidos da base   : " + cValToChar(aTotal[1]) + CRLF + ;
		"Enfileirados    : " + cValToChar(aTotal[2]) + CRLF + ;
		"Entidades       : " + cValToChar(aTotal[3]) + CRLF + ;
		"Erros na leitura: " + cValToChar(aTotal[4]), "Coleta de Dados")

Return Nil

/*/{Protheus.doc} BJEnviPar
Dispara o envio/dreno de saida com tela de parametros (Limite).
/*/
User Function BJEnviPar()

	Local aParam := {}
	Local aRet   := {}
	Local aTotal := {0, 0, 0}
	Local nLimit := 0

	aAdd(aParam, {1, "Limite de mensagens (0 = Todas)", 0, "99999", "", "", "", 60, .F.})

	If !ParamBox(aParam, "Parametros para Envio a Plataforma", @aRet)
		Return Nil
	EndIf

	nLimit := aRet[1]

	Processa({|| aTotal := U_BJDRENA(nLimit)}, "Enviando fila para a Plataforma BJ...")

	MsgInfo("Envio finalizado!" + CRLF + CRLF + ;
		"Lidas da fila : " + cValToChar(aTotal[1]) + CRLF + ;
		"Enviadas (OK) : " + cValToChar(aTotal[2]) + CRLF + ;
		"Com Erro      : " + cValToChar(aTotal[3]), "Dreno de Saida")

Return Nil

/*/{Protheus.doc} BJRetoPar
Dispara o retorno de orcamentos aprovados da plataforma.
/*/
User Function BJRetoPar()

	Local aTotal := {0, 0, 0, 0}

	If !MsgYesNo("Deseja buscar agora os orcamentos aprovados na Plataforma BJ para gerar no ERP?", "Retorno")
		Return Nil
	EndIf

	Processa({|| aTotal := U_BJRETORNO()}, "Recebendo orcamentos da Plataforma BJ...")

	MsgInfo("Retorno concluido!" + CRLF + CRLF + ;
		"Lidos da API       : " + cValToChar(aTotal[1]) + CRLF + ;
		"Gerados no ERP     : " + cValToChar(aTotal[2]) + CRLF + ;
		"Ja existentes      : " + cValToChar(aTotal[3]) + CRLF + ;
		"Erros na gravacao  : " + cValToChar(aTotal[4]), "Retorno de Orcamentos")

Return Nil

/*/{Protheus.doc} BJReproc
Coloca a mensagem selecionada com erro de volta em status pendente.
/*/
User Function BJReproc()

	Local cSeq := ""

	If Eof() .Or. SZZ->ZZ_CHVORI == "*CONTROLE*"
		MsgInfo("Selecione um registro valido na fila.", "Reprocessar")
		Return Nil
	EndIf

	If SZZ->ZZ_STATUS != BJ_ERRO
		MsgInfo("Somente mensagens com status de ERRO podem ser reprocessadas.", "Reprocessar")
		Return Nil
	EndIf

	cSeq := AllTrim(SZZ->ZZ_SEQUEN)

	If !MsgYesNo("Deseja recolocar a mensagem " + cSeq + " (" + AllTrim(SZZ->ZZ_ENTID) + ;
		" - " + AllTrim(SZZ->ZZ_CHVORI) + ") na fila como PENDENTE?", "Reprocessar")
		Return Nil
	EndIf

	RecLock("SZZ", .F.)
	SZZ->ZZ_STATUS := BJ_PENDENTE
	SZZ->ZZ_TENTAT := 0
	SZZ->ZZ_HTTP   := 0
	SZZ->ZZ_RETORN := "Mensagem recolocada em pendente para reprocessamento manual."
	SZZ->(MsUnlock())

	MsgInfo("Mensagem " + cSeq + " pronta para reenvio no proximo ciclo!", "Reprocessar")

Return Nil

/*/{Protheus.doc} BJResumo
Exibe o painel consolidado com a situacao da fila e o horario de corte por entidade.
/*/
User Function BJResumo()

	Local oDlg   := Nil
	Local oFont  := Nil
	Local oMemo  := Nil
	Local cTexto := ""

	oFont  := TFont():New("Courier New", , -12, .T.)
	cTexto := BJMontaResumo()

	DEFINE MSDIALOG oDlg TITLE "Painel de Situacao da Fila BJ" FROM 000, 000 TO 450, 780 PIXEL

	@ 008, 008 GET oMemo VAR cTexto MEMO SIZE 764, 385 OF oDlg PIXEL FONT oFont
	oMemo:bWhen := {|| .F.}

	@ 400, 345 BUTTON "Fechar" SIZE 080, 016 OF oDlg PIXEL ACTION oDlg:End()

	ACTIVATE MSDIALOG oDlg CENTERED

	// Mesmo risco de BJVerMsg: o GET MEMO pode ja ter liberado a fonte junto
	// com o oDlg:End(), e o :Destroy() manual viraria uma segunda liberacao.
	BEGIN SEQUENCE
		oFont:Destroy()
	RECOVER
	END SEQUENCE

Return Nil

/*/{Protheus.doc} BJMontaResumo
Monta o texto consolidado com os totalizadores da fila.
/*/
Static Function BJMontaResumo()

	Local cRet      := ""
	Local aCat      := U_BJCATALO()
	Local cMarca    := ""
	Local nX        := 0
	Local nPen      := 0
	Local nErr      := 0
	Local nOk       := 0
	Local nTotPen   := 0
	Local nTotErr   := 0
	Local nTotOk    := 0
	Local cAliasQry := ""
	Local cQuery    := ""

	cRet := "RESUMO DA INTEGRACAO PLATAFORMA BJ - " + DtoC(Date()) + " " + Time() + CRLF
	cRet += Replicate("=", 95) + CRLF + CRLF
	cRet += "Empresa: " + cEmpAnt + " | Filial: " + cFilAnt + CRLF
	cRet += "URL API: " + AllTrim(SuperGetMV("MV_BJAPI01", .F., "(nao cadastrada)")) + CRLF + CRLF
	cRet += PadR("ENTIDADE", 22) + PadR("ULTIMA COLETA (UTC)", 24) + ;
	        PadL("PENDENTES", 11) + PadL("ERROS", 9) + PadL("CONCLUIDAS", 13) + CRLF
	cRet += Replicate("-", 95) + CRLF

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(3)) // ZZ_FILIAL + ZZ_ENTID + ZZ_CHVORI

	For nX := 1 To Len(aCat)

		cMarca := ""
		If SZZ->(dbSeek(xFilial("SZZ") + PadR(aCat[nX][1], TamSX3("ZZ_ENTID")[1]) + PadR("*CONTROLE*", TamSX3("ZZ_CHVORI")[1])))
			cMarca := AllTrim(SZZ->ZZ_MARCA)
		EndIf
		If Empty(cMarca)
			cMarca := "(primeira carga)"
		EndIf

		nPen := 0
		nErr := 0
		nOk  := 0

		cQuery := "SELECT ZZ_STATUS, COUNT(*) AS QTD "
		cQuery += "  FROM " + RetSqlName("SZZ") + " SZZ "
		cQuery += " WHERE SZZ.D_E_L_E_T_ = ' ' "
		cQuery += "   AND SZZ.ZZ_FILIAL  = '" + xFilial("SZZ") + "' "
		cQuery += "   AND SZZ.ZZ_ENTID   = '" + aCat[nX][1] + "' "
		cQuery += "   AND SZZ.ZZ_CHVORI  <> '*CONTROLE*' "
		cQuery += " GROUP BY ZZ_STATUS "

		cAliasQry := MPSysOpenQuery(ChangeQuery(cQuery))

		While (cAliasQry)->(!Eof())
			Do Case
				Case (cAliasQry)->ZZ_STATUS $ "0|1"
					nPen += (cAliasQry)->QTD
				Case (cAliasQry)->ZZ_STATUS == "3"
					nErr += (cAliasQry)->QTD
				Case (cAliasQry)->ZZ_STATUS == "2"
					nOk  += (cAliasQry)->QTD
			EndCase
			(cAliasQry)->(dbSkip())
		EndDo

		(cAliasQry)->(dbCloseArea())

		cRet += PadR(aCat[nX][1], 22) + PadR(cMarca, 24) + ;
		        PadL(cValToChar(nPen), 11) + PadL(cValToChar(nErr), 9) + PadL(cValToChar(nOk), 13) + CRLF

		nTotPen += nPen
		nTotErr += nErr
		nTotOk  += nOk

	Next nX

	cRet += Replicate("-", 95) + CRLF
	cRet += PadR("TOTAL CONSOLIDADO", 46) + ;
	        PadL(cValToChar(nTotPen), 11) + PadL(cValToChar(nTotErr), 9) + PadL(cValToChar(nTotOk), 13) + CRLF

Return cRet

/*/{Protheus.doc} BJMudaCorte
Permite consultar e ajustar o horario de corte da entidade na SZZ.
/*/
User Function BJMudaCorte()

	Local aCat      := U_BJCATALO()
	Local aOpcoes   := {}
	Local nX        := 0
	Local aParam    := {}
	Local aRet      := {}
	Local cEntid    := ""
	Local cMarca    := ""
	Local cNova     := ""
	Local cQrySeq   := ""
	Local cAliasSeq := ""
	Local cSeq      := ""
	Local nTamSeq   := TamSX3("ZZ_SEQUEN")[1]

	If nTamSeq <= 0
		nTamSeq := 10
	EndIf

	For nX := 1 To Len(aCat)
		aAdd(aOpcoes, aCat[nX][1] + " - " + aCat[nX][2])
	Next nX

	aAdd(aParam, {2, "Selecione a Entidade", 1, aOpcoes, 120, ".T.", .F.})
	aAdd(aParam, {1, "Novo Horario de Corte (UTC)", Space(19), "", "", "", "", 120, .T.})

	If !ParamBox(aParam, "Ajustar Data/Hora de Corte na SZZ", @aRet)
		Return Nil
	EndIf

	cEntid := aCat[aRet[1]][1]
	cNova  := AllTrim(aRet[2])

	If Len(cNova) < 10
		MsgStop("Informe a data e hora completa no formato AAAA-MM-DD HH:MM:SS.", "Horario de Corte")
		Return Nil
	EndIf

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(3)) // ZZ_FILIAL + ZZ_ENTID + ZZ_CHVORI

	If SZZ->(dbSeek(xFilial("SZZ") + PadR(cEntid, TamSX3("ZZ_ENTID")[1]) + PadR("*CONTROLE*", TamSX3("ZZ_CHVORI")[1])))
		cMarca := AllTrim(SZZ->ZZ_MARCA)
		RecLock("SZZ", .F.)
	Else
		cMarca := "(nenhum)"
		cQrySeq := "SELECT MAX(ZZ_SEQUEN) AS MAXSEQ FROM " + RetSqlName("SZZ") + " WHERE ZZ_FILIAL = '" + xFilial("SZZ") + "' AND D_E_L_E_T_ = ' '"
		cAliasSeq := MPSysOpenQuery(ChangeQuery(cQrySeq))
		If (cAliasSeq)->(!Eof()) .And. !Empty((cAliasSeq)->MAXSEQ)
			cSeq := Soma1(PadL(AllTrim((cAliasSeq)->MAXSEQ), nTamSeq, "0"))
		Else
			cSeq := StrZero(1, nTamSeq)
		EndIf
		(cAliasSeq)->(dbCloseArea())

		RecLock("SZZ", .T.)
		SZZ->ZZ_FILIAL := xFilial("SZZ")
		SZZ->ZZ_SEQUEN := cSeq
		SZZ->ZZ_TIPO   := BJ_SAIDA
		SZZ->ZZ_ENTID  := cEntid
		SZZ->ZZ_CHVORI := "*CONTROLE*"
		SZZ->ZZ_STATUS := BJ_EXECUTADA
		SZZ->ZZ_DTCRIA := Date()
		SZZ->ZZ_HRCRIA := Time()
	EndIf

	If !MsgYesNo("Confirma a alteracao da marca d'agua de " + cEntid + "?" + CRLF + CRLF + ;
		"Horario anterior : " + cMarca + CRLF + ;
		"Novo horario     : " + cNova + CRLF + CRLF + ;
		"Recuar a data fara a proxima coleta reprocessar o intervalo.", "Confirmacao")
		SZZ->(MsUnlock())
		Return Nil
	EndIf

	SZZ->ZZ_MARCA  := cNova
	SZZ->ZZ_DTEXEC := Date()
	SZZ->ZZ_HREXEC := Time()
	SZZ->(MsUnlock())

	MsgInfo("Horario de corte de " + cEntid + " atualizado com sucesso!", "Horario de Corte")

Return Nil
