#INCLUDE 'TOTVS.CH'
#INCLUDE 'PROTHEUS.CH'
#INCLUDE 'PARMTYPE.CH'
#INCLUDE 'RESTFUL.CH'

/*
ÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜÜ
±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±
±±ÉÍÍÍÍÍÍÍÍÍÍÑÍÍÍÍÍÍÍÍÍÍËÍÍÍÍÍÍÍÑÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍËÍÍÍÍÍÍÑÍÍÍÍÍÍÍÍÍÍÍÍÍ»±±
±±ºPrograma  ³GEOCOD    ºAutor  ³Ricardo P Sotomayor º Data ³  10/30/18   º±±
±±ÌÍÍÍÍÍÍÍÍÍÍØÍÍÍÍÍÍÍÍÍÍÊÍÍÍÍÍÍÍÏÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÊÍÍÍÍÍÍÏÍÍÍÍÍÍÍÍÍÍÍÍÍ¹±±
±±ºDesc.     ³ Retorna Latitude e Longitudo do endereço passado como      º±±
±±º          ³ Paramentro. Necessario KeyApi Google                       º±±
±±ÌÍÍÍÍÍÍÍÍÍÍØÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍ¹±±
±±ºUso       ³ AP                                                         º±±
±±ÈÍÍÍÍÍÍÍÍÍÍÏÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍÍ¼±±
±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±±
ßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßßß
*/

User Function GeoCod(_cEnd, _cRetJson)
	Local oRestCli
	Local oJson
	Local oLocation
	Local aResult
	Local cKeyApi := ""
	Local cStatus := ""
	Local _cLocal := "" ///RUA ONDINA STEIN ROLIM, 240,RECANTO DO CERRADO,CAMPO GRANDE,MS"
	Local _cUrl   := "https://maps.googleapis.com/maps/api/geocode/json"
	Local aHeader := {}
	Local _lJob   := .F.
	Local _cEmp   := ""
	Local _cFil   := ""
	// Vazio quando nao achou: quem chama so grava coordenada se vierem as duas
	Local aRet    := {}
	Local _aTabela:= {"SMO","SX1","SX2","SX3","SX6","SA1","SA2","SRA"}
	Default _cEnd := ""
	// _cRetJson: passe por referencia (@) para receber a resposta do Google
	Default _cRetJson := ""

	If Select('SX2') == 0
		If Type("cEmpAnt") == "U"
			_cEmp := "99"
			_cFil := "99"
		Else
			_cEmp := cEmpAnt
			_cFil := cFilAnt
		EndIf
		_lJob	:= .T.
		RPCSetType(3)					//Não consome licenca de uso
		RpcSetEnv( _cEmp, _cFil,,,,, _aTabela )
	Endif
	// Chamado de dentro de outro job (UPD_SA1) o ambiente ja existe, mas nao ha tela
	_lJob := _lJob .Or. IsBlind()

	Conout('Inicio '+Time())

	If !Empty(_cEnd)
		_cLocal := _cEnd
	EndIf
	_cLocal := GeoUrlEnc(AllTrim(_cLocal))

	//If !ExisteSX6("MV_XKEYAPI")
	//	CriarSX6("MV_XKEYAPI","C","YOUR_API_KEY Google.https://cloud.google.com/maps-platform/#get-started","")
	//EndIf

	cKeyApi:= 'AIzaSyAmXwMSzayhp6B_t47KxlafWECVOElwMdA' //Alltrim(GetMV("MV_XKEYAPI"))
	// region/components: so resultados no Brasil - fora dele volta ZERO_RESULTS
	_cUrl  := _cUrl+"?address="+_cLocal+"&region=br&components=country:BR&key="+cKeyApi

	If Empty(cKeyApi) .or. Empty(_cLocal)
		If _lJob
			Conout('Configurar os Parametros "MV_XKEYAPI" e "MV_XGEOCOD" com a API_KEY e URL Google ')
		Else
			Aviso('Atenção','Configurar os Parametros "MV_XKEYAPI" e "MV_XGEOCOD" com a API_KEY e URL Google',{"Fechar"})
		End
		Return(aRet)
	EndIf

	oRestCli:= FWRest():New(_cUrl)
	oRestCli:setPath("")
	If oRestCli:Get(aHeader)
		_cRetJson := oRestCli:GetResult()
		oJson := JsonObject():New()
		// FromJson devolve Nil quando deu certo e o texto do erro quando nao
		If ValType(oJson:FromJson(_cRetJson)) == "U"
			// O Google responde HTTP 200 tambem no erro; o motivo vem no status:
			// ZERO_RESULTS, OVER_QUERY_LIMIT, REQUEST_DENIED (chave/cobranca), INVALID_REQUEST
			cStatus := Iif(ValType(oJson["status"]) == "C", oJson["status"], "")
			aResult := oJson["results"]
			If cStatus == "OK" .And. ValType(aResult) == "A" .And. Len(aResult) > 0
				// O primeiro resultado e o mais provavel
				If ValType(aResult[1]) == "J" .And. ValType(aResult[1]["geometry"]) == "J"
					oLocation := aResult[1]["geometry"]["location"]
					If ValType(oLocation) == "J" .And. ValType(oLocation["lat"]) == "N" .And. ValType(oLocation["lng"]) == "N"
						aRet := {cValToChar(oLocation["lat"]),cValToChar(oLocation["lng"])}
					EndIf
				EndIf
			Else
				Conout('GeoCod - status "'+cStatus+'"'+Iif(ValType(oJson["error_message"]) == "C", ': '+oJson["error_message"], '')+' - endereco: '+_cEnd)
			EndIf
		Else
			Conout('GeoCod - resposta ilegivel para o endereco: '+_cEnd)
		EndIf
		FreeObj(oJson)
	Else
		If _lJob
			conout(oRestCli:GetLastError())
		Else
			Aviso('Atenção','Erro: '+oRestCli:GetLastError(),{"Fechar"})
		End
	Endif
	FreeObj(oRestCli)

	Conout('Fim '+Time())

