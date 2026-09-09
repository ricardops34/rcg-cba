#include "totvs.ch"

// Sentido da mensagem, igual ao do BJPLA002 - a fila e a mesma.
#Define BJ_SAIDA          "S"

// Dias de retencao do expurgo. Zero na chamada faz o BJPLA002 usar o padrao
// dele; aqui o agendamento pode passar outro valor pelo parametro da tela.
#Define BJ_RETENCAO       90

/*/{Protheus.doc} BJPLA001
Rotinas agendaveis da integracao com a Plataforma BJ.

Sao quatro, e cada uma se cadastra separadamente em
*Configurador > Ambiente > Schedule > Agendamentos*. Empresa e filial saem da
propria tela do agendamento, e **cada empresa tem a sua chave de API**, logo um
conjunto de agendamentos por empresa.

	U_BJPLA001   Coleta   varre as tabelas por S_T_A_M_P_ e enfileira
	U_BJPLA01E   Envio    drena a fila de saida e executa as requisicoes
	U_BJPLA01R   Retorno  le a plataforma, aplica no ERP e confirma la
	U_BJPLA01X   Expurgo  apaga da fila as mensagens executadas antigas

**Coleta e envio sao separados de proposito.** Varrer a SB1, a SA1 e a SF2 e caro
e nao precisa ser frequente; drenar e limitado pelo teto da API - 60 req/min por
IP -, o que faz uma carga de 5.000 registros levar cerca de uma hora e vinte.
Juntos no mesmo agendamento, uma carga grande bloquearia a proxima varredura.
Separados, o drenador roda continuo enquanto a varredura roda de hora em hora.

Ritmo sugerido:

	Coleta   de hora em hora
	Envio    continuo, ou a cada poucos minutos
	Retorno  de hora em hora
	Expurgo  uma vez por dia, fora do horario comercial

@type    function
@author  Ricardo P Sotomayor
@since   01/09/2026
/*/

