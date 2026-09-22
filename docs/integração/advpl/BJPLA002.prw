#include "totvs.ch"

// Sentido e status da mensagem sao escritos como literal no ponto de uso, com o
// comentario na frente. Quem documenta os valores aceitos e o combo do campo no
// dicionario (SX3), nao uma constante aqui.
//
//    ZZ_TIPO     "S" saida (ERP -> plataforma)   "E" entrada (plataforma -> ERP)
//    ZZ_STATUS   "1" pendente   "2" executada   "3" erro
//
// Os ajustes sao parametros, lidos com SuperGetMV no ponto de uso:
//
//    MV_BJAPI01  URL base da API, ja com o prefixo das rotas
//    MV_BJAPI02  Chave de API (x-api-key)
//    MV_BJAPI03  Habilita a integracao (S/N)
//    MV_BJAPI04  Timeout da requisicao, em segundos
//    MV_BJAPI05  Retentativas dentro da mesma requisicao
//    MV_BJAPI06  Espera entre retentativas, em ms
//    MV_BJAPI11  Retencao da mensagem executada, em dias

/*/{Protheus.doc} BJPLA002
Rotinas comuns da integracao com a Plataforma BJ.
@type    function
@author  Ricardo P Sotomayor
@since   01/09/2026
/*/

// ===========================================================================
// CATALOGO
// ===========================================================================

/*/{Protheus.doc} BJCATALO
Catalogo das entidades da API, na ordem de carga.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  array, Catalogo de entidades
@example nPos := aScan(U_BJCATALO(), {|x| x[1] == "produtos"})
/*/
User Function BJCATALO()

	Local aRet := {}

	//        cId                  cDescr                     cRota                              cColeta      lAtivo cAlias cCpoFil
	aAdd(aRet, {"regras-desconto", "Regras de desconto"     , "/integracao/regras-desconto"    , "U_BJMAPRGD", .T., "SZ0", "Z0_FILIAL" })
	aAdd(aRet, {"categorias"     , "Categorias"             , "/integracao/categorias"         , "U_BJMAPCAT", .T., "SZ1", "Z1_FILIAL" })
	aAdd(aRet, {"condicoes-pagto", "Condicoes de pagamento" , "/integracao/condicoes-pagamento", "U_BJMAPCND", .T., "SE4", "E4_FILIAL" })
	aAdd(aRet, {"armazens"       , "Armazens"               , "/integracao/armazens"           , "U_BJMAPARM", .T., "NNR", "NNR_FILIAL"})
	aAdd(aRet, {"produtos"       , "Produtos"               , "/integracao/produtos"           , "U_BJMAPPRD", .T., "SB1", "B1_FILIAL" })
	aAdd(aRet, {"vendedores"     , "Vendedores"             , "/integracao/vendedores"         , "U_BJMAPVND", .T., "SA3", "A3_FILIAL" })
	aAdd(aRet, {"clientes"       , "Clientes"               , "/integracao/clientes"           , "U_BJMAPCLI", .T., "SA1", "A1_FILIAL" })
	aAdd(aRet, {"fornecedores"   , "Fornecedores"           , "/integracao/fornecedores"       , "U_BJMAPFOR", .T., "SA2", "A2_FILIAL" })
	aAdd(aRet, {"tabelas-preco"  , "Tabelas de preco"       , "/integracao/tabelas-preco"      , "U_BJMAPTAB", .T., "DA0", "DA0_FILIAL"})
	aAdd(aRet, {"estoque"        , "Saldo em estoque"       , "/integracao/estoque"            , "U_BJMAPEST", .T., "SB2", "B2_FILIAL" })
	aAdd(aRet, {"objetivos"      , "Objetivos de venda"     , "/integracao/objetivos"          , "U_BJMAPOBJ", .F., ""   , ""          })
	aAdd(aRet, {"notas-saida"    , "Notas de saida"         , "/integracao/notas-saida"        , "U_BJMAPNFS", .T., "SF2", "F2_FILIAL" })
	aAdd(aRet, {"notas-saida-xml", "XML das notas de saida", "/integracao/notas-saida/{chave}/xml", "U_BJMAPXML", .T., "SF2", "F2_FILIAL"})
	aAdd(aRet, {"notas-entrada"  , "Notas de entrada"       , "/integracao/notas-entrada"      , "U_BJMAPNFE", .T., "SF1", "F1_FILIAL" })
	aAdd(aRet, {"titulos-receber", "Titulos a receber"      , "/integracao/titulos-receber"    , "U_BJMAPTIT", .T., "SE1", "E1_FILIAL" })

