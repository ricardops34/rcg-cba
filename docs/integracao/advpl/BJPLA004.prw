#include "totvs.ch"

// Sentido e status da mensagem, entidades e rotas da entrada sao escritos como
// literal no ponto de uso, com o comentario na frente:
//
//    ZZ_TIPO     "E" entrada (plataforma -> ERP)
//    ZZ_STATUS   "1" pendente   "2" executada   "3" erro
//
//    Entidades:  "orcamentos-pendentes"   "clientes-alteracoes"
//    Rotas:      /integracao/orcamentos/pendentes   /integracao/clientes/alteracoes

/*/{Protheus.doc} BJPLA004
Envio da fila para a Plataforma BJ e gravacao no ERP do que chega dela.
@type    function
@author  Ricardo P Sotomayor
@since   01/09/2026
/*/

// ===========================================================================
// ORCAMENTOS DA PLATAFORMA
// ===========================================================================

/*/{Protheus.doc} BJRETORNO
Le as pendencias da plataforma, aplica no ERP e atualiza o status la.
O ciclo do orcamento e o mais critico da integracao, nos dois sentidos
(README, Prioridade dos dados). Por isso a ordem e: orcamentos, alteracoes
de cliente, e de novo orcamentos - o que chegou enquanto as alteracoes eram
aplicadas sai neste ciclo, nao no proximo.
Um lote (SZY) por pagina de orcamentos e um para as alteracoes, em vez de um
lote so para a execucao inteira. Ver
docs/planos/2026-09-26-filas-prioridade-integracao.md.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  array, {nLidos, nAplicados, nIgnorados, nErros}
@example aTot := U_BJRETORNO()
/*/
User Function BJRETORNO(aJob)

	Local aTotal    := {0, 0, 0, 0}
	Local aAntes    := {}
	Local aVistos   := {}
	Local aErros    := {}
	Local cLote     := ""
	Local nCiclo    := 0
	Local cTrava    := ""
	Local nSeg      := Seconds()

	// O Schedule e o disparo da coleta (StartJob, BJLibera no BJPLA003) passam
	// {empresa, filial} no primeiro parametro. Antes ele era ignorado e o
	// ambiente abria sempre em 01/01.
	If ValType(aJob) == "A" .And. Len(aJob) >= 2
		U_BJAMBIENTE(aJob[1], aJob[2])
	EndIf

	// Primeira linha de toda rotina agendavel. Agendamento cadastrado como Job
	// e lancado pelo agente do Schedule via WFLAUNCHER, SEM ambiente: cFilAnt
	// nem existe, e a proxima leitura de parametro cai em "CFILANT".
	U_BJAMBIENTE()

	If !AllTrim(Upper(GetMV("MV_BJAPI03"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Nada a receber.", 0, 0, {})
		Return aTotal
	EndIf

	// Um retorno por vez, venha do agendamento ou do monitor.
	cTrava := "BJPLA_RETORNO"

	If !LockByName(cTrava, .T., .F.)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Retorno ja em andamento. Chamada ignorada.", 0, 0, {})
		ConOut("[BJPLA] U_BJRETORNO ignorado - ja ha um retorno em andamento (trava BJPLA_RETORNO)")
		Return aTotal
	EndIf

	// 0. Primeiro os orcamentos que ja falharam numa execucao anterior e
	// continuam pendentes la (decisao do usuario, 26/09/2026: recomeca pelos
	// com erro, depois os nao processados).
	aErros := BJOrcErro()

	If Len(aErros) > 0
		BJLeOrcam(@aTotal, aVistos, aErros)
	EndIf

	// 1. Orcamentos aprovados: um lote por pagina (BJLeOrcam abre e fecha).
	BJLeOrcam(@aTotal, aVistos, {})

	// 2. Alteracoes de cliente, no lote delas. A SZY nao tem campo de
	// entidade; quem identifica cada mensagem e o ZZ_ENTID no detalhe (SZZ).
	aAntes := aClone(aTotal)
	cLote  := U_BJABRELT(98)
	BJLeAltCli(@aTotal, cLote)
	BJFechaRet(cLote, aTotal, aAntes)

	// 3. Orcamento que chegou durante as alteracoes. Ate tres voltas: aVistos
	// impede tratar de novo, nesta execucao, o orcamento que ja falhou - ele
	// volta no proximo ciclo.
	For nCiclo := 1 To 3
		If BJLeOrcam(@aTotal, aVistos, {}) == 0
			Exit
		EndIf
	Next nCiclo

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Retorno concluido - lidos: " + cValToChar(aTotal[1]) + ;
		" aplicados: " + cValToChar(aTotal[2]) + ;
		" ignorados: " + cValToChar(aTotal[3]) + ;
		" erros: " + cValToChar(aTotal[4]) + " em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s", 0, 0, {})

	If aTotal[1] > 0 .Or. aTotal[4] > 0
		ConOut("[BJPLA] U_BJRETORNO - lidos: " + cValToChar(aTotal[1]) + " aplicados: " + cValToChar(aTotal[2]) + ;
			" ignorados: " + cValToChar(aTotal[3]) + " erros: " + cValToChar(aTotal[4]) + ;
			" em " + cValToChar(Round(Seconds() - nSeg, 0)) + "s")
	EndIf

	UnLockByName(cTrava, .T., .F.)

Return aTotal

/*/{Protheus.doc} BJLeOrcam
Le a fila de orcamentos pendentes da plataforma e trata um a um, um lote por
pagina.
Orcamento tratado sai da lista de pendentes, entao a leitura volta a pagina 1
enquanto ela trouxer orcamento novo: pedir a pagina 2 depois de tratar a 1
pulava os 100 seguintes, que so saiam no ciclo seguinte. So avanca de pagina
quando a pagina inteira ja foi tentada nesta execucao (aVistos) - sao os que
falharam e continuam pendentes la.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aTotal , array, [Referencia] Totalizadores
@param   aVistos, array, [Referencia] Ids ja tentados nesta execucao
@param   aSo    , array, So estes ids (os que ja falharam antes - BJOrcErro). Vazio, todos
@return  numeric, Quantos orcamentos novos foram tratados
/*/
Static Function BJLeOrcam(aTotal, aVistos, aSo)

	Local cRota  := ""
	Local cResp  := ""
	Local cErro  := ""
	Local cLote  := ""
	Local cId    := ""
	Local nHttp  := 0
	Local nPage  := 1
	Local nNovos := 0
	Local nPag   := 0
	Local nVolta := 0
	Local nX     := 0
	Local oJson  := Nil
	Local aDados := {}
	Local aAntes := {}

	// Teto de voltas: protege contra uma lista que nunca esvazie
	While nVolta < 50

		nVolta += 1

		cRota := "/integracao/orcamentos/pendentes" + "?pageSize=100&page=" + cValToChar(nPage)

		If !U_BJHTTP("GET", cRota, "", @cResp, @nHttp, @cErro)
			FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Falha ao listar orcamentos pendentes: " + cErro, 0, 0, {})
			ConOut("[BJPLA] U_BJRETORNO - falha ao listar orcamentos pendentes (HTTP " + cValToChar(nHttp) + "): " + cErro)
			aTotal[4] += 1
			Exit
		EndIf

		oJson := JsonObject():New()

		If oJson:FromJson(cResp) != Nil
			FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Resposta invalida ao listar orcamentos pendentes.", 0, 0, {})
			aTotal[4] += 1
			Exit
		EndIf

		aDados := oJson:GetJsonObject("data")

		If ValType(aDados) != "A" .Or. Len(aDados) == 0
			Exit
		EndIf

		// O lote so abre se a pagina trouxer orcamento novo
		cLote  := ""
		nPag   := 0
		aAntes := aClone(aTotal)

		For nX := 1 To Len(aDados)

			cId := cValToChar(aDados[nX]:GetJsonObject("id"))

			// Rodada dos que ja falharam: o resto fica para a rodada normal, sem
			// entrar em aVistos.
			If Len(aSo) > 0 .And. aScan(aSo, {|c| c == cId}) == 0
				Loop
			EndIf

			If aScan(aVistos, {|c| c == cId}) > 0
				Loop
			EndIf

			aAdd(aVistos, cId)

			If Empty(cLote)
				cLote := U_BJABRELT(99)
			EndIf

			aTotal[1] += 1
			nPag      += 1
			BJTrataOrc(aDados[nX], @aTotal, cLote)

		Next nX

		If !Empty(cLote)
			BJFechaRet(cLote, aTotal, aAntes)
		EndIf

		nNovos += nPag

		// Pagina incompleta e a ultima
		If Len(aDados) < 100
			Exit
		EndIf

		// Pagina so de orcamentos ja tentados: avanca. Com novos, os tratados
		// sairam da lista e a mesma pagina agora traz os seguintes.
		If nPag == 0
			nPage += 1
		EndIf

		oJson := Nil

	End

Return nNovos

/*/{Protheus.doc} BJOrcErro
Ids dos orcamentos que falharam numa execucao anterior e ainda nao foram
aplicados: a mensagem de entrada deles ficou com erro ("3") e nao ha outra da
mesma chave executada ("2") depois. O retorno comeca por eles.
@type    Static Function
@author  Ricardo P Sotomayor
@since   26/09/2026
@return  array, Ids da plataforma (ZZ_CHVORI)
/*/
Static Function BJOrcErro()

	Local aRet   := {}
	Local cQuery := ""
	Local cAlias := ""
	Local oStmt  := Nil

	cQuery := "SELECT DISTINCT SZZ.ZZ_CHVORI "
	cQuery += "  FROM " + RetSqlName("SZZ") + " SZZ "
	cQuery += " WHERE SZZ.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SZZ.ZZ_FILIAL  = ? "
	cQuery += "   AND SZZ.ZZ_TIPO    = 'E' "
	cQuery += "   AND SZZ.ZZ_ENTID   = ? "
	cQuery += "   AND SZZ.ZZ_STATUS  = '3' "
	cQuery += "   AND NOT EXISTS (SELECT 1 "
	cQuery += "                     FROM " + RetSqlName("SZZ") + " OK "
	cQuery += "                    WHERE OK.D_E_L_E_T_ = ' ' "
	cQuery += "                      AND OK.ZZ_FILIAL  = SZZ.ZZ_FILIAL "
	cQuery += "                      AND OK.ZZ_TIPO    = 'E' "
	cQuery += "                      AND OK.ZZ_ENTID   = SZZ.ZZ_ENTID "
	cQuery += "                      AND OK.ZZ_CHVORI  = SZZ.ZZ_CHVORI "
	cQuery += "                      AND OK.ZZ_STATUS  = '2') "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, xFilial("SZZ"))
	oStmt:SetString(2, PadR("orcamentos-pendentes", TamSX3("ZZ_ENTID")[1]))

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())
		aAdd(aRet, AllTrim((cAlias)->ZZ_CHVORI))
		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

Return aRet

