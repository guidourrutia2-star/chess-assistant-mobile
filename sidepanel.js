import { Chess } from './vendor/chessjs/chess.js';

const GLYPHS = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }, b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };
const PIECES = ['k', 'q', 'r', 'b', 'n', 'p'];
const boardElement = document.querySelector('#board');
const paletteElement = document.querySelector('#palette');
const statusElement = document.querySelector('#analysisStatus');
const hintElement = document.querySelector('#editorHint');
const moveHistoryElement = document.querySelector('#moveHistory');
const confidenceFill = document.querySelector('#confidenceFill');
const confidenceValue = document.querySelector('#confidenceValue');
const confidenceTrack = document.querySelector('.confidence-track');
const confidenceNote = document.querySelector('#confidenceNote');
const installButton = document.querySelector('#installApp');
let pendingInstallPrompt = null;
const eloSlider = document.querySelector('#eloSlider');
const maxStrengthInput = document.querySelector('#maxStrength');
const eloValue = document.querySelector('#eloValue');
function loadEngineSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('engineSettings') ?? '{}');
    return { elo: Math.min(3190, Math.max(1320, Number(saved.elo) || 2400)), max: Boolean(saved.max) };
  } catch { return { elo: 2400, max: false }; }
}
let engineSettings = loadEngineSettings();
let board = new Chess().board();
let viewSide = 'w';
let turn = 'w';
let castlingRights = 'KQkq';
let enPassantSquare = '-';
let selectedSquare = null;
let selectedPiece = null;
let removeMode = false;
let worker = null;
let analysisTimer = null;
let debounceTimer = null;
let recommendation = null;
let moveHistory = [];
let lastPvMove = '';
let lastPvDepth = 0;
let stableDepths = 0;

function resetConfidence() {
  lastPvMove = '';
  lastPvDepth = 0;
  stableDepths = 0;
  confidenceFill.style.width = '0%';
  confidenceValue.textContent = '0%';
  confidenceTrack.setAttribute('aria-valuenow', '0');
  confidenceNote.textContent = 'Aumenta con la profundidad y la estabilidad de la jugada.';
}

function updateConfidence(uci, depth) {
  if (depth > lastPvDepth) {
    stableDepths = uci === lastPvMove ? stableDepths + 1 : 1;
    lastPvMove = uci;
    lastPvDepth = depth;
  }
  const targetDepth = engineSettings.max ? 30 : 12 + Math.round(12 * (engineSettings.elo - 1320) / (3190 - 1320));
  const depthProgress = Math.min(100, depth / targetDepth * 100);
  const stability = Math.min(100, stableDepths / 6 * 100);
  const percent = Math.floor(Math.min(depthProgress, stability));
  confidenceFill.style.width = `${percent}%`;
  confidenceValue.textContent = `${percent}%`;
  confidenceTrack.setAttribute('aria-valuenow', String(percent));
  confidenceNote.textContent = percent === 100
    ? `La misma jugada se mantuvo estable a través de al menos seis profundidades (nivel ${depth}). No es una certeza matemática.`
    : `Profundidad ${depth}; la jugada actual se mantuvo ${stableDepths} ${stableDepths === 1 ? 'nivel' : 'niveles'}. Es una estimación, no una certeza.`;
}

function renderMoveHistory() {
  moveHistoryElement.replaceChildren();
  if (!moveHistory.length) {
    moveHistoryElement.textContent = 'Las jugadas aparecerán acá.';
    return;
  }
  for (let index = 0; index < moveHistory.length; index += 2) {
    const pair = document.createElement('span');
    pair.className = 'move-pair';
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = `${Math.floor(index / 2) + 1}.`;
    pair.append(number);
    for (const entry of moveHistory.slice(index, index + 2)) {
      const move = document.createElement('span');
      move.className = entry.color === 'w' ? 'move-white' : 'move-black';
      move.textContent = entry.san;
      pair.append(move);
    }
    moveHistoryElement.append(pair);
  }
  moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
}

function clearMoveHistory() {
  moveHistory = [];
  renderMoveHistory();
}

function squareName(row, col) { return `${String.fromCharCode(97 + col)}${8 - row}`; }

function boardToFen(side = turn) {
  const ranks = board.map((rank) => {
    let text = '', empty = 0;
    for (const piece of rank) {
      if (!piece) empty += 1;
      else {
        if (empty) text += empty;
        empty = 0;
        text += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
      }
    }
    if (empty) text += empty;
    return text;
  });
  return `${ranks.join('/')} ${side} ${castlingRights || '-'} ${enPassantSquare} 0 1`;
}

