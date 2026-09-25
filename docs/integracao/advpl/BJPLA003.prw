#include "totvs.ch"

// Sentido e status sao escritos como literal no ponto de uso, com o comentario
// na frente - quem documenta os valores e o combo do campo no SX3:
//
//    ZZ_TIPO     "S" saida (ERP -> plataforma)   "E" entrada (plataforma -> ERP)
//    ZZ_STATUS   "1" pendente         "2" executada    "3" erro
//    ZY_STATUS   "1" nao processado   "2" processado   "3" erro
//
// Os ajustes sao parametros, lidos com SuperGetMV onde sao usados:
//
//    MV_BJAPI03  Habilita a integracao (S/N)
//    MV_BJAPI10  Recuo da marca d agua quando nao ha marca valida e a fila de
//                saida ja tem mensagens, em dias. Com a fila vazia e carga
//                inicial: a origem e lida inteira

/*/{Protheus.doc} BJPLA003
Coleta dos dados do ERP para envio a Plataforma BJ.
@type    function
@author  Ricardo P Sotomayor
@since   01/09/2026
/*/

// ===========================================================================
// VARREDURA
// ===========================================================================

/*/{Protheus.doc} BJVARRE
Varre as entidades e enfileira o que mudou.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   xEntid  , variant  , Id da entidade (character) ou lista de IDs (array). Vazio varre o catalogo ativo
@param   cChave  , character, Chave unica a reprocessar. Ignora a marca d'agua
@param   dDataDe , date     , Data inicial opcional (ignora corte e usa inicio do dia em UTC)
@param   dDataAte, date     , Data final opcional (limite ate o fim do dia em UTC)
@param   oProcess, object   , MsNewProcess do monitor, para as reguas. Nil no agendamento
@param   lEnvDel , logical  , .T. manda o que foi excluido na origem como DELETE. .F. filtra o D_E_L_E_T_ e nao manda exclusao nenhuma. Default .T.
@return  array, {nLidos, nEnfileirados, nEntidades, nErros, cLote, cFalhas}. cFalhas lista, uma por linha, cada erro com a entidade e o motivo
@example aTot := U_BJVARRE("produtos", "", Date() - 7, Date())
/*/
User Function BJVARRE(xEntid, cChave, dDataDe, dDataAte, oProcess, lEnvDel)

	Local aTotal    := {0, 0, 0, 0, "", ""}
	Local aCat      := U_BJCATALO()
	Local nX        := 0
	Local cSeqMae   := ""
	Local cAgora    := ""
	Local cMarca    := ""
	Local nTamSeq   := 0
	Local cQuerySeq := ""
	Local cAliasSeq := ""
	Local oStmtSeq  := Nil
	Local nSeg      := Seconds()
	Local cTrava    := ""
	Local lCarga    := .F.
	Local aVarrer   := {}

	Default xEntid   := ""
	Default cChave   := ""
	Default dDataDe  := CToD("//")
	Default dDataAte := CToD("//")
	Default lEnvDel  := .T.

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Nada a varrer.", 0, 0, {})
		Return aTotal

	EndIf

	// Uma coleta por vez, venha do agendamento ou do monitor: os dois chamam
	// esta funcao. A trava e por nome (LockByName): o servidor a solta quando a thread termina,
	// mesmo que caia com erro - nao sobra trava para apagar a mao.
	cTrava := "BJPLA_COLETA"

	If !LockByName(cTrava, .T., .F.)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Coleta ja em andamento. Chamada ignorada.", 0, 0, {})
		Return aTotal
	EndIf

	// A hora vem em UTC porque o S_T_A_M_P_ e escrito pelo gatilho do DBAccess em UTC.
	// Um instante so para o lote inteiro - todas as entidades varridas nesta chamada
	// usam o mesmo corte.
	cAgora := Left(StrTran(StrTran(FWTimeStamp(6, Date(), Time()), "T", " "), "Z", ""), 19)

	If !Empty(dDataDe)
		// Data inicial informada pelo usuario: inicio do dia em UTC, ignora a marca.
		cMarca := Left(StrTran(StrTran(FWTimeStamp(6, dDataDe, "00:00:00"), "T", " "), "Z", ""), 19)
	Else
		// Carga inicial: se a fila nunca teve mensagem de saida, nada chegou a
		// plataforma ainda. A marca fica vazia e os mapeadores, sem janela, leem a
		// origem inteira - nao so os ultimos MV_BJAPI10 dias.
		cQuerySeq := "SELECT COUNT(*) AS QTDSAI "
		cQuerySeq += "  FROM " + RetSqlName("SZZ") + " SZZ "
		cQuerySeq += " WHERE SZZ.D_E_L_E_T_ = ' ' "
		cQuerySeq += "   AND SZZ.ZZ_FILIAL  = ? "
		cQuerySeq += "   AND SZZ.ZZ_TIPO    = ? "

		oStmtSeq := FWExecStatement():New(ChangeQuery(cQuerySeq))
		oStmtSeq:SetString(1, xFilial("SZZ"))
		oStmtSeq:SetString(2, "S")   // saida
		cAliasSeq := oStmtSeq:OpenAlias()

		lCarga := (cAliasSeq)->(Eof()) .Or. (cAliasSeq)->QTDSAI == 0

		(cAliasSeq)->(dbCloseArea())
		oStmtSeq:Destroy()
	EndIf

	If lCarga
		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Fila de saida vazia (SZZ): carga inicial, origem inteira.", 0, 0, {})
	ElseIf Empty(dDataDe)
		// Marca d'agua do ultimo processamento VALIDO - aquele que varreu o catalogo
		// inteiro sem erro. So esses gravam ZY_MARCA, entao a marca preenchida e o
		// proprio atestado de validade; o envio nao entra nessa conta, porque uma
		// mensagem que falhou continua na fila do lote dela e sera reenviada de la.
		//
		// A marca guardada e o CORTE da coleta, nao o fim dela: a das 10:00 que
		// terminou 10:30 grava 10:00, e a proxima varre (10:00, 11:00]. Gravasse
		// 10:30, tudo que mudou durante a propria varredura ficaria sem coletar.
		cQuerySeq := "SELECT ZY_MARCA "
		cQuerySeq += "  FROM " + RetSqlName("SZY") + " SZY "
		cQuerySeq += " WHERE SZY.D_E_L_E_T_ = ' ' "
		cQuerySeq += "   AND SZY.ZY_FILIAL  = ? "
		cQuerySeq += "   AND SZY.ZY_MARCA   <> ? "
		cQuerySeq += " ORDER BY SZY.ZY_CODIGO DESC "

		oStmtSeq := FWExecStatement():New(ChangeQuery(cQuerySeq))
		oStmtSeq:SetString(1, xFilial("SZY"))
		oStmtSeq:SetString(2, "")
		cAliasSeq := oStmtSeq:OpenAlias()

		If (cAliasSeq)->(!Eof())
			cMarca := AllTrim((cAliasSeq)->ZY_MARCA)
		EndIf

		(cAliasSeq)->(dbCloseArea())
		oStmtSeq:Destroy()

		If Empty(cMarca) .Or. Len(cMarca) < 10
			// Fila ja tem mensagens, mas nenhum lote valido gravou marca: recua
			// MV_BJAPI10 dias (30 por padrao)
			cMarca := Left(StrTran(StrTran(FWTimeStamp(6, Date() - SuperGetMV("MV_BJAPI10", .F., 30), "00:00:00"), "T", " "), "Z", ""), 19)
		EndIf
	EndIf

	// Abre o lote (SZY): uma linha por chamada de BJVARRE, nao mais por entidade.
	nTamSeq := TamSX3("ZY_CODIGO")[1]
	If nTamSeq <= 0
		nTamSeq := 9
	EndIf

	cQuerySeq := "SELECT MAX(ZY_CODIGO) AS MAXSEQ "
	cQuerySeq += "  FROM " + RetSqlName("SZY") + " SZY "
	cQuerySeq += " WHERE SZY.D_E_L_E_T_ = ' ' "
	cQuerySeq += "   AND SZY.ZY_FILIAL  = ? "

	oStmtSeq := FWExecStatement():New(ChangeQuery(cQuerySeq))
	oStmtSeq:SetString(1, xFilial("SZY"))
	cAliasSeq := oStmtSeq:OpenAlias()

	If (cAliasSeq)->(!Eof()) .And. !Empty((cAliasSeq)->MAXSEQ)
		cSeqMae := Soma1(PadL(AllTrim((cAliasSeq)->MAXSEQ), nTamSeq, "0"))
	Else
		cSeqMae := StrZero(1, nTamSeq)
	EndIf

	(cAliasSeq)->(dbCloseArea())
	oStmtSeq:Destroy()

	dbSelectArea("SZY")
	RecLock("SZY", .T.)
	SZY->ZY_FILIAL := xFilial("SZY")
	SZY->ZY_CODIGO := cSeqMae
	SZY->ZY_DTINI  := Date()
	SZY->ZY_HRINI  := Time()
	SZY->ZY_STATUS := "1"
	SZY->(MsUnlock())

	// Quem chamou precisa saber que lote esta coleta abriu, para drenar so ele
	aTotal[5] := cSeqMae

	// Primeiro as entidades que esta chamada varre, para a regua saber o total
	For nX := 1 To Len(aCat)

		// Lista de entidades (grupo). Lista VAZIA e o "Todos": nao e um grupo sem
		// nenhuma entidade, e sim a ausencia de recorte - cai no catalogo ativo
		// inteiro, logo abaixo.
		If ValType(xEntid) == "A" .And. Len(xEntid) > 0
			If aScan(xEntid, {|cId| cId == aCat[nX][1]}) == 0
				Loop
			EndIf
		ElseIf ValType(xEntid) == "C" .And. !Empty(xEntid) .And. !(aCat[nX][1] == xEntid)
			Loop
		EndIf

		// Sem entidade explicita, respeita a marcacao de ativo do catalogo
		If Empty(xEntid) .And. !aCat[nX][5]
			Loop
		EndIf

		aAdd(aVarrer, aCat[nX])

	Next nX

	// Regua 1 por entidade, regua 2 pelos registros dela (em BJVarreEnt). So o
	// monitor passa oProcess; no agendamento nao ha tela.
	If ValType(oProcess) == "O"
		oProcess:SetRegua1(Len(aVarrer))
	EndIf

	For nX := 1 To Len(aVarrer)

		If ValType(oProcess) == "O"
			If oProcess:lEnd
				FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Varredura interrompida pelo usuario no lote " + cSeqMae, 0, 0, {})
				Exit
			EndIf
			oProcess:IncRegua1(aVarrer[nX][2] + " - " + cValToChar(nX) + " de " + cValToChar(Len(aVarrer)) + "...")
		EndIf

		BJVarreEnt(aVarrer[nX], cChave, @aTotal, dDataAte, cSeqMae, cAgora, cMarca, oProcess, lEnvDel)

	Next nX

	// Fecha o lote (SZY): fim e totais agregados de todas as entidades desta chamada.
	dbSelectArea("SZY")
	SZY->(dbSetOrder(1)) // ZY_FILIAL + ZY_CODIGO

	If SZY->(dbSeek(xFilial("SZY") + cSeqMae))
		RecLock("SZY", .F.)
		SZY->ZY_DTFIM   := Date()
		SZY->ZY_HRFIM   := Time()
		SZY->ZY_QTDLIDO := aTotal[1]
		SZY->ZY_QTDENV  := aTotal[2]
		SZY->ZY_QTDERR  := aTotal[4]

		// O lote fecha "1" - coletado, esperando o envio. Quem o marca "2" e o
		// BJDRENA, depois de mandar as mensagens dele. Coleta com erro ja fecha "3",
		// e coleta que nao enfileirou nada fecha "2": nao ha o que enviar.
		If aTotal[4] > 0
			SZY->ZY_STATUS := "3"   // erro
		ElseIf aTotal[2] == 0
			SZY->ZY_STATUS := "2"   // nada mudou desde a marca anterior
		Else
			SZY->ZY_STATUS := "1"   // coletado, aguardando envio
		EndIf

		// A marca so avanca quando a coleta inteira passou sem erro e nao foi
		// pontual. Como a leitura dela filtra ZY_STATUS = "2", a janela so vale
		// como concluida depois que as mensagens do lote sairem.
		If aTotal[4] == 0 .And. Empty(cChave) .And. Empty(dDataDe) .And. Empty(dDataAte)
			SZY->ZY_MARCA := cAgora
		EndIf

		SZY->(MsUnlock())
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Varredura concluida - lote " + cSeqMae + " - lidos: " + cValToChar(aTotal[1]) + ;
		" enfileirados: " + cValToChar(aTotal[2]) + ;
		" entidades: " + cValToChar(aTotal[3]) + ;
		" erros: " + cValToChar(aTotal[4]) + " - " + cValToChar(Round(Seconds() - nSeg, 2)) + "s", 0, 0, {})

	UnLockByName(cTrava, .T., .F.)

Return aTotal

/*/{Protheus.doc} SchedDef
Define as rotinas deste fonte como agendaveis pelo Schedule do Protheus.
@type    Static Function
@author  Ricardo P Sotomayor
@since   17/09/2026
@return  array, Parametros do agendamento
/*/
Static Function SchedDef()

	Local aParam := {"R", "", "", {"T"}, ""}

Return aParam


/*/{Protheus.doc} BJVarreEnt
Varre uma entidade e enfileira os registros que ela devolver, sob o lote
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aEnt    , array    , Linha do catalogo
@param   cChave  , character, Chave unica a reprocessar
@param   aTotal  , array    , [Referencia] Totalizadores
@param   dDataAte, date     , Data final opcional
@param   cSeqMae , character, ZY_CODIGO do lote (SZY) aberto por BJVARRE
@param   cAgora  , character, Instante de corte do lote, UTC, lido por BJVARRE
@param   cMarca  , character, Inicio do intervalo a varrer, UTC, achado por BJVARRE
@param   oProcess, object   , MsNewProcess do monitor, para a regua 2. Nil no agendamento
@param   lEnvDel , logical  , .T. manda o excluido como DELETE. .F. filtra o D_E_L_E_T_ ja na origem
@return  Nil
/*/
Static Function BJVarreEnt(aEnt, cChave, aTotal, dDataAte, cSeqMae, cAgora, cMarca, oProcess, lEnvDel)

	Local cId       := aEnt[1]
	Local cColeta   := aEnt[4]
	Local aDados    := {}
	Local cMarcaFim := ""
	Local cSeq      := ""
	Local nX        := 0
	Local nSeg      := Seconds()
	Local bColeta   := Nil
	Local cTrava    := "BJPLA_ENT_" + Upper(AllTrim(cId))
	Local aArea     := GetArea()

	Default lEnvDel := .T.

	// Uma varredura por entidade de cada vez. Se a trava estiver tomada, outro processo esta varrendo esta entidade agora.
	If !LockByName(cTrava, .T., .F.)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Entidade " + cId + " ignorada: trava " + cTrava + ;
			" tomada por outra coleta em andamento. Lote " + cSeqMae, 0, 0, {})
		aTotal[4] += 1
		aTotal[6] += cId + ": trava " + cTrava + " tomada por outra coleta" + CRLF
		RestArea(aArea)
		Return Nil
	EndIf

	// Se data final foi informada pelo usuario, usa o fim do dia em UTC.
	// Se nao informada (Job agendado ou varredura padrao), pega ate a hora atual (cAgora),
	// cobrindo tudo entre a ultima importacao e a atual.
	If !Empty(dDataAte)
		cMarcaFim := Left(StrTran(StrTran(FWTimeStamp(6, dDataAte, "23:59:59"), "T", " "), "Z", ""), 19)
	Else
		cMarcaFim := cAgora
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Coletando " + aEnt[2] + " (" + cId + ") - lote " + cSeqMae + ;
		" - intervalo: " + cMarca + " ate " + cMarcaFim + " - deletados: " + IIf(lEnvDel, "sim", "nao"), 0, 0, {})

	// Enquanto o mapeador le a origem ainda nao se sabe quantos registros vem
	If ValType(oProcess) == "O"
		oProcess:SetRegua2(1)
		oProcess:IncRegua2("Lendo " + aEnt[2] + " na origem...")
	EndIf

	// O mapeador e chamado por macro: cada entidade tem a sua.
	bColeta := &("{|cRef, cChv, cFim, lDel| " + cColeta + "(cRef, cChv, cFim, lDel) }")
	aDados  := Eval(bColeta, cMarca, cChave, cMarcaFim, lEnvDel)

	If ValType(aDados) != "A"
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mapeador " + cColeta + " nao devolveu array. Entidade " + cId + " ignorada.", 0, 0, {})
		aTotal[4] += 1
		aTotal[6] += cId + ": " + cColeta + " nao devolveu array" + CRLF

		UnLockByName(cTrava, .T., .F.)
		RestArea(aArea)
		Return Nil
	EndIf

	aTotal[1] += Len(aDados)

	If ValType(oProcess) == "O"
		oProcess:SetRegua2(Len(aDados))
	EndIf

	For nX := 1 To Len(aDados)

		If ValType(oProcess) == "O"
			If oProcess:lEnd
				FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Coleta da entidade " + cId + " interrompida pelo usuario.", 0, 0, {})
				Exit
			EndIf
			oProcess:IncRegua2("Registro: " + cValToChar(nX) + " de " + cValToChar(Len(aDados)) + ". " + ;
				Transform(Round(nX * 100 / Len(aDados), 2), "@E 999.99") + "%")
		EndIf

		// Registro que chega excluido sem nunca ter tido POST foi incluido e
		// excluido entre duas coletas. A coleta le o estado atual, entao so veria
		// o DELETE; a inclusao entra antes na fila, com os dados que a linha
		// excluida ainda guarda, e a plataforma recebe os dois eventos na ordem.
		If aDados[nX][3] == "DELETE" .And. !U_BJTEVE("S", cId, aDados[nX][1], "POST")
			cSeq := U_BJENFILA("S", cId, aDados[nX][1], "POST", BJJsonInc(aDados[nX][2]), cSeqMae)   // saida

			If Empty(cSeq)
				aTotal[4] += 1
				aTotal[6] += cId + ": inclusao da chave " + cValToChar(aDados[nX][1]) + " nao entrou na fila" + CRLF
			Else
				aTotal[1] += 1
				aTotal[2] += 1
			EndIf
		EndIf

		// aDados[nX] = {cChaveRegistro, oJsonPayload, cVerbo}
		cSeq := U_BJENFILA("S", cId, aDados[nX][1], aDados[nX][3], aDados[nX][2]:ToJson(), cSeqMae)   // saida

		If Empty(cSeq)
			aTotal[4] += 1
			aTotal[6] += cId + ": chave " + cValToChar(aDados[nX][1]) + " nao entrou na fila" + CRLF
		Else
			aTotal[2] += 1
		EndIf

	Next nX

	aTotal[3] += 1

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Concluido " + cId + " em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s - " + ;
		cValToChar(Len(aDados)) + " registros enfileirados", 0, 0, {})

	UnLockByName(cTrava, .T., .F.)

	RestArea(aArea)

