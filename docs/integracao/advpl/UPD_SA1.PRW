#INCLUDE "PROTHEUS.CH"
#INCLUDE "TBICONN.CH"
#INCLUDE "FWMVCDEF.CH"

// Atualiza a SA1 com a situacao cadastral da Receita Federal e com a geolocalizacao.
//
// Fonte: MinhaReceita (https://minhareceita.org), base publica da RFB. Nao usa token.
// A resposta vem plana (sem o no 'estabelecimento' da API anterior) e a situacao
// chega em dois campos:
//
//    situacao_cadastral            1 NULA   2 ATIVA   3 SUSPENSA   4 INAPTA   8 BAIXADA
//    descricao_situacao_cadastral  texto em maiusculas ("ATIVA")
//
// As decisoes de bloqueio usam o codigo; A1_STSEFAZ continua gravado como
// "Ativa", "Inapta"..., o formato que a API anterior deixou na base.
//
// Campos gravados - nenhum outro da SA1 e alterado:
//    Receita    A1_STSEFAZ, A1_DTSTSEF, A1_DTSEFAZ, A1_MNSEFAZ (JSON da consulta), A1_CNAE (principal)
//    Bloqueio   A1_MSBLQL, A1_XMOTBLQ, A1_XDTBLQ, A1_XJUSTBL
//    Geo        A1_XLAT, A1_XLNG, A1_XLATLNG - DESLIGADO em 29/09/2026 (ver _lGeo)
//
// CNAEs da consulta (principal e secundarios) sao incluidos/atualizados na CC3 pelo
// MVC do FATA500; o principal vai tambem para o A1_CNAE. A fonte manda o codigo como
// numero e o zero a esquerda se perde ("0111301" chega como 111301): ele e completado
// para 7 digitos e gravado com a mascara do CC3_COD ("0111-3/01"), inclusive no A1_CNAE.
// A inclusao na CC3 preenche secao, divisao, grupo e classe, que precisam existir na CCG.
// A carga completa da CC3 (todas as subclasses do IBGE) e o U_UPD_CC3 (UPD_CC3.PRW);
// aqui entram so os CNAEs dos clientes consultados, para manter a base em dia.
//
// A1_XMOTBLQ, na parte que esta rotina controla:
//    "I"  bloqueio por CNPJ inapto ou suspenso - volta sozinho quando o CNPJ fica ativo
//    "F"  CNPJ baixado - definitivo, o cliente sai da rotina
//
// Sem retorno da consulta (falha HTTP, JSON ilegivel ou sem situacao cadastral) nada e gravado.
// Situacao "Nula" (codigo 1) e retorno: grava situacao e datas, sem bloquear nem desbloquear.

