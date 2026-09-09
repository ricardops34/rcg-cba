#include "totvs.ch"

// Sentido e status da mensagem, iguais aos do BJPLA002 - a fila e a mesma.
#Define BJ_SAIDA          "S"
#Define BJ_EXECUTADA      "2"
#Define BJ_ERRO           "3"

// Pausa entre requisicoes. Deriva do teto da API - 60 req/min nas rotas de
// integracao, contadas por IP de origem - e baixa-la nao acelera a carga: rende
// 429, retentativa e espera progressiva, mais lento no total.
#Define BJ_PAUSA_REQ      1050

/*/{Protheus.doc} BJPLA003
Coleta dos dados do ERP para envio a Plataforma BJ.

Duas etapas, e a separacao entre elas e o que a fila trouxe de novo:

	1. VARREDURA - le as tabelas de origem por S_T_A_M_P_, monta o JSON e
	   **enfileira**. Nao envia nada. Terminada a varredura de uma entidade, a
	   marca d'agua dela ja pode avancar: o que precisa ir esta guardado na SZZ.

	2. DRENAGEM - le as pendentes de saida na ordem da sequencia e executa a
	   requisicao. Falhou, a mensagem continua na fila e volta no proximo ciclo,
	   sozinha, sem arrastar as outras.

Antes as duas aconteciam na mesma volta do laco, e por isso um erro em qualquer
entidade congelava a marca de todas.

Os treze mapeadores sao chamados por macro a partir do catalogo (BJPLA002), cada
um devolvendo {cChave, oJson, cVerbo}. Registro ativo gera POST, que a API trata
como upsert; registro com D_E_L_E_T_ preenchido gera DELETE com a mesma chave.

@type    function
@author  Ricardo P Sotomayor
@since   01/09/2026
/*/

// ===========================================================================
// VARREDURA
// ===========================================================================

/*/{Protheus.doc} BJCOLETA
Ponto de entrada / funcao de coleta para chamadas manuais ou por rotina.
/*/
User Function BJCOLETA(lJob, xEntid, cChave, dDataDe, dDataAte)
	Default lJob     := .F.
	Default xEntid   := ""
	Default cChave   := ""
	Default dDataDe  := CToD("//")
	Default dDataAte := CToD("//")

Return U_BJVARRE(xEntid, cChave, dDataDe, dDataAte)

/*/{Protheus.doc} BJVARRE
Varre as entidades e enfileira o que mudou.

A hora e lida **antes** de cada entidade, nunca depois. Marcar a hora do fim
descartaria em silencio tudo que fosse alterado durante a leitura; lendo antes,
o pior caso e reenviar no ciclo seguinte algo que ja subiu - e o POST e upsert.

A marca so avanca para a entidade que foi varrida inteira sem excecao. Uma
entidade que falhe nao impede as outras de avancarem, que e a diferenca em
relacao a marca unica de antes.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   xEntid  , variant  , Id da entidade (character) ou lista de IDs (array). Vazio varre o catalogo ativo
@param   cChave  , character, Chave unica a reprocessar. Ignora a marca d'agua
@param   dDataDe , date     , Data inicial opcional (ignora corte e usa inicio do dia em UTC)
@param   dDataAte, date     , Data final opcional (limite ate o fim do dia em UTC)
@return  array, {nLidos, nEnfileirados, nEntidades, nErros}
@example aTot := U_BJVARRE("produtos", "", Date() - 7, Date())
/*/
User Function BJVARRE(xEntid, cChave, dDataDe, dDataAte)

	Local aTotal := {0, 0, 0, 0}
	Local aCat   := U_BJCATALO()
	Local nX     := 0

	Default xEntid   := ""
	Default cChave   := ""
	Default dDataDe  := CToD("//")
	Default dDataAte := CToD("//")

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Nada a varrer.", 0, 0, {})
		Return aTotal
	EndIf

	For nX := 1 To Len(aCat)

		If ValType(xEntid) == "A"
			If aScan(xEntid, {|cId| cId == aCat[nX][1]}) == 0
				Loop
			EndIf
		ElseIf !Empty(xEntid) .And. !(aCat[nX][1] == xEntid)
			Loop
		EndIf

		// Sem entidade explicita, respeita a marcacao de ativo do catalogo
		If Empty(xEntid) .And. !aCat[nX][5]
			Loop
		EndIf

		BJVarreEnt(aCat[nX], cChave, @aTotal, dDataDe, dDataAte)

	Next nX

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Varredura concluida - lidos: " + cValToChar(aTotal[1]) + ;
		" enfileirados: " + cValToChar(aTotal[2]) + ;
		" entidades: " + cValToChar(aTotal[3]) + ;
		" erros: " + cValToChar(aTotal[4]), 0, 0, {})

Return aTotal