/*/{Protheus.doc} BJFechaRet
Fecha um lote do retorno com os contadores dele: a diferenca dos totais
entre a abertura e agora. Lote que nao recebeu nada (a lista de alteracoes
de cliente vazia, o caso comum) e apagado - senao cada ciclo do retorno
deixaria um lote vazio na SZY.
@type    Static Function
@author  Ricardo P Sotomayor
@since   26/09/2026
@param   cLote , character, ZY_CODIGO do lote
@param   aTotal, array    , Totais agora: {nLidos, nAplicados, nIgnorados, nErros}
@param   aAntes, array    , Totais na abertura do lote
@return  Nil
/*/
Static Function BJFechaRet(cLote, aTotal, aAntes)

	Local aArea  := GetArea()
	Local nLidos := aTotal[1] - aAntes[1]
	Local nAplic := aTotal[2] - aAntes[2]
	Local nErr   := aTotal[4] - aAntes[4]

	dbSelectArea("SZY")
	SZY->(dbSetOrder(1))   // ZY_FILIAL + ZY_CODIGO

	If SZY->(dbSeek(xFilial("SZY") + cLote))

		RecLock("SZY", .F.)

		If nLidos == 0 .And. nErr == 0
			SZY->(dbDelete())
		Else
			SZY->ZY_DTFIM   := Date()
			SZY->ZY_HRFIM   := Time()
			SZY->ZY_QTDLIDO := nLidos
			SZY->ZY_QTDENV  := nAplic
			SZY->ZY_QTDERR  := nErr

			If nErr == 0
				SZY->ZY_STATUS := "2"
			Else
				SZY->ZY_STATUS := "3"
			EndIf
		EndIf

		SZY->(MsUnlock())

	EndIf

	RestArea(aArea)

Return Nil

/*/{Protheus.doc} BJTrataOrc
Trata um orcamento pendente: enfileira, cria o orcamento no ERP e avisa a
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oOrc   , object   , Orcamento devolvido pela API
@param   aTotal , array    , [Referencia] Totalizadores
@param   cSeqMae, character, ZY_CODIGO do lote (SZY) deste retorno
@return  Nil
/*/
Static Function BJTrataOrc(oOrc, aTotal, cSeqMae)

	Local cIdPlat  := ""
	Local cSeq     := ""
	Local cNumPed  := ""
	Local cTrava   := ""

	If ValType(oOrc) != "O"
		aTotal[4] += 1
		Return Nil
	EndIf

	cIdPlat := AllTrim(cValToChar(oOrc:GetJsonObject("id")))

	If Empty(cIdPlat)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento pendente sem id na resposta. Registro ignorado.", 0, 0, {})
		aTotal[3] += 1
		Return Nil
	EndIf

	// Passo 2, primeira linha de defesa: a fila. Mensagem executada para este id
	// significa que o orcamento ja foi criado num ciclo anterior e o que falhou
	// foi o aviso a plataforma.
	If U_BJACHOU("E", "orcamentos-pendentes", cIdPlat, @cNumPed)

		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento " + cIdPlat + " ja gerou o orcamento " + cNumPed + ;
			" num ciclo anterior, mas continua na fila da plataforma. Reenviando so o vinculo.", 0, 0, {})

		If BJVincula(cIdPlat, cNumPed, oOrc)
			aTotal[2] += 1
		Else
			aTotal[4] += 1
		EndIf

		Return Nil
	EndIf

	cTrava := "BJPLA_ORC_" + Upper(AllTrim(cIdPlat))

	// Um processo por orcamento: se a trava estiver tomada, outro processo esta tratando este orcamento.
	If !LockByName(cTrava, .T., .F.)
		aTotal[3] += 1
		Return Nil
	EndIf

	// A mensagem entra na fila com o payload que veio. A partir daqui existe
	// rastro, mesmo que tudo falhe depois.
	cSeq := U_BJENFILA("E", "orcamentos-pendentes", cIdPlat, "GET", oOrc:ToJson(), cSeqMae)

	If Empty(cSeq)
		aTotal[4] += 1
		UnLockByName(cTrava, .T., .F.)
		Return Nil
	EndIf

	cNumPed := BJGeraPed(oOrc, cIdPlat, cSeq, cSeqMae)

	If Empty(cNumPed)
		aTotal[4] += 1
		UnLockByName(cTrava, .T., .F.)
		Return Nil
	EndIf

	If BJVincula(cIdPlat, cNumPed, oOrc)
		aTotal[2] += 1
	Else
		// O orcamento existe e a mensagem esta marcada como executada. O vinculo
		// volta a ser tentado no proximo ciclo, pelo caminho do passo 2.
		aTotal[4] += 1
	EndIf

	UnLockByName(cTrava, .T., .F.)

Return Nil

/*/{Protheus.doc} BJGeraPed
Grava o Pedido de Venda (SC5/SC6) do orcamento aprovado na plataforma.
@type    Static Function
@author  Ricardo P Sotomayor
@since   18/09/2026
@param   oOrc   , object   , Orcamento aprovado devolvido pela API
@param   cIdPlat, character, Id interno da plataforma (UUID)
@param   cSeq   , character, Sequencia da mensagem na fila
@param   cSeqMae, character, Lote (ZY_CODIGO) da mensagem
@return  character, C5_NUM do pedido criado, ou vazio quando falhou
/*/
Static Function BJGeraPed(oOrc, cIdPlat, cSeq, cSeqMae)

	Local cNumPed  := ""
	Local aArea    := GetArea()
	Local aCabec   := {}
	Local aItens   := {}
	Local aItJson  := {}
	Local aParte   := {}
	Local cCliente := ""
	Local cLoja    := ""
	Local cVend    := ""
	Local cCond    := ""
	Local cObs     := ""
	Local cChvCli  := ""
	Local cLogErr  := ""
	Local cDtEmis  := ""
	Local dEmissao := CtoD("")
	Local aLinha   := {}
	Local cItem    := StrZero(0, TamSX3("C6_ITEM")[1])
	Local cProd    := ""
	Local cTes     := ""
	Local nQtd     := 0
	Local nPreco   := 0
	Local nX       := 0
	Local nTamLoj  := TamSX3("A1_LOJA")[1]
	Local nSaveSx8 := 0

	Private lMsErroAuto    := .F.
	Private lMsHelpAuto    := .T.
	Private lAutoErrNoFile := .T.

	cChvCli := AllTrim(cValToChar(oOrc:GetJsonObject("clienteChave")))
	cVend   := AllTrim(cValToChar(oOrc:GetJsonObject("vendedorChave")))
	cCond   := AllTrim(cValToChar(oOrc:GetJsonObject("condicaoPagamentoChave")))
	cObs    := AllTrim(cValToChar(oOrc:GetJsonObject("observacao")))
	aItJson := oOrc:GetJsonObject("itens")

	// vendedorChave e condicaoPagamentoChave voltam como a chave de integracao
	// que saiu daqui (01-000234, ou -000234 em tabela compartilhada); o pedido
	// guarda so o codigo, sem filial e sem hifen.
	cVend := U_BJSEMFIL(cVend, {"A3_FILIAL", "A3_COD"})
	cCond := U_BJSEMFIL(cCond, {"E4_FILIAL", "E4_CODIGO"})

	If Empty(cChvCli) .Or. ValType(aItJson) != "A" .Or. Len(aItJson) == 0
		BJErroOrc(cSeqMae, cSeq, cIdPlat, "Orcamento sem cliente ou sem itens. Pedido nao foi criado.")
		RestArea(aArea)
		Return ""
	EndIf

	// O clienteChave volta como saiu daqui: filial-codigo-loja, separados por
	// hifen. A filial nao entra na SA1, e o Protheus precisa do codigo e da loja
	// em campos separados.
	aParte := U_BJCHAVE(cChvCli, {"A1_FILIAL", "A1_COD", "A1_LOJA"})

	If Len(aParte) == 3
		cCliente := aParte[2]
		cLoja    := aParte[3]
	Else
		// Chave sem o prefixo de filial: codigo e loja colados
		cCliente := SubStr(cChvCli, 1, Len(cChvCli) - nTamLoj)
		cLoja    := Right(cChvCli, nTamLoj)
	EndIf

	// Posiciona a SA1 e a deixa posicionada: o cabecalho puxa dela natureza,
	// condicao, tabela de preco e vendedor quando a plataforma nao mandou.
	dbSelectArea("SA1")
	SA1->(dbSetOrder(1))

	If !SA1->(dbSeek(xFilial("SA1") + PadR(cCliente, TamSX3("A1_COD")[1]) + PadR(cLoja, TamSX3("A1_LOJA")[1])))
		BJErroOrc(cSeqMae, cSeq, cIdPlat, "Cliente " + cChvCli + " nao encontrado na SA1. Pedido nao foi criado.")
		RestArea(aArea)
		Return ""
	EndIf

	If Empty(cVend)
		cVend := AllTrim(SA1->A1_VEND)
	EndIf

	If Empty(cCond)
		cCond := AllTrim(SA1->A1_COND)
	EndIf

	// Guarda o topo do semaforo de numeracao antes do ExecAuto.
	nSaveSx8 := GetSx8Len()

	// Data de emissao. A API devolve ISO 8601: "2026-08-26T00:00:00.000Z", e o
	// pedido nao pode nascer com data anterior a do sistema.
	cDtEmis  := AllTrim(cValToChar(oOrc:GetJsonObject("dtEmissao")))
	dEmissao := dDataBase

	If Len(cDtEmis) >= 10
		dEmissao := SToD(StrTran(SubStr(cDtEmis, 1, 10), "-", ""))
	EndIf

	If Empty(dEmissao) .Or. dEmissao < dDataBase
		dEmissao := dDataBase
	EndIf

	aAdd(aCabec, {"C5_FILIAL" , xFilial("SC5"), Nil})
	aAdd(aCabec, {"C5_TIPO"   , "N"           , Nil})
	aAdd(aCabec, {"C5_CLIENTE", cCliente      , Nil})
	aAdd(aCabec, {"C5_LOJACLI", cLoja         , Nil})
	aAdd(aCabec, {"C5_EMISSAO", dEmissao      , Nil})

	If !Empty(cVend)
		aAdd(aCabec, {"C5_VEND1", cVend, Nil})
	EndIf

	If !Empty(cCond)
		aAdd(aCabec, {"C5_CONDPAG", cCond, Nil})
	EndIf

	If !Empty(SA1->A1_TABELA)
		aAdd(aCabec, {"C5_TABELA", SA1->A1_TABELA, Nil})
	EndIf

	If !Empty(SA1->A1_NATUREZ)
		aAdd(aCabec, {"C5_NATUREZ", SA1->A1_NATUREZ, Nil})
	EndIf

	// A observacao so entra se o campo existir neste dicionario
	If !Empty(cObs) .And. SC5->(FieldPos("C5_XOBSVEN")) > 0
		aAdd(aCabec, {"C5_XOBSVEN", cObs, Nil})
	EndIf

	// Itens do pedido. Produto que nao existe na SB1 ou linha sem quantidade sao
	// ignorados com WARN - um item ruim nao derruba o pedido inteiro.
	dbSelectArea("SB1")
	SB1->(dbSetOrder(1))

	For nX := 1 To Len(aItJson)

		cProd  := AllTrim(cValToChar(aItJson[nX]:GetJsonObject("produtoChave")))
		nQtd   := aItJson[nX]:GetJsonObject("quantidade")
		nPreco := aItJson[nX]:GetJsonObject("vlrUnitario")

		// O produtoChave volta como a chave de integracao (01-11400443); a SB1
		// guarda so o B1_COD, sem filial e sem hifen.
		cProd := U_BJSEMFIL(cProd, {"B1_FILIAL", "B1_COD"})

		If Empty(cProd) .Or. ValType(nQtd) != "N" .Or. nQtd <= 0
			FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Item " + cValToChar(nX) + " sem produto ou sem quantidade. Ignorado.", 0, 0, {})
			Loop
		EndIf

		If !SB1->(dbSeek(xFilial("SB1") + PadR(cProd, TamSX3("B1_COD")[1])))
			FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Produto " + cProd + " nao existe na SB1. Item ignorado.", 0, 0, {})
			Loop
		EndIf

		If ValType(nPreco) != "N"
			nPreco := 0
		EndIf

		cTes   := AllTrim(SB1->B1_TS)
		cItem  := Soma1(cItem)
		aLinha := {}

		aAdd(aLinha, {"C6_ITEM"   , cItem                  , Nil})
		aAdd(aLinha, {"C6_PRODUTO", cProd                  , Nil})
		aAdd(aLinha, {"C6_QTDVEN" , nQtd                   , Nil})
		aAdd(aLinha, {"C6_PRCVEN" , nPreco                 , Nil})
		aAdd(aLinha, {"C6_VALOR"  , Round(nQtd * nPreco, 2), Nil})

		If !Empty(SB1->B1_UM)
			aAdd(aLinha, {"C6_UM", SB1->B1_UM, Nil})
		EndIf
		If !Empty(cTes)
			aAdd(aLinha, {"C6_TES", cTes, Nil})
		EndIf
		If !Empty(SB1->B1_LOCPAD)
			aAdd(aLinha, {"C6_LOCAL", SB1->B1_LOCPAD, Nil})
		EndIf

		aAdd(aItens, aLinha)

	Next nX

	If Len(aItens) == 0
		BJErroOrc(cSeqMae, cSeq, cIdPlat, "Nenhum item do orcamento pode ser convertido. Pedido nao foi criado.")
		RestArea(aArea)
		Return ""
	EndIf

	// ---------------------------------------------------------------------
	// A transacao que impede o pedido duplicado.
	//
	// O pedido e a marcacao da mensagem gravam juntos, ou nenhum dos dois. Se a
	// marcacao falhar, o pedido volta atras com ela e o registro da plataforma e
	// reprocessado do zero no ciclo seguinte, sem deixar orfao na SC5.
	//
	// **Nao tire a chamada de U_BJGRAVA de dentro deste bloco.** Fora dele volta a
	// existir o intervalo em que o pedido esta gravado e ninguem sabe - e o ciclo
	// seguinte cria um segundo. Nada quebra e nada avisa.
	//
	// Nao ha chamada de tela aqui dentro: em job nao existe interface, e UI em
	// transacao segura o lock do banco.
	// ---------------------------------------------------------------------
	Begin Transaction

		dbSelectArea("SC5")
		MSExecAuto({|x, y, z| MATA410(x, y, z)}, aCabec, aItens, 3)

		If lMsErroAuto

			cLogErr := BJLogAuto()

			DisarmTransaction()

		Else

			// O MATA410 deixa a SC5 posicionada no pedido que acabou de gravar.
			cNumPed := AllTrim(SC5->C5_NUM)

			If Empty(cNumPed)
				cLogErr := "Pedido gerado, mas a SC5 nao ficou posicionada para ler o numero."
				DisarmTransaction()
			ElseIf !U_BJGRAVA(cSeqMae, cSeq, "2", 0, "Pedido " + cNumPed + " criado por MATA410.", cNumPed)
				cLogErr := "Pedido " + cNumPed + " criado, mas a mensagem " + cSeq + " nao pode ser marcada. " + ;
					"A transacao foi desfeita para nao deixar pedido sem rastro."
				cNumPed := ""
				DisarmTransaction()
			EndIf

		EndIf

	End Transaction

	If Empty(cNumPed)

		// Devolve todos os numeros consumidos, nao apenas o ultimo.
		While GetSx8Len() > nSaveSx8
			RollBackSx8()
		End

		BJErroOrc(cSeqMae, cSeq, cIdPlat, "ExecAuto MATA410: " + cLogErr)
		RestArea(aArea)
		Return ""
	EndIf

	ConfirmSx8()

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento da plataforma " + cIdPlat + " criou o pedido " + cNumPed + ;
		" na SC5.", 0, 0, {})

	RestArea(aArea)