function revokeCastlingForRook(piece, row, col) {
  if (piece?.type !== 'r') return;
  if (row === 7 && col === 0) castlingRights = castlingRights.replace('Q', '');
  if (row === 7 && col === 7) castlingRights = castlingRights.replace('K', '');
  if (row === 0 && col === 0) castlingRights = castlingRights.replace('q', '');
  if (row === 0 && col === 7) castlingRights = castlingRights.replace('k', '');
}

function updateCastlingRights(moving, fromRow, fromCol, captured, toRow, toCol) {
  revokeCastlingForRook(captured, toRow, toCol);
  if (moving.type === 'k') castlingRights = castlingRights.replace(moving.color === 'w' ? /[KQ]/g : /[kq]/g, '');
  revokeCastlingForRook(moving, fromRow, fromCol);
}

function legalTargets(from) {
  try {
    const chess = new Chess(boardToFen(turn));
    return new Set(chess.moves({ square: from, verbose: true }).map((move) => move.to));
  } catch { return null; }
}

function render() {
  const targets = selectedSquare ? (legalTargets(selectedSquare) ?? new Set()) : new Set();
  boardElement.replaceChildren();
  for (let visualRow = 0; visualRow < 8; visualRow += 1) {
    for (let visualCol = 0; visualCol < 8; visualCol += 1) {
      const row = viewSide === 'w' ? visualRow : 7 - visualRow;
      const col = viewSide === 'w' ? visualCol : 7 - visualCol;
      const piece = board[row][col];
      const name = squareName(row, col);
      const classes = ['square', (row + col) % 2 ? 'dark' : 'light'];
      if (piece) classes.push('has-piece');
      if (selectedSquare === name) classes.push('selected');
      if (targets.has(name)) classes.push('legal-target');
      if (recommendation?.from === name) classes.push('recommended-from');
      if (recommendation?.to === name) classes.push('recommended-to');
      const square = document.createElement('button');
      square.type = 'button';
      square.className = classes.join(' ');
      square.setAttribute('role', 'gridcell');
      square.setAttribute('aria-label', `${name}${piece ? `, ${piece.color === 'w' ? 'blanca' : 'negra'} ${piece.type}` : ', vacía'}`);
      if (piece) {
        const glyph = document.createElement('span');
        glyph.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
        glyph.textContent = GLYPHS[piece.color][piece.type];
        square.append(glyph);
      }
      if (visualCol === 0 || visualRow === 7) {
        const coord = document.createElement('span');
        coord.className = 'coord';
        coord.textContent = visualCol === 0 ? String(8 - row) : String.fromCharCode(97 + col);
        square.append(coord);
      }
      square.addEventListener('click', () => onSquareClick(row, col, name));
      square.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        board[row][col] = null;
        castlingRights = '';
        enPassantSquare = '-';
        clearMoveHistory();
        selectedSquare = null;
        render();
        scheduleAnalysis();
      });
      boardElement.append(square);
    }
  }
  paletteElement.replaceChildren();
  for (const color of ['w', 'b']) {
    for (const type of PIECES) {
      const button = document.createElement('button');
      button.className = `palette-piece${selectedPiece?.color === color && selectedPiece?.type === type ? ' active' : ''}`;
      button.type = 'button';
      button.textContent = GLYPHS[color][type];
      button.title = `Colocar ${color === 'w' ? 'blanca' : 'negra'} ${type}`;
      button.setAttribute('aria-label', button.title);
      button.addEventListener('click', () => {
        const togglingOff = selectedPiece?.color === color && selectedPiece?.type === type;
        selectedPiece = togglingOff ? null : { color, type };
        selectedSquare = null;
        removeMode = false;
        hintElement.textContent = selectedPiece ? 'Elegida: tocá una casilla para colocarla.' : 'Tocá una pieza y otra casilla para moverla.';
        document.querySelector('#removeMode').classList.remove('active');
        render();
      });
      paletteElement.append(button);
    }
    if (color === 'w') {
      const divider = document.createElement('span');
      divider.className = 'palette-divider';
      paletteElement.append(divider);
    }
  }
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === viewSide));
  document.querySelectorAll('[data-turn]').forEach((button) => button.classList.toggle('active', button.dataset.turn === turn));
}

