#include "totvs.ch"

// Sentido e status da mensagem, iguais aos do BJPLA002 - a fila e a mesma.
#Define BJ_ENTRADA        "E"
#Define BJ_EXECUTADA      "2"
#Define BJ_ERRO           "3"

// Entidades da fila para o que chega da plataforma. Nao estao no catalogo do
// BJPLA002 porque nao sao varridas do ERP: nascem de um GET na plataforma.
#Define BJ_ENT_ORCAMENTO  "orcamentos-pendentes"
#Define BJ_ENT_CLIENTE    "clientes-alteracoes"

// Rotas do retorno.
#Define BJ_ROTA_PENDENTES "/integracao/orcamentos/pendentes"
#Define BJ_ROTA_ALTCLI    "/integracao/clientes/alteracoes"

/*/{Protheus.doc} BJPLA004
Gravacao no ERP do que chega da Plataforma BJ.

Duas entidades andam neste sentido:

	orcamentos-pendentes  orcamento aprovado na plataforma vira Orcamento no ERP
	clientes-alteracoes   alteracao de cadastro aprovada volta para a SA1

**O orcamento da plataforma passa pelo Orcamento do ERP antes de virar Pedido de
Venda.** Nao vai direto para o MATA410: entra como Orcamento (SCJ/SCK) pelo
MATA415 e e efetivado em seguida pelo MATA416, o mesmo caminho que a opcao
"Aprovar" do browse usa (U_AprvOrc, em MA415MNU - referencia, nao alterado).

**Todo orcamento recebido e efetivado.** A aprovacao ja aconteceu do lado da
plataforma; repeti-la no ERP seria pedir duas vezes a mesma decisao.

Passar pelo orcamento em vez de ir direto ao pedido da dois vinculos nativos, sem
criar campo nenhum:

	CJ_NUMEXT  C(36)  o id da plataforma, que cabe inteiro num UUID
	CK_NUMPV   C(6)   o pedido, gravado pelo proprio MATA416 na efetivacao

O fluxo tem cinco passos, e a ordem dos quatro primeiros nao pode ser trocada:

	1. GET  /integracao/orcamentos/pendentes   lista os aprovados sem codigoErp
	2. consulta a fila local e a SCJ por CJ_NUMEXT: orcamento ja criado significa
	   que falta so reenviar o aviso do passo 5
	3. Begin Transaction: MATA415 grava a SCJ/SCK **e** a mensagem passa a
	   executada com o numero do orcamento, juntos
	4. MATA416 efetiva o orcamento e gera o Pedido de Venda - **fora** da
	   transacao do passo 3, ver BJEfetiva
	5. PATCH /integracao/orcamentos/pendentes/{id}  grava o codigo gerado

**A garantia contra orcamento duplicado esta inteira no passo 3.** Se a gravacao
da mensagem sair de dentro do Begin Transaction, volta a existir o intervalo em
que o orcamento esta na SCJ e a plataforma nao sabe - e o ciclo seguinte cria um
segundo orcamento do mesmo pedido da plataforma. Nada quebra e nada avisa.

O {id} do passo 4 e o unico lugar da API em que se usa o id interno da plataforma
(UUID) em vez da chave natural do ERP. O vinculo so pode ser feito uma vez: a API
responde 409 quando ja esta vinculado, quando ainda nao esta aprovado, ou quando
o codigoErp colide com o de outro.

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

	Local aTotal := {0, 0, 0, 0}

	If !AllTrim(Upper(SuperGetMV("MV_BJAPI03", .F., "N"))) == "S"
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Integracao BJ desabilitada (MV_BJAPI03). Nada a receber.", 0, 0, {})
		Return aTotal
	EndIf

	// O MA415END dispara ao fim do MATA415 e chama MsgYesNo perguntando se o
	// orcamento deve ser efetivado. Em job nao ha quem responda: dependendo da
	// versao, a chamada devolve o padrao ou prende a thread ate o timeout. O aviso
	// fica aqui porque, se a coleta parar sem erro nenhum no log, e o primeiro
	// lugar a olhar.
	If ExistBlock("MA415END")
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "O Ponto de Entrada MA415END existe neste ambiente e chama MsgYesNo ao " + ;
			"fim do MATA415. Em job nao ha interface para responder. Se o retorno travar sem erro no log, e por ai: o EP precisa " + ;
			"de um desvio por IsBlind() para nao perguntar em execucao sem tela.", 0, 0, {})
	EndIf

	BJLeOrcam(@aTotal)
	BJLeAltCli(@aTotal)

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Retorno concluido - lidos: " + cValToChar(aTotal[1]) + ;
		" aplicados: " + cValToChar(aTotal[2]) + ;
		" ignorados: " + cValToChar(aTotal[3]) + ;
		" erros: " + cValToChar(aTotal[4]), 0, 0, {})

Return aTotal

/*/{Protheus.doc} BJLeOrcam
Le a fila de orcamentos pendentes da plataforma e trata um a um.

