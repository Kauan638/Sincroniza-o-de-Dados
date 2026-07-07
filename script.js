// ================================================================
// CONFIG
// ================================================================
// Extensões que o monitor vai considerar "arquivos de dados" (ignora o resto)
const EXTENSOES_MONITORADAS = ['.txt', '.csv', '.xlsx', '.xls', '.json'];

// Tamanho do lote de checagem por "tick" — em vez de checar 200 arquivos
// de uma vez, espalha em lotes pequenos pra não travar a aba.
const TAMANHO_LOTE = 15;
const INTERVALO_LOTE_MS = 400;   // tempo entre cada lote
const INTERVALO_CICLO_COMPLETO_MS = 8000; // a cada quanto tempo reinicia a varredura completa

const DB_NAME = 'sync-pasta-mestre-db';
const STORE_NAME = 'handles';

// ================================================================
// ESTADO
// ================================================================
let masterHandle = null;
// registro: [{ projeto, caminho, nome, handle, lastModified }]
let registro = [];
let filaChecagem = [];
let indiceFila = 0;
let timeoutLote = null;
let timeoutCiclo = null;

const btnConectar = document.getElementById('btnConectar');
const btnRevarrer = document.getElementById('btnRevarrer');
const btnDesconectar = document.getElementById('btnDesconectar');
const statusEl = document.getElementById('status');
const arvoreEl = document.getElementById('arvore');
const logEl = document.getElementById('log');
const kpiProjetos = document.getElementById('kpiProjetos');
const kpiArquivos = document.getElementById('kpiArquivos');
const kpiCiclo = document.getElementById('kpiCiclo');

function log(msg) {
  const hora = new Date().toLocaleTimeString('pt-BR');
  const linha = document.createElement('div');
  linha.innerHTML = `<span class="log-time">[${hora}]</span> ${msg}`;
  logEl.prepend(linha);
  // limita o log a 150 linhas pra não crescer infinito
  while (logEl.children.length > 150) logEl.removeChild(logEl.lastChild);
}

function setStatus(tipo) {
  // tipo: 'off' | 'scan' | 'on'
  const map = {
    off:  ['status-off',  '<span class="dot"></span> Desconectado'],
    scan: ['status-scan', '<span class="dot"></span> Varrendo pasta...'],
    on:   ['status-on',   '<span class="dot"></span> Conectado — monitorando']
  };
  statusEl.className = map[tipo][0];
  statusEl.innerHTML = map[tipo][1];
  btnConectar.style.display = tipo === 'off' ? 'inline-block' : 'none';
  btnRevarrer.style.display = tipo === 'off' ? 'none' : 'inline-block';
  btnDesconectar.style.display = tipo === 'off' ? 'none' : 'inline-block';
}

// ================================================================
// INDEXEDDB — persistir handle da pasta mestre
// ================================================================
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function salvarHandle(handle) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, 'pastaMestre');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function carregarHandle() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get('pastaMestre');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function limparHandle() {
  const db = await abrirDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete('pastaMestre');
}

async function garantirPermissao(handle) {
  const opcoes = { mode: 'read' };
  if ((await handle.queryPermission(opcoes)) === 'granted') return true;
  if ((await handle.requestPermission(opcoes)) === 'granted') return true;
  return false;
}

// ================================================================
// VARREDURA RECURSIVA
// Pasta mestre → subpastas (= projetos) → arquivos (qualquer profundidade)
// ================================================================
function temExtensaoValida(nome) {
  const n = nome.toLowerCase();
  return EXTENSOES_MONITORADAS.some(ext => n.endsWith(ext));
}

async function varrerPastaProjeto(dirHandle, projeto, caminhoAtual, resultado) {
  for await (const [nome, handle] of dirHandle.entries()) {
    const caminho = caminhoAtual ? `${caminhoAtual}/${nome}` : nome;
    if (handle.kind === 'file') {
      if (temExtensaoValida(nome)) {
        resultado.push({ projeto, caminho, nome, handle, lastModified: 0 });
      }
    } else if (handle.kind === 'directory') {
      // recursão pra subpastas dentro do projeto (ex: projeto/entrada/arquivo.txt)
      await varrerPastaProjeto(handle, projeto, caminho, resultado);
    }
  }
}