Return Nil

/*/{Protheus.doc} BJJsonInc
JSON da inclusao de um registro que a coleta ja encontrou excluido.
O mapeador monta o payload com os itens da linha excluida marcados "delete";
na inclusao eles entram ativos, como estavam quando o registro foi criado.
@type    Static Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@param   oJson, object, Payload montado pelo mapeador
@return  character, JSON da inclusao
/*/
Static Function BJJsonInc(oJson)

	Local oInc   := JsonObject():New()
	Local aItens := {}
	Local nX     := 0

	// Copia, para nao alterar o payload do DELETE que vai logo depois
	oInc:FromJson(oJson:ToJson())

	If ValType(oInc["ativo"]) == "L"
		oInc["ativo"] := .T.
	EndIf

	aItens := oInc["itens"]

	If ValType(aItens) == "A"
		For nX := 1 To Len(aItens)
			If ValType(aItens[nX]["delete"]) == "L"
				aItens[nX]["delete"] := .F.
			EndIf
		Next nX
	EndIf

Return oInc:ToJson()

// ===========================================================================
// MAPEADORES DE CADASTRO
// ===========================================================================

/*/{Protheus.doc} BJMAPRGD
Regras de desconto - SZ0.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPRGD(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet    := {}
	Local cJanCab := ""
	Local cJanDet := ""
	Local aFaixas := {}
	Local cQryFx  := ""
	Local cAlsFx  := ""
	Local oStmtFx := Nil
	Local oFaixa  := Nil
	Local cCod   := ""
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT Z0_FILIAL, Z0_CODIGO, Z0_DESC, Z0_DESCAUT, Z0_PERMAX, Z0_COMISS, Z0_PADRAO, Z0_MSBLQL, SZ0.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("SZ0") + " SZ0 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SZ0.Z0_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SZ0.D_E_L_E_T_ = ' ' "
	EndIf

	cQuery += "   AND SZ0.Z0_SEQ    = ? "

	If !Empty(cChave)
		cQuery += "   AND SZ0.Z0_CODIGO = ? "
	EndIf

	// Cabecalho e faixa tem S_T_A_M_P_ proprio: mexer numa faixa nao encosta na
	// linha "001". Sem o OR, alterar so uma faixa nao subiria a regra.
	//
	// A janela inteira vale dos dois lados do OR. So o piso no detalhe deixaria
	// entrar faixa alterada DEPOIS do corte, que pertence a janela seguinte.
	If !Empty(cMarca) .And. Empty(cChave)

		cJanCab := "SZ0.S_T_A_M_P_ >= '" + cMarca + "'"
		cJanDet := "SZ0D.S_T_A_M_P_ >= '" + cMarca + "'"

		If !Empty(cMarcaFim)
			cJanCab += " AND SZ0.S_T_A_M_P_ <= '" + cMarcaFim + "'"
			cJanDet += " AND SZ0D.S_T_A_M_P_ <= '" + cMarcaFim + "'"
		EndIf

		cQuery += "   AND ((" + cJanCab + ") "
		cQuery += "        OR EXISTS (SELECT 1 "
		cQuery += "                     FROM " + RetSQLName("SZ0") + " SZ0D "
		cQuery += "                    WHERE SZ0D.Z0_FILIAL = SZ0.Z0_FILIAL "
		cQuery += "                      AND SZ0D.Z0_CODIGO = SZ0.Z0_CODIGO "
		cQuery += "                      AND " + cJanDet + ")) "

	EndIf

	cQuery += " ORDER BY Z0_CODIGO "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SZ0"))
	oStmt:SetString(3, "001")

	If !Empty(cChave)
		// cChave e a chave de integracao, prefixada pela filial; o filtro e por Z0_CODIGO, sem
		// prefixo. Sai so o primeiro segmento - codigo com hifen atravessa inteiro.
		cCod := AllTrim(cChave)

		If At("-", cCod) > 0
			cCod := SubStr(cCod, At("-", cCod) + 1)
		EndIf

		oStmt:SetString(4, PadR(cCod, TamSX3("Z0_CODIGO")[1]))
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["chave"]                  := (cAlias)->Z0_FILIAL + "-" + (cAlias)->Z0_CODIGO
		oJson["codigoErp"]              := AllTrim((cAlias)->Z0_CODIGO)
		oJson["descricao"]              := AllTrim((cAlias)->Z0_DESC)
		oJson["percDescontoAutorizado"] := (cAlias)->Z0_DESCAUT
		oJson["percDescontoMaximo"]     := (cAlias)->Z0_PERMAX
		oJson["percComissao"]           := (cAlias)->Z0_COMISS
		oJson["padrao"]                 := (AllTrim((cAlias)->Z0_PADRAO) == "1")
		oJson["ativo"]                  := !(AllTrim(cValToChar((cAlias)->Z0_MSBLQL)) == "1")
		// Faixas da regra, lidas dentro do laco da propria regra. Os nomes levam o
		// sufixo Fx porque o cursor de fora (cAlias/cQuery/oStmt) continua aberto e
		// ainda vai avancar.
		aFaixas := {}

		cQryFx := "SELECT Z0_SEQ, Z0_PERCDE, Z0_PERCATE, Z0_BASE, SZ0.D_E_L_E_T_ AS FAIXA_DELETADA "
		cQryFx += "  FROM " + RetSQLName("SZ0") + " SZ0 "
		cQryFx += " WHERE ? = ' ' "
		cQryFx += "   AND SZ0.Z0_FILIAL  = ? "

		// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
		// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
		// filtro vale em qualquer coleta: linha excluida nem sai da origem.
		If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
			cQryFx += "   AND SZ0.D_E_L_E_T_ = ' ' "
		EndIf

		cQryFx += "   AND SZ0.Z0_CODIGO  = ? "
		cQryFx += " ORDER BY Z0_SEQ "

		oStmtFx := FWExecStatement():New(ChangeQuery(cQryFx))
		oStmtFx:SetString(1, " ")
		oStmtFx:SetString(2, FWxFilial("SZ0"))
		oStmtFx:SetString(3, AllTrim((cAlias)->Z0_CODIGO))

		cAlsFx := oStmtFx:OpenAlias()

		While (cAlsFx)->(!Eof())

			oFaixa := JsonObject():New()
			oFaixa["sequencia"]        := Val((cAlsFx)->Z0_SEQ)
			oFaixa["percInicial"]      := (cAlsFx)->Z0_PERCDE
			oFaixa["percFinal"]        := (cAlsFx)->Z0_PERCATE
			oFaixa["percBaseComissao"] := (cAlsFx)->Z0_BASE
			oFaixa["delete"]           := !Empty((cAlsFx)->FAIXA_DELETADA)

			aAdd(aFaixas, oFaixa)

			(cAlsFx)->(dbSkip())
		End

		(cAlsFx)->(dbCloseArea())
		oStmtFx:Destroy()

		oJson["faixas"]                 := aFaixas

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["chave"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPCAT
Categorias - SZ1 (tipo de produto, as raizes) e SBM (grupo de produtos, as filhas).
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPCAT(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet   := {}
	Local cCod   := ""
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	// ----- SZ1: as raizes, que sobem primeiro porque a API exige a pai antes
	cQuery := "SELECT Z1_FILIAL, Z1_TIPO, Z1_DESCRIC, SZ1.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("SZ1") + " SZ1 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SZ1.Z1_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SZ1.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		cQuery += "   AND SZ1.Z1_TIPO = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SZ1.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SZ1.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY Z1_TIPO "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SZ1"))

	If !Empty(cChave)
		// cChave e a chave de integracao, prefixada pela filial; o filtro e por Z1_TIPO, sem
		// prefixo. Sai so o primeiro segmento - codigo com hifen atravessa inteiro.
		cCod := AllTrim(cChave)

		If At("-", cCod) > 0
			cCod := SubStr(cCod, At("-", cCod) + 1)
		EndIf

		oStmt:SetString(3, PadR(cCod, TamSX3("Z1_TIPO")[1]))
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["chave"]               := (cAlias)->Z1_FILIAL + "-" + (cAlias)->Z1_TIPO
		oJson["codigoErp"]           := AllTrim((cAlias)->Z1_TIPO)
		oJson["descricao"]           := AllTrim((cAlias)->Z1_DESCRIC)
		oJson["categoriaPaiChave"]   := Nil
		oJson["regraDescontoChave"]  := Nil
		oJson["ativo"]               := .T.

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["chave"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

	// ----- SBM: as filhas, apontando para a raiz em Z1_TIPO
	DbSelectArea("SBM")
	cQuery := "SELECT BM_FILIAL, BM_GRUPO, BM_DESC, BM_YTIPO, "

	If SBM->(FieldPos("BM_MSBLQL")) > 0
		cQuery += " BM_MSBLQL, "
	Else
		cQuery += " '2' as BM_MSBLQL, "
	EndIf
	cQuery += " SBM.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("SBM") + " SBM "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SBM.BM_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SBM.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		cQuery += "   AND SBM.BM_GRUPO = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SBM.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SBM.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY BM_YTIPO, BM_GRUPO "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SBM"))

	If !Empty(cChave)
		// cChave e a chave de integracao, prefixada pela filial; o filtro e por BM_GRUPO, sem
		// prefixo. Sai so o primeiro segmento - codigo com hifen atravessa inteiro.
		cCod := AllTrim(cChave)

		If At("-", cCod) > 0
			cCod := SubStr(cCod, At("-", cCod) + 1)
		EndIf

		oStmt:SetString(3, PadR(cCod, TamSX3("BM_GRUPO")[1]))
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["chave"]               := (cAlias)->BM_FILIAL + "-" + (cAlias)->BM_GRUPO
		oJson["codigoErp"]           := AllTrim((cAlias)->BM_GRUPO)
		oJson["descricao"]           := AllTrim((cAlias)->BM_DESC)
		oJson["regraDescontoChave"]  := Nil

		// Grupo sem tipo sobe como raiz. E dado inconsistente no cadastro, mas
		// mandar categoriaPaiCodigo apontando para vazio faria a API recusar o
		// registro inteiro.
		If Empty((cAlias)->BM_YTIPO)
			oJson["categoriaPaiChave"]  := Nil
		Else
			oJson["categoriaPaiChave"]  := FWxFilial("SZ1") + "-" + AllTrim((cAlias)->BM_YTIPO)
		EndIf

		oJson["ativo"] := !(AllTrim(cValToChar((cAlias)->BM_MSBLQL)) == "1")

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["chave"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPCND
Condicoes de pagamento - SE4.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPCND(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet   := {}
	Local cCod   := ""
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT E4_FILIAL, E4_CODIGO, E4_DESCRI, E4_FORMA, E4_MSBLQL, SE4.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("SE4") + " SE4 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SE4.E4_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SE4.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		cQuery += "   AND SE4.E4_CODIGO = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SE4.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SE4.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY E4_CODIGO "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SE4"))

	If !Empty(cChave)
		// cChave e a chave de integracao, prefixada pela filial; o filtro e por E4_CODIGO, sem
		// prefixo. Sai so o primeiro segmento - codigo com hifen atravessa inteiro.
		cCod := AllTrim(cChave)

		If At("-", cCod) > 0
			cCod := SubStr(cCod, At("-", cCod) + 1)
		EndIf

		oStmt:SetString(3, PadR(cCod, TamSX3("E4_CODIGO")[1]))
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["chave"]     := (cAlias)->E4_FILIAL + "-" + (cAlias)->E4_CODIGO
		oJson["codigoErp"] := AllTrim((cAlias)->E4_CODIGO)
		oJson["descricao"] := AllTrim((cAlias)->E4_DESCRI)
		oJson["ativo"]     := !(AllTrim(cValToChar((cAlias)->E4_MSBLQL)) == "1")

		If Empty((cAlias)->E4_FORMA)
			oJson["forma"] := Nil
		Else
			oJson["forma"] := AllTrim((cAlias)->E4_FORMA)
		EndIf

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["chave"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPARM
Armazens - NNR.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPARM(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet   := {}
	Local cCod   := ""
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT NNR_FILIAL, NNR_CODIGO, NNR_DESCRI, NNR_MSBLQL, NNR.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("NNR") + " NNR "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND NNR.NNR_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND NNR.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		cQuery += "   AND NNR.NNR_CODIGO = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND NNR.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND NNR.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY NNR_CODIGO "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("NNR"))

	If !Empty(cChave)
		// cChave e a chave de integracao, prefixada pela filial; o filtro e por NNR_CODIGO, sem
		// prefixo. Sai so o primeiro segmento - codigo com hifen atravessa inteiro.
		cCod := AllTrim(cChave)

		If At("-", cCod) > 0
			cCod := SubStr(cCod, At("-", cCod) + 1)
		EndIf

		oStmt:SetString(3, PadR(cCod, TamSX3("NNR_CODIGO")[1]))
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["chave"]     := (cAlias)->NNR_FILIAL + "-" + (cAlias)->NNR_CODIGO
		oJson["codigoErp"] := AllTrim((cAlias)->NNR_CODIGO)
		oJson["descricao"] := AllTrim((cAlias)->NNR_DESCRI)
		oJson["ativo"]     := !(AllTrim(cValToChar((cAlias)->NNR_MSBLQL)) == "1")

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["chave"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPPRD
Produtos - SB1.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPPRD(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet   := {}
	Local cCod   := ""
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil
	Local lQE    := SB1->(FieldPos("B1_QE"))      > 0
	Local lPrv   := SB1->(FieldPos("B1_PRV1"))    > 0
	Local lGtin  := SB1->(FieldPos("B1_CODGTIN")) > 0
	Local lPeso  := SB1->(FieldPos("B1_PESO"))    > 0
	Local lProc  := SB1->(FieldPos("B1_PROC"))    > 0 .And. SB1->(FieldPos("B1_LOJPROC")) > 0
	Local lXFor  := SB1->(FieldPos("B1_XFOR"))    > 0
	Local lXDesF := SB1->(FieldPos("B1_XDESFOR")) > 0
	Local lXTec  := SB1->(FieldPos("B1_XTEC"))    > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT B1_FILIAL, B1_COD, B1_DESC, B1_UM, B1_GRUPO, B1_TPRCG, B1_LOCPAD, B1_POSIPI, B1_CODBAR, B1_MSBLQL, SB1.D_E_L_E_T_ AS DELETADO "

	If lQE
		cQuery += ", B1_QE "
	EndIf
	If lPrv
		cQuery += ", B1_PRV1 "
	EndIf
	If lGtin
		cQuery += ", B1_CODGTIN "
	EndIf
	If lPeso
		cQuery += ", B1_PESO "
	EndIf
	If lProc
		cQuery += ", B1_PROC, B1_LOJPROC "
	EndIf
	If lXFor
		cQuery += ", B1_XFOR "
	EndIf
	If lXDesF
		cQuery += ", B1_XDESFOR "
	EndIf
	If lXTec
		cQuery += ", B1_XTEC "
	EndIf

	cQuery += "  FROM " + RetSQLName("SB1") + " SB1 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SB1.B1_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SB1.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		cQuery += "   AND SB1.B1_COD = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SB1.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SB1.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY B1_COD "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SB1"))

	If !Empty(cChave)
		// cChave e a chave de integracao, prefixada pela filial; o filtro e por B1_COD, sem
		// prefixo. Sai so o primeiro segmento - codigo com hifen atravessa inteiro.
		cCod := AllTrim(cChave)

		If At("-", cCod) > 0
			cCod := SubStr(cCod, At("-", cCod) + 1)
		EndIf

		oStmt:SetString(3, PadR(cCod, TamSX3("B1_COD")[1]))
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["chave"]               := (cAlias)->B1_FILIAL + "-" + (cAlias)->B1_COD
		oJson["codigoErp"]           := AllTrim((cAlias)->B1_COD)
		oJson["descricao"]           := AllTrim((cAlias)->B1_DESC)
		If Empty((cAlias)->B1_LOCPAD)
			oJson["armazemChave"] := Nil
		Else
			oJson["armazemChave"] := FWxFilial("NNR") + "-" + (cAlias)->B1_LOCPAD
		EndIf
		oJson["regraDescontoChave"]  := Nil
		oJson["ativo"]               := !(AllTrim(cValToChar((cAlias)->B1_MSBLQL)) == "1")

		If Empty((cAlias)->B1_UM)
			oJson["unidade"] := Nil
		Else
			oJson["unidade"] := AllTrim((cAlias)->B1_UM)
		EndIf

		If Empty((cAlias)->B1_POSIPI)
			oJson["ncm"] := Nil
		Else
			oJson["ncm"] := AllTrim((cAlias)->B1_POSIPI)
		EndIf

		// Tipo e a categoria raiz; grupo e a subcategoria. Produto sem tipo sobe
		// so com a subcategoria - mandar categoriaCodigo vazio faria a API procurar
		// um cadastro de codigo vazio e recusar o registro.
		If Empty((cAlias)->B1_TPRCG)
			oJson["categoriaChave"]  := Nil
		Else
			oJson["categoriaChave"]  := FWxFilial("SZ1") + "-" + AllTrim((cAlias)->B1_TPRCG)
		EndIf

		If Empty((cAlias)->B1_GRUPO)
			oJson["subCategoriaChave"]  := Nil
		Else
			oJson["subCategoriaChave"]  := FWxFilial("SBM") + "-" + AllTrim((cAlias)->B1_GRUPO)
		EndIf

		// Codigo de barras: GTIN quando existir, senao o campo classico
		If lGtin .And. !Empty((cAlias)->B1_CODGTIN)
			oJson["codigoBarras"] := AllTrim((cAlias)->B1_CODGTIN)
		ElseIf Empty((cAlias)->B1_CODBAR)
			oJson["codigoBarras"] := Nil
		Else
			oJson["codigoBarras"] := AllTrim((cAlias)->B1_CODBAR)
		EndIf

		If lQE
			oJson["qtdEmbalagem"] := (cAlias)->B1_QE
		EndIf
		If lPeso
			oJson["peso"] := (cAlias)->B1_PESO
		EndIf
		If lPrv
			oJson["ultimoPreco"] := (cAlias)->B1_PRV1
		EndIf

		If lProc .And. !Empty((cAlias)->B1_PROC)
			oJson["fabricanteChave"] := FWxFilial("SA2") + "-" + AllTrim((cAlias)->B1_PROC) + "-" + AllTrim((cAlias)->B1_LOJPROC)
		Else
			oJson["fabricanteChave"] := Nil
		EndIf

		If lXFor .And. !Empty((cAlias)->B1_XFOR)
			oJson["codigoFabricante"] := AllTrim((cAlias)->B1_XFOR)
		Else
			oJson["codigoFabricante"] := Nil
		EndIf

		If lXDesF .And. !Empty((cAlias)->B1_XDESFOR)
			oJson["descricaoFabricante"] := AllTrim((cAlias)->B1_XDESFOR)
		Else
			oJson["descricaoFabricante"] := Nil
		EndIf

		If lXTec .And. !Empty((cAlias)->B1_XTEC)
			oJson["dadosTecnicos"] := AllTrim((cAlias)->B1_XTEC)
		Else
			oJson["dadosTecnicos"] := Nil
		EndIf

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["chave"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPVND
Vendedores - SA3.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPVND(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet    := {}
	Local aSuper  := {}
	Local cChvSup := ""
	Local cCod    := ""
	Local cAlias  := ""
	Local cQuery  := ""
	Local cVerbo  := ""
	Local oStmt   := Nil
	Local oJson   := Nil
	Local cTel    := ""
	Local lBloq   := .F.
	Local lComis  := SA3->(FieldPos("A3_COMIS"))   > 0
	Local lSuper  := SA3->(FieldPos("A3_SUPER"))   > 0
	Local lGeren  := SA3->(FieldPos("A3_GEREN"))   > 0
	Local lCel    := SA3->(FieldPos("A3_CEL"))     > 0
	Local aGerent := {}
	Local aSuperv := {}
	Local lEhGer  := .F.
	Local lEhSup  := .F.
	Local cSupOri := ""

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT A3_FILIAL, A3_COD, A3_NOME, A3_NREDUZ, A3_EMAIL, A3_TEL, A3_DDDTEL, A3_MSBLQL, SA3.D_E_L_E_T_ AS DELETADO "

	If lComis
		cQuery += ", A3_COMIS "
	EndIf
	If lSuper
		cQuery += ", A3_SUPER "
	EndIf
	If lGeren
		cQuery += ", A3_GEREN "
	EndIf
	If lCel
		cQuery += ", A3_CEL "
	EndIf

	cQuery += "  FROM " + RetSQLName("SA3") + " SA3 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SA3.A3_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SA3.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		cQuery += "   AND SA3.A3_COD = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SA3.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SA3.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY A3_COD "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SA3"))

	If !Empty(cChave)
		// cChave e a chave de integracao, prefixada pela filial; o filtro e por A3_COD, sem
		// prefixo. Sai so o primeiro segmento - codigo com hifen atravessa inteiro.
		cCod := AllTrim(cChave)

		If At("-", cCod) > 0
			cCod := SubStr(cCod, At("-", cCod) + 1)
		EndIf

		oStmt:SetString(3, PadR(cCod, TamSX3("A3_COD")[1]))
	EndIf

	// Quem e gerente e quem e supervisor sai do proprio cadastro: gerente e o
	// codigo que aparece em algum A3_GEREN, supervisor o que aparece em algum
	// A3_SUPER, e o resto e vendedor. Duas consultas curtas, antes da principal,
	// porque o papel de uma linha depende do que as outras apontam.
	aGerent := BJCodsRef("A3_GEREN", lGeren)
	aSuperv := BJCodsRef("A3_SUPER", lSuper)

	// A SA3 fica posicionavel por codigo: o superior de um vendedor e outro
	// vendedor, e cada linha confere se ele existe antes de mandar a referencia.
	dbSelectArea("SA3")
	SA3->(dbSetOrder(1))

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		// Celular tem precedencia sobre o fixo: e o numero que o comercial usa
		If lCel .And. !Empty((cAlias)->A3_CEL)
			cTel := AllTrim((cAlias)->A3_CEL)
		Else
			cTel := AllTrim((cAlias)->A3_DDDTEL) + AllTrim((cAlias)->A3_TEL)
		EndIf

		lBloq := (AllTrim(cValToChar((cAlias)->A3_MSBLQL)) == "1")

		oJson := JsonObject():New()
		oJson["chave"]          := (cAlias)->A3_FILIAL + "-" + (cAlias)->A3_COD
		oJson["codigoErp"]      := AllTrim((cAlias)->A3_COD)
		oJson["nome"]           := AllTrim((cAlias)->A3_NOME)
		oJson["dataNascimento"] := Nil
		oJson["ativo"]          := !lBloq
		oJson["desligado"]      := lBloq

		If Empty((cAlias)->A3_NREDUZ)
			oJson["nomeReduzido"] := Nil
		Else
			oJson["nomeReduzido"] := AllTrim((cAlias)->A3_NREDUZ)
		EndIf

		If Empty((cAlias)->A3_EMAIL)
			oJson["email"] := Nil
		Else
			oJson["email"] := AllTrim((cAlias)->A3_EMAIL)
		EndIf

		If Empty(cTel)
			oJson["telefone"] := Nil
		Else
			oJson["telefone"] := cTel
		EndIf

		If lComis
			oJson["percComissao"] := (cAlias)->A3_COMIS
		EndIf

		// O papel decide a quem a linha responde: gerente nao responde a ninguem,
		// supervisor responde ao gerente dele (A3_GEREN) e vendedor ao supervisor
		// dele (A3_SUPER). A plataforma guarda um superior so, e trata gerente e
		// supervisor como o mesmo papel - superior.
		lEhGer  := aScan(aGerent, {|c| c == AllTrim((cAlias)->A3_COD)}) > 0
		lEhSup  := !lEhGer .And. aScan(aSuperv, {|c| c == AllTrim((cAlias)->A3_COD)}) > 0
		cSupOri := ""

		If lEhGer
			cSupOri := ""
		ElseIf lEhSup .And. lGeren
			cSupOri := (cAlias)->A3_GEREN
		ElseIf !lEhSup .And. lSuper
			cSupOri := (cAlias)->A3_SUPER
		EndIf

		cChvSup := ""
		oJson["supervisorChave"] := Nil

		// Autorreferencia (o campo aponta para o proprio codigo) acontece no
		// cadastro e nao quer dizer nada: mandar assim exigiria que a linha ja
		// existisse na plataforma para poder ser criada.
		If !Empty(cSupOri) .And. !(AllTrim(cSupOri) == AllTrim((cAlias)->A3_COD))

			If SA3->(dbSeek(xFilial("SA3") + PadR(cSupOri, TamSX3("A3_COD")[1]))) .And. !SA3->(Deleted())
				cChvSup := FWxFilial("SA3") + "-" + cSupOri
				oJson["supervisorChave"] := cChvSup
			Else
				FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Vendedor " + AllTrim((cAlias)->A3_COD) + ;
					" responde ao codigo " + AllTrim(cSupOri) + ", que nao existe (ou esta excluido) na SA3. Sobe sem superior.", 0, 0, {})
			EndIf
		EndIf

		// Gerente e supervisor entram como superior; o resto, como vendedor.
		oJson["supervisor"] := (lEhGer .Or. lEhSup)
		oJson["vendedor"]   := !(lEhGer .Or. lEhSup)

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["chave"], oJson, cVerbo})
		aAdd(aSuper, cChvSup)

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

	aRet := BJOrdSup(aRet, aSuper)

Return aRet

/*/{Protheus.doc} BJCodsRef
Codigos que aparecem num campo de chefia da SA3, sem repetir.
Gerente e supervisor nao sao marcados no cadastro: quem esta em algum
A3_GEREN e gerente, quem esta em algum A3_SUPER e supervisor, e o resto e
vendedor. A consulta e a propria definicao do papel.
@type    Static Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@param   cCampo, character, "A3_GEREN" ou "A3_SUPER"
@param   lTem  , logical  , .F. quando o campo nao existe no dicionario
@return  array, Codigos ja com AllTrim
/*/
Static Function BJCodsRef(cCampo, lTem)

	Local aRet   := {}
	Local cQuery := ""
	Local cAlias := ""
	Local oStmt  := Nil

	Default cCampo := ""
	Default lTem   := .F.

	If !lTem
		Return {}
	EndIf

	cQuery := "SELECT DISTINCT " + cCampo + " AS CHEFIA "
	cQuery += "  FROM " + RetSQLName("SA3") + " SA3 "
	cQuery += " WHERE SA3.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SA3.A3_FILIAL  = ? "
	cQuery += "   AND " + cCampo + " <> ? "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, FWxFilial("SA3"))
	oStmt:SetString(2, " ")

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())
		aAdd(aRet, AllTrim((cAlias)->CHEFIA))
		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJOrdSup
Poe os vendedores na ordem em que a API aceita: o supervisor antes de quem
responde a ele.
A SA3 aponta para ela mesma, e a hierarquia tem mais de um nivel (gerente,
supervisor, vendedor), entao nenhuma ordenacao de SQL resolve: ordenar por
A3_SUPER acerta um nivel e erra o seguinte. Aqui cada volta emite quem ja pode
ir - sem supervisor, supervisor fora deste lote (ja esta na plataforma) ou
supervisor ja emitido - ate ninguem mais poder. O que sobrar e ciclo no
cadastro; vai como veio, e a API recusa so esses.
@type    Static Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@param   aRet  , array, {chave, oJson, cVerbo} de cada vendedor
@param   aSuper, array, Chave do supervisor de cada vendedor, na mesma ordem
@return  array, aRet reordenado
/*/
Static Function BJOrdSup(aRet, aSuper)

	Local aOrd   := {}
	Local aFeito := {}
	Local aFalta := {}
	Local aResta := {}
	Local lMudou := .T.
	Local nX     := 0
	Local cSup   := ""

	For nX := 1 To Len(aRet)
		aAdd(aFalta, nX)
	Next nX

	While lMudou .And. Len(aFalta) > 0

		lMudou := .F.
		aResta := {}

		For nX := 1 To Len(aFalta)

			cSup := AllTrim(aSuper[aFalta[nX]])

			If Empty(cSup) .Or. cSup == AllTrim(aRet[aFalta[nX]][1]) .Or. ;
				aScan(aFeito, {|c| c == cSup}) > 0 .Or. ;
				aScan(aRet, {|x| AllTrim(x[1]) == cSup}) == 0

				aAdd(aOrd, aRet[aFalta[nX]])
				aAdd(aFeito, AllTrim(aRet[aFalta[nX]][1]))
				lMudou := .T.

			Else
				aAdd(aResta, aFalta[nX])
			EndIf

		Next nX

		aFalta := aResta

	End

	For nX := 1 To Len(aFalta)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Vendedor " + AllTrim(aRet[aFalta[nX]][1]) + ;
			" esta num ciclo de supervisao na SA3. Enviado assim mesmo.", 0, 0, {})
		aAdd(aOrd, aRet[aFalta[nX]])
	Next nX