A leitura e paginada. A propria fila da plataforma e quem garante que um
orcamento nao seja lido duas vezes em condicoes normais: /pendentes so devolve o
que ainda nao tem codigoErp, e o PATCH de vinculo o tira da lista.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aTotal, array, [Referencia] Totalizadores
@return  Nil
/*/
Static Function BJLeOrcam(aTotal)

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

		cRota := BJ_ROTA_PENDENTES + "?pageSize=100&page=" + cValToChar(nPage)

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
			BJTrataOrc(aDados[nX], @aTotal)
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
plataforma.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oOrc  , object, Orcamento devolvido pela API
@param   aTotal, array , [Referencia] Totalizadores
@return  Nil
/*/
Static Function BJTrataOrc(oOrc, aTotal)

	Local cIdPlat  := ""
	Local cSeq     := ""
	Local cNumOrc  := ""
	Local cArqLock := ""

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
	If U_BJACHOU(BJ_ENTRADA, BJ_ENT_ORCAMENTO, cIdPlat, @cNumOrc)

		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento " + cIdPlat + " ja gerou o orcamento " + cNumOrc + ;
			" num ciclo anterior, mas continua na fila da plataforma. Reenviando so o vinculo.", 0, 0, {})

		If BJVincula(cIdPlat, cNumOrc)
			aTotal[2] += 1
		Else
			aTotal[4] += 1
		EndIf

		Return Nil
	EndIf

	// Segunda linha de defesa: a propria SCJ. CJ_NUMEXT guarda o id da plataforma,
	// entao o ERP sabe responder sozinho se ja recebeu este orcamento - mesmo que
	// a fila tenha sido expurgada ou que alguem tenha criado o orcamento a mao.
	cNumOrc := BJAchaSCJ(cIdPlat)

	If !Empty(cNumOrc)

		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "O orcamento " + cNumOrc + " da SCJ ja aponta para " + cIdPlat + ;
			" em CJ_NUMEXT. Nao sera criado outro; reenviando so o vinculo.", 0, 0, {})

		If BJVincula(cIdPlat, cNumOrc)
			aTotal[2] += 1
		Else
			aTotal[4] += 1
		EndIf

		Return Nil
	EndIf

	cArqLock := "\bjapi\" + cEmpAnt + "\bjpla-orc-" + Lower(AllTrim(cIdPlat)) + ".tsk"

	MakeDir("\bjapi\")
	MakeDir("\bjapi\" + cEmpAnt + "\")

	// Um processo por orcamento: se o arquivo existir, outro processo ja esta tratando este orcamento.
	If File(cArqLock)
		aTotal[3] += 1
		Return Nil
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	// A mensagem entra na fila com o payload que veio. A partir daqui existe
	// rastro, mesmo que tudo falhe depois.
	cSeq := U_BJENFILA(BJ_ENTRADA, BJ_ENT_ORCAMENTO, cIdPlat, "GET", oOrc:ToJson())

	If Empty(cSeq)
		aTotal[4] += 1
		If File(cArqLock)
			FErase(cArqLock)
		EndIf
		Return Nil
	EndIf

	cNumOrc := BJGeraOrc(oOrc, cIdPlat, cSeq)

	If Empty(cNumOrc)
		aTotal[4] += 1
		If File(cArqLock)
			FErase(cArqLock)
		EndIf
		Return Nil
	EndIf

	// Todo orcamento vindo da plataforma e efetivado. A efetivacao roda **fora**
	// da transacao do MATA415, de proposito: se ela falhar, o orcamento continua
	// valido na SCJ, ja vinculado a plataforma, e alguem o efetiva pela tela.
	// Dentro da transacao, uma falha aqui desfaria o orcamento tambem, e o ciclo
	// seguinte tentaria de novo para bater no mesmo erro para sempre.
	BJEfetiva(cNumOrc, cIdPlat, cSeq)

	If BJVincula(cIdPlat, cNumOrc)
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

/*/{Protheus.doc} BJEfetiva
Efetiva o orcamento em Pedido de Venda, por MATA416.

Todo orcamento recebido da plataforma e efetivado: a aprovacao ja aconteceu do
lado de la, e repeti-la no ERP seria pedir duas vezes a mesma decisao.

Segue o padrao de U_AprvOrc, em MA415MNU.prw - **MATA416 e chamada direto, nao
por MSExecAuto**, com so o CJ_NUM no cabecalho e a SCJ posicionada. E a rotina
que grava CK_NUMPV no item e deixa a SC5 posicionada no pedido gerado.

**Falha aqui nao desfaz o orcamento.** Ele continua na SCJ, com CJ_NUMEXT
apontando para a plataforma e ja vinculado; o que falta e alguem clicar em
Aprovar no browse. Por isso esta rotina nao devolve erro para o chamador: o
retorno ja foi um sucesso quando o orcamento passou a existir.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cNumOrc, character, CJ_NUM do orcamento a efetivar
@param   cIdPlat, character, Id da plataforma, para o log
@param   cSeq   , character, Sequencia da mensagem na fila
@return  Nil
/*/
Static Function BJEfetiva(cNumOrc, cIdPlat, cSeq)

	Local aArea  := GetArea()
	Local aCab   := {}
	Local cNumPV := ""

	Private lMsErroAuto    := .F.
	Private lMsHelpAuto    := .T.
	Private lAutoErrNoFile := .T.

	dbSelectArea("SCJ")
	SCJ->(dbSetOrder(1))

	If !SCJ->(dbSeek(xFilial("SCJ") + PadR(cNumOrc, TamSX3("CJ_NUM")[1])))
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento " + cNumOrc + " nao encontrado na SCJ para efetivar. " + ;
			"Ele existe e esta vinculado; efetive pela opcao Aprovar do browse.", 0, 0, {})
		RestArea(aArea)
		Return Nil
	EndIf

	aAdd(aCab, {"CJ_NUM", SCJ->CJ_NUM, Nil})

	MATA416(aCab, {})

	If lMsErroAuto
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "MATA416 recusou a efetivacao do orcamento " + cNumOrc + ;
			" (plataforma " + cIdPlat + "): " + BJLogAuto() + " O orcamento continua valido; efetive pela opcao Aprovar do browse.", 0, 0, {})
		RestArea(aArea)
		Return Nil
	EndIf

	// O MATA416 deixa a SC5 posicionada no pedido que acabou de gerar, e grava o
	// numero dele em CK_NUMPV, no item do orcamento.
	cNumPV := AllTrim(SC5->C5_NUM)

	// O numero do pedido vai para o texto da mensagem, nao para ZZ_CHVDES: aquele
	// campo guarda o orcamento, que e o que a plataforma conhece pelo codigoErp e
	// o que BJACHOU precisa devolver no reenvio do vinculo. Do orcamento chega-se
	// ao pedido por CK_NUMPV.
	U_BJGRAVA(cSeq, BJ_EXECUTADA, 0, "Orcamento " + cNumOrc + " criado por MATA415 e efetivado por MATA416. " + ;
		"Pedido de Venda " + cNumPV + ".", cNumOrc)

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento " + cNumOrc + " efetivado: Pedido de Venda " + cNumPV + ".", 0, 0, {})

	RestArea(aArea)