Return cNumPed

/*/{Protheus.doc} BJVincula
Avisa a plataforma que o orcamento dela virou um Pedido de Venda no ERP.
Pedido e itens voltam juntos: a chave de integracao do SC5 e, para cada item do
orcamento, a do SC6 gerado a partir dele. O item e casado pelo produto, na
ordem do C6_ITEM, contra o que o pedido realmente gravou - item que o pedido
pulou (produto inexistente, sem quantidade) nao tem SC6 e volta sem chave.
Por ler a SC6 gravada, serve tanto logo depois do MATA410 quanto no ciclo
seguinte, quando so o aviso tinha falhado.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cIdPlat, character, Id interno da plataforma (UUID)
@param   cNumPed, character, C5_NUM do pedido criado
@param   oOrc   , object   , Orcamento devolvido pela API, com o id de cada item
@return  logical, .T. quando a plataforma aceitou o vinculo
/*/
Static Function BJVincula(cIdPlat, cNumPed, oOrc)

	Local lRet    := .F.
	Local cResp   := ""
	Local cErro   := ""
	Local cQuery  := ""
	Local cAlias  := ""
	Local cProd   := ""
	Local nHttp   := 0
	Local nX      := 0
	Local nY      := 0
	Local aSc6    := {}
	Local aItens  := {}
	Local aItJson := {}
	Local oJson   := Nil
	Local oItem   := Nil
	Local oStmt   := Nil

	// Itens gravados no pedido: {chave, produto, ja casado}
	cQuery := "SELECT C6_FILIAL, C6_NUM, C6_ITEM, C6_PRODUTO "
	cQuery += "  FROM " + RetSqlName("SC6") + " SC6 "
	cQuery += " WHERE SC6.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SC6.C6_FILIAL  = ? "
	cQuery += "   AND SC6.C6_NUM     = ? "
	cQuery += " ORDER BY C6_ITEM "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, xFilial("SC6"))
	oStmt:SetString(2, PadR(cNumPed, TamSX3("C6_NUM")[1]))

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())
		// Chave de integracao do item: a chave unica da SC6 (X2_UNICO)
		aAdd(aSc6, {(cAlias)->C6_FILIAL + "-" + (cAlias)->C6_NUM + "-" + (cAlias)->C6_ITEM + "-" + (cAlias)->C6_PRODUTO, ;
			AllTrim((cAlias)->C6_PRODUTO), .F.})
		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

	aItJson := oOrc:GetJsonObject("itens")

	If ValType(aItJson) == "A"
		For nX := 1 To Len(aItJson)
			cProd := AllTrim(U_BJSEMFIL(AllTrim(cValToChar(aItJson[nX]:GetJsonObject("produtoChave"))), {"B1_FILIAL", "B1_COD"}))
			nY    := aScan(aSc6, {|x| !x[3] .And. x[2] == cProd})

			If nY > 0 .And. ValType(aItJson[nX]:GetJsonObject("id")) == "C"
				aSc6[nY][3] := .T.
				oItem := JsonObject():New()
				oItem["id"]    := aItJson[nX]:GetJsonObject("id")
				oItem["chave"] := aSc6[nY][1]
				aAdd(aItens, oItem)
			EndIf
		Next nX
	EndIf

	// Chave de integracao do pedido: a chave unica da SC5 (X2_UNICO)
	oJson := JsonObject():New()
	oJson["chave"]     := xFilial("SC5") + "-" + PadR(cNumPed, TamSX3("C5_NUM")[1])
	oJson["codigoErp"] := AllTrim(cNumPed)
	oJson["itens"]     := aItens

	lRet := U_BJHTTP("PATCH", "/integracao/orcamentos/pendentes" + "/" + AllTrim(cIdPlat), oJson:ToJson(), @cResp, @nHttp, @cErro)

	oJson := Nil

	If lRet
		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento da plataforma " + cIdPlat + " vinculado ao pedido " + ;
			cNumPed + " do ERP (" + cValToChar(Len(aItens)) + " itens).", 0, 0, {})
	Else
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Falha ao vincular " + cIdPlat + " ao pedido " + cNumPed + ;
			" (HTTP " + cValToChar(nHttp) + "): " + cErro, 0, 0, {})
	EndIf

Return lRet

/*/{Protheus.doc} BJLogAuto
Devolve o log de erro do ultimo ExecAuto como texto de uma linha.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  character, Log concatenado
/*/
Static Function BJLogAuto()

	Local cRet := ""
	Local aLog := {}
	Local nX   := 0

	aLog := GetAutoGRLog()

	For nX := 1 To Len(aLog)
		cRet += AllTrim(StrTran(StrTran(aLog[nX], Chr(13), " "), Chr(10), " ")) + " | "
	Next nX

	If Empty(cRet)
		cRet := "Sem detalhamento no log do ExecAuto."
	EndIf

Return SubStr(cRet, 1, 400)

/*/{Protheus.doc} BJErroOrc
Grava a falha da criacao do orcamento na mensagem e no log.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cSeq   , character, Sequencia da mensagem na fila
@param   cIdPlat, character, Id interno da plataforma
@param   cMsg   , character, Motivo da falha
@return  Nil
/*/
Static Function BJErroOrc(cSeqMae, cSeq, cIdPlat, cMsg)

	FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento " + cIdPlat + ": " + cMsg, 0, 0, {})

	U_BJGRAVA(cSeqMae, cSeq, "3", 0, cMsg, "")

Return Nil

// ===========================================================================
// ALTERACOES DE CLIENTE APROVADAS NA PLATAFORMA
// ===========================================================================

/*/{Protheus.doc} BJLeAltCli
Le as alteracoes de cliente aprovadas na plataforma e as aplica na SA1.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aTotal , array    , [Referencia] Totalizadores
@param   cSeqMae, character, ZY_CODIGO do lote (SZY) deste retorno
@return  Nil
/*/
Static Function BJLeAltCli(aTotal, cSeqMae)

	Local cResp  := ""
	Local cErro  := ""
	Local nHttp  := 0
	Local nX     := 0
	Local oJson  := Nil
	Local aDados := {}

	If !U_BJHTTP("GET", "/integracao/clientes/alteracoes" + "?pageSize=100&page=1", "", @cResp, @nHttp, @cErro)

		If nHttp == 404
			FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Rota " + "/integracao/clientes/alteracoes" + " ainda nao existe na API. " + ;
				"Retorno de alteracao de cliente ignorado neste ciclo.", 0, 0, {})
		Else
			FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Falha ao listar alteracoes de cliente: " + cErro, 0, 0, {})
			aTotal[4] += 1
		EndIf

		Return Nil
	EndIf

	oJson := JsonObject():New()

	If oJson:FromJson(cResp) != Nil
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Resposta invalida ao listar alteracoes de cliente.", 0, 0, {})
		aTotal[4] += 1
		Return Nil
	EndIf

	aDados := oJson:GetJsonObject("data")

	If ValType(aDados) != "A"
		Return Nil
	EndIf

	For nX := 1 To Len(aDados)
		aTotal[1] += 1
		BJTrataAlt(aDados[nX], @aTotal, cSeqMae)
	Next nX