Return aRet

// ===========================================================================
// CLIENTE HTTP
// ===========================================================================

/*/{Protheus.doc} BJHTTP
Executa uma requisicao contra a API BJ e devolve o resultado ja tratado.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cVerbo, character, GET, POST, PUT, PATCH ou DELETE
@param   cRota , character, Rota relativa a URL base. Ex.: "/integracao/produtos"
@param   cBody , character, Corpo JSON. Vazio em GET e DELETE
@param   cResp , character, [Referencia] Corpo da resposta
@param   nHttp , numeric  , [Referencia] Codigo HTTP
@param   cErro , character, [Referencia] Mensagem de erro ja tratada
@return  logical, .T. quando a resposta ficou na faixa 2xx
@example U_BJHTTP("POST", "/integracao/produtos", cJson, @cResp, @nHttp, @cErro)
/*/
User Function BJHTTP(cVerbo, cRota, cBody, cResp, nHttp, cErro)

	Local lRet    := .F.
	Local lSegue  := .T.
	Local aHeader := {}
	Local aDetail := {}
	Local cUrl    := ""
	Local cHeadRt := ""
	Local nTent   := 0
	Local nEspera := 0
	Local nPos    := 0
	Local nX      := 0
	Local oClient := Nil
	Local oJson   := Nil

	// Parametros lidos aqui, uma vez: dentro do laco seriam uma leitura por
	// tentativa. As pausas derivam do teto da API (60 req/min nas rotas de
	// integracao, contadas por IP) - baixa-las rende 429 e fica mais lento.
	Local cUrlBase := AllTrim(SuperGetMV("MV_BJAPI01", .F., "https://api.rcgcba.bjsoft.com.br/api/v1"))
	Local cChvApi  := AllTrim(SuperGetMV("MV_BJAPI02", .F., ""))
	Local nTimeOut := SuperGetMV("MV_BJAPI04", .F., 120)    // segundos
	Local nMaxTent := SuperGetMV("MV_BJAPI05", .F., 3)      // retentativas
	Local nEspRetr := SuperGetMV("MV_BJAPI06", .F., 2000)   // ms por tentativa

	Default cVerbo := "GET"
	Default cRota  := ""
	Default cBody  := ""
	Default cResp  := ""
	Default nHttp  := 0
	Default cErro  := ""

	cVerbo := Upper(AllTrim(cVerbo))
	cRota  := AllTrim(cRota)

	// MV_BJAPI04 ja existiu no desenho antigo guardando data, como caractere. Se
	// sobrou assim no SX6, o FWRest repassa o texto ao HttpPost e a thread cai.
	// Melhor recusar com a causa escrita do que derrubar o envio.
	If ValType(nTimeOut) != "N" .Or. ValType(nMaxTent) != "N" .Or. ValType(nEspRetr) != "N"
		cErro := "MV_BJAPI04, MV_BJAPI05 e MV_BJAPI06 precisam ser numericos no SX6 (timeout, retentativas, espera)."
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", cErro, 0, 0, {})
		Return .F.
	EndIf

	// O prefixo das rotas (/api/v1) faz parte da URL base, em MV_BJAPI01: prefixo
	// e host mudam juntos, na mesma migracao de versao da API, e mante-los em dois
	// lugares so cria a chance de discordarem. Aqui so se garante a barra que
	// separa a base da rota.
	If !Empty(cRota) .And. Left(cRota, 1) != "/"
		cRota := "/" + cRota
	EndIf

	aAdd(aHeader, "Content-Type: application/json")
	aAdd(aHeader, "Accept: application/json")
	aAdd(aHeader, "x-api-key: " + cChvApi)

	While lSegue .And. nTent < nMaxTent

		nTent += 1
		cResp := ""
		nHttp := 0
		cErro := ""

		If cVerbo == "PATCH"

			cUrl    := cUrlBase + cRota
			cHeadRt := ""
			cResp   := HTTPQuote(cUrl, "PATCH", /*cGetParms*/, cBody, nTimeOut, aHeader, @cHeadRt)

			If cResp == Nil
				cResp := ""
			EndIf

			// "HTTP/1.1 200 OK" - o codigo comeca 9 posicoes apos o inicio do token
			nPos := At("HTTP/", Upper(cHeadRt))

			If nPos > 0
				nHttp := Val(SubStr(cHeadRt, nPos + 9, 3))
			EndIf

			lRet := (nHttp >= 200 .And. nHttp <= 299)

		Else

			oClient := FWRest():New(cUrlBase)
			oClient:SetPath(cRota)
			oClient:SetTimeOut(nTimeOut)

			// A API responde 2xx variados (200, 201, 204). O modo legado so aceita 200/201.
			oClient:SetLegacySuccess(.F.)

			Do Case
				Case cVerbo == "GET"
					lRet := oClient:Get(aHeader)

				Case cVerbo == "POST"
					oClient:SetPostParams(cBody)
					lRet := oClient:Post(aHeader)

				Case cVerbo == "DELETE"
					lRet := oClient:Delete(aHeader)

				Case cVerbo == "PUT"
					// O corpo do PUT vai como 2o parametro do metodo, ao contrario do
					// POST, que usa SetPostParams antes de chamar Post().
					lRet := oClient:Put(aHeader, cBody)

				Otherwise
					cErro   := "Verbo nao suportado: " + cVerbo
					oClient := Nil
					FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", cErro, 0, 0, {})
					Return .F.
			EndCase

			// GetHTTPCode() devolve o codigo como texto ("200", "429"), e Nil quando a
			// conexao falha antes de qualquer resposta (timeout, recusa, DNS). As
			// comparacoes de faixa abaixo e o ZZ_HTTP precisam de numero: sem resposta
			// e HTTP 0.
			nHttp := oClient:GetHTTPCode()
			cResp := oClient:GetResult()

			If ValType(nHttp) == "C"
				nHttp := Val(nHttp)
			ElseIf ValType(nHttp) != "N"
				nHttp := 0
			EndIf

			If ValType(cResp) != "C"
				cResp := ""
			EndIf

			If !lRet .And. Empty(cResp)
				cResp := oClient:GetLastError()
			EndIf

			// FWRest nao expoe Destroy(); o objeto sai de escopo e o coletor o libera.
			oClient := Nil

		EndIf

		// TEMPORARIO - diagnostico do 404. Remover junto com as outras linhas marcadas.
		ConOut("[BJHTTP] " + DtoC(Date()) + " " + Time() + " tentativa " + cValToChar(nTent) + "/" + cValToChar(nMaxTent))   // TEMPORARIO
		ConOut("[BJHTTP] " + cVerbo + " " + cUrlBase + cRota)   // TEMPORARIO
		ConOut("[BJHTTP] base=[" + cUrlBase + "] rota=[" + cRota + "] chave=" + cValToChar(Len(cChvApi)) + " caracteres")   // TEMPORARIO
		ConOut("[BJHTTP] body=" + Left(cBody, 500))   // TEMPORARIO
		ConOut("[BJHTTP] HTTP " + cValToChar(nHttp) + " ok=" + cValToChar(lRet) + " resp=" + Left(cResp, 500))   // TEMPORARIO

		If lRet

			lSegue := .F.

		Else

			// Erro em texto legivel: o contrato devolve { "code", "message" } e, na
			// validacao Zod, um array "details" com o caminho do campo recusado.
			If Empty(cResp)

				cErro := "Sem resposta do servidor (HTTP " + cValToChar(nHttp) + ")"

			Else

				oJson := JsonObject():New()

				If oJson:FromJson(cResp) == Nil

					If ValType(oJson:GetJsonObject("message")) == "C"
						cErro := oJson:GetJsonObject("message")
					EndIf

					If ValType(oJson:GetJsonObject("code")) == "C"
						cErro := oJson:GetJsonObject("code") + " - " + cErro
					EndIf

					aDetail := oJson:GetJsonObject("details")

					If ValType(aDetail) == "A"
						For nX := 1 To Len(aDetail)
							cErro += " | " + cValToChar(aDetail[nX]:GetJsonObject("path")) + ": " + ;
								cValToChar(aDetail[nX]:GetJsonObject("message"))
						Next nX
					EndIf

				EndIf

				oJson := Nil

				If Empty(cErro)
					cErro := SubStr(cResp, 1, 250)
				EndIf

				cErro := AllTrim(cErro)

			EndIf

			// 429 (limite por IP) e 5xx sao transitorios: espera progressiva e
			// repete. 4xx de contrato (400/401/404/409) nao se resolve repetindo.
			If nHttp == 429 .Or. (nHttp >= 500 .And. nHttp <= 599) .Or. nHttp == 0

				If nTent < nMaxTent
					nEspera := nTent * nEspRetr
					FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", cVerbo + " " + cRota + " - HTTP " + cValToChar(nHttp) + ;
						" - tentativa " + cValToChar(nTent) + "/" + cValToChar(nMaxTent) + ;
						" - aguardando " + cValToChar(nEspera) + "ms", 0, 0, {})
					Sleep(nEspera)
				EndIf

			Else

				lSegue := .F.

			EndIf

		EndIf

	End

	If !lRet
		// URL inteira no log: um 404 sem o JSON da API quase sempre e base errada
		// em MV_BJAPI01, e so a URL completa mostra isso.
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", cVerbo + " " + cUrlBase + cRota + " - HTTP " + cValToChar(nHttp) + " - " + cErro, 0, 0, {})
	EndIf