Return Nil

/*/{Protheus.doc} BJAchaSCJ
Procura na SCJ um orcamento ja criado para um id da plataforma.

CJ_NUMEXT tem 36 posicoes, que e exatamente o tamanho de um UUID: o vinculo com a
plataforma cabe no campo nativo e nao precisa de campo novo.

E a segunda linha de defesa contra duplicidade. A primeira e a fila, que responde
mais rapido; esta responde mesmo depois de a fila ter sido expurgada, porque a
resposta esta no proprio documento.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cIdPlat, character, Id interno da plataforma (UUID)
@return  character, CJ_NUM do orcamento existente, ou vazio
/*/
Static Function BJAchaSCJ(cIdPlat)

	Local cRet   := ""
	Local cQuery := ""
	Local cTmp   := ""
	Local oStmt  := Nil

	Default cIdPlat := ""

	If Empty(cIdPlat)
		Return ""
	EndIf

	cQuery := "SELECT CJ_NUM "
	cQuery += "  FROM " + RetSQLName("SCJ") + " SCJ "
	cQuery += " WHERE SCJ.D_E_L_E_T_ = ? "
	cQuery += "   AND SCJ.CJ_FILIAL  = ? "
	cQuery += "   AND SCJ.CJ_NUMEXT  = ? "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, " ")
	oStmt:SetString(2, xFilial("SCJ"))
	oStmt:SetString(3, cIdPlat)

	cTmp := oStmt:OpenAlias()

	If (cTmp)->(!Eof())
		cRet := AllTrim((cTmp)->CJ_NUM)
	EndIf

	(cTmp)->(dbCloseArea())
	oStmt:Destroy()