Return Nil

/*/{Protheus.doc} BJTrataAlt
Aplica uma alteracao de cliente na SA1 e confirma na plataforma.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oAlt   , object   , Alteracao devolvida pela API
@param   aTotal , array    , [Referencia] Totalizadores
@param   cSeqMae, character, ZY_CODIGO do lote (SZY) deste retorno
@return  Nil
/*/
Static Function BJTrataAlt(oAlt, aTotal, cSeqMae)

	Local cIdPlat  := ""
	Local cChvCli  := ""
	Local cCliente := ""
	Local cLoja    := ""
	Local cSeq     := ""
	Local cLogErr  := ""
	Local cFeito   := ""
	Local aParte   := {}
	Local aCampos  := {}
	Local aMapa    := {}
	Local cTexto   := ""
	Local xValor   := Nil
	Local nX       := 0
	Local nTamLoj  := TamSX3("A1_LOJA")[1]

	If ValType(oAlt) != "O"
		aTotal[4] += 1
		Return Nil
	EndIf

	cIdPlat := AllTrim(cValToChar(oAlt:GetJsonObject("id")))
	cChvCli := AllTrim(cValToChar(oAlt:GetJsonObject("clienteChave")))

	If Empty(cIdPlat) .Or. Empty(cChvCli)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Alteracao de cliente sem id ou sem cliente. Ignorada.", 0, 0, {})
		aTotal[3] += 1
		Return Nil
	EndIf

	// Ja aplicada num ciclo anterior: falta so confirmar na plataforma
	If U_BJACHOU("E", "clientes-alteracoes", cIdPlat, @cFeito)
		If BJConfAlt(cIdPlat)
			aTotal[2] += 1
		Else
			aTotal[4] += 1
		EndIf
		Return Nil
	EndIf

	cSeq := U_BJENFILA("E", "clientes-alteracoes", cIdPlat, "GET", oAlt:ToJson(), cSeqMae)

	If Empty(cSeq)
		aTotal[4] += 1
		Return Nil
	EndIf

	// O clienteChave volta prefixado pela filial, como saiu daqui.
	aParte := U_BJCHAVE(cChvCli, {"A1_FILIAL", "A1_COD", "A1_LOJA"})

	If Len(aParte) == 3
		cCliente := aParte[2]
		cLoja    := aParte[3]
	Else
		// Chave sem o prefixo de filial: codigo e loja colados
		cCliente := SubStr(cChvCli, 1, Len(cChvCli) - nTamLoj)
		cLoja    := Right(cChvCli, nTamLoj)
	EndIf

	dbSelectArea("SA1")
	SA1->(dbSetOrder(1))

	If !SA1->(dbSeek(xFilial("SA1") + PadR(cCliente, TamSX3("A1_COD")[1]) + PadR(cLoja, TamSX3("A1_LOJA")[1])))
		U_BJGRAVA(cSeqMae, cSeq, "3", 0, "Cliente " + cChvCli + " nao encontrado na SA1.", "")
		aTotal[4] += 1
		Return Nil
	EndIf

	// De-para dos campos que a plataforma pode alterar na SA1. E lista branca:
	// campo fora dela nao volta, por mais que a plataforma mande.
	//         Campo no contrato          Campo na SA1  Tipo (R = referencia prefixada pela filial)
	aAdd(aMapa, {"razaoSocial"            , "A1_NOME"   , "C"})
	aAdd(aMapa, {"nomeFantasia"           , "A1_NREDUZ" , "C"})
	aAdd(aMapa, {"cnpjCpf"                , "A1_CGC"    , "C"})
	aAdd(aMapa, {"inscricaoEstadual"      , "A1_INSCR"  , "C"})
	aAdd(aMapa, {"inscricaoMunicipal"     , "A1_INSCRM" , "C"})
	aAdd(aMapa, {"endereco"               , "A1_END"    , "C"})
	aAdd(aMapa, {"complemento"            , "A1_COMPLEM", "C"})
	aAdd(aMapa, {"bairro"                 , "A1_BAIRRO" , "C"})
	aAdd(aMapa, {"municipio"              , "A1_MUN"    , "C"})
	aAdd(aMapa, {"uf"                     , "A1_EST"    , "C"})
	aAdd(aMapa, {"cep"                    , "A1_CEP"    , "C"})
	aAdd(aMapa, {"contato"                , "A1_CONTATO", "C"})
	aAdd(aMapa, {"email"                  , "A1_EMAIL"  , "C"})
	aAdd(aMapa, {"telefone"               , "A1_TEL"    , "C"})
	aAdd(aMapa, {"celular"                , "A1_CELULAR", "C"})
	// Referencia ("R") leva, na quarta posicao, os campos da chave unica da
	// tabela referenciada, para desmontar a chave de integracao recebida.
	aAdd(aMapa, {"vendedorChave"          , "A1_VEND"   , "R", {"A3_FILIAL", "A3_COD"}})
	aAdd(aMapa, {"tabelaPrecoChave"       , "A1_TABELA" , "R", {"DA0_FILIAL", "DA0_CODTAB"}})
	aAdd(aMapa, {"condicaoPagamentoChave" , "A1_COND"   , "R", {"E4_FILIAL", "E4_CODIGO"}})
	aAdd(aMapa, {"limiteCredito"          , "A1_LC"     , "N"})
	aAdd(aMapa, {"vencimentoLimite"       , "A1_VENCLC" , "D"})
	aAdd(aMapa, {"latitude"               , "A1_XLAT"   , "C"})
	aAdd(aMapa, {"longitude"              , "A1_XLNG"   , "C"})

	For nX := 1 To Len(aMapa)

		xValor := oAlt:GetJsonObject(aMapa[nX][1])

		If xValor == Nil
			Loop
		EndIf

		// Campo que nao existe neste dicionario e ignorado, nao derruba a alteracao
		If SA1->(FieldPos(aMapa[nX][2])) == 0
			Loop
		EndIf

		Do Case
			Case aMapa[nX][3] == "N"
				If ValType(xValor) == "N"
					aAdd(aCampos, {aMapa[nX][2], xValor, Nil})
				EndIf

			Case aMapa[nX][3] == "R"
				// Referencia a outra entidade: volta como a chave de integracao que
				// saiu daqui (01-000234). A SA1 guarda so o codigo, sem filial e
				// sem hifen.
				cTexto := U_BJSEMFIL(AllTrim(cValToChar(xValor)), aMapa[nX][4])

				aAdd(aCampos, {aMapa[nX][2], cTexto, Nil})

			Case aMapa[nX][3] == "D"
				// A API devolve ISO 8601: "2026-08-26T00:00:00.000Z"
				If ValType(xValor) == "C" .And. Len(AllTrim(xValor)) >= 10
					aAdd(aCampos, {aMapa[nX][2], SToD(StrTran(SubStr(AllTrim(xValor), 1, 10), "-", "")), Nil})
				EndIf

			Otherwise
				aAdd(aCampos, {aMapa[nX][2], AllTrim(cValToChar(xValor)), Nil})
		EndCase

	Next nX

	If Len(aCampos) == 0
		U_BJGRAVA(cSeqMae, cSeq, "3", 0, "Alteracao sem nenhum campo reconhecido no de-para.", "")
		aTotal[3] += 1
		Return Nil
	EndIf

	// A gravacao e a marcacao andam juntas, pelo mesmo motivo do orcamento:
	// cadastro alterado sem rastro voltaria a ser alterado no ciclo seguinte.
	Begin Transaction

		If BJGravSA1(aCampos, @cLogErr)

			If !U_BJGRAVA(cSeqMae, cSeq, "2", 0, "Cliente " + cChvCli + " alterado por CRMA980.", cChvCli)
				cLogErr := "Cliente alterado, mas a mensagem " + cSeq + " nao pode ser marcada."
				DisarmTransaction()
			EndIf

		Else

			DisarmTransaction()

		EndIf

	End Transaction

	If !Empty(cLogErr)
		U_BJGRAVA(cSeqMae, cSeq, "3", 0, cLogErr, "")
		aTotal[4] += 1
		Return Nil
	EndIf

	If BJConfAlt(cIdPlat)
		aTotal[2] += 1
	Else
		aTotal[4] += 1
	EndIf

Return Nil

/*/{Protheus.doc} BJGravSA1
Grava a alteracao no cadastro de clientes pelo modelo MVC.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aCampos, array    , Campos no formato {cCampo, xValor, Nil}
@param   cErro  , character, [Referencia] Motivo da recusa
@return  logical, .T. quando o cadastro foi gravado
/*/
Static Function BJGravSA1(aCampos, cErro)

	Local lRet   := .F.
	Local oModel := Nil
	Local bErro  := ErrorBlock({|e| Break(e)})

	Private lMsErroAuto    := .F.
	Private lMsHelpAuto    := .T.
	Private lAutoErrNoFile := .T.

	Default aCampos := {}
	Default cErro   := ""

	cErro := ""

	If Len(aCampos) == 0
		cErro := "Nenhum campo informado."
		Return .F.
	EndIf

	Begin Sequence

		oModel := FWLoadModel("CRMA980")

		If oModel == Nil
			cErro := "Nao foi possivel carregar o modelo CRMA980. Confira se MV_MVCSA1 esta ligado."
			Break
		EndIf

		lRet := FWMVCRotAuto(oModel, "SA1", MODEL_OPERATION_UPDATE, {{"SA1MASTER", aCampos}}, .F., .T.)

		If lMsErroAuto
			lRet  := .F.
			cErro := BJLogAuto()
		EndIf

		If !lRet .And. Empty(cErro)
			cErro := "CRMA980 recusou a alteracao sem detalhamento."
		EndIf

	Recover

		lRet := .F.

		If Empty(cErro)
			cErro := "Erro nao tratado ao alterar o cliente pelo CRMA980."
		EndIf

	End Sequence

	ErrorBlock(bErro)

	If oModel != Nil
		oModel:DeActivate()
		oModel:Destroy()
	EndIf

Return lRet

/*/{Protheus.doc} BJConfAlt
Confirma na plataforma que a alteracao foi aplicada no ERP.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cIdPlat, character, Id interno da plataforma
@return  logical, .T. quando a plataforma aceitou a confirmacao
/*/
Static Function BJConfAlt(cIdPlat)

	Local lRet  := .F.
	Local cResp := ""
	Local cErro := ""
	Local nHttp := 0

	lRet := U_BJHTTP("PATCH", "/integracao/clientes/alteracoes" + "/" + AllTrim(cIdPlat) + "/aplicada", "{}", @cResp, @nHttp, @cErro)

	If !lRet
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Falha ao confirmar a alteracao " + cIdPlat + ;
			" na plataforma (HTTP " + cValToChar(nHttp) + "): " + cErro, 0, 0, {})
	EndIf

Return lRet

// ===========================================================================
// DRENAGEM
// ===========================================================================