async function varrerPastaMestre() {
  setStatus('scan');
  log('🔍 Varrendo pasta mestre...');
  const novoRegistro = [];
  let totalProjetos = 0;

  for await (const [nomeProjeto, handle] of masterHandle.entries()) {
    if (handle.kind !== 'directory') continue; // ignora arquivos soltos na raiz
    totalProjetos++;
    const arquivosDoProjeto = [];
    await varrerPastaProjeto(handle, nomeProjeto, '', arquivosDoProjeto);
    novoRegistro.push(...arquivosDoProjeto);
  }

  if (novoRegistro.length > 200) {
    log(`⚠️ Encontrados ${novoRegistro.length} arquivos — acima do limite planejado de 200, mas vou monitorar todos mesmo assim.`);
  }

  registro = novoRegistro;
  kpiProjetos.textContent = totalProjetos;
  kpiArquivos.textContent = registro.length;
  log(`✅ Varredura concluída: ${totalProjetos} projeto(s), ${registro.length} arquivo(s) encontrados.`);
  renderizarArvore();
  return registro;
}

function renderizarArvore() {
  if (registro.length === 0) {
    arvoreEl.innerHTML = 'Nenhum arquivo monitorável encontrado.';
    return;
  }
  const porProjeto = {};
  for (const item of registro) {
    if (!porProjeto[item.projeto]) porProjeto[item.projeto] = [];
    porProjeto[item.projeto].push(item);
  }

  arvoreEl.innerHTML = '';
  for (const [projeto, arquivos] of Object.entries(porProjeto)) {
    const div = document.createElement('div');
    div.className = 'projeto';
    div.innerHTML = `
      <div class="projeto-header" data-projeto="${projeto}">
        <span>📂 ${projeto}</span>
        <span class="projeto-count">${arquivos.length} arquivo(s)</span>
      </div>
      <div class="arquivos" id="arquivos-${cssEscape(projeto)}">
        ${arquivos.map(a => `
          <div class="arquivo-linha" data-caminho="${a.projeto}/${a.caminho}">
            <span class="arquivo-nome">${a.caminho}</span>
            <span class="arquivo-tempo">aguardando</span>
          </div>
        `).join('')}
      </div>
    `;
    arvoreEl.appendChild(div);
  }

  arvoreEl.querySelectorAll('.projeto-header').forEach(h => {
    h.addEventListener('click', () => {
      const id = 'arquivos-' + cssEscape(h.dataset.projeto);
      document.getElementById(id).classList.toggle('aberto');
    });
  });
}