Return cRet

/*/{Protheus.doc} BJGeraOrc
Cria o Orcamento de Venda a partir do orcamento da plataforma, por MATA415.

O cabecalho puxa do **cadastro do cliente** o que a plataforma nao informa:
condicao, tabela de preco e vendedor. O TES e o armazem saem do produto (B1_TS e
B1_LOCPAD); produto sem B1_TS nao recebe CK_TES, e a regra de TES inteligente do
ambiente resolve melhor que um valor fixo.

**A numeracao e do MATA415.** Nada de GetSxeNum antes: a rotina numera, e o
numero e lido da SCJ posicionada depois. Na recusa, RollBackSx8 em laco devolve
todos os semaforos consumidos, nao so o ultimo.

**Cliente bloqueado nao e liberado aqui.** Diferente do caminho de Pedido de
Venda, um orcamento e proposta, nao venda: destravar permanentemente um cliente
bloqueado por credito para registrar uma proposta seria caro demais pelo que se
ganha. Se o MATA415 recusar por bloqueio, o erro aparece na fila e a decisao fica
com quem opera.

Em job nao ha tela: o erro do ExecAuto sai por GetAutoGRLog para o log, nunca por
MostraErro.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oOrc   , object   , Orcamento devolvido pela API
@param   cIdPlat, character, Id interno da plataforma (UUID)
@param   cSeq   , character, Sequencia da mensagem na fila
@return  character, Numero do orcamento gerado, ou vazio quando falhou
/*/
Static Function BJGeraOrc(oOrc, cIdPlat, cSeq)

	Local cNumOrc  := ""
	Local aArea    := GetArea()
	Local aCabec   := {}
	Local aItens   := {}
	Local aItJson  := {}
	Local cCliente := ""
	Local cLoja    := ""
	Local cVend    := ""
	Local cCond    := ""
	Local cObs     := ""
	Local cChvCli  := ""
	Local cLogErr  := ""
	Local cValida  := ""
	Local dEmissao := CtoD("")
	Local nTamLoj  := TamSX3("A1_LOJA")[1]
	Local nSaveSx8 := 0

	Private lMsErroAuto    := .F.
	Private lMsHelpAuto    := .T.
	Private lAutoErrNoFile := .T.

	cChvCli := AllTrim(cValToChar(oOrc:GetJsonObject("clienteCodigo")))
	cVend   := AllTrim(cValToChar(oOrc:GetJsonObject("vendedorCodigo")))
	cCond   := AllTrim(cValToChar(oOrc:GetJsonObject("condicaoPagamentoCodigo")))
	cObs    := AllTrim(cValToChar(oOrc:GetJsonObject("observacao")))
	cValida := AllTrim(cValToChar(oOrc:GetJsonObject("dataValidade")))
	aItJson := oOrc:GetJsonObject("itens")

	If Empty(cChvCli) .Or. ValType(aItJson) != "A" .Or. Len(aItJson) == 0
		BJErroOrc(cSeq, cIdPlat, "Orcamento sem cliente ou sem itens. Nao foi criado.")
		RestArea(aArea)
		Return ""
	EndIf

	// A chave da API concatena codigo e loja; o Protheus precisa dos dois separados
	cCliente := SubStr(cChvCli, 1, Len(cChvCli) - nTamLoj)
	cLoja    := Right(cChvCli, nTamLoj)

	// Posiciona a SA1 e a deixa posicionada: o cabecalho puxa dela condicao,
	// tabela de preco e vendedor logo abaixo.
	dbSelectArea("SA1")
	SA1->(dbSetOrder(1))

	If !SA1->(dbSeek(xFilial("SA1") + PadR(cCliente, TamSX3("A1_COD")[1]) + PadR(cLoja, TamSX3("A1_LOJA")[1])))
		BJErroOrc(cSeq, cIdPlat, "Cliente " + cChvCli + " nao encontrado na SA1. Orcamento nao foi criado.")
		RestArea(aArea)
		Return ""
	EndIf

	// Guarda o topo do semaforo de numeracao antes do ExecAuto.
	nSaveSx8 := GetSx8Len()

	dEmissao := BJDataOrc(oOrc)

	// O que a plataforma nao trouxer sai do cadastro do cliente.
	If Empty(cVend)
		cVend := AllTrim(SA1->A1_VEND)
	EndIf
	If Empty(cCond)
		cCond := AllTrim(SA1->A1_COND)
	EndIf

	aAdd(aCabec, {"CJ_FILIAL" , xFilial("SCJ"), Nil})
	aAdd(aCabec, {"CJ_CLIENTE", cCliente      , Nil})
	aAdd(aCabec, {"CJ_LOJA"   , cLoja         , Nil})
	aAdd(aCabec, {"CJ_EMISSAO", dEmissao      , Nil})

	// CJ_NUMEXT tem 36 posicoes e guarda o UUID da plataforma inteiro. E o vinculo
	// nativo entre os dois lados, e o que permite ao ERP responder sozinho se ja
	// recebeu este orcamento.
	aAdd(aCabec, {"CJ_NUMEXT" , cIdPlat       , Nil})

	If !Empty(cVend)
		aAdd(aCabec, {"CJ_VEND1", cVend, Nil})
	EndIf
	If !Empty(cCond)
		aAdd(aCabec, {"CJ_CONDPAG", cCond, Nil})
	EndIf
	If !Empty(SA1->A1_TABELA)
		aAdd(aCabec, {"CJ_TABELA", SA1->A1_TABELA, Nil})
	EndIf

	// A API devolve ISO 8601: "2026-09-28T00:00:00.000Z"
	If Len(cValida) >= 10
		aAdd(aCabec, {"CJ_VALIDA", SToD(StrTran(SubStr(cValida, 1, 10), "-", "")), Nil})
	EndIf

	If !Empty(cObs)
		aAdd(aCabec, {"CJ_XOBSVEN", cObs, Nil})
	EndIf

	aItens := BJItensOrc(aItJson)

	If Len(aItens) == 0
		BJErroOrc(cSeq, cIdPlat, "Nenhum item do orcamento pode ser convertido. Orcamento nao foi criado.")
		RestArea(aArea)
		Return ""
	EndIf

	// ---------------------------------------------------------------------
	// A transacao que impede o orcamento duplicado.
	//
	// O orcamento e a marcacao da mensagem gravam juntos, ou nenhum dos dois. Se a
	// marcacao falhar, o orcamento volta atras com ela e o registro da plataforma
	// e reprocessado do zero no ciclo seguinte, sem deixar orfao na SCJ.
	//
	// **Nao tire a chamada de U_BJGRAVA de dentro deste bloco.** Fora dele volta a
	// existir o intervalo em que o orcamento esta gravado e ninguem sabe - e o
	// ciclo seguinte cria um segundo. Nada quebra e nada avisa.
	//
	// Nao ha chamada de tela aqui dentro: em job nao existe interface, e UI em
	// transacao segura o lock do banco. O MA415END, se existir no ambiente, e a
	// excecao que escapa a este cuidado - ver o aviso em U_BJRETORNO.
	// ---------------------------------------------------------------------
	Begin Transaction

		dbSelectArea("SCJ")
		MSExecAuto({|x, y, z| MATA415(x, y, z)}, aCabec, aItens, 3)

		If lMsErroAuto

			cLogErr := BJLogAuto()

			DisarmTransaction()

		Else

			// O MATA415 deixa a SCJ posicionada no orcamento que acabou de gravar.
			cNumOrc := AllTrim(SCJ->CJ_NUM)

			If Empty(cNumOrc)
				cLogErr := "Orcamento gerado, mas a SCJ nao ficou posicionada para ler o numero."
				DisarmTransaction()
			ElseIf !U_BJGRAVA(cSeq, BJ_EXECUTADA, 0, "Orcamento " + cNumOrc + " criado por MATA415.", cNumOrc)
				cLogErr := "Orcamento " + cNumOrc + " criado, mas a mensagem " + cSeq + " nao pode ser marcada. " + ;
					"A transacao foi desfeita para nao deixar orcamento sem rastro."
				cNumOrc := ""
				DisarmTransaction()
			EndIf

		EndIf

	End Transaction

	If Empty(cNumOrc)

		// Devolve todos os numeros consumidos, nao apenas o ultimo.
		While GetSx8Len() > nSaveSx8
			RollBackSx8()
		End

		BJErroOrc(cSeq, cIdPlat, "ExecAuto MATA415: " + cLogErr)
		RestArea(aArea)
		Return ""
	EndIf

	ConfirmSx8()

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento da plataforma " + cIdPlat + " criou o orcamento " + cNumOrc + ;
		" na SCJ.", 0, 0, {})

	RestArea(aArea)