Return lRet

/*/{Protheus.doc} BJCHAVE
Parte uma chave de integracao nos campos que o compoem, prontos para busca.
@type    User Function
@author  Ricardo P Sotomayor
@since   08/09/2026
@param   cChave , character, Chave de integracao recebida, com as partes separadas por "-"
@param   aCampos, array    , Campos do indice, na ordem. Ex.: {"A1_FILIAL", "A1_COD", "A1_LOJA"}
@return  array, Uma posicao por campo, ja no tamanho do dicionario. Vazio se nao casar
@example aP := U_BJCHAVE("01-11400443", {"B1_FILIAL", "B1_COD"})
/*/
User Function BJCHAVE(cChave, aCampos)

	Local aRet   := {}
	Local aParte := {}
	Local nX     := 0

	Default cChave  := ""
	Default aCampos := {}

	If Empty(cChave) .Or. Len(aCampos) == 0
		Return {}
	EndIf

	// U_BJPARTES, e nao StrTokArr: a filial de tabela compartilhada chega em
	// branco ("-000001-01") e precisa continuar ocupando a primeira posicao.
	// O RTrim tira o preenchimento de ZZ_CHVORI sem apagar parte vazia no fim,
	// que continua marcada pelo separador.
	aParte := U_BJPARTES(RTrim(cChave))

	// Contagem diferente aqui e codigo com hifen dentro de uma das partes.
	// Melhor recusar do que devolver as partes deslocadas uma casa.
	If Len(aParte) != Len(aCampos)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Chave " + cChave + " tem " + ;
			cValToChar(Len(aParte)) + " partes e o indice espera " + cValToChar(Len(aCampos)) + ".", 0, 0, {})
		Return {}
	EndIf

	For nX := 1 To Len(aCampos)
		aAdd(aRet, PadR(aParte[nX], TamSX3(aCampos[nX])[1]))
	Next nX

