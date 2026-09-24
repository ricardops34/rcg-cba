@echo off
title BJ.Integrador - Painel de Controle
echo ================================================================================
echo Iniciando BJ.Integrador - Servico de Integracao Protheus...
echo ================================================================================
echo.
echo Abrindo o Painel de Controle Visual em http://localhost:5080/ ...
start http://localhost:5080/
echo.
BJ.Integrador.Service.exe
pause