Return cNumOrc

/*/{Protheus.doc} BJItensOrc
Monta o vetor de itens do Orcamento de Venda.

O TES sai do B1_TS do produto e o armazem do B1_LOCPAD. Produto sem B1_TS nao
recebe CK_TES: a regra de TES inteligente do ambiente resolve, e forcar um valor
fixo erraria em toda venda fora do caso comum.

Produto inexistente na SB1 e descartado com aviso, em vez de derrubar o orcamento
inteiro - mas se nenhum item sobreviver, o chamador aborta.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aItJson, array, Itens devolvidos pela API
@return  array, Itens no formato do ExecAuto
/*/
Static Function BJItensOrc(aItJson)

	Local aRet   := {}
	Local aLinha := {}
	Local aArea  := GetArea()
	Local cItem  := StrZero(0, TamSX3("CK_ITEM")[1])
	Local cProd  := ""
	Local nQtd   := 0
	Local nPreco := 0
	Local nX     := 0

	dbSelectArea("SB1")
	SB1->(dbSetOrder(1))

	For nX := 1 To Len(aItJson)

		cProd  := AllTrim(cValToChar(aItJson[nX]:GetJsonObject("produtoCodigo")))
		nQtd   := aItJson[nX]:GetJsonObject("quantidade")
		nPreco := aItJson[nX]:GetJsonObject("vlrUnitario")

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

		cItem  := Soma1(cItem)
		aLinha := {}

		aAdd(aLinha, {"CK_ITEM"   , cItem                  , Nil})
		aAdd(aLinha, {"CK_PRODUTO", cProd                  , Nil})
		aAdd(aLinha, {"CK_QTDVEN" , nQtd                   , Nil})
		aAdd(aLinha, {"CK_PRCVEN" , nPreco                 , Nil})
		aAdd(aLinha, {"CK_VALOR"  , Round(nQtd * nPreco, 2), Nil})

		If !Empty(SB1->B1_UM)
			aAdd(aLinha, {"CK_UM", SB1->B1_UM, Nil})
		EndIf
		If !Empty(SB1->B1_TS)
			aAdd(aLinha, {"CK_TES", SB1->B1_TS, Nil})
		EndIf
		If !Empty(SB1->B1_LOCPAD)
			aAdd(aLinha, {"CK_LOCAL", SB1->B1_LOCPAD, Nil})
		EndIf

		aAdd(aRet, aLinha)

	Next nX

	RestArea(aArea)