Return aRet

/*/{Protheus.doc} BJSEMFIL
Converte a chave devolvida pela plataforma no valor do ERP, sem filial e sem
hifen: as partes depois da filial, cada uma no tamanho do dicionario, coladas
como no indice do Protheus.
A plataforma devolve a chave como recebeu daqui (FILIAL-COD, com "-" entre os
campos do X2_UNICO). O hifen nao existe no ERP; e so separador da integracao.
@type    User Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@param   cChave , character, Chave recebida. Ex.: "01-000234" ou "-000234"
@param   aCampos, array    , Campos da chave unica, com a filial primeiro. Ex.: {"A3_FILIAL", "A3_COD"}
@return  character, Valor sem filial e sem hifen, no tamanho do dicionario. Vazio se nao casar
@example cVend := U_BJSEMFIL("-000234", {"A3_FILIAL", "A3_COD"})   // "000234"
/*/
User Function BJSEMFIL(cChave, aCampos)

	Local cRet   := ""
	Local aParte := {}
	Local aSemFl := {}
	Local nX     := 0

	Default cChave  := ""
	Default aCampos := {}

	If Empty(cChave) .Or. Len(aCampos) < 2
		Return ""
	EndIf

	aParte := U_BJCHAVE(cChave, aCampos)

	If Len(aParte) == Len(aCampos)
		For nX := 2 To Len(aParte)
			cRet += aParte[nX]
		Next nX

		Return cRet
	EndIf

	// Chave informada sem o prefixo de filial: as partes sao so os campos de
	// depois dela.
	For nX := 2 To Len(aCampos)
		aAdd(aSemFl, aCampos[nX])
	Next nX

	aParte := U_BJCHAVE(cChave, aSemFl)

	For nX := 1 To Len(aParte)
		cRet += aParte[nX]
	Next nX