/*/{Protheus.doc} BJVarreEnt
Varre uma entidade e enfileira os registros que ela devolver.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aEnt    , array    , Linha do catalogo
@param   cChave  , character, Chave unica a reprocessar
@param   aTotal  , array    , [Referencia] Totalizadores
@param   dDataDe , date     , Data inicial opcional
@param   dDataAte, date     , Data final opcional
@return  Nil
/*/
Static Function BJVarreEnt(aEnt, cChave, aTotal, dDataDe, dDataAte)

	Local cId       := aEnt[1]
	Local cColeta   := aEnt[4]
	Local aDados    := {}
	Local cMarca    := ""
	Local cMarcaFim := ""
	Local cAgora    := ""
	Local cSeq      := ""
	Local nX        := 0
	Local nSeg      := Seconds()
	Local bColeta   := Nil
	Local cArqLock  := "\bjapi\" + cEmpAnt + "\bjpla-ent-" + Lower(AllTrim(cId)) + ".tsk"
	Local aArea     := GetArea()
	Local cQuerySeq := ""
	Local cAliasSeq := ""
	Local oStmtSeq  := Nil
	Local nTamSeq   := 0

	Default dDataDe  := CToD("//")
	Default dDataAte := CToD("//")

	MakeDir("\bjapi\")
	MakeDir("\bjapi\" + cEmpAnt + "\")

	// Uma varredura por entidade de cada vez. Se o arquivo existir, outro processo ja esta varrendo esta entidade.
	If File(cArqLock)
		aTotal[4] += 1
		RestArea(aArea)
		Return Nil
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	// A hora vem em UTC porque o S_T_A_M_P_ e escrito pelo gatilho do DBAccess em UTC.
	cAgora := Left(StrTran(StrTran(FWTimeStamp(6, Date(), Time()), "T", " "), "Z", ""), 19)

	// Se data inicial foi informada pelo usuario, usa o inicio do dia em UTC
	If !Empty(dDataDe)
		cMarca := Left(StrTran(StrTran(FWTimeStamp(6, dDataDe, "00:00:00"), "T", " "), "Z", ""), 19)
	Else
		// Busca na SZZ a data/hora da ultima coleta com sucesso desta entidade especifica
		dbSelectArea("SZZ")
		SZZ->(dbSetOrder(3)) // ZZ_FILIAL + ZZ_ENTID + ZZ_CHVORI

		If SZZ->(dbSeek(xFilial("SZZ") + PadR(cId, TamSX3("ZZ_ENTID")[1]) + PadR("*CONTROLE*", TamSX3("ZZ_CHVORI")[1])))
			cMarca := AllTrim(SZZ->ZZ_MARCA)
		EndIf

		If Empty(cMarca) .Or. Len(cMarca) < 10
			// Primeira carga desta entidade: recua 30 dias por padrao
			cMarca := Left(StrTran(StrTran(FWTimeStamp(6, Date() - 30, "00:00:00"), "T", " "), "Z", ""), 19)
		EndIf
	EndIf

	// Se data final foi informada pelo usuario, usa o fim do dia em UTC.
	// Se nao informada (Job agendado ou varredura padrao), pega ate a hora atual (cAgora),
	// cobrindo tudo entre a ultima importacao e a atual.
	If !Empty(dDataAte)
		cMarcaFim := Left(StrTran(StrTran(FWTimeStamp(6, dDataAte, "23:59:59"), "T", " "), "Z", ""), 19)
	Else
		cMarcaFim := cAgora
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Coletando " + aEnt[2] + " (" + cId + ") - intervalo: " + cMarca + " ate " + Iif(!Empty(cMarcaFim), cMarcaFim, cAgora), 0, 0, {})

	// O mapeador e chamado por macro: cada entidade tem a sua.
	bColeta := &("{|cRef, cChv, cFim| " + cColeta + "(cRef, cChv, cFim) }")
	aDados  := Eval(bColeta, cMarca, cChave, cMarcaFim)

	If ValType(aDados) != "A"
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mapeador " + cColeta + " nao devolveu array. Entidade " + cId + " ignorada.", 0, 0, {})
		aTotal[4] += 1
		If File(cArqLock)
			FErase(cArqLock)
		EndIf
		RestArea(aArea)
		Return Nil
	EndIf

	aTotal[1] += Len(aDados)

	For nX := 1 To Len(aDados)

		// aDados[nX] = {cChaveRegistro, oJsonPayload, cVerbo}
		cSeq := U_BJENFILA(BJ_SAIDA, cId, aDados[nX][1], aDados[nX][3], aDados[nX][2]:ToJson())

		If Empty(cSeq)
			aTotal[4] += 1
		Else
			aTotal[2] += 1
		EndIf

	Next nX

	// Se a entidade inteira foi varrida e nao houve erro e nao e coleta pontual (chave ou intervalo de datas), atualiza a data/hora de corte
	If Empty(cChave) .And. Empty(dDataDe) .And. Empty(dDataAte) .And. aTotal[4] == 0
		dbSelectArea("SZZ")
		SZZ->(dbSetOrder(3)) // ZZ_FILIAL + ZZ_ENTID + ZZ_CHVORI

		If SZZ->(dbSeek(xFilial("SZZ") + PadR(cId, TamSX3("ZZ_ENTID")[1]) + PadR("*CONTROLE*", TamSX3("ZZ_CHVORI")[1])))
			RecLock("SZZ", .F.)
		Else
			// Gera sequencia por MAX em SQL para o registro de controle
			nTamSeq := TamSX3("ZZ_SEQUEN")[1]
			If nTamSeq <= 0
				nTamSeq := 10
			EndIf

			cQuerySeq := "SELECT MAX(ZZ_SEQUEN) AS MAXSEQ "
			cQuerySeq += "  FROM " + RetSqlName("SZZ") + " SZZ "
			cQuerySeq += " WHERE SZZ.D_E_L_E_T_ = ' ' "
			cQuerySeq += "   AND SZZ.ZZ_FILIAL  = ? "

			oStmtSeq := FWExecStatement():New(ChangeQuery(cQuerySeq))
			oStmtSeq:SetString(1, xFilial("SZZ"))
			cAliasSeq := oStmtSeq:OpenAlias()

			If (cAliasSeq)->(!Eof()) .And. !Empty((cAliasSeq)->MAXSEQ)
				cSeq := Soma1(PadL(AllTrim((cAliasSeq)->MAXSEQ), nTamSeq, "0"))
			Else
				cSeq := StrZero(1, nTamSeq)
			EndIf

			(cAliasSeq)->(dbCloseArea())
			oStmtSeq:Destroy()

			RecLock("SZZ", .T.)
			SZZ->ZZ_FILIAL := xFilial("SZZ")
			SZZ->ZZ_SEQUEN := cSeq
			SZZ->ZZ_TIPO   := "S"
			SZZ->ZZ_ENTID  := cId
			SZZ->ZZ_CHVORI := "*CONTROLE*"
			SZZ->ZZ_STATUS := "2"
			SZZ->ZZ_DTCRIA := Date()
			SZZ->ZZ_HRCRIA := Time()
		EndIf

		SZZ->ZZ_MARCA  := cAgora
		SZZ->ZZ_DTEXEC := Date()
		SZZ->ZZ_HREXEC := Time()
		SZZ->(MsUnlock())
	EndIf

	aTotal[3] += 1

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Concluido " + cId + " em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s - " + ;
		cValToChar(Len(aDados)) + " registros enfileirados", 0, 0, {})

	If File(cArqLock)
		FErase(cArqLock)
	EndIf

	RestArea(aArea)

Return Nil

// ===========================================================================
// DRENAGEM
// ===========================================================================

/*/{Protheus.doc} BJDRENA
Executa as mensagens de saida que estao na fila.

Le na ordem da sequencia, que e a ordem de chegada - e, como a varredura
enfileira o catalogo na ordem de carga, e tambem a ordem que a API exige: ela
nao aceita referencia a registro inexistente.

A rota sai do catalogo. POST vai na rota da entidade; PATCH e DELETE levam a
chave no fim da URL, que e como o contrato identifica o recurso.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   nLimite, numeric, Maximo de mensagens nesta passada. Zero drena tudo
@return  array, {nLidas, nEnviadas, nErros}
@example aTot := U_BJDRENA(0)
/*/
User Function BJDRENA(nLimite)

	Local aTotal := {0, 0, 0}
	Local aFila  := {}
	Local aEnt   := {}
	Local aCat   := U_BJCATALO()
	Local cRota  := ""
	Local cResp  := ""
	Local cErro  := ""
	Local nHttp  := 0
	Local nPos   := 0
	Local nX     := 0

	Default nLimite := 0

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Fila nao drenada.", 0, 0, {})
		Return aTotal
	EndIf

	aFila     := U_BJPENDEN(BJ_SAIDA, nLimite)
	aTotal[1] := Len(aFila)

	If Len(aFila) == 0
		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Nada pendente na fila de saida.", 0, 0, {})
		Return aTotal
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Drenando " + cValToChar(Len(aFila)) + " mensagens de saida.", 0, 0, {})

	For nX := 1 To Len(aFila)

		// aFila[nX] = {cSequen, cEntid, cChave, cVerbo, cJson, nTentat}
		nPos := aScan(aCat, {|x| x[1] == aFila[nX][2]})

		If nPos == 0
			FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mensagem " + aFila[nX][1] + " aponta para a entidade " + ;
				aFila[nX][2] + ", que nao esta no catalogo.", 0, 0, {})
			U_BJGRAVA(aFila[nX][1], BJ_ERRO, 0, "Entidade fora do catalogo: " + aFila[nX][2], "")
			aTotal[3] += 1
			Loop
		EndIf

		aEnt  := aCat[nPos]
		cRota := aEnt[3]

		If "{chave}" $ cRota
			// Rota com a chave no meio, como a do XML da nota:
			// /integracao/notas-saida/{chave}/xml
			cRota := StrTran(cRota, "{chave}", AllTrim(aFila[nX][3]))
		ElseIf aFila[nX][4] != "POST"
			// POST cria ou atualiza na rota da entidade. PATCH e DELETE
			// identificam o recurso pela chave no fim da URL.
			cRota += "/" + AllTrim(aFila[nX][3])
		EndIf

		If U_BJHTTP(aFila[nX][4], cRota, aFila[nX][5], @cResp, @nHttp, @cErro)

			// A chave de destino da saida e o id que a plataforma atribuiu ao
			// registro. Guardar os dois lados fecha o rastro nas duas direcoes:
			// dado um codigoErp, saber o id de la; dado o id, saber de onde veio.
			U_BJGRAVA(aFila[nX][1], BJ_EXECUTADA, nHttp, cResp, BJIdPlat(cResp))
			aTotal[2] += 1

		ElseIf aFila[nX][4] == "DELETE" .And. nHttp == 404

			// O objetivo do DELETE era que o registro nao estivesse la, e nao esta.
			// Nao ha historico do que ja foi enviado antes desta fila existir, entao
			// uma exclusao pode chegar para uma chave que a plataforma nunca conheceu.
			U_BJGRAVA(aFila[nX][1], BJ_EXECUTADA, nHttp, "404 no DELETE: o registro ja nao existia na plataforma.", "")
			aTotal[2] += 1

		Else

			U_BJGRAVA(aFila[nX][1], BJ_ERRO, nHttp, cErro, "")
			aTotal[3] += 1

		EndIf

		Sleep(BJ_PAUSA_REQ)

		If nX % 50 == 0
			FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Drenagem - " + cValToChar(nX) + " de " + cValToChar(Len(aFila)), 0, 0, {})
		EndIf

	Next nX

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Drenagem concluida - enviadas: " + cValToChar(aTotal[2]) + ;
		" erros: " + cValToChar(aTotal[3]), 0, 0, {})

Return aTotal

/*/{Protheus.doc} BJIdPlat
Extrai da resposta o id que a plataforma atribuiu ao registro.

E a chave de destino da mensagem de saida: o par com a chave de origem, que e o
codigoErp. Resposta sem id - um 204 de PATCH, por exemplo - devolve vazio, e a
mensagem fica so com a chave de origem.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cResp, character, Corpo da resposta da API
@return  character, Id da plataforma, ou vazio
/*/
Static Function BJIdPlat(cResp)

	Local cRet  := ""
	Local oJson := Nil
	Local oDado := Nil

	Default cResp := ""

	If Empty(cResp)
		Return ""
	EndIf

	oJson := JsonObject():New()

	If oJson:FromJson(cResp) == Nil

		// O contrato devolve ora o objeto direto, ora dentro de "data"
		If ValType(oJson:GetJsonObject("id")) == "C"
			cRet := oJson:GetJsonObject("id")
		Else
			oDado := oJson:GetJsonObject("data")

			If ValType(oDado) == "J" .And. ValType(oDado:GetJsonObject("id")) == "C"
				cRet := oDado:GetJsonObject("id")
			EndIf
		EndIf

	EndIf

	oJson := Nil

Return Left(AllTrim(cRet), TamSX3("ZZ_CHVDES")[1])

// ===========================================================================
// MAPEADORES DE CADASTRO
// ===========================================================================