/*/{Protheus.doc} BJPLA001
Agendamento de coleta: varre as tabelas de origem e enfileira o que mudou.

Nao envia nada. Terminada a varredura de uma entidade, a marca d'agua dela ja
avanca - o que precisa ir esta guardado na SZZ e nao depende mais dela.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   cEntid, character, Id da entidade. Vazio varre o catalogo ativo inteiro
@return  Nil
@example U_BJPLA001()
/*/
User Function BJPLA001(cEntid)

	Local aTotal   := {0, 0, 0, 0}
	Local nSeg     := Seconds()
	Local cArqLock := "\bjapi\" + cEmpAnt + "\bjpla-coleta.tsk"

	Default cEntid := ""

	MakeDir("\bjapi\")
	MakeDir("\bjapi\" + cEmpAnt + "\")

	// Um processo de coleta por vez. Se o arquivo existir, outro job ja esta rodando.
	If File(cArqLock)
		Return Nil
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Inicio da coleta BJ.", 0, 0, {})

	aTotal := U_BJVARRE(cEntid, "")

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Fim da coleta BJ em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s - " + ;
		"lidos: " + cValToChar(aTotal[1]) + ;
		" enfileirados: " + cValToChar(aTotal[2]) + ;
		" entidades: " + cValToChar(aTotal[3]) + ;
		" erros: " + cValToChar(aTotal[4]), 0, 0, {})

	If File(cArqLock)
		FErase(cArqLock)
	EndIf

Return Nil

/*/{Protheus.doc} SchedDef
Define a rotina como agendavel pelo Schedule do Protheus.

@type    Static Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  array, Parametros do agendamento
/*/
Static Function SchedDef()

	Local aParam := {"R", "", "", {"T"}, ""}

Return aParam

/*/{Protheus.doc} BJPLA01E
Agendamento de envio: drena a fila de saida.

Le as pendentes na ordem da sequencia - que e a ordem de chegada e, como a
varredura enfileira o catalogo na ordem de carga, tambem a ordem que a API exige.
Cada mensagem grava seu resultado; a que falhar continua na fila e volta na
proxima execucao, sozinha, sem arrastar as outras.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   nLimite, numeric, Maximo de mensagens nesta execucao. Zero drena tudo
@return  Nil
@example U_BJPLA01E(0)
/*/
User Function BJPLA01E(nLimite)

	Local aTotal   := {0, 0, 0}
	Local nSeg     := Seconds()
	Local cArqLock := "\bjapi\" + cEmpAnt + "\bjpla-envio.tsk"

	Default nLimite := 0

	MakeDir("\bjapi\")
	MakeDir("\bjapi\" + cEmpAnt + "\")

	// Um drenador por vez. Se o arquivo existir, outro job ja esta rodando.
	If File(cArqLock)
		Return Nil
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Inicio do envio BJ.", 0, 0, {})

	aTotal := U_BJDRENA(nLimite)

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Fim do envio BJ em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s - " + ;
		"lidas: " + cValToChar(aTotal[1]) + ;
		" enviadas: " + cValToChar(aTotal[2]) + ;
		" erros: " + cValToChar(aTotal[3]), 0, 0, {})

	If File(cArqLock)
		FErase(cArqLock)
	EndIf

Return Nil

/*/{Protheus.doc} BJPLA01R
Agendamento de retorno: le a plataforma, aplica no ERP e confirma la.

Orcamento aprovado vira Pedido de Venda; alteracao de cliente aprovada volta para
a SA1. Em ambos, a gravacao no ERP e a marcacao da mensagem acontecem na mesma
transacao - e o que impede o pedido duplicado quando a rede cai entre gerar e
avisar.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@return  Nil
@example U_BJPLA01R()
/*/
User Function BJPLA01R()

	Local aTotal   := {0, 0, 0, 0}
	Local nSeg     := Seconds()
	Local cArqLock := "\bjapi\" + cEmpAnt + "\bjpla-retorno.tsk"

	MakeDir("\bjapi\")
	MakeDir("\bjapi\" + cEmpAnt + "\")

	If File(cArqLock)
		Return Nil
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Inicio do retorno BJ.", 0, 0, {})

	aTotal := U_BJRETORNO()

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Fim do retorno BJ em " + cValToChar(Round(Seconds() - nSeg, 2)) + "s - " + ;
		"lidos: " + cValToChar(aTotal[1]) + ;
		" aplicados: " + cValToChar(aTotal[2]) + ;
		" ignorados: " + cValToChar(aTotal[3]) + ;
		" erros: " + cValToChar(aTotal[4]), 0, 0, {})

	If File(cArqLock)
		FErase(cArqLock)
	EndIf

Return Nil

/*/{Protheus.doc} BJPLA01X
Agendamento de expurgo: apaga da fila as mensagens executadas antigas.

Pendentes e com erro nunca sao apagadas, independente da idade: mensagem que nao
chegou ao destino e trabalho por fazer. A linha de marca d'agua de cada entidade
tambem fica - apaga-la faria a entidade recuar na varredura seguinte.

Sem este agendamento rodando, a SZZ cresce indefinidamente: ela cresce com o
numero de alteracoes, nao com o tamanho da base.

@type    User Function
@author  Ricardo P Sotomayor
@since   01/09/2026
@param   nDias, numeric, Dias de retencao. Zero usa o padrao
@return  Nil
@example U_BJPLA01X(90)
/*/
User Function BJPLA01X(nDias)

	Local nApagadas := 0
	Local cArqLock  := "\bjapi\" + cEmpAnt + "\bjpla-expurgo.tsk"

	Default nDias := BJ_RETENCAO

	MakeDir("\bjapi\")
	MakeDir("\bjapi\" + cEmpAnt + "\")

	If File(cArqLock)
		Return Nil
	EndIf

	MemoWrite(cArqLock, DtoS(Date()) + " " + Time())

	nApagadas := U_BJEXPURG(nDias)

	FwLogMsg("INFO", /*cTransactionId*/, "BJPLA", FunName(), "", "01", "Expurgo BJ concluido: " + cValToChar(nApagadas) + " mensagens apagadas.", 0, 0, {})

	If File(cArqLock)
		FErase(cArqLock)
	EndIf

Return Nil
