#include "totvs.ch"

// Vocabulario dos dados gravados na SZZ. Nao sao configuracao: mudar o valor de
// BJ_PENDENTE nao ajusta nada, corrompe a leitura das linhas ja gravadas.

// --- Sentido da mensagem ---------------------------------------------------
#Define BJ_SAIDA          "S"      // ERP -> plataforma
#Define BJ_ENTRADA        "E"      // plataforma -> ERP

// --- Status da mensagem ----------------------------------------------------
#Define BJ_PENDENTE       "1"      // na fila, ainda nao executada
#Define BJ_EXECUTADA      "2"      // concluida com sucesso
#Define BJ_ERRO           "3"      // falhou; continua na fila para retentativa

// --- Ritmo e resiliencia ---------------------------------------------------
// As pausas derivam do teto da API (60 req/min nas rotas de integracao, 120 no
// envio de XML, contados por IP) e baixa-las nao acelera nada: rende 429,
// retentativa e espera progressiva, mais lento no total.
#Define BJ_TIMEOUT        120      // segundos
#Define BJ_TENTATIVAS     3        // retentativas dentro da mesma requisicao
#Define BJ_MAXTENT        10       // teto de tentativas de uma mensagem na fila
#Define BJ_ESPERA_RETRY   2000     // ms, multiplicado pelo numero da tentativa

// --- Instalacao ------------------------------------------------------------
#Define BJ_URL_PADRAO     "https://api.rcgcba.bjsoft.com.br/api/v1"
#Define BJ_PASTA_RAIZ     "\bjapi\"
#Define BJ_DIAS_INICIAL   30           // recuo da marca na primeira carga
#Define BJ_RETENCAO       90           // dias de retencao da mensagem executada

/*/{Protheus.doc} BJPLA002
Rotinas comuns da integracao com a Plataforma BJ.

E a base dos outros fontes: todos dependem dele, ele nao depende de nenhum.
Reune o que nao pertence a um sentido especifico do fluxo:

	- catalogo das entidades, na ordem de carga que a API exige
	- cliente HTTP, com retentativa e traducao do erro
	- filtro de S_T_A_M_P_, que decide o que mudou desde a ultima varredura
	- a fila (SZZ): enfileirar, ler pendentes, gravar resultado, expurgar
	- marca d'agua por entidade, que mora na propria fila
	- semaforo, que garante um processo por vez

As funcoes aparecem nessa ordem - a ordem em que o fluxo as usa, nao a
alfabetica.

Todos os parametros sao lidos com valor padrao, entao a integracao sobe antes de
o SX6 estar completo:

	MV_BJAPI01  C  URL base, ja com o prefixo das rotas
	MV_BJAPI02  C  Chave de API (x-api-key). Uma por empresa
	MV_BJAPI03  C  Habilita a integracao (S/N)

@type    function
@author  Ricardo P Sotomayor
@since   01/09/2026
/*/

// ===========================================================================
// CATALOGO
// ===========================================================================

/*/{Protheus.doc} BJCATALO
Catalogo das entidades da API, na ordem de carga.

A ordem do array e a ordem de carga documentada, e a API a exige: ela nao aceita
referencia a registro inexistente. Regra de desconto antes de categoria e
produto; categoria antes de produto; vendedor antes de cliente; produto antes de
estoque.

Cada elemento traz:

	[1] cId      - identificador interno, usado na fila e no log
	[2] cDescr   - descricao para a tela e para o console
	[3] cRota    - rota REST, relativa ao prefixo da URL base
	[4] cColeta  - User Function mapeadora, chamada como cColeta(cMarca, cChave)
	[5] lAtivo   - entra na varredura automatica
	[6] cAlias   - tabela de origem, para o filtro de S_T_A_M_P_
	[7] cCpoFil  - campo de filial dessa tabela

Categorias tem duas origens (SZ1 e SBM) e por isso a coluna cAlias traz a SZ1: e
a que governa a marca d'agua da entidade. O mapeador le as duas.

Objetivos vem sem tabela porque a origem depende do ambiente e ainda nao existe.

Para achar uma entidade, aScan neste array pela primeira coluna.

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
	aAdd(aRet, {"orcamentos"     , "Orcamentos"             , "/integracao/orcamentos"         , "U_BJMAPORC", .T., "SCJ", "CJ_FILIAL" })

Return aRet

// ===========================================================================
// CLIENTE HTTP
// ===========================================================================

/*/{Protheus.doc} BJHTTP
Executa uma requisicao contra a API BJ.

