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
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  array, {nLidos, nAplicados, nIgnorados, nErros}
@example aTot := U_BJRETORNO()
/*/
User Function BJRETORNO()

	Local aTotal    := {0, 0, 0, 0}
	Local cSeqMae   := ""
	Local cQuerySeq := ""
	Local cAliasSeq := ""
	Local oStmtSeq  := Nil
	Local nTamSeq   := 0
	Local cPasta    := SuperGetMV("MV_BJAPI12", .F., "\bjapi\")   // pasta dos semaforos
	Local cArqLock  := ""
	Local nSeg      := Seconds()

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Nada a receber.", 0, 0, {})
		Return aTotal
	EndIf

	// Um retorno por vez, venha do agendamento ou do monitor.
	cArqLock := cPasta + cEmpAnt + "\bjpla-retorno.tsk"

	MakeDir(cPasta)
	MakeDir(cPasta + cEmpAnt + "\")

	If File(cArqLock)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Retorno ja em andamento. Chamada ignorada.", 0, 0, {})
		Return aTotal
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	// Abre o lote (SZY) deste retorno - cobre orcamentos-pendentes e
	// clientes-alteracoes juntos, ja que as duas sao lidas na mesma chamada. A SZY
	// nao tem campo de entidade; quem identifica cada mensagem e o ZZ_ENTID no
	// detalhe (SZZ), gravado por BJLeOrcam/BJLeAltCli via U_BJENFILA.
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

	BJLeOrcam(@aTotal, cSeqMae)
	BJLeAltCli(@aTotal, cSeqMae)

	// Fecha o lote com fim, status e contadores
	dbSelectArea("SZY")
	SZY->(dbSetOrder(1)) // ZY_FILIAL + ZY_CODIGO

	If SZY->(dbSeek(xFilial("SZY") + cSeqMae))
		RecLock("SZY", .F.)
		SZY->ZY_DTFIM   := Date()
		SZY->ZY_HRFIM   := Time()
		SZY->ZY_QTDLIDO := aTotal[1]
		SZY->ZY_QTDENV  := aTotal[2]
		SZY->ZY_QTDERR  := aTotal[4]

		If aTotal[4] == 0
			SZY->ZY_STATUS := "2"
		Else
			SZY->ZY_STATUS := "3"
		EndIf

		SZY->(MsUnlock())
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Retorno concluido - lote " + cSeqMae + " - lidos: " + cValToChar(aTotal[1]) + ;
		" aplicados: " + cValToChar(aTotal[2]) + ;
		" ignorados: " + cValToChar(aTotal[3]) + ;
		" erros: " + cValToChar(aTotal[4]) + " em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s", 0, 0, {})

	If File(cArqLock)
		FErase(cArqLock)
	EndIf

Return aTotal

/*/{Protheus.doc} BJLeOrcam
Le a fila de orcamentos pendentes da plataforma e trata um a um.
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aTotal , array    , [Referencia] Totalizadores
@param   cSeqMae, character, ZY_CODIGO do lote (SZY) deste retorno
@return  Nil
/*/
Static Function BJLeOrcam(aTotal, cSeqMae)

	Local cRota  := ""
	Local cResp  := ""
	Local cErro  := ""
	Local nHttp  := 0
	Local nPage  := 1
	Local nX     := 0
	Local lSegue := .T.
	Local oJson  := Nil
	Local aDados := {}

	While lSegue

		cRota := "/integracao/orcamentos/pendentes" + "?pageSize=100&page=" + cValToChar(nPage)

		If !U_BJHTTP("GET", cRota, "", @cResp, @nHttp, @cErro)
			FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Falha ao listar orcamentos pendentes: " + cErro, 0, 0, {})
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

		For nX := 1 To Len(aDados)
			aTotal[1] += 1
			BJTrataOrc(aDados[nX], @aTotal, cSeqMae)
		Next nX

		// Pagina incompleta e a ultima
		If Len(aDados) < 100
			lSegue := .F.
		EndIf

		nPage += 1
		oJson := Nil

	End

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
	Local cArqLock := ""
	Local cPasta   := ""

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

		If BJVincula(cIdPlat, cNumPed)
			aTotal[2] += 1
		Else
			aTotal[4] += 1
		EndIf

		Return Nil
	EndIf

	cPasta   := SuperGetMV("MV_BJAPI12", .F., "\bjapi\")   // pasta dos semaforos
	cArqLock := cPasta + cEmpAnt + "\bjpla-orc-" + Lower(AllTrim(cIdPlat)) + ".tsk"

	MakeDir(cPasta)
	MakeDir(cPasta + cEmpAnt + "\")

	// Um processo por orcamento: se o arquivo existir, outro processo ja esta tratando este orcamento.
	If File(cArqLock)
		aTotal[3] += 1
		Return Nil
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	// A mensagem entra na fila com o payload que veio. A partir daqui existe
	// rastro, mesmo que tudo falhe depois.
	cSeq := U_BJENFILA("E", "orcamentos-pendentes", cIdPlat, "GET", oOrc:ToJson(), cSeqMae)

	If Empty(cSeq)
		aTotal[4] += 1
		If File(cArqLock)
			FErase(cArqLock)
		EndIf
		Return Nil
	EndIf

	cNumPed := BJGeraPed(oOrc, cIdPlat, cSeq, cSeqMae)

	If Empty(cNumPed)
		aTotal[4] += 1
		If File(cArqLock)
			FErase(cArqLock)
		EndIf
		Return Nil
	EndIf

	If BJVincula(cIdPlat, cNumPed)
		aTotal[2] += 1
	Else
		// O orcamento existe e a mensagem esta marcada como executada. O vinculo
		// volta a ser tentado no proximo ciclo, pelo caminho do passo 2.
		aTotal[4] += 1
	EndIf

	If File(cArqLock)
		FErase(cArqLock)
	EndIf

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

	cChvCli := AllTrim(cValToChar(oOrc:GetJsonObject("clienteCodigo")))
	cVend   := AllTrim(cValToChar(oOrc:GetJsonObject("vendedorCodigo")))
	cCond   := AllTrim(cValToChar(oOrc:GetJsonObject("condicaoPagamentoCodigo")))
	cObs    := AllTrim(cValToChar(oOrc:GetJsonObject("observacao")))
	aItJson := oOrc:GetJsonObject("itens")

	// vendedorCodigo e condicaoPagamentoCodigo voltam prefixados pela filial
	// (01-000234); o pedido guarda so o codigo.
	If At("-", cVend) > 0
		cVend := SubStr(cVend, At("-", cVend) + 1)
	EndIf

	If At("-", cCond) > 0
		cCond := SubStr(cCond, At("-", cCond) + 1)
	EndIf

	If Empty(cChvCli) .Or. ValType(aItJson) != "A" .Or. Len(aItJson) == 0
		BJErroOrc(cSeqMae, cSeq, cIdPlat, "Orcamento sem cliente ou sem itens. Pedido nao foi criado.")
		RestArea(aArea)
		Return ""
	EndIf

	// O clienteCodigo volta como saiu daqui: filial-codigo-loja, separados por
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

		cProd  := AllTrim(cValToChar(aItJson[nX]:GetJsonObject("produtoCodigo")))
		nQtd   := aItJson[nX]:GetJsonObject("quantidade")
		nPreco := aItJson[nX]:GetJsonObject("vlrUnitario")

		// O produtoCodigo volta prefixado pela filial (01-11400443); a SB1 guarda
		// so o B1_COD.
		If At("-", cProd) > 0
			cProd := SubStr(cProd, At("-", cProd) + 1)
		EndIf

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
@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cIdPlat, character, Id interno da plataforma (UUID)
@param   cNumPed, character, C5_NUM do pedido criado
@return  logical, .T. quando a plataforma aceitou o vinculo
/*/
Static Function BJVincula(cIdPlat, cNumPed)

	Local lRet  := .F.
	Local cResp := ""
	Local cErro := ""
	Local nHttp := 0
	Local oJson := Nil

	oJson := JsonObject():New()
	oJson["codigoErp"] := xFilial("SC5") + "-" + AllTrim(cNumPed)

	lRet := U_BJHTTP("PATCH", "/integracao/orcamentos/pendentes" + "/" + AllTrim(cIdPlat), oJson:ToJson(), @cResp, @nHttp, @cErro)

	oJson := Nil

	If lRet
		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento da plataforma " + cIdPlat + " vinculado ao orcamento " + ;
			cNumPed + " do ERP.", 0, 0, {})
	Else
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Falha ao vincular " + cIdPlat + " ao orcamento " + cNumPed + ;
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
	cChvCli := AllTrim(cValToChar(oAlt:GetJsonObject("clienteCodigo")))

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

	// O clienteCodigo volta prefixado pela filial, como saiu daqui.
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
	aAdd(aMapa, {"vendedorCodigo"         , "A1_VEND"   , "R"})
	aAdd(aMapa, {"tabelaPrecoCodigo"      , "A1_TABELA" , "R"})
	aAdd(aMapa, {"condicaoPagamentoCodigo", "A1_COND"   , "R"})
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
				// Referencia a outra entidade: volta prefixada pela filial, como
				// saiu daqui (01-000234). A SA1 guarda so o codigo.
				cTexto := AllTrim(cValToChar(xValor))

				If At("-", cTexto) > 0
					cTexto := SubStr(cTexto, At("-", cTexto) + 1)
				EndIf

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
Envia as mensagens de saida que estao na fila, lote a lote.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   nLimite, numeric, Maximo de mensagens por lote nesta passada. Zero drena tudo
@param   cSeqMae, character, ZY_CODIGO do lote a drenar. Vazio percorre os lotes em aberto
@return  array, {nLidas, nEnviadas, nErros}
@example aTot := U_BJDRENA(0)
/*/
User Function BJDRENA(nLimite, cSeqMae)

	Local aTotal  := {0, 0, 0}
	Local aLotes  := {}
	Local aFila   := {}
	Local aCat    := U_BJCATALO()
	Local aEnt    := {}
	Local cLote   := ""
	Local cStatus := ""
	Local cQuery  := ""
	Local cAlias  := ""
	Local oStmt   := Nil
	Local cRota   := ""
	Local cResp   := ""
	Local cErro   := ""
	Local nHttp   := 0
	Local nPos    := 0
	Local nErrLot := 0
	Local nL      := 0
	Local nX      := 0

	// Parametros lidos aqui, uma vez: dentro dos lacos seriam uma leitura por
	// mensagem enviada.
	Local nPausa   := SuperGetMV("MV_BJAPI08", .F., 1050)   // ms entre requisicoes
	Local cPasta   := SuperGetMV("MV_BJAPI12", .F., "\bjapi\")   // pasta dos semaforos
	Local cArqLock := ""
	Local nSeg     := Seconds()

	Default nLimite := 0
	Default cSeqMae := ""

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Fila nao drenada.", 0, 0, {})
		Return aTotal
	EndIf

	// Um envio por vez, venha do agendamento ou do monitor: os dois chamam esta
	// funcao. O semaforo e um arquivo; se existir, outro ja esta rodando.
	cArqLock := cPasta + cEmpAnt + "\bjpla-envio.tsk"

	MakeDir(cPasta)
	MakeDir(cPasta + cEmpAnt + "\")

	If File(cArqLock)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Envio ja em andamento. Chamada ignorada.", 0, 0, {})
		Return aTotal
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	If Empty(cSeqMae)

		// Os lotes que ainda precisam sair: "1" nao processado e "3" parou com erro.
		// O indice 2 (ZY_FILIAL + ZY_STATUS + ZY_CODIGO) poe o status antes do
		// codigo, entao o dbSeek cai direto no primeiro lote de cada status e lote
		// ja processado nem e lido. Duas passadas, uma por status, e depois a ordem
		// de processamento e restaurada pelo codigo.
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

	Else

		aAdd(aLotes, AllTrim(cSeqMae))

	EndIf

	If Len(aLotes) == 0
		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Nenhum lote em aberto na fila de saida.", 0, 0, {})
		FErase(cArqLock)
		Return aTotal
	EndIf

	For nL := 1 To Len(aLotes)

		cLote   := aLotes[nL]
		aFila   := {}
		nErrLot := 0

		// So o que falta sair deste lote. O indice 2 poe o status antes da sequencia
		// (ZZ_FILIAL + ZZ_CODIGO + ZZ_STATUS + ZZ_SEQUEN), entao o dbSeek cai direto
		// no primeiro pendente e mensagem ja executada nem e lida: num lote de 5.000
		// onde 4.900 sairam, sao 100 leituras e nao 5.000. Duas passadas, uma por
		// status, e o aSort devolve a ordem da sequencia, que e a ordem de carga.
		dbSelectArea("SZZ")
		SZZ->(dbSetOrder(2))   // ZZ_FILIAL + ZZ_CODIGO + ZZ_STATUS + ZZ_SEQUEN

		For nX := 1 To 2

			If nX == 1
				cStatus := "1"   // pendente
			Else
				cStatus := "3"   // com erro
			EndIf

			If SZZ->(dbSeek(xFilial("SZZ") + PadR(cLote, TamSX3("ZZ_CODIGO")[1]) + cStatus))

				While SZZ->(!Eof()) .And. SZZ->ZZ_FILIAL == xFilial("SZZ") .And. ;
					AllTrim(SZZ->ZZ_CODIGO) == cLote .And. SZZ->ZZ_STATUS == cStatus

					If nLimite > 0 .And. Len(aFila) >= nLimite
						Exit
					EndIf

					If SZZ->ZZ_TIPO == "S"
						aAdd(aFila, {SZZ->ZZ_SEQUEN, AllTrim(SZZ->ZZ_ENTID), AllTrim(SZZ->ZZ_CHVORI), ;
							AllTrim(SZZ->ZZ_VERBO), SZZ->ZZ_JSON, AllTrim(SZZ->ZZ_CODIGO)})
					EndIf

					SZZ->(dbSkip())
				End

			EndIf

		Next nX

		aSort(aFila, , , {|x, y| x[1] < y[1]})

		// Lote sem nada a enviar nao e fechado: pode ser de entrada, ou ja ter saido
		If Len(aFila) == 0
			Loop
		EndIf

		aTotal[1] += Len(aFila)

		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Lote " + cLote + " - drenando " + ;
			cValToChar(Len(aFila)) + " mensagens de saida.", 0, 0, {})

		For nX := 1 To Len(aFila)

			// aFila[nX] = {cSequen, cEntid, cChave, cVerbo, cJson, cLote}
			nPos := aScan(aCat, {|x| x[1] == aFila[nX][2]})

			If nPos == 0
				FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mensagem " + aFila[nX][1] + " aponta para a entidade " + ;
					aFila[nX][2] + ", que nao esta no catalogo.", 0, 0, {})
				U_BJGRAVA(aFila[nX][6], aFila[nX][1], "3", 0, "Entidade fora do catalogo: " + aFila[nX][2], "")   // erro
				aTotal[3] += 1
				nErrLot   += 1
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
				U_BJGRAVA(aFila[nX][6], aFila[nX][1], "2", nHttp, cResp, BJIdPlat(cResp))   // executada
				aTotal[2] += 1

			ElseIf aFila[nX][4] == "DELETE" .And. nHttp == 404

				// O objetivo do DELETE era que o registro nao estivesse la, e nao esta.
				// Nao ha historico do que ja foi enviado antes desta fila existir, entao
				// uma exclusao pode chegar para uma chave que a plataforma nunca conheceu.
				U_BJGRAVA(aFila[nX][6], aFila[nX][1], "2", nHttp, "404 no DELETE: o registro ja nao existia na plataforma.", "")   // executada
				aTotal[2] += 1

			Else

				U_BJGRAVA(aFila[nX][6], aFila[nX][1], "3", nHttp, cErro, "")   // erro
				aTotal[3] += 1
				nErrLot   += 1

			EndIf

			Sleep(nPausa)

			If nX % 50 == 0
				FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Lote " + cLote + " - " + cValToChar(nX) + " de " + cValToChar(Len(aFila)), 0, 0, {})
			EndIf

		Next nX

		// O resultado do envio volta para a SZY.
		dbSelectArea("SZY")
		SZY->(dbSetOrder(1))   // ZY_FILIAL + ZY_CODIGO

		If SZY->(dbSeek(xFilial("SZY") + PadR(cLote, TamSX3("ZY_CODIGO")[1])))

			RecLock("SZY", .F.)

			If nErrLot == 0
				SZY->ZY_STATUS := "2"   // processado
			Else
				SZY->ZY_STATUS := "3"   // erro
			EndIf

			SZY->(MsUnlock())

		EndIf

	Next nL

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Drenagem concluida - lidas: " + cValToChar(aTotal[1]) + ;
		" enviadas: " + cValToChar(aTotal[2]) + ;
		" erros: " + cValToChar(aTotal[3]) + " em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s", 0, 0, {})

	If File(cArqLock)
		FErase(cArqLock)
	EndIf

Return aTotal

// ===========================================================================
// LOTE
// ===========================================================================

/*/{Protheus.doc} BJLOTE
Envia a fila de saida em blocos por PUT, agrupados por entidade.
@type    User Function
@author  Ricardo P Sotomayor
@since   09/09/2026
@param   nLimite, numeric, Maximo de mensagens lidas da fila nesta passada. Zero le tudo
@return  array, {nLidas, nEnviadas, nErros}
@example aTotal := U_BJLOTE(0)
/*/
User Function BJLOTE(nLimite)

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
	Local nIni      := 0
	Local nFim      := 0
	Local nIdx      := 0
	Local nPos      := 0
	Local nE        := 0
	Local nL        := 0
	Local aLotes    := {}
	Local cStatus   := ""
	Local nX        := 0

	// Parametros lidos aqui, uma vez: dentro dos lacos seriam uma leitura por bloco
	Local nPausa   := SuperGetMV("MV_BJAPI08", .F., 1050)   // ms entre requisicoes
	Local nLoteMax := SuperGetMV("MV_BJAPI09", .F., 1000)   // registros por PUT
	Local cQuery   := ""
	Local cAlias   := ""
	Local oStmt    := Nil

	Default nLimite := 0

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Lote nao enviado.", 0, 0, {})
		Return aTotal
	EndIf

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
						aAdd(aFila, {SZZ->ZZ_SEQUEN, AllTrim(SZZ->ZZ_ENTID), AllTrim(SZZ->ZZ_CHVORI), ;
							AllTrim(SZZ->ZZ_VERBO), SZZ->ZZ_JSON, AllTrim(SZZ->ZZ_CODIGO)})
					EndIf

					SZZ->(dbSkip())
				End

			EndIf

		Next nX

	Next nL

	// Lote e sequencia: a ordem em que as mensagens nasceram, que e a ordem de carga
	aSort(aFila, , , {|x, y| x[6] + x[1] < y[6] + y[1]})

	aTotal[1] := Len(aFila)

	If Len(aFila) == 0
		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Nada pendente na fila de saida.", 0, 0, {})
		Return aTotal
	EndIf

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Lote - " + cValToChar(Len(aFila)) + " mensagens de saida na fila.", 0, 0, {})

	For nE := 1 To Len(aCat)

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

		nIni := 1

		While nIni <= Len(aLote)

			nFim      := Min(nIni + nLoteMax - 1, Len(aLote))
			aRegistro := {}

			For nX := nIni To nFim

				oReg := JsonObject():New()

				If aLote[nX][4] == "DELETE"
					// A API dispensa os demais campos quando excluido vem true - basta a chave.
					oReg["codigoErp"] := aLote[nX][3]
					oReg["excluido"]  := .T.
				Else
					oReg:FromJson(aLote[nX][5])
				EndIf

				aAdd(aRegistro, oReg)

			Next nX

			oEnv  := JsonObject():New()
			oEnv["registros"] := aRegistro
			cBody := oEnv:ToJson()

			If U_BJHTTP("PUT", aCat[nE][3], cBody, @cResp, @nHttp, @cErro)

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
				// codigoErp) ou falha de rede apos as retentativas do BJHTTP: nada
				// deste bloco foi gravado do lado da plataforma.
				For nX := nIni To nFim
					U_BJGRAVA(aLote[nX][6], aLote[nX][1], "3", nHttp, cErro, "")   // erro
					aTotal[3] += 1
				Next nX

			EndIf

			FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Lote " + aCat[nE][1] + " - bloco " + cValToChar(nIni) + " a " + ;
				cValToChar(nFim) + " de " + cValToChar(Len(aLote)) + " - HTTP " + cValToChar(nHttp), 0, 0, {})

			Sleep(nPausa)

			nIni := nFim + 1

		End

	Next nE

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Lote concluido - enviadas: " + cValToChar(aTotal[2]) + ;
		" erros: " + cValToChar(aTotal[3]), 0, 0, {})

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