Return aRet

/*/{Protheus.doc} BJVincula
Avisa a plataforma que o orcamento dela virou um orcamento no ERP.

E o passo 4, e o unico ponto da API que usa o id interno da plataforma. O vinculo
so pode ser feito uma vez: 409 significa ja vinculado, ainda nao aprovado, ou
codigoErp colidindo com o de outro orcamento.

O codigo enviado e **texto**, como o contrato documenta - `{"codigoErp":
"004512"}`, entre aspas -, e precisa ser exatamente o mesmo codigoErp que o
mapeador de saida usa para este orcamento: `filial-CJ_NUM`.

**Nao mande so o CJ_NUM.** Depois de vinculado, o orcamento passa a aparecer no
GET /integracao/orcamentos normal, e o U_BJMAPORC vai empurra-lo com
`filial-CJ_NUM`. Se o vinculo tiver gravado "000123" e o mapeador mandar
"01-000123", a plataforma fica com dois orcamentos onde existe um.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cIdPlat, character, Id interno da plataforma (UUID)
@param   cNumOrc, character, CJ_NUM do orcamento criado
@return  logical, .T. quando a plataforma aceitou o vinculo
/*/
Static Function BJVincula(cIdPlat, cNumOrc)

	Local lRet  := .F.
	Local cResp := ""
	Local cErro := ""
	Local nHttp := 0
	Local oJson := Nil

	oJson := JsonObject():New()
	oJson["codigoErp"] := xFilial("SCJ") + "-" + AllTrim(cNumOrc)

	lRet := U_BJHTTP("PATCH", BJ_ROTA_PENDENTES + "/" + AllTrim(cIdPlat), oJson:ToJson(), @cResp, @nHttp, @cErro)

	oJson := Nil

	If lRet
		FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento da plataforma " + cIdPlat + " vinculado ao orcamento " + ;
			cNumOrc + " do ERP.", 0, 0, {})
	Else
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Falha ao vincular " + cIdPlat + " ao orcamento " + cNumOrc + ;
			" (HTTP " + cValToChar(nHttp) + "): " + cErro, 0, 0, {})
	EndIf