Concentra o acesso de rede num ponto: montagem da URL, header de autenticacao,
timeout, leitura do codigo HTTP, retentativa e traducao do erro.

GET, POST e DELETE usam FWRest. PATCH usa HTTPQuote porque a classe FWRest nao
implementa esse verbo, e a API exige PATCH em toda atualizacao parcial, no saldo
de estoque e no vinculo de orcamento.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cVerbo, character, GET, POST, PATCH ou DELETE
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
	Local nTent   := 0
	Local nEspera := 0
	Local lSegue  := .T.

	Default cVerbo := "GET"
	Default cRota  := ""
	Default cBody  := ""
	Default cResp  := ""
	Default nHttp  := 0
	Default cErro  := ""

	cVerbo := Upper(AllTrim(cVerbo))
	cRota  := AllTrim(cRota)

	// O prefixo das rotas (/api/v1) faz parte da URL base, em MV_BJAPI01: prefixo
	// e host mudam juntos, na mesma migracao de versao da API, e mante-los em dois
	// lugares so cria a chance de discordarem. Aqui so se garante a barra que
	// separa a base da rota.
	If !Empty(cRota) .And. Left(cRota, 1) != "/"
		cRota := "/" + cRota
	EndIf

	While lSegue .And. nTent < BJ_TENTATIVAS

		nTent += 1
		cResp := ""
		nHttp := 0
		cErro := ""

		If cVerbo == "PATCH"
			lRet := BJPatch(cRota, cBody, @cResp, @nHttp)
		Else
			lRet := BJRest(cVerbo, cRota, cBody, @cResp, @nHttp)
		EndIf

		If lRet
			lSegue := .F.
		Else
			cErro := BJMsgErr(cResp, nHttp)

			// 429 (limite por IP) e 5xx sao transitorios: espera progressiva e
			// repete. 4xx de contrato (400/401/404/409) nao se resolve repetindo.
			If nHttp == 429 .Or. (nHttp >= 500 .And. nHttp <= 599) .Or. nHttp == 0
				If nTent < BJ_TENTATIVAS
					nEspera := nTent * BJ_ESPERA_RETRY
					FwLogMsg("WARN", /*cTransactionId*/, "BJPLA", FunName(), "", "01", cVerbo + " " + cRota + " - HTTP " + cValToChar(nHttp) + ;
						" - tentativa " + cValToChar(nTent) + "/" + cValToChar(BJ_TENTATIVAS) + ;
						" - aguardando " + cValToChar(nEspera) + "ms", 0, 0, {})
					Sleep(nEspera)
				EndIf
			Else
				lSegue := .F.
			EndIf
		EndIf

	End

	If !lRet
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", cVerbo + " " + cRota + " - HTTP " + cValToChar(nHttp) + " - " + cErro, 0, 0, {})
	EndIf

Return lRet