Return cRet

/*/{Protheus.doc} BJPARTES
Separa uma chave de integracao nas partes, mantendo as vazias na posicao.
A chave e sempre filial + "-" + campos da chave. Em tabela compartilhada a
filial e branca e o codigo comeca pelo hifen ("-12"). StrTokArr descarta a
parte vazia e desloca as demais uma casa; esta funcao nao.
@type    User Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@param   cChave, character, Chave de integracao com as partes separadas por "-"
@return  array, Uma posicao por parte, sem trim. Vazio se cChave for vazia
@example aP := U_BJPARTES("-000001-01")   // {"", "000001", "01"}
/*/
User Function BJPARTES(cChave)

	Local aRet := {}
	Local nPos := 0

	Default cChave := ""

	If Empty(cChave)
		Return {}
	EndIf

	nPos := At("-", cChave)

	While nPos > 0
		aAdd(aRet, SubStr(cChave, 1, nPos - 1))
		cChave := SubStr(cChave, nPos + 1)
		nPos   := At("-", cChave)
	End

	aAdd(aRet, cChave)

Return aRet



// ===========================================================================
// A FILA (SZZ)
// ===========================================================================

/*/{Protheus.doc} BJENFILA
Poe uma mensagem na fila.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cTipo , character, "S" saida ou "E" entrada
@param   cEntid, character, Id da entidade no catalogo
@param   cChave, character, Chave de integracao na saida, id da plataforma na entrada
@param   cVerbo, character, POST, PATCH, DELETE ou GET
@param   cJson , character, Payload da mensagem
@param   cSeqMae, character, ZY_CODIGO do processamento (SZY) que gerou esta mensagem. Vazio na entrada
@return  character, Sequencia gravada, ou vazio quando falhou
@example cSeq := U_BJENFILA("S", "produtos", "01-11400443", "POST", cJson, cSeqMae)
/*/
User Function BJENFILA(cTipo, cEntid, cChave, cVerbo, cJson, cSeqMae)

	Local cSeq      := ""
	Local aArea     := GetArea()
	Local cQuerySeq := ""
	Local cAliasSeq := ""
	Local oStmtSeq  := Nil
	Local nTamSeq   := 0

	Default cTipo   := "S"   // saida: ERP -> plataforma
	Default cEntid  := ""
	Default cChave  := ""
	Default cVerbo  := "POST"
	Default cJson   := ""
	Default cSeqMae := ""

	If Empty(cEntid) .Or. Empty(cChave)
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mensagem sem entidade ou sem chave. Nao enfileirada.", 0, 0, {})
		RestArea(aArea)
		Return ""
	EndIf

	// Cada coleta enfileira o que mudou na SUA janela, e as janelas nao se
	// sobrepoem: a das 10:00 varre ate 10:00, a das 11:00 varre de 10:00 a 11:00.
	// Uma chave so reaparece se mudou de novo - e entao e mensagem nova mesmo,
	// estado novo em momento novo. Nada aqui reaproveita nem sobrescreve linha.
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

	dbSelectArea("SZZ")
	RecLock("SZZ", .T.)
	SZZ->ZZ_FILIAL := xFilial("SZZ")
	SZZ->ZZ_CODIGO := cSeqMae
	SZZ->ZZ_SEQUEN := cSeq
	SZZ->ZZ_TIPO   := cTipo
	SZZ->ZZ_ENTID  := cEntid
	SZZ->ZZ_CHVORI := cChave
	SZZ->ZZ_VERBO  := cVerbo
	SZZ->ZZ_STATUS := "1"   // pendente
	SZZ->ZZ_HTTP   := 0
	SZZ->ZZ_JSON   := cJson
	SZZ->ZZ_DTCRIA := Date()
	SZZ->ZZ_HRCRIA := Time()
	SZZ->(MsUnlock())

	RestArea(aArea)