/*/{Protheus.doc} BJDRENA
Envia as mensagens de saida da fila, pela prioridade dos lotes.
A cada volta pega o lote aberto de maior peso (ZY_PRIOR) que ainda tem
mensagem de saida pendente, le no maximo MV_BJAPI12 mensagens dele (a fatia),
envia e volta a perguntar: se chegou lote mais pesado nesse meio tempo, e ele
que sai agora. Uma carga grande nunca segura o dia a dia por mais de uma fatia.
Erro de DADO (400, 404, 409, 422) marca aquela mensagem e o envio segue; erro
de API ou rede (transporte, 5xx, 401, 403, 429) para a chamada - insistir so
acumularia falha.
Mensagem cuja chave ja tem versao mais nova em lote posterior e marcada
executada sem envio: a carga, que sai depois, nao sobrescreve na plataforma o
que o dia a dia ja mandou.
Ver docs/planos/2026-09-26-filas-prioridade-integracao.md.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   nLimite , numeric  , Maximo de mensagens lidas nesta chamada. Zero, sem limite
@param   cSeqMae , character, ZY_CODIGO de um lote so (Enviar do monitor). Vazio segue a prioridade
@param   oProcess, object   , MsNewProcess do monitor, para as reguas. Nil no agendamento
@return  array, {nLidas, nEnviadas, nErros}
@example aTot := U_BJDRENA(0)
/*/
User Function BJDRENA(nLimite, cSeqMae, oProcess)

	Local aTotal  := {0, 0, 0}
	Local aGrupos := {}
	Local nGrupo  := 0
	Local nNoGrp  := 0
	Local nPasso  := 0
	Local nPassos := 0
	Local aFila   := {}
	Local aCat    := U_BJCATALO()
	Local aEnt    := {}
	Local aFeitos := {}
	Local cLote   := ""
	Local cStatus := ""
	Local cRota   := ""
	Local cResp   := ""
	Local cErro   := ""
	Local cNovo   := ""
	Local cQuery  := ""
	Local cAlias  := ""
	Local oStmt   := Nil
	Local nHttp   := 0
	Local nPos    := 0
	Local nPosCat := 0
	Local nPrior  := 0
	Local nFatia  := 0
	Local nCabe   := 0
	Local nSuper  := 0
	Local lFatiou := .F.
	Local lParou  := .F.
	Local nFase   := 1
	Local aStatus := {}
	Local nX      := 0

	Local nPausa   := 0
	Local cTrava   := ""
	Local cInicio  := ""
	Local nSeg     := Seconds()

	// Agendamento tipo Job: o WFLAUNCHER passa {empresa, filial} no PRIMEIRO
	// parametro, e o nLimite chegava como array - o Default nao age (so troca
	// Nil) e o "nLimite > 0" caia em "type mismatch on compare". Aproveita a
	// empresa/filial para o ambiente e volta o parametro ao padrao.
	If ValType(nLimite) == "A"
		U_BJAMBIENTE(nLimite[1], nLimite[2])
		nLimite := 0
	EndIf

	Default nLimite := 0
	Default cSeqMae := ""

	// Primeira linha de toda rotina agendavel. Agendamento cadastrado como Job
	// e lancado pelo agente do Schedule via WFLAUNCHER, SEM ambiente: cFilAnt
	// nem existe, e a proxima leitura de parametro cai em "CFILANT".
	U_BJAMBIENTE()

	// Parametros lidos aqui, uma vez: dentro dos lacos seria uma leitura por
	// mensagem enviada. **Depois** do ambiente, e nao na declaracao do Local -
	// Local e avaliado antes da primeira instrucao, logo antes do U_BJAMBIENTE.
	nPausa := GetMV("MV_BJAPI08")   // ms entre requisicoes
	nFatia := GetMV("MV_BJAPI12")   // mensagens por fatia, entre uma conferencia de prioridade e outra

	If nFatia <= 0
		nFatia := 2000
	EndIf

	If !AllTrim(Upper(GetMV("MV_BJAPI03"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Fila nao drenada.", 0, 0, {})
		Return aTotal
	EndIf

	// Um envio por vez, venha do agendamento ou do monitor: os dois chamam esta
	// funcao. A trava e por nome (LockByName): o servidor a solta quando a thread termina,
	// mesmo que caia com erro - nao sobra trava para apagar a mao.
	cTrava := "BJPLA_ENVIO"

	If !LockByName(cTrava, .T., .F.)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Envio ja em andamento. Chamada ignorada.", 0, 0, {})
		ConOut("[BJPLA] U_BJDRENA ignorado - ja ha um envio em andamento (trava BJPLA_ENVIO); ele pega os lotes liberados na proxima volta")
		Return aTotal
	EndIf

	// Batimento: quem segura a trava e ate onde chegou, para o monitor saber se
	// o envio esta lento ou parado. Atualizado na leitura e no envio; apagado
	// antes de cada UnLockByName.
	cInicio := DtoS(Date()) + " " + Time()
	U_BJBATIDA(cInicio, "procurando lotes em aberto")

	ConOut("[BJPLA] U_BJDRENA inicio - thread " + cValToChar(ThreadId()) + " - fatia " + cValToChar(nFatia) + ;
		Iif(Empty(cSeqMae), "", " - so o lote " + AllTrim(cSeqMae)))

	While !lParou

		If nLimite > 0 .And. aTotal[1] >= nLimite
			Exit
		EndIf

		// ---------------------------------------------------------------
		// Qual lote agora. O Enviar do monitor manda um lote so; o resto segue
		// a prioridade: o de maior peso que ainda tem saida pendente, e entre
		// os de mesmo peso o mais antigo. aFeitos sao os lotes que esta chamada
		// ja leu ate o fim - o que sobrou neles e erro desta volta, e tentar de
		// novo agora so repetiria o erro.
		// ---------------------------------------------------------------
		If !Empty(cSeqMae)

			If aScan(aFeitos, {|c| c == AllTrim(cSeqMae)}) > 0
				Exit
			EndIf

			cLote  := AllTrim(cSeqMae)
			nPrior := 0

		Else

			cQuery := "SELECT SZY.ZY_CODIGO, SZY.ZY_PRIOR "
			cQuery += "  FROM " + RetSqlName("SZY") + " SZY "
			cQuery += " WHERE SZY.D_E_L_E_T_ = ' ' "
			cQuery += "   AND SZY.ZY_FILIAL  = ? "
			cQuery += "   AND SZY.ZY_STATUS IN ('1', '3') "
			// So lote LIBERADO: a coleta preenche o fim ao fechar o lote. O que
			// ainda esta sendo gerado tem o fim vazio e nao e tocado - senao o
			// envio pegaria o lote pela metade, e o fecharia com a coleta ainda
			// gravando nele.
			cQuery += "   AND SZY.ZY_DTFIM   > ' ' "
			cQuery += "   AND EXISTS (SELECT 1 "
			cQuery += "                 FROM " + RetSqlName("SZZ") + " SZZ "
			cQuery += "                WHERE SZZ.D_E_L_E_T_ = ' ' "
			cQuery += "                  AND SZZ.ZZ_FILIAL  = ? "
			cQuery += "                  AND SZZ.ZZ_CODIGO  = SZY.ZY_CODIGO "
			cQuery += "                  AND SZZ.ZZ_TIPO    = 'S' "
			// Duas fases (decisao do usuario, 26/09/2026): primeiro os lotes com
			// ERRO de processamento ("3"), depois os NAO ENVIADOS ("1"). Um erro
			// nao segura nada: marca a mensagem e passa para a proxima; a
			// proxima execucao comeca por ele.
			cQuery += "                  AND SZZ.ZZ_STATUS  = '" + Iif(nFase == 1, "3", "1") + "') "

			For nX := 1 To Len(aFeitos)
				cQuery += "   AND SZY.ZY_CODIGO <> '" + aFeitos[nX] + "' "
			Next nX

			cQuery += " ORDER BY SZY.ZY_PRIOR DESC, SZY.ZY_CODIGO "

			oStmt := FWExecStatement():New(ChangeQuery(cQuery))
			oStmt:SetString(1, xFilial("SZY"))
			oStmt:SetString(2, xFilial("SZZ"))

			cAlias := oStmt:OpenAlias()

			If (cAlias)->(Eof())
				cLote := ""
			Else
				cLote  := AllTrim((cAlias)->ZY_CODIGO)
				nPrior := (cAlias)->ZY_PRIOR
			EndIf

			(cAlias)->(dbCloseArea())
			oStmt:Destroy()

			If Empty(cLote)
				If nFase == 1
					// Acabaram os erros: agora os nao enviados, com a lista de
					// lotes feitos zerada - um lote pode ter as duas coisas.
					nFase   := 2
					aFeitos := {}
					Loop
				EndIf
				Exit   // nada pendente
			EndIf

		EndIf

		// ---------------------------------------------------------------
		// A fatia: ate nFatia mensagens pendentes deste lote. O indice 2 poe o
		// status antes da sequencia (ZZ_FILIAL + ZZ_CODIGO + ZZ_STATUS +
		// ZZ_SEQUEN): o dbSeek cai direto no primeiro pendente e mensagem ja
		// executada nem e lida. Primeiro as "1", depois as "3".
		// ---------------------------------------------------------------
		aFila   := {}
		lFatiou := .F.
		nCabe   := nFatia

		If nLimite > 0
			nCabe := Min(nCabe, nLimite - aTotal[1])
		EndIf

		U_BJBATIDA(cInicio, "lote " + cLote + " (peso " + cValToChar(nPrior) + ") - lendo a fila")

		dbSelectArea("SZZ")
		SZZ->(dbSetOrder(2))   // ZZ_FILIAL + ZZ_CODIGO + ZZ_STATUS + ZZ_SEQUEN

		// Que status ler: na fase 1 so os com erro, na 2 so os nao enviados. O
		// Reenviar de um lote (cSeqMae) le os dois.
		If !Empty(cSeqMae)
			aStatus := {"1", "3"}
		ElseIf nFase == 1
			aStatus := {"3"}
		Else
			aStatus := {"1"}
		EndIf

		For nX := 1 To Len(aStatus)

			cStatus := aStatus[nX]

			If SZZ->(dbSeek(xFilial("SZZ") + PadR(cLote, TamSX3("ZZ_CODIGO")[1]) + cStatus))

				While SZZ->(!Eof()) .And. SZZ->ZZ_FILIAL == xFilial("SZZ") .And. ;
					AllTrim(SZZ->ZZ_CODIGO) == cLote .And. SZZ->ZZ_STATUS == cStatus

					If Len(aFila) >= nCabe
						lFatiou := .T.
						Exit
					EndIf

					// Erro que esta chamada ja tentou (executada depois do inicio dela)
					// nao volta agora: senao um lote com mais erros que uma fatia
					// releria as mesmas mensagens para sempre.
					If cStatus == "3" .And. DtoS(SZZ->ZZ_DTEXEC) + " " + SZZ->ZZ_HREXEC >= cInicio
						SZZ->(dbSkip())
						Loop
					EndIf

					If SZZ->ZZ_TIPO == "S"
						nPosCat := aScan(aCat, {|c| c[1] == AllTrim(SZZ->ZZ_ENTID)})
						If nPosCat == 0
							nPosCat := 999
						EndIf
						// O elemento 8 e a chave como esta gravada, com os espacos: e por
						// ela que BJSuperada busca a mesma chave em lote mais novo.
						aAdd(aFila, {SZZ->ZZ_SEQUEN, AllTrim(SZZ->ZZ_ENTID), AllTrim(SZZ->ZZ_CHVORI), ;
							AllTrim(SZZ->ZZ_VERBO), SZZ->ZZ_JSON, AllTrim(SZZ->ZZ_CODIGO), nPosCat, SZZ->ZZ_CHVORI})
					EndIf

					SZZ->(dbSkip())
				End

			EndIf

			If lFatiou
				Exit
			EndIf

		Next nX

		aSort(aFila, , , {|x, y| ;
			Iif(x[7] != y[7], x[7] < y[7], x[1] < y[1]) ;
		})

		// Leu o lote ate o fim nesta volta: o que sobrar nele e erro desta
		// chamada, e ele nao volta nela.
		If !lFatiou
			aAdd(aFeitos, cLote)
		EndIf

		If Len(aFila) == 0
			BJFechaEnv(cLote)
			Loop
		EndIf

		aTotal[1] += Len(aFila)

		ConOut("[BJPLA] U_BJDRENA " + Iif(Empty(cSeqMae), Iif(nFase == 1, "erros - ", "nao enviados - "), "reenvio - ") + ;
			"lote " + cLote + " (peso " + cValToChar(nPrior) + ") - " + cValToChar(Len(aFila)) + ;
			" mensagens" + Iif(lFatiou, " (fatia; o lote continua depois)", ""))

		// Regua 1 por entidade, regua 2 pelas mensagens dela. A fila ja vem na
		// ordem do catalogo, entao as mensagens de uma entidade chegam juntas:
		// cada troca de entidade abre um grupo. So o monitor passa oProcess; no
		// agendamento nao ha tela.
		If ValType(oProcess) == "O"
			aGrupos := {}

			For nX := 1 To Len(aFila)
				If Len(aGrupos) == 0 .Or. !(aGrupos[Len(aGrupos)][1] == aFila[nX][2])
					aAdd(aGrupos, {aFila[nX][2], 0})
				EndIf
				aGrupos[Len(aGrupos)][2] += 1
			Next nX

			oProcess:SetRegua1(Len(aGrupos))
			nGrupo := 0
			nNoGrp := 0
		EndIf

		For nX := 1 To Len(aFila)

			If ValType(oProcess) == "O"
				If oProcess:lEnd
					FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Envio do lote " + cLote + " interrompido pelo usuario.", 0, 0, {})
					lParou := .T.
					Exit
				EndIf
				If nX == 1 .Or. !(aFila[nX][2] == aFila[nX - 1][2])
					nGrupo  += 1
					nNoGrp  := 0

					// No minimo 100 mensagens entre repintagens, no maximo 100
					// atualizacoes no grupo. IncRegua2 anda uma casa por chamada,
					// entao a regua conta passos, nao mensagens.
					nPasso  := Max(100, Int(aGrupos[nGrupo][2] / 100))
					nPassos := Int(aGrupos[nGrupo][2] / nPasso)

					If aGrupos[nGrupo][2] % nPasso > 0
						nPassos += 1
					EndIf

					oProcess:IncRegua1("Lote " + cLote + " - " + aGrupos[nGrupo][1] + " - " + ;
						cValToChar(nGrupo) + " de " + cValToChar(Len(aGrupos)) + "...")
					oProcess:SetRegua2(Max(nPassos, 1))
				EndIf

				nNoGrp += 1

				If nNoGrp % nPasso == 0 .Or. nNoGrp == aGrupos[nGrupo][2]
					oProcess:IncRegua2("Registro: " + cValToChar(nNoGrp) + " de " + cValToChar(aGrupos[nGrupo][2]) + ". " + ;
						Transform(Round(nNoGrp * 100 / aGrupos[nGrupo][2], 2), "@E 999.99") + "%")
				EndIf
			EndIf

			// aFila[nX] = {cSequen, cEntid, cChave, cVerbo, cJson, cLote, nPosCat, cChaveGravada}

			// Superada: a mesma chave ja tem mensagem em lote mais novo, que sai
			// (ou saiu) com o estado mais recente. Mandar esta agora seria voltar
			// a plataforma para tras.
			cNovo := BJSuperada(cLote, aFila[nX][2], aFila[nX][8])

			If !Empty(cNovo)
				U_BJGRAVA(aFila[nX][6], aFila[nX][1], "2", 0, "Superada: a mesma chave tem mensagem mais nova no lote " + cNovo + ". Nao enviada.", "")
				nSuper += 1
				Loop
			EndIf

			nPos := aScan(aCat, {|x| x[1] == aFila[nX][2]})

			If nPos == 0
				FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mensagem " + aFila[nX][1] + " aponta para a entidade " + ;
					aFila[nX][2] + ", que nao esta no catalogo.", 0, 0, {})
				U_BJGRAVA(aFila[nX][6], aFila[nX][1], "3", 0, "Entidade fora do catalogo: " + aFila[nX][2], "")   // erro
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
				// dada uma chave, saber o id de la; dado o id, saber de onde veio.
				U_BJGRAVA(aFila[nX][6], aFila[nX][1], "2", nHttp, cResp, BJIdPlat(cResp))   // executada
				aTotal[2] += 1

			ElseIf aFila[nX][4] == "DELETE" .And. nHttp == 404

				// O objetivo do DELETE era que o registro nao estivesse la, e nao esta.
				// Nao ha historico do que ja foi enviado antes desta fila existir, entao
				// uma exclusao pode chegar para uma chave que a plataforma nunca conheceu.
				U_BJGRAVA(aFila[nX][6], aFila[nX][1], "2", nHttp, "404 no DELETE: o registro ja nao existia na plataforma.", "")   // executada
				aTotal[2] += 1

			Else

				aTotal[3] += 1

				If nHttp == 400 .Or. nHttp == 404 .Or. nHttp == 409 .Or. nHttp == 422

					// Erro de DADO (processamento): e daquele registro. Fica com
					// erro ("3"), visivel no monitor, e o resto segue - um vendedor
					// inexistente num titulo segurou 104 mil mensagens em 25/09/2026.
					// So volta pelo Reenviar do lote, depois de corrigido o dado.
					U_BJGRAVA(aFila[nX][6], aFila[nX][1], "3", nHttp, cErro, "")   // erro
					FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", ;
						"Mensagem " + aFila[nX][1] + " (entidade " + aFila[nX][2] + ") do lote " + cLote + " recusada: " + cErro, 0, 0, {})

				Else

					// Erro de API ou rede: nao e da mensagem, e vale para todas as
					// seguintes. Ela continua PENDENTE ("1", com a falha anotada) e
					// o proximo envio tenta de novo sozinho - marcar "3" encheria os
					// lotes de erro a cada queda da API, e so o Reenviar manual os
					// tiraria de la. Para a chamada.
					U_BJGRAVA(aFila[nX][6], aFila[nX][1], "1", nHttp, "Falha de API/rede, sera tentada de novo: " + cErro, "")   // continua pendente
					ConOut("[BJPLA] U_BJDRENA parou - HTTP " + cValToChar(nHttp) + " na mensagem " + aFila[nX][1] + ;
						" do lote " + cLote + ": " + cErro)
					lParou := .T.
					Exit

				EndIf

			EndIf

			Sleep(nPausa)

			If nX % 50 == 0
				U_BJBATIDA(cInicio, "lote " + cLote + " (peso " + cValToChar(nPrior) + ") - enviando, " + ;
					cValToChar(nX) + " de " + cValToChar(Len(aFila)))
			EndIf

		Next nX

		// Fecha o lote se nao sobrou pendente; senao ele fica aberto e volta
		// quando for a vez dele.
		BJFechaEnv(cLote)

	End

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Drenagem concluida - lidas: " + cValToChar(aTotal[1]) + ;
		" enviadas: " + cValToChar(aTotal[2]) + ;
		" erros: " + cValToChar(aTotal[3]) + " em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s", 0, 0, {})

	ConOut("[BJPLA] U_BJDRENA fim - lidas: " + cValToChar(aTotal[1]) + " enviadas: " + cValToChar(aTotal[2]) + ;
		" superadas: " + cValToChar(nSuper) + " erros: " + cValToChar(aTotal[3]) + ;
		" em " + cValToChar(Round(Seconds() - nSeg, 0)) + "s" + Iif(lParou, " (interrompido)", ""))

	U_BJBATIDA()
	UnLockByName(cTrava, .T., .F.)

