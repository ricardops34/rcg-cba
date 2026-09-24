# Criptografia e Gerenciamento de Credenciais — BJ.Integrador

## Visão Geral

As credenciais das APIs de integração (tokens Bearer, senhas de Basic Auth, API Keys, etc.) **nunca são salvas em texto puro** nem registradas em arquivos de log.

O serviço utiliza o **ASP.NET Data Protection** configurado com a API **DPAPI do Windows** (proteção em nível de máquina local: `ProtectKeysWithDpapi(protectToLocalMachine: true)`).

---

## Como Criptografar uma Credencial

Utilize o próprio executável do serviço via linha de comando para gerar o valor criptografado:

```powershell
# No PowerShell / Terminal:
dotnet run --project "C:\VPS\rcg\docs\integracao\windows\src\BJ.Integrador.Service\BJ.Integrador.Service.csproj" -- --proteger "meu_token_secret_123"
```

Ou no servidor de produção com o executável publicado:

```cmd
BJ.Integrador.Service.exe --proteger "meu_token_secret_123"
```

### Saída esperada:
```
================================================================================
BJ.Integrador - Proteção de Credencial (DPAPI)
================================================================================
TEXTO ORIGINAL: meu_token_secret_123
VALOR CRIPTOGRAFADO: CfDJ8... [string Base64 longa]
================================================================================
Grave este valor na coluna integ.Empresa.CredencialCriptografada no banco.
```

Copie a string Base64 gerada em `VALOR CRIPTOGRAFADO` e grave-a na coluna `CredencialCriptografada` da tabela `integ.Empresa` no banco `BJ_INTEGRADOR`.

---

## IMPORTANTE: Backup da Pasta `keys`

> [!WARNING]
> **REQUISITO CRÍTICO DE OPERAÇÃO**:
> As chaves mestras de descriptografia são persistidas na pasta **`keys/`** localizada no diretório do executável.
> 
> 1. **Fazer Backup Regular da Pasta `keys/`**: Se a pasta `keys/` for deletada ou perdida, **todas as credenciais salvas no banco de dados se tornarão IRRECUPERÁVEIS**.
> 2. **Escopo da Máquina (DPAPI)**: O valor criptografado só pode ser revelado na mesma máquina Windows Server em que foi gerado. Se o serviço for migrado para outro servidor Windows, as credenciais precisarão ser criptografadas novamente no novo servidor, ou a chave mestra DPAPI precisa ser exportada conforme diretrizes do Windows Server.