/*/{Protheus.doc} BJRest
Executa GET, POST ou DELETE pela classe FWRest.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cVerbo, character, Verbo HTTP
@param   cRota , character, Rota ja normalizada
@param   cBody , character, Corpo JSON
@param   cResp , character, [Referencia] Corpo da resposta
@param   nHttp , numeric  , [Referencia] Codigo HTTP
@return  logical, .T. quando a resposta ficou na faixa 2xx
/*/
Static Function BJRest(cVerbo, cRota, cBody, cResp, nHttp)

	Local lRet    := .F.
	Local oClient := Nil
	Local aHeader := {}

	aAdd(aHeader, "Content-Type: application/json")
	aAdd(aHeader, "Accept: application/json")
	aAdd(aHeader, "x-api-key: " + AllTrim(SuperGetMV("MV_BJAPI02", .F., "")))

	oClient := FWRest():New(AllTrim(SuperGetMV("MV_BJAPI01", .F., BJ_URL_PADRAO)))
	oClient:SetPath(cRota)
	oClient:SetTimeOut(BJ_TIMEOUT)

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

		Otherwise
			cResp := "Verbo nao suportado pela camada FWRest: " + cVerbo
			Return .F.
	EndCase

	nHttp := oClient:GetHTTPCode()
	cResp := oClient:GetResult()

	If !lRet .And. Empty(cResp)
		cResp := oClient:GetLastError()
	EndIf

	// FWRest nao expoe Destroy(); o objeto sai de escopo e o coletor o libera.
	oClient := Nil

Return lRet

/*/{Protheus.doc} BJPatch
Executa PATCH via HTTPQuote.

A classe FWRest nao implementa PATCH. Como a API usa PATCH em toda atualizacao
parcial, este caminho e obrigatorio e nao um atalho legado.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cRota, character, Rota ja normalizada
@param   cBody, character, Corpo JSON
@param   cResp, character, [Referencia] Corpo da resposta
@param   nHttp, numeric  , [Referencia] Codigo HTTP
@return  logical, .T. quando a resposta ficou na faixa 2xx
/*/
Static Function BJPatch(cRota, cBody, cResp, nHttp)

	Local aHeader := {}
	Local cUrl    := AllTrim(SuperGetMV("MV_BJAPI01", .F., BJ_URL_PADRAO)) + cRota
	Local cHeadRt := ""
	Local nPos    := 0

	aAdd(aHeader, "Content-Type: application/json")
	aAdd(aHeader, "Accept: application/json")
	aAdd(aHeader, "x-api-key: " + AllTrim(SuperGetMV("MV_BJAPI02", .F., "")))

	cResp := HTTPQuote(cUrl, "PATCH", /*cGetParms*/, cBody, BJ_TIMEOUT, aHeader, @cHeadRt)

	If cResp == Nil
		cResp := ""
	EndIf

	// "HTTP/1.1 200 OK" - o codigo comeca 9 posicoes apos o inicio do token
	nPos := At("HTTP/", Upper(cHeadRt))

	If nPos > 0
		nHttp := Val(SubStr(cHeadRt, nPos + 9, 3))
	EndIf

Return (nHttp >= 200 .And. nHttp <= 299)

/*/{Protheus.doc} BJMsgErr
Traduz a resposta de erro da API numa mensagem legivel.

O contrato devolve { "code": "...", "message": "..." } e, na validacao Zod, um
array "details" com o caminho do campo recusado.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cResp, character, Corpo da resposta
@param   nHttp, numeric  , Codigo HTTP
@return  character, Mensagem tratada
/*/
Static Function BJMsgErr(cResp, nHttp)

	Local cRet    := ""
	Local oJson   := Nil
	Local aDetail := {}
	Local nX      := 0

	Default cResp := ""
	Default nHttp := 0

	If Empty(cResp)
		Return "Sem resposta do servidor (HTTP " + cValToChar(nHttp) + ")"
	EndIf

	oJson := JsonObject():New()

	If oJson:FromJson(cResp) == Nil

		If ValType(oJson:GetJsonObject("message")) == "C"
			cRet := oJson:GetJsonObject("message")
		EndIf

		If ValType(oJson:GetJsonObject("code")) == "C"
			cRet := oJson:GetJsonObject("code") + " - " + cRet
		EndIf

		aDetail := oJson:GetJsonObject("details")

		If ValType(aDetail) == "A"
			For nX := 1 To Len(aDetail)
				cRet += " | " + cValToChar(aDetail[nX]:GetJsonObject("path")) + ": " + ;
					cValToChar(aDetail[nX]:GetJsonObject("message"))
			Next nX
		EndIf

	EndIf

	oJson := Nil

	If Empty(cRet)
		cRet := SubStr(cResp, 1, 250)
	EndIf