Return cSeq

/*/{Protheus.doc} BJGRAVA
Grava o resultado de uma mensagem da fila.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cSeq   , character, Sequencia da mensagem
@param   cStatus, character, "2" executada ou "3" erro
@param   nHttp  , numeric  , Codigo HTTP da resposta
@param   cRetorn, character, Corpo da resposta ou mensagem de erro
@param   cChvDes, character, Chave do registro gerado no destino, quando houver
@return  logical, .T. quando encontrou e gravou
@example U_BJGRAVA(cLote, cSeq, "2", 201, cResp, SC5->C5_NUM)
/*/
User Function BJGRAVA(cLote, cSeq, cStatus, nHttp, cRetorn, cChvDes)

	Local aArea := GetArea()

	Default cLote   := ""
	Default cSeq    := ""
	Default cStatus := "2"   // executada
	Default nHttp   := 0
	Default cRetorn := ""
	Default cChvDes := ""

	If Empty(cLote) .Or. Empty(cSeq)
		RestArea(aArea)
		Return .F.
	EndIf

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(1))   // ZZ_FILIAL + ZZ_CODIGO + ZZ_SEQUEN

	If !SZZ->(dbSeek(xFilial("SZZ") + PadR(cLote, TamSX3("ZZ_CODIGO")[1]) + PadR(cSeq, TamSX3("ZZ_SEQUEN")[1])))
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mensagem " + cSeq + " do lote " + cLote + " nao encontrada na fila.", 0, 0, {})
		RestArea(aArea)
		Return .F.
	EndIf

	RecLock("SZZ", .F.)
	SZZ->ZZ_STATUS := cStatus
	SZZ->ZZ_HTTP   := nHttp
	SZZ->ZZ_DTEXEC := Date()
	SZZ->ZZ_HREXEC := Time()
	SZZ->ZZ_RETORN := cRetorn

	If !Empty(cChvDes)
		SZZ->ZZ_CHVDES := cChvDes
	EndIf

	SZZ->(MsUnlock())

	RestArea(aArea)

