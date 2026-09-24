# Guia de Instalação e Operação — BJ.Integrador (Windows Server 2016)

Este guia descreve o procedimento de implantação do serviço **BJ.Integrador** em produção no Windows Server 2016.

---

## 1. Pré-requisitos
- **Windows Server 2016** (ou superior) com SQL Server.
- Permissão de Administrador Local no servidor para executar scripts PowerShell.
- Porta **5080/TCP** liberada no firewall para acesso ao dashboard de monitoramento (`/monitor`).

---

## 2. Passo 1 — Executar Permissões no SQL Server (DBA)

Antes de rodar a aplicação, o DBA deve executar o script [`sql/permissoes_protheus.sql`](file:///C:/VPS/rcg/docs/integracao/windows/sql/permissoes_protheus.sql) na instância SQL Server.

- Cria o login `usr_bj_integrador` com permissões mínimas (`SELECT` e `UPDATE` na fila `SZZ`, `INSERT` nas tabelas de retorno `SZY`/`SC5`).
- **NENHUMA** permissão de `db_owner` ou criação de objetos DDL é concedida no Protheus.

---

## 3. Passo 2 — Compilar o Pacote de Publicação (Self-Contained)

Na máquina de desenvolvimento/build, execute a publicação self-contained para Windows 64-bit:

```powershell
& "$env:USERPROFILE\.dotnet\dotnet.exe" publish "C:\VPS\rcg\docs\integracao\windows\src\BJ.Integrador.Service\BJ.Integrador.Service.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o "C:\VPS\rcg\docs\integracao\windows\publish"
```

---

## 4. Passo 3 — Executar o Instalador

Abra o PowerShell como **Administrador** no Windows Server e execute:

```powershell
Set-ExecutionPolicy Unrestricted -Scope Process -Force
.\instalar.ps1 -DiretorioInstalacao "C:\Servicos\BJ.Integrador"
```

### O que o `instalar.ps1` faz automaticamente:
1. Para versões anteriores do serviço se estiverem rodando.
2. Copia a pasta `publish` para `C:\Servicos\BJ.Integrador` preservando as pastas `keys\`, `logs\` e o `appsettings.json`.
3. Registra a regra de firewall para a porta 5080.
4. Registra o serviço Windows `BJ.Integrador` com início automático atrasado (`delayed-auto`).
5. Configura políticas de recuperação de falhas (reiniciar após 1 minuto).
6. Inicia o serviço Windows.

---

## 5. Passo 4 — Backup Crítico da Pasta `keys`

> [!WARNING]
> A pasta **`C:\Servicos\BJ.Integrador\keys`** armazena as chaves mestre da API ASP.NET Data Protection (DPAPI).
> Configure um backup diário desta pasta. Sem ela, credenciais gravadas no banco `integ.Empresa` se tornam irrecuperáveis.

---

## 6. Passo 5 — Migração do AdvPL para o Serviço (Checklist)

Ao migrar um fluxo do Schedule AdvPL para o novo serviço Windows:

1. **Desativar o Job AdvPL correspondente**: No Protheus Schedule (`SIGACFG`), desative o job do fluxo (ex: `U_BJVARRE`, `U_BJDRENA` ou `U_BJRETORNO`).
2. **Criptografar Credencial de API**:
   ```cmd
   C:\Servicos\BJ.Integrador\BJ.Integrador.Service.exe --proteger "chave_api_empresa"
   ```
3. **Cadastrar Empresa e Fluxo em `BJ_INTEGRADOR`**:
   Grave a credencial em `integ.Empresa.CredencialCriptografada` e defina `Ativo = 1` no registro de `integ.Fluxo`.
4. **Monitorar no Dashboard**:
   Acesse `http://localhost:5080/monitor` (usuário: `admin`, senha definida no `appsettings.json`) e acompanhe a execução.

---

## Plano de Contingência / Rollback

Para voltar a execução para o AdvPL em caso de imprevisto:
1. Altere `Ativo = 0` no `integ.Fluxo` do banco `BJ_INTEGRADOR`.
2. Reative o job no Schedule AdvPL do Protheus.
3. Como a fila `SZZ`/`SZY` é a mesma, o AdvPL retomará o processamento sem perda de dados.
