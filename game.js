/**
 * game.js
 * Tic Tac Toe game logic + UI glue
 * All rights reserved to UZAIR-NAWAZ.
 *
 * Built as a modular single-file controller for the UI defined in game.html.
 *
 * Features:
 * - Board rendering and keyboard accessibility
 * - Game mode selection (PvP, PvC)
 * - AI: easy (random), difficult (heuristic + limited minimax), hard (full minimax)
 * - Scoreboard, history, animations, and responsive UI updates
 *
 * Notes on AI:
 * - Full Hard uses a full minimax implementation (optimal play).
 * - Difficult uses a hybrid: immediate win/block heuristics + limited-depth minimax.
 * - Easy makes random legal moves.
 */

/* ======= Utilities ======= */
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ======= DOM Elements ======= */
const boardEl = $('#board');
const statusEl = $('#status');
const modeSelect = $('#mode-select');
const aiControls = $('#ai-controls');
const aiLevelSelect = $('#ai-level');
const playerSymbolSelect = $('#player-symbol');
const startBtn = $('#start-btn');
const themeToggle = $('#theme-toggle');
const scoreXEl = $('#score-x');
const scoreOEl = $('#score-o');
const scoreDrawEl = $('#score-draw');
const historyList = $('#history-list');
const yearEl = $('#year');

yearEl.textContent = new Date().getFullYear();

/* ======= Game State ======= */
const GAME = {
  board: Array(9).fill(null),
  currentPlayer: 'X', // 'X' or 'O'
  running: false,
  mode: 'pvp', // 'pvp' or 'pvc'
  aiLevel: 'easy',
  playerSymbol: 'X',
  scores: { X: 0, O: 0, draw: 0 },
  history: [],
  winningLine: null,
  lastMoveIndex: null
};

/* Winning index sets for tic tac toe */
const WINNING_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6]          // diagonals
];

/* Setup board cells in DOM */
function buildBoard() {
  boardEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.setAttribute('role','gridcell');
    cell.setAttribute('aria-label', `Cell ${i+1}`);
    cell.dataset.index = i;
    cell.addEventListener('click', onCellClick);
    cell.addEventListener('keydown', onCellKeyDown);
    boardEl.appendChild(cell);
  }
  updateBoardUI();
}

/* Update the DOM board display from GAME.board */
function updateBoardUI(highlightWinIndices = []) {
  const cells = $$('.cell');
  cells.forEach((c, i) => {
    const v = GAME.board[i];
    c.classList.toggle('x', v === 'X');
    c.classList.toggle('o', v === 'O');
    c.classList.toggle('win', highlightWinIndices.includes(i));
    c.textContent = v ? v : '';
  });
  // remove existing win line overlays
  const existing = boardEl.querySelector('.win-line');
  if (existing) existing.remove();

  if (GAME.winningLine) {
    renderWinLine(GAME.winningLine);
  }
}

/* Render a win line overlay based on line indices */
function renderWinLine(line) {
  const [a,b,c] = line;
  const cells = $$('.cell');
  const first = cells[a];
  const last = cells[c];

  // create overlay
  const overlay = document.createElement('div');
  overlay.className = 'win-line';
  overlay.setAttribute('aria-hidden','true');

  // board bounding
  const rectBoard = boardEl.getBoundingClientRect();
  const rectA = first.getBoundingClientRect();
  const rectC = last.getBoundingClientRect();

  // compute angle and width relative to board
  const cxA = rectA.left + rectA.width/2;
  const cyA = rectA.top + rectA.height/2;
  const cxC = rectC.left + rectC.width/2;
  const cyC = rectC.top + rectC.height/2;
  const dx = cxC - cxA;
  const dy = cyC - cyA;
  const angle = Math.atan2(dy,dx) * 180 / Math.PI;
  const distance = Math.hypot(dx,dy);

  // set inline style; use transform relative to board element
  // we place overlay absolutely inside board with left offset and rotation
  // center across the two cells
  const midX = (cxA + cxC)/2 - rectBoard.left;
  const midY = (cyA + cyC)/2 - rectBoard.top;

  overlay.style.width = Math.max(40, distance) + 'px';
  overlay.style.left = (midX - (distance/2)) + 'px';
  overlay.style.top = (midY - 3) + 'px'; // center vertically (3px half height)
  overlay.style.transform = `rotate(${angle}deg)`;
  overlay.style.opacity = 0.98;

  boardEl.appendChild(overlay);
}

/* ======= Input Handlers ======= */

function onCellClick(e) {
  const idx = Number(e.currentTarget.dataset.index);
  humanMove(idx);
}