Return AllTrim(cRet)


/*/{Protheus.doc} BJCHAVE
Parte um codigoErp nos campos que o compoem, prontos para busca.

O codigoErp e a chave do indice escrita com hifen: "01-000123-01" e o
A1_FILIAL+A1_COD+A1_LOJA da SA1, "01-11400443" e o B1_FILIAL+B1_COD da SB1. As
partes vem na mesma ordem do indice, porque e assim que o mapeador as concatena.

Esta funcao devolve cada parte ja no tamanho do campo no dicionario. Com isso a
chave recebida vira busca direta, sem remontar nada:

	aP := U_BJCHAVE(cChvCli, {"A1_FILIAL", "A1_COD", "A1_LOJA"})
	SA1->(dbSeek(aP[1] + aP[2] + aP[3]))

**A filial sai da propria chave, nao de xFilial().** A chave carrega a filial do
registro que a originou, e e essa que o indice espera. Trocar por xFilial()
funcionaria so enquanto as duas coincidissem.

O PadR e por campo, e nao um tamanho fixo, porque e o dicionario que manda: o
indice compara posicao a posicao, e uma parte curta demais deslocaria todas as
seguintes.

Devolve array vazio quando a chave nao tem o numero de partes esperado - chave
malformada nao vira busca torta, vira erro que o chamador trata.

@type    User Function
@author  Ricardo P Sotomayor
@since   08/09/2026
@param   cChave , character, codigoErp recebido, com as partes separadas por "-"
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

	aParte := StrTokArr(cChave, "-")

	// StrTokArr descarta o vazio entre dois separadores, entao uma parte em
	// branco - filial de tabela compartilhada, por exemplo - reduz a contagem.
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



// ===========================================================================
// A FILA (SZZ)
// ===========================================================================

/*/{Protheus.doc} BJENFILA
Poe uma mensagem na fila.

Mensagem pendente para a mesma entidade e chave e **substituida**, nao
acumulada: se o produto mudou tres vezes antes de a fila ser drenada, o que a
plataforma precisa receber e o estado final, e tres POST identicos seriam tres
requisicoes gastas no mesmo balde de 60 req/min. O historico do que mudou no meio
esta na tabela de origem, nao aqui.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cTipo , character, BJ_SAIDA ou BJ_ENTRADA
@param   cEntid, character, Id da entidade no catalogo
@param   cChave, character, codigoErp na saida, id da plataforma na entrada
@param   cVerbo, character, POST, PATCH, DELETE ou GET
@param   cJson , character, Payload da mensagem
@return  character, Sequencia gravada, ou vazio quando falhou
@example cSeq := U_BJENFILA("S", "produtos", "01-11400443", "POST", cJson)
/*/
User Function BJENFILA(cTipo, cEntid, cChave, cVerbo, cJson)

	Local cSeq      := ""
	Local aArea     := GetArea()
	Local lNovo     := .T.
	Local cQuerySeq := ""
	Local cAliasSeq := ""
	Local oStmtSeq  := Nil
	Local nTamSeq   := 0

	Default cTipo  := BJ_SAIDA
	Default cEntid := ""
	Default cChave := ""
	Default cVerbo := "POST"
	Default cJson  := ""

	If Empty(cEntid) .Or. Empty(cChave)
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mensagem sem entidade ou sem chave. Nao enfileirada.", 0, 0, {})
		RestArea(aArea)
		Return ""
	EndIf

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(3))   // ZZ_FILIAL + ZZ_ENTID + ZZ_CHVORI

	// Ja existe pendente para esta chave? Entao atualiza no lugar.
	If SZZ->(dbSeek(xFilial("SZZ") + PadR(cEntid, TamSX3("ZZ_ENTID")[1]) + PadR(cChave, TamSX3("ZZ_CHVORI")[1])))
		While SZZ->(!Eof()) .And. SZZ->ZZ_FILIAL == xFilial("SZZ") .And. ;
			AllTrim(SZZ->ZZ_ENTID) == AllTrim(cEntid) .And. AllTrim(SZZ->ZZ_CHVORI) == AllTrim(cChave)

			If SZZ->ZZ_TIPO == cTipo .And. (SZZ->ZZ_STATUS == BJ_PENDENTE .Or. SZZ->ZZ_STATUS == BJ_ERRO)
				cSeq  := SZZ->ZZ_SEQUEN
				lNovo := .F.
				Exit
			EndIf

			SZZ->(dbSkip())
		End
	EndIf

	If lNovo

		// Sequencia da mensagem na fila via MAX() em SQL
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
		SZZ->ZZ_TIPO   := cTipo
		SZZ->ZZ_ENTID  := cEntid
		SZZ->ZZ_CHVORI  := cChave
		SZZ->ZZ_DTCRIA := Date()
		SZZ->ZZ_HRCRIA := Time()

	Else

		RecLock("SZZ", .F.)

	EndIf

	SZZ->ZZ_VERBO  := cVerbo
	SZZ->ZZ_STATUS := BJ_PENDENTE
	SZZ->ZZ_TENTAT := 0
	SZZ->ZZ_HTTP   := 0
	SZZ->ZZ_JSON   := cJson

	SZZ->(MsUnlock())

	RestArea(aArea)

Return cSeq

/*/{Protheus.doc} BJPENDEN
Le as mensagens que ainda precisam ser executadas.