Return .T.

/*/{Protheus.doc} BJTEVE
Indica se ja houve mensagem com um verbo para uma entidade e chave, em qualquer
status (pendente, executada ou com erro).
Usada pela coleta: registro que chega excluido sem nunca ter tido POST foi
incluido e excluido entre duas coletas, e a inclusao precisa ir antes do DELETE.
@type    User Function
@author  Ricardo P Sotomayor
@since   22/09/2026
@param   cTipo , character, "S" saida ou "E" entrada
@param   cEntid, character, Id da entidade
@param   cChave, character, Chave da mensagem
@param   cVerbo, character, Verbo procurado. Ex.: "POST"
@return  logical, .T. quando ja existe mensagem com o verbo
@example If !U_BJTEVE("S", "categorias", cChave, "POST")
/*/
User Function BJTEVE(cTipo, cEntid, cChave, cVerbo)

	Local lRet   := .F.
	Local aArea  := GetArea()
	Local cQuery := ""
	Local cAlias := ""
	Local oStmt  := Nil

	Default cTipo  := "S"   // saida: ERP -> plataforma
	Default cEntid := ""
	Default cChave := ""
	Default cVerbo := "POST"

	If Empty(cEntid) .Or. Empty(cChave)
		RestArea(aArea)
		Return .F.
	EndIf

	// Mesmo motivo do BJACHOU para ser consulta, e nao indice. Mensagem expurgada
	// pelo BJEXPURG some daqui: o registro antigo excluido reenvia o POST antes
	// do DELETE, o que so custa uma requisicao a mais.
	cQuery := "SELECT ZZ_SEQUEN "
	cQuery += "  FROM " + RetSqlName("SZZ") + " SZZ "
	cQuery += " WHERE SZZ.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SZZ.ZZ_FILIAL  = ? "
	cQuery += "   AND SZZ.ZZ_ENTID   = ? "
	cQuery += "   AND SZZ.ZZ_CHVORI  = ? "
	cQuery += "   AND SZZ.ZZ_TIPO    = ? "
	cQuery += "   AND SZZ.ZZ_VERBO   = ? "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, xFilial("SZZ"))
	oStmt:SetString(2, PadR(cEntid, TamSX3("ZZ_ENTID")[1]))
	oStmt:SetString(3, PadR(cChave, TamSX3("ZZ_CHVORI")[1]))
	oStmt:SetString(4, cTipo)
	oStmt:SetString(5, PadR(cVerbo, TamSX3("ZZ_VERBO")[1]))

	cAlias := oStmt:OpenAlias()
	lRet   := (cAlias)->(!Eof())

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

	RestArea(aArea)

Return lRet

/*/{Protheus.doc} BJACHOU
Indica se ja existe mensagem executada para uma entidade e chave.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cTipo  , character, "S" saida ou "E" entrada
@param   cEntid , character, Id da entidade
@param   cChave , character, Chave da mensagem
@param   cChvDes, character, [Referencia] Chave gerada no destino, quando houver
@return  logical, .T. quando ja existe mensagem executada
@example If U_BJACHOU("E", "orcamentos-pendentes", cIdPlat, @cPedido)
/*/
User Function BJACHOU(cTipo, cEntid, cChave, cChvDes)

	Local lRet   := .F.
	Local aArea  := GetArea()
	Local cQuery := ""
	Local cAlias := ""
	Local oStmt  := Nil

	Default cTipo   := "E"   // entrada: plataforma -> ERP
	Default cEntid  := ""
	Default cChave  := ""
	Default cChvDes := ""

	If Empty(cEntid) .Or. Empty(cChave)
		RestArea(aArea)
		Return .F.
	EndIf

	// Por consulta, e nao por indice: a SZZ so tem indice de lote + sequencia, que
	// e por onde tudo e processado. Esta pergunta e da entrada e roda uma vez por
	// documento recebido - o custo cabe.
	cQuery := "SELECT ZZ_CHVDES "
	cQuery += "  FROM " + RetSqlName("SZZ") + " SZZ "
	cQuery += " WHERE SZZ.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SZZ.ZZ_FILIAL  = ? "
	cQuery += "   AND SZZ.ZZ_ENTID   = ? "
	cQuery += "   AND SZZ.ZZ_CHVORI  = ? "
	cQuery += "   AND SZZ.ZZ_TIPO    = ? "
	cQuery += "   AND SZZ.ZZ_STATUS  = ? "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, xFilial("SZZ"))
	oStmt:SetString(2, PadR(cEntid, TamSX3("ZZ_ENTID")[1]))
	oStmt:SetString(3, PadR(cChave, TamSX3("ZZ_CHVORI")[1]))
	oStmt:SetString(4, cTipo)
	oStmt:SetString(5, "2")   // executada

	cAlias := oStmt:OpenAlias()

	If (cAlias)->(!Eof())
		lRet    := .T.
		cChvDes := AllTrim((cAlias)->ZZ_CHVDES)
	EndIf

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

	RestArea(aArea)