function onCellKeyDown(e) {
  // allow Enter or Space to mark a cell via keyboard
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const idx = Number(e.currentTarget.dataset.index);
    humanMove(idx);
  }
}

/* Start or restart game */
function startGame() {
  GAME.board = Array(9).fill(null);
  GAME.running = true;
  GAME.winningLine = null;
  GAME.lastMoveIndex = null;
  GAME.mode = modeSelect.value;
  GAME.aiLevel = aiLevelSelect.value;
  GAME.playerSymbol = playerSymbolSelect.value;
  GAME.currentPlayer = 'X'; // always start X
  statusEl.textContent = `Game started — ${GAME.currentPlayer}'s turn`;
  if (GAME.mode === 'pvc') {
    aiControls.removeAttribute('aria-hidden');
    aiControls.style.display = '';
  } else {
    aiControls.setAttribute('aria-hidden','true');
    aiControls.style.display = 'none';
  }
  updateBoardUI();
  // If AI plays first (player chose O), let AI move
  if (GAME.mode === 'pvc' && GAME.playerSymbol !== 'X') {
    // AI should play X (opponent plays first)
    setTimeout(() => {
      aiMakeMove();
    }, 250);
  }
}

/* Handle a human attempting to move at index */
function humanMove(idx) {
  if (!GAME.running) {
    announce('Game not running. Press Start.');
    return;
  }
  if (GAME.board[idx] !== null) {
    // cell occupied
    announce('Cell already occupied.');
    return;
  }
  // PvC: only allow human to play their symbol
  if (GAME.mode === 'pvc') {
    const human = GAME.playerSymbol;
    const toPlay = GAME.currentPlayer;
    if (toPlay !== human) {
      announce(`It's not your turn (${human}).`);
      return;
    }
    makeMove(idx, toPlay);
  } else {
    // PvP: allow either player to click
    makeMove(idx, GAME.currentPlayer);
  }
}

/* Place a mark and handle turn switching */
function makeMove(idx, mark) {
  if (GAME.board[idx] !== null) return false;
  GAME.board[idx] = mark;
  GAME.lastMoveIndex = idx;
  // animate mark
  const cell = boardEl.querySelector(`.cell[data-index="${idx}"]`);
  cell.classList.add('mark-anim');
  setTimeout(()=>cell.classList.remove('mark-anim'), 350);

  // check for win/draw
  const win = checkWin(GAME.board);
  if (win) {
    GAME.running = false;
    GAME.winningLine = win.line;
    highlightWin(win);
    const winner = win.winner;
    statusEl.textContent = `${winner} wins!`;
    GAME.scores[winner] += 1;
    addHistory(`${winner} won — ${new Date().toLocaleTimeString()}`);
    updateScores();
    return true;
  } else if (isDraw(GAME.board)) {
    GAME.running = false;
    GAME.winningLine = null;
    statusEl.textContent = `Draw!`;
    GAME.scores.draw += 1;
    addHistory(`Draw — ${new Date().toLocaleTimeString()}`);
    updateScores();
    return true;
  } else {
    // continue
    GAME.currentPlayer = (mark === 'X') ? 'O' : 'X';
    statusEl.textContent = `${GAME.currentPlayer}'s turn`;
    updateBoardUI();
    // if PvC and now AI's turn, make AI move
    if (GAME.mode === 'pvc' && GAME.currentPlayer !== GAME.playerSymbol) {
      // slight delay for natural play
      setTimeout(aiMakeMove, 420);
    }
    return true;
  }
}

/* Check for win: returns { winner: 'X'|'O', line: [i,i,i] } or null */
function checkWin(board) {
  for (let line of WINNING_LINES) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: line };
    }
  }
  return null;
}

function isDraw(board) {
  return board.every(cell => cell !== null) && !checkWin(board);
}

/* After detecting win, highlight cells and play celebration */
function highlightWin(win) {
  const { winner, line } = win;
  statusEl.textContent = `${winner} wins!`;
  updateBoardUI(line);
  // animate winning cells
  for (let idx of line) {
    const cell = boardEl.querySelector(`.cell[data-index="${idx}"]`);
    if (cell) cell.classList.add('win');
  }
  renderWinLine(line);
}

/* Announce small messages for status area */
function announce(msg) {
  statusEl.textContent = msg;
}

/* Update scoreboard UI */
function updateScores() {
  scoreXEl.textContent = GAME.scores.X;
  scoreOEl.textContent = GAME.scores.O;
  scoreDrawEl.textContent = GAME.scores.draw;
}