function cssEscape(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function atualizarLinhaArquivo(caminhoCompleto, texto) {
  const linha = arvoreEl.querySelector(`.arquivo-linha[data-caminho="${caminhoCompleto}"] .arquivo-tempo`);
  if (linha) linha.textContent = texto;
}

// ================================================================
// MONITORAMENTO EM LOTES (evita checar 200 arquivos de uma vez só)
// ================================================================
function iniciarMonitoramento() {
  pararMonitoramento();
  setStatus('on');
  filaChecagem = [...registro];
  indiceFila = 0;
  processarProximoLote();
  agendarProximoCiclo();
}

function pararMonitoramento() {
  if (timeoutLote) clearTimeout(timeoutLote);
  if (timeoutCiclo) clearTimeout(timeoutCiclo);
  timeoutLote = null;
  timeoutCiclo = null;
}

function agendarProximoCiclo() {
  timeoutCiclo = setTimeout(async () => {
    kpiCiclo.textContent = new Date().toLocaleTimeString('pt-BR');
    filaChecagem = [...registro];
    indiceFila = 0;
    processarProximoLote();
    agendarProximoCiclo();
  }, INTERVALO_CICLO_COMPLETO_MS);
}

async function processarProximoLote() {
  const lote = filaChecagem.slice(indiceFila, indiceFila + TAMANHO_LOTE);
  indiceFila += TAMANHO_LOTE;

  for (const item of lote) {
    try {
      const file = await item.handle.getFile();
      if (file.lastModified !== item.lastModified) {
        const eraPrimeiraLeitura = item.lastModified === 0;
        item.lastModified = file.lastModified;
        const texto = await lerConteudo(file);
        await processarArquivo(item.projeto, item.caminho, texto, file);
        atualizarLinhaArquivo(`${item.projeto}/${item.caminho}`, 'ok ✓ ' + new Date().toLocaleTimeString('pt-BR'));
        if (!eraPrimeiraLeitura) {
          log(`🔄 <b>${item.projeto}/${item.caminho}</b> mudou — reprocessado.`);
        }
      }
    } catch (err) {
      atualizarLinhaArquivo(`${item.projeto}/${item.caminho}`, 'erro ⚠️');
    }
  }

  if (indiceFila < filaChecagem.length) {
    timeoutLote = setTimeout(processarProximoLote, INTERVALO_LOTE_MS);
  }
}

// Lê o conteúdo do jeito certo dependendo da extensão.
// .xlsx/.xls chegam como arraybuffer (você troca por SheetJS na sua lógica real).
async function lerConteudo(file) {
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
    return await file.arrayBuffer(); // use com XLSX.read(...) na sua função real
  }
  return await file.text();
}

// ================================================================
// SUA LÓGICA DE VERDADE ENTRA AQUI
// ================================================================
async function processarArquivo(projeto, caminho, conteudo, fileObj) {
  // Ponto de entrada único pra plugar o parser de cada projeto.
  // Exemplo de roteamento por nome de projeto (ajuste pros seus nomes reais):
  //
  // if (projeto === 'Pendencia PTL') return processarPendenciaPTL(conteudo);
  // if (projeto === 'Abastecimento PCP') return processarAbastecimentoPCP(conteudo);
  //
  console.log(`[processarArquivo] ${projeto}/${caminho} — ${typeof conteudo === 'string' ? conteudo.length + ' chars' : conteudo.byteLength + ' bytes'}`);
}

// ================================================================
// AÇÕES DE UI
// ================================================================
async function conectarPastaMestre() {
  try {
    masterHandle = await window.showDirectoryPicker();
    await salvarHandle(masterHandle);
    await varrerPastaMestre();
    iniciarMonitoramento();
  } catch (err) {
    if (err.name !== 'AbortError') log(`Erro ao conectar: ${err.message}`);
  }
}

async function revarrer() {
  if (!masterHandle) return;
  pararMonitoramento();
  await varrerPastaMestre();
  iniciarMonitoramento();
}

async function desconectar() {
  pararMonitoramento();
  masterHandle = null;
  registro = [];
  await limparHandle();
  setStatus('off');
  arvoreEl.innerHTML = 'Nenhuma pasta conectada ainda.';
  kpiProjetos.textContent = '0';
  kpiArquivos.textContent = '0';
  kpiCiclo.textContent = '-';
  log('🔌 Desconectado.');
}

btnConectar.addEventListener('click', conectarPastaMestre);
btnRevarrer.addEventListener('click', revarrer);
btnDesconectar.addEventListener('click', desconectar);

// reconexão automática ao abrir a página
(async function tentarReconectar() {
  const handleSalvo = await carregarHandle();
  if (!handleSalvo) return;
  const temPermissao = await garantirPermissao(handleSalvo);
  if (!temPermissao) {
    log('ℹ️ Pasta mestre salva encontrada, mas é preciso clicar em conectar de novo (permissão expirou).');
    return;
  }
  masterHandle = handleSalvo;
  await varrerPastaMestre();
  iniciarMonitoramento();
})();
