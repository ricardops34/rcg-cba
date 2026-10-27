#INCLUDE "PROTHEUS.CH"
#INCLUDE "TBICONN.CH"
#INCLUDE "FWMVCDEF.CH"

// Carga da tabela de CNAE (CC3) a partir da API do IBGE - a mesma fonte da carga da
// plataforma (apps/api/prisma/sync-ibge.ts). Inclui o que falta e atualiza o que mudou,
// pelo MVC do FATA500. Pode rodar quantas vezes quiser.
//
// Fonte: https://servicodados.ibge.gov.br/api/v2/cnae/subclasses - todas as subclasses,
// cada uma com classe, grupo, divisao e secao.
//
// A CC3 grava os codigos com a mascara do campo (X3_PICTURE sem @R):
//    CC3_COD 9999-9/99   CC3_CDIVIS 99   CC3_CGRUPO 99.9   CC3_CCLASS 99.99-9
//    "4721102" -> 4721-1/02, 47, 47.2, 47.21-1; secao G
// Secao, divisao, grupo e classe sao validados contra a CCG; as descricoes vem por gatilho.
// O nivel que faltar na CCG (CCG_COD no mesmo formato: G, 47, 47.2, 47.21-1) e incluido antes.

User Function UPD_CC3(aPar) //u_UPD_CC3()
    Local lRet     := .T.
    Local aHeader  := {}
    Local cResult  := ""
    Local oRestCli
    Local oJson
    Local aSub
    Local oSub
    Local nI       := 0
    Local cDig     := ""
    Local cCod     := ""
    Local cDesc    := ""
    Local cSecao   := ""
    Local cDivis   := ""
    Local cGrupo   := ""
    Local cClass   := ""
    Local nOpc     := 0
    Local oModel
    Local aErro
    Local nIncl    := 0
    Local nAlt     := 0
    Local nIgual   := 0
    Local nErro    := 0
    Local nCCG     := 0
    Local oCCG     := JsonObject():New()  // niveis ja conferidos na CCG nesta execucao
    Local oCla
    Local aNivel   := {}
    Local nN       := 0
    Local cDescN   := ""
    Default aPar   := {"01","01"}

    Aadd(aHeader,'Accept: application/json')

    lRet := RpcSetEnv(aPar[01], aPar[02], "Admin")
    If lRet
        ConOut("UPD_CC3 - carga de CNAE. Inicio: " + Time())

        oRestCli := FWRest():New("https://servicodados.ibge.gov.br")
        oRestCli:setPath("/api/v2/cnae/subclasses")
        If oRestCli:GET(aHeader)
            cResult := oRestCli:GetResult()
            oJson   := JsonObject():New()
            // A resposta e uma lista solta; embrulhar num objeto e o jeito seguro de ler no JsonObject
            If ValType(oJson:FromJson('{"itens":' + cResult + '}')) == "U" .And. ValType(oJson["itens"]) == "A"
                aSub := oJson["itens"]
                ConOut("UPD_CC3 - " + cValToChar(Len(aSub)) + " subclasses no IBGE")

                CC3->(DbSetOrder(1))  // CC3_FILIAL + CC3_COD
                CCG->(DbSetOrder(1))  // CCG_FILIAL + CCG_COD
                For nI := 1 To Len(aSub)
                    oSub := aSub[nI]
                    If !(ValType(oSub) == "J")
                        Loop
                    EndIf

                    // O id pode vir com ou sem mascara ("0111-3/01" ou "0111301")
                    cDig := StrTran(StrTran(StrTran(cValToChar(oSub["id"]), "-", ""), "/", ""), ".", "")
                    cDig := PadL(AllTrim(cDig), 7, "0")

                    cSecao := ""
                    If ValType(oSub["classe"]) == "J" .And. ValType(oSub["classe"]["grupo"]) == "J" .And. ;
                       ValType(oSub["classe"]["grupo"]["divisao"]) == "J" .And. ValType(oSub["classe"]["grupo"]["divisao"]["secao"]) == "J"
                        cSecao := AllTrim(cValToChar(oSub["classe"]["grupo"]["divisao"]["secao"]["id"]))
                    EndIf

                    // Descricao em maiusculas e sem acento (CC3_DESC e @!). A fonte manda UTF-8.
                    cDesc := Iif(ValType(oSub["descricao"]) == "C", AllTrim(oSub["descricao"]), "")
                    If !Empty(cDesc) .And. ValType(DecodeUTF8(cDesc)) == "C" .And. !Empty(DecodeUTF8(cDesc))
                        cDesc := DecodeUTF8(cDesc)
                    EndIf
                    cDesc := Left(Upper(FwNoAccent(cDesc)), TamSX3("CC3_DESC")[1])

                    If Len(AllTrim(cDig)) <> 7 .Or. Val(cDig) == 0 .Or. Empty(cSecao) .Or. Empty(cDesc)
                        ConOut("UPD_CC3 - subclasse ignorada, sem codigo, secao ou descricao: " + cValToChar(oSub["id"]))
                        nErro += 1
                        Loop
                    EndIf

                    cCod   := PadR(Left(cDig, 4) + "-" + SubStr(cDig, 5, 1) + "/" + SubStr(cDig, 6, 2), TamSX3("CC3_COD")[1])
                    cDivis := Left(cDig, 2)
                    cGrupo := Left(cDig, 2) + "." + SubStr(cDig, 3, 1)
                    cClass := Left(cDig, 2) + "." + SubStr(cDig, 3, 2) + "-" + SubStr(cDig, 5, 1)

                    // Secao, divisao, grupo e classe precisam existir na CCG - a CC3 valida contra ela.
                    // O nivel que falta (classe nova de revisao do IBGE, ex.: 33.17-1) e incluido com a
                    // descricao do IBGE; o que ja existe fica como esta. CCG_TIPO: 1 secao, 2 divisao,
                    // 3 grupo, 4 classe. Gravacao direta: tabela de 4 campos, sem rotina MVC conhecida.
                    oCla   := oSub["classe"]
                    aNivel := { ;
                        {cSecao, "1", oCla["grupo"]["divisao"]["secao"]["descricao"]}, ;
                        {cDivis, "2", oCla["grupo"]["divisao"]["descricao"]}, ;
                        {cGrupo, "3", oCla["grupo"]["descricao"]}, ;
                        {cClass, "4", oCla["descricao"]} }
                    For nN := 1 To Len(aNivel)
                        If !(ValType(oCCG[aNivel[nN][1]]) == "L")
                            oCCG[aNivel[nN][1]] := .T.
                            If !CCG->(DbSeek(xFilial("CCG") + PadR(aNivel[nN][1], TamSX3("CCG_COD")[1])))
                                cDescN := Iif(ValType(aNivel[nN][3]) == "C", AllTrim(aNivel[nN][3]), "")
                                If !Empty(cDescN) .And. ValType(DecodeUTF8(cDescN)) == "C" .And. !Empty(DecodeUTF8(cDescN))
                                    cDescN := DecodeUTF8(cDescN)
                                EndIf
                                RecLock("CCG", .T.)
                                CCG->CCG_FILIAL := xFilial("CCG")
                                CCG->CCG_COD    := aNivel[nN][1]
                                CCG->CCG_DESC   := Left(Upper(FwNoAccent(cDescN)), TamSX3("CCG_DESC")[1])
                                CCG->CCG_TIPO   := aNivel[nN][2]
                                CCG->(MsUnlock())
                                nCCG += 1
                                ConOut("UPD_CC3 - CCG incluida: " + aNivel[nN][1] + " (tipo " + aNivel[nN][2] + ")")
                            EndIf
                        EndIf
                    Next nN

                    If CC3->(DbSeek(xFilial("CC3") + cCod))
                        // Descricao comparada em maiusculas e sem acento: a base tem "Cultivo de milho"
                        // e "CULTIVO DE ARROZ" - diferenca so de caixa nao e mudanca
                        If AllTrim(Upper(FwNoAccent(CC3->CC3_DESC))) == AllTrim(cDesc) .And. ;
                           AllTrim(CC3->CC3_CSECAO) == cSecao .And. AllTrim(CC3->CC3_CDIVIS) == cDivis .And. ;
                           AllTrim(CC3->CC3_CGRUPO) == cGrupo .And. AllTrim(CC3->CC3_CCLASS) == cClass
                            nIgual += 1
                            Loop
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
                        oModel:SetValue("CC3MASTER", "CC3_MSBLQL", "2")  // 2 - nao bloqueado
                    EndIf
                    oModel:SetValue("CC3MASTER", "CC3_DESC"  , cDesc)
                    oModel:SetValue("CC3MASTER", "CC3_CSECAO", cSecao)
                    oModel:SetValue("CC3MASTER", "CC3_CDIVIS", cDivis)
                    oModel:SetValue("CC3MASTER", "CC3_CGRUPO", cGrupo)
                    oModel:SetValue("CC3MASTER", "CC3_CCLASS", cClass)

                    If oModel:VldData()
                        oModel:CommitData()
                        If nOpc == MODEL_OPERATION_INSERT
                            nIncl += 1
                        Else
                            nAlt += 1
                        EndIf
                    Else
                        aErro := oModel:GetErrorMessage()
                        ConOut("UPD_CC3 - erro no CNAE " + AllTrim(cCod) + ": " + AllTrim(cValToChar(aErro[6])) + " " + AllTrim(cValToChar(aErro[7])))
                        nErro += 1
                    EndIf
                    oModel:DeActivate()
                    oModel:Destroy()
                Next nI
            Else
                ConOut("UPD_CC3 - resposta do IBGE ilegivel")
            EndIf
            FreeObj(oJson)
        Else
            ConOut("UPD_CC3 - falha na consulta ao IBGE: " + oRestCli:GetLastError())
        EndIf
        FreeObj(oRestCli)

        ConOut("UPD_CC3 - CCG: " + cValToChar(nCCG) + " niveis incluidos")
        ConOut("UPD_CC3 - incluidos " + cValToChar(nIncl) + ", atualizados " + cValToChar(nAlt) + ;
               ", sem mudanca " + cValToChar(nIgual) + ", com erro " + cValToChar(nErro))
        ConOut("UPD_CC3 - Fim: " + Time())
    EndIf

    RpcClearEnv()

Return