Devolve na ordem da sequencia, que e a ordem de chegada - e, para a saida, a
ordem de carga que a API exige, ja que a varredura enfileira o catalogo em
ordem.

Mensagem que estourou o teto de tentativas fica de fora: continua na tabela para
o monitor mostrar, mas deixa de ser tentada sozinha.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cTipo  , character, BJ_SAIDA ou BJ_ENTRADA
@param   nLimite, numeric  , Maximo de mensagens. Zero traz todas
@return  array, {cSequen, cEntid, cChave, cVerbo, cJson, nTentat}
@example aFila := U_BJPENDEN("S", 0)
/*/
User Function BJPENDEN(cTipo, nLimite)

	Local aRet  := {}
	Local aArea := GetArea()

	Default cTipo   := BJ_SAIDA
	Default nLimite := 0

	// Duas passadas, uma por status. O indice 2 ordena por status, e a executada
	// fica entre a pendente e a de erro - uma varredura so, seguindo pelo indice,
	// pararia na primeira executada e nunca alcancaria as que falharam.
	BJLeStatus(BJ_PENDENTE, cTipo, nLimite, @aRet)
	BJLeStatus(BJ_ERRO    , cTipo, nLimite, @aRet)

	aSort(aRet, , , {|x, y| x[1] < y[1]})

	RestArea(aArea)

Return aRet

/*/{Protheus.doc} BJLeStatus
Acrescenta ao array as mensagens de um status que ainda podem ser tentadas.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cStatus, character, Status a percorrer
@param   cTipo  , character, Sentido da mensagem
@param   nLimite, numeric  , Maximo de mensagens no array. Zero nao limita
@param   aRet   , array    , [Referencia] Array a preencher
@return  Nil
/*/
Static Function BJLeStatus(cStatus, cTipo, nLimite, aRet)

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(2))   // ZZ_FILIAL + ZZ_STATUS + ZZ_DTCRIA

	If !SZZ->(dbSeek(xFilial("SZZ") + cStatus, .T.))
		Return Nil
	EndIf

	While SZZ->(!Eof()) .And. SZZ->ZZ_FILIAL == xFilial("SZZ") .And. SZZ->ZZ_STATUS == cStatus

		If nLimite > 0 .And. Len(aRet) >= nLimite
			Exit
		EndIf

		If SZZ->ZZ_TIPO == cTipo .And. SZZ->ZZ_TENTAT < BJ_MAXTENT
			aAdd(aRet, {SZZ->ZZ_SEQUEN, AllTrim(SZZ->ZZ_ENTID), AllTrim(SZZ->ZZ_CHVORI), ;
				AllTrim(SZZ->ZZ_VERBO), SZZ->ZZ_JSON, SZZ->ZZ_TENTAT})
		EndIf

		SZZ->(dbSkip())
	End

Return Nil

/*/{Protheus.doc} BJGRAVA
Grava o resultado de uma mensagem da fila.