/*/{Protheus.doc} BJMAPRGD
Regras de desconto - SZ0.

A SZ0 guarda a regra e as faixas na mesma tabela: a sequencia "001" e o
cabecalho, as demais sao as faixas, com Z0_PERCDE, Z0_PERCATE e Z0_BASE.

Faixa excluida permanece no array com delete=.T.; a plataforma apaga somente a
sequencia informada.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPRGD(cMarca, cChave, cMarcaFim)

	Local aRet   := {}
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

	cQuery := "SELECT Z0_FILIAL, Z0_CODIGO, Z0_DESC, Z0_DESCAUT, Z0_PERMAX, Z0_COMISS, Z0_PADRAO, Z0_MSBLQL, SZ0.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("SZ0") + " SZ0 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SZ0.Z0_FILIAL = ? "
	cQuery += "   AND SZ0.Z0_SEQ    = ? "

	If !Empty(cChave)
		cQuery += "   AND SZ0.Z0_CODIGO = ? "
	EndIf

	// Cabecalho e faixa tem S_T_A_M_P_ proprio: mexer numa faixa nao encosta na
	// linha "001". Sem o OR, alterar so uma faixa nao subiria a regra.
	If !Empty(cMarca) .And. Empty(cChave)
		cQuery += "   AND (SZ0.S_T_A_M_P_ >= '" + cMarca + "' "
		cQuery += "        OR EXISTS (SELECT 1 "
		cQuery += "                     FROM " + RetSQLName("SZ0") + " SZ0D "
		cQuery += "                    WHERE SZ0D.Z0_FILIAL = SZ0.Z0_FILIAL "
		cQuery += "                      AND SZ0D.Z0_CODIGO = SZ0.Z0_CODIGO "
		cQuery += "                      AND SZ0D.S_T_A_M_P_ >= '" + cMarca + "')) "
	EndIf

	If !Empty(cMarcaFim) .And. Empty(cChave)
		cQuery += "   AND SZ0.S_T_A_M_P_ <= '" + cMarcaFim + "' "
	EndIf

	cQuery += " ORDER BY Z0_CODIGO "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SZ0"))
	oStmt:SetString(3, "001")

	If !Empty(cChave)
		oStmt:SetString(4, cChave)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["codigoErp"]              := (cAlias)->Z0_FILIAL + "-" + (cAlias)->Z0_CODIGO
		oJson["descricao"]              := AllTrim((cAlias)->Z0_DESC)
		oJson["percDescontoAutorizado"] := (cAlias)->Z0_DESCAUT
		oJson["percDescontoMaximo"]     := (cAlias)->Z0_PERMAX
		oJson["percComissao"]           := (cAlias)->Z0_COMISS
		oJson["padrao"]                 := (AllTrim((cAlias)->Z0_PADRAO) == "1")
		oJson["ativo"]                  := !(AllTrim(cValToChar((cAlias)->Z0_MSBLQL)) == "1")
		oJson["faixas"]                 := BJFaixaDesc(AllTrim((cAlias)->Z0_CODIGO))

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["codigoErp"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJFaixaDesc
Faixas de uma regra de desconto - SZ0, todas as sequencias.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cCodigo, character, Z0_CODIGO da regra
@return  array, Faixas no formato do contrato
/*/
Static Function BJFaixaDesc(cCodigo)

	Local aRet   := {}
	Local cAlias := ""
	Local cQuery := ""
	Local oStmt  := Nil
	Local oFaixa := Nil

	cQuery := "SELECT Z0_SEQ, Z0_PERCDE, Z0_PERCATE, Z0_BASE, SZ0.D_E_L_E_T_ AS FAIXA_DELETADA "
	cQuery += "  FROM " + RetSQLName("SZ0") + " SZ0 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SZ0.Z0_FILIAL  = ? "
	cQuery += "   AND SZ0.Z0_CODIGO  = ? "
	cQuery += " ORDER BY Z0_SEQ "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SZ0"))
	oStmt:SetString(3, cCodigo)

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oFaixa := JsonObject():New()
		oFaixa["sequencia"]        := Val((cAlias)->Z0_SEQ)
		oFaixa["percInicial"]      := (cAlias)->Z0_PERCDE
		oFaixa["percFinal"]        := (cAlias)->Z0_PERCATE
		oFaixa["percBaseComissao"] := (cAlias)->Z0_BASE
		oFaixa["delete"]           := !Empty((cAlias)->FAIXA_DELETADA)

		aAdd(aRet, oFaixa)

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPCAT
Categorias - SZ1 (tipo de produto) e SBM (grupo de produtos).

A API tem um recurso hierarquico so: uma subcategoria e uma categoria com
categoriaPaiCodigo preenchido. Nesta base a hierarquia existe em duas tabelas:

	SZ1  "Cadastro de Tipo de Produto" (RESTA01)  -> categoria raiz
	SBM  Grupo de produtos, com BM_YTIPO = Z1_TIPO -> subcategoria

O gatilho RESTG02 confirma a composicao: BM_GRUPO nasce como BM_YTIPO nas duas
primeiras posicoes mais uma sequencia de duas. Nao ha campo customizado
envolvido, e nao ha nada a criar no dicionario.

A SZ1 sai primeiro no array porque a API exige a pai antes da filha, e a fila
preserva a ordem de enfileiramento.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPCAT(cMarca, cChave, cMarcaFim)

	Local aRet := {}

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

	BJCatTipo(cMarca, cChave, @aRet, cMarcaFim)    // SZ1 - as raizes
	BJCatGrupo(cMarca, cChave, @aRet, cMarcaFim)   // SBM - as filhas

Return aRet