Return(aRet)

// Codifica o endereco para a URL (UTF-8 + percent-encoding; espaco vira "+").
// Aceita texto em UTF-8 (endereco da MinhaReceita) ou CP1252 (endereco da SA1):
// o que nao e UTF-8 valido e convertido antes, para nao codificar duas vezes.
Static Function GeoUrlEnc(cTxt)
	Local cHex := "0123456789ABCDEF"
	Local cUtf := DecodeUTF8(cTxt)
	Local cRet := ""
	Local cCar := ""
	Local nAsc := 0
	Local nI   := 0

	If ValType(cUtf) == "C" .And. !Empty(cUtf)
		cUtf := cTxt
	Else
		cUtf := EncodeUTF8(cTxt)
	EndIf

	For nI := 1 To Len(cUtf)
		cCar := SubStr(cUtf, nI, 1)
		nAsc := Asc(cCar)
		Do Case
			Case cCar == " "
				cRet += "+"
			Case IsAlpha(cCar) .And. nAsc < 128
				cRet += cCar
			Case IsDigit(cCar) .Or. cCar $ "-_.~"
				cRet += cCar
			Otherwise
				cRet += "%" + SubStr(cHex, Int(nAsc / 16) + 1, 1) + SubStr(cHex, (nAsc % 16) + 1, 1)
		EndCase
	Next nI
Return cRet

User Function GeoCodSA1()//U_GeoCodSA1()
	Local cEnd := ""
	Local _aTabela:= {"SMO","SX1","SX2","SX3","SX6","SA1","SA2","SRA"}
	Local _nLop := 0
	Local _lJob := .F.
	Local _cEmp := ""
	Local _cFil := ""
	Local aRet
	Local _cDir := "\geocode\"
	Local _cJson := ""

	If Select('SX2') == 0
		If Type("cEmpAnt") == "U"
			_cEmp := "02"
			_cFil := "01"
		Else
			_cEmp := cEmpAnt
			_cFil := cFilAnt
		EndIf
		_lJob	:= .T.
		RPCSetType(3)					//Não consome licenca de uso
		//PREPARE ENVIRONMENT EMPRESA _cEmp FILIAL _cFil MODULO "FIN" TABLES "SMO","SX1","SX2","SX3","SX6","SA1","SE2" // PREPARE ENVIRONMENT EMPRESA _cEmp FILIAL _cFil MODULO "FIN"
		RpcSetEnv( _cEmp, _cFil,,,,, _aTabela )
		sleep(5000)
	Endif

	DbSelectArea("SA1")
	DbGoTop()
	DbSetOrder(1)

	If SA1->(FieldPos("A1_XLAT")) == 0 ;
		.OR. SA1->(FieldPos("A1_XLNG")) == 0 ;
		.OR. SA1->(FieldPos("A1_XLATLNG")) == 0
		Aviso('Atenção','Campos para Coordenadas não existem',{"Fechar"})
		Return
	EndIf

	While SA1->(!Eof()) //.And. !_lErro
		_nLop += 1	//RUA ONDINA STEIN ROLIM, 240,RECANTO DO CERRADO,CAMPO GRANDE,MS
		cEnd := Alltrim(SA1->A1_END)
		If SA1->A1_PESSOA == 'J' .And. !Empty(SA1->A1_CGC) .And. A1_XMOTBLQ <> 'F' .And. SA1->A1_COD <> "000000"
		//If SA1->A1_MSBLQL <> '1' .And. !Empty(cEnd) .And. "RUA" <> cEnd .And. SA1->A1_XLATLNG < Date()+30
			cEnd += ","+Alltrim(SA1->A1_BAIRRO)
			cEnd += ","+Alltrim(SA1->A1_MUN)
			cEnd += ","+Alltrim(SA1->A1_EST)
			If SA1->A1_XLATLNG < Date()+30 .Or. Alltrim(SA1->A1_XLAT) == "0".Or. Alltrim(SA1->A1_XLNG) == "0"
				aRet := U_GeoCod(cEnd, @_cJson)
				If ValType(aRet) == "A"
					If Len(aRet) == 2
						MakeDir(_cDir)
						MakeDir(_cDir+cEmpAnt+"\")
						MemoWrite(_cDir+cEmpAnt+"\"+SA1->A1_COD+SA1->A1_LOJA+".txt", _cJson) 
						If RecLock("SA1",.F.)
							SA1->A1_XLAT := aRet[1]
							SA1->A1_XLNG := aRet[2]
							SA1->A1_XLATLNG := Date()
							MsUnLock()
						EndIf
					EndIF
				EndIf
			EndIf
		EndIf
		SA1->(DbSkip())
		If _nLop == 19
			_nLop := 0
			Sleep(60000)
		EndIf
	End
	Aviso('Atenção','Cadastro Atualizado',{"Fechar"})
Return