function saveEngineSettings() {
  engineSettings = { elo: Number(eloSlider.value), max: maxStrengthInput.checked };
  localStorage.setItem('engineSettings', JSON.stringify(engineSettings));
  eloSlider.disabled = engineSettings.max;
  eloValue.textContent = engineSettings.max ? '3190+ Elo' : `${engineSettings.elo} Elo`;
}

function installableEngineUrl() {
  const path = 'vendor/stockfish/stockfish-19-single.js';
  return globalThis.chrome?.runtime?.getURL
    ? globalThis.chrome.runtime.getURL(path)
    : new URL(`./${path}`, import.meta.url).href;
}

function enableProgressiveWebApp() {
  if (globalThis.chrome?.runtime?.id || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./pwa-sw.js').catch(() => {});
}

function onSquareClick(row, col, name) {
  if (removeMode) {
    board[row][col] = null;
    castlingRights = '';
    enPassantSquare = '-';
    clearMoveHistory();
    render();
    scheduleAnalysis();
    return;
  }
  if (selectedPiece) {
    board[row][col] = { ...selectedPiece };
    castlingRights = '';
    enPassantSquare = '-';
    clearMoveHistory();
    selectedPiece = null; // Salir del modo de colocación evita reemplazar otras piezas con el siguiente clic.
    hintElement.textContent = 'Pieza colocada. Tocá una pieza y otra casilla para moverla.';
    render();
    scheduleAnalysis();
    return;
  }
  if (selectedSquare) {
    const fromRow = 8 - Number(selectedSquare[1]);
    const fromCol = selectedSquare.charCodeAt(0) - 97;
    const moving = board[fromRow][fromCol];
    const destination = board[row][col];
    if (selectedSquare === name) {
      selectedSquare = null;
      render();
      return;
    }
    if (destination?.color === turn) {
      selectedSquare = name;
      render();
      return;
    }
    if (!moving || moving.color !== turn) {
      selectedSquare = null;
      render();
      return;
    }
    const targets = legalTargets(selectedSquare);
    if (targets && !targets.has(name)) {
      statusElement.textContent = 'Esa casilla no es un destino legal. Elegí una de las marcas verdes.';
      return;
    }
    let san = `${selectedSquare}-${name}`;
    try {
      const chess = new Chess(boardToFen(turn));
      san = chess.move({ from: selectedSquare, to: name, ...(moving.type === 'p' && (row === 0 || row === 7) ? { promotion: 'q' } : {}) })?.san ?? san;
    } catch { /* En posiciones editadas sin historial, registrar origen y destino. */ }
    moveHistory.push({ color: turn, san });
    renderMoveHistory();
    updateCastlingRights(moving, fromRow, fromCol, destination, row, col);
    if (moving.type === 'p' && fromCol !== col && !destination) board[fromRow][col] = null;
    if (moving.type === 'k' && Math.abs(col - fromCol) === 2) {
      const rookFrom = col > fromCol ? 7 : 0;
      const rookTo = col > fromCol ? col - 1 : col + 1;
      board[row][rookTo] = board[row][rookFrom];
      board[row][rookFrom] = null;
    }
    enPassantSquare = moving.type === 'p' && Math.abs(row - fromRow) === 2
      ? squareName((row + fromRow) / 2, col)
      : '-';
    if (moving.type === 'p' && (row === 0 || row === 7)) moving.type = 'q';
    board[row][col] = moving;
    board[fromRow][fromCol] = null;
    selectedSquare = null;
    turn = turn === 'w' ? 'b' : 'w';
    hintElement.textContent = `Turno de ${turn === 'w' ? 'blancas' : 'negras'}: elegí una pieza y luego su destino.`;
    render();
    scheduleAnalysis();
    return;
  }
  if (board[row][col]) {
    if (board[row][col].color !== turn) {
      statusElement.textContent = `Esperando el turno de ${turn === 'w' ? 'blancas' : 'negras'}.`;
      return;
    }
    selectedSquare = name;
    selectedPiece = null;
    hintElement.textContent = 'Pieza resaltada: elegí una casilla de destino.';
    render();
  }
}

function setRecommendation(side, state, move = '—', explanation = '') {
  const card = document.querySelector(`#recommendation-${side}`);
  card.querySelector('.rec-state').textContent = state;
  card.querySelector('.rec-move').textContent = move;
  card.querySelector('.rec-explanation').textContent = explanation;
}

function resetCards(state = 'En espera', explanation = 'Las sugerencias se actualizan automáticamente.') {
  setRecommendation('w', state, '—', explanation);
  setRecommendation('b', state, '—', explanation);
  recommendation = null;
}

function setWaitingCard() {
  const other = turn === 'w' ? 'b' : 'w';
  setRecommendation(other, 'Espera su turno', '—', `No hay sugerencia para ${other === 'w' ? 'blancas' : 'negras'} hasta que juegue su turno.`);
}

function scheduleAnalysis() {
  clearTimeout(debounceTimer);
  stopEngine();
  resetCards('En espera', 'Actualizando la sugerencia para el turno actual…');
  resetConfidence();
  setWaitingCard();
  statusElement.textContent = `Preparando el análisis para ${turn === 'w' ? 'blancas' : 'negras'}…`;
  debounceTimer = setTimeout(analyzeTurn, 350);
}

function getExplanation(uci, fen, side, score) {
  const from = uci.slice(0, 2), to = uci.slice(2, 4), promotion = uci[4];
  const chess = new Chess(fen);
  const moving = chess.get(from), captured = chess.get(to);
  let san = uci;
  try { san = chess.move({ from, to, ...(promotion ? { promotion } : {}) })?.san ?? uci; } catch { /* Posición compuesta sin historial completo. */ }
  const pieceNames = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };
  let reason = `${side === 'w' ? 'Blancas' : 'Negras'} pueden jugar ${pieceNames[moving?.type] ?? 'pieza'} de ${from} a ${to}.`;
  if (captured) reason += ` Captura en ${to}.`;
  if (promotion) reason += ' El peón corona.';
  if (san.includes('+')) reason += ' Da jaque.';
  if (score?.type === 'mate') reason += ` Stockfish ve mate en ${Math.abs(score.value)} jugada(s).`;
  else if (score?.type === 'cp') {
    const pawns = (Math.abs(score.value) / 100).toFixed(1);
    reason += score.value > 20 ? ` La evaluación favorece a este bando por unos ${pawns} peones.` : ' La posición queda aproximadamente equilibrada.';
  }
  return { san, reason };
}