/*/{Protheus.doc} BJCatTipo
Categorias raiz - SZ1.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca   , character, Marca d'agua UTC
@param   cChave   , character, Codigo unico a reprocessar
@param   aRet     , array    , [Referencia] Array a preencher
@param   cMarcaFim, character, Limite superior UTC
@return  Nil
/*/
Static Function BJCatTipo(cMarca, cChave, aRet, cMarcaFim)

	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarcaFim := ""

	cQuery := "SELECT Z1_FILIAL, Z1_TIPO, Z1_DESCRIC, SZ1.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("SZ1") + " SZ1 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SZ1.Z1_FILIAL = ? "

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
		oStmt:SetString(3, cChave)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["codigoErp"]           := (cAlias)->Z1_FILIAL + "-" + (cAlias)->Z1_TIPO
		oJson["descricao"]           := AllTrim((cAlias)->Z1_DESCRIC)
		oJson["categoriaPaiCodigo"]  := Nil
		oJson["regraDescontoCodigo"] := Nil
		oJson["ativo"]               := .T.

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["codigoErp"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return Nil

/*/{Protheus.doc} BJCatGrupo
Subcategorias - SBM, apontando para a SZ1 por BM_YTIPO.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca   , character, Marca d'agua UTC
@param   cChave   , character, Codigo unico a reprocessar
@param   aRet     , array    , [Referencia] Array a preencher
@param   cMarcaFim, character, Limite superior UTC
@return  Nil
/*/
Static Function BJCatGrupo(cMarca, cChave, aRet, cMarcaFim)

	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarcaFim := ""

	cQuery := "SELECT BM_FILIAL, BM_GRUPO, BM_DESC, BM_YTIPO, BM_MSBLQL, SBM.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("SBM") + " SBM "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SBM.BM_FILIAL = ? "

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
		oStmt:SetString(3, cChave)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["codigoErp"]           := (cAlias)->BM_FILIAL + "-" + (cAlias)->BM_GRUPO
		oJson["descricao"]           := AllTrim((cAlias)->BM_DESC)
		oJson["regraDescontoCodigo"] := Nil

		// Grupo sem tipo sobe como raiz. E dado inconsistente no cadastro, mas
		// mandar categoriaPaiCodigo apontando para vazio faria a API recusar o
		// registro inteiro.
		If Empty((cAlias)->BM_YTIPO)
			oJson["categoriaPaiCodigo"] := Nil
		Else
			oJson["categoriaPaiCodigo"] := FWxFilial("SZ1") + "-" + AllTrim((cAlias)->BM_YTIPO)
		EndIf

		oJson["ativo"] := !(AllTrim(cValToChar((cAlias)->BM_MSBLQL)) == "1")

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["codigoErp"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return Nil

/*/{Protheus.doc} BJMAPCND
Condicoes de pagamento - SE4.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPCND(cMarca, cChave, cMarcaFim)

	Local aRet   := {}
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

	cQuery := "SELECT E4_FILIAL, E4_CODIGO, E4_DESCRI, E4_FORMA, E4_MSBLQL, SE4.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("SE4") + " SE4 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SE4.E4_FILIAL = ? "

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
		oStmt:SetString(3, cChave)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["codigoErp"] := (cAlias)->E4_FILIAL + "-" + (cAlias)->E4_CODIGO
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

		aAdd(aRet, {oJson["codigoErp"], oJson, cVerbo})

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
User Function BJMAPARM(cMarca, cChave, cMarcaFim)

	Local aRet   := {}
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

	cQuery := "SELECT NNR_FILIAL, NNR_CODIGO, NNR_DESCRI, NNR_MSBLQL, NNR.D_E_L_E_T_ AS DELETADO "
	cQuery += "  FROM " + RetSQLName("NNR") + " NNR "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND NNR.NNR_FILIAL = ? "

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
		oStmt:SetString(3, cChave)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["codigoErp"] := (cAlias)->NNR_FILIAL + "-" + (cAlias)->NNR_CODIGO
		oJson["descricao"] := AllTrim((cAlias)->NNR_DESCRI)
		oJson["ativo"]     := !(AllTrim(cValToChar((cAlias)->NNR_MSBLQL)) == "1")

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["codigoErp"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPPRD
Produtos - SB1.

A hierarquia de categoria vem de dois campos do proprio produto:

	categoriaCodigo    = B1_TPRCG, o tipo, que casa com Z1_TIPO da SZ1
	subCategoriaCodigo = B1_GRUPO, o grupo, que casa com BM_GRUPO da SBM

E o mesmo par que os relatorios desta base ja usam (BJFATX02: B1_TPRCG = Z1_TIPO
e B1_GRUPO = BM_GRUPO).

**marca nao e enviado.** Nao existe campo de marca neste dicionario, e o
contrato aceita a ausencia - o campo e opcional.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPPRD(cMarca, cChave, cMarcaFim)

	Local aRet   := {}
	Local cAlias := ""
	Local cQuery := ""
	Local cVerbo := ""
	Local oStmt  := Nil
	Local oJson  := Nil
	Local lQE    := SB1->(FieldPos("B1_QE"))      > 0
	Local lPrv   := SB1->(FieldPos("B1_PRV1"))    > 0
	Local lGtin  := SB1->(FieldPos("B1_CODGTIN")) > 0
	Local lPeso  := SB1->(FieldPos("B1_PESO"))    > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

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

	cQuery += "  FROM " + RetSQLName("SB1") + " SB1 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SB1.B1_FILIAL = ? "

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
		oStmt:SetString(3, cChave)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		oJson := JsonObject():New()
		oJson["codigoErp"]           := (cAlias)->B1_FILIAL + "-" + (cAlias)->B1_COD
		oJson["descricao"]           := AllTrim((cAlias)->B1_DESC)
		oJson["armazemCodigo"]       := FWxFilial("NNR") + "-" + (cAlias)->B1_LOCPAD
		oJson["regraDescontoCodigo"] := Nil
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
			oJson["categoriaCodigo"] := Nil
		Else
			oJson["categoriaCodigo"] := FWxFilial("SZ1") + "-" + AllTrim((cAlias)->B1_TPRCG)
		EndIf

		If Empty((cAlias)->B1_GRUPO)
			oJson["subCategoriaCodigo"] := Nil
		Else
			oJson["subCategoriaCodigo"] := FWxFilial("SBM") + "-" + AllTrim((cAlias)->B1_GRUPO)
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

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["codigoErp"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPVND
Vendedores - SA3.

O contrato distingue "atua como vendedor de carteira" de "e supervisor de
outros", e traz o vinculo hierarquico por supervisorCodigo (A3_SUPER). Gerente e
usuario de login nunca sao tocados pelo ERP: sao vinculos mantidos na tela da
plataforma.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo unico a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPVND(cMarca, cChave, cMarcaFim)

	Local aRet    := {}
	Local cAlias  := ""
	Local cQuery  := ""
	Local cVerbo  := ""
	Local oStmt   := Nil
	Local oJson   := Nil
	Local cTel    := ""
	Local lBloq   := .F.
	Local lComis  := SA3->(FieldPos("A3_COMIS"))   > 0
	Local lSuper  := SA3->(FieldPos("A3_SUPER"))   > 0
	Local lTpVend := SA3->(FieldPos("A3_TIPVEND")) > 0
	Local lCel    := SA3->(FieldPos("A3_CEL"))     > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

	cQuery := "SELECT A3_FILIAL, A3_COD, A3_NOME, A3_NREDUZ, A3_EMAIL, A3_TEL, A3_DDDTEL, A3_MSBLQL, SA3.D_E_L_E_T_ AS DELETADO "

	If lComis
		cQuery += ", A3_COMIS "
	EndIf
	If lSuper
		cQuery += ", A3_SUPER "
	EndIf
	If lTpVend
		cQuery += ", A3_TIPVEND "
	EndIf
	If lCel
		cQuery += ", A3_CEL "
	EndIf

	cQuery += "  FROM " + RetSQLName("SA3") + " SA3 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SA3.A3_FILIAL = ? "

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
		oStmt:SetString(3, cChave)
	EndIf

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
		oJson["codigoErp"]      := (cAlias)->A3_FILIAL + "-" + (cAlias)->A3_COD
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

		// A3_SUPER preenchido = este vendedor responde a um supervisor
		If lSuper .And. !Empty((cAlias)->A3_SUPER)
			oJson["supervisorCodigo"] := FWxFilial("SA3") + "-" + (cAlias)->A3_SUPER
		Else
			oJson["supervisorCodigo"] := Nil
		EndIf

		// A3_TIPVEND distingue vendedor de supervisor no dicionario padrao
		If lTpVend
			oJson["supervisor"] := (AllTrim((cAlias)->A3_TIPVEND) == "S")
			oJson["vendedor"]   := !(AllTrim((cAlias)->A3_TIPVEND) == "S")
		Else
			oJson["supervisor"] := .F.
			oJson["vendedor"]   := .T.
		EndIf

		cVerbo := "POST"
		If (cAlias)->DELETADO == "*"
			cVerbo := "DELETE"
		EndIf

		aAdd(aRet, {oJson["codigoErp"], oJson, cVerbo})

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPCLI
Clientes - SA1.

A chave da API e uma so; no Protheus o cliente e A1_COD + A1_LOJA. O codigoErp
enviado concatena os dois, mesmo criterio do portal antigo, e cabe nos 30
caracteres do contrato.

Atencao: o PATCH de cliente **nao altera o cadastro** na plataforma - a mudanca
entra na fila de aprovacao interna dela.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo + loja a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPCLI(cMarca, cChave, cMarcaFim)

	Local aRet    := {}
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

	// A chave da API concatena codigo e loja. Para reprocessar um cliente, a loja
	// e recuperada pelo tamanho fixo do campo no dicionario - concatenacao em SQL
	// varia por banco e nao entra na clausula.
	If !Empty(cChave)
		cCodSA1 := SubStr(cChave, 1, Len(AllTrim(cChave)) - nTamLoj)
		cLojSA1 := Right(AllTrim(cChave), nTamLoj)
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
		oJson["codigoErp"]               := cCodigo
		oJson["razaoSocial"]             := AllTrim((cAlias)->A1_NOME)
		oJson["vendedorCodigo"]          := FWxFilial("SA3") + "-" + (cAlias)->A1_VEND
		oJson["tabelaPrecoCodigo"]       := FWxFilial("DA0") + "-" + (cAlias)->A1_TABELA
		oJson["condicaoPagamentoCodigo"] := FWxFilial("SE4") + "-" + (cAlias)->A1_COND
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

A distincao importa nos campos de referencia, que apontam para o codigoErp de
outro cadastro: string vazia faz a API procurar um registro de codigo vazio e
recusar o payload inteiro, enquanto null e aceito como "nao informado".

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

Cadastro enxuto: identificacao, contato e endereco. Nao tem carteira, credito nem
tabela de preco - o fornecedor e espelho read-only na plataforma, e quem manda
nele e o ERP.

E o alvo de fornecedorCodigo nas notas de entrada, entao carrega antes delas: a
API recusa referencia a registro inexistente.

Nao confundir com produtos.codigoFornecedor, que e o codigo do item no catalogo
do fornecedor e continua sendo texto solto - nao aponta para ca.

**observacao nao e enviado.** A SA2 desta base nao tem A2_OBSERV - conferido no
SX3 em 08/09/2026. O campo existe no contrato e fica vazio de proposito; se um
dia houver origem, ela entra aqui.

@type    User Function
@author  Ricardo P Sotomayor
@since   08/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, codigoErp a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPFOR(cMarca, cChave, cMarcaFim)

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

	// A chave da API concatena filial, codigo e loja. Para reprocessar um
	// fornecedor, as tres partes sao separadas aqui - concatenacao em SQL varia
	// por banco e nao entra na clausula.
	If !Empty(cChave)
		cChvAux := AllTrim(cChave)
		If At("-", cChvAux) > 0
			cChvAux := SubStr(cChvAux, At("-", cChvAux) + 1)
		EndIf
		aChave := StrTokArr(cChvAux, "-")

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
		oJson["codigoErp"]   := cCodigo
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

Os itens seguem no payload do cabecalho. Uma DA1 excluida permanece no array com
delete=.T.; a plataforma apaga somente essa linha pelo codigoErp.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Codigo de tabela a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPTAB(cMarca, cChave, cMarcaFim)

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

	cQuery := "SELECT DA0_FILIAL, DA0_CODTAB, DA0_DESCRI, DA0_DATDE, DA0_DATATE, DA0_ATIVO, DA0.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       DA1_FILIAL, DA1_CODPRO, DA1_PRCVEN, DA1_ATIVO, DA1.D_E_L_E_T_ AS ITEM_DELETADO "

	If lRegra
		cQuery += ", DA1_XDESC "
	EndIf

	// O JOIN inclui ativos e excluidos para enviar delete no proprio item.
	cQuery += "  FROM " + RetSQLName("DA0") + " DA0 "
	cQuery += "  LEFT JOIN " + RetSQLName("DA1") + " DA1 "
	cQuery += "    ON DA1.DA1_FILIAL = DA0.DA0_FILIAL "
	cQuery += "   AND DA1.DA1_CODTAB = DA0.DA0_CODTAB "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND DA0.DA0_FILIAL = ? "

	If !Empty(cChave)
		// cChave e o codigoErp: filial-codigo. Filtra pelo codigo, a parte 2.
		cQuery += "   AND DA0.DA0_CODTAB = ? "
	ElseIf !Empty(cMarca)
		// O delta fica no nivel da TABELA, num EXISTS - nao na linha do JOIN.
		// Cabecalho e item tem S_T_A_M_P_ proprio: mexer no preco de um produto
		// toca a DA1 e nao encosta na DA0. E, posto no JOIN, a tabela voltaria com
		// so o item que mudou, e a plataforma apagaria os demais precos.
		cQuery += "   AND (DA0.S_T_A_M_P_ >= '" + cMarca + "' "
		cQuery += "        OR EXISTS (SELECT 1 "
		cQuery += "                     FROM " + RetSQLName("DA1") + " DA1D "
		cQuery += "                    WHERE DA1D.DA1_FILIAL = DA0.DA0_FILIAL "
		cQuery += "                      AND DA1D.DA1_CODTAB = DA0.DA0_CODTAB "
		cQuery += "                      AND DA1D.S_T_A_M_P_ >= '" + cMarca + "')) "

		If !Empty(cMarcaFim)
			cQuery += "   AND DA0.S_T_A_M_P_ <= '" + cMarcaFim + "' "
		EndIf
	EndIf

	cQuery += " ORDER BY DA0_CODTAB, DA1_CODPRO "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("DA0"))

	If !Empty(cChave)
		aChave := StrTokArr(cChave, "-")

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

			oJson["codigoErp"] := cChvTab
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

			// Chave do item: a da tabela mais o produto. Um produto aparece uma
			// unica vez por tabela de preco, entao o par identifica a linha.
			oItem["codigoErp"]     := (cAlias)->DA1_FILIAL + "-" + ;
			                          (cAlias)->DA0_CODTAB + "-" + ;
			                          (cAlias)->DA1_CODPRO
			oItem["produtoCodigo"] := FWxFilial("SB1") + "-" + (cAlias)->DA1_CODPRO
			oItem["preco"]         := (cAlias)->DA1_PRCVEN
			oItem["ativo"]         := (AllTrim((cAlias)->DA1_ATIVO) == "1")
			oItem["delete"]        := !Empty((cAlias)->ITEM_DELETADO)

			If lRegra
				BJPoeTexto(oItem, "regraDescontoCodigo", (cAlias)->DA1_XDESC)
			Else
				oItem["regraDescontoCodigo"] := Nil
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

O contrato separa saldo de reserva: "saldo" e o saldo fisico (B2_QATU) e
"reserva" vai no campo proprio. Subtrair um do outro aqui esconderia da
plataforma quanto esta empenhado.

A chave e produto + armazem, e a rota reflete isso:
	PATCH /integracao/estoque/{produtoCodigo}/{armazemCodigo}

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, Chave "produto/armazem" a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPEST(cMarca, cChave, cMarcaFim)

	Local aRet    := {}
	Local cAlias  := ""
	Local cQuery  := ""
	Local cVerbo  := ""
	Local oStmt   := Nil
	Local oJson   := Nil
	Local cChvReg := ""
	Local cProd   := ""
	Local cLocal  := ""
	Local nPos    := 0
	Local lCusto  := SB2->(FieldPos("B2_CM1"))    > 0
	Local lUltCom := SB2->(FieldPos("B2_DTUCOM")) > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

	cQuery := "SELECT B2_FILIAL, B2_COD, B2_LOCAL, B2_QATU, B2_RESERVA, SB2.D_E_L_E_T_ AS DELETADO "

	If lCusto
		cQuery += ", B2_CM1 "
	EndIf
	If lUltCom
		cQuery += ", B2_DTUCOM "
	EndIf

	cQuery += "  FROM " + RetSQLName("SB2") + " SB2 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SB2.B2_FILIAL = ? "

	If !Empty(cChave)
		nPos   := At("/", cChave)
		cProd  := SubStr(cChave, 1, nPos - 1)
		cLocal := SubStr(cChave, nPos + 1)
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
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SB2"))

	If !Empty(cChave)
		oStmt:SetString(3, cProd)
		oStmt:SetString(4, cLocal)
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		cChvReg := (cAlias)->B2_FILIAL + "-" + (cAlias)->B2_COD + "-" + (cAlias)->B2_LOCAL

		oJson := JsonObject():New()
		oJson["codigoErp"]     := cChvReg
		oJson["produtoCodigo"] := FWxFilial("SB1") + "-" + (cAlias)->B2_COD
		oJson["armazemCodigo"] := FWxFilial("NNR") + "-" + (cAlias)->B2_LOCAL
		oJson["saldo"]         := (cAlias)->B2_QATU
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

Uma query so, com LEFT JOIN, e uma quebra por nota: era uma consulta para o
cabecalho mais uma por nota para os itens, o que numa carga de milhares de notas
significava milhares de idas ao banco.

O contrato preenche clienteId, vendedorId e dtEmissao dos itens a partir do
cabecalho; o payload do item nao os carrega.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, codigoErp a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPNFS(cMarca, cChave, cMarcaFim)

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

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

	cQuery := "SELECT F2_FILIAL, F2_DOC, F2_SERIE, F2_EMISSAO, SF2.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       F2_CLIENTE, F2_LOJA, F2_VEND1, F2_COND, F2_ESPECIE, F2_TIPO, "
	cQuery += "       F2_VALBRUT, F2_VALMERC, F2_DESCONT, F2_VALICM, F2_CHVNFE, "
	cQuery += "       D2_FILIAL, D2_DOC, D2_SERIE, D2_ITEM, D2_COD, D2_QUANT, D2_PRCVEN, D2_TOTAL, D2_DESCON, "
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
	cQuery += "  FROM " + RetSQLName("SF2") + " SF2 "
	cQuery += "  LEFT JOIN " + RetSQLName("SD2") + " SD2 "
	cQuery += "    ON SD2.D2_FILIAL = SF2.F2_FILIAL "
	cQuery += "   AND SD2.D2_DOC    = SF2.F2_DOC "
	cQuery += "   AND SD2.D2_SERIE  = SF2.F2_SERIE "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SF2.F2_FILIAL = ? "

	If !Empty(cChave)
		// cChave e o codigoErp: filial-documento-serie-tipo-especie. Filtra pelo
		// documento, que e a parte 2 e nunca vem vazia. Se houver mais de uma nota
		// com esse numero (series ou tipos diferentes), todas sobem - cada uma com
		// a sua chave, e o POST e upsert.
		cQuery += "   AND SF2.F2_DOC = ? "
	Else
		If !Empty(cMarca)
			// O delta fica no nivel da NOTA, num EXISTS - nao na linha do JOIN. Posto
			// no JOIN, uma nota cujo item mudou voltaria com so aquele item, e a
			// plataforma apagaria os demais.
			cQuery += "   AND (SF2.S_T_A_M_P_ >= '" + cMarca + "' "
			cQuery += "        OR EXISTS (SELECT 1 "
			cQuery += "                     FROM " + RetSQLName("SD2") + " SD2D "
			cQuery += "                    WHERE SD2D.D2_FILIAL = SF2.F2_FILIAL "
			cQuery += "                      AND SD2D.D2_DOC    = SF2.F2_DOC "
			cQuery += "                      AND SD2D.D2_SERIE  = SF2.F2_SERIE "
			cQuery += "                      AND SD2D.S_T_A_M_P_ >= '" + cMarca + "')) "
		EndIf

		If !Empty(cMarcaFim)
			cQuery += "   AND (SF2.S_T_A_M_P_ <= '" + cMarcaFim + "' "
			cQuery += "        OR EXISTS (SELECT 1 "
			cQuery += "                     FROM " + RetSQLName("SD2") + " SD2D "
			cQuery += "                    WHERE SD2D.D2_FILIAL = SF2.F2_FILIAL "
			cQuery += "                      AND SD2D.D2_DOC    = SF2.F2_DOC "
			cQuery += "                      AND SD2D.D2_SERIE  = SF2.F2_SERIE "
			cQuery += "                      AND SD2D.S_T_A_M_P_ <= '" + cMarcaFim + "')) "
		EndIf
	EndIf

	// A ordem e a da quebra: os campos que formam a chave da nota, depois o item.
	// Sem isso o laco fecharia a mesma nota mais de uma vez.
	cQuery += " ORDER BY F2_DOC, F2_SERIE, F2_TIPO, F2_ESPECIE, D2_ITEM "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SF2"))

	If !Empty(cChave)
		aChave := StrTokArr(cChave, "-")

		If Len(aChave) >= 2
			oStmt:SetString(3, PadR(aChave[2], TamSX3("F2_DOC")[1]))
		Else
			oStmt:SetString(3, PadR(cChave, TamSX3("F2_DOC")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		// Chave de identidade da nota no ERP. A filial entra porque a chave de API
		// e por empresa e duas filiais emitem a mesma numeracao; tipo e especie
		// separam documentos que compartilham numero (normal, devolucao,
		// beneficiamento).
		cChvNota := (cAlias)->F2_FILIAL + "-" + ;
		            (cAlias)->F2_DOC    + "-" + ;
		            (cAlias)->F2_SERIE  + "-" + ;
		            (cAlias)->F2_TIPO   + "-" + ;
		            (cAlias)->F2_ESPECIE

		If !(cChvNota == cChvAnt)

			// Fecha a nota anterior antes de comecar a proxima.
			If !Empty(cChvAnt)
				oJson["itens"] := aItens
				aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
			EndIf

			aItens := {}
			oJson  := JsonObject():New()

			oJson["codigoErp"]      := cChvNota
			oJson["numero"]         := AllTrim((cAlias)->F2_DOC)
			oJson["clienteCodigo"]  := FWxFilial("SA1") + "-" + (cAlias)->F2_CLIENTE + "-" + (cAlias)->F2_LOJA
			oJson["vendedorCodigo"] := FWxFilial("SA3") + "-" + (cAlias)->F2_VEND1
			oJson["condicaoCodigo"] := FWxFilial("SE4") + "-" + (cAlias)->F2_COND
			oJson["vlrBruto"]       := (cAlias)->F2_VALBRUT
			oJson["vlrMercadoria"]  := (cAlias)->F2_VALMERC
			oJson["vlrItens"]       := (cAlias)->F2_VALMERC
			oJson["vlrDesconto"]    := (cAlias)->F2_DESCONT
			oJson["vlrIcms"]        := (cAlias)->F2_VALICM
			oJson["vlrDevolucao"]   := 0
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

			// Chave do item: os mesmos campos que o JOIN usa para liga-lo a nota,
			// mais o numero do item. Duas linhas do mesmo produto na mesma nota
			// (CFOP ou preco diferentes) continuam distintas.
			oItem["codigoErp"]     := (cAlias)->D2_FILIAL + "-" + ;
			                          (cAlias)->D2_DOC    + "-" + ;
			                          (cAlias)->D2_SERIE  + "-" + ;
			                          (cAlias)->D2_ITEM
			oItem["item"]          := Val((cAlias)->D2_ITEM)
			oItem["produtoCodigo"] := FWxFilial("SB1") + "-" + (cAlias)->D2_COD
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
		oJson["itens"] := aItens
		aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
	EndIf

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJMAPXML
XML autorizado das notas de saida - SF2 e TSS.

O XML e mensagem propria da fila, e nao um passo colado ao envio da nota. Duas
consequencias, ambas melhores que o desenho anterior:

	- a nota entra na fila antes do XML dela, porque o catalogo poe esta entidade
	  logo depois de notas-saida, e a fila preserva a ordem de enfileiramento;
	- XML que falha volta sozinho no ciclo seguinte, sem reenviar a nota.

So entram notas com F2_CHVNFE preenchida: sem chave a nota nao foi autorizada e
o TSS nao teria o que devolver. Quando a autorizacao chega, a chave e gravada na
SF2, o S_T_A_M_P_ da nota muda e ela reentra nesta varredura sozinha.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, codigoErp a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPXML(cMarca, cChave, cMarcaFim)

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

	cQuery := "SELECT F2_FILIAL, F2_DOC, F2_SERIE, F2_TIPO, F2_ESPECIE "
	cQuery += "  FROM " + RetSQLName("SF2") + " SF2 "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SF2.F2_FILIAL = ? "
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
		aChave := StrTokArr(cChave, "-")

		If Len(aChave) >= 2
			oStmt:SetString(4, PadR(aChave[2], TamSX3("F2_DOC")[1]))
		Else
			oStmt:SetString(4, PadR(cChave, TamSX3("F2_DOC")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		cChvNota := (cAlias)->F2_FILIAL + "-" + ;
		            (cAlias)->F2_DOC    + "-" + ;
		            (cAlias)->F2_SERIE  + "-" + ;
		            (cAlias)->F2_TIPO   + "-" + ;
		            (cAlias)->F2_ESPECIE

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

Segue o caminho do DANFE (Faturamento/NFe/danfeiii.prw), que e o padrao TOTVS
atual: consulta o webservice NFeSBRA por **RetornaNotasNX**, pelo par serie +
documento, e devolve o nfeProc completo.

**Por que RetornaNotasNX e nao RetornaNotas.** Sao dois metodos e duas estruturas
de retorno: o antigo devolve NFES3, o atual devolve NFES5. O DANFE usa o NX, e e
nele que estao os campos que interessam - oWSNFE com cXML e cXMLPROT.

**O nfeProc e montado aqui, e nao ha alternativa.** O TSS nao devolve o XML de
distribuicao pronto: entrega a nota e o protocolo em campos separados, e o DANFE
recebe os mesmos dois pedacos. O formato do envelope esta confirmado pelos
caminhos que o proprio DANFE le do XML montado - NFEPROC|NFE|INFNFE e
NFEPROC|PROTNFE|INFPROT.

**Cancelamento nao passa por aqui.** No modelo atual cancelar e um evento com
documento proprio (procEventoNFe), nao uma variante do nfeProc.

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

Espelho da SF1. Mesmo desenho da nota de saida: uma leitura so, com LEFT JOIN e
quebra por documento, e o filtro de alteracao num EXISTS no nivel da nota - posto
na linha do JOIN, uma nota cujo item mudou voltaria com so aquele item.

**A SF1 guarda dois documentos, e F1_TIPO diz qual.** "N" e compra e o
participante e um fornecedor (SA2); "D" e devolucao de venda e o participante e
um cliente (SA1) - mesmo os dois saindo do mesmo par F1_FORNECE+F1_LOJA. Por isso
o payload tem os dois campos e o mapeador manda **um deles**. Mandar
fornecedorCodigo numa nota "D" deixa a devolucao invisivel na aba Devolucoes da
Posicao de Cliente.

**Duas datas, e nao uma.** dtEmissao e a do documento emitido pelo terceiro
(F1_EMISSAO) e dtEntrada e a do recebimento da mercadoria (F1_DTDIGIT). A
plataforma deriva ano e mes da emissao, para a apuracao de compra casar com a de
venda.

**O item nao tem ncm.** O NCM e do produto (B1_POSIPI -> produtos.ncm), e
repeti-lo na linha da nota criaria duas versoes do mesmo dado.

Sem rotas de XML: a segunda via do documento de entrada e de quem o emitiu.

@type    User Function
@author  Ricardo P Sotomayor
@since   08/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, codigoErp a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPNFE(cMarca, cChave, cMarcaFim)

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
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SF1.F1_FILIAL = ? "

	If !Empty(cChave)
		// cChave e o codigoErp: filial-documento-serie-fornecedor-loja-formulario.
		// Filtra pelo documento, que e a parte 2 e nunca vem vazia. Se houver mais
		// de uma nota com esse numero, todas sobem - cada uma com a sua chave, e o
		// POST e upsert.
		cQuery += "   AND SF1.F1_DOC = ? "
	Else
		If !Empty(cMarca)
			// O delta fica no nivel da NOTA, num EXISTS - nao na linha do JOIN.
			cQuery += "   AND (SF1.S_T_A_M_P_ >= '" + cMarca + "' "
			cQuery += "        OR EXISTS (SELECT 1 "
			cQuery += "                     FROM " + RetSQLName("SD1") + " SD1D "
			cQuery += "                    WHERE SD1D.D1_FILIAL  = SF1.F1_FILIAL "
			cQuery += "                      AND SD1D.D1_DOC     = SF1.F1_DOC "
			cQuery += "                      AND SD1D.D1_SERIE   = SF1.F1_SERIE "
			cQuery += "                      AND SD1D.D1_FORNECE = SF1.F1_FORNECE "
			cQuery += "                      AND SD1D.D1_LOJA    = SF1.F1_LOJA "
			cQuery += "                      AND SD1D.D1_FORMUL  = SF1.F1_FORMUL "
			cQuery += "                      AND SD1D.D1_TIPO    = SF1.F1_TIPO "
			cQuery += "                      AND SD1D.S_T_A_M_P_ >= '" + cMarca + "')) "
		EndIf

		If !Empty(cMarcaFim)
			cQuery += "   AND (SF1.S_T_A_M_P_ <= '" + cMarcaFim + "' "
			cQuery += "        OR EXISTS (SELECT 1 "
			cQuery += "                     FROM " + RetSQLName("SD1") + " SD1D "
			cQuery += "                    WHERE SD1D.D1_FILIAL  = SF1.F1_FILIAL "
			cQuery += "                      AND SD1D.D1_DOC     = SF1.F1_DOC "
			cQuery += "                      AND SD1D.D1_SERIE   = SF1.F1_SERIE "
			cQuery += "                      AND SD1D.D1_FORNECE = SF1.F1_FORNECE "
			cQuery += "                      AND SD1D.D1_LOJA    = SF1.F1_LOJA "
			cQuery += "                      AND SD1D.D1_FORMUL  = SF1.F1_FORMUL "
			cQuery += "                      AND SD1D.D1_TIPO    = SF1.F1_TIPO "
			cQuery += "                      AND SD1D.S_T_A_M_P_ <= '" + cMarcaFim + "')) "
		EndIf
	EndIf

	// A ordem e a da quebra: os campos que formam a chave da nota, depois o item.
	// F1_TIPO entra no fim porque nao compoe a chave, mas separa as linhas que a
	// compartilham - sem ele, uma compra e uma devolucao do mesmo documento viriam
	// intercaladas e a quebra abriria e fecharia a mesma chave varias vezes.
	cQuery += " ORDER BY F1_DOC, F1_SERIE, F1_FORNECE, F1_LOJA, F1_FORMUL, F1_TIPO, D1_ITEM "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SF1"))

	If !Empty(cChave)
		cChvAux := AllTrim(cChave)
		If At("-", cChvAux) > 0
			cChvAux := SubStr(cChvAux, At("-", cChvAux) + 1)
		EndIf
		aChave := StrTokArr(cChvAux, "-")

		If Len(aChave) >= 1
			oStmt:SetString(3, PadR(aChave[1], TamSX3("F1_DOC")[1]))
		Else
			oStmt:SetString(3, PadR(cChvAux, TamSX3("F1_DOC")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		// Chave de identidade da nota no ERP. Nao leva o F1_TIPO: decidido em
		// 08/09/2026. Compra e devolucao com a mesma numeracao e o mesmo
		// participante colidiriam, mas o participante difere entre as duas.
		cChvNota := (cAlias)->F1_FILIAL  + "-" + ;
		            (cAlias)->F1_DOC     + "-" + ;
		            (cAlias)->F1_SERIE   + "-" + ;
		            (cAlias)->F1_FORNECE + "-" + ;
		            (cAlias)->F1_LOJA    + "-" + ;
		            (cAlias)->F1_FORMUL

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

			oJson["codigoErp"] := cChvNota
			oJson["numero"]    := AllTrim((cAlias)->F1_DOC)
			oJson["vlrBruto"]  := (cAlias)->F1_VALBRUT
			oJson["ativo"]     := .T.

			// O participante muda com o tipo, e so um dos dois campos vai
			// preenchido. A API aceita o que vier e nao impoe a combinacao.
			cPartic := (cAlias)->F1_FORNECE + "-" + (cAlias)->F1_LOJA

			If AllTrim((cAlias)->F1_TIPO) == "D"
				oJson["clienteCodigo"]    := FWxFilial("SA1") + "-" + cPartic
				oJson["fornecedorCodigo"] := Nil
			Else
				oJson["fornecedorCodigo"] := FWxFilial("SA2") + "-" + cPartic
				oJson["clienteCodigo"]    := Nil
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
				oJson["condicaoCodigo"] := FWxFilial("SE4") + "-" + (cAlias)->F1_COND
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

			// Chave do item: os mesmos campos que o JOIN usa para liga-lo a nota,
			// mais o numero do item.
			oItem["codigoErp"]     := (cAlias)->D1_FILIAL  + "-" + ;
			                          (cAlias)->D1_DOC     + "-" + ;
			                          (cAlias)->D1_SERIE   + "-" + ;
			                          (cAlias)->D1_FORNECE + "-" + ;
			                          (cAlias)->D1_LOJA    + "-" + ;
			                          (cAlias)->D1_ITEM
			oItem["item"]          := Val((cAlias)->D1_ITEM)
			oItem["produtoCodigo"] := FWxFilial("SB1") + "-" + (cAlias)->D1_COD
			oItem["quantidade"]    := (cAlias)->D1_QUANT
			oItem["vlrTotal"]      := (cAlias)->D1_TOTAL
			oItem["ativo"]         := .T.
			oItem["delete"]        := !Empty((cAlias)->ITEM_DELETADO)

			BJPoeTexto(oItem, "cfop", (cAlias)->D1_CF)

			If lLocal
				oItem["armazemCodigo"] := FWxFilial("NNR") + "-" + (cAlias)->D1_LOCAL
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

Alem do financeiro basico, carrega os campos de cobranca bancaria que a 2a via de
boleto usa. A plataforma nao numera nem registra no banco: ela reimprime o boleto
que o ERP registrou, entao sem nossoNumero nao ha 2a via.

Tudo sai do proprio titulo. O BjBoletos grava portador, agencia, conta, nosso
numero, carteira, codigo de barras e linha digitavel na SE1 quando imprime; aqui
esses campos sao lidos de volta, no mesmo formato. Quando o ERP manda
codigoBarras pronto, ele prevalece sobre o calculo da plataforma - divergir do
que o banco registrou seria pior do que nao imprimir.

O titulo nao tem item: basta o S_T_A_M_P_ da propria SE1. Uma baixa altera o
saldo na mesma linha, entao ela reentra na varredura sozinha.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, codigoErp a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPTIT(cMarca, cChave, cMarcaFim)

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
	Local cBenEnd  := BJEndEmpr()

	// Percentuais de juros e multa do boleto, lidos uma vez: SuperGetMV dentro do
	// laco seria uma consulta ao SX6 por titulo. Sao os mesmos parametros que o
	// U_JRBOL e o U_MTBOL usam no BjBoletos.
	Local nPerJrs := SuperGetMV("MV_RGC_PJUR", .T., 0.02)
	Local nPerMlt := SuperGetMV("MV_RGC_PMUL", .T., 0.02)

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

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

	If !Empty(cChave)
		// cChave e o codigoErp: filial-prefixo-numero-parcela-tipo. Filtra pelo
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
		aChave := StrTokArr(cChave, "-")

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
		oJson["codigoErp"]      := cChvTit
		oJson["numero"]         := AllTrim((cAlias)->E1_NUM)
		oJson["clienteCodigo"]  := FWxFilial("SA1") + "-" + (cAlias)->E1_CLIENTE + "-" + (cAlias)->E1_LOJA
		oJson["vendedorCodigo"] := FWxFilial("SA3") + "-" + (cAlias)->E1_VEND1
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

O formato 3 do FWTimeStamp **nao converte fuso**, e e isso que se quer aqui:
emissao e vencimento sao datas de calendario, nao instantes - virar 03:00Z nao
muda o dia no Brasil, mas passa a depender do fuso do servidor para continuar
sendo verdade. O "Z" no fim e obrigatorio: o contrato le com z.coerce.date() e,
sem ele, o JavaScript interpreta como hora local de quem recebe e a data escorrega
um dia.

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

/*/{Protheus.doc} BJEndEmpr
Monta o endereco do beneficiario em uma linha.

Sai do SM0, o cadastro de empresas - a mesma origem que o BjBoletos usa para o
nome e o CNPJ do cedente. Os campos sao lidos com FieldPos porque o SM0 varia de
tamanho entre versoes.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  character, Endereco completo em uma linha
/*/
Static Function BJEndEmpr()

	Local cRet := ""

	If SM0->(FieldPos("M0_ENDCOB")) > 0 .And. !Empty(SM0->M0_ENDCOB)
		cRet := AllTrim(SM0->M0_ENDCOB)
	ElseIf SM0->(FieldPos("M0_ENDENT")) > 0
		cRet := AllTrim(SM0->M0_ENDENT)
	EndIf

	If SM0->(FieldPos("M0_BAIRCOB")) > 0 .And. !Empty(SM0->M0_BAIRCOB)
		cRet += " - " + AllTrim(SM0->M0_BAIRCOB)
	EndIf

	If SM0->(FieldPos("M0_CIDCOB")) > 0 .And. !Empty(SM0->M0_CIDCOB)
		cRet += " - " + AllTrim(SM0->M0_CIDCOB)
	EndIf

	If SM0->(FieldPos("M0_ESTCOB")) > 0 .And. !Empty(SM0->M0_ESTCOB)
		cRet += "/" + AllTrim(SM0->M0_ESTCOB)
	EndIf

	If SM0->(FieldPos("M0_CEPCOB")) > 0 .And. !Empty(SM0->M0_CEPCOB)
		cRet += " - CEP " + AllTrim(SM0->M0_CEPCOB)
	EndIf

Return Left(AllTrim(cRet), 200)

/*/{Protheus.doc} BJCodCompen
Devolve o codigo de compensacao do banco com o digito, para o cabecalho do boleto.

E o "237-2" que o BjBoletos manda fixo, impresso ao lado do logo. O digito vem de
tabela e nao de calculo: o modulo 11 acerta a maioria dos bancos, mas nao todos -
o 748 termina em X, e uma excecao dessas so aparece quando o boleto ja saiu
errado.

Banco fora da tabela devolve o codigo sem digito. Melhor faltar o digito do que
imprimir um errado.

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

Reproduz a leitura do BjBoletos: a SA6 e posicionada por banco + agencia + conta,
e os digitos saem de A6_DVAGE e A6_DVCTA. Quando esses campos estao vazios - o
que acontece em boa parte dos cadastros - o digito e o ultimo caractere da
agencia ou da conta, e a conta ainda pode vir com o digito depois de um hifen em
A6_NUMCON. As tres formas estao tratadas aqui porque as tres existem na base.

**Cache por conta, nao por titulo.** Uma carga de milhares de titulos costuma
usar uma unica conta de cobranca; sem o cache seria um dbSeek na SA6 por
registro, para reler sempre a mesma linha.

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

Prefere o que ja esta gravado: o BjBoletos calcula o DAC quando imprime o boleto
e o guarda em E1_DACNOSS. Titulo que ainda nao passou por la nao tem o campo
preenchido, e ai o digito e calculado pela mesma funcao que o boleto usa
(U_DACBRA, em Financeiro/Boleto/Boleto.prw - modulo 11 sobre carteira + nosso
numero, com o resto tratado como o Bradesco manda).

Recalcular e melhor do que omitir: sem o DAC a plataforma teria de reimplementar
o modulo 11, e uma divergencia de um digito invalida o boleto inteiro.

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

Reproduz as mensagens que o BjBoletos imprime no boleto, com os mesmos textos e a
mesma formatacao de valor. A conta de cobranca da plataforma tem as instrucoes
fixas; estas se somam a elas, porque carregam valores calculados sobre o saldo
deste titulo.

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

Sao os quatro campos que a SE1 guarda sobre onde o boleto foi registrado, e os
mesmos que o BjBoletos usa para imprimi-lo.

**Este texto precisa bater com a descricao cadastrada na plataforma.** O contrato
trata contaBancariaDescricao como chave para o cadastro de contas de la, nao como
texto livre: descricao que nao casa faz a plataforma usar a conta padrao da
empresa. Como o formato daqui e deterministico, o caminho e cadastrar a conta na
plataforma com exatamente a string que sai desta funcao. Por exemplo:

	237/1234/0056789/09

Titulo sem portador nao tem cobranca bancaria e devolve Nil, para a plataforma
nao exibir uma conta que nao existe.

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

/*/{Protheus.doc} BJMAPORC
Orcamentos gerados no ERP - SCJ (cabecalho) e SCK (itens).

Esta e a metade "ERP empurra" do fluxo. A outra metade - orcamentos criados na
plataforma que o ERP importa como Pedido de Venda - esta em BJPLA004.

**O numero do pedido gerado nao sobe, e nao ha onde por.** No MATA415 o vinculo
orcamento -> pedido fica no item: CK_NUMPV recebe o C6_NUM quando o pedido e
gerado, e CJ_STATUS passa a "B". O contrato de /integracao/orcamentos tem apenas
codigoErp, status e itens - nenhum campo para o documento de origem -, entao o
que a plataforma aprende sobre a conversao e o status "aprovado". Se a API abrir
um campo para isso, CK_NUMPV e a origem do dado.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, codigoErp a reprocessar
@return  array, {cChave, oJson, cVerbo}
/*/
User Function BJMAPORC(cMarca, cChave, cMarcaFim)

	Local aRet    := {}
	Local aItens  := {}
	Local aChave  := {}
	Local cAlias  := ""
	Local cQuery  := ""
	Local cChvOrc := ""
	Local cChvAnt := ""
	Local cVrbAnt := ""
	Local oStmt   := Nil
	Local oJson   := Nil
	Local oItem   := Nil
	Local lValida := SCJ->(FieldPos("CJ_VALIDA"))  > 0
	Local lObs    := SCJ->(FieldPos("CJ_XOBSVEN")) > 0
	Local lRegra  := SCK->(FieldPos("CK_XDESC"))   > 0
	Local lComis  := SCK->(FieldPos("CK_RCGCOM1")) > 0

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

	cQuery := "SELECT CJ_FILIAL, CJ_NUM, CJ_CLIENTE, CJ_LOJA, SCJ.D_E_L_E_T_ AS DELETADO, "
	cQuery += "       CJ_VEND1, CJ_CONDPAG, CJ_STATUS, "
	cQuery += "       CK_FILIAL, CK_ITEM, CK_PRODUTO, CK_QTDVEN, CK_PRCVEN, SCK.D_E_L_E_T_ AS ITEM_DELETADO "

	If lValida
		cQuery += ", CJ_VALIDA "
	EndIf
	If lObs
		cQuery += ", CJ_XOBSVEN "
	EndIf
	If lRegra
		cQuery += ", CK_XDESC "
	EndIf
	If lComis
		cQuery += ", CK_RCGCOM1 "
	EndIf

	// LEFT JOIN pelo mesmo criterio da nota: orcamento sem item nao some.
	cQuery += "  FROM " + RetSQLName("SCJ") + " SCJ "
	cQuery += "  LEFT JOIN " + RetSQLName("SCK") + " SCK "
	cQuery += "    ON SCK.CK_FILIAL = SCJ.CJ_FILIAL "
	cQuery += "   AND SCK.CK_NUM    = SCJ.CJ_NUM "
	cQuery += " WHERE ? = ' ' "
	cQuery += "   AND SCJ.CJ_FILIAL = ? "

	If !Empty(cChave)
		// cChave e o codigoErp: filial-numero. Filtra pelo numero, a parte 2.
		cQuery += "   AND SCJ.CJ_NUM = ? "
	Else
		If !Empty(cMarca)
			// O delta fica no nivel do ORCAMENTO, num EXISTS - nao na linha do JOIN.
			// Assim o cabecalho segue com os itens alterados e excluidos.
			cQuery += "   AND (SCJ.S_T_A_M_P_ >= '" + cMarca + "' "
			cQuery += "        OR EXISTS (SELECT 1 "
			cQuery += "                     FROM " + RetSQLName("SCK") + " SCKD "
			cQuery += "                    WHERE SCKD.CK_FILIAL = SCJ.CJ_FILIAL "
			cQuery += "                      AND SCKD.CK_NUM    = SCJ.CJ_NUM "
			cQuery += "                      AND SCKD.S_T_A_M_P_ >= '" + cMarca + "')) "
		EndIf

		If !Empty(cMarcaFim)
			cQuery += "   AND (SCJ.S_T_A_M_P_ <= '" + cMarcaFim + "' "
			cQuery += "        OR EXISTS (SELECT 1 "
			cQuery += "                     FROM " + RetSQLName("SCK") + " SCKD "
			cQuery += "                    WHERE SCKD.CK_FILIAL = SCJ.CJ_FILIAL "
			cQuery += "                      AND SCKD.CK_NUM    = SCJ.CJ_NUM "
			cQuery += "                      AND SCKD.S_T_A_M_P_ <= '" + cMarcaFim + "')) "
		EndIf
	EndIf

	cQuery += " ORDER BY CJ_NUM, CK_ITEM "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, FWxFilial("SCJ"))

	If !Empty(cChave)
		aChave := StrTokArr(cChave, "-")

		If Len(aChave) >= 2
			oStmt:SetString(3, PadR(aChave[2], TamSX3("CJ_NUM")[1]))
		Else
			oStmt:SetString(3, PadR(cChave, TamSX3("CJ_NUM")[1]))
		EndIf
	EndIf

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())

		cChvOrc := (cAlias)->CJ_FILIAL + "-" + (cAlias)->CJ_NUM

		If !(cChvOrc == cChvAnt)

			If !Empty(cChvAnt)
				oJson["itens"] := aItens
				aAdd(aRet, {cChvAnt, oJson, cVrbAnt})
			EndIf

			aItens := {}
			oJson  := JsonObject():New()

			oJson["codigoErp"]               := cChvOrc
			oJson["clienteCodigo"]           := FWxFilial("SA1") + "-" + (cAlias)->CJ_CLIENTE + "-" + (cAlias)->CJ_LOJA
			oJson["vendedorCodigo"]          := FWxFilial("SA3") + "-" + (cAlias)->CJ_VEND1
			oJson["condicaoPagamentoCodigo"] := FWxFilial("SE4") + "-" + (cAlias)->CJ_CONDPAG
			oJson["status"]                  := BJStatOrc((cAlias)->CJ_STATUS)
			oJson["ativo"]                   := .T.

			// titulo e obrigatorio no contrato e a SCJ nao tem campo equivalente: o
			// numero identifica a proposta para quem le na plataforma
			oJson["titulo"] := "Orcamento " + AllTrim((cAlias)->CJ_NUM) + " - ERP"

			If lValida
				BJPoeData(oJson, "dataValidade", (cAlias)->CJ_VALIDA)
			EndIf
			If lObs
				BJPoeTexto(oJson, "observacao", (cAlias)->CJ_XOBSVEN)
			EndIf

			cChvAnt := cChvOrc
			cVrbAnt := "POST"
			If (cAlias)->DELETADO == "*"
				cVrbAnt := "DELETE"
			EndIf
		EndIf

		If !Empty((cAlias)->CK_ITEM)

			oItem := JsonObject():New()

			// Chave do item: a do orcamento mais o numero do item, pelos campos da
			// propria SCK - que sao o vinculo do JOIN.
			oItem["codigoErp"]     := (cAlias)->CK_FILIAL + "-" + ;
			                          (cAlias)->CJ_NUM    + "-" + ;
			                          (cAlias)->CK_ITEM
			oItem["produtoCodigo"] := FWxFilial("SB1") + "-" + (cAlias)->CK_PRODUTO
			oItem["quantidade"]    := (cAlias)->CK_QTDVEN
			oItem["vlrUnitario"]   := (cAlias)->CK_PRCVEN
			oItem["delete"]        := !Empty((cAlias)->ITEM_DELETADO)

			If lRegra
				BJPoeTexto(oItem, "regraDescontoCodigo", (cAlias)->CK_XDESC)
			Else
				oItem["regraDescontoCodigo"] := Nil
			EndIf

			If lComis
				oItem["percComissao"] := (cAlias)->CK_RCGCOM1
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