Return lRet

/*/{Protheus.doc} BJDataOrc
Devolve a data de emissao a usar no orcamento.

A da plataforma quando for de hoje em diante; passada, usa a data base. Orcamento
com emissao retroativa entra com tabela de preco e condicao de pagamento de outra
epoca.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oOrc, object, Orcamento devolvido pela API
@return  date, Data de emissao
/*/
Static Function BJDataOrc(oOrc)

	Local cData := AllTrim(cValToChar(oOrc:GetJsonObject("dtEmissao")))
	Local dRet  := dDataBase

	// A API devolve ISO 8601: "2026-08-26T00:00:00.000Z"
	If Len(cData) >= 10
		dRet := SToD(StrTran(SubStr(cData, 1, 10), "-", ""))
	EndIf

	If Empty(dRet) .Or. dRet < dDataBase
		dRet := dDataBase
	EndIf

Return dRet

/*/{Protheus.doc} BJLogAuto
Devolve o log de erro do ultimo ExecAuto como texto de uma linha.

Em job nao ha tela: MostraErro abriria uma janela que ninguem fecha e travaria a
thread. GetAutoGRLog devolve as mesmas mensagens em array.

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
Static Function BJErroOrc(cSeq, cIdPlat, cMsg)

	FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Orcamento " + cIdPlat + ": " + cMsg, 0, 0, {})

	U_BJGRAVA(cSeq, BJ_ERRO, 0, cMsg, "")

Return Nil

// ===========================================================================
// ALTERACOES DE CLIENTE APROVADAS NA PLATAFORMA
// ===========================================================================

/*/{Protheus.doc} BJLeAltCli
Le as alteracoes de cliente aprovadas na plataforma e as aplica na SA1.

**A rota que esta funcao consome ainda nao existe** na API de integracao. O que
existe hoje e GET /clientes-alteracoes, sob JWT e permissao clientes.aprovar,
declarada como rota interna. Enquanto a rota nao subir, o 404 e registrado e o
ciclo segue - nada quebra.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   aTotal, array, [Referencia] Totalizadores
@return  Nil
/*/
Static Function BJLeAltCli(aTotal)

	Local cResp  := ""
	Local cErro  := ""
	Local nHttp  := 0
	Local nX     := 0
	Local oJson  := Nil
	Local aDados := {}

	If !U_BJHTTP("GET", BJ_ROTA_ALTCLI + "?pageSize=100&page=1", "", @cResp, @nHttp, @cErro)

		If nHttp == 404
			FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Rota " + BJ_ROTA_ALTCLI + " ainda nao existe na API. " + ;
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
		BJTrataAlt(aDados[nX], @aTotal)
	Next nX

Return Nil

/*/{Protheus.doc} BJTrataAlt
Aplica uma alteracao de cliente na SA1 e confirma na plataforma.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oAlt  , object, Alteracao devolvida pela API
@param   aTotal, array , [Referencia] Totalizadores
@return  Nil
/*/
Static Function BJTrataAlt(oAlt, aTotal)

	Local cIdPlat  := ""
	Local cChvCli  := ""
	Local cCliente := ""
	Local cLoja    := ""
	Local cSeq     := ""
	Local cLogErr  := ""
	Local cFeito   := ""
	Local aCampos  := {}
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
	If U_BJACHOU(BJ_ENTRADA, BJ_ENT_CLIENTE, cIdPlat, @cFeito)
		If BJConfAlt(cIdPlat)
			aTotal[2] += 1
		Else
			aTotal[4] += 1
		EndIf
		Return Nil
	EndIf

	cSeq := U_BJENFILA(BJ_ENTRADA, BJ_ENT_CLIENTE, cIdPlat, "GET", oAlt:ToJson())

	If Empty(cSeq)
		aTotal[4] += 1
		Return Nil
	EndIf

	cCliente := SubStr(cChvCli, 1, Len(cChvCli) - nTamLoj)
	cLoja    := Right(cChvCli, nTamLoj)

	dbSelectArea("SA1")
	SA1->(dbSetOrder(1))

	If !SA1->(dbSeek(xFilial("SA1") + PadR(cCliente, TamSX3("A1_COD")[1]) + PadR(cLoja, TamSX3("A1_LOJA")[1])))
		U_BJGRAVA(cSeq, BJ_ERRO, 0, "Cliente " + cChvCli + " nao encontrado na SA1.", "")
		aTotal[4] += 1
		Return Nil
	EndIf

	aCampos := BJCamposAlt(oAlt)

	If Len(aCampos) == 0
		U_BJGRAVA(cSeq, BJ_ERRO, 0, "Alteracao sem nenhum campo reconhecido no de-para.", "")
		aTotal[3] += 1
		Return Nil
	EndIf

	// A gravacao e a marcacao andam juntas, pelo mesmo motivo do orcamento:
	// cadastro alterado sem rastro voltaria a ser alterado no ciclo seguinte.
	Begin Transaction

		If BJGravSA1(aCampos, @cLogErr)

			If !U_BJGRAVA(cSeq, BJ_EXECUTADA, 0, "Cliente " + cChvCli + " alterado por CRMA980.", cChvCli)
				cLogErr := "Cliente alterado, mas a mensagem " + cSeq + " nao pode ser marcada."
				DisarmTransaction()
			EndIf

		Else

			DisarmTransaction()

		EndIf

	End Transaction

	If !Empty(cLogErr)
		U_BJGRAVA(cSeq, BJ_ERRO, 0, cLogErr, "")
		aTotal[4] += 1
		Return Nil
	EndIf

	If BJConfAlt(cIdPlat)
		aTotal[2] += 1
	Else
		aTotal[4] += 1
	EndIf

Return Nil

/*/{Protheus.doc} BJCamposAlt
Traduz os campos da alteracao para os campos da SA1.