Return aOrd

/*/{Protheus.doc} BJMAPCLI
Clientes - SA1.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo + loja a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPCLI(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet    := {}
	Local aParte  := {}
	Local cAlias  := ""
	Local cQuery  := ""
	Local cVerbo  := ""
	Local oStmt   := Nil
	Local oJson   := Nil
	Local cCodigo := ""
	Local cCodSA1 := ""
	Local cLojSA1 := ""
	Local nTamLoj := TamSX3("A1_LOJA")[1]
	Local lGeo    := SA1->(FieldPos("A1_XLAT"))    > 0 .And. SA1->(FieldPos("A1_XLNG")) > 0
	Local lLimite := SA1->(FieldPos("A1_LC"))      > 0
	Local lVencLC := SA1->(FieldPos("A1_VENCLC"))  > 0
	Local lInscrM := SA1->(FieldPos("A1_INSCRM"))  > 0
	Local lPFisic := SA1->(FieldPos("A1_PFISICA")) > 0
	Local lUltCom := SA1->(FieldPos("A1_ULTCOM"))  > 0
	Local lPriCom := SA1->(FieldPos("A1_PRICOM"))  > 0
	Local lObs    := SA1->(FieldPos("A1_OBSERV"))  > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT A1_FILIAL, A1_COD, A1_LOJA, A1_NOME, A1_NREDUZ, A1_PESSOA, A1_CGC, A1_INSCR, A1_CONTRIB, SA1.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       A1_END, A1_COMPLEM, A1_BAIRRO, A1_MUN, A1_EST, A1_CEP, "
	cQuery += "       A1_DDD, A1_TEL, A1_CELULAR, A1_EMAIL, A1_CONTATO, "
	cQuery += "       A1_VEND, A1_TABELA, A1_COND, A1_MSBLQL "

	If lLimite
		cQuery += ", A1_LC "
	EndIf
	If lVencLC
		cQuery += ", A1_VENCLC "
	EndIf
	If lGeo
		cQuery += ", A1_XLAT, A1_XLNG "
	EndIf
	If lInscrM
		cQuery += ", A1_INSCRM "
	EndIf
	If lPFisic
		cQuery += ", A1_PFISICA "
	EndIf
	If lUltCom
		cQuery += ", A1_ULTCOM "
	EndIf
	If lPriCom
		cQuery += ", A1_PRICOM "
	EndIf
	If lObs
		cQuery += ", A1_OBSERV "
	EndIf

	cQuery += "  FROM " + RetSQLName("SA1") + " SA1 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SA1.A1_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SA1.D_E_L_E_T_ = ' ' "
	EndIf

	// A chave de integracao e filial-codigo-loja, separados por hifen. A
	// filial e a parte 1 e nao entra no filtro - concatenacao em SQL varia por
	// banco e nao entra na clausula.
	If !Empty(cChave)
		aParte := U_BJCHAVE(cChave, {"A1_FILIAL", "A1_COD", "A1_LOJA"})

		If Len(aParte) == 3
			cCodSA1 := aParte[2]
			cLojSA1 := aParte[3]
		Else
			// Chave informada sem o prefixo: codigo e loja colados, a loja
			// recuperada pelo tamanho fixo do campo no dicionario
			cCodSA1 := PadR(SubStr(AllTrim(cChave), 1, Len(AllTrim(cChave)) - nTamLoj), TamSX3("A1_COD")[1])
			cLojSA1 := PadR(Right(AllTrim(cChave), nTamLoj), nTamLoj)
		EndIf

		cQuery  += "   AND SA1.A1_COD  = ? "
		cQuery  += "   AND SA1.A1_LOJA = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SA1.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SA1.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY A1_COD, A1_LOJA "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SA1"))

	If !Empty(cChave)
		oStmt:SetString(3, cCodSA1)
		oStmt:SetString(4, cLojSA1)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		cCodigo := (cAlias)->A1_FILIAL + "-" + (cAlias)->A1_COD + "-" + (cAlias)->A1_LOJA

		oJson := JsonObject():New()
		oJson["chave"]                   := cCodigo
		oJson["codigoErp"]               := AllTrim((cAlias)->A1_COD + (cAlias)->A1_LOJA)
		oJson["razaoSocial"]             := AllTrim((cAlias)->A1_NOME)
		oJson["vendedorChave"]           := FWxFilial("SA3") + "-" + (cAlias)->A1_VEND
		If Empty((cAlias)->A1_TABELA)
			oJson["tabelaPrecoChave"] := Nil
		Else
			oJson["tabelaPrecoChave"] := FWxFilial("DA0") + "-" + (cAlias)->A1_TABELA
		EndIf
		If Empty((cAlias)->A1_COND)
			oJson["condicaoPagamentoChave"] := Nil
		Else
			oJson["condicaoPagamentoChave"] := FWxFilial("SE4") + "-" + (cAlias)->A1_COND
		EndIf
		oJson["ativo"]                   := !(AllTrim(cValToChar((cAlias)->A1_MSBLQL)) == "1")

		BJPoeTexto(oJson, "nomeFantasia"     , (cAlias)->A1_NREDUZ)
		BJPoeTexto(oJson, "cnpjCpf"          , (cAlias)->A1_CGC)
		BJPoeTexto(oJson, "inscricaoEstadual", (cAlias)->A1_INSCR)
		BJPoeTexto(oJson, "endereco"         , (cAlias)->A1_END)
		BJPoeTexto(oJson, "complemento"      , (cAlias)->A1_COMPLEM)
		BJPoeTexto(oJson, "bairro"           , (cAlias)->A1_BAIRRO)
		BJPoeTexto(oJson, "municipio"        , (cAlias)->A1_MUN)
		BJPoeTexto(oJson, "uf"               , (cAlias)->A1_EST)
		BJPoeTexto(oJson, "cep"              , (cAlias)->A1_CEP)
		BJPoeTexto(oJson, "contato"          , (cAlias)->A1_CONTATO)
		BJPoeTexto(oJson, "email"            , (cAlias)->A1_EMAIL)
		BJPoeTexto(oJson, "celular"          , (cAlias)->A1_CELULAR)

		// O contrato usa o enum tipoPessoa da plataforma, nao a letra do Protheus
		If AllTrim((cAlias)->A1_PESSOA) == "F"
			oJson["tipoPessoa"] := "fisica"
		Else
			oJson["tipoPessoa"] := "juridica"
		EndIf

		// Contribuinte de ICMS: no Protheus "1" = contribuinte
		oJson["contribuinteIcms"] := (AllTrim((cAlias)->A1_CONTRIB) == "1")

		// Telefone: o Protheus separa DDD do numero
		If Empty((cAlias)->A1_TEL)
			oJson["telefone"] := Nil
		Else
			oJson["telefone"] := AllTrim((cAlias)->A1_DDD) + AllTrim((cAlias)->A1_TEL)
		EndIf

		If lInscrM
			BJPoeTexto(oJson, "inscricaoMunicipal", (cAlias)->A1_INSCRM)
		EndIf
		If lPFisic
			BJPoeTexto(oJson, "rg", (cAlias)->A1_PFISICA)
		EndIf
		If lObs
			BJPoeTexto(oJson, "observacao", (cAlias)->A1_OBSERV)
		EndIf
		If lLimite
			oJson["limiteCredito"] := (cAlias)->A1_LC
		EndIf
		If lVencLC .And. !Empty((cAlias)->A1_VENCLC)
			oJson["vencimentoLimite"] := FWTimeStamp(3, SToD((cAlias)->A1_VENCLC), "00:00:00") + "Z"
		EndIf
		If lUltCom .And. !Empty((cAlias)->A1_ULTCOM)
			oJson["ultimaCompra"] := FWTimeStamp(3, SToD((cAlias)->A1_ULTCOM), "00:00:00") + "Z"
		EndIf
		If lPriCom .And. !Empty((cAlias)->A1_PRICOM)
			oJson["primeiraCompra"] := FWTimeStamp(3, SToD((cAlias)->A1_PRICOM), "00:00:00") + "Z"
		EndIf
		If lGeo
			oJson["latitude"]  := Val(StrTran(AllTrim((cAlias)->A1_XLAT), ",", "."))
			oJson["longitude"] := Val(StrTran(AllTrim((cAlias)->A1_XLNG), ",", "."))
		EndIf

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {cCodigo, oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJPoeTexto
Poe um campo de texto no payload, ou null quando ele esta vazio.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oJson , object   , [Referencia] Payload em montagem
@param   cCampo, character, Nome do campo no contrato
@param   cValor, character, Valor lido da tabela
@return  Nil
/*/
Static Function BJPoeTexto(oJson, cCampo, cValor)

	If Empty(cValor)
		oJson[cCampo] := Nil
	Else
		oJson[cCampo] := AllTrim(cValor)
	EndIf

