/* ═══════════════════════════════════════════════════════
   INTERACTIVE ASCII BACKGROUND (Canvas)
   ═══════════════════════════════════════════════════════ */
(() => {
  const canvas = document.getElementById('ascii-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // ── Config ──────────────────────────────────────────
  const SYMBOLS = '@#%^&*[]{}~<>|/\\+-=.:;!?$'.split('');
  const CELL_SIZE = 22;          // px per grid cell
  const FONT_SIZE = 14;          // px
  const BASE_COLOR = '#e0e0e0';  // resting symbol colour
  const HOVER_COLOR = '#888888'; // darkened during scramble
  const SCRAMBLE_FRAMES = 6;     // how many random flips before settling
  const SETTLE_DURATION = 400;   // ms to fade colour back to base

  let cols = 0, rows = 0;
  let grid = [];        // [row][col] = { symbol, origSymbol, color, state, … }
  let dirtySet = new Set(); // indices of cells that need redraw
  let mouseCol = -1, mouseRow = -1;
  let dpr = 1;
  let animId = null;

  // ── Helpers ─────────────────────────────────────────
  const randSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

  // pack row,col into a single integer key for the dirty set
  const key = (r, c) => r * 10000 + c;

  // ── Build Grid ──────────────────────────────────────
  function buildGrid() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(canvas.clientWidth / CELL_SIZE) + 1;
    rows = Math.ceil(canvas.clientHeight / CELL_SIZE) + 1;

    grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({
          symbol: randSymbol(),
          origSymbol: null,   // set when scrambling
          color: BASE_COLOR,
          state: 'idle',      // idle | scramble | settling
          framesLeft: 0,
          settleStart: 0,
        });
      }
      grid.push(row);
    }

    // Full redraw after rebuild
    fullDraw();
  }

  // ── Draw helpers ────────────────────────────────────
  function drawCell(r, c) {
    const cell = grid[r][c];
    const x = c * CELL_SIZE;
    const y = r * CELL_SIZE;

    // clear cell
    ctx.clearRect(x, y, CELL_SIZE, CELL_SIZE);

    // draw symbol
    ctx.fillStyle = cell.color;
    ctx.font = `${FONT_SIZE}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.symbol, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
  }

  function fullDraw() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        drawCell(r, c);
      }
    }
  }

  // ── Mouse tracking ─────────────────────────────────
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const newCol = Math.floor(mx / CELL_SIZE);
    const newRow = Math.floor(my / CELL_SIZE);

    if (newCol === mouseCol && newRow === mouseRow) return;
    mouseCol = newCol;
    mouseRow = newRow;

    // activate a small cluster around the cursor for a richer effect
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = mouseRow + dr;
        const cc = mouseCol + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) {
          const cell = grid[rr][cc];
          if (cell.state === 'idle') {
            cell.state = 'scramble';
            cell.origSymbol = cell.symbol;
            cell.framesLeft = SCRAMBLE_FRAMES + Math.floor(Math.random() * 3);
            dirtySet.add(key(rr, cc));
          }
        }
      }
    }
  }

  function onMouseLeave() {
    mouseCol = -1;
    mouseRow = -1;
  }

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  // ── Animation loop ─────────────────────────────────
  let lastFrame = 0;
  const FRAME_INTERVAL = 1000 / 20; // throttle scramble updates to ~20fps for the slot-machine feel

  function animate(now) {
    animId = requestAnimationFrame(animate);

    const deltaFrame = now - lastFrame;
    const doScrambleTick = deltaFrame >= FRAME_INTERVAL;
    if (doScrambleTick) lastFrame = now;

    // Process dirty cells
    const toRemove = [];

    dirtySet.forEach(k => {
      const r = Math.floor(k / 10000);
      const c = k % 10000;
      if (r >= rows || c >= cols) { toRemove.push(k); return; }
      const cell = grid[r][c];

      if (cell.state === 'scramble') {
        if (doScrambleTick) {
          cell.symbol = randSymbol();
          cell.color = HOVER_COLOR;
          cell.framesLeft--;
          if (cell.framesLeft <= 0) {
            // transition to settling
            cell.state = 'settling';
            cell.symbol = cell.origSymbol;
            cell.settleStart = now;
          }
          drawCell(r, c);
        }
      } else if (cell.state === 'settling') {
        const elapsed = now - cell.settleStart;
        const t = Math.min(elapsed / SETTLE_DURATION, 1);
        // lerp colour from HOVER_COLOR → BASE_COLOR
        cell.color = lerpColor(HOVER_COLOR, BASE_COLOR, easeOutCubic(t));
        drawCell(r, c);
        if (t >= 1) {
          cell.state = 'idle';
          cell.color = BASE_COLOR;
          cell.origSymbol = null;
          toRemove.push(k);
        }
      } else {
        toRemove.push(k);
      }
    });

    toRemove.forEach(k => dirtySet.delete(k));
  }

  // ── Colour helpers ─────────────────────────────────
  function hexToRGB(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function lerpColor(a, b, t) {
    const [ar, ag, ab] = hexToRGB(a);
    const [br, bg, bb] = hexToRGB(b);
    return rgbToHex(
      Math.round(ar + (br - ar) * t),
      Math.round(ag + (bg - ag) * t),
      Math.round(ab + (bb - ab) * t)
    );
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // ── Resize ─────────────────────────────────────────
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildGrid, 150);
  });

  // ── Init ───────────────────────────────────────────
  buildGrid();
  animId = requestAnimationFrame(animate);
})();


/* ═══════════════════════════════════════════════════════
   TITLE GLITCH — per-letter Geist Pixel variant cycling
   ═══════════════════════════════════════════════════════ */
(() => {
  // Wait for all Geist Pixel fonts to load before enabling glitch
  document.fonts.ready.then(() => {
    const letters = document.querySelectorAll('.pixel-letter');
    if (!letters.length) return;

    // Fixed sequence: line → triangle → grid → circle → (remove = back to square)
    const sequence = [
      'glitch-line',
      'glitch-triangle',
      'glitch-grid',
      'glitch-circle',
    ];
    const CYCLE_MS = 70;

    function glitchLetter(letter) {
      if (letter.dataset.glitching === 'true') return;
      letter.dataset.glitching = 'true';

      let step = 0;

      const timer = setInterval(() => {
        // Remove all variant classes
        sequence.forEach(v => letter.classList.remove(v));

        if (step < sequence.length) {
          letter.classList.add(sequence[step]);
        } else {
          // Back to square (no class = default font-family)
          clearInterval(timer);
          letter.dataset.glitching = 'false';
        }
        step++;
      }, CYCLE_MS);
    }

    letters.forEach(letter => {
      letter.addEventListener('mouseenter', () => glitchLetter(letter));
    });
  });
})();


/* ═══════════════════════════════════════════════════════
   SCROLL REVEAL — subtle fade-in for sections
   ═══════════════════════════════════════════════════════ */
(() => {
  const sections = document.querySelectorAll(
    '#how-i-build, #currently-learning, #reach-me'
  );

  // add initial hidden style
  sections.forEach(s => {
    s.style.opacity = '0';
    s.style.transform = 'translateY(24px)';
    s.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
  });

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  sections.forEach(s => observer.observe(s));
})();


/* ═══════════════════════════════════════════════════════
   PROJECT CARD CAROUSELS — prev/next navigation
   ═══════════════════════════════════════════════════════ */
(() => {
  const carousels = document.querySelectorAll('.card-carousel');

  carousels.forEach(carousel => {
    const track = carousel.querySelector('.carousel-track');
    const cards = track.querySelectorAll('.project-card');
    const prevBtn = carousel.querySelector('.carousel-prev');
    const nextBtn = carousel.querySelector('.carousel-next');
    const counter = carousel.querySelector('.carousel-counter');
    const total = cards.length;
    let current = 0;

    function update() {
      track.style.transform = `translateX(-${current * 100}%)`;
      counter.textContent = `${current + 1} / ${total}`;
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === total - 1;
    }

    prevBtn.addEventListener('click', () => {
      if (current > 0) { current--; update(); }
    });

    nextBtn.addEventListener('click', () => {
      if (current < total - 1) { current++; update(); }
    });

    // initialise button states
    update();
  });
})();


/* ═══════════════════════════════════════════════════════
   ROTATING SUBTITLE — scramble/decode text rotation
   ═══════════════════════════════════════════════════════ */
(() => {
  const el = document.getElementById('rotating-subtitle');
  if (!el) return;

  const phrases = [
    'a lifetime learner',
    'data analyst (in progress)',
    'data scientist (in progress)',
  ];
  const SCRAMBLE_CHARS = '@#%^&*~<>|/\\+-=.:;!?$[]{}';
  const DECODE_STEP_MS = 40;   // ms per character resolve
  const PAUSE_MS = 4000;       // pause between rotations
  const SCRAMBLE_MS = 600;     // initial full-scramble duration

  let currentIndex = 0;

  function randChar() {
    return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
  }

  function scrambleToNext() {
    currentIndex = (currentIndex + 1) % phrases.length;
    const target = phrases[currentIndex];
    const maxLen = Math.max(el.textContent.length, target.length);

    // Phase 1: full scramble
    let scrambleCount = 0;
    const scrambleInterval = setInterval(() => {
      let s = '';
      for (let i = 0; i < maxLen; i++) s += randChar();
      el.textContent = s;
      scrambleCount += 50;
      if (scrambleCount >= SCRAMBLE_MS) {
        clearInterval(scrambleInterval);
        // Phase 2: decode left-to-right
        let resolved = 0;
        const decodeInterval = setInterval(() => {
          let s = '';
          for (let i = 0; i < target.length; i++) {
            if (i < resolved) {
              s += target[i];
            } else {
              s += target[i] === ' ' ? ' ' : randChar();
            }
          }
          el.textContent = s;
          resolved++;
          if (resolved > target.length) {
            clearInterval(decodeInterval);
            el.textContent = target;
            setTimeout(scrambleToNext, PAUSE_MS);
          }
        }, DECODE_STEP_MS);
      }
    }, 50);
  }

  // Start the first rotation after initial pause
  setTimeout(scrambleToNext, PAUSE_MS);
})();