/*/{Protheus.doc} BJStatOrc
Traduz o status do orcamento do ERP para o vocabulario da API.

	CJ_STATUS   Legenda do MATA415        API         Por que
	A  verde    Em aberto                 enviado     proposta completa e viva
	B  vermelho Baixado (virou pedido)    aprovado    efetivado no MATA416
	C  preto    Cancelado                 recusado    encerrado por decisao
	D  amarelo  Nao orcado                rascunho    falta quantidade ou preco
	F  -        Bloqueado por regra       rascunho    ver abaixo

**Tres traducoes sao diretas.** "B" e o orcamento efetivado em Pedido de Venda
pelo MATA416 - o numero do pedido fica em CK_NUMPV, no item. "C" e o cancelamento
explicito. "D" e o orcamento salvo sem quantidade ou preco, que e literalmente um
rascunho a completar depois.

**"A" foi para enviado, nao para rascunho.** No contrato, "rascunho" e o
orcamento ainda em composicao; o status A e o orcamento **confirmado**, com
cliente, condicao, produto, preco e TES preenchidos. Mandar como rascunho o
esconderia, na plataforma, como proposta viva.

**"F" (bloqueado por regra de negocio) e o unico sem equivalente**, e por isso a
escolha e explicita: a API nao tem estado de retencao. Entre as cinco opcoes, o
orcamento bloqueado esta mais perto de "rascunho" - ele existe, mas o ERP o
segura e ele nao pode ser efetivado. Manda-lo como "enviado" o mostraria como
proposta acionavel na plataforma, e o vendedor iria atras de algo que esta
travado deste lado.

"expirado" nao e gerado: seria derivavel de CJ_VALIDA vencida com status "A", mas
isso e inferencia sobre o dado, nao traducao dele - a SCJ nao tem estado de
expiracao. Se a plataforma precisar dessa distincao, ela entra aqui de proposito
e nao por acidente.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cStatus, character, Conteudo de CJ_STATUS
@return  character, Status no vocabulario da API
/*/
Static Function BJStatOrc(cStatus)

	Local cRet := "rascunho"

	Default cStatus := ""

	Do Case
		Case AllTrim(cStatus) == "A"
			cRet := "enviado"
		Case AllTrim(cStatus) == "B"
			cRet := "aprovado"
		Case AllTrim(cStatus) == "C"
			cRet := "recusado"
		Case AllTrim(cStatus) == "D"
			cRet := "rascunho"
		Case AllTrim(cStatus) == "F"
			cRet := "rascunho"
	EndCase

Return cRet

/*/{Protheus.doc} BJMAPOBJ
Objetivos de venda - sem origem no ERP.

O Protheus padrao nao tem tabela de meta por vendedor e mes, e nenhuma tabela
customizada desta base foi identificada como tal. A entidade esta **inativa no
catalogo** e este mapeador devolve vazio.

Quando a origem existir, a leitura entra aqui, em cima do contrato:

	{ codigoLegado, vendedorCodigo, mes, ano, valor, categorias[] }

onde categorias e mestre-detalhe e **substitui o conjunto inteiro**, casando cada
linha pelo codigoErp dela.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cMarca, character, Marca d'agua UTC
@param   cChave, character, codigoErp a reprocessar
@return  array, Vazio enquanto nao houver origem definida
/*/
User Function BJMAPOBJ(cMarca, cChave, cMarcaFim)

	Local aRet := {}

	Default cMarca    := ""
	Default cChave    := ""
	Default cMarcaFim := ""

Return aRet