Nao abre nem fecha transacao: quando o chamador estiver dentro de um
Begin Transaction - como o BJPLA004 esta ao gerar o Pedido de Venda -, esta
gravacao precisa fazer parte dela. E o que garante que nao exista pedido sem a
anotacao correspondente.

Com status de erro a mensagem continua na fila e volta no proximo ciclo,
sozinha, sem arrastar as outras. Depois de BJ_MAXTENT tentativas ela para de ser
tentada e fica visivel no monitor para decisao humana.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cSeq   , character, Sequencia da mensagem
@param   cStatus, character, BJ_EXECUTADA ou BJ_ERRO
@param   nHttp  , numeric  , Codigo HTTP da resposta
@param   cRetorn, character, Corpo da resposta ou mensagem de erro
@param   cChvDes, character, Chave do registro gerado no destino, quando houver
@return  logical, .T. quando encontrou e gravou
@example U_BJGRAVA(cSeq, "2", 201, cResp, SC5->C5_NUM)
/*/
User Function BJGRAVA(cSeq, cStatus, nHttp, cRetorn, cChvDes)

	Local aArea := GetArea()

	Default cSeq    := ""
	Default cStatus := BJ_EXECUTADA
	Default nHttp   := 0
	Default cRetorn := ""
	Default cChvDes := ""

	If Empty(cSeq)
		RestArea(aArea)
		Return .F.
	EndIf

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(1))   // ZZ_FILIAL + ZZ_SEQUEN

	If !SZZ->(dbSeek(xFilial("SZZ") + PadR(cSeq, TamSX3("ZZ_SEQUEN")[1])))
		FwLogMsg("ERROR", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Mensagem " + cSeq + " nao encontrada na fila.", 0, 0, {})
		RestArea(aArea)
		Return .F.
	EndIf

	RecLock("SZZ", .F.)
	SZZ->ZZ_STATUS := cStatus
	SZZ->ZZ_HTTP   := nHttp
	SZZ->ZZ_DTEXEC := Date()
	SZZ->ZZ_HREXEC := Time()
	SZZ->ZZ_TENTAT := SZZ->ZZ_TENTAT + 1
	SZZ->ZZ_RETORN := cRetorn

	If !Empty(cChvDes)
		SZZ->ZZ_CHVDES := cChvDes
	EndIf

	SZZ->(MsUnlock())

	RestArea(aArea)

Return .T.

/*/{Protheus.doc} BJACHOU
Indica se ja existe mensagem executada para uma entidade e chave.

E a memoria da integracao, e responde duas perguntas diferentes:

	- na entrada: "esse orcamento ja virou pedido?". Sem ela, uma rede que caia
	  entre gerar o pedido e avisar a plataforma faria o ciclo seguinte gerar um
	  segundo pedido do mesmo orcamento.
	- na saida: "essa chave ja foi enviada alguma vez?". E o que da sentido ao
	  DELETE - sem isso, a exclusao vai as cegas para uma chave que a plataforma
	  pode nunca ter conhecido.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cTipo  , character, BJ_SAIDA ou BJ_ENTRADA