Return lRet

/*/{Protheus.doc} BJEXPURG
Apaga mensagens executadas mais velhas que o prazo de retencao.
@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   nDias, numeric, Dias de retencao. Zero usa MV_BJAPI11
@return  numeric, Quantidade de mensagens apagadas
@example nApagadas := U_BJEXPURG(0)
/*/
User Function BJEXPURG(nDias)

	Local nRet    := 0
	Local dLimite := CtoD("")
	Local aRecno  := {}
	Local cQuery  := ""
	Local cAlias  := ""
	Local oStmt   := Nil
	Local nX      := 0
	Local aArea   := GetArea()
	Local cTrava   := "BJPLA_EXPURGO"

	Default nDias := 0

	If nDias <= 0
		nDias := SuperGetMV("MV_BJAPI11", .F., 90)   // dias de retencao
	EndIf

	dLimite := Date() - nDias

	// Um expurgo por vez, venha do agendamento ou do monitor.
	If !LockByName(cTrava, .T., .F.)
		FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Expurgo ja em andamento. Chamada ignorada.", 0, 0, {})
		RestArea(aArea)
		Return 0
	EndIf

	// So anota o que apagar; apagar durante a leitura reposicionaria o cursor.
	// A data entra na propria consulta - pendente e com erro nunca sao apagadas,
	// por mais velhas que sejam.
	cQuery := "SELECT R_E_C_N_O_ AS RECSZZ "
	cQuery += "  FROM " + RetSqlName("SZZ") + " SZZ "
	cQuery += " WHERE SZZ.D_E_L_E_T_ = ' ' "
	cQuery += "   AND SZZ.ZZ_FILIAL  = ? "
	cQuery += "   AND SZZ.ZZ_STATUS  = ? "
	cQuery += "   AND SZZ.ZZ_DTCRIA  < ? "

	oStmt := FWExecStatement():New(ChangeQuery(cQuery))
	oStmt:SetString(1, xFilial("SZZ"))
	oStmt:SetString(2, "2")   // executada
	oStmt:SetString(3, DtoS(dLimite))

	cAlias := oStmt:OpenAlias()

	While (cAlias)->(!Eof())
		aAdd(aRecno, (cAlias)->RECSZZ)
		(cAlias)->(dbSkip())
	End

	(cAlias)->(dbCloseArea())
	oStmt:Destroy()

	dbSelectArea("SZZ")

	For nX := 1 To Len(aRecno)
		SZZ->(dbGoto(aRecno[nX]))
		RecLock("SZZ", .F.)
		SZZ->(dbDelete())
		SZZ->(MsUnlock())
		nRet += 1
	Next nX

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Expurgo da fila: " + cValToChar(nRet) + ;
		" mensagens executadas antes de " + DtoC(dLimite) + " foram apagadas.", 0, 0, {})

	UnLockByName(cTrava, .T., .F.)

	RestArea(aArea)

Return nRet



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