function stopEngine() {
  clearTimeout(analysisTimer);
  if (worker) {
    try { worker.postMessage('stop'); } catch { /* Ya terminó. */ }
    worker.terminate();
    worker = null;
  }
}

function analyzeTurn() {
  stopEngine();
  const side = turn;
  const fen = boardToFen(side);
  let chess;
  try { chess = new Chess(fen); }
  catch {
    setRecommendation(side, 'Posición inválida', '—', 'Hace falta un rey de cada color y no puede haber peones en la primera ni en la última fila.');
    statusElement.textContent = 'Corregí la posición para analizarla.';
    return;
  }
  if (chess.isCheckmate() || chess.isDraw()) {
    setRecommendation(side, 'Sin jugadas', '—', chess.isCheckmate() ? 'Este bando está en jaque mate.' : 'La posición es tablas para este turno.');
    statusElement.textContent = 'No hay jugadas disponibles para el turno actual.';
    return;
  }
  setRecommendation(side, 'Analizando…', '…', 'Stockfish busca la mejor jugada para este turno.');
  setWaitingCard();
  const modeDescription = engineSettings.max ? 'a máxima fuerza' : `a ${engineSettings.elo} Elo`;
  statusElement.textContent = `Stockfish analiza para ${side === 'w' ? 'blancas' : 'negras'} ${modeDescription}…`;
  try {
    worker = new Worker(installableEngineUrl());
    const depth = 12 + Math.round(12 * (engineSettings.elo - 1320) / (3190 - 1320));
    const searchCommand = engineSettings.max ? 'go infinite' : `go depth ${depth}`;
    let score = null;
    let started = false;
    let optionsSent = false;
    worker.onmessage = ({ data }) => {
      const line = String(data).trim();
      if (line === 'uciok' && !optionsSent) {
        optionsSent = true;
        worker.postMessage(`setoption name UCI_LimitStrength value ${engineSettings.max ? 'false' : 'true'}`);
        worker.postMessage(`setoption name UCI_Elo value ${engineSettings.max ? 3190 : engineSettings.elo}`);
        worker.postMessage('isready');
        return;
      }
      if (line === 'readyok' && !started) {
        started = true;
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(searchCommand);
        return;
      }
      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      if (scoreMatch) score = { type: scoreMatch[1], value: Number(scoreMatch[2]) };
      const infoMatch = line.match(/info depth (\d+).*? pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
      if (infoMatch) {
        updateConfidence(infoMatch[2], Number(infoMatch[1]));
        showEngineMove(infoMatch[2], fen, side, score, `Profundidad ${infoMatch[1]}`);
        statusElement.textContent = engineSettings.max
          ? `Máxima fuerza · sigue calculando (profundidad ${infoMatch[1]}).`
          : `Calculando a ${engineSettings.elo} Elo · profundidad ${infoMatch[1]}.`;
      }
      const bestMatch = line.match(/bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
      if (!bestMatch) return;
      if (bestMatch[1] !== lastPvMove) updateConfidence(bestMatch[1], lastPvDepth + 1);
      showEngineMove(bestMatch[1], fen, side, score, 'Lista');
      statusElement.textContent = `Sugerencia para ${side === 'w' ? 'blancas' : 'negras'} a ${engineSettings.max ? 'máxima fuerza' : `${engineSettings.elo} Elo`}.`;
      if (engineSettings.max) return;
      worker?.terminate();
      worker = null;
    };
    worker.onerror = () => {
      stopEngine();
      setRecommendation(side, 'Error', '—', 'No se pudo iniciar el motor local.');
      statusElement.textContent = 'Recargá la extensión en chrome://extensions.';
    };
    worker.postMessage('uci');
    // Max mode keeps searching and reports progressively better principal variations.
  } catch {
    stopEngine();
    setRecommendation(side, 'Error', '—', 'Revisá los archivos locales de Stockfish.');
    statusElement.textContent = 'No se pudo iniciar Stockfish.';
  }
}

function showEngineMove(uci, fen, side, score, state) {
  const { san, reason } = getExplanation(uci, fen, side, score);
  recommendation = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  setRecommendation(side, state, san, reason);
  render();
}

function startPosition() {
  stopEngine();
  clearTimeout(debounceTimer);
  board = new Chess().board();
  viewSide = 'w';
  turn = 'w';
  castlingRights = 'KQkq';
  enPassantSquare = '-';
  selectedSquare = null;
  selectedPiece = null;
  removeMode = false;
  castlingRights = 'KQkq';
  enPassantSquare = '-';
  clearMoveHistory();
  hintElement.textContent = 'Elegí una pieza y luego el destino para moverla.';
  document.querySelector('#removeMode').classList.remove('active');
  render();
  scheduleAnalysis();
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  viewSide = button.dataset.view;
  selectedSquare = null;
  render();
}));
document.querySelectorAll('[data-turn]').forEach((button) => button.addEventListener('click', () => {
  turn = button.dataset.turn;
  selectedSquare = null;
  hintElement.textContent = `Turno de ${turn === 'w' ? 'blancas' : 'negras'}: elegí una pieza y luego su destino.`;
  render();
  scheduleAnalysis();
}));
document.querySelector('#reset').addEventListener('click', startPosition);
document.querySelector('#clearBoard').addEventListener('click', () => {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));
  castlingRights = '';
  enPassantSquare = '-';
  clearMoveHistory();
  selectedSquare = null;
  render();
  scheduleAnalysis();
});
document.querySelector('#clearHistory').addEventListener('click', clearMoveHistory);
document.querySelector('#removeMode').addEventListener('click', (event) => {
  removeMode = !removeMode;
  selectedPiece = null;
  selectedSquare = null;
  event.currentTarget.classList.toggle('active', removeMode);
  hintElement.textContent = removeMode ? 'Tocá una casilla para quitar su pieza.' : 'Elegí una pieza y luego el destino para moverla.';
  render();
});
eloSlider.value = String(engineSettings.elo);
maxStrengthInput.checked = engineSettings.max;
saveEngineSettings();
eloSlider.addEventListener('input', () => {
  maxStrengthInput.checked = false;
  eloValue.textContent = `${eloSlider.value} Elo`;
});
eloSlider.addEventListener('change', () => {
  saveEngineSettings();
  scheduleAnalysis();
});
maxStrengthInput.addEventListener('change', () => {
  saveEngineSettings();
  scheduleAnalysis();
});
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  pendingInstallPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!pendingInstallPrompt) return;
  await pendingInstallPrompt.prompt();
  pendingInstallPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => { installButton.hidden = true; });
enableProgressiveWebApp();
startPosition();