Return aTotal

/*/{Protheus.doc} BJFechaEnv
Atualiza o lote (SZY) pelo que sobrou dele na fila de saida.
Conta as mensagens de saida do lote por status: sem pendente ("1"), o lote
fecha - "3" se ficou alguma com erro, "2" se nao. Com pendente, o status fica
como esta e o lote volta quando for a vez dele. Contar na SZZ, e nao somar o
que esta chamada enviou, e o que da o numero certo depois de varias fatias e
varias chamadas.
@type    Static Function
@author  Ricardo P Sotomayor
@since   26/09/2026
@param   cLote, character, ZY_CODIGO do lote
@return  Nil
/*/
Static Function BJFechaEnv(cLote)

	Local aArea  := GetArea()
	Local cQuery := ""
	Local cAlias := ""
	Local oStmt  := Nil
	Local nPend  := 0
	Local nErr   := 0
	Local nOk    := 0

	cQuery := "SELECT ZZ_STATUS, COUNT(*) AS QTD "
	cQuery += "  FROM " + RetSqlName("SZZ") + " SZZ "
	cQuery += " WHERE SZZ.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SZZ.ZZ_FILIAL  = ? "
	cQuery += "   AND SZZ.ZZ_CODIGO  = ? "
	cQuery += "   AND SZZ.ZZ_TIPO    = 'S' "
	cQuery += " GROUP BY ZZ_STATUS "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, xFilial("SZZ"))
	oStmt:SetString(2, PadR(cLote, TamSX3("ZZ_CODIGO")[1]))

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())
		If (cAlias)->ZZ_STATUS == "1"
			nPend := (cAlias)->QTD
		ElseIf (cAlias)->ZZ_STATUS == "3"
			nErr := (cAlias)->QTD
		ElseIf (cAlias)->ZZ_STATUS == "2"
			nOk := (cAlias)->QTD
		EndIf
		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

	dbSelectArea("SZY")
	SZY->(dbSetOrder(1))   // ZY_FILIAL + ZY_CODIGO

	If SZY->(dbSeek(xFilial("SZY") + PadR(cLote, TamSX3("ZY_CODIGO")[1])))

		RecLock("SZY", .F.)

		SZY->ZY_DTFIM  := Date()
		SZY->ZY_HRFIM  := Time()
		SZY->ZY_QTDENV := nOk
		SZY->ZY_QTDERR := nErr

		If nPend == 0
			If nErr > 0
				SZY->ZY_STATUS := "3"   // saiu tudo que dava; ficou erro
			Else
				SZY->ZY_STATUS := "2"   // processado
			EndIf
		EndIf

		SZY->(MsUnlock())

	EndIf

	RestArea(aArea)

Return Nil