O de-para e a **lista branca**: campo que nao esta aqui nao volta da plataforma,
por mais que ela mande. Chave, filial, bloqueio e os campos calculados ficam de
fora de proposito - alterar A1_COD por integracao seria criar outro cliente.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   oAlt, object, Alteracao devolvida pela API
@return  array, Campos no formato do FWMVCRotAuto
/*/
Static Function BJCamposAlt(oAlt)

	Local aRet   := {}
	Local aMapa  := {}
	Local xValor := Nil
	Local nX     := 0

	//         Campo no contrato          Campo na SA1  Tipo
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
	aAdd(aMapa, {"vendedorCodigo"         , "A1_VEND"   , "C"})
	aAdd(aMapa, {"tabelaPrecoCodigo"      , "A1_TABELA" , "C"})
	aAdd(aMapa, {"condicaoPagamentoCodigo", "A1_COND"   , "C"})
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
					aAdd(aRet, {aMapa[nX][2], xValor, Nil})
				EndIf

			Case aMapa[nX][3] == "D"
				// A API devolve ISO 8601: "2026-08-26T00:00:00.000Z"
				If ValType(xValor) == "C" .And. Len(AllTrim(xValor)) >= 10
					aAdd(aRet, {aMapa[nX][2], SToD(StrTran(SubStr(AllTrim(xValor), 1, 10), "-", "")), Nil})
				EndIf

			Otherwise
				aAdd(aRet, {aMapa[nX][2], AllTrim(cValToChar(xValor)), Nil})
		EndCase

	Next nX

Return aRet

/*/{Protheus.doc} BJGravSA1
Grava a alteracao no cadastro de clientes pelo modelo MVC.

Usa o **CRMA980**, que substituiu o MATA030 descontinuado pela TOTVS. A rotina
padrao aplica as validacoes e os gatilhos do cadastro, que e o que se espera de
uma alteracao vinda de fora; RecLock gravaria o campo e ignoraria tudo isso.

A SA1 precisa chegar posicionada no cliente a alterar.

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

Sem esta etapa a mesma alteracao voltaria em todo ciclo, e uma correcao feita
depois no ERP seria sobrescrita pela versao antiga da plataforma.

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

	lRet := U_BJHTTP("PATCH", BJ_ROTA_ALTCLI + "/" + AllTrim(cIdPlat) + "/aplicada", "{}", @cResp, @nHttp, @cErro)

	If !lRet
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Falha ao confirmar a alteracao " + cIdPlat + ;
			" na plataforma (HTTP " + cValToChar(nHttp) + "): " + cErro, 0, 0, {})
	EndIf

Return lRet