/* Add entry to history */
function addHistory(text) {
  GAME.history.unshift(text);
  // keep last 10
  GAME.history = GAME.history.slice(0, 12);
  renderHistory();
}
function renderHistory() {
  historyList.innerHTML = '';
  for (let h of GAME.history) {
    const li = document.createElement('li');
    li.textContent = h;
    historyList.appendChild(li);
  }
}

/* ======= AI Implementations ======= */

/* AI entry point. Picks algorithm based on aiLevel */
function aiMakeMove() {
  if (!GAME.running) return;
  const aiSymbol = (GAME.playerSymbol === 'X') ? 'O' : 'X';
  const level = GAME.aiLevel || aiLevelSelect.value || 'easy';
  let idx = null;
  if (level === 'easy') {
    idx = aiRandomMove(GAME.board);
  } else if (level === 'difficult') {
    idx = aiDifficultMove(GAME.board, aiSymbol);
  } else {
    // hard
    idx = aiMinimaxMove(GAME.board, aiSymbol);
  }
  if (typeof idx !== 'number' || idx < 0 || idx > 8 || GAME.board[idx] !== null) {
    // fallback: choose any legal
    idx = aiRandomMove(GAME.board);
  }
  makeMove(idx, aiSymbol);
}

/* Easy: choose a random empty cell */
function aiRandomMove(board) {
  const empties = board.flatMap((v,i) => v === null ? [i] : []);
  if (empties.length === 0) return null;
  const choice = empties[Math.floor(Math.random()*empties.length)];
  return choice;
}