/*/{Protheus.doc} BJSuperada
Diz se a mensagem ja foi superada por outra, da mesma chave, em lote mais novo.
Lote de codigo maior e coleta mais recente, entao a mensagem dele carrega o
estado mais novo do registro. Sem esta checagem, uma carga enviada depois do
dia a dia sobrescreveria na plataforma um titulo baixado ontem com o estado de
antes da baixa. Usa o indice 3 da SZZ para nao varrer a fila.
@type    Static Function
@author  Ricardo P Sotomayor
@since   26/09/2026
@param   cLote , character, ZY_CODIGO do lote da mensagem
@param   cEntid, character, Id da entidade no catalogo
@param   cChave, character, ZZ_CHVORI como esta gravado, com os espacos
@return  character, Codigo do lote mais novo com a mesma chave; vazio se nao ha
/*/
Static Function BJSuperada(cLote, cEntid, cChave)

	Local aArea    := GetArea()
	Local aAreaSZZ := SZZ->(GetArea())
	Local cNovo    := ""
	Local cBusca   := xFilial("SZZ") + "S" + PadR(cEntid, TamSX3("ZZ_ENTID")[1]) + cChave
	Local cLotePad := PadR(cLote, TamSX3("ZZ_CODIGO")[1])

	SZZ->(dbSetOrder(3))   // ZZ_FILIAL + ZZ_TIPO + ZZ_ENTID + ZZ_CHVORI

	If SZZ->(dbSeek(cBusca))
		While SZZ->(!Eof()) .And. SZZ->(ZZ_FILIAL + ZZ_TIPO + ZZ_ENTID + ZZ_CHVORI) == cBusca
			If SZZ->ZZ_CODIGO > cLotePad
				cNovo := AllTrim(SZZ->ZZ_CODIGO)
				Exit
			EndIf
			SZZ->(dbSkip())
		End
	EndIf

	RestArea(aAreaSZZ)
	RestArea(aArea)

Return cNovo

// ===========================================================================
// LOTE
// ===========================================================================

/*/{Protheus.doc} BJLOTE
Envia a fila de saida em blocos por PUT, agrupados por entidade.
@type    User Function
@author  Ricardo P Sotomayor
@since   09/09/2026
@param   nLimite, numeric, Maximo de mensagens lidas da fila nesta passada. Zero le tudo
@param   oProcess, object, MsNewProcess do monitor, para as reguas. Nil no agendamento
@return  array, {nLidas, nEnviadas, nErros}
@example aTotal := U_BJLOTE(0)
/*/
User Function BJLOTE(nLimite, oProcess)

	Local aTotal    := {0, 0, 0}
	Local aFila     := {}
	Local aCat      := U_BJCATALO()
	Local aLote     := {}
	Local aRegistro := {}
	Local aErroIdx  := {}
	Local aErro     := Nil
	Local oReg      := Nil
	Local oEnv      := Nil
	Local oErro     := Nil
	Local cBody     := ""
	Local cResp     := ""
	Local cErro     := ""
	Local nHttp     := 0
	Local nPosCat   := 0
	Local nIni      := 0
	Local nFim      := 0
	Local nIdx      := 0
	Local nPos      := 0
	Local nE        := 0
	Local nL        := 0
	Local aLotes    := {}
	Local cStatus   := ""
	Local cTrava    := "BJPLA_ENVIO"
	Local cInicio   := ""
	Local lOk       := .F.
	Local nT0       := 0
	Local nT1       := 0
	Local nT2       := 0
	Local nX        := 0

	// Parametros lidos aqui, uma vez: dentro dos lacos seriam uma leitura por bloco
	Local nPausa   := GetMV("MV_BJAPI08")   // ms entre requisicoes
	Local nLoteMax := GetMV("MV_BJAPI09")   // registros por PUT

	Default nLimite := 0

	If !AllTrim(Upper(GetMV("MV_BJAPI03"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Lote nao enviado.", 0, 0, {})
		Return aTotal
	EndIf

	// A mesma trava do BJDRENA: os dois leem as mesmas pendentes, e rodando
	// juntos mandariam o mesmo registro duas vezes.
	If !LockByName(cTrava, .T., .F.)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Envio ja em andamento. Envio em bloco ignorado.", 0, 0, {})
		Return aTotal
	EndIf

	cInicio := DtoS(Date()) + " " + Time()
	U_BJBATIDA(cInicio, "em bloco - procurando lotes em aberto")

	// Os lotes em aberto, na ordem do codigo, e dentro de cada um so o que falta
	// sair. Os dois lacos usam o status na frente da chave, entao nada ja
	// executado e lido.
	dbSelectArea("SZY")
	SZY->(dbSetOrder(2))   // ZY_FILIAL + ZY_STATUS + ZY_CODIGO

	For nX := 1 To 2

		If nX == 1
			cStatus := "1"   // nao processado
		Else
			cStatus := "3"   // parou com erro
		EndIf

		If SZY->(dbSeek(xFilial("SZY") + cStatus))
			While SZY->(!Eof()) .And. SZY->ZY_FILIAL == xFilial("SZY") .And. ;
				SZY->ZY_STATUS == cStatus

				aAdd(aLotes, AllTrim(SZY->ZY_CODIGO))
				SZY->(dbSkip())
			End
		EndIf

	Next nX

	aSort(aLotes)

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(2))   // ZZ_FILIAL + ZZ_CODIGO + ZZ_STATUS + ZZ_SEQUEN

	For nL := 1 To Len(aLotes)

		For nX := 1 To 2

			If nX == 1
				cStatus := "1"   // pendente
			Else
				cStatus := "3"   // com erro
			EndIf

			If SZZ->(dbSeek(xFilial("SZZ") + PadR(aLotes[nL], TamSX3("ZZ_CODIGO")[1]) + cStatus))

				While SZZ->(!Eof()) .And. SZZ->ZZ_FILIAL == xFilial("SZZ") .And. ;
					AllTrim(SZZ->ZZ_CODIGO) == aLotes[nL] .And. SZZ->ZZ_STATUS == cStatus

					If nLimite > 0 .And. Len(aFila) >= nLimite
						Exit
					EndIf

					If SZZ->ZZ_TIPO == "S"
						nPosCat := aScan(aCat, {|c| c[1] == AllTrim(SZZ->ZZ_ENTID)})
						If nPosCat == 0
							nPosCat := 999
						EndIf
						aAdd(aFila, {SZZ->ZZ_SEQUEN, AllTrim(SZZ->ZZ_ENTID), AllTrim(SZZ->ZZ_CHVORI), ;
							AllTrim(SZZ->ZZ_VERBO), SZZ->ZZ_JSON, AllTrim(SZZ->ZZ_CODIGO), nPosCat})

						If Len(aFila) % 5000 == 0
							U_BJBATIDA(cInicio, "em bloco - lendo a fila, " + cValToChar(Len(aFila)) + " lidas")
						EndIf
					EndIf

					SZZ->(dbSkip())
				End

			EndIf

		Next nX

	Next nL

	U_BJBATIDA(cInicio, "em bloco - ordenando " + cValToChar(Len(aFila)) + " mensagens")

	// Lote e sequencia: a ordem em que as mensagens nasceram, ajustada pela ordem de dependencias do catalogo.
	// A posicao no catalogo ja vem no elemento 7: um bloco aninhado ({|c| c[1] == x[2]}) nao enxerga o x
	// do bloco de fora e cai em "variable does not exist X".
	aSort(aFila, , , {|x, y| ;
		Iif(x[7] != y[7], x[7] < y[7], x[6] + x[1] < y[6] + y[1]) ;
	})

	aTotal[1] := Len(aFila)

	If Len(aFila) == 0
		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Nada pendente na fila de saida.", 0, 0, {})
		U_BJBATIDA()
		UnLockByName(cTrava, .T., .F.)
		Return aTotal
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Lote - " + cValToChar(Len(aFila)) + " mensagens de saida na fila.", 0, 0, {})

	// Regua 1 por entidade do catalogo, regua 2 pelos blocos de PUT dela. So o
	// monitor passa oProcess; no agendamento nao ha tela.
	If ValType(oProcess) == "O"
		oProcess:SetRegua1(Len(aCat))
	EndIf

	For nE := 1 To Len(aCat)

		If ValType(oProcess) == "O"
			oProcess:IncRegua1(aCat[nE][2] + " - " + cValToChar(nE) + " de " + cValToChar(Len(aCat)) + "...")
		EndIf

		If !aCat[nE][5] .Or. "{chave}" $ aCat[nE][3]
			Loop
		EndIf

		// As mensagens desta entidade, na ordem em que ja estao na fila
		aLote := {}

		For nX := 1 To Len(aFila)
			If aFila[nX][2] == aCat[nE][1]
				aAdd(aLote, aFila[nX])
			EndIf
		Next nX

		If Len(aLote) == 0
			Loop
		EndIf

		If ValType(oProcess) == "O"
			oProcess:SetRegua2(Int((Len(aLote) + nLoteMax - 1) / nLoteMax))
		EndIf

		nIni := 1

		While nIni <= Len(aLote)

			nFim      := Min(nIni + nLoteMax - 1, Len(aLote))
			aRegistro := {}

			If ValType(oProcess) == "O"
				If oProcess:lEnd
					FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Envio em bloco interrompido pelo usuario.", 0, 0, {})
					Exit
				EndIf
				oProcess:IncRegua2("Registros " + cValToChar(nIni) + " a " + cValToChar(nFim) + " de " + cValToChar(Len(aLote)) + ". " + ;
					Transform(Round(nFim * 100 / Len(aLote), 2), "@E 999.99") + "%")
			EndIf

			nT0 := Seconds()

			For nX := nIni To nFim

				oReg := JsonObject():New()

				If aLote[nX][4] == "DELETE"
					// A API dispensa os demais campos quando excluido vem true - basta a chave.
					oReg["chave"]     := aLote[nX][3]
					oReg["excluido"]  := .T.
				Else
					oReg:FromJson(aLote[nX][5])
				EndIf

				aAdd(aRegistro, oReg)

			Next nX

			oEnv  := JsonObject():New()
			oEnv["registros"] := aRegistro
			cBody := oEnv:ToJson()

			// Tres tempos por bloco, para saber onde a carga gasta: montar o JSON
			// aqui, a API processar o PUT, e gravar o resultado de cada mensagem.
			nT1 := Seconds()
			lOk := U_BJHTTP("PUT", aCat[nE][3], cBody, @cResp, @nHttp, @cErro)
			nT2 := Seconds()

			If lOk

				oErro := JsonObject():New()

				If oErro:FromJson(cResp) == Nil

					aErroIdx := {}
					aErro    := oErro:GetJsonObject("erros")

					If ValType(aErro) == "A"
						For nX := 1 To Len(aErro)
							aAdd(aErroIdx, {aErro[nX]:GetJsonObject("indice"), aErro[nX]:GetJsonObject("mensagem")})
						Next nX
					EndIf

					For nX := nIni To nFim
						nIdx := nX - nIni   // posicao do registro no array enviado, base zero
						nPos := aScan(aErroIdx, {|x| x[1] == nIdx})

						If nPos > 0
							U_BJGRAVA(aLote[nX][6], aLote[nX][1], "3", nHttp, aErroIdx[nPos][2], "")   // erro
							aTotal[3] += 1
						Else
							U_BJGRAVA(aLote[nX][6], aLote[nX][1], "2", nHttp, "Lote HTTP " + cValToChar(nHttp) + " - sem erro para este registro.", "")   // executada
							aTotal[2] += 1
						EndIf
					Next nX

				Else

					// HTTP 2xx mas o corpo nao veio no formato esperado: sem o relatorio
					// por indice ninguem sabe o que realmente entrou, entao nenhuma
					// mensagem deste bloco e marcada como executada por suposicao.
					For nX := nIni To nFim
						U_BJGRAVA(aLote[nX][6], aLote[nX][1], "3", nHttp, "Resposta do lote em formato inesperado: " + cResp, "")   // erro
						aTotal[3] += 1
					Next nX

				EndIf

			Else

				// Envelope recusado (lote vazio, acima do maximo, registro sem
				// chave) ou falha de rede apos as retentativas do BJHTTP: nada
				// deste bloco foi gravado do lado da plataforma.
				For nX := nIni To nFim
					U_BJGRAVA(aLote[nX][6], aLote[nX][1], "3", nHttp, cErro, "")   // erro
					aTotal[3] += 1
				Next nX

			EndIf

			FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Lote " + aCat[nE][1] + " - bloco " + cValToChar(nIni) + " a " + ;
				cValToChar(nFim) + " de " + cValToChar(Len(aLote)) + " - HTTP " + cValToChar(nHttp), 0, 0, {})

			U_BJBATIDA(cInicio, "em bloco - " + aCat[nE][1] + ", " + cValToChar(nFim) + " de " + cValToChar(Len(aLote)))

			ConOut("[BJPLA] Enviar em bloco - " + aCat[nE][1] + " " + cValToChar(nIni) + " a " + cValToChar(nFim) + ;
				" de " + cValToChar(Len(aLote)) + " - HTTP " + cValToChar(nHttp) + ;
				" - montar " + cValToChar(Round(nT1 - nT0, 1)) + "s" + ;
				" | API " + cValToChar(Round(nT2 - nT1, 1)) + "s" + ;
				" | gravar " + cValToChar(Round(Seconds() - nT2, 1)) + "s" + ;
				" | " + cValToChar(Round(Len(cBody) / 1024, 0)) + " KB")

			Sleep(nPausa)

			nIni := nFim + 1

		End

	Next nE

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Lote concluido - enviadas: " + cValToChar(aTotal[2]) + ;
		" erros: " + cValToChar(aTotal[3]), 0, 0, {})

	// Fecha os lotes que este envio tocou e que ficaram sem pendente. Antes o
	// Enviar em Bloco nunca fechava: o lote ficava amarelo no browse com tudo
	// ja enviado.
	aLotes := {}

	For nX := 1 To Len(aFila)
		If aScan(aLotes, {|c| c == aFila[nX][6]}) == 0
			aAdd(aLotes, aFila[nX][6])
		EndIf
	Next nX

	For nX := 1 To Len(aLotes)
		BJFechaEnv(aLotes[nX])
	Next nX

	U_BJBATIDA()
	UnLockByName(cTrava, .T., .F.)