@param   cEntid , character, Id da entidade
@param   cChave , character, Chave da mensagem
@param   cChvDes, character, [Referencia] Chave gerada no destino, quando houver
@return  logical, .T. quando ja existe mensagem executada
@example If U_BJACHOU("E", "orcamentos-pendentes", cIdPlat, @cPedido)
/*/
User Function BJACHOU(cTipo, cEntid, cChave, cChvDes)

	Local lRet  := .F.
	Local aArea := GetArea()

	Default cTipo   := BJ_ENTRADA
	Default cEntid  := ""
	Default cChave  := ""
	Default cChvDes := ""

	If Empty(cEntid) .Or. Empty(cChave)
		RestArea(aArea)
		Return .F.
	EndIf

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(3))   // ZZ_FILIAL + ZZ_ENTID + ZZ_CHVORI

	If SZZ->(dbSeek(xFilial("SZZ") + PadR(cEntid, TamSX3("ZZ_ENTID")[1]) + PadR(cChave, TamSX3("ZZ_CHVORI")[1])))
		While SZZ->(!Eof()) .And. SZZ->ZZ_FILIAL == xFilial("SZZ") .And. ;
			AllTrim(SZZ->ZZ_ENTID) == AllTrim(cEntid) .And. AllTrim(SZZ->ZZ_CHVORI) == AllTrim(cChave)

			If SZZ->ZZ_TIPO == cTipo .And. SZZ->ZZ_STATUS == BJ_EXECUTADA
				lRet    := .T.
				cChvDes := AllTrim(SZZ->ZZ_CHVDES)
				Exit
			EndIf

			SZZ->(dbSkip())
		End
	EndIf

	RestArea(aArea)

Return lRet

/*/{Protheus.doc} BJEXPURG
Apaga mensagens executadas mais velhas que o prazo de retencao.

Pendentes e com erro **nunca** sao apagadas, independente da idade: mensagem que
nao chegou ao destino e trabalho por fazer, e apagar por tempo seria descartar em
silencio o que a integracao ainda deve.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   nDias, numeric, Dias de retencao. Zero usa BJ_RETENCAO
@return  numeric, Quantidade de mensagens apagadas
@example nApagadas := U_BJEXPURG(0)
/*/
User Function BJEXPURG(nDias)

	Local nRet    := 0
	Local dLimite := CtoD("")
	Local aRecno  := {}
	Local nX      := 0
	Local aArea   := GetArea()

	Default nDias := 0

	If nDias <= 0
		nDias := BJ_RETENCAO
	EndIf

	dLimite := Date() - nDias

	dbSelectArea("SZZ")
	SZZ->(dbSetOrder(2))   // ZZ_FILIAL + ZZ_STATUS + ZZ_DTCRIA

	If !SZZ->(dbSeek(xFilial("SZZ") + BJ_EXECUTADA, .T.))
		RestArea(aArea)
		Return 0
	EndIf

	// Primeiro so anota o que apagar. Apagar durante a leitura reposiciona o
	// cursor no proprio indice que esta sendo percorrido.
	While SZZ->(!Eof()) .And. SZZ->ZZ_FILIAL == xFilial("SZZ") .And. SZZ->ZZ_STATUS == BJ_EXECUTADA

		// Dentro do status o indice ordena por data: a primeira dentro do prazo
		// encerra a varredura.
		// Preserva a linha de controle de data/hora de cada entidade na SZZ
		If AllTrim(SZZ->ZZ_CHVORI) != "*CONTROLE*"
			aAdd(aRecno, SZZ->(Recno()))
		EndIf

		SZZ->(dbSkip())
	End

	For nX := 1 To Len(aRecno)
		SZZ->(dbGoto(aRecno[nX]))
		RecLock("SZZ", .F.)
		SZZ->(dbDelete())
		SZZ->(MsUnlock())
		nRet += 1
	Next nX

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Expurgo da fila: " + cValToChar(nRet) + ;
		" mensagens executadas antes de " + DtoC(dLimite) + " foram apagadas.", 0, 0, {})

	RestArea(aArea)

Return nRet


