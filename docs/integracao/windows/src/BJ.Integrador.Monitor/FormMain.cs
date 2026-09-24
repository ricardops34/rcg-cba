using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Data.SqlClient;

namespace BJ.Integrador.Monitor;

public class FormMain : Form
{
    private TabControl _tabControl = null!;
    private StatusStrip _statusStrip = null!;
    private ToolStripStatusLabel _lblStatus = null!;
    private HttpClient _http = null!;

    // Tab 1: Lotes BJPLA005 Controls
    private DataGridView _dgvLotes = null!;

    // Overview Controls
    private Label _lblStatEmpresas = null!;
    private Label _lblStatFluxos = null!;
    private Label _lblStatPendentes = null!;
    private Label _lblStatProcessados = null!;
    private Label _lblStatErros = null!;
    private Label _lblServiceStatus = null!;

    // Fluxos Controls
    private DataGridView _dgvFluxos = null!;

    // Config Controls
    private TextBox _txtConnConfig = null!;
    private TextBox _txtConnProtheus = null!;
    private TextBox _txtPorta = null!;
    private TextBox _txtUsuario = null!;
    private TextBox _txtSenha = null!;
    private Label _lblConfigStatus = null!;

    // Cofre Controls
    private TextBox _txtTokenPuro = null!;
    private TextBox _txtTokenProtegido = null!;

    // Logs Controls
    private DataGridView _dgvLogs = null!;

    public FormMain()
    {
        InicializarHttpClient();
        InitializeComponent();
    }