Return Nil

/*/{Protheus.doc} BJMAPFOR
Fornecedores - SA2.
@type    User Function
@author  Ricardo P Sotomayor
@since   08/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Chave de integracao a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPFOR(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet    := {}
	Local aChave  := {}
	Local cAlias  := ""
	Local cQuery  := ""
	Local cVerbo  := ""
	Local cChvAux := ""
	Local oStmt   := Nil
	Local oJson   := Nil
	Local cCodigo := ""
	Local cCodSA2 := ""
	Local cLojSA2 := ""
	Local nTamLoj := TamSX3("A2_LOJA")[1]
	Local lCelula := SA2->(FieldPos("A2_CEL")) > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT A2_FILIAL, A2_COD, A2_LOJA, A2_NOME, A2_NREDUZ, A2_CGC, A2_INSCR, SA2.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       A2_INSCRM, A2_TIPO, A2_CONTATO, "
	cQuery += "       A2_END, A2_COMPLEM, A2_BAIRRO, A2_MUN, A2_EST, A2_CEP, "
	cQuery += "       A2_DDD, A2_TEL, A2_EMAIL, A2_MSBLQL "

	If lCelula
		cQuery += ", A2_CEL "
	EndIf

	cQuery += "  FROM " + RetSQLName("SA2") + " SA2 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SA2.A2_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SA2.D_E_L_E_T_ = ' ' "
	EndIf

	// A chave da API concatena filial, codigo e loja. Para reprocessar um
	// fornecedor, as tres partes sao separadas aqui - concatenacao em SQL varia
	// por banco e nao entra na clausula.
	If !Empty(cChave)
		cChvAux := AllTrim(cChave)
		If At("-", cChvAux) > 0
			cChvAux := SubStr(cChvAux, At("-", cChvAux) + 1)
		EndIf
		aChave := U_BJPARTES(cChvAux)

		If Len(aChave) >= 2
			cCodSA2 := aChave[1]
			cLojSA2 := aChave[2]
		Else
			cCodSA2 := cChvAux
			cLojSA2 := Space(nTamLoj)
		EndIf

		cQuery += "   AND SA2.A2_COD  = ? "
		cQuery += "   AND SA2.A2_LOJA = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SA2.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SA2.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY A2_COD, A2_LOJA "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SA2"))

	If !Empty(cChave)
		oStmt:SetString(3, cCodSA2)
		oStmt:SetString(4, cLojSA2)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		cCodigo := (cAlias)->A2_FILIAL + "-" + (cAlias)->A2_COD + "-" + (cAlias)->A2_LOJA

		oJson := JsonObject():New()
		oJson["chave"]       := cCodigo
		oJson["codigoErp"]      := AllTrim((cAlias)->A2_COD + (cAlias)->A2_LOJA)
		oJson["razaoSocial"] := AllTrim((cAlias)->A2_NOME)
		oJson["ativo"]       := !(AllTrim(cValToChar((cAlias)->A2_MSBLQL)) == "1")

		// A SA2 guarda o tipo em A2_TIPO, nao em A2_PESSOA como a SA1. Dominio
		// conferido nesta base em 08/09/2026: "J" em 1487 fornecedores, "F" em 12,
		// e 2 em branco.
		//
		// O branco nao pode virar juridica por omissao: o contrato nao aceita nulo
		// em tipoPessoa, entao a escolha e definitiva do lado de la, e um CPF
		// rotulado como CNPJ erra a formatacao e a validacao na tela. Nesses casos
		// quem decide e o documento - 11 digitos e CPF, o resto e CNPJ.
		If AllTrim((cAlias)->A2_TIPO) == "F"
			oJson["tipoPessoa"] := "fisica"
		ElseIf !Empty((cAlias)->A2_TIPO)
			oJson["tipoPessoa"] := "juridica"
		ElseIf Len(AllTrim((cAlias)->A2_CGC)) == 11
			oJson["tipoPessoa"] := "fisica"
		Else
			oJson["tipoPessoa"] := "juridica"
		EndIf

		BJPoeTexto(oJson, "nomeFantasia"     , (cAlias)->A2_NREDUZ)
		BJPoeTexto(oJson, "cnpjCpf"          , (cAlias)->A2_CGC)
		BJPoeTexto(oJson, "inscricaoEstadual", (cAlias)->A2_INSCR)
		BJPoeTexto(oJson, "endereco"         , (cAlias)->A2_END)
		BJPoeTexto(oJson, "complemento"      , (cAlias)->A2_COMPLEM)
		BJPoeTexto(oJson, "bairro"           , (cAlias)->A2_BAIRRO)
		BJPoeTexto(oJson, "municipio"        , (cAlias)->A2_MUN)
		BJPoeTexto(oJson, "uf"               , (cAlias)->A2_EST)
		BJPoeTexto(oJson, "cep"              , (cAlias)->A2_CEP)
		BJPoeTexto(oJson, "email"            , (cAlias)->A2_EMAIL)

		// Telefone: o Protheus separa DDD do numero
		If Empty((cAlias)->A2_TEL)
			oJson["telefone"] := Nil
		Else
			oJson["telefone"] := AllTrim((cAlias)->A2_DDD) + AllTrim((cAlias)->A2_TEL)
		EndIf

		BJPoeTexto(oJson, "inscricaoMunicipal", (cAlias)->A2_INSCRM)
		BJPoeTexto(oJson, "contato"           , (cAlias)->A2_CONTATO)

		// A2_CEL e o unico campo deste mapeador ainda nao conferido no SX3 - dai a
		// guarda. O telefone nao depende dele: sai de A2_DDD+A2_TEL, confirmados.
		If lCelula
			BJPoeTexto(oJson, "celular", (cAlias)->A2_CEL)
		EndIf

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {cCodigo, oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPTAB
Tabelas de preco - DA0 (cabecalho) e DA1 (itens).
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo de tabela a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPTAB(cMarca, cChave, cMarcaFim, lEnvDel)

	Local cJanCab := ""
	Local cJanDet := ""
	Local aRet    := {}
	Local aItens  := {}
	Local aChave  := {}
	Local cAlias  := ""
	Local cQuery  := ""
	Local cChvTab := ""
	Local cChvAnt := ""
	Local cVrbAnt := ""
	Local oStmt   := Nil
	Local oJson   := Nil
	Local oItem   := Nil
	Local lRegra  := DA1->(FieldPos("DA1_XDESC")) > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT DA0_FILIAL, DA0_CODTAB, DA0_DESCRI, DA0_DATDE, DA0_DATATE, DA0_ATIVO, DA0.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       DA1_FILIAL, DA1_ITEM, DA1_CODPRO, DA1_PRCVEN, DA1_ATIVO, DA1.D_E_L_E_T_ AS ITEM_DELETADO "

	If lRegra
		cQuery += ", DA1_XDESC "
	EndIf

	// O JOIN inclui ativos e excluidos, sem filtro de D_E_L_E_T_ nem na carga
	// inicial: o item excluido vai com delete no proprio item, e a plataforma
	// o apaga. Excluir um item que ela nunca recebeu nao faz nada. So "Envia
	// deletados? = Nao" corta o item excluido, e o corte vai no ON: no WHERE
	// ele derrubaria junto a tabela que so tem itens excluidos.
	cQuery += "  FROM " + RetSQLName("DA0") + " DA0 "
	cQuery += "  LEFT JOIN " + RetSQLName("DA1") + " DA1 "
	cQuery += "    ON DA1.DA1_FILIAL = DA0.DA0_FILIAL "
	cQuery += "   AND DA1.DA1_CODTAB = DA0.DA0_CODTAB "
	cQuery += "   AND DA1.R_E_C_N_O_ = (SELECT MAX(DA1X.R_E_C_N_O_) "
	cQuery += "                            FROM " + RetSQLName("DA1") + " DA1X "
	cQuery += "                           WHERE DA1X.DA1_FILIAL = DA1.DA1_FILIAL "
	cQuery += "                             AND DA1X.DA1_CODTAB = DA1.DA1_CODTAB "
	cQuery += "                             AND DA1X.DA1_CODPRO = DA1.DA1_CODPRO "
	cQuery += "                             AND DA1X.DA1_ITEM   = DA1.DA1_ITEM) "

	If !lEnvDel
		cQuery += "   AND DA1.D_E_L_E_T_ = ' ' "
	EndIf

	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND DA0.DA0_FILIAL = ? "
	cQuery += "   AND DA0.R_E_C_N_O_ = (SELECT MAX(DA0X.R_E_C_N_O_) "
	cQuery += "                            FROM " + RetSQLName("DA0") + " DA0X "
	cQuery += "                           WHERE DA0X.DA0_FILIAL = DA0.DA0_FILIAL "
	cQuery += "                             AND DA0X.DA0_CODTAB = DA0.DA0_CODTAB) "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND DA0.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		// cChave e a chave de integracao: filial-codigo. Filtra pelo codigo, a parte 2.
		cQuery += "   AND DA0.DA0_CODTAB = ? "
	ElseIf !Empty(cMarca)
		// O delta fica no nivel da TABELA, num EXISTS - nao na linha do JOIN.
		// Cabecalho e item tem S_T_A_M_P_ proprio: mexer no preco de um produto
		// toca a DA1 e nao encosta na DA0. E, posto no JOIN, a tabela voltaria com
		// so o item que mudou, e a plataforma apagaria os demais precos.
		// A janela inteira vale dos dois lados do OR: so o piso no detalhe deixaria
		// entrar item alterado DEPOIS do corte, que pertence a janela seguinte.
		cJanCab := "DA0.S_T_A_M_P_ >= '" + cMarca + "'"
		cJanDet := "DA1D.S_T_A_M_P_ >= '" + cMarca + "'"

		If !Empty(cMarcaFim)
			cJanCab += " AND DA0.S_T_A_M_P_ <= '" + cMarcaFim + "'"
			cJanDet += " AND DA1D.S_T_A_M_P_ <= '" + cMarcaFim + "'"
		EndIf

		cQuery += "   AND ((" + cJanCab + ") "
		cQuery += "        OR EXISTS (SELECT 1 "
		cQuery += "                     FROM " + RetSQLName("DA1") + " DA1D "
		cQuery += "                    WHERE DA1D.DA1_FILIAL = DA0.DA0_FILIAL "
		cQuery += "                      AND DA1D.DA1_CODTAB = DA0.DA0_CODTAB "
		cQuery += "                      AND " + cJanDet + ")) "
	EndIf

	cQuery += " ORDER BY DA0_CODTAB, DA1_CODPRO, DA1_ITEM "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("DA0"))

	If !Empty(cChave)
		aChave := U_BJPARTES(AllTrim(cChave))

		If Len(aChave) >= 2
			oStmt:SetString(3, PadR(aChave[2], TamSX3("DA0_CODTAB")[1]))
		Else
			oStmt:SetString(3, PadR(cChave, TamSX3("DA0_CODTAB")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		cChvTab := (cAlias)->DA0_FILIAL + "-" + (cAlias)->DA0_CODTAB

		If !(cChvTab == cChvAnt)

			If !Empty(cChvAnt)
				oJson["itens"] := aItens
				aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
			EndIf

			aItens := {}
			oJson  := JsonObject():New()

			oJson["chave"]     := cChvTab
			oJson["codigoErp"] := AllTrim((cAlias)->DA0_CODTAB)
			oJson["descricao"] := AllTrim((cAlias)->DA0_DESCRI)
			oJson["ativo"]     := (AllTrim((cAlias)->DA0_ATIVO) == "1")

			If Empty((cAlias)->DA0_DATDE)
				oJson["dtInicio"] := Nil
			Else
				oJson["dtInicio"] := FWTimeStamp(3, SToD((cAlias)->DA0_DATDE), "00:00:00") + "Z"
			EndIf

			If Empty((cAlias)->DA0_DATATE)
				oJson["dtFim"] := Nil
			Else
				oJson["dtFim"] := FWTimeStamp(3, SToD((cAlias)->DA0_DATATE), "00:00:00") + "Z"
			EndIf

			cChvAnt := cChvTab
			cVrbAnt := "POST"
			If (cAlias)->DELETADO == "*"
				cVrbAnt := "DELETE"
			EndIf
		EndIf

		If !Empty((cAlias)->DA1_CODPRO)

			oItem := JsonObject():New()

			// Chave do item: a chave unica da DA1 (X2_UNICO) - filial, tabela,
			// produto e item. O mesmo produto pode aparecer em mais de um item.
			// Item nao tem codigoErp: so e visto dentro da tabela de preco.
			oItem["chave"]         := (cAlias)->DA1_FILIAL + "-" + ;
			                          (cAlias)->DA0_CODTAB + "-" + ;
			                          (cAlias)->DA1_CODPRO + "-" + ;
			                          (cAlias)->DA1_ITEM
			oItem["produtoChave"]  := FWxFilial("SB1") + "-" + (cAlias)->DA1_CODPRO
			oItem["preco"]         := (cAlias)->DA1_PRCVEN
			oItem["ativo"]         := (AllTrim((cAlias)->DA1_ATIVO) == "1")
			oItem["delete"]        := !Empty((cAlias)->ITEM_DELETADO)

			If lRegra .And. !Empty((cAlias)->DA1_XDESC)
				oItem["regraDescontoChave"] := FWxFilial("SZ0") + "-" + AllTrim((cAlias)->DA1_XDESC)
			Else
				oItem["regraDescontoChave"]  := Nil
			EndIf

			aAdd(aItens, oItem)
		EndIf

		(cAlias)->(dbSkip())
	End

	If !Empty(cChvAnt)
		oJson["itens"] := aItens
		aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
	EndIf

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPEST
Saldo em estoque - SB2.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Chave "produto/armazem" a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPEST(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet    := {}
	Local aParte  := {}
	Local cAlias  := ""
	Local cQuery  := ""
	Local cVerbo  := ""
	Local oStmt   := Nil
	Local oJson   := Nil
	Local cChvReg := ""
	Local cProd   := ""
	Local cLocal  := ""
	Local cDataEnv := FWTimeStamp(6, Date(), Time())
	Local lCusto  := SB2->(FieldPos("B2_CM1"))    > 0
	Local lUltCom := SB2->(FieldPos("B2_DTUCOM")) > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT SB2.B2_FILIAL, SB2.B2_COD, SB2.B2_LOCAL, SB2.B2_QATU, SB2.B2_RESERVA, "
	cQuery += "       SB1.B1_FILIAL AS FILPROD, NNR.NNR_FILIAL AS FILARM, SB2.D_E_L_E_T_ AS DELETADO "

	If lCusto
		cQuery += ", B2_CM1 "
	EndIf
	If lUltCom
		cQuery += ", B2_DTUCOM "
	EndIf

	cQuery += "  FROM " + RetSQLName("SB2") + " SB2 "
	cQuery += " INNER JOIN " + RetSQLName("SB1") + " SB1 "
	cQuery += "    ON SB1.B1_FILIAL = ? "
	cQuery += "   AND SB1.B1_COD = SB2.B2_COD "
	cQuery += "   AND SB1.D_E_L_E_T_ = ' ' "
	cQuery += " INNER JOIN " + RetSQLName("NNR") + " NNR "
	cQuery += "    ON NNR.NNR_FILIAL = ? "
	cQuery += "   AND NNR.NNR_CODIGO = SB2.B2_LOCAL "
	cQuery += "   AND NNR.D_E_L_E_T_ = ' ' "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SB2.B2_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SB2.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		// cChave e a chave de integracao do estoque: a chave unica da SB2
		// (X2_UNICO), filial-produto-armazem, separados por hifen. A filial e a
		// parte 1 e nao entra no filtro, que e por B2_COD e B2_LOCAL.
		aParte := U_BJCHAVE(cChave, {"B2_FILIAL", "B2_COD", "B2_LOCAL"})

		If Len(aParte) == 3
			cProd  := aParte[2]
			cLocal := aParte[3]
		Else
			// Chave informada sem o prefixo de filial: produto-armazem
			aParte := U_BJPARTES(AllTrim(cChave))

			If Len(aParte) == 2
				cProd  := PadR(aParte[1], TamSX3("B2_COD")[1])
				cLocal := PadR(aParte[2], TamSX3("B2_LOCAL")[1])
			EndIf
		EndIf

		If Empty(cProd) .Or. Empty(cLocal)
			FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Chave " + cChave + " nao tem produto e armazem. Nada a coletar.", 0, 0, {})
			Return {}
		EndIf

		cQuery += "   AND SB2.B2_COD   = ? "
		cQuery += "   AND SB2.B2_LOCAL = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SB2.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SB2.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY B2_COD, B2_LOCAL "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, FWxFilial("SB1"))
	oStmt:SetString(2, FWxFilial("NNR"))
	oStmt:SetString(3, " ")
	oStmt:SetString(4, FWxFilial("SB2"))

	If !Empty(cChave)
		oStmt:SetString(5, cProd)
		oStmt:SetString(6, cLocal)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		cChvReg := (cAlias)->B2_FILIAL + "-" + (cAlias)->B2_COD + "-" + (cAlias)->B2_LOCAL

		oJson := JsonObject():New()
		oJson["chave"]         := cChvReg
		oJson["codigoErp"]     := AllTrim((cAlias)->B2_COD)
		oJson["produtoChave"]  := (cAlias)->FILPROD + "-" + (cAlias)->B2_COD
		oJson["armazemChave"]  := (cAlias)->FILARM + "-" + (cAlias)->B2_LOCAL
		oJson["saldo"]         := (cAlias)->B2_QATU
		oJson["dataEnvio"]     := cDataEnv
		oJson["reserva"]       := (cAlias)->B2_RESERVA

		If lCusto
			oJson["custo"] := (cAlias)->B2_CM1
		EndIf
		If lUltCom .And. !Empty((cAlias)->B2_DTUCOM)
			oJson["ultimaCompra"] := FWTimeStamp(3, SToD((cAlias)->B2_DTUCOM), "00:00:00") + "Z"
		EndIf

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {cChvReg, oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

// ===========================================================================
// MAPEADORES TRANSACIONAIS
// ===========================================================================

/*/{Protheus.doc} BJMAPNFS
Notas de saida - SF2 e SD2, na mesma leitura.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Chave de integracao a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPNFS(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet     := {}
	Local aItens   := {}
	Local aChave   := {}
	Local cAlias   := ""
	Local cQuery   := ""
	Local cChvNota := ""
	Local cChvAnt  := ""
	Local cVrbAnt  := ""
	Local oStmt    := Nil
	Local oJson    := Nil
	Local oItem    := Nil
	Local lIpi     := SF2->(FieldPos("F2_VALIPI"))  > 0
	Local lFrete   := SF2->(FieldPos("F2_FRETE"))   > 0
	Local lMens    := SF2->(FieldPos("F2_MENNOTA")) > 0
	Local lComis   := SD2->(FieldPos("D2_COMIS1"))  > 0
	Local lTabela  := SD2->(FieldPos("D2_PRUNIT"))  > 0
	Local lDev     := SD2->(FieldPos("D2_QTDEDEV")) > 0 .And. SD2->(FieldPos("D2_VALDEV")) > 0
	Local lRegra   := SD2->(FieldPos("D2_YDESC"))   > 0
	Local lTipoD2  := SD2->(FieldPos("D2_TIPO"))    > 0
	Local nDevNota := 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT F2_FILIAL, F2_DOC, F2_SERIE, F2_EMISSAO, SF2.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       F2_CLIENTE, F2_LOJA, F2_FORMUL, F2_VEND1, F2_COND, F2_ESPECIE, F2_TIPO, "
	cQuery += "       F2_VALBRUT, F2_VALMERC, F2_DESCONT, F2_VALICM, F2_CHVNFE, "
	cQuery += "       D2_FILIAL, D2_DOC, D2_SERIE, D2_CLIENTE, D2_LOJA, D2_ITEM, D2_COD, D2_QUANT, D2_PRCVEN, D2_TOTAL, D2_DESCON, "
	cQuery += "       D2_CF, D2_TP, SD2.D_E_L_E_T_ AS ITEM_DELETADO "

	If lIpi
		cQuery += ", F2_VALIPI "
	EndIf
	If lFrete
		cQuery += ", F2_FRETE "
	EndIf
	If lMens
		cQuery += ", F2_MENNOTA "
	EndIf
	If lComis
		cQuery += ", D2_COMIS1 "
	EndIf
	If lTabela
		cQuery += ", D2_PRUNIT "
	EndIf
	If lDev
		cQuery += ", D2_QTDEDEV, D2_VALDEV "
	EndIf
	If lRegra
		cQuery += ", D2_YDESC "
	EndIf

	// O JOIN inclui itens ativos e excluidos; o D_E_L_E_T_ vira delete no JSON.
	//
	// O relacionamento usa os campos da chave unica da SF2 que a SD2 tambem tem:
	// filial, documento, serie, cliente e loja. F2_DOC e F2_SERIE nao
	// identificam a nota sozinhos;
	// sem cliente e loja, duas notas com a mesma numeracao virariam produto
	// cartesiano e cada uma subiria com os itens das duas.
	//
	// D2_TIPO continua no relacionamento quando existe no dicionario, como
	// reforco para normal, devolucao e beneficiamento.
	cQuery += "  FROM " + RetSQLName("SF2") + " SF2 "
	cQuery += "  LEFT JOIN " + RetSQLName("SD2") + " SD2 "
	cQuery += "    ON SD2.D2_FILIAL  = SF2.F2_FILIAL "
	cQuery += "   AND SD2.D2_DOC     = SF2.F2_DOC "
	cQuery += "   AND SD2.D2_SERIE   = SF2.F2_SERIE "
	cQuery += "   AND SD2.D2_CLIENTE = SF2.F2_CLIENTE "
	cQuery += "   AND SD2.D2_LOJA    = SF2.F2_LOJA "

	If lTipoD2
		cQuery += "   AND SD2.D2_TIPO   = SF2.F2_TIPO "
	EndIf

	// Sem filtro de D_E_L_E_T_ nos itens, nem na carga inicial: o item excluido
	// vai com delete no proprio item. Excluir um item que a plataforma nunca
	// recebeu nao faz nada. So "Envia deletados? = Nao" corta o item excluido,
	// e o corte vai no ON: no WHERE ele derrubaria junto a nota inteira que so
	// tem itens excluidos.
	If !lEnvDel
		cQuery += "   AND SD2.D_E_L_E_T_ = ' ' "
	EndIf

	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SF2.F2_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SF2.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		// cChave e a chave de integracao: filial-documento-serie-cliente-loja-
		// formulario-tipo. Filtra pelo
		// documento, que e a parte 2 e nunca vem vazia. Se houver mais de uma nota
		// com esse numero (series ou clientes diferentes), todas sobem - cada uma
		// com a sua chave, e o POST e upsert.
		cQuery += "   AND SF2.F2_DOC = ? "
	Else
		If !Empty(cMarca)

			// Quem decide e o cabecalho: nota e documento fechado, e o que muda nela
			// muda a SF2. O JOIN traz todos os itens, entao o payload vai sempre
			// completo - cabecalho e itens -, nao um pedaco.
			cQuery += "   AND SF2.S_T_A_M_P_ >= '" + cMarca + "' "

			If !Empty(cMarcaFim)
				cQuery += "   AND SF2.S_T_A_M_P_ <= '" + cMarcaFim + "' "
			EndIf

		EndIf
	EndIf

	cQuery += "   AND F2_SERIE IN ('1','3') "
	
	// A ordem e a da quebra: os campos que formam a chave da nota, depois o item.
	// Sem isso o laco fecharia a mesma nota mais de uma vez.
	
	cQuery += " ORDER BY F2_DOC, F2_SERIE, F2_CLIENTE, F2_LOJA, F2_FORMUL, F2_TIPO, D2_COD, D2_ITEM "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SF2"))

	If !Empty(cChave)
		aChave := U_BJPARTES(AllTrim(cChave))

		If Len(aChave) >= 2
			oStmt:SetString(3, PadR(aChave[2], TamSX3("F2_DOC")[1]))
		Else
			oStmt:SetString(3, PadR(cChave, TamSX3("F2_DOC")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		// Chave de integracao da nota: a chave unica da SF2 (X2_UNICO), na mesma
		// ordem - filial, documento, serie, cliente, loja, formulario e tipo.
		cChvNota := (cAlias)->F2_FILIAL  + "-" + ;
		            (cAlias)->F2_DOC     + "-" + ;
		            (cAlias)->F2_SERIE   + "-" + ;
		            (cAlias)->F2_CLIENTE + "-" + ;
		            (cAlias)->F2_LOJA    + "-" + ;
		            (cAlias)->F2_FORMUL  + "-" + ;
		            (cAlias)->F2_TIPO

		If !(cChvNota == cChvAnt)

			// Fecha a nota anterior antes de comecar a proxima.
			If !Empty(cChvAnt)
				oJson["vlrDevolucao"] := nDevNota
				oJson["itens"]        := aItens
				aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
			EndIf

			aItens   := {}
			nDevNota := 0
			oJson    := JsonObject():New()

			oJson["chave"]          := cChvNota
			oJson["codigoErp"]      := AllTrim((cAlias)->F2_DOC)
			oJson["numero"]         := AllTrim((cAlias)->F2_DOC)
			oJson["clienteChave"]   := FWxFilial("SA1") + "-" + (cAlias)->F2_CLIENTE + "-" + (cAlias)->F2_LOJA
			oJson["vendedorChave"]  := FWxFilial("SA3") + "-" + (cAlias)->F2_VEND1
			oJson["condicaoChave"]  := FWxFilial("SE4") + "-" + (cAlias)->F2_COND
			oJson["vlrBruto"]       := (cAlias)->F2_VALBRUT
			oJson["vlrMercadoria"]  := (cAlias)->F2_VALMERC
			oJson["vlrItens"]       := (cAlias)->F2_VALMERC
			oJson["vlrDesconto"]    := (cAlias)->F2_DESCONT
			oJson["vlrIcms"]        := (cAlias)->F2_VALICM
			oJson["comodato"]       := .F.
			oJson["ativo"]          := .T.

			BJPoeTexto(oJson, "serie"        , (cAlias)->F2_SERIE)
			BJPoeTexto(oJson, "especieFiscal", (cAlias)->F2_ESPECIE)
			BJPoeTexto(oJson, "tipo"         , (cAlias)->F2_TIPO)
			BJPoeTexto(oJson, "chaveNfe"     , (cAlias)->F2_CHVNFE)

			If Empty((cAlias)->F2_EMISSAO)
				oJson["dtEmissao"] := Nil
			Else
				oJson["dtEmissao"] := FWTimeStamp(3, SToD((cAlias)->F2_EMISSAO), "00:00:00") + "Z"
			EndIf

			// dtNfe: a data de autorizacao acompanha a emissao quando a nota ja tem
			// chave
			If Empty((cAlias)->F2_CHVNFE) .Or. Empty((cAlias)->F2_EMISSAO)
				oJson["dtNfe"] := Nil
			Else
				oJson["dtNfe"] := FWTimeStamp(3, SToD((cAlias)->F2_EMISSAO), "00:00:00") + "Z"
			EndIf

			If lIpi
				oJson["vlrIpi"] := (cAlias)->F2_VALIPI
			Else
				oJson["vlrIpi"] := 0
			EndIf

			If lFrete
				oJson["vlrFrete"] := (cAlias)->F2_FRETE
			Else
				oJson["vlrFrete"] := 0
			EndIf

			If lMens
				BJPoeTexto(oJson, "mensagem", (cAlias)->F2_MENNOTA)
			EndIf

			cChvAnt := cChvNota
			cVrbAnt := "POST"
			If (cAlias)->DELETADO == "*"
				cVrbAnt := "DELETE"
			EndIf
		EndIf

		// Linha sem item e a nota que o LEFT JOIN trouxe sozinha.
		If !Empty((cAlias)->D2_ITEM)

			oItem := JsonObject():New()

			// Chave do item: a chave unica da SD2 (X2_UNICO) - filial, documento,
			// serie, cliente, loja, produto e item. Item nao tem codigoErp: so e
			// visto dentro da nota.
			oItem["chave"]         := (cAlias)->D2_FILIAL  + "-" + ;
			                          (cAlias)->D2_DOC     + "-" + ;
			                          (cAlias)->D2_SERIE   + "-" + ;
			                          (cAlias)->D2_CLIENTE + "-" + ;
			                          (cAlias)->D2_LOJA    + "-" + ;
			                          (cAlias)->D2_COD     + "-" + ;
			                          (cAlias)->D2_ITEM
			oItem["item"]          := Val((cAlias)->D2_ITEM)
			oItem["produtoChave"]  := FWxFilial("SB1") + "-" + (cAlias)->D2_COD
			oItem["quantidade"]    := (cAlias)->D2_QUANT
			oItem["vlrUnitario"]   := (cAlias)->D2_PRCVEN
			oItem["vlrDesconto"]   := (cAlias)->D2_DESCON
			oItem["vlrTotal"]      := (cAlias)->D2_TOTAL
			oItem["comodato"]      := .F.
			oItem["ativo"]         := .T.
			oItem["delete"]        := !Empty((cAlias)->ITEM_DELETADO)

			BJPoeTexto(oItem, "cfop", (cAlias)->D2_CF)
			BJPoeTexto(oItem, "tipo", (cAlias)->D2_TP)

			If lTabela
				oItem["vlrTabela"] := (cAlias)->D2_PRUNIT
			EndIf
			If lComis
				oItem["percComissao"] := (cAlias)->D2_COMIS1
			EndIf
			If lDev
				oItem["quantidadeDev"] := (cAlias)->D2_QTDEDEV
				oItem["vlrDev"]        := (cAlias)->D2_VALDEV

				// O vlrDevolucao do cabecalho e a soma dos itens: e por ele que as
				// apuracoes contam a devolucao. Gravado no fechamento da nota, quando
				// o laco ja passou por todos os itens dela.
				nDevNota += (cAlias)->D2_VALDEV
			EndIf
			If lRegra
				BJPoeTexto(oItem, "regraDescontoCodigo", (cAlias)->D2_YDESC)
			EndIf

			// Percentual de desconto derivado do valor: a SD2 grava o valor, o
			// contrato aceita os dois e a plataforma usa o percentual na analise
			If (cAlias)->D2_TOTAL + (cAlias)->D2_DESCON > 0
				oItem["percDesconto"] := Round((cAlias)->D2_DESCON / ((cAlias)->D2_TOTAL + (cAlias)->D2_DESCON) * 100, 4)
			Else
				oItem["percDesconto"] := 0
			EndIf

			aAdd(aItens, oItem)
		EndIf

		(cAlias)->(dbSkip())
	End

	// A ultima nota do laco nao tem quem a feche.
	If !Empty(cChvAnt)
		oJson["vlrDevolucao"] := nDevNota
		oJson["itens"]        := aItens
		aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
	EndIf

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPXML
XML autorizado das notas de saida - SF2 e TSS.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Chave de integracao a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPXML(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet     := {}
	Local aChave   := {}
	Local cAlias   := ""
	Local cQuery   := ""
	Local cChvNota := ""
	Local cXml     := ""
	Local oStmt    := Nil
	Local oJson    := Nil

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT F2_FILIAL, F2_DOC, F2_SERIE, F2_CLIENTE, F2_LOJA, F2_FORMUL, F2_TIPO "
	cQuery += "  FROM " + RetSQLName("SF2") + " SF2 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SF2.F2_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SF2.D_E_L_E_T_ = ' ' "
	EndIf

	cQuery += "   AND SF2.F2_CHVNFE <> ? "

	If !Empty(cChave)
		cQuery += "   AND SF2.F2_DOC = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SF2.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SF2.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY F2_DOC, F2_SERIE "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SF2"))
	oStmt:SetString(3, " ")

	If !Empty(cChave)
		aChave := U_BJPARTES(AllTrim(cChave))

		If Len(aChave) >= 2
			oStmt:SetString(4, PadR(aChave[2], TamSX3("F2_DOC")[1]))
		Else
			oStmt:SetString(4, PadR(cChave, TamSX3("F2_DOC")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		// Mesma chave do mapeador da nota (X2_UNICO da SF2)
		cChvNota := (cAlias)->F2_FILIAL  + "-" + ;
		            (cAlias)->F2_DOC     + "-" + ;
		            (cAlias)->F2_SERIE   + "-" + ;
		            (cAlias)->F2_CLIENTE + "-" + ;
		            (cAlias)->F2_LOJA    + "-" + ;
		            (cAlias)->F2_FORMUL  + "-" + ;
		            (cAlias)->F2_TIPO

		cXml := BJXmlTSS((cAlias)->F2_DOC, (cAlias)->F2_SERIE)

		If !Empty(cXml)

			// O contrato aceita "xml" OU "xmlBase64" - nunca os dois; mandar os dois
			// e 400, porque nao haveria como saber qual e o arquivo verdadeiro.
			// Base64 evita o problema de escapar XML dentro de JSON.
			//
			// **Os dois documentos da API discordam sobre esta rota.** O
			// endpoints.md descreve corpo JSON e traz o curl com
			// "Content-Type: application/json" e -d '{"xmlBase64":"..."}'; o
			// testes-swagger.json anota que a rota usa multipart/form-data com
			// arquivo. Seguimos o endpoints.md, que e o documento de contrato e o
			// unico com exemplo executavel. Se o primeiro envio voltar 415, e este o
			// motivo, e o caminho passa a ser multipart - que o FWRest nao monta
			// sozinho.
			oJson := JsonObject():New()
			oJson["xmlBase64"] := Encode64(cXml)

			aAdd(aRet, {cChvNota, oJson, "POST"})
		EndIf

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJXmlTSS
Recupera o XML autorizado de uma NF-e no TSS.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cDoc  , character, Numero do documento (F2_DOC)
@param   cSerie, character, Serie do documento (F2_SERIE)
@return  character, nfeProc completo, ou vazio quando nao localizado
/*/
Static Function BJXmlTSS(cDoc, cSerie)

	Local cRet    := ""
	Local cUrl    := PadR(GetNewPar("MV_SPEDURL", "http://"), 250)
	Local cXmlNfe := ""
	Local cXmlPrt := ""
	Local cVersao := "4.00"
	Local cTrecho := ""
	Local nPos    := 0
	Local nIni    := 0
	Local nFim    := 0
	Local oWs     := Nil
	Local oNota   := Nil

	Default cDoc   := ""
	Default cSerie := ""

	If Empty(cDoc)
		Return ""
	EndIf

	cDoc   := PadR(cDoc, TamSX3("F2_DOC")[1])
	cSerie := PadR(cSerie, TamSX3("F2_SERIE")[1])

	oWs := WSNFeSBRA():New()
	oWs:cUSERTOKEN        := "TOTVS"
	oWs:cID_ENT           := RetIdEnti()
	oWs:nDIASPARAEXCLUSAO := 0
	oWs:_URL              := AllTrim(cUrl) + "/NFeSBRA.apw"
	oWs:oWSNFEID          := NFESBRA_NFES2():New()
	oWs:oWSNFEID:oWSNotas := NFESBRA_ARRAYOFNFESID2():New()

	aAdd(oWs:oWSNFEID:oWSNotas:oWSNFESID2, NFESBRA_NFESID2():New())

	// O identificador e serie + documento, nessa ordem - mesma chave que o DANFE
	// monta em aNotas[4] + aNotas[5]
	aTail(oWs:oWSNFEID:oWSNotas:oWSNFESID2):cID := (cSerie + cDoc)

	If !oWs:RETORNANOTASNX()
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "TSS nao respondeu para " + AllTrim(cSerie) + "/" + AllTrim(cDoc) + ": " + GetWscError(1), 0, 0, {})
		Return ""
	EndIf

	If Len(oWs:oWSRETORNANOTASNXRESULT:OWSNOTAS:OWSNFES5) == 0
		Return ""
	EndIf

	oNota   := oWs:oWSRETORNANOTASNXRESULT:OWSNOTAS:OWSNFES5[1]
	cXmlNfe := AllTrim(oNota:oWSNFE:CXML)
	cXmlPrt := AllTrim(oNota:oWSNFE:CXMLPROT)

	// O nfeProc leva uma unica declaracao, a do envelope. Se cada pedaco vier com
	// a sua, o resultado tem tres - e deixa de ser XML valido no primeiro parser
	// que encostar nele.
	If Left(cXmlNfe, 5) == "<?xml"
		nPos := At("?>", cXmlNfe)
		If nPos > 0
			cXmlNfe := AllTrim(SubStr(cXmlNfe, nPos + 2))
		EndIf
	EndIf

	If Left(cXmlPrt, 5) == "<?xml"
		nPos := At("?>", cXmlPrt)
		If nPos > 0
			cXmlPrt := AllTrim(SubStr(cXmlPrt, nPos + 2))
		EndIf
	EndIf

	If Empty(cXmlNfe)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "TSS devolveu a nota " + AllTrim(cSerie) + "/" + AllTrim(cDoc) + " sem o XML.", 0, 0, {})
		Return ""
	EndIf

	// Sem protocolo nao ha nfeProc: seria um envelope de autorizacao sem a
	// autorizacao dentro. Melhor contar como "sem XML" e tentar de novo no ciclo
	// seguinte, quando a nota tiver sido autorizada.
	If Empty(cXmlPrt)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Nota " + AllTrim(cSerie) + "/" + AllTrim(cDoc) + " sem protocolo no TSS. " + ;
			"Ainda nao autorizada? XML nao enviado.", 0, 0, {})
		Return ""
	EndIf

	// A versao do layout sai do proprio XML: o nfeProc declara a mesma versao da
	// NF-e que envelopa. Chumbar "4.00" funciona enquanto todas as notas forem
	// 4.00 e para de funcionar em silencio na proxima mudanca de layout.
	nPos := At("<infNFe", cXmlNfe)

	If nPos > 0
		cTrecho := SubStr(cXmlNfe, nPos, 300)
		nIni    := At('versao="', cTrecho)

		If nIni > 0
			cTrecho := SubStr(cTrecho, nIni + 8)
			nFim    := At('"', cTrecho)

			If nFim > 1
				cVersao := SubStr(cTrecho, 1, nFim - 1)
			EndIf
		EndIf
	EndIf

	cRet := '<?xml version="1.0" encoding="UTF-8"?>' + ;
		'<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="' + cVersao + '">' + ;
		cXmlNfe + cXmlPrt + ;
		'</nfeProc>'

Return cRet

/*/{Protheus.doc} BJMAPNFE
Notas de entrada - SF1 (cabecalho) e SD1 (itens).
@type    User Function
@author  Ricardo P Sotomayor
@since   08/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Chave de integracao a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPNFE(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet     := {}
	Local aChave   := {}
	Local aItens   := {}
	Local cAlias   := ""
	Local cQuery   := ""
	Local cChvNota := ""
	Local cChvAnt  := ""
	Local cVrbAnt  := ""
	Local cChvAux  := ""
	Local cPartic  := ""
	Local nStNota  := 0
	Local oStmt    := Nil
	Local oJson    := Nil
	Local oItem    := Nil
	Local lCond    := SF1->(FieldPos("F1_COND"))    > 0
	Local lEntrad  := SF1->(FieldPos("F1_DTDIGIT")) > 0
	Local lMerc    := SF1->(FieldPos("F1_VALMERC")) > 0
	Local lDesc    := SF1->(FieldPos("F1_DESCONT")) > 0
	Local lIcms    := SF1->(FieldPos("F1_VALICM"))  > 0
	Local lSt      := SF1->(FieldPos("F1_VALSOLI")) > 0
	Local lIpi     := SF1->(FieldPos("F1_VALIPI"))  > 0
	Local lFrete   := SF1->(FieldPos("F1_FRETE"))   > 0
	Local lSeguro  := SF1->(FieldPos("F1_SEGURO"))  > 0
	Local lDespes  := SF1->(FieldPos("F1_DESPESA")) > 0
	Local lMens    := SF1->(FieldPos("F1_MENNOTA")) > 0
	Local lLocal   := SD1->(FieldPos("D1_LOCAL"))   > 0
	Local lVUnit   := SD1->(FieldPos("D1_VUNIT"))   > 0
	Local lItDesc  := SD1->(FieldPos("D1_VALDESC")) > 0
	Local lItIcms  := SD1->(FieldPos("D1_VALICM"))  > 0
	Local lItSt    := SD1->(FieldPos("D1_ICMSRET")) > 0
	Local lItIpi   := SD1->(FieldPos("D1_VALIPI"))  > 0
	Local lItPeso  := SD1->(FieldPos("D1_PESO"))    > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	cQuery := "SELECT F1_FILIAL, F1_DOC, F1_SERIE, F1_FORNECE, F1_LOJA, F1_FORMUL, SF1.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       F1_TIPO, F1_ESPECIE, F1_EMISSAO, F1_CHVNFE, F1_VALBRUT, "
	cQuery += "       D1_FILIAL, D1_DOC, D1_SERIE, D1_FORNECE, D1_LOJA, D1_ITEM, D1_COD, "
	cQuery += "       D1_QUANT, D1_TOTAL, D1_CF, SD1.D_E_L_E_T_ AS ITEM_DELETADO "

	If lCond
		cQuery += ", F1_COND "
	EndIf
	If lEntrad
		cQuery += ", F1_DTDIGIT "
	EndIf
	If lMerc
		cQuery += ", F1_VALMERC "
	EndIf
	If lDesc
		cQuery += ", F1_DESCONT "
	EndIf
	If lIcms
		cQuery += ", F1_VALICM "
	EndIf
	If lSt
		cQuery += ", F1_VALSOLI "
	EndIf
	If lIpi
		cQuery += ", F1_VALIPI "
	EndIf
	If lFrete
		cQuery += ", F1_FRETE "
	EndIf
	If lSeguro
		cQuery += ", F1_SEGURO "
	EndIf
	If lDespes
		cQuery += ", F1_DESPESA "
	EndIf
	If lMens
		cQuery += ", F1_MENNOTA "
	EndIf
	If lLocal
		cQuery += ", D1_LOCAL "
	EndIf
	If lVUnit
		cQuery += ", D1_VUNIT "
	EndIf
	If lItDesc
		cQuery += ", D1_VALDESC "
	EndIf
	If lItIcms
		cQuery += ", D1_VALICM "
	EndIf
	If lItSt
		cQuery += ", D1_ICMSRET "
	EndIf
	If lItIpi
		cQuery += ", D1_VALIPI "
	EndIf
	If lItPeso
		cQuery += ", D1_PESO "
	EndIf

	// O JOIN inclui itens ativos e excluidos; o D_E_L_E_T_ vira delete no JSON.
	//
	// Sao SETE campos, e nao os cinco do relacionamento classico: D1_FORMUL e
	// D1_TIPO entram porque duas linhas da SF1 podem compartilhar os outros cinco
	// - uma compra "N" e uma devolucao "D" do mesmo documento, por exemplo. Com
	// cinco campos o JOIN multiplicaria os itens de uma nota pelos da outra, e a
	// quebra por documento juntaria as duas num payload so, com o dobro de itens.
	cQuery += "  FROM " + RetSQLName("SF1") + " SF1 "
	cQuery += "  LEFT JOIN " + RetSQLName("SD1") + " SD1 "
	cQuery += "    ON SD1.D1_FILIAL  = SF1.F1_FILIAL "
	cQuery += "   AND SD1.D1_DOC     = SF1.F1_DOC "
	cQuery += "   AND SD1.D1_SERIE   = SF1.F1_SERIE "
	cQuery += "   AND SD1.D1_FORNECE = SF1.F1_FORNECE "
	cQuery += "   AND SD1.D1_LOJA    = SF1.F1_LOJA "
	cQuery += "   AND SD1.D1_FORMUL  = SF1.F1_FORMUL "
	cQuery += "   AND SD1.D1_TIPO    = SF1.F1_TIPO "

	// Sem filtro de D_E_L_E_T_ nos itens, nem na carga inicial: o item excluido
	// vai com delete no proprio item. Excluir um item que a plataforma nunca
	// recebeu nao faz nada. So "Envia deletados? = Nao" corta o item excluido,
	// e o corte vai no ON: no WHERE ele derrubaria junto a nota inteira que so
	// tem itens excluidos.
	If !lEnvDel
		cQuery += "   AND SD1.D_E_L_E_T_ = ' ' "
	EndIf

	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SF1.F1_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SF1.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		// cChave e a chave de integracao: filial-documento-serie-fornecedor-loja-
		// formulario-tipo.
		// Filtra pelo documento, que e a parte 2 e nunca vem vazia. Se houver mais
		// de uma nota com esse numero, todas sobem - cada uma com a sua chave, e o
		// POST e upsert.
		cQuery += "   AND SF1.F1_DOC = ? "
	Else
		If !Empty(cMarca)

			// Quem decide e o cabecalho: nota e documento fechado, e o que muda nela
			// muda a SF1. O JOIN traz todos os itens, entao o payload vai sempre
			// completo - cabecalho e itens -, nao um pedaco.
			cQuery += "   AND SF1.S_T_A_M_P_ >= '" + cMarca + "' "

			If !Empty(cMarcaFim)
				cQuery += "   AND SF1.S_T_A_M_P_ <= '" + cMarcaFim + "' "
			EndIf

		EndIf
	EndIf

	// A ordem e a da quebra: os campos que formam a chave da nota, depois o item.
	// Sem isso o laco fecharia a mesma nota mais de uma vez.
	cQuery += " ORDER BY F1_DOC, F1_SERIE, F1_FORNECE, F1_LOJA, F1_FORMUL, F1_TIPO, D1_COD, D1_ITEM "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SF1"))

	If !Empty(cChave)
		cChvAux := AllTrim(cChave)
		If At("-", cChvAux) > 0
			cChvAux := SubStr(cChvAux, At("-", cChvAux) + 1)
		EndIf
		aChave := U_BJPARTES(cChvAux)

		If Len(aChave) >= 1
			oStmt:SetString(3, PadR(aChave[1], TamSX3("F1_DOC")[1]))
		Else
			oStmt:SetString(3, PadR(cChvAux, TamSX3("F1_DOC")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		// Chave de integracao da nota: a chave unica da SF1 (X2_UNICO), na mesma
		// ordem - filial, documento, serie, fornecedor, loja, formulario e tipo.
		// O F1_TIPO entrou em 22/09/2026 (antes ficava de fora).
		cChvNota := (cAlias)->F1_FILIAL  + "-" + ;
		            (cAlias)->F1_DOC     + "-" + ;
		            (cAlias)->F1_SERIE   + "-" + ;
		            (cAlias)->F1_FORNECE + "-" + ;
		            (cAlias)->F1_LOJA    + "-" + ;
		            (cAlias)->F1_FORMUL  + "-" + ;
		            (cAlias)->F1_TIPO

		If !(cChvNota == cChvAnt)

			// Fecha a nota anterior antes de comecar a proxima.
			If !Empty(cChvAnt)
				oJson["itens"] := aItens

				If !lSt
					oJson["vlrIcmsSt"] := nStNota
				EndIf

				aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
			EndIf

			aItens  := {}
			nStNota := 0
			oJson   := JsonObject():New()

			oJson["chave"]     := cChvNota
			oJson["codigoErp"] := AllTrim((cAlias)->F1_DOC)
			oJson["numero"]    := AllTrim((cAlias)->F1_DOC)
			oJson["vlrBruto"]  := (cAlias)->F1_VALBRUT
			oJson["ativo"]     := .T.

			// O participante muda com o tipo, e so um dos dois campos vai
			// preenchido. A API aceita o que vier e nao impoe a combinacao.
			cPartic := (cAlias)->F1_FORNECE + "-" + (cAlias)->F1_LOJA

			If AllTrim((cAlias)->F1_TIPO) == "D"
				oJson["clienteChave"]     := FWxFilial("SA1") + "-" + cPartic
				oJson["fornecedorChave"]  := Nil
			Else
				oJson["fornecedorChave"]  := FWxFilial("SA2") + "-" + cPartic
				oJson["clienteChave"]     := Nil
			EndIf

			BJPoeTexto(oJson, "serie"        , (cAlias)->F1_SERIE)
			BJPoeTexto(oJson, "especieFiscal", (cAlias)->F1_ESPECIE)
			BJPoeTexto(oJson, "tipo"         , (cAlias)->F1_TIPO)
			BJPoeTexto(oJson, "chaveNfe"     , (cAlias)->F1_CHVNFE)

			BJPoeData(oJson, "dtEmissao", (cAlias)->F1_EMISSAO)

			// dtNfe: a data de autorizacao acompanha a emissao quando a nota ja tem
			// chave.
			If Empty((cAlias)->F1_CHVNFE)
				oJson["dtNfe"] := Nil
			Else
				BJPoeData(oJson, "dtNfe", (cAlias)->F1_EMISSAO)
			EndIf

			If lEntrad
				BJPoeData(oJson, "dtEntrada", (cAlias)->F1_DTDIGIT)
			EndIf

			If lCond
				oJson["condicaoChave"]  := FWxFilial("SE4") + "-" + (cAlias)->F1_COND
			EndIf

			If lMerc
				oJson["vlrMercadoria"] := (cAlias)->F1_VALMERC
				oJson["vlrItens"]      := (cAlias)->F1_VALMERC
			Else
				oJson["vlrMercadoria"] := 0
				oJson["vlrItens"]      := 0
			EndIf

			If lDesc
				oJson["vlrDesconto"] := (cAlias)->F1_DESCONT
			Else
				oJson["vlrDesconto"] := 0
			EndIf

			If lIcms
				oJson["vlrIcms"] := (cAlias)->F1_VALICM
			Else
				oJson["vlrIcms"] := 0
			EndIf

			// ICMS-ST do cabecalho: este dicionario nao tem F1_VALSOLI, e o valor
			// existe no item, em D1_ICMSRET ("ICMS Solid."). Sem soma-lo, a nota
			// subiria com ST zerado tendo o dado na propria SD1 - erro silencioso
			// num campo fiscal. Quando o campo de cabecalho existir, ele prevalece:
			// e o total que o proprio ERP fechou.
			If lSt
				oJson["vlrIcmsSt"] := (cAlias)->F1_VALSOLI
			EndIf

			If lIpi
				oJson["vlrIpi"] := (cAlias)->F1_VALIPI
			Else
				oJson["vlrIpi"] := 0
			EndIf

			If lFrete
				oJson["vlrFrete"] := (cAlias)->F1_FRETE
			Else
				oJson["vlrFrete"] := 0
			EndIf

			If lSeguro
				oJson["vlrSeguro"] := (cAlias)->F1_SEGURO
			Else
				oJson["vlrSeguro"] := 0
			EndIf

			If lDespes
				oJson["vlrDespesa"] := (cAlias)->F1_DESPESA
			Else
				oJson["vlrDespesa"] := 0
			EndIf

			If lMens
				BJPoeTexto(oJson, "mensagem", (cAlias)->F1_MENNOTA)
			EndIf

			cChvAnt := cChvNota
			cVrbAnt := "POST"
			If (cAlias)->DELETADO == "*"
				cVrbAnt := "DELETE"
			EndIf
		EndIf

		// Linha sem item e a nota que o LEFT JOIN trouxe sozinha.
		If !Empty((cAlias)->D1_ITEM)

			oItem := JsonObject():New()

			// Chave do item: a chave unica da SD1 (X2_UNICO) - filial, documento,
			// serie, fornecedor, loja, produto e item. Item nao tem codigoErp: so e
			// visto dentro da nota.
			oItem["chave"]         := (cAlias)->D1_FILIAL  + "-" + ;
			                          (cAlias)->D1_DOC     + "-" + ;
			                          (cAlias)->D1_SERIE   + "-" + ;
			                          (cAlias)->D1_FORNECE + "-" + ;
			                          (cAlias)->D1_LOJA    + "-" + ;
			                          (cAlias)->D1_COD     + "-" + ;
			                          (cAlias)->D1_ITEM
			oItem["item"]          := Val((cAlias)->D1_ITEM)
			oItem["produtoChave"]  := FWxFilial("SB1") + "-" + (cAlias)->D1_COD
			oItem["quantidade"]    := (cAlias)->D1_QUANT
			oItem["vlrTotal"]      := (cAlias)->D1_TOTAL
			oItem["ativo"]         := .T.
			oItem["delete"]        := !Empty((cAlias)->ITEM_DELETADO)

			BJPoeTexto(oItem, "cfop", (cAlias)->D1_CF)

			If lLocal
				oItem["armazemChave"]  := FWxFilial("NNR") + "-" + (cAlias)->D1_LOCAL
			EndIf

			If lVUnit
				oItem["vlrUnitario"] := (cAlias)->D1_VUNIT
			Else
				oItem["vlrUnitario"] := 0
			EndIf

			If lItDesc
				oItem["vlrDesconto"] := (cAlias)->D1_VALDESC
			Else
				oItem["vlrDesconto"] := 0
			EndIf

			If lItIcms
				oItem["vlrIcms"] := (cAlias)->D1_VALICM
			Else
				oItem["vlrIcms"] := 0
			EndIf

			If lItSt
				oItem["vlrIcmsSt"] := (cAlias)->D1_ICMSRET
				nStNota += (cAlias)->D1_ICMSRET
			Else
				oItem["vlrIcmsSt"] := 0
			EndIf

			If lItIpi
				oItem["vlrIpi"] := (cAlias)->D1_VALIPI
			Else
				oItem["vlrIpi"] := 0
			EndIf

			If lItPeso
				oItem["peso"] := (cAlias)->D1_PESO
			EndIf

			aAdd(aItens, oItem)
		EndIf

		(cAlias)->(dbSkip())
	End

	// A ultima nota do laco nao tem quem a feche.
	If !Empty(cChvAnt)
		oJson["itens"] := aItens

		If !lSt
			oJson["vlrIcmsSt"] := nStNota
		EndIf

		aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
	EndIf

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPTIT
Titulos a receber - SE1.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Chave de integracao a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPTIT(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet     := {}
	Local aChave   := {}
	Local aBanco   := {}
	Local cAlias   := ""
	Local cQuery   := ""
	Local cVerbo   := ""
	Local cChvTit  := ""
	Local cAgeTit  := ""
	Local cCtaTit  := ""
	Local cCarTit  := ""
	Local cDacTit  := ""
	Local oStmt    := Nil
	Local oJson    := Nil
	Local nJuros   := 0
	Local nMulta   := 0
	Local nDesc    := 0
	Local nPerTit  := 0
	Local lCodBar  := SE1->(FieldPos("E1_CODBAR"))  > 0
	Local lCodDig  := SE1->(FieldPos("E1_CODDIG"))  > 0
	Local lCtrBol  := SE1->(FieldPos("E1_CTRBOL"))  > 0
	Local lAgeDep  := SE1->(FieldPos("E1_AGEDEP"))  > 0
	Local lConta   := SE1->(FieldPos("E1_CONTA"))   > 0
	Local lDacNos  := SE1->(FieldPos("E1_DACNOSS")) > 0
	Local lMoraDia := SE1->(FieldPos("E1_MORADIA")) > 0
	Local lTxMulta := SE1->(FieldPos("E1_TXMULTA")) > 0
	Local lDescFin := SA1->(FieldPos("A1_DESCFIN")) > 0

	// Beneficiario: e a empresa, igual para todos os titulos do ciclo
	Local cBenNome := AllTrim(SM0->M0_NOMECOM) + " - " + FWxFilial("SE1")
	Local cBenDoc  := Transform(SM0->M0_CGC, PesqPict("SA1", "A1_CGC"))
	Local cBenEnd  := ""

	// Percentuais de juros e multa do boleto, lidos uma vez: SuperGetMV dentro do
	// laco seria uma consulta ao SX6 por titulo. Sao os mesmos parametros que o
	// U_JRBOL e o U_MTBOL usam no BjBoletos.
	Local nPerJrs := SuperGetMV("MV_RGC_PJUR", .T., 0.02)
	Local nPerMlt := SuperGetMV("MV_RGC_PMUL", .T., 0.02)

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

	// Endereco da empresa para a instrucao do boleto: o de cobranca quando existe,
	// o de entrega como alternativa.
	If SM0->(FieldPos("M0_ENDCOB")) > 0 .And. !Empty(SM0->M0_ENDCOB)
		cBenEnd := AllTrim(SM0->M0_ENDCOB)
	ElseIf SM0->(FieldPos("M0_ENDENT")) > 0
		cBenEnd := AllTrim(SM0->M0_ENDENT)
	EndIf

	If SM0->(FieldPos("M0_BAIRCOB")) > 0 .And. !Empty(SM0->M0_BAIRCOB)
		cBenEnd += " - " + AllTrim(SM0->M0_BAIRCOB)
	EndIf

	If SM0->(FieldPos("M0_CIDCOB")) > 0 .And. !Empty(SM0->M0_CIDCOB)
		cBenEnd += " - " + AllTrim(SM0->M0_CIDCOB)
	EndIf

	If SM0->(FieldPos("M0_ESTCOB")) > 0 .And. !Empty(SM0->M0_ESTCOB)
		cBenEnd += "/" + AllTrim(SM0->M0_ESTCOB)
	EndIf

	If SM0->(FieldPos("M0_CEPCOB")) > 0 .And. !Empty(SM0->M0_CEPCOB)
		cBenEnd += " - CEP " + AllTrim(SM0->M0_CEPCOB)
	EndIf

	cBenEnd := Left(AllTrim(cBenEnd), 200)

	cQuery := "SELECT E1_FILIAL, E1_PREFIXO, E1_NUM, E1_PARCELA, E1_TIPO, SE1.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       E1_CLIENTE, E1_LOJA, E1_VEND1, E1_EMISSAO, E1_VENCTO, E1_VENCREA, "
	cQuery += "       E1_VALOR, E1_SALDO, E1_ACRESC, E1_DECRESC, E1_BAIXA, "
	cQuery += "       E1_FORPGT, E1_NUMBCO, E1_PORTADO, E1_HIST, E1_VALJUR "

	If lCodBar
		cQuery += ", E1_CODBAR "
	EndIf
	If lCodDig
		cQuery += ", E1_CODDIG "
	EndIf
	If lCtrBol
		cQuery += ", E1_CTRBOL "
	EndIf
	If lAgeDep
		cQuery += ", E1_AGEDEP "
	EndIf
	If lConta
		cQuery += ", E1_CONTA "
	EndIf
	If lDacNos
		cQuery += ", E1_DACNOSS "
	EndIf
	If lMoraDia
		cQuery += ", E1_MORADIA "
	EndIf
	If lTxMulta
		cQuery += ", E1_TXMULTA "
	EndIf

	// O desconto financeiro do boleto e percentual do cliente, nao do titulo.
	// LEFT JOIN para o titulo sem cliente na SA1 nao sumir da varredura.
	If lDescFin
		cQuery += ", SA1.A1_DESCFIN "
	EndIf

	cQuery += "  FROM " + RetSQLName("SE1") + " SE1 "

	If lDescFin
		cQuery += "  LEFT JOIN " + RetSQLName("SA1") + " SA1 "
		cQuery += "    ON SA1.D_E_L_E_T_ = ' ' "
		cQuery += "   AND SA1.A1_FILIAL  = '" + FWxFilial("SA1") + "' "
		cQuery += "   AND SA1.A1_COD     = SE1.E1_CLIENTE "
		cQuery += "   AND SA1.A1_LOJA    = SE1.E1_LOJA "
	EndIf

	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SE1.E1_FILIAL = ? "

	// Carga inicial (sem marca e sem chave): o excluido nunca chegou a
	// plataforma, entao nao vira DELETE. Com "Envia deletados? = Nao" o
	// filtro vale em qualquer coleta: linha excluida nem sai da origem.
	If !lEnvDel .Or. (Empty(cMarca) .And. Empty(cChave))
		cQuery += "   AND SE1.D_E_L_E_T_ = ' ' "
	EndIf

	If !Empty(cChave)
		// cChave e a chave de integracao: filial-prefixo-numero-parcela-tipo. Filtra pelo
		// numero, que e a parte 3 e nunca vem vazio; parcelas e tipos do mesmo
		// numero sobem juntos, cada um com a sua chave.
		cQuery += "   AND SE1.E1_NUM = ? "
	EndIf

	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND SE1.S_T_A_M_P_ >= '" + cMarca + "' "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SE1.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY E1_EMISSAO, E1_PREFIXO, E1_NUM, E1_PARCELA "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SE1"))

	If !Empty(cChave)
		aChave := U_BJPARTES(AllTrim(cChave))

		If Len(aChave) >= 3
			oStmt:SetString(3, PadR(aChave[3], TamSX3("E1_NUM")[1]))
		Else
			oStmt:SetString(3, PadR(cChave, TamSX3("E1_NUM")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		// Chave de identidade do titulo: a chave natural da SE1, com a filial na
		// frente. O mesmo numero gera parcelas A, B, C, e o tipo separa NF de NCC,
		// RA e os demais.
		cChvTit := (cAlias)->E1_FILIAL  + "-" + ;
		           (cAlias)->E1_PREFIXO + "-" + ;
		           (cAlias)->E1_NUM     + "-" + ;
		           (cAlias)->E1_PARCELA + "-" + ;
		           (cAlias)->E1_TIPO

		oJson := JsonObject():New()
		oJson["chave"]          := cChvTit
		oJson["codigoErp"]      := AllTrim((cAlias)->E1_NUM)
		oJson["numero"]         := AllTrim((cAlias)->E1_NUM)
		oJson["clienteChave"]   := FWxFilial("SA1") + "-" + (cAlias)->E1_CLIENTE + "-" + (cAlias)->E1_LOJA
		oJson["vendedorChave"]  := FWxFilial("SA3") + "-" + (cAlias)->E1_VEND1
		oJson["valor"]          := (cAlias)->E1_VALOR
		oJson["saldo"]          := (cAlias)->E1_SALDO
		oJson["acrescimo"]      := (cAlias)->E1_ACRESC
		oJson["decrescimo"]     := (cAlias)->E1_DECRESC
		oJson["ativo"]          := .T.

		BJPoeTexto(oJson, "prefixo"  , (cAlias)->E1_PREFIXO)
		BJPoeTexto(oJson, "parcela"  , (cAlias)->E1_PARCELA)
		BJPoeTexto(oJson, "tipo"     , (cAlias)->E1_TIPO)
		BJPoeTexto(oJson, "formaPgto", (cAlias)->E1_FORPGT)
		BJPoeTexto(oJson, "historico", (cAlias)->E1_HIST)

		BJPoeData(oJson, "emissao"       , (cAlias)->E1_EMISSAO)
		BJPoeData(oJson, "vencimento"    , (cAlias)->E1_VENCTO)
		BJPoeData(oJson, "vencimentoReal", (cAlias)->E1_VENCREA)
		BJPoeData(oJson, "dtBaixa"       , (cAlias)->E1_BAIXA)

		// ---- Cobranca bancaria ----
		// Nosso numero com 11 digitos, zero-preenchido, que e o que o Ret_cBarra
		// faz antes de montar o codigo de barras. Enviar E1_NUMBCO cru mandaria
		// "1160" onde o banco registrou "00000001160", e a plataforma nao
		// reconheceria o boleto. Titulo sem numero registrado vai nulo: sem ele
		// nao ha 2a via.
		If Val(AllTrim((cAlias)->E1_NUMBCO)) > 0
			oJson["nossoNumero"] := StrZero(Val(AllTrim((cAlias)->E1_NUMBCO)), 11)
		Else
			oJson["nossoNumero"] := Nil
		EndIf

		// Carteira do boleto, nao a carteira de cobranca do Protheus. E1_CTRBOL
		// guarda a primeira ("09" nesta base, gravado pelo BjBoletos); E1_CARTEIR
		// guarda a segunda, que e outra coisa e nao serve ao contrato.
		If lCtrBol
			BJPoeTexto(oJson, "carteira", (cAlias)->E1_CTRBOL)
		Else
			oJson["carteira"] := Nil
		EndIf

		If lCodBar
			BJPoeTexto(oJson, "codigoBarras", (cAlias)->E1_CODBAR)
		Else
			oJson["codigoBarras"] := Nil
		EndIf

		// Linha digitavel: a do titulo, quando o campo existir. Deriva-la do codigo
		// de barras seria recalcular o que o banco ja registrou.
		If lCodDig
			BJPoeTexto(oJson, "linhaDigitavel", (cAlias)->E1_CODDIG)
		Else
			oJson["linhaDigitavel"] := Nil
		EndIf

		cAgeTit := ""
		cCtaTit := ""
		cCarTit := ""
		cDacTit := ""

		If lAgeDep
			cAgeTit := (cAlias)->E1_AGEDEP
		EndIf
		If lConta
			cCtaTit := (cAlias)->E1_CONTA
		EndIf
		If lCtrBol
			cCarTit := (cAlias)->E1_CTRBOL
		EndIf
		If lDacNos
			cDacTit := (cAlias)->E1_DACNOSS
		EndIf

		oJson["contaBancariaDescricao"] := BJContaTit((cAlias)->E1_PORTADO, cAgeTit, cCtaTit, cCarTit)

		nJuros := 0
		nMulta := 0
		nDesc  := 0

		If Empty(cCarTit)

			// Titulo sem carteira nao tem boleto: dinheiro, deposito, PIX
			oJson["banco"]                  := Nil
			oJson["bancoNome"]              := Nil
			oJson["bancoCodigoCompensacao"] := Nil
			oJson["agencia"]                := Nil
			oJson["agenciaDv"]              := Nil
			oJson["conta"]                  := Nil
			oJson["contaDv"]                := Nil
			oJson["beneficiarioNome"]       := Nil
			oJson["beneficiarioDocumento"]  := Nil
			oJson["beneficiarioEndereco"]   := Nil
			oJson["localPagamento"]         := Nil
			oJson["aceite"]                 := Nil
			oJson["especieDocumento"]       := Nil
			oJson["nossoNumeroDac"]         := Nil
			oJson["jurosValorDia"]          := Nil
			oJson["multaValor"]             := Nil
			oJson["descontoValor"]          := Nil
			oJson["instrucoes"]             := Nil

		Else

			// A plataforma nao tem cadastro de conta de cobranca a consultar: banco,
			// agencia, conta, digitos, beneficiario e o texto fixo do leiaute saem
			// daqui junto com o titulo. Repete em cada registro, e em troca o boleto
			// nunca sai com a conta de um cadastro desatualizado - quem registrou o
			// boleto no banco foi o ERP, e e a informacao dele que vale.
			aBanco := BJDadosSA6((cAlias)->E1_PORTADO, cAgeTit, cCtaTit)

			BJPoeTexto(oJson, "banco"                 , aBanco[1])
			BJPoeTexto(oJson, "bancoNome"             , aBanco[2])
			BJPoeTexto(oJson, "bancoCodigoCompensacao", BJCodCompen(aBanco[1]))
			BJPoeTexto(oJson, "agencia"               , aBanco[3])
			BJPoeTexto(oJson, "agenciaDv"             , aBanco[4])
			BJPoeTexto(oJson, "conta"                 , aBanco[5])
			BJPoeTexto(oJson, "contaDv"               , aBanco[6])
			BJPoeTexto(oJson, "beneficiarioNome"      , cBenNome)
			BJPoeTexto(oJson, "beneficiarioDocumento" , cBenDoc)
			BJPoeTexto(oJson, "beneficiarioEndereco"  , cBenEnd)

			oJson["localPagamento"]   := "Pagavel preferencialmente em qualquer Agencia Bradesco"
			oJson["aceite"]           := "Sim"
			oJson["especieDocumento"] := "DM"

			// Juros: o valor que o BjBoletos gravou ao imprimir (E1_VALJUR, ou
			// E1_MORADIA que recebe o mesmo conteudo). E o numero que esta no boleto
			// na mao do cliente; recalcular agora daria outro se o parametro tiver
			// mudado desde a impressao.
			nJuros := (cAlias)->E1_VALJUR

			If nJuros <= 0 .And. lMoraDia
				nJuros := (cAlias)->E1_MORADIA
			EndIf

			If nJuros <= 0
				nJuros := Round(((cAlias)->E1_SALDO * nPerJrs) / 10, 2)
			EndIf

			// Multa: o BjBoletos guarda so o percentual (E1_TXMULTA), nao o valor. O
			// percentual do titulo vale mais que o do parametro, pelo mesmo motivo -
			// foi o vigente quando o boleto saiu.
			//
			// **Nao use E1_PORCJUR aqui.** O nome diz percentual de juros, mas o
			// BjBoletos grava nele o percentual de *multa*, o mesmo que vai para
			// E1_TXMULTA. Percentual de juros nao existe gravado na SE1: o
			// MV_RGC_PJUR so vive dentro do U_JRBOL, e e por isso que o calculo
			// alternativo dos juros, acima, le o parametro.
			nPerTit := nPerMlt

			If lTxMulta .And. (cAlias)->E1_TXMULTA > 0
				nPerTit := (cAlias)->E1_TXMULTA
			EndIf

			nMulta := Round((cAlias)->E1_SALDO * nPerTit, 2)

			// Desconto financeiro do cliente (A1_DESCFIN), como em U_DESFIN
			If lDescFin
				nDesc := Round(((cAlias)->E1_SALDO * (cAlias)->A1_DESCFIN) / 100, 2)
			EndIf

			oJson["nossoNumeroDac"] := BJDacNosso(cCarTit, (cAlias)->E1_NUMBCO, cDacTit)
			oJson["jurosValorDia"]  := nJuros
			oJson["multaValor"]     := nMulta
			oJson["descontoValor"]  := nDesc
			oJson["instrucoes"]     := BJInstrBol(nJuros, nMulta, nDesc)

		EndIf

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {cChvTit, oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJPoeData
Poe uma data no payload em ISO 8601, ou null quando ela esta vazia.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oJson , object   , [Referencia] Payload em montagem
@param   cCampo, character, Nome do campo no contrato
@param   cData , character, Data lida da tabela, no formato AAAAMMDD
@return  Nil
/*/
Static Function BJPoeData(oJson, cCampo, cData)

	If Empty(cData)
		oJson[cCampo] := Nil
	Else
		oJson[cCampo] := FWTimeStamp(3, SToD(cData), "00:00:00") + "Z"
	EndIf

Return Nil

/*/{Protheus.doc} BJCodCompen
Devolve o codigo de compensacao do banco com o digito, para o cabecalho do boleto.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cBanco, character, Codigo do banco (E1_PORTADO / A6_COD)
@return  character, Codigo de compensacao com o digito. Ex.: "237-2"
/*/
Static Function BJCodCompen(cBanco)

	Local aTabela := {}
	Local nPos    := 0

	Default cBanco := ""

	cBanco := StrZero(Val(AllTrim(cValToChar(cBanco))), 3)

	If Val(cBanco) == 0
		Return ""
	EndIf

	//            Banco  Digito
	aAdd(aTabela, {"001", "9"})   // Banco do Brasil
	aAdd(aTabela, {"033", "7"})   // Santander
	aAdd(aTabela, {"041", "8"})   // Banrisul
	aAdd(aTabela, {"077", "9"})   // Inter
	aAdd(aTabela, {"104", "0"})   // Caixa
	aAdd(aTabela, {"237", "2"})   // Bradesco
	aAdd(aTabela, {"341", "7"})   // Itau
	aAdd(aTabela, {"356", "5"})   // Real
	aAdd(aTabela, {"389", "8"})   // Mercantil
	aAdd(aTabela, {"399", "9"})   // HSBC
	aAdd(aTabela, {"422", "7"})   // Safra
	aAdd(aTabela, {"453", "1"})   // Rural
	aAdd(aTabela, {"745", "7"})   // Citibank
	aAdd(aTabela, {"748", "X"})   // Sicredi
	aAdd(aTabela, {"756", "0"})   // Sicoob

	nPos := aScan(aTabela, {|x| x[1] == cBanco})

	If nPos == 0
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Banco " + cBanco + " fora da tabela de codigos de compensacao. " + ;
			"O boleto ira sem o digito no cabecalho.", 0, 0, {})
		Return cBanco
	EndIf

Return cBanco + "-" + aTabela[nPos][2]

/*/{Protheus.doc} BJDadosSA6
Devolve banco, nome, agencia e conta com os digitos separados.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cPortad, character, E1_PORTADO - banco
@param   cAgenci, character, E1_AGEDEP - agencia
@param   cConta , character, E1_CONTA - conta
@return  array, {cBanco, cNomeBco, cAgencia, cDvAge, cConta, cDvCta}
/*/
Static Function BJDadosSA6(cPortad, cAgenci, cConta)

	Local aRet   := {"", "", "", "", "", ""}
	Local aArea  := GetArea()
	Local cChave := ""
	Local cAge   := ""
	Local cCta   := ""
	Local nPos   := 0

	Static aCache := {}

	Default cPortad := ""
	Default cAgenci := ""
	Default cConta  := ""

	cPortad := AllTrim(cValToChar(cPortad))
	cAgenci := AllTrim(cValToChar(cAgenci))
	cConta  := AllTrim(cValToChar(cConta))
	cChave  := cPortad + "|" + cAgenci + "|" + cConta

	nPos := aScan(aCache, {|x| x[1] == cChave})

	If nPos > 0
		RestArea(aArea)
		Return aCache[nPos][2]
	EndIf

	aRet[1] := cPortad
	aRet[3] := cAgenci
	aRet[5] := cConta

	dbSelectArea("SA6")
	SA6->(dbSetOrder(1))

	If SA6->(dbSeek(xFilial("SA6") + PadR(cPortad, TamSX3("A6_COD")[1]) + ;
		PadR(cAgenci, TamSX3("A6_AGENCIA")[1]) + PadR(cConta, TamSX3("A6_NUMCON")[1])))

		aRet[1] := AllTrim(SA6->A6_COD)
		aRet[2] := AllTrim(SA6->A6_NOME)

		// Agencia: o digito proprio quando existe; senao, o ultimo caractere
		cAge := AllTrim(SA6->A6_AGENCIA)

		If !Empty(AllTrim(SA6->A6_DVAGE))
			aRet[3] := cAge
			aRet[4] := AllTrim(SA6->A6_DVAGE)
		ElseIf Len(cAge) > 1
			aRet[3] := SubStr(cAge, 1, Len(cAge) - 1)
			aRet[4] := Right(cAge, 1)
		Else
			aRet[3] := cAge
		EndIf

		// Conta: pode vir "0630524-5", ou com o digito em A6_DVCTA, ou colado
		cCta := AllTrim(SA6->A6_NUMCON)

		If "-" $ cCta .And. Empty(AllTrim(SA6->A6_DVCTA))
			aRet[5] := StrTran(SubStr(cCta, 1, RAt("-", cCta) - 1), "-", "")
			aRet[6] := SubStr(cCta, RAt("-", cCta) + 1, 1)
		ElseIf !Empty(AllTrim(SA6->A6_DVCTA))
			aRet[5] := cCta
			aRet[6] := AllTrim(SA6->A6_DVCTA)
		ElseIf Len(cCta) > 1
			aRet[5] := SubStr(cCta, 1, Len(cCta) - 1)
			aRet[6] := Right(cCta, 1)
		Else
			aRet[5] := cCta
		EndIf

	Else
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Conta " + cChave + " nao encontrada na SA6. " + ;
			"O boleto ira sem o nome do banco e sem os digitos de agencia e conta.", 0, 0, {})
	EndIf

	aAdd(aCache, {cChave, aRet})

	RestArea(aArea)

Return aRet

/*/{Protheus.doc} BJDacNosso
Devolve o digito verificador do nosso numero.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cCartei, character, E1_CTRBOL - carteira do boleto
@param   cNumBco, character, E1_NUMBCO - nosso numero
@param   cDacSE1, character, E1_DACNOSS, quando o campo existir
@return  variant, Digito verificador, ou Nil quando nao ha como determinar
/*/
Static Function BJDacNosso(cCartei, cNumBco, cDacSE1)

	Local cRet := ""

	Default cCartei := ""
	Default cNumBco := ""
	Default cDacSE1 := ""

	cRet := AllTrim(cValToChar(cDacSE1))

	If !Empty(cRet)
		Return Left(cRet, 2)
	EndIf

	If Empty(AllTrim(cValToChar(cNumBco))) .Or. Empty(AllTrim(cValToChar(cCartei)))
		Return Nil
	EndIf

	// A funcao mora no fonte do boleto; ambiente sem ela devolve Nil e a
	// plataforma recalcula pelo seu proprio modulo 11.
	If !FindFunction("U_DACBRA")
		Return Nil
	EndIf

	cRet := AllTrim(cValToChar(U_DACBRA("237", cNumBco, AllTrim(cValToChar(cCartei)))))

	If Empty(cRet)
		Return Nil
	EndIf

Return Left(cRet, 2)

/*/{Protheus.doc} BJInstrBol
Monta as instrucoes ao caixa especificas deste titulo.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   nJuros, numeric, Juros por dia de atraso, em reais
@param   nMulta, numeric, Multa por atraso, em reais
@param   nDesc , numeric, Desconto ate o vencimento, em reais
@return  variant, Instrucoes separadas por quebra de linha, ou Nil quando nao ha
/*/
Static Function BJInstrBol(nJuros, nMulta, nDesc)

	Local cRet  := ""
	Local cPict := PesqPict("SE1", "E1_SALDO")

	Default nJuros := 0
	Default nMulta := 0
	Default nDesc  := 0

	If nJuros > 0
		cRet += "Importancia por Dia de Atraso de R$ " + AllTrim(Transform(nJuros, cPict))
	EndIf

	If nMulta > 0
		If !Empty(cRet)
			cRet += CRLF
		EndIf
		cRet += "Apos Vencimento Cobrar Multa de R$ " + AllTrim(Transform(nMulta, cPict))
	EndIf

	If nDesc > 0
		If !Empty(cRet)
			cRet += CRLF
		EndIf
		cRet += "Conceder Desconto de R$ " + AllTrim(Transform(nDesc, cPict)) + " ate o vencimento."
	EndIf

	If Empty(cRet)
		Return Nil
	EndIf

Return Left(cRet, 1000)

/*/{Protheus.doc} BJContaTit
Identifica a conta de cobranca do titulo: banco/agencia/conta/carteira.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cPortad, character, E1_PORTADO - codigo do banco
@param   cAgenci, character, E1_AGEDEP - agencia
@param   cConta , character, E1_CONTA - conta corrente
@param   cCartei, character, E1_CTRBOL - carteira do boleto
@return  variant, Identificacao da conta, ou Nil quando nao ha cobranca bancaria
/*/
Static Function BJContaTit(cPortad, cAgenci, cConta, cCartei)

	Local cRet := ""

	Default cPortad := ""
	Default cAgenci := ""
	Default cConta  := ""
	Default cCartei := ""

	cPortad := AllTrim(cValToChar(cPortad))
	cAgenci := AllTrim(cValToChar(cAgenci))
	cConta  := AllTrim(cValToChar(cConta))
	cCartei := AllTrim(cValToChar(cCartei))

	If Empty(cPortad)
		Return Nil
	EndIf

	cRet := cPortad

	If !Empty(cAgenci)
		cRet += "/" + cAgenci
	EndIf

	If !Empty(cConta)
		cRet += "/" + cConta
	EndIf

	If !Empty(cCartei)
		cRet += "/" + cCartei
	EndIf

	// O contrato limita a 80 caracteres
Return Left(cRet, 80)

/*/{Protheus.doc} BJMAPOBJ
Objetivos de venda - sem origem no ERP.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Chave de integracao a reprocessar
@return  array, Vazio enquanto nao houver origem definida
/*/
User Function BJMAPOBJ(cMarca, cChave, cMarcaFim, lEnvDel)

	Local aRet := {}

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""
	Default lEnvDel   := .T.

Return aRet
