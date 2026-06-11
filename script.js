/* MATRIX TETRIS - script.js (standalone, no backend, localStorage high scores) */
(function () {
  "use strict";

  var COLS = 10;
  var ROWS = 20;
  var BLOCK = 30;

  var COLORS = {
    T: "#00ffff",
    J: "#0080ff",
    L: "#ff8000",
    O: "#ffff00",
    S: "#00ff41",
    Z: "#ff0040",
    I: "#bf00ff",
  };

  var SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  };

  var TYPES = "IJLOSTZ";
  var STORAGE_KEY = "matrixTetrisHighScores";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var nextCanvas = document.getElementById("next");
  var nctx = nextCanvas.getContext("2d");
  var holdCanvas = document.getElementById("hold-canvas");
  var hctx = holdCanvas.getContext("2d");

  var scoreEl = document.getElementById("score");
  var levelEl = document.getElementById("level");
  var linesEl = document.getElementById("lines");
  var startBtn = document.getElementById("start");
  var pauseBtn = document.getElementById("pause");
  var holdBtn = document.getElementById("hold");

  var idleOverlay = document.getElementById("overlay-idle");
  var pauseOverlay = document.getElementById("overlay-pause");
  var overOverlay = document.getElementById("overlay-over");
  var finalStats = document.getElementById("final-stats");
  var nameInput = document.getElementById("name-input");
  var saveBtn = document.getElementById("save-score");
  var scoresList = document.getElementById("scores-list");


  var board, current, next, score, level, lines, dropInterval, dropCounter, lastTime, rafId;
  var held = null; 
  var canHold = true;
  var state = "idle"; 
  var lastSavedId = null;

  function emptyBoard() {
    var b = [];
    for (var y = 0; y < ROWS; y++) {
      b.push(new Array(COLS).fill(null));
    }
    return b;
  }

  function randomType() {
    return TYPES[(Math.random() * TYPES.length) | 0];
  }

  function makePiece(type) {
    var shape = SHAPES[type].map(function (row) {
      return row.slice();
    });
    return {
      type: type,
      color: COLORS[type],
      shape: shape,
      x: ((COLS - shape[0].length) / 2) | 0,
      y: 0,
    };
  }

  function rotateMatrix(matrix) {
    var n = matrix.length;
    var result = [];
    for (var x = 0; x < matrix[0].length; x++) {
      var row = [];
      for (var y = n - 1; y >= 0; y--) {
        row.push(matrix[y][x]);
      }
      result.push(row);
    }
    return result;
  }

  function collides(piece, board, offX, offY, shape) {
    shape = shape || piece.shape;
    for (var y = 0; y < shape.length; y++) {
      for (var x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        var nx = piece.x + x + offX;
        var ny = piece.y + y + offY;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function merge(piece, board) {
    for (var y = 0; y < piece.shape.length; y++) {
      for (var x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          var ny = piece.y + y;
          var nx = piece.x + x;
          if (ny >= 0) board[ny][nx] = piece.color;
        }
      }
    }
  }

  function clearLines() {
    var cleared = 0;
    for (var y = ROWS - 1; y >= 0; y--) {
      var full = true;
      for (var x = 0; x < COLS; x++) {
        if (!board[y][x]) {
          full = false;
          break;
        }
      }
      if (full) {
        board.splice(y, 1);
        board.unshift(new Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }
    if (cleared > 0) {
      var points = [0, 100, 300, 500, 800][cleared] || cleared * 200;
      score += points * level;
      lines += cleared;
      var newLevel = Math.floor(lines / 10) + 1;
      if (newLevel !== level) {
        level = newLevel;
        dropInterval = Math.max(80, 600 - (level - 1) * 50);
      }
      updateStats();
    }
  }

  function updateStats() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
  }

  // Drawing
  function drawCell(context, x, y, color, size, alpha) {
    context.save();
    context.globalAlpha = alpha == null ? 1 : alpha;
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.restore();
  }

  function ghostY() {
    var gy = 0;
    while (!collides(current, board, 0, gy + 1)) gy++;
    return gy;
  }

  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid
    ctx.strokeStyle = "rgba(0,255,65,0.06)";
    ctx.lineWidth = 1;
    for (var i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * BLOCK, 0);
      ctx.lineTo(i * BLOCK, canvas.height);
      ctx.stroke();
    }
    for (var j = 1; j < ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * BLOCK);
      ctx.lineTo(canvas.width, j * BLOCK);
      ctx.stroke();
    }

    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (board[y][x]) drawCell(ctx, x, y, board[y][x], BLOCK);
      }
    }

    if (current && (state === "playing" || state === "paused")) {
  
      var gy = ghostY();
      for (var py = 0; py < current.shape.length; py++) {
        for (var px = 0; px < current.shape[py].length; px++) {
          if (current.shape[py][px]) {
            drawCell(ctx, current.x + px, current.y + py + gy, current.color, BLOCK, 0.18);
          }
        }
      }

      for (var cy = 0; cy < current.shape.length; cy++) {
        for (var cx = 0; cx < current.shape[cy].length; cx++) {
          if (current.shape[cy][cx]) {
            drawCell(ctx, current.x + cx, current.y + cy, current.color, BLOCK);
          }
        }
      }
    }
  }

  function drawNext() {
    nctx.fillStyle = "#000";
    nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!next) return;
    var size = 24;
    var shape = next.shape;

    var cells = [];
    for (var y = 0; y < shape.length; y++)
      for (var x = 0; x < shape[y].length; x++) if (shape[y][x]) cells.push([x, y]);
    var minX = Math.min.apply(null, cells.map(function (c) { return c[0]; }));
    var maxX = Math.max.apply(null, cells.map(function (c) { return c[0]; }));
    var minY = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
    var maxY = Math.max.apply(null, cells.map(function (c) { return c[1]; }));
    var w = (maxX - minX + 1) * size;
    var h = (maxY - minY + 1) * size;
    var offX = (nextCanvas.width - w) / 2;
    var offY = (nextCanvas.height - h) / 2;
    nctx.save();
    nctx.translate(offX, offY);
    for (var i = 0; i < cells.length; i++) {
      var dx = cells[i][0] - minX;
      var dy = cells[i][1] - minY;
      drawCell(nctx, dx, dy, next.color, size);
    }
    nctx.restore();
  }

  function drawHold() {
    hctx.fillStyle = "#000";
    hctx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (!held) return;
    var size = 24;
    var shape = SHAPES[held];
    var cells = [];
    for (var y = 0; y < shape.length; y++)
      for (var x = 0; x < shape[y].length; x++) if (shape[y][x]) cells.push([x, y]);
    var minX = Math.min.apply(null, cells.map(function (c) { return c[0]; }));
    var maxX = Math.max.apply(null, cells.map(function (c) { return c[0]; }));
    var minY = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
    var maxY = Math.max.apply(null, cells.map(function (c) { return c[1]; }));
    var w = (maxX - minX + 1) * size;
    var h = (maxY - minY + 1) * size;
    var offX = (holdCanvas.width - w) / 2;
    var offY = (holdCanvas.height - h) / 2;
    hctx.save();
    hctx.translate(offX, offY);
    for (var i = 0; i < cells.length; i++) {
      var dx = cells[i][0] - minX;
      var dy = cells[i][1] - minY;
      drawCell(hctx, dx, dy, COLORS[held], size, canHold ? 1 : 0.35);
    }
    hctx.restore();
  }


  function spawn() {
    current = next || makePiece(randomType());
    next = makePiece(randomType());
    current.x = ((COLS - current.shape[0].length) / 2) | 0;
    current.y = 0;
    canHold = true;
    drawNext();
    drawHold();
    if (collides(current, board, 0, 0)) {
      gameOver();
    }
  }

  function hold() {
    if (state !== "playing" || !canHold) return;
    var currentType = current.type;
    if (held == null) {
      held = currentType;
      spawn();
    } else {
      var swapType = held;
      held = currentType;
      current = makePiece(swapType);
      current.x = ((COLS - current.shape[0].length) / 2) | 0;
      current.y = 0;
      if (collides(current, board, 0, 0)) {
        gameOver();
        return;
      }
    }
    canHold = false;
    dropCounter = 0;
    drawHold();
    draw();
  }

  function drop() {
    var moved = false;
    if (!collides(current, board, 0, 1)) {
      current.y++;
      moved = true;
    } else {
      merge(current, board);
      clearLines();
      spawn();
    }
    dropCounter = 0;
    return moved;
  }

  function hardDrop() {
    var d = 0;
    while (!collides(current, board, 0, d + 1)) d++;
    current.y += d;
    score += d * 2;
    updateStats();
    merge(current, board);
    clearLines();
    spawn();
    dropCounter = 0;
  }

  function move(dir) {
    if (!collides(current, board, dir, 0)) current.x += dir;
  }

  function rotate() {
    var rotated = rotateMatrix(current.shape);
    var kicks = [0, -1, 1, -2, 2];
    for (var k = 0; k < kicks.length; k++) {
      if (!collides(current, board, kicks[k], 0, rotated)) {
        current.shape = rotated;
        current.x += kicks[k];
        return;
      }
    }
  }

  function loop(time) {
    if (state !== "playing") return;
    time = time || 0;
    var delta = time - (lastTime || time);
    lastTime = time;
    dropCounter += delta;
    if (dropCounter > dropInterval) drop();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    board = emptyBoard();
    score = 0;
    level = 1;
    lines = 0;
    dropInterval = 600;
    dropCounter = 0;
    lastTime = 0;
    held = null;
    canHold = true;
    next = makePiece(randomType());
    updateStats();
    drawHold();
    hideOverlays();
    state = "playing";
    pauseBtn.disabled = false;
    startBtn.textContent = "REINICIAR";
    spawn();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      pauseOverlay.classList.add("show");
      cancelAnimationFrame(rafId);
      draw();
    } else if (state === "paused") {
      state = "playing";
      pauseOverlay.classList.remove("show");
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    }
  }

  function gameOver() {
    state = "over";
    cancelAnimationFrame(rafId);
    pauseBtn.disabled = true;
    finalStats.innerHTML =
      "PONTOS <b>" + score + "</b><br>NIVEL <b>" + level + "</b><br>LINHAS <b>" + lines + "</b>";
    nameInput.value = "";
    overOverlay.classList.add("show");
    setTimeout(function () { nameInput.focus(); }, 50);
  }

  function hideOverlays() {
    idleOverlay.classList.remove("show");
    pauseOverlay.classList.remove("show");
    overOverlay.classList.remove("show");
  }

  // High scores (localStorage)
  function loadScores() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveScores(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function renderScores() {
    var list = loadScores();
    if (!list.length) {
      scoresList.innerHTML = '<div class="empty">SEM RECORDES AINDA</div>';
      return;
    }
    var html = "<ol>";
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var cls = s.id === lastSavedId ? ' class="highlight"' : "";
      html +=
        "<li" + cls + ">" +
        '<span class="rank">' + (i + 1) + "</span>" +
        '<span class="name">' + escapeHtml(s.name) + "</span>" +
        '<span class="pts">' + s.score + "</span>" +
        "</li>";
    }
    html += "</ol>";
    scoresList.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function saveCurrentScore() {
    if (state !== "over") return;
    var name = (nameInput.value || "").trim().toUpperCase().slice(0, 20) || "ANON";
    var entry = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      name: name,
      score: score,
      level: level,
      lines: lines,
    };
    lastSavedId = entry.id;
    var list = loadScores();
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, 10);
    saveScores(list);
    renderScores();
    overOverlay.classList.remove("show");
    idleOverlay.classList.add("show");
    state = "idle";
    startBtn.textContent = "INICIAR";
  }

  function initRain() {
    var rain = document.getElementById("matrix-rain");
    var rctx = rain.getContext("2d");
    var chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789".split("");
    var fontSize = 16;
    var columns, drops;

    function resize() {
      rain.width = window.innerWidth;
      rain.height = window.innerHeight;
      columns = Math.floor(rain.width / fontSize);
      drops = [];
      for (var i = 0; i < columns; i++) drops[i] = Math.random() * -50;
    }
    resize();
    window.addEventListener("resize", resize);

    function drawRain() {
      rctx.fillStyle = "rgba(0,0,0,0.08)";
      rctx.fillRect(0, 0, rain.width, rain.height);
      rctx.fillStyle = "#00ff41";
      rctx.font = fontSize + "px monospace";
      for (var i = 0; i < drops.length; i++) {
        var text = chars[(Math.random() * chars.length) | 0];
        rctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > rain.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    setInterval(drawRain, 50);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "p" || e.key === "P") {
      togglePause();
      return;
    }
    if (state !== "playing") return;
    switch (e.key) {
      case "ArrowLeft":
        move(-1);
        break;
      case "ArrowRight":
        move(1);
        break;
      case "ArrowDown":
        if (drop()) {
          score += 1;
          updateStats();
        }
        break;
      case "ArrowUp":
        rotate();
        break;
      case " ":
        e.preventDefault();
        hardDrop();
        break;
      case "c":
      case "C":
        hold();
        return;
      default:
        return;
    }
    draw();
  });

  startBtn.addEventListener("click", startGame);
  pauseBtn.addEventListener("click", togglePause);
  holdBtn.addEventListener("click", hold);
  saveBtn.addEventListener("click", saveCurrentScore);
  nameInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveCurrentScore();
  });

  board = emptyBoard();
  pauseBtn.disabled = true;
  idleOverlay.classList.add("show");
  initRain();
  renderScores();
  drawHold();
  draw();
})();