User Function UPD_SA1(aPar) //u_UPD_SA1()
    Local aSA1Auto := {}
    Local aAI0Auto := {}
    Local nOpcAuto := 4  // 4 - Alteracao
    Local lRet     := .T.
    Local _cResult := ""
    Local _aHeader := {}
    Local _nIt     := 0
    Local _nRecno  := 0
    Local _cUrl    := "https://minhareceita.org/"
    Local _cCnpj   := ""
    Local _cHttp   := ""
    Local _lRfb    := .F.
    Local _lGeo    := .F.
    Local oRestCli, _oResult
    Local _oCnaes  := JsonObject():New()  // CNAEs ja conferidos na CC3 nesta execucao
    Private _cDir := "\geocode\", _cUfRef := "MS"
    Private lMsErroAuto := .F.
    Default aPar   := {"01","01"}

    _cEmpAnt := aPar[01]
    _cFilAnt := aPar[02]
    Aadd(_aHeader,'Accept: application/json')
    Aadd(_aHeader,'User-Agent: Protheus-UPD_SA1')

    lRet := RpcSetEnv(_cEmpAnt,_cFilAnt,"Admin")
    If lRet
        MakeDir(_cDir)
        MakeDir(_cDir+cEmpAnt+"\")

        If _cEmpAnt == "02"
            _cUfRef := "MT"
        Endif

        ConOut("Atualizacao de cadastro")
        ConOut("Inicio: " + Time())

        DbSelectArea("SA1")
        SA1->(DbSetOrder(1))
        SA1->(DbSeek(xFilial("SA1")))
        While SA1->(!Eof()) .And. SA1->A1_FILIAL == xFilial("SA1")
            _nIt += 1
            // O ExecAuto do CRMA980 reposiciona a SA1; o laco volta para este registro antes do DbSkip
            _nRecno := SA1->(Recno())

            If !(SA1->A1_COD == "000000") .And. SA1->A1_PESSOA == "J" .And. !Empty(SA1->A1_CGC) .And. !(AllTrim(SA1->A1_XMOTBLQ) == "F") .And. SA1->A1_EST == _cUfRef
                _lRfb := Empty(SA1->A1_DTSEFAZ) .Or. SA1->A1_DTSEFAZ + 180 < Date()
                // Geolocalizacao DESLIGADA em 29/09/2026 (sem API de geocoding definida). Para
                // religar, descomentar esta linha e a chamada do RfbGeo mais abaixo.
                // "0": o GeoCod antigo gravava 0,0 quando o Google nao achava o endereco
                //_lGeo := Empty(SA1->A1_XLATLNG) .Or. SA1->A1_XLATLNG + 30 < Date() .Or. Empty(SA1->A1_XLAT) .Or. AllTrim(SA1->A1_XLAT) == "0"

                If _lRfb .Or. _lGeo
                    _cCnpj := RfbSoDig(SA1->A1_CGC)
                    ConOut(cValToChar(_nIt) + " " + SA1->A1_COD + SA1->A1_LOJA + " " + _cCnpj + " " + Time())

                    oRestCli := FWRest():New(_cUrl)
                    oRestCli:setPath(_cCnpj)
                    If oRestCli:GET(_aHeader)
                        _cResult := oRestCli:GetResult()
                        _oResult := JsonObject():New()
                        If Len(_cResult) > 0
                            MemoWrite(_cDir+cEmpAnt+"\"+SA1->A1_COD+SA1->A1_LOJA+"-RFB.txt", _cResult)
                        EndIf

                        // FromJson devolve Nil quando deu certo e o texto do erro quando nao.
                        // Resposta que nao se entende nao bloqueia nem desbloqueia ninguem.
                        If ValType(_oResult:FromJson(_cResult)) == "C" .Or. RfbCodSit(_oResult) == 0
                            ConOut("Resposta sem situacao cadastral para o CNPJ " + _cCnpj)
                        Else
                            aSA1Auto := {}
                            aAI0Auto := {}
                            If _lRfb
                                RfbCnae(_oResult, _oCnaes)
                                RfbDados(_oResult, _cResult, @aSA1Auto)
                            EndIf
                            // Geolocalizacao desligada - ver o comentario do _lGeo acima
                            //If _lGeo .And. !(RfbCodSit(_oResult) == 8)
                            //    RfbGeo(_oResult, @aSA1Auto)
                            //EndIf

                            If Len(aSA1Auto) > 0
                                RfbGrava(@aSA1Auto, aAI0Auto, nOpcAuto)
                                SA1->(DbGoTo(_nRecno))
                            EndIf
                        EndIf
                        FreeObj(_oResult)
                        Sleep(1000)
                    Else
                        _cHttp := Iif(ValType(oRestCli:oResponseH) == "O", AllTrim(oRestCli:oResponseH:cStatusCode), "")
                        ConOut("Falha na consulta do CNPJ " + _cCnpj + " (HTTP " + _cHttp + ")")
                        ConOut(oRestCli:GetLastError())
                        // 429: limite de requisicoes da MinhaReceita - espera mais antes do proximo
                        Sleep(Iif(_cHttp == "429", 30000, 2000))
                    EndIf
                    FreeObj(oRestCli)
                EndIf
            EndIf
            SA1->(DbGoTo(_nRecno))
            SA1->(DbSkip())
        End
        ConOut("Fim: " + Time())
    EndIf

    RpcClearEnv()

Return

// So os digitos (o A1_CGC pode ter vindo com mascara de cadastro antigo).
Static Function RfbSoDig(cTexto)
    Local cRet := ""
    Local nI   := 0

    cTexto := AllTrim(cTexto)
    For nI := 1 To Len(cTexto)
        If SubStr(cTexto, nI, 1) $ "0123456789"
            cRet += SubStr(cTexto, nI, 1)
        EndIf
    Next nI
Return cRet

// Codigo da situacao cadastral (1, 2, 3, 4 ou 8). Zero quando a resposta nao traz.
Static Function RfbCodSit(oJson)
    Local xSit := oJson["situacao_cadastral"]

    If ValType(xSit) == "C"
        xSit := Val(xSit)
    EndIf
Return Iif(ValType(xSit) == "N", xSit, 0)

// Campo texto da resposta; "" quando vem ausente, nulo ou de outro tipo.
Static Function RfbTxt(oJson, cCampo)
    Local xVal := oJson[cCampo]

    If ValType(xVal) == "N"
        xVal := cValToChar(xVal)
    EndIf
Return Iif(ValType(xVal) == "C", AllTrim(xVal), "")

// Situacao cadastral e bloqueio/desbloqueio por irregularidade do CNPJ.
Static Function RfbDados(oJson, cResult, aSA1Auto)
    Local nSitua := RfbCodSit(oJson)
    Local cSitua := RfbTxt(oJson, "descricao_situacao_cadastral")
    Local cDtSit := StrTran(RfbTxt(oJson, "data_situacao_cadastral"), "-", "")
    Local cMotiv := AllTrim(SA1->A1_XMOTBLQ)
    Local cCnae  := ""

    // "ATIVA" -> "Ativa", como a API anterior gravava
    cSitua := Upper(Left(cSitua, 1)) + Lower(SubStr(cSitua, 2))

    aAdd(aSA1Auto,{"A1_STSEFAZ",cSitua            ,Nil})
    If !Empty(cDtSit)
        aAdd(aSA1Auto,{"A1_DTSTSEF",StoD(cDtSit)  ,Nil})
    EndIf
    aAdd(aSA1Auto,{"A1_DTSEFAZ",Date()            ,Nil})
    aAdd(aSA1Auto,{"A1_MNSEFAZ",cResult           ,Nil})

    // CNAE principal - so quando ja esta na CC3 (RfbCnae roda antes). Se a inclusao
    // na CC3 falhou, a validacao do A1_CNAE derrubaria a gravacao do cliente inteiro.
    cCnae := Iif(ValType(oJson["cnae_fiscal"]) $ "CN", RfbSoDig(cValToChar(oJson["cnae_fiscal"])), "")
    cCnae := Iif(Empty(cCnae) .Or. Val(cCnae) == 0 .Or. Len(cCnae) > 7, "", PadL(cCnae, 7, "0"))
    // Gravado com a mascara do CC3_COD (9999-9/99), como na CC3: "4721102" -> "4721-1/02"
    If !Empty(cCnae)
        cCnae := Left(cCnae, 4) + "-" + SubStr(cCnae, 5, 1) + "/" + SubStr(cCnae, 6, 2)
    EndIf
    If !Empty(cCnae) .And. !(AllTrim(SA1->A1_CNAE) == cCnae)
        CC3->(DbSetOrder(1))  // CC3_FILIAL + CC3_COD
        If CC3->(DbSeek(xFilial("CC3") + PadR(cCnae, TamSX3("CC3_COD")[1])))
            aAdd(aSA1Auto,{"A1_CNAE",PadR(cCnae, TamSX3("A1_CNAE")[1]) ,Nil})
        Else
            ConOut("CNAE " + cCnae + " nao esta na CC3 - A1_CNAE nao alterado")
        EndIf
    EndIf

    Do Case
        Case nSitua == 4 .And. !(cMotiv == "I")
            aAdd(aSA1Auto,{"A1_XMOTBLQ","I"       ,Nil})
            aAdd(aSA1Auto,{"A1_XDTBLQ" ,Date()    ,Nil})
            aAdd(aSA1Auto,{"A1_MSBLQL" ,"1"       ,Nil})
            aAdd(aSA1Auto,{"A1_XJUSTBL","CNPJ INAPTO. CONSULTA EM "+DtoC(Date())   ,Nil})
        Case nSitua == 3 .And. !(cMotiv == "I")
            aAdd(aSA1Auto,{"A1_XMOTBLQ","I"       ,Nil})
            aAdd(aSA1Auto,{"A1_XDTBLQ" ,Date()    ,Nil})
            aAdd(aSA1Auto,{"A1_MSBLQL" ,"1"       ,Nil})
            aAdd(aSA1Auto,{"A1_XJUSTBL","CNPJ SUSPENSO. CONSULTA EM "+DtoC(Date()) ,Nil})
        Case nSitua == 8
            aAdd(aSA1Auto,{"A1_XMOTBLQ","F"       ,Nil})
            aAdd(aSA1Auto,{"A1_XDTBLQ" ,Date()    ,Nil})
            aAdd(aSA1Auto,{"A1_MSBLQL" ,"1"       ,Nil})
            aAdd(aSA1Auto,{"A1_XJUSTBL","CNPJ BAIXADO. CONSULTA EM "+DtoC(Date())  ,Nil})
        Case nSitua == 2 .And. cMotiv == "I"
            // So desfaz o bloqueio que esta rotina fez; bloqueio por outro motivo fica
            aAdd(aSA1Auto,{"A1_XMOTBLQ"," "       ,Nil})
            aAdd(aSA1Auto,{"A1_XDTBLQ" ,CtoD(" ") ,Nil})
            aAdd(aSA1Auto,{"A1_XJUSTBL"," "       ,Nil})
            aAdd(aSA1Auto,{"A1_MSBLQL" ,"2"       ,Nil})
    EndCase
Return

// CNAE principal e secundarios da consulta -> CC3. oVistos evita reprocessar o mesmo
// codigo a cada cliente da execucao.
Static Function RfbCnae(oJson, oVistos)
    Local aCnae := {}
    Local aSec  := oJson["cnaes_secundarios"]
    Local cCod  := ""
    Local cDesc := ""
    Local nI    := 0

    aAdd(aCnae, {oJson["cnae_fiscal"], oJson["cnae_fiscal_descricao"]})
    If ValType(aSec) == "A"
        For nI := 1 To Len(aSec)
            If ValType(aSec[nI]) == "J"
                aAdd(aCnae, {aSec[nI]["codigo"], aSec[nI]["descricao"]})
            EndIf
        Next nI
    EndIf

    For nI := 1 To Len(aCnae)
        // Codigo com 7 digitos: a fonte manda numero e o zero a esquerda se perde
        cCod := Iif(ValType(aCnae[nI][1]) $ "CN", RfbSoDig(cValToChar(aCnae[nI][1])), "")
        cCod := Iif(Empty(cCod) .Or. Val(cCod) == 0 .Or. Len(cCod) > 7, "", PadL(cCod, 7, "0"))

        // Descricao em maiusculas e sem acento, como o cadastro padrao do Protheus.
        // A fonte manda UTF-8; o Protheus trabalha em CP1252.
        cDesc := Iif(ValType(aCnae[nI][2]) == "C", AllTrim(aCnae[nI][2]), "")
        If !Empty(cDesc) .And. ValType(DecodeUTF8(cDesc)) == "C" .And. !Empty(DecodeUTF8(cDesc))
            cDesc := DecodeUTF8(cDesc)
        EndIf
        cDesc := Upper(FwNoAccent(cDesc))

        // A fonte manda o secundario "0" com descricao vazia quando nao ha nenhum
        If !Empty(cCod) .And. !Empty(cDesc) .And. !(ValType(oVistos[cCod]) == "L")
            oVistos[cCod] := .T.
            RfbCC3(cCod, cDesc)
        EndIf
    Next nI
Return

// Inclui o CNAE na CC3 ou atualiza a descricao quando mudou. Erro vai para o log e
// nao impede a atualizacao do cliente.
Static Function RfbCC3(cCod, cDesc)
    Local aArea  := GetArea()
    Local nOpc   := 0
    Local cDig   := cCod  // 7 digitos, sem mascara
    Local nDiv   := Val(Left(cCod, 2))
    Local cSecao := ""
    Local oModel
    Local aErro

    // Secao CNAE (obrigatoria na CC3): a letra da classificacao do IBGE, que sai da
    // divisao - os 2 primeiros digitos do codigo
    Do Case
        Case nDiv >= 1  .And. nDiv <= 3  // Agropecuaria
            cSecao := "A"
        Case nDiv >= 5  .And. nDiv <= 9  // Industrias extrativas
            cSecao := "B"
        Case nDiv >= 10 .And. nDiv <= 33  // Industrias de transformacao
            cSecao := "C"
        Case nDiv == 35  // Eletricidade e gas
            cSecao := "D"
        Case nDiv >= 36 .And. nDiv <= 39  // Agua, esgoto, residuos
            cSecao := "E"
        Case nDiv >= 41 .And. nDiv <= 43  // Construcao
            cSecao := "F"
        Case nDiv >= 45 .And. nDiv <= 47  // Comercio
            cSecao := "G"
        Case nDiv >= 49 .And. nDiv <= 53  // Transporte
            cSecao := "H"
        Case nDiv >= 55 .And. nDiv <= 56  // Alojamento e alimentacao
            cSecao := "I"
        Case nDiv >= 58 .And. nDiv <= 63  // Informacao e comunicacao
            cSecao := "J"
        Case nDiv >= 64 .And. nDiv <= 66  // Financeiras
            cSecao := "K"
        Case nDiv == 68  // Imobiliarias
            cSecao := "L"
        Case nDiv >= 69 .And. nDiv <= 75  // Profissionais e tecnicas
            cSecao := "M"
        Case nDiv >= 77 .And. nDiv <= 82  // Administrativas
            cSecao := "N"
        Case nDiv == 84  // Administracao publica
            cSecao := "O"
        Case nDiv == 85  // Educacao
            cSecao := "P"
        Case nDiv >= 86 .And. nDiv <= 88  // Saude
            cSecao := "Q"
        Case nDiv >= 90 .And. nDiv <= 93  // Artes e recreacao
            cSecao := "R"
        Case nDiv >= 94 .And. nDiv <= 96  // Outros servicos
            cSecao := "S"
        Case nDiv == 97  // Servicos domesticos
            cSecao := "T"
        Case nDiv == 99  // Organismos internacionais
            cSecao := "U"
    EndCase

    // A CC3 grava os codigos com a mascara do campo (X3_PICTURE sem @R):
    //    CC3_COD 9999-9/99   CC3_CGRUPO 99.9   CC3_CCLASS 99.99-9
    cCod  := PadR(Left(cDig, 4) + "-" + SubStr(cDig, 5, 1) + "/" + SubStr(cDig, 6, 2), TamSX3("CC3_COD")[1])
    cDesc := Left(cDesc, TamSX3("CC3_DESC")[1])

    CC3->(DbSetOrder(1))  // CC3_FILIAL + CC3_COD
    If CC3->(DbSeek(xFilial("CC3") + cCod))
        If AllTrim(Upper(FwNoAccent(CC3->CC3_DESC))) == AllTrim(cDesc)
            RestArea(aArea)
            Return
        EndIf
        nOpc := MODEL_OPERATION_UPDATE
    Else
        nOpc := MODEL_OPERATION_INSERT
    EndIf

    oModel := FWLoadModel("FATA500")
    oModel:SetOperation(nOpc)
    oModel:Activate()
    If nOpc == MODEL_OPERATION_INSERT
        oModel:SetValue("CC3MASTER", "CC3_COD", cCod)
        // Secao, divisao, grupo e classe sao validados contra a CCG; as descricoes
        // (CC3_DSECAO etc.) vem por gatilho. "4721102" -> G, 47, 47.2, 47.21-1
        oModel:SetValue("CC3MASTER", "CC3_CSECAO", cSecao)
        oModel:SetValue("CC3MASTER", "CC3_CDIVIS", Left(cDig, 2))
        oModel:SetValue("CC3MASTER", "CC3_CGRUPO", Left(cDig, 2) + "." + SubStr(cDig, 3, 1))
        oModel:SetValue("CC3MASTER", "CC3_CCLASS", Left(cDig, 2) + "." + SubStr(cDig, 3, 2) + "-" + SubStr(cDig, 5, 1))
        oModel:SetValue("CC3MASTER", "CC3_MSBLQL", "2")  // 2 - nao bloqueado
    EndIf
    oModel:SetValue("CC3MASTER", "CC3_DESC", cDesc)

    If oModel:VldData()
        oModel:CommitData()
        ConOut("CNAE " + AllTrim(cCod) + Iif(nOpc == MODEL_OPERATION_INSERT, " incluido", " atualizado") + " na CC3")
    Else
        aErro := oModel:GetErrorMessage()
        ConOut("Erro no CNAE " + AllTrim(cCod) + " (FATA500): " + AllTrim(cValToChar(aErro[6])) + " " + AllTrim(cValToChar(aErro[7])))
    EndIf
    oModel:DeActivate()
    oModel:Destroy()

    RestArea(aArea)
Return

// Geolocalizacao pelo endereco que a Receita tem do CNPJ.
Static Function RfbGeo(oJson, aSA1Auto)
    Local cEnd := ""
    Local cCep := RfbTxt(oJson, "cep")
    Local cGeo := ""  // resposta do geocoding, devolvida pelo U_GeoCod
    Local aRet

    cEnd := RfbTxt(oJson, "descricao_tipo_de_logradouro")
    cEnd += " " + RfbTxt(oJson, "logradouro")
    cEnd += ", " + RfbTxt(oJson, "numero")
    If !Empty(RfbTxt(oJson, "bairro"))
        cEnd += " - " + RfbTxt(oJson, "bairro")
    EndIf
    cEnd += ", " + RfbTxt(oJson, "municipio") + " - " + RfbTxt(oJson, "uf")
    cEnd += Iif(!Empty(cCep), " CEP " + cCep, "")
    cEnd := AllTrim(cEnd)

    aRet := U_GeoCod(cEnd, @cGeo)
    If ValType(aRet) == "A" .And. Len(aRet) == 2
        If Len(cGeo) > 0
            MemoWrite(_cDir+cEmpAnt+"\"+SA1->A1_COD+SA1->A1_LOJA+"-GEO.txt", cGeo)
        EndIf
        aAdd(aSA1Auto,{"A1_XLAT"    ,aRet[1]  ,Nil})
        aAdd(aSA1Auto,{"A1_XLNG"    ,aRet[2]  ,Nil})
        aAdd(aSA1Auto,{"A1_XLATLNG" ,Date()   ,Nil})
    EndIf
Return

// Grava a alteracao pelo CRMA980. Erro vai para \SA1\ExecAuto\<empresa>\<data>\<cnpj>.txt
Static Function RfbGrava(aSA1Auto, aAI0Auto, nOpcAuto)
    Local cPasta := "\SA1\ExecAuto\" + cEmpAnt + "\" + DtoS(Date()) + "\"
    Local cCnpj  := AllTrim(SA1->A1_CGC)

    aAdd(aSA1Auto,{"A1_COD"    ,SA1->A1_COD       ,Nil})
    aAdd(aSA1Auto,{"A1_LOJA"   ,SA1->A1_LOJA      ,Nil})

    lMsErroAuto := .F.
    MSExecAuto({|a,b,c| CRMA980(a,b,c)}, aSA1Auto, nOpcAuto, aAI0Auto)

    If lMsErroAuto
        MakeDir("\SA1")
        MakeDir("\SA1\ExecAuto\")
        MakeDir("\SA1\ExecAuto\" + cEmpAnt + "\")
        MakeDir(cPasta)
        MostraErro(cPasta, cCnpj + ".txt")  // MostraErro() sem arquivo nao funciona via JOB
        ConOut("Erro ao alterar o cliente " + cCnpj + " - ver " + cPasta)
    Else
        ConOut("Cliente alterado com sucesso!")
    EndIf
Return