Return aTotal

/*/{Protheus.doc} BJIdPlat
Extrai da resposta o id que a plataforma atribuiu ao registro.
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

/*/{Protheus.doc} BJEXPTOARQ
Exporta as mensagens de um lote da SZZ para um arquivo TXT em disco e atualiza o status na SZY e SZZ.
@type    User Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@param   cSeqMae , character, ZY_CODIGO do lote a exportar
@param   cCaminho, character, Caminho completo do arquivo TXT destino
@return  array, {nLidas, nExportadas, nErros}
@example aTot := U_BJEXPTOARQ("000000001", "C:\temp\lote.txt")
/*/
User Function BJEXPTOARQ(cSeqMae, cCaminho)

	Local aTotal    := {0, 0, 0}
	Local cQuery    := ""
	Local cAlias    := ""
	Local cLine     := ""
	Local nHandle   := -1
	Local oStmt     := Nil

	Default cSeqMae  := ""
	Default cCaminho := ""

	If Empty(cSeqMae) .Or. Empty(cCaminho)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Parametros invalidos para exportacao em TXT.", 0, 0, {})
		Return aTotal
	EndIf

	nHandle := fCreate(cCaminho)

	If nHandle < 0
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Nao foi possivel criar o arquivo: " + cCaminho, 0, 0, {})
		aTotal[3] += 1
		Return aTotal
	EndIf

	cQuery := "SELECT ZZ_FILIAL, ZZ_CODIGO, ZZ_SEQUEN, ZZ_TIPO, ZZ_ENTID, ZZ_CHVORI, ZZ_VERBO, ZZ_JSON "
	cQuery += "  FROM " + RetSqlName("SZZ") + " SZZ "
	cQuery += " WHERE SZZ.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SZZ.ZZ_FILIAL  = ? "
	cQuery += "   AND SZZ.ZZ_CODIGO  = ? "
	cQuery += " ORDER BY ZZ_SEQUEN "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, xFilial("SZZ"))
	oStmt:SetString(2, PadR(cSeqMae, TamSX3("ZZ_CODIGO")[1]))

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())
		aTotal[1] += 1

		cLine := '{"lote":"' + AllTrim((cAlias)->ZZ_CODIGO) + '",'
		cLine += '"seq":"' + AllTrim((cAlias)->ZZ_SEQUEN) + '",'
		cLine += '"entidade":"' + AllTrim((cAlias)->ZZ_ENTID) + '",'
		cLine += '"verbo":"' + AllTrim((cAlias)->ZZ_VERBO) + '",'
		cLine += '"chave":"' + AllTrim((cAlias)->ZZ_CHVORI) + '",'
		cLine += '"payload":' + AllTrim((cAlias)->ZZ_JSON) + '}' + CRLF

		If fWrite(nHandle, cLine) > 0
			aTotal[2] += 1
			// Marca a mensagem como executada/exportada
			U_BJGRAVA((cAlias)->ZZ_CODIGO, (cAlias)->ZZ_SEQUEN, "2", 200, "Exportado para arquivo TXT: " + cCaminho, "")
		Else
			aTotal[3] += 1
			U_BJGRAVA((cAlias)->ZZ_CODIGO, (cAlias)->ZZ_SEQUEN, "3", 500, "Erro ao gravar no arquivo TXT: " + cCaminho, "")
		EndIf

		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()
	fClose(nHandle)

	// Se exportou e nao teve erro, atualiza a SZY
	dbSelectArea("SZY")
	SZY->(dbSetOrder(1)) // ZY_FILIAL + ZY_CODIGO
	If SZY->(dbSeek(xFilial("SZY") + PadR(cSeqMae, TamSX3("ZY_CODIGO")[1])))
		RecLock("SZY", .F.)
		SZY->ZY_DTFIM  := Date()
		SZY->ZY_HRFIM  := Time()
		SZY->ZY_QTDENV := aTotal[2]
		SZY->ZY_QTDERR := aTotal[3]
		If aTotal[3] == 0
			SZY->ZY_STATUS := "2" // Processado
		Else
			SZY->ZY_STATUS := "3" // Erro
		EndIf
		SZY->(MsUnlock())
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Exportacao concluida - Lote " + cSeqMae + " - Exportadas: " + cValToChar(aTotal[2]) + " Erros: " + cValToChar(aTotal[3]), 0, 0, {})

Return aTotal

/*/{Protheus.doc} BJIMPDOARQ
Importa mensagens de um arquivo TXT gerado pela Plataforma BJ e enfileira/executa na SZY/SZZ.
@type    User Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@param   cCaminho, character, Caminho completo do arquivo TXT a importar
@return  array, {nLidos, nEnfileirados, nErros}
@example aTot := U_BJIMPDOARQ("C:\temp\import.txt")
/*/
User Function BJIMPDOARQ(cCaminho)

	Local aTotal    := {0, 0, 0}
	Local cLine     := ""
	Local cSeqMae   := ""
	Local cQuerySeq := ""
	Local cAliasSeq := ""
	Local cEntidad  := ""
	Local cVerbo    := ""
	Local cChave    := ""
	Local cPayload  := ""
	Local nTamSeq   := 0
	Local oStmtSeq  := Nil
	Local oJson     := Nil
	Local oPayload  := Nil

	Default cCaminho := ""

	If Empty(cCaminho) .Or. !File(cCaminho)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Arquivo de importacao invalido ou inexistente: " + cCaminho, 0, 0, {})
		Return aTotal
	EndIf

	// Abre novo lote SZY para a importacao
	nTamSeq := TamSX3("ZY_CODIGO")[1]
	If nTamSeq <= 0
		nTamSeq := 9
	EndIf

	cQuerySeq := "SELECT MAX(ZY_CODIGO) AS MAXSEQ FROM " + RetSqlName("SZY") + " SZY WHERE SZY.D_E_L_E_T_ = ' ' AND SZY.ZY_FILIAL = ? "
	oStmtSeq  := FWExecStatement():New(ChangeQuery(cQuerySeq))
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

	// Le arquivo linha por linha usando FT_FUse
	FT_FUse(cCaminho)
	FT_FGoTop()

	While !FT_FEOF()
		cLine := AllTrim(FT_FReadLN())
		If !Empty(cLine)
			aTotal[1] += 1
			oJson := JsonObject():New()
			If oJson:FromJson(cLine) == Nil
				cEntidad := AllTrim(cValToChar(oJson:GetJsonObject("entidade")))
				cVerbo   := AllTrim(cValToChar(oJson:GetJsonObject("verbo")))
				cChave   := AllTrim(cValToChar(oJson:GetJsonObject("chave")))
				oPayload := oJson:GetJsonObject("payload")

				If ValType(oPayload) == "J"
					cPayload := oPayload:ToJson()
				Else
					cPayload := AllTrim(cValToChar(oPayload))
				EndIf

				If Empty(cVerbo)
					cVerbo := "POST"
				EndIf

				If U_BJENFILA(cSeqMae, "E", cEntidad, cChave, cVerbo, cPayload)
					aTotal[2] += 1
				Else
					aTotal[3] += 1
				EndIf
			Else
				aTotal[3] += 1
			EndIf
			oJson := Nil
		EndIf
		FT_FSKIP()
	End

	FT_FUse()

	// Atualiza lote SZY
	dbSelectArea("SZY")
	SZY->(dbSetOrder(1))
	If SZY->(dbSeek(xFilial("SZY") + cSeqMae))
		RecLock("SZY", .F.)
		SZY->ZY_DTFIM   := Date()
		SZY->ZY_HRFIM   := Time()
		SZY->ZY_QTDLIDO := aTotal[1]
		SZY->ZY_QTDENV  := aTotal[2]
		SZY->ZY_QTDERR  := aTotal[3]
		If aTotal[3] == 0
			SZY->ZY_STATUS := "2"
		Else
			SZY->ZY_STATUS := "3"
		EndIf
		SZY->(MsUnlock())
	EndIf

	// Processa mensagens de entrada recebidas
	If aTotal[2] > 0
		U_BJRETORNO()
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Importacao de arquivo concluida - Lote " + cSeqMae + " - Lidos: " + cValToChar(aTotal[1]) + " Enfileirados: " + cValToChar(aTotal[2]), 0, 0, {})

Return aTotal


