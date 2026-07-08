<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sync Pasta Mestre</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="brand-intro" aria-hidden="true">
    <div class="brand-logo-pair">
      <img class="brand-logo brand-logo-zaffari" src="assets/logo-zaffari.png" alt="">
      <span class="brand-divider"></span>
      <img class="brand-logo brand-logo-stok" src="assets/logo-stok-center.png" alt="">
    </div>
  </div>

  <main class="shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Monitor local de dados</p>
        <h1>Sync Pasta Mestre</h1>
        <p class="subtitle">Conecte uma pasta mestre uma vez. A interface varre os projetos, monitora arquivos de dados e mantém o histórico de atividade visível.</p>
      </div>
      <span id="status" class="status-off"><span class="dot"></span> Desconectado</span>
    </header>

    <section class="control-panel" aria-label="Controles da sincronização">
      <div class="actions">
        <button id="btnConectar" class="primary">Conectar pasta mestre</button>
        <button id="btnRevarrer" class="secondary" style="display:none;">Revarrer</button>
        <button id="btnDesconectar" class="ghost" style="display:none;">Desconectar</button>
      </div>

      <div class="kpi-row">
        <div class="kpi-card">
          <div class="num" id="kpiProjetos">0</div>
          <div class="label">Projetos</div>
        </div>
        <div class="kpi-card">
          <div class="num" id="kpiArquivos">0</div>
          <div class="label">Arquivos</div>
        </div>
        <div class="kpi-card">
          <div class="num" id="kpiCiclo">-</div>
          <div class="label">Última checagem</div>
        </div>
      </div>
    </section>

    <section class="workspace-grid">
      <article class="panel structure-panel">
        <div class="panel-title-row">
          <div>
            <p class="panel-kicker">Pastas e arquivos</p>
            <h2>Estrutura encontrada</h2>
          </div>
        </div>
        <div id="arvore" class="tree-empty">Nenhuma pasta conectada ainda.</div>
      </article>

      <article class="panel log-panel">
        <div class="panel-title-row">
          <div>
            <p class="panel-kicker">Atividade</p>
            <h2>Log</h2>
          </div>
        </div>
        <div id="log"><div><span class="log-time">[--:--:--]</span> Aguardando conexão da pasta mestre.</div></div>
      </article>
    </section>
  </main>

  <script src="script.js"></script>
</body>
</html>