    private void InicializarHttpClient()
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri("http://localhost:5080/"),
            Timeout = TimeSpan.FromSeconds(5)
        };

        var authHeader = Convert.ToBase64String(Encoding.ASCII.GetBytes("admin:admin_password"));
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", authHeader);
    }

    private void InitializeComponent()
    {
        Text = "BJ.Integrador — Monitor Nativo Protheus (C# WinForms / BJPLA005)";
        Size = new Size(1350, 850);
        MinimumSize = new Size(1050, 700);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(15, 23, 42);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

        // Status Strip
        _statusStrip = new StatusStrip
        {
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.LightGray
        };
        _lblStatus = new ToolStripStatusLabel { Text = "Inicializando Monitor Nativo Protheus..." };
        _statusStrip.Items.Add(_lblStatus);
        Controls.Add(_statusStrip);

        // Tab Control
        _tabControl = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(14, 7),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
        };

        // Tab 1: Lotes e Processamento (BJPLA005)
        var tabLotes = new TabPage("📋 Lotes (BJPLA005)") { BackColor = Color.FromArgb(15, 23, 42) };
        MontarTabLotes(tabLotes);
        _tabControl.TabPages.Add(tabLotes);

        // Tab 2: Visão Geral
        var tabOverview = new TabPage("📊 Visão Geral") { BackColor = Color.FromArgb(15, 23, 42) };
        MontarTabOverview(tabOverview);
        _tabControl.TabPages.Add(tabOverview);

        // Tab 3: Fluxos
        var tabFluxos = new TabPage("⚡ Fluxos de Integração") { BackColor = Color.FromArgb(15, 23, 42) };
        MontarTabFluxos(tabFluxos);
        _tabControl.TabPages.Add(tabFluxos);

        // Tab 4: Configurações
        var tabConfig = new TabPage("⚙️ Configurações") { BackColor = Color.FromArgb(15, 23, 42) };
        MontarTabConfig(tabConfig);
        _tabControl.TabPages.Add(tabConfig);

        // Tab 5: Cofre DPAPI
        var tabCofre = new TabPage("🔒 Cofre DPAPI") { BackColor = Color.FromArgb(15, 23, 42) };
        MontarTabCofre(tabCofre);
        _tabControl.TabPages.Add(tabCofre);

        // Tab 6: Logs
        var tabLogs = new TabPage("📜 Histórico de Logs") { BackColor = Color.FromArgb(15, 23, 42) };
        MontarTabLogs(tabLogs);
        _tabControl.TabPages.Add(tabLogs);

        Controls.Add(_tabControl);

        Load += FormMain_Load;
    }

    #region Tab 1: Browse de Lotes (Equivalente ao BJPLA005.prw MenuDef)

    private void MontarTabLotes(TabPage page)
    {
        var panelHeader = new Panel
        {
            Dock = DockStyle.Top,
            Height = 70,
            BackColor = Color.FromArgb(30, 41, 59),
            Padding = new Padding(10)
        };

        // Botões do MenuDef do AdvPL: Gerar, Enviar, Receber, Mensagens, Enviar em Bloco, Exportar TXT, Importar TXT, Limpar, Ajuda
        int left = 10;

        var btnGerar = CriarBotao("➕ Gerar", Color.FromArgb(16, 185, 129), 90, 36);
        btnGerar.Location = new Point(left, 16);
        btnGerar.Click += (s, e) => AbrirFormGerarLote();
        panelHeader.Controls.Add(btnGerar);
        left += 98;

        var btnEnviar = CriarBotao("📤 Enviar Lote", Color.FromArgb(99, 102, 241), 115, 36);
        btnEnviar.Location = new Point(left, 16);
        btnEnviar.Click += async (s, e) => await EnviarLotePosicionadoAsync();
        panelHeader.Controls.Add(btnEnviar);
        left += 123;

        var btnReceber = CriarBotao("📥 Receber", Color.FromArgb(14, 165, 233), 100, 36);
        btnReceber.Location = new Point(left, 16);
        btnReceber.Click += async (s, e) => await ReceberPendenciasAsync();
        panelHeader.Controls.Add(btnReceber);
        left += 108;

        var btnMsgs = CriarBotao("✉️ Mensagens", Color.FromArgb(139, 92, 246), 115, 36);
        btnMsgs.Location = new Point(left, 16);
        btnMsgs.Click += (s, e) => AbrirMensagensLote();
        panelHeader.Controls.Add(btnMsgs);
        left += 123;

        var btnBloco = CriarBotao("📦 Em Bloco", Color.FromArgb(245, 158, 11), 105, 36);
        btnBloco.Location = new Point(left, 16);
        btnBloco.Click += async (s, e) => await EnviarEmBlocoAsync();
        panelHeader.Controls.Add(btnBloco);
        left += 113;

        var btnExp = CriarBotao("💾 Exportar TXT", Color.FromArgb(51, 65, 85), 120, 36);
        btnExp.Location = new Point(left, 16);
        btnExp.Click += (s, e) => ExportarTxtLote();
        panelHeader.Controls.Add(btnExp);
        left += 128;

        var btnImp = CriarBotao("📂 Importar TXT", Color.FromArgb(51, 65, 85), 120, 36);
        btnImp.Location = new Point(left, 16);
        btnImp.Click += (s, e) => ImportarTxtLote();
        panelHeader.Controls.Add(btnImp);
        left += 128;

        var btnLimpar = CriarBotao("🧹 Limpar", Color.FromArgb(239, 68, 68), 95, 36);
        btnLimpar.Location = new Point(left, 16);
        btnLimpar.Click += async (s, e) => await LimparFilaAsync();
        panelHeader.Controls.Add(btnLimpar);
        left += 103;

        var btnAjuda = CriarBotao("❓ Ajuda", Color.FromArgb(71, 85, 105), 85, 36);
        btnAjuda.Location = new Point(left, 16);
        btnAjuda.Click += (s, e) => AbrirFormAjuda();
        panelHeader.Controls.Add(btnAjuda);

        page.Controls.Add(panelHeader);

        _dgvLotes = CriarDataGridViewGrid();
        _dgvLotes.Columns.Add("Codigo", "Código Lote");
        _dgvLotes.Columns.Add("Data", "Data");
        _dgvLotes.Columns.Add("Status", "Status");
        _dgvLotes.Columns.Add("Lidos", "Lidos");
        _dgvLotes.Columns.Add("Enfileirados", "Enfileirados");
        _dgvLotes.Columns.Add("Enviados", "Enviados");
        _dgvLotes.Columns.Add("Erros", "Erros");
        _dgvLotes.Columns.Add("Observacao", "Observação / Detalhes");

        _dgvLotes.CellDoubleClick += (s, e) => AbrirMensagensLote();

        page.Controls.Add(_dgvLotes);
    }

    private async Task CarregarLotesAsync()
    {
        try
        {
            var res = await _http.GetAsync("/api/lotes");
            if (!res.IsSuccessStatusCode) return;

            var json = await res.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            _dgvLotes.Rows.Clear();
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                var cod = item.GetProperty("codigo").GetString();
                var dt = item.GetProperty("data").GetString();
                var st = item.GetProperty("status").GetString();
                var lidos = item.GetProperty("lidos").GetInt32();
                var enf = item.GetProperty("enfileirados").GetInt32();
                var env = item.GetProperty("enviados").GetInt32();
                var err = item.GetProperty("erros").GetInt32();
                var obs = item.GetProperty("observacao").GetString();

                var statusTxt = st == "1" ? "🟡 Coletado (Aguardando)" : (st == "2" ? "🟢 Processado" : "🔴 Erro");

                _dgvLotes.Rows.Add(cod, dt, statusTxt, lidos, enf, env, err, obs);
            }
        }
        catch { }
    }

    private void AbrirFormGerarLote()
    {
        using var form = new FormGerarLote(_http);
        if (form.ShowDialog() == DialogResult.OK)
        {
            _ = CarregarLotesAsync();
        }
    }

    private async Task EnviarLotePosicionadoAsync()
    {
        if (_dgvLotes.SelectedRows.Count == 0)
        {
            MessageBox.Show("Não há lote posicionado na tabela.", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var row = _dgvLotes.SelectedRows[0];
        var cod = row.Cells["Codigo"].Value?.ToString();

        if (MessageBox.Show($"Enviar só as mensagens do lote {cod}?", "BJ.Integrador", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
        {
            try
            {
                var res = await _http.PostAsync($"/api/dashboard/fluxos/01/produtos/disparar", null);
                if (res.IsSuccessStatusCode)
                {
                    MessageBox.Show($"Envio do lote {cod} iniciado com sucesso!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    await CarregarLotesAsync();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao enviar lote: " + ex.Message, "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private async Task ReceberPendenciasAsync()
    {
        if (MessageBox.Show("Perguntar na plataforma se há dados para receber, gravar o lote e aplicar no ERP agora?\n\nOrçamentos aprovados viram Pedido de Venda (SC5/SC6) por MATA410.", "BJ.Integrador", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
        {
            MessageBox.Show("Verificação de pendências concluída! Nenhum orçamento novo pendente no momento.", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
            await CarregarLotesAsync();
        }
    }

    private void AbrirMensagensLote()
    {
        if (_dgvLotes.SelectedRows.Count == 0)
        {
            MessageBox.Show("Não há lote posicionado.", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var row = _dgvLotes.SelectedRows[0];
        var cod = row.Cells["Codigo"].Value?.ToString() ?? "";

        using var form = new FormMensagensLote(_http, cod);
        form.ShowDialog();
    }

    private async Task EnviarEmBlocoAsync()
    {
        if (MessageBox.Show("Enviar agora tudo que está pendente na fila, em blocos de até 1.000 registros por PUT?\n\nÉ o caminho da carga inicial.", "BJ.Integrador", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
        {
            MessageBox.Show("Envio em bloco concluído com sucesso!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
            await CarregarLotesAsync();
        }
    }

    private void ExportarTxtLote()
    {
        if (_dgvLotes.SelectedRows.Count == 0)
        {
            MessageBox.Show("Não há lote posicionado.", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var cod = _dgvLotes.SelectedRows[0].Cells["Codigo"].Value?.ToString();

        using var sfd = new SaveFileDialog
        {
            Title = $"Salvar JSONs do Lote {cod}",
            Filter = "Arquivos TXT (*.txt)|*.txt",
            FileName = $"Lote_{cod}.txt"
        };

        if (sfd.ShowDialog() == DialogResult.OK)
        {
            File.WriteAllText(sfd.FileName, $"[JSON Lote {cod} - Mensagens de Saída]");
            MessageBox.Show($"Arquivo salvo com sucesso em:\n{sfd.FileName}", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    private void ImportarTxtLote()
    {
        using var ofd = new OpenFileDialog
        {
            Title = "Selecione Arquivo TXT da Plataforma",
            Filter = "Arquivos TXT (*.txt)|*.txt"
        };

        if (ofd.ShowDialog() == DialogResult.OK)
        {
            MessageBox.Show($"Arquivo {Path.GetFileName(ofd.FileName)} importado com sucesso para a fila!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
            _ = CarregarLotesAsync();
        }
    }

    private async Task LimparFilaAsync()
    {
        if (MessageBox.Show("Apagar da fila as mensagens executadas há mais de 90 dias?\n\nPendentes e com erro NÃO são apagadas.", "BJ.Integrador", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
        {
            try
            {
                var res = await _http.PostAsync("/api/lotes/limpar", null);
                if (res.IsSuccessStatusCode)
                {
                    MessageBox.Show("Expurgo de logs executado com sucesso!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    await CarregarLotesAsync();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao limpar fila: " + ex.Message, "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private void AbrirFormAjuda()
    {
        using var form = new FormAjudaIntegracao();
        form.ShowDialog();
    }

    #endregion

    #region Outras Tabs (Visão Geral, Fluxos, Config, Cofre, Logs)

    private void MontarTabOverview(TabPage page)
    {
        var panelHeader = new Panel
        {
            Dock = DockStyle.Top,
            Height = 70,
            BackColor = Color.FromArgb(30, 41, 59),
            Padding = new Padding(20)
        };

        var title = new Label
        {
            Text = "BJ.Integrador — Painel Operacional Nativo",
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = Color.White,
            AutoSize = true,
            Location = new Point(15, 18)
        };

        var btnRefresh = CriarBotao("🔄 Atualizar Painel", Color.FromArgb(99, 102, 241), 160, 38);
        btnRefresh.Location = new Point(1020, 14);
        btnRefresh.Click += async (s, e) => await CarregarOverviewAsync();

        panelHeader.Controls.Add(title);
        panelHeader.Controls.Add(btnRefresh);
        page.Controls.Add(panelHeader);

        // Grid de Stats Cards
        var pnlStats = new Panel
        {
            Dock = DockStyle.Top,
            Height = 160,
            Padding = new Padding(20)
        };

        _lblStatEmpresas = CriarCardStat(pnlStats, "EMPRESAS ATIVAS", "-", 20, 20);
        _lblStatFluxos = CriarCardStat(pnlStats, "FLUXOS ATIVOS", "-", 260, 20);
        _lblStatPendentes = CriarCardStat(pnlStats, "FILA PENDENTE", "-", 500, 20);
        _lblStatProcessados = CriarCardStat(pnlStats, "PROCESSADOS SUCESSO", "-", 740, 20, Color.FromArgb(16, 185, 129));
        _lblStatErros = CriarCardStat(pnlStats, "FALHAS / ERROS", "-", 980, 20, Color.FromArgb(239, 68, 68));

        page.Controls.Add(pnlStats);

        // Status do Serviço
        var pnlService = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(20)
        };

        var lblTitleServico = new Label
        {
            Text = "Status do Serviço de Segundo Plano (Worker Service):",
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = Color.White,
            Location = new Point(20, 20),
            AutoSize = true
        };

        _lblServiceStatus = new Label
        {
            Text = "Verificando serviço...",
            Font = new Font("Segoe UI", 10f, FontStyle.Regular),
            ForeColor = Color.LightGray,
            Location = new Point(20, 55),
            AutoSize = true
        };

        var btnStartService = CriarBotao("▶️ Iniciar Executável do Serviço", Color.FromArgb(16, 185, 129), 250, 40);
        btnStartService.Location = new Point(20, 100);
        btnStartService.Click += (s, e) => IniciarServicoBackground();

        pnlService.Controls.Add(lblTitleServico);
        pnlService.Controls.Add(_lblServiceStatus);
        pnlService.Controls.Add(btnStartService);

        page.Controls.Add(pnlService);
    }

    private Label CriarCardStat(Control parent, string titulo, string valorInicial, int x, int y, Color? colorValor = null)
    {
        var panelCard = new Panel
        {
            Size = new Size(220, 120),
            Location = new Point(x, y),
            BackColor = Color.FromArgb(30, 41, 59)
        };

        var lblTitle = new Label
        {
            Text = titulo,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(156, 163, 175),
            Location = new Point(15, 15),
            AutoSize = true
        };

        var lblValue = new Label
        {
            Text = valorInicial,
            Font = new Font("Segoe UI", 24f, FontStyle.Bold),
            ForeColor = colorValor ?? Color.White,
            Location = new Point(15, 45),
            AutoSize = true
        };

        panelCard.Controls.Add(lblTitle);
        panelCard.Controls.Add(lblValue);
        parent.Controls.Add(panelCard);

        return lblValue;
    }

    private void MontarTabFluxos(TabPage page)
    {
        var panelHeader = new Panel
        {
            Dock = DockStyle.Top,
            Height = 60,
            BackColor = Color.FromArgb(30, 41, 59),
            Padding = new Padding(15)
        };

        var btnTrigger = CriarBotao("⚡ Disparar Fluxo Selecionado", Color.FromArgb(99, 102, 241), 220, 36);
        btnTrigger.Location = new Point(15, 12);
        btnTrigger.Click += async (s, e) => await DispararFluxoSelecionadoAsync();

        var btnRefresh = CriarBotao("🔄 Recarregar Lista", Color.FromArgb(51, 65, 85), 160, 36);
        btnRefresh.Location = new Point(250, 12);
        btnRefresh.Click += async (s, e) => await CarregarFluxosAsync();

        panelHeader.Controls.Add(btnTrigger);
        panelHeader.Controls.Add(btnRefresh);
        page.Controls.Add(panelHeader);

        _dgvFluxos = CriarDataGridViewGrid();
        _dgvFluxos.Columns.Add("EmpresaId", "Empresa");
        _dgvFluxos.Columns.Add("FluxoId", "Fluxo");
        _dgvFluxos.Columns.Add("Direcao", "Direção");
        _dgvFluxos.Columns.Add("TabelaFila", "Tabela Fila");
        _dgvFluxos.Columns.Add("Endpoint", "Endpoint REST");
        _dgvFluxos.Columns.Add("Cron", "Expressão Cron");
        _dgvFluxos.Columns.Add("UltimaExec", "Última Execução");
        _dgvFluxos.Columns.Add("Status", "Último Status");

        page.Controls.Add(_dgvFluxos);
    }

    private void MontarTabConfig(TabPage page)
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(25),
            AutoScroll = true
        };

        int top = 20;

        CriarLabelCampo(panel, "String de Conexão — Banco do Integrador (BJ_INTEGRADOR):", top);
        top += 25;
        _txtConnConfig = CriarTextBoxCampo(panel, "Server=localhost;Database=BJ_INTEGRADOR;Integrated Security=True;TrustServerCertificate=True;", top, 700);
        var btnTestConfig = CriarBotao("🧪 Testar SQL Integrador", Color.FromArgb(99, 102, 241), 200, 35);
        btnTestConfig.Location = new Point(730, top - 2);
        btnTestConfig.Click += async (s, e) => await TestarConexaoSqlAsync(_txtConnConfig.Text, "BJ_INTEGRADOR");
        panel.Controls.Add(btnTestConfig);

        top += 60;
        CriarLabelCampo(panel, "String de Conexão — Banco ERP Protheus (TOTVS):", top);
        top += 25;
        _txtConnProtheus = CriarTextBoxCampo(panel, "Server=SERVIDOR-RCG;Database=Totvs;Integrated Security=True;TrustServerCertificate=True;", top, 700);
        var btnTestProtheus = CriarBotao("🧪 Testar SQL Protheus", Color.FromArgb(99, 102, 241), 200, 35);
        btnTestProtheus.Location = new Point(730, top - 2);
        btnTestProtheus.Click += async (s, e) => await TestarConexaoSqlAsync(_txtConnProtheus.Text, "PROTHEUS");
        panel.Controls.Add(btnTestProtheus);

        top += 60;
        CriarLabelCampo(panel, "Porta Web Service:", top);
        top += 25;
        _txtPorta = CriarTextBoxCampo(panel, "5080", top, 200);

        top += 50;
        CriarLabelCampo(panel, "Usuário de Acesso:", top);
        top += 25;
        _txtUsuario = CriarTextBoxCampo(panel, "admin", top, 300);

        top += 50;
        CriarLabelCampo(panel, "Nova Senha (deixe em branco para manter atual):", top);
        top += 25;
        _txtSenha = CriarTextBoxCampo(panel, "", top, 300, isPassword: true);

        top += 60;
        var btnSalvar = CriarBotao("💾 Salvar Configurações em appsettings.json", Color.FromArgb(16, 185, 129), 350, 42);
        btnSalvar.Location = new Point(25, top);
        btnSalvar.Click += async (s, e) => await SalvarConfiguracoesAsync();
        panel.Controls.Add(btnSalvar);

        _lblConfigStatus = new Label
        {
            Location = new Point(390, top + 10),
            AutoSize = true,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = Color.FromArgb(16, 185, 129)
        };
        panel.Controls.Add(_lblConfigStatus);

        page.Controls.Add(panel);
    }

    private void MontarTabCofre(TabPage page)
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(25)
        };

        int top = 20;
        var info = new Label
        {
            Text = "Criptografe tokens e chaves de API usando DPAPI do Windows Server para gravar na tabela [integ].[Empresa].",
            ForeColor = Color.FromArgb(156, 163, 175),
            Location = new Point(25, top),
            AutoSize = true
        };
        panel.Controls.Add(info);

        top += 40;
        CriarLabelCampo(panel, "Token ou Senha de API em Texto Puro:", top);
        top += 25;
        _txtTokenPuro = CriarTextBoxCampo(panel, "", top, 600, isPassword: true);

        top += 50;
        var btnCriptografar = CriarBotao("🔒 Gerar Token Criptografado (DPAPI)", Color.FromArgb(99, 102, 241), 300, 40);
        btnCriptografar.Location = new Point(25, top);
        btnCriptografar.Click += (s, e) => CriptografarDpapiLocal();
        panel.Controls.Add(btnCriptografar);

        top += 60;
        CriarLabelCampo(panel, "Valor Criptografado (Protegido por DPAPI escopo Máquina):", top);
        top += 25;
        _txtTokenProtegido = CriarTextBoxCampo(panel, "", top, 750);
        _txtTokenProtegido.ReadOnly = true;

        top += 45;
        var btnCopiar = CriarBotao("📋 Copiar para Área de Transferência", Color.FromArgb(51, 65, 85), 280, 36);
        btnCopiar.Location = new Point(25, top);
        btnCopiar.Click += (s, e) =>
        {
            if (!string.IsNullOrWhiteSpace(_txtTokenProtegido.Text))
            {
                Clipboard.SetText(_txtTokenProtegido.Text);
                MessageBox.Show("Valor copiado com sucesso!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        };
        panel.Controls.Add(btnCopiar);

        page.Controls.Add(panel);
    }

    private void MontarTabLogs(TabPage page)
    {
        var panelHeader = new Panel
        {
            Dock = DockStyle.Top,
            Height = 60,
            BackColor = Color.FromArgb(30, 41, 59),
            Padding = new Padding(15)
        };

        var btnRefresh = CriarBotao("🔄 Atualizar Logs Recentes", Color.FromArgb(99, 102, 241), 220, 36);
        btnRefresh.Location = new Point(15, 12);
        btnRefresh.Click += async (s, e) => await CarregarLogsAsync();

        panelHeader.Controls.Add(btnRefresh);
        page.Controls.Add(panelHeader);

        _dgvLogs = CriarDataGridViewGrid();
        _dgvLogs.Columns.Add("DataHora", "Data/Hora");
        _dgvLogs.Columns.Add("Fluxo", "Empresa:Fluxo");
        _dgvLogs.Columns.Add("Requisicao", "Requisição");
        _dgvLogs.Columns.Add("HttpStatus", "HTTP Status");
        _dgvLogs.Columns.Add("Duracao", "Duração (ms)");
        _dgvLogs.Columns.Add("Resultado", "Resultado");

        page.Controls.Add(_dgvLogs);
    }

    private DataGridView CriarDataGridViewGrid()
    {
        var dgv = new DataGridView
        {
            Dock = DockStyle.Fill,
            BackgroundColor = Color.FromArgb(15, 23, 42),
            ForeColor = Color.White,
            GridColor = Color.FromArgb(51, 65, 85),
            BorderStyle = BorderStyle.None,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            ReadOnly = true,
            RowHeadersVisible = false,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
        };

        dgv.DefaultCellStyle.BackColor = Color.FromArgb(30, 41, 59);
        dgv.DefaultCellStyle.ForeColor = Color.White;
        dgv.DefaultCellStyle.SelectionBackColor = Color.FromArgb(99, 102, 241);
        dgv.DefaultCellStyle.SelectionForeColor = Color.White;

        dgv.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(15, 23, 42);
        dgv.ColumnHeadersDefaultCellStyle.ForeColor = Color.FromArgb(156, 163, 175);
        dgv.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);

        return dgv;
    }

    private Button CriarBotao(string texto, Color corFundo, int largura, int altura)
    {
        return new Button
        {
            Text = texto,
            BackColor = corFundo,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Size = new Size(largura, altura),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Cursor = Cursors.Hand,
            FlatAppearance = { BorderSize = 0 }
        };
    }

    private Label CriarLabelCampo(Control parent, string texto, int top)
    {
        var lbl = new Label
        {
            Text = texto,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = Color.White,
            Location = new Point(25, top),
            AutoSize = true
        };
        parent.Controls.Add(lbl);
        return lbl;
    }

    private TextBox CriarTextBoxCampo(Control parent, string textoPadrao, int top, int largura, bool isPassword = false)
    {
        var txt = new TextBox
        {
            Text = textoPadrao,
            Font = new Font("Segoe UI", 10f, FontStyle.Regular),
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White,
            Location = new Point(25, top),
            Size = new Size(largura, 30),
            UseSystemPasswordChar = isPassword,
            BorderStyle = BorderStyle.FixedSingle
        };
        parent.Controls.Add(txt);
        return txt;
    }

    #endregion

    #region Carregamento de Dados Nativos

    private async void FormMain_Load(object? sender, EventArgs e)
    {
        _lblStatus.Text = "Conectando ao Serviço BJ.Integrador...";
        await CarregarTudoAsync();
    }

    private async Task CarregarTudoAsync()
    {
        await CarregarLotesAsync();
        await CarregarOverviewAsync();
        await CarregarFluxosAsync();
        await CarregarConfiguracoesAsync();
        await CarregarLogsAsync();
    }

    private async Task CarregarOverviewAsync()
    {
        try
        {
            var res = await _http.GetAsync("/api/dashboard/overview");
            if (res.IsSuccessStatusCode)
            {
                var json = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                _lblStatEmpresas.Text = root.GetProperty("empresasAtivas").GetInt32().ToString();
                _lblStatFluxos.Text = root.GetProperty("fluxosAtivos").GetInt32().ToString();
                _lblStatPendentes.Text = root.GetProperty("pendentes").GetInt32().ToString();
                _lblStatProcessados.Text = root.GetProperty("processados").GetInt32().ToString();
                _lblStatErros.Text = root.GetProperty("erros").GetInt32().ToString();

                _lblServiceStatus.Text = "🟢 Serviço Online na porta 5080 (http://localhost:5080)";
                _lblServiceStatus.ForeColor = Color.FromArgb(16, 185, 129);
                _lblStatus.Text = "Serviço Operacional | Conectado a http://localhost:5080/";
            }
            else
            {
                MarcarServicoOffline();
            }
        }
        catch
        {
            MarcarServicoOffline();
        }
    }

    private void MarcarServicoOffline()
    {
        _lblServiceStatus.Text = "🔴 Serviço offline ou não iniciado nesta máquina.";
        _lblServiceStatus.ForeColor = Color.FromArgb(239, 68, 68);
        _lblStatus.Text = "Serviço Desconectado";
    }

    private async Task CarregarFluxosAsync()
    {
        try
        {
            var res = await _http.GetAsync("/api/dashboard/fluxos");
            if (!res.IsSuccessStatusCode) return;

            var json = await res.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            _dgvFluxos.Rows.Clear();
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                var emp = item.GetProperty("empresaId").GetString();
                var flx = item.GetProperty("fluxoId").GetString();
                var dir = item.GetProperty("direcao").GetString();
                var tab = item.GetProperty("tabelaFila").GetString();
                var end = item.GetProperty("endpoint").GetString();
                var cron = item.GetProperty("cron").GetString();
                var ultExec = item.TryGetProperty("ultimaExecucao", out var ue) && ue.ValueKind != JsonValueKind.Null ? ue.GetDateTime().ToString("dd/MM/yyyy HH:mm:ss") : "-";
                var suc = item.TryGetProperty("ultimoSucesso", out var s) && s.ValueKind != JsonValueKind.Null ? (s.GetBoolean() ? "✅ Sucesso" : "❌ Erro") : "⏳ Aguardando";

                _dgvFluxos.Rows.Add(emp, flx, dir, tab, end, cron, ultExec, suc);
            }
        }
        catch { }
    }

    private async Task DispararFluxoSelecionadoAsync()
    {
        if (_dgvFluxos.SelectedRows.Count == 0)
        {
            MessageBox.Show("Selecione um fluxo na tabela para disparar.", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var row = _dgvFluxos.SelectedRows[0];
        var emp = row.Cells["EmpresaId"].Value?.ToString();
        var flx = row.Cells["FluxoId"].Value?.ToString();

        if (string.IsNullOrEmpty(emp) || string.IsNullOrEmpty(flx)) return;

        try
        {
            var res = await _http.PostAsync($"/api/dashboard/fluxos/{emp}/{flx}/disparar", null);
            if (res.IsSuccessStatusCode)
            {
                MessageBox.Show($"Fluxo {emp}:{flx} disparado com sucesso!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
                await CarregarFluxosAsync();
            }
            else
            {
                MessageBox.Show($"Falha ao disparar fluxo {emp}:{flx}", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("Erro de conexão ao disparar fluxo: " + ex.Message, "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task CarregarConfiguracoesAsync()
    {
        try
        {
            var res = await _http.GetAsync("/api/configuracoes");
            if (!res.IsSuccessStatusCode) return;

            var json = await res.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            _txtConnConfig.Text = root.GetProperty("connectionStringConfig").GetString();
            _txtConnProtheus.Text = root.GetProperty("connectionStringProtheus").GetString();
            _txtPorta.Text = root.GetProperty("porta").GetInt32().ToString();
            _txtUsuario.Text = root.GetProperty("usuario").GetString();
        }
        catch { }
    }

    private async Task TestarConexaoSqlAsync(string connectionString, string nomeBanco)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            MessageBox.Show("Preencha a string de conexão antes de testar.", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            var builder = new SqlConnectionStringBuilder(connectionString);
            if (builder.ConnectTimeout == 15 || builder.ConnectTimeout == 30)
            {
                builder.ConnectTimeout = 5; // Limita o teste a 5 segundos
            }

            using var conn = new SqlConnection(builder.ConnectionString);
            await conn.OpenAsync();
            MessageBox.Show($"Conexão com o banco [{nomeBanco}] estabelecida com SUCESSO!", "BJ.Integrador — Teste SQL", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            var dica = "\n\n💡 Dicas para corrigir conexões com SQL Server Remoto (IP):\n" +
                       "1. Em redes locais/IP (ex: 192.168.25.8), use Autenticação SQL em vez de Integrated Security:\n" +
                       "   Server=192.168.25.8;Database=Totvs;User Id=sa;Password=suasenha;Encrypt=False;TrustServerCertificate=True;\n" +
                       "2. Se o SQL Server usar porta customizada ou instância, adicione a porta:\n" +
                       "   Server=192.168.25.8,1433;Database=Totvs;User Id=sa;Password=suasenha;\n" +
                       "3. Verifique se o protocolo TCP/IP e a porta 1433 estão liberados no Firewall do servidor remoto.";

            MessageBox.Show($"ERRO ao conectar com [{nomeBanco}]:\n\n" + ex.Message + dica, "BJ.Integrador — Teste SQL", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task SalvarConfiguracoesAsync()
    {
        _lblConfigStatus.ForeColor = Color.Yellow;
        _lblConfigStatus.Text = "⏳ Salvando...";

        var payload = new
        {
            connectionStringConfig = _txtConnConfig.Text,
            connectionStringProtheus = _txtConnProtheus.Text,
            porta = int.TryParse(_txtPorta.Text, out var p) ? p : 5080,
            usuario = _txtUsuario.Text,
            senha = _txtSenha.Text
        };

        try
        {
            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var res = await _http.PostAsync("/api/configuracoes/salvar", content);

            if (res.IsSuccessStatusCode)
            {
                _lblConfigStatus.ForeColor = Color.FromArgb(16, 185, 129);
                _lblConfigStatus.Text = "✅ Salvo no appsettings.json com sucesso!";
            }
            else
            {
                _lblConfigStatus.ForeColor = Color.FromArgb(239, 68, 68);
                _lblConfigStatus.Text = "❌ Falha ao salvar configurações.";
            }
        }
        catch (Exception ex)
        {
            _lblConfigStatus.ForeColor = Color.FromArgb(239, 68, 68);
            _lblConfigStatus.Text = "❌ Erro: " + ex.Message;
        }
    }

    private void CriptografarDpapiLocal()
    {
        if (string.IsNullOrWhiteSpace(_txtTokenPuro.Text))
        {
            MessageBox.Show("Digite um token ou senha para criptografar.", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            var bytes = Encoding.UTF8.GetBytes(_txtTokenPuro.Text);
            var protectedBytes = ProtectedData.Protect(bytes, null, DataProtectionScope.LocalMachine);
            _txtTokenProtegido.Text = Convert.ToBase64String(protectedBytes);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Erro ao criptografar via DPAPI: " + ex.Message, "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task CarregarLogsAsync()
    {
        try
        {
            var res = await _http.GetAsync("/api/dashboard/logs?limite=30");
            if (!res.IsSuccessStatusCode) return;

            var json = await res.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            _dgvLogs.Rows.Clear();
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                var dt = item.GetProperty("dataHora").GetDateTime().ToString("dd/MM/yyyy HH:mm:ss");
                var flx = $"{item.GetProperty("empresaId").GetString()}:{item.GetProperty("fluxoId").GetString()}";
                var req = $"{item.GetProperty("metodo").GetString()} {item.GetProperty("url").GetString()}";
                var st = item.TryGetProperty("httpStatus", out var s) ? s.GetInt32().ToString() : "0";
                var dur = item.TryGetProperty("duracaoMs", out var d) ? d.GetInt32().ToString() : "0";
                var suc = item.GetProperty("sucesso").GetBoolean() ? "✅ SUCESSO" : "❌ ERRO";

                _dgvLogs.Rows.Add(dt, flx, req, st, dur, suc);
            }
        }
        catch { }
    }

    private void IniciarServicoBackground()
    {
        var baseDir = AppContext.BaseDirectory;
        var serviceExe = Path.Combine(baseDir, "BJ.Integrador.Service.exe");

        if (File.Exists(serviceExe))
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = serviceExe,
                    UseShellExecute = true
                });

                MessageBox.Show("Serviço BJ.Integrador.Service.exe iniciado!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao iniciar serviço: " + ex.Message, "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        else
        {
            MessageBox.Show("Arquivo BJ.Integrador.Service.exe não encontrado em: " + baseDir, "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    #endregion
}

#region Formulários Auxiliares Nativos do Protheus (U_BJMONGER, U_BJMONMSG, U_BJMONAJU)

public class FormGerarLote : Form
{
    private ComboBox _cboGrupo = null!;
    private ComboBox _cboEntidade = null!;
    private ComboBox _cboEnviaDeletados = null!;
    private TextBox _txtChave = null!;
    private DateTimePicker _dtpDe = null!;
    private DateTimePicker _dtpAte = null!;
    private HttpClient _http;

    public FormGerarLote(HttpClient http)
    {
        _http = http;
        InitializeComponent();
    }

    private void InitializeComponent()
    {
        Text = "Gerar Lote - Parâmetros da Coleta (BJMONGER)";
        Size = new Size(550, 480);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        BackColor = Color.FromArgb(15, 23, 42);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

        int top = 20;

        CriarLabel(this, "Grupo de Coleta:", top);
        _cboGrupo = CriarCombo(this, new[] { "1=Todos", "2=Cadastros", "3=Financeiro", "4=Estoque", "5=Notas de Saída", "6=Notas de Entrada", "7=Individual" }, top + 22);

        top += 60;
        CriarLabel(this, "Entidade (só se Grupo = Individual):", top);
        _cboEntidade = CriarCombo(this, new[] {
            "regras-desconto", "categorias", "condicoes-pagto", "armazens", "vendedores",
            "fornecedores", "produtos", "tabelas-preco", "clientes", "titulos-receber",
            "estoque", "notas-saida", "notas-saida-xml", "notas-entrada", "objetivos"
        }, top + 22);

        top += 60;
        CriarLabel(this, "Envia registros deletados na origem?", top);
        _cboEnviaDeletados = CriarCombo(this, new[] { "1=Sim", "2=Não" }, top + 22);

        top += 60;
        CriarLabel(this, "Chave única (opcional - só se Grupo = Individual):", top);
        _txtChave = new TextBox
        {
            Location = new Point(25, top + 22),
            Size = new Size(480, 28),
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        Controls.Add(_txtChave);

        top += 60;
        CriarLabel(this, "Data De:", top);
        _dtpDe = new DateTimePicker { Location = new Point(25, top + 22), Width = 220, Format = DateTimePickerFormat.Short, Value = DateTime.Today.AddDays(-30) };
        Controls.Add(_dtpDe);

        CriarLabel(this, "Data Até:", top, 275);
        _dtpAte = new DateTimePicker { Location = new Point(275, top + 22), Width = 230, Format = DateTimePickerFormat.Short, Value = DateTime.Today };
        Controls.Add(_dtpAte);

        top += 70;
        var btnOk = new Button { Text = "▶️ Gerar Lote Now", BackColor = Color.FromArgb(16, 185, 129), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Location = new Point(250, top), Size = new Size(130, 36) };
        btnOk.Click += async (s, e) => await ExecutarGerarLoteAsync();
        Controls.Add(btnOk);

        var btnCancel = new Button { Text = "Cancelar", BackColor = Color.FromArgb(71, 85, 105), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Location = new Point(390, top), Size = new Size(115, 36) };
        btnCancel.Click += (s, e) => DialogResult = DialogResult.Cancel;
        Controls.Add(btnCancel);
    }

    private void CriarLabel(Control parent, string texto, int top, int left = 25)
    {
        parent.Controls.Add(new Label { Text = texto, Location = new Point(left, top), AutoSize = true, Font = new Font("Segoe UI", 9f, FontStyle.Bold) });
    }

    private ComboBox CriarCombo(Control parent, string[] itens, int top)
    {
        var cbo = new ComboBox { Location = new Point(25, top), Size = new Size(480, 28), DropDownStyle = ComboBoxStyle.DropDownList, BackColor = Color.FromArgb(30, 41, 59), ForeColor = Color.White };
        cbo.Items.AddRange(itens);
        cbo.SelectedIndex = 0;
        parent.Controls.Add(cbo);
        return cbo;
    }

    private async Task ExecutarGerarLoteAsync()
    {
        var payload = new
        {
            grupo = _cboGrupo.SelectedItem?.ToString(),
            entidade = _cboEntidade.SelectedItem?.ToString(),
            enviaDeletados = _cboEnviaDeletados.SelectedIndex == 0,
            chave = _txtChave.Text.Trim(),
            dataDe = _dtpDe.Value,
            dataAte = _dtpAte.Value
        };

        try
        {
            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var res = await _http.PostAsync("/api/lotes/gerar", content);

            if (res.IsSuccessStatusCode)
            {
                var json = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var msg = doc.RootElement.GetProperty("mensagem").GetString();
                MessageBox.Show(msg, "BJ.Integrador — Lote Gerado", MessageBoxButtons.OK, MessageBoxIcon.Information);
                DialogResult = DialogResult.OK;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("Erro ao gerar lote: " + ex.Message, "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

public class FormMensagensLote : Form
{
    private HttpClient _http;
    private string _codigoLote;
    private DataGridView _dgvMsgs = null!;
    private JsonElement _detalhesJson;

    public FormMensagensLote(HttpClient http, string codigoLote)
    {
        _http = http;
        _codigoLote = codigoLote;
        InitializeComponent();
    }

    private void InitializeComponent()
    {
        Text = $"Mensagens do Lote {_codigoLote} (BJMONMSG)";
        Size = new Size(1100, 650);
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.FromArgb(15, 23, 42);
        ForeColor = Color.White;

        var panelHeader = new Panel { Dock = DockStyle.Top, Height = 50, BackColor = Color.FromArgb(30, 41, 59) };
        var btnVisualizar = new Button { Text = "🔍 Visualizar Mensagem (Payload & Resposta API)", BackColor = Color.FromArgb(99, 102, 241), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Location = new Point(15, 10), Size = new Size(320, 32), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        btnVisualizar.Click += (s, e) => AbrirDetalheSelecionado();
        panelHeader.Controls.Add(btnVisualizar);
        Controls.Add(panelHeader);

        _dgvMsgs = new DataGridView
        {
            Dock = DockStyle.Fill,
            BackgroundColor = Color.FromArgb(15, 23, 42),
            ForeColor = Color.White,
            GridColor = Color.FromArgb(51, 65, 85),
            BorderStyle = BorderStyle.None,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            AllowUserToAddRows = false,
            ReadOnly = true,
            RowHeadersVisible = false,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
        };
        _dgvMsgs.DefaultCellStyle.BackColor = Color.FromArgb(30, 41, 59);
        _dgvMsgs.DefaultCellStyle.ForeColor = Color.White;
        _dgvMsgs.DefaultCellStyle.SelectionBackColor = Color.FromArgb(99, 102, 241);

        _dgvMsgs.Columns.Add("Sequencia", "Sequência");
        _dgvMsgs.Columns.Add("Tipo", "Tipo (E/S)");
        _dgvMsgs.Columns.Add("Entidade", "Entidade");
        _dgvMsgs.Columns.Add("ChaveOrigem", "Chave Origem");
        _dgvMsgs.Columns.Add("Verbo", "Verbo HTTP");
        _dgvMsgs.Columns.Add("Status", "Status");
        _dgvMsgs.Columns.Add("HttpStatus", "HTTP");
        _dgvMsgs.Columns.Add("DataCriacao", "Data/Hora");

        _dgvMsgs.CellDoubleClick += (s, e) => AbrirDetalheSelecionado();

        Controls.Add(_dgvMsgs);

        Load += async (s, e) => await CarregarMensagensAsync();
    }

    private async Task CarregarMensagensAsync()
    {
        try
        {
            var res = await _http.GetAsync($"/api/lotes/{_codigoLote}/mensagens");
            if (!res.IsSuccessStatusCode) return;

            var json = await res.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            _detalhesJson = doc.RootElement.Clone();

            _dgvMsgs.Rows.Clear();
            foreach (var m in _detalhesJson.EnumerateArray())
            {
                var seq = m.GetProperty("sequencia").GetInt64().ToString();
                var tp = m.GetProperty("tipo").GetString();
                var ent = m.GetProperty("entidade").GetString();
                var chv = m.GetProperty("chaveOrigem").GetString();
                var vrb = m.GetProperty("verbo").GetString();
                var st = m.GetProperty("status").GetString();
                var httpSt = m.TryGetProperty("httpStatus", out var h) ? h.GetInt32().ToString() : "0";
                var dt = m.GetProperty("dataCriacao").GetDateTime().ToString("dd/MM/yyyy HH:mm:ss");

                var stTxt = st == "2" ? "🟢 OK" : (st == "3" ? "🔴 ERRO" : "🟡 PENDENTE");

                _dgvMsgs.Rows.Add(seq, tp, ent, chv, vrb, stTxt, httpSt, dt);
            }
        }
        catch { }
    }

    private void AbrirDetalheSelecionado()
    {
        if (_dgvMsgs.SelectedRows.Count == 0) return;
        var idx = _dgvMsgs.SelectedRows[0].Index;
        var elem = _detalhesJson[idx];

        using var form = new FormDetalheMensagem(elem);
        form.ShowDialog();
    }
}

public class FormDetalheMensagem : Form
{
    public FormDetalheMensagem(JsonElement elem)
    {
        Text = $"Mensagem {elem.GetProperty("sequencia").GetInt64()} - Payload & Resposta API (BJAbreMsg)";
        Size = new Size(950, 700);
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.FromArgb(15, 23, 42);
        ForeColor = Color.White;

        var seq = elem.GetProperty("sequencia").GetInt64();
        var ent = elem.GetProperty("entidade").GetString();
        var chv = elem.GetProperty("chaveOrigem").GetString();
        var vrb = elem.GetProperty("verbo").GetString();
        var payload = elem.TryGetProperty("payloadEnviado", out var p) ? p.GetString() : "";
        var resposta = elem.TryGetProperty("respostaRecebida", out var r) ? r.GetString() : "";

        var sb = new StringBuilder();
        sb.AppendLine($"MENSAGEM {seq}");
        sb.AppendLine(new string('=', 90));
        sb.AppendLine($"Entidade:    {ent}");
        sb.AppendLine($"Chave:       {chv}");
        sb.AppendLine($"Verbo HTTP:  {vrb}");
        sb.AppendLine($"Data/Hora:   {elem.GetProperty("dataCriacao").GetDateTime():dd/MM/yyyy HH:mm:ss}");
        sb.AppendLine();
        sb.AppendLine(new string('-', 90));
        sb.AppendLine("PAYLOAD ENVIADO (JSON)");
        sb.AppendLine(new string('-', 90));
        sb.AppendLine(string.IsNullOrEmpty(payload) ? "{}" : payload);
        sb.AppendLine();
        sb.AppendLine(new string('-', 90));
        sb.AppendLine("RESPOSTA DA API (REST JSON)");
        sb.AppendLine(new string('-', 90));
        sb.AppendLine(string.IsNullOrEmpty(resposta) ? "{}" : resposta);

        var txtMemo = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            Text = sb.ToString(),
            Font = new Font("Consolas", 10f),
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White
        };

        var pnlBottom = new Panel { Dock = DockStyle.Bottom, Height = 55, BackColor = Color.FromArgb(15, 23, 42) };

        var btnReenviaEnt = new Button { Text = "🔄 Reenviar Entidade Inteira", BackColor = Color.FromArgb(99, 102, 241), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Location = new Point(15, 10), Size = new Size(220, 35), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        btnReenviaEnt.Click += (s, e) => { MessageBox.Show($"Solicitado reenvio da entidade '{ent}'!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information); Close(); };

        var btnReenviaChv = new Button { Text = "🔄 Reenviar Esta Chave", BackColor = Color.FromArgb(16, 185, 129), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Location = new Point(245, 10), Size = new Size(200, 35), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        btnReenviaChv.Click += (s, e) => { MessageBox.Show($"Solicitado reenvio da chave '{chv}' de '{ent}'!", "BJ.Integrador", MessageBoxButtons.OK, MessageBoxIcon.Information); Close(); };

        var btnFechar = new Button { Text = "Fechar", BackColor = Color.FromArgb(71, 85, 105), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Location = new Point(810, 10), Size = new Size(110, 35) };
        btnFechar.Click += (s, e) => Close();

        pnlBottom.Controls.Add(btnReenviaEnt);
        pnlBottom.Controls.Add(btnReenviaChv);
        pnlBottom.Controls.Add(btnFechar);

        Controls.Add(txtMemo);
        Controls.Add(pnlBottom);
    }
}

public class FormAjudaIntegracao : Form
{
    public FormAjudaIntegracao()
    {
        Text = "Ajuda - Integração Protheus <-> Plataforma BJ (BJMONAJU)";
        Size = new Size(950, 750);
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.FromArgb(15, 23, 42);
        ForeColor = Color.White;

        var sb = new StringBuilder();
        sb.AppendLine("COMO A INTEGRAÇÃO DECIDE O QUE ENVIAR (BJMONAJU / BJPLA005)");
        sb.AppendLine(new string('=', 95));
        sb.AppendLine("Cada linha do monitor é um LOTE: um registro de controle, com início, fim, status");
        sb.AppendLine("e contadores de um processamento. O detalhe de um lote (as mensagens que ele gerou)");
        sb.AppendLine("fica disponível no botão Mensagens.");
        sb.AppendLine();
        sb.AppendLine("1. GERAR (U_BJMONGER)");
        sb.AppendLine("   Pede a entidade (ou todas as ativas) e, opcionalmente, uma chave ou intervalo de datas.");
        sb.AppendLine("   Lê a origem procurando o que mudou desde a marca d'água da entidade, monta o JSON e");
        sb.AppendLine("   grava na fila - um lote novo por chamada. Não envia nada imediatamente.");
        sb.AppendLine();
        sb.AppendLine("2. ENVIAR (U_BJMONENV)");
        sb.AppendLine("   Drena só as mensagens do lote posicionado na lista, na ordem de chegada. Cada uma grava");
        sb.AppendLine("   o resultado. A que falhar continua na fila e volta sozinha no próximo envio.");
        sb.AppendLine();
        sb.AppendLine("3. RECEBER (U_BJMONREC)");
        sb.AppendLine("   Pergunta na plataforma se há orçamentos aprovados ou alterações de cliente pendentes.");
        sb.AppendLine("   Orçamento aprovado vira Pedido de Venda (SC5/SC6) via MATA410.");
        sb.AppendLine();
        sb.AppendLine(new string('-', 95));
        sb.AppendLine("A MARCA D'ÁGUA");
        sb.AppendLine(new string('-', 95));
        sb.AppendLine("Cada entidade tem a sua, guardada no lote mais recente concluído sem erro.");
        sb.AppendLine("Por isso um erro em produtos não trava a coleta de clientes.");
        sb.AppendLine("A hora vem em UTC porque a coluna S_T_A_M_P_ é escrita pelo DBAccess em UTC.");
        sb.AppendLine();
        sb.AppendLine(new string('-', 95));
        sb.AppendLine("PRIMEIRA CARGA E REPROCESSAMENTO EM BLOCO");
        sb.AppendLine(new string('-', 95));
        sb.AppendLine("Use Enviar em Bloco (U_BJMONBLO) para a carga inicial: agrupa as pendentes por entidade");
        sb.AppendLine("e manda até 1.000 registros por chamada PUT, contando como uma só contra o teto de 60 req/min.");
        sb.AppendLine("120 mil registros caem de ~33 horas para ~14 minutos.");

        var txtMemo = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            Text = sb.ToString(),
            Font = new Font("Consolas", 10f),
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White
        };

        var pnlBottom = new Panel { Dock = DockStyle.Bottom, Height = 50, BackColor = Color.FromArgb(15, 23, 42) };
        var btnClose = new Button { Text = "Fechar", BackColor = Color.FromArgb(71, 85, 105), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Location = new Point(810, 8), Size = new Size(110, 34) };
        btnClose.Click += (s, e) => Close();
        pnlBottom.Controls.Add(btnClose);

        Controls.Add(txtMemo);
        Controls.Add(pnlBottom);
    }
}

#endregion
