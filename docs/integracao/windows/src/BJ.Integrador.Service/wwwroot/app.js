document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  carregarOverview();
  carregarFluxos();
  carregarLogs();
  
  // Auto-refresh stats e fluxos a cada 10s
  setInterval(() => {
    carregarOverview();
    carregarFluxos();
  }, 10000);
});

function initTabs() {
  const buttons = document.querySelectorAll('.nav-btn');
  const contents = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      
      buttons.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');

      if (target === 'logs') carregarLogs();
      if (target === 'config') carregarConfiguracoes();
    });
  });
}

async function carregarOverview() {
  try {
    const res = await fetch('/api/dashboard/overview');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('stat-empresas').innerText = data.empresasAtivas;
    document.getElementById('stat-fluxos').innerText = data.fluxosAtivos;
    document.getElementById('stat-pendentes').innerText = data.pendentes;
    document.getElementById('stat-processados').innerText = data.processados;
    document.getElementById('stat-erros').innerText = data.erros;
  } catch (err) {
    console.error('Erro ao carregar visão geral:', err);
  }
}

async function carregarFluxos() {
  try {
    const res = await fetch('/api/dashboard/fluxos');
    if (!res.ok) return;
    const fluxos = await res.json();

    const tbody = document.getElementById('tbody-fluxos');
    tbody.innerHTML = '';

    fluxos.forEach(f => {
      const tr = document.createElement('tr');
      const direcaoClass = f.direcao === 'ENVIO' ? 'badge-envio' : 'badge-recebimento';
      const statusIcon = f.ultimoSucesso === true ? '✅ Sucesso' : (f.ultimoSucesso === false ? '❌ Erro' : '⏳ Aguardando');

      tr.innerHTML = `
        <td><strong>${f.empresaId}:${f.fluxoId}</strong></td>
        <td><span class="badge ${direcaoClass}">${f.direcao}</span></td>
        <td><code>${f.tabelaFila}</code></td>
        <td><code>${f.endpoint}</code></td>
        <td><code>${f.cron}</code></td>
        <td>${statusIcon}</td>
        <td>
          <button class="btn-trigger" onclick="dispararFluxo('${f.empresaId}', '${f.fluxoId}')">⚡ Disparar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao carregar fluxos:', err);
  }
}

async function dispararFluxo(empresaId, fluxoId) {
  try {
    const res = await fetch(`/api/dashboard/fluxos/${empresaId}/${fluxoId}/disparar`, { method: 'POST' });
    if (res.ok) {
      alert(`Fluxo ${empresaId}:${fluxoId} disparado com sucesso!`);
      setTimeout(carregarFluxos, 1000);
    } else {
      alert(`Falha ao disparar fluxo ${empresaId}:${fluxoId}`);
    }
  } catch (err) {
    alert('Erro de conexão ao disparar fluxo.');
  }
}

async function carregarLogs() {
  try {
    const res = await fetch('/api/dashboard/logs?limite=30');
    if (!res.ok) return;
    const logs = await res.json();

    const tbody = document.getElementById('tbody-logs');
    tbody.innerHTML = '';

    logs.forEach(l => {
      const tr = document.createElement('tr');
      const badgeClass = l.sucesso ? 'badge-sucesso' : 'badge-erro';
      const statusTexto = l.sucesso ? 'SUCESSO' : 'ERRO';

      tr.innerHTML = `
        <td>${new Date(l.dataHora).toLocaleString()}</td>
        <td><strong>${l.empresaId}:${l.fluxoId}</strong></td>
        <td><code>${l.metodo} ${l.url}</code></td>
        <td><code>${l.httpStatus || 0}</code></td>
        <td>${l.duracaoMs || 0} ms</td>
        <td><span class="badge ${badgeClass}">${statusTexto}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao carregar logs:', err);
  }
}

async function protegerCredencial() {
  const input = document.getElementById('input-credencial');
  const resultBox = document.getElementById('result-credencial');
  const valorInput = input.value.trim();

  if (!valorInput) {
    alert('Digite um token ou senha para criptografar.');
    return;
  }

  try {
    const res = await fetch('/api/seguranca/proteger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: valorInput })
    });

    if (res.ok) {
      const data = await res.json();
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <strong>VALOR CRIPTOGRAFADO (DPAPI):</strong><br/>
        <span id="text-protected">${data.valorCriptografado}</span><br/><br/>
        <button class="btn-trigger" onclick="copiarProtegido()">📋 Copiar Valor</button>
      `;
    } else {
      alert('Falha ao criptografar credencial.');
    }
  } catch (err) {
    alert('Erro de comunicação com o cofre de credenciais.');
  }
}

function copiarProtegido() {
  const span = document.getElementById('text-protected');
  if (span) {
    navigator.clipboard.writeText(span.innerText);
    alert('Valor criptografado copiado para a área de transferência!');
  }
}

async function carregarConfiguracoes() {
  try {
    const res = await fetch('/api/configuracoes');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('cfg-conn-config').value = data.connectionStringConfig || '';
    document.getElementById('cfg-conn-protheus').value = data.connectionStringProtheus || '';
    document.getElementById('cfg-porta').value = data.porta || 5080;
    document.getElementById('cfg-usuario').value = data.usuario || 'admin';
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

async function testarConexao(inputId, resultId) {
  const connStr = document.getElementById(inputId).value.trim();
  const resBox = document.getElementById(resultId);
  resBox.style.display = 'block';
  resBox.style.color = '#9ca3af';
  resBox.innerHTML = '⏳ Conectando e testando SQL Server...';

  if (!connStr) {
    resBox.style.color = 'var(--accent-danger)';
    resBox.innerHTML = '❌ Preencha a string de conexão antes de testar.';
    return;
  }

  try {
    const res = await fetch('/api/configuracoes/testar-conexao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: connStr })
    });

    const data = await res.json();
    if (data.sucesso) {
      resBox.style.color = 'var(--accent-success)';
      resBox.innerHTML = `✅ ${data.mensagem}`;
    } else {
      resBox.style.color = 'var(--accent-danger)';
      resBox.innerHTML = `❌ ${data.mensagem}`;
    }
  } catch (err) {
    resBox.style.color = 'var(--accent-danger)';
    resBox.innerHTML = '❌ Erro de rede ao tentar conectar com a API do Integrador.';
  }
}

async function salvarConfiguracoes() {
  const connConfig = document.getElementById('cfg-conn-config').value.trim();
  const connProtheus = document.getElementById('cfg-conn-protheus').value.trim();
  const porta = parseInt(document.getElementById('cfg-porta').value) || 5080;
  const usuario = document.getElementById('cfg-usuario').value.trim();
  const senha = document.getElementById('cfg-senha').value.trim();
  const statusSpan = document.getElementById('cfg-salvar-status');

  statusSpan.innerText = '⏳ Salvando...';

  try {
    const res = await fetch('/api/configuracoes/salvar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionStringConfig: connConfig,
        connectionStringProtheus: connProtheus,
        porta: porta,
        usuario: usuario,
        senha: senha
      })
    });

    const data = await res.json();
    if (data.sucesso) {
      statusSpan.style.color = 'var(--accent-success)';
      statusSpan.innerText = `✅ ${data.mensagem}`;
    } else {
      statusSpan.style.color = 'var(--accent-danger)';
      statusSpan.innerText = `❌ ${data.mensagem}`;
    }
  } catch (err) {
    statusSpan.style.color = 'var(--accent-danger)';
    statusSpan.innerText = '❌ Erro de comunicação ao salvar configurações.';
  }
}