/* Difficult: heuristic + limited-depth minimax
   Strategy:
   - If we can win in one move, do it.
   - If opponent can win in one move, block.
   - If center is free, take center.
   - Else try corner, else side.
   - Also try a limited minimax search of depth 4 to look 2 plies ahead for good moves.
*/
function aiDifficultMove(board, aiSymbol) {
  const human = aiSymbol === 'X' ? 'O' : 'X';

  // 1: immediate win
  for (let i=0;i<9;i++) {
    if (board[i] === null) {
      board[i] = aiSymbol;
      if (checkWin(board)) {
        board[i] = null;
        return i;
      }
      board[i] = null;
    }
  }

  // 2: block opponent win
  for (let i=0;i<9;i++) {
    if (board[i] === null) {
      board[i] = human;
      if (checkWin(board)) {
        board[i] = null;
        return i;
      }
      board[i] = null;
    }
  }

  // 3: center
  if (board[4] === null) return 4;

  // 4: prefer corners if available
  const corners = [0,2,6,8].filter(i => board[i] === null);
  if (corners.length > 0) {
    // try each corner and run shallow minimax depth=3
    let best = corners[0];
    let bestScore = -Infinity;
    for (let c of corners) {
      board[c] = aiSymbol;
      const score = limitedMinimaxScore(board, aiSymbol, human, 3, false);
      board[c] = null;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  // 5: sides
  const sides = [1,3,5,7].filter(i => board[i] === null);
  if (sides.length > 0) return sides[Math.floor(Math.random()*sides.length)];

  // fallback: random
  return aiRandomMove(board);
}

/* limitedMinimaxScore: simple minimax evaluation returning a numeric score for the node.
   depth parameter limits lookahead (smaller depth means faster but weaker).
*/
function limitedMinimaxScore(board, aiSymbol, humanSymbol, depth, isAiTurn) {
  const win = checkWin(board);
  if (win) {
    if (win.winner === aiSymbol) return 100;
    if (win.winner === humanSymbol) return -100;
  }
  if (isDraw(board)) return 0;
  if (depth === 0) {
    // heuristic evaluation: prefer center and corners for ai
    let score = 0;
    const center = board[4] === aiSymbol ? 6 : (board[4] === humanSymbol ? -6 : 0);
    score += center;
    const corners = [0,2,6,8].reduce((s,i) => s + (board[i] === aiSymbol ? 3 : (board[i] === humanSymbol ? -3 : 0)), 0);
    score += corners;
    return score;
  }

  if (isAiTurn) {
    let best = -Infinity;
    for (let i=0;i<9;i++) {
      if (board[i] === null) {
        board[i] = aiSymbol;
        const val = limitedMinimaxScore(board, aiSymbol, humanSymbol, depth-1, false);
        board[i] = null;
        best = Math.max(best, val);
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i=0;i<9;i++) {
      if (board[i] === null) {
        board[i] = humanSymbol;
        const val = limitedMinimaxScore(board, aiSymbol, humanSymbol, depth-1, true);
        board[i] = null;
        best = Math.min(best, val);
      }
    }
    return best;
  }
}

/* Full Hard: Optimal Minimax with alpha-beta pruning
   Returns optimal move index for aiSymbol on given board.
*/
function aiMinimaxMove(board, aiSymbol) {
  const human = aiSymbol === 'X' ? 'O' : 'X';
  // If board empty, choose a corner (micro-optimization)
  if (board.every(cell => cell === null)) {
    return [0,2,6,8][Math.floor(Math.random()*4)];
  }

  const result = minimax(board.slice(), aiSymbol, human, true, -Infinity, Infinity, 0);
  return result.index;
}

/* minimax returns { index, score } */
function minimax(board, aiSymbol, humanSymbol, isAiTurn, alpha, beta, depth) {
  const win = checkWin(board);
  if (win) {
    if (win.winner === aiSymbol) return { score: 100 - depth };
    if (win.winner === humanSymbol) return { score: -100 + depth };
  }
  if (isDraw(board)) return { score: 0 };

  if (isAiTurn) {
    let best = { index: -1, score: -Infinity };
    for (let i=0;i<9;i++) {
      if (board[i] === null) {
        board[i] = aiSymbol;
        const res = minimax(board, aiSymbol, humanSymbol, false, alpha, beta, depth+1);
        board[i] = null;
        res.index = i;
        if (res.score > best.score) best = res;
        alpha = Math.max(alpha, res.score);
        if (beta <= alpha) break; // alpha-beta prune
      }
    }
    return best;
  } else {
    let best = { index: -1, score: Infinity };
    for (let i=0;i<9;i++) {
      if (board[i] === null) {
        board[i] = humanSymbol;
        const res = minimax(board, aiSymbol, humanSymbol, true, alpha, beta, depth+1);
        board[i] = null;
        res.index = i;
        if (res.score < best.score) best = res;
        beta = Math.min(beta, res.score);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

/* ======= Theme and UI helpers ======= */
function toggleTheme() {
  document.body.classList.toggle('light');
}

/* Keyboard nav for board overall (arrow keys move focus) */
function enableBoardKeyboardNavigation() {
  boardEl.addEventListener('keydown', (e)=>{
    const active = document.activeElement;
    if (!active || !active.classList.contains('cell')) {
      // focus first cell on arrow press
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        const first = boardEl.querySelector('.cell[data-index="0"]');
        if (first) first.focus();
        e.preventDefault();
      }
      return;
    }
    const idx = Number(active.dataset.index);
    let row = Math.floor(idx/3);
    let col = idx % 3;
    if (e.key === 'ArrowLeft') col = (col + 2) % 3;
    if (e.key === 'ArrowRight') col = (col + 1) % 3;
    if (e.key === 'ArrowUp') row = (row + 2) % 3;
    if (e.key === 'ArrowDown') row = (row + 1) % 3;
    const nextIdx = row*3 + col;
    const nextEl = boardEl.querySelector(`.cell[data-index="${nextIdx}"]`);
    if (nextEl) {
      nextEl.focus();
      e.preventDefault();
    }
  });
}

/* Resize observer to update win line when layout changes */
function attachResizeObserver() {
  if (typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => {
    if (GAME.winningLine) renderWinLine(GAME.winningLine);
  });
  ro.observe(boardEl);
  window.addEventListener('resize', () => { if (GAME.winningLine) renderWinLine(GAME.winningLine); });
}

/* ======= Event bindings ======= */
modeSelect.addEventListener('change', () => {
  if (modeSelect.value === 'pvc') {
    aiControls.removeAttribute('aria-hidden');
    aiControls.style.display = '';
  } else {
    aiControls.setAttribute('aria-hidden','true');
    aiControls.style.display = 'none';
  }
});

startBtn.addEventListener('click', startGame);
themeToggle.addEventListener('click', toggleTheme);

/* Allow user to change AI level or symbol mid-game (take effect next start) */
aiLevelSelect.addEventListener('change', ()=> { GAME.aiLevel = aiLevelSelect.value; });
playerSymbolSelect.addEventListener('change', ()=> { GAME.playerSymbol = playerSymbolSelect.value; });

/* Initialize everything */
function init() {
  buildBoard();
  enableBoardKeyboardNavigation();
  attachResizeObserver();
  updateScores();
  renderHistory();
  announce('Ready — choose options and press Start');
}

/* Run initialization on DOM ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* Friendly exports for debugging (optional) */
window.TTT = {
  GAME, startGame, makeMove, aiMakeMove, minimax,
  // expose for testing
  _internal: {
    WINNING_LINES, checkWin, isDraw
  }
};

/* End of game.js */
