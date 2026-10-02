(function () {
  'use strict';
  const C = window.CurveVolley, L = window.CurveLevels, $ = id => document.getElementById(id);
  const game = $('game'), arena = $('arena'), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const key = 'pro2demo-1903-profile-v1';
  const defaults = { mute: false, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, toggle: false, hideScore: false, lowFeedback: false };
  let settings = { ...defaults }, pb = 0, storageNotice = '';
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const p = JSON.parse(raw);
      if (p.version !== 1 || !Number.isInteger(p.pb) || p.pb < 0 || p.pb > 10000000 || !p.settings || Object.keys(defaults).some(k => typeof p.settings[k] !== 'boolean')) throw Error('profile');
      pb = p.pb; settings = Object.fromEntries(Object.keys(defaults).map(k => [k, p.settings[k]]));
    }
  } catch (_) { storageNotice = '本地记录不可用或已损坏；本次仍可正常试玩。'; }
  function save() {
    try { localStorage.setItem(key, JSON.stringify({ version: 1, pb, settings })); }
    catch (_) { storageNotice = '本次无法保存设置与个人最佳；游戏可继续。'; }
  }
  let session, tutorialStage = 1, seed = 1903, runWaves = L.run(seed), mode = 'standard';
  let queue = [], source = null, pointer = null, pendingH = null, panel = null, ended = false;
  let frameLast = performance.now(), accumulator = 0, scale = 1, feedbackUntil = 0;
  let feedbackText = '', effects = [], audio = null, lastSoundAt = 0, tensionVoice = null;
  const keys = new Set();
  function unlockAudio() {
    if (settings.mute) return;
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch (_) {}
  }
  function sound(type, k = 1) {
    if (!audio || settings.mute || audio.state !== 'running') return;
    const now = audio.currentTime;
    if (now - lastSoundAt < .025) return;
    lastSoundAt = now;
    const freq = { capture: 260, release: 160, hit: 520 + k * 110, full: 110, grab: 200 }[type];
    if (!freq) return;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type === 'full' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(type === 'release' ? 430 : freq * .8, now + .1);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.075, now + .008); gain.gain.exponentialRampToValueAtTime(.0001, now + .15);
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + .16);
  }
  function notify(text, seconds = 1.8) { feedbackText = text; feedbackUntil = performance.now() + seconds * 1000; }
  function stopTension() {
    if (!tensionVoice) return;
    const { osc, gain } = tensionVoice; tensionVoice = null;
    try { gain.gain.setTargetAtTime(.0001, audio.currentTime, .01); osc.stop(audio.currentTime + .04); } catch (_) {}
  }
  function tension(h) {
    if (!audio || audio.state !== 'running' || settings.mute || settings.lowFeedback) return;
    if (!tensionVoice) {
      const osc = audio.createOscillator(), gain = audio.createGain(); osc.type = 'triangle'; gain.gain.value = .012;
      osc.connect(gain); gain.connect(audio.destination); osc.start(); tensionVoice = { osc, gain };
    }
    tensionVoice.osc.frequency.setTargetAtTime(100 + (h.y - 520) * .8, audio.currentTime, .02);
  }
  function enqueue(action) {
    if (action.type === 'move' && queue[queue.length - 1]?.type === 'move') queue[queue.length - 1] = action;
    else queue.push(action);
  }
  function resetInput() {
    stopTension(); queue = []; source = null; pointer = null; pendingH = null; keys.clear();
  }
  function focusGame() { game.focus({ preventScroll: true }); }
  function closePanel(resume = true) {
    $('overlay').hidden = true; panel = null; resetInput(); accumulator = 0; frameLast = performance.now();
    if (resume && session.phase !== 'results') session.resume();
    focusGame(); update();
  }
  function button(text, fn, primary = false) {
    const b = document.createElement('button'); b.textContent = text; if (primary) b.className = 'primary';
    b.addEventListener('click', e => { e.stopPropagation(); unlockAudio(); fn(); }); return b;
  }
  function showPanel(kind, title, html, actions, closable = true) {
    session.pause(); resetInput(); panel = kind; $('overlay').hidden = false;
    $('dialog-title').textContent = title; $('dialog-body').innerHTML = html;
    $('dialog-actions').replaceChildren(...actions); $('close-panel').hidden = !closable;
    (actions[0] || $('close-panel')).focus({ preventScroll: true }); update();
  }
  function startTutorial(stage = 1) {
    tutorialStage = stage; session = L.warmup(stage); ended = false; resetInput(); effects = [];
    $('overlay').hidden = true; panel = null; feedbackText = ''; focusGame(); update();
  }
  function startRun(nextMode = mode, repeat = false, layout = null) {
    tutorialStage = 0; mode = nextMode;
    if (!repeat) {
      const values = new Uint32Array(1);
      if (window.crypto?.getRandomValues) crypto.getRandomValues(values); else values[0] = Date.now() >>> 0;
      seed = values[0] || 1903;
      runWaves = layout === null ? L.run(seed) : Array.from({ length: 48 }, () => JSON.parse(JSON.stringify(L.templates[layout])));
    }
    session = new C.Session(runWaves, { mode: mode === 'slow' ? 'practice' : mode, seed });
    ended = false; resetInput(); effects = []; $('overlay').hidden = true; panel = null;
    feedbackText = ''; accumulator = 0; frameLast = performance.now(); focusGame(); update();
  }
  function pause(reason = 'pause') {
    if (panel || session.phase === 'results') return;
    const message = reason === 'reading' ? '阅读说明时已暂停。回到这里后继续，球和时间都会保留。' : reason === 'focus' ? '离开窗口后已暂停。继续时请重新抓住把手。' : reason === 'lag' ? '画面暂时卡顿，已暂停。继续后保留当前局面。' : '球、目标和剩余时间都会保留。';
    const actions = [button('继续游戏', () => closePanel(), true), button('重玩这一局', confirmRetry), button('设置', openSettings)];
    if (!tutorialStage && mode !== 'standard') actions.push(button('结束练习', () => { session.end('manual'); showResults('manual'); }));
    showPanel('pause', '已暂停', `<p>${message}</p>`, actions);
  }
  function confirmRetry() {
    showPanel('confirm', '重玩这一局？', '<p>当前进度会重置，目标和来球顺序相同。</p>', [button('重玩这一局', () => tutorialStage ? startTutorial(tutorialStage) : startRun(mode, true), true), button('返回游戏', () => closePanel())]);
  }
  function showResults(reason = 'time') {
    if (ended) return; ended = true;
    if (mode === 'standard' && session.score > pb) { pb = session.score; save(); }
    const title = mode === 'standard' ? '这一局完成了' : '练习已结束';
    const description = reason === 'manual' ? '你结束了这次练习。' : '90 秒结束，已发出的球也已收尾。';
    showPanel('results', title, `<p>${description}</p><div class="result-score">${session.score}<span style="font-size:16px;color:var(--muted)"> 分</span></div><div class="result-details"><div><span>清完的波</span><strong>${session.cleared}</strong></div><div><span>最好的一发</span><strong>${session.bestVolley} 环</strong></div><div><span>命中 / 发球</span><strong>${session.hits} / ${session.shots}</strong></div><div><span>${mode === 'standard' ? '标准局个人最佳' : '练习不记个人最佳'}</span><strong>${mode === 'standard' ? pb : '—'}</strong></div></div>`, [button('重玩这一局', () => startRun(mode, true), true), button('新的一局', () => startRun(mode)), button('设置', openSettings)], false);
  }
  function openSettings() {
    const previous = session.phase === 'results' ? 'results' : panel === 'warmupDone' ? 'warmupDone' : 'game';
    showPanel('settings', '设置', `<div class="settings-row"><label for="mute">静音</label><input id="mute" type="checkbox"></div><div class="settings-row"><label for="reduced">减少运动</label><input id="reduced" type="checkbox"></div><div class="settings-row"><label for="toggle">切换式抓握</label><input id="toggle" type="checkbox"></div><p class="setting-note">点把手抓住，再点一次或按“发射”。键盘按空格切换。</p><div class="settings-row"><label for="hideScore">隐藏游玩分数</label><input id="hideScore" type="checkbox"></div><div class="settings-row"><label for="lowFeedback">轻量反馈</label><input id="lowFeedback" type="checkbox"></div><div class="settings-row"><label for="play-mode">玩法</label><select id="play-mode"><option value="standard">标准 · 90 秒</option><option value="practice">练习 · 不限时</option><option value="slow">慢速练习 · 半速</option></select></div><div class="settings-row"><label for="practice-layout">练习布局</label><select id="practice-layout"><option value="-1">本局顺序</option>${L.templates.map((_, i) => `<option value="${i}">布局 ${i + 1}</option>`).join('')}</select></div><div class="setting-commands" id="setting-commands"></div><p class="setting-note">练习和慢速练习不记录标准成绩。重开会清空当前进度。</p><p class="setting-note">${storageNotice || '只在本机保存设置与个人最佳。关闭页面后不恢复进行中的局面。'}</p><div class="version">DEMO · html-demo-1 · curve-volley-r0</div>`, [button('返回', () => {
      if (previous === 'results') { ended = false; showResults(session.mode === 'standard' ? 'time' : 'manual'); }
      else if (previous === 'warmupDone') warmupDone();
      else closePanel();
    }, true)]);
    for (const name of Object.keys(defaults)) { $(name).checked = settings[name]; $(name).addEventListener('change', () => { settings[name] = $(name).checked; save(); update(); }); }
    $('play-mode').value = mode;
    $('setting-commands').append(button('开始所选玩法', () => {
      const nextMode = $('play-mode').value, value = Number($('practice-layout').value);
      if (!['standard', 'practice', 'slow'].includes(nextMode)) return;
      startRun(nextMode, value === -1 && !tutorialStage, nextMode !== 'standard' && value >= 0 && value < L.templates.length ? value : null);
    }), button('导出本局记录', exportRun));
  }
  function exportRun() {
    const data = { build: C.build, rules: C.rules, seed: session.seed, mode: tutorialStage ? 'tutorial' : mode, layout: session.waves, commands: session.commands, events: session.history, snapshot: session.snapshot(), diagnostic: session.diagnostic || null };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `兜弹-本局记录-${session.seed}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function warmupDone() {
    showPanel('warmupDone', '热身完成', '<p>你已经让两颗球一起命中。接下来每波有 3 或 4 个圆环，落球会自动被弹带接住。</p><p>正式局 90 秒，想放就拖把手再松手。</p>', [button('开始 90 秒', () => startRun('standard'), true), button('先不限时练习', () => startRun('practice'))], false);
  }
  function update() {
    if (settings.mute || settings.lowFeedback) stopTension();
    game.classList.toggle('reduced', settings.reduced);
    $('mode-label').textContent = tutorialStage ? `热身 ${tutorialStage} / 2` : mode === 'standard' ? '标准 · 得分' : mode === 'slow' ? '半速练习' : '不限时练习';
    $('score').textContent = tutorialStage ? '不计分' : settings.hideScore ? '已隐藏' : String(session.score);
    $('progress').textContent = `${session.targets.filter(t => t.lit).length} / ${session.targets.length}`;
    $('time-label').textContent = !tutorialStage && mode === 'standard' ? '剩余' : '时间';
    $('time').textContent = tutorialStage || mode !== 'standard' ? '不限时' : session.phase === 'draining' ? '收尾中' : `${Math.max(0, Math.ceil(90 - session.activeTicks / 120))} 秒`;
    const count = session.caught().length;
    $('ball-count').textContent = `${count} / 4`; $('slots').setAttribute('aria-label', `已接${count}颗，最多4颗`);
    [...$('slots').children].forEach((n, i) => n.classList.toggle('filled', i < count));
    $('cancel').disabled = !source || !!panel;
    $('primary').textContent = tutorialStage ? '跳过热身' : session.transition ? '准备下一波' : source ? `发射 ${count} 颗` : '抓住把手';
    $('primary').disabled = !!panel || session.phase !== 'playing' || (!tutorialStage && session.transition > 0);
    $('handle').classList.toggle('active', !!source); $('handle').classList.toggle('teaching', !!tutorialStage && !source && !settings.reduced);
    let hint;
    if (tutorialStage === 1) {
      $('guide-label').textContent = '先试一颗球';
      hint = source ? '看球路虚线是否穿过圆环。松手发射这颗球。' : '让球打中上方圆环。拖动下方把手，让球路虚线对准圆环，松手发射。';
    } else if (tutorialStage === 2) {
      $('guide-label').textContent = '再试两颗球'; hint = '拖同一个把手，让两条虚线穿过圆环，再松手一起发射。';
    } else {
      $('guide-label').textContent = `第 ${session.waveIndex + 1} 波 · 已供 ${session.spawnCursor} / 8 颗`;
      hint = source ? (count ? '看准虚线后松手，让已接的球一起打中圆环。' : '还没接到球；可以先调整形状，等球落在带上。') : count ? '已接到球。拖动把手调整球路，松手一起发射。' : '接住落球，让上方圆环全亮。拖动下方把手调整球路。';
      if (count === 4 && !source) hint = '已接满 4 颗。拖把手再松手发射；新球会穿过。';
    }
    if (settings.toggle && !panel) hint = source ? '继续拖把手调整虚线；再点把手或按“发射”一起放出。' : '点下方把手抓住，拖动调整虚线；再点一次发射。';
    if (session.phase === 'draining') hint = '时间到，正在等待已发出的球；现在不能再发射。';
    else if (session.transition) hint = '正在切换下一波，带上的球会保留；稍等片刻再发射。';
    if (session.paused && panel === 'pause') hint = '游戏已暂停，按“继续游戏”回到当前局面。';
    $('hint').textContent = hint;
    $('floating').textContent = performance.now() < feedbackUntil ? feedbackText : '';
    $('target-label').hidden = !tutorialStage;
  }
  function sizeArena() {
    const r = $('arena-wrap').getBoundingClientRect();
    const width = Math.max(1, Math.min(r.width, (r.height - 12) * 1000 / 760));
    const height = width * .76; arena.style.width = `${width}px`; arena.style.height = `${height}px`; scale = width / 1000;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 760, 0, 0);
    if (pointer || source) { resetInput(); enqueue({ type: 'cancel' }); }
    draw();
  }
  function point(e) { const r = arena.getBoundingClientRect(); return { x: (e.clientX - r.left) * 1000 / r.width, y: (e.clientY - r.top) * 760 / r.height }; }
  function grab(kind) {
    if (source || session.paused || session.phase !== 'playing' || session.transition > 0) return false;
    source = kind; pendingH = { ...session.h }; enqueue({ type: 'grab' }); sound('grab'); update(); return true;
  }
  function move(h) { if (!source) return; pendingH = C.pose(h); enqueue({ type: 'move', ...pendingH }); tension(pendingH); }
  function release() {
    if (!source) return; stopTension(); enqueue({ type: 'release' }); source = null; pointer = null; pendingH = null; keys.clear(); update();
  }
  function cancel() { if (!source && !session.grab) return; stopTension(); enqueue({ type: 'cancel' }); source = null; pointer = null; pendingH = null; keys.clear(); notify('已取消，球仍留在带上'); update(); }
  arena.addEventListener('pointerdown', e => {
    if (e.button === 2) { e.preventDefault(); cancel(); return; }
    if (e.button !== 0 || panel || session.phase !== 'playing') return;
    focusGame(); unlockAudio();
    const p = point(e), h = pendingH || session.h;
    if (p.y < 470 && e.target !== $('handle')) { notify('拖动下方把手，圆环是要击中的目标'); return; }
    if (source && !['toggle', 'button'].includes(source)) return;
    const already = !!source;
    if (!already && !grab(settings.toggle ? 'toggle' : 'pointer')) return;
    pointer = { id: e.pointerId, start: p, h: { ...h }, already, moved: false };
    arena.setPointerCapture(e.pointerId); e.preventDefault();
  });
  arena.addEventListener('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId || !source) return;
    const p = point(e);
    if (Math.hypot(p.x - pointer.start.x, p.y - pointer.start.y) * scale > 5) pointer.moved = true;
    move({ x: pointer.h.x + p.x - pointer.start.x, y: pointer.h.y + p.y - pointer.start.y }); e.preventDefault();
  });
  arena.addEventListener('pointerup', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const p = point(e), info = pointer;
    move({ x: info.h.x + p.x - info.start.x, y: info.h.y + p.y - info.start.y });
    pointer = null;
    if (source === 'pointer' || (source === 'toggle' && info.already && !info.moved)) release();
    if (arena.hasPointerCapture(e.pointerId)) arena.releasePointerCapture(e.pointerId);
  });
  arena.addEventListener('pointercancel', e => { if (pointer?.id === e.pointerId) cancel(); });
  arena.addEventListener('lostpointercapture', e => { if (pointer?.id === e.pointerId) cancel(); });
  arena.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); });
  game.addEventListener('keydown', e => {
    if (game.getBoundingClientRect().top < -8) return;
    if (e.key === 'Tab' && panel) {
      const items = [...$('overlay').querySelectorAll('button,input,select')].filter(n => !n.hidden && !n.disabled);
      const index = items.indexOf(document.activeElement);
      if (e.shiftKey && index <= 0) { e.preventDefault(); items.at(-1)?.focus(); }
      if (!e.shiftKey && index === items.length - 1) { e.preventDefault(); items[0]?.focus(); }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault(); if (panel === 'pause' || panel === 'confirm') closePanel(); else if (!panel) pause(); else if (panel === 'settings') $('dialog-actions').firstElementChild.click(); return;
    }
    if (panel === 'results' && e.key.toLowerCase() === 'r' && !e.repeat) { e.preventDefault(); startRun(mode, true); return; }
    if (panel || session.paused || game.getBoundingClientRect().top < -8 || document.activeElement.matches('button,input,select')) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Shift'].includes(e.key)) { e.preventDefault(); keys.add(e.key); if (e.key !== 'Shift' && !source) notify('先按住空格抓住把手，再用方向键移动'); }
    if (e.code === 'Space') {
      e.preventDefault(); if (e.repeat) return; unlockAudio();
      if (settings.toggle && source === 'keyboard') release(); else grab('keyboard');
    }
    if (e.key === 'Backspace') { e.preventDefault(); cancel(); }
    if ((e.key.toLowerCase() === 'r' || e.key === 'Enter') && session.phase === 'results') startRun(mode, true);
  });
  game.addEventListener('keyup', e => {
    keys.delete(e.key);
    if (e.code === 'Space' && source === 'keyboard' && !settings.toggle && !panel) { e.preventDefault(); release(); }
  });
  $('primary').addEventListener('click', () => {
    unlockAudio(); focusGame();
    if (tutorialStage) startRun('standard'); else if (source) release(); else grab('button');
  });
  $('cancel').addEventListener('click', () => { cancel(); focusGame(); });
  $('pause').addEventListener('click', () => { unlockAudio(); pause(); });
  $('settings').addEventListener('click', () => { unlockAudio(); openSettings(); });
  $('tutorial').addEventListener('click', () => showPanel('confirm', '重新热身？', '<p>当前进度会重置。先试一颗球，再试两颗球。</p>', [button('重看教学', () => startTutorial(), true), button('返回游戏', () => closePanel())]));
  $('close-panel').addEventListener('click', () => { if (panel === 'settings') $('dialog-actions').firstElementChild.click(); else closePanel(); });
  window.addEventListener('blur', () => pause('focus'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause('focus'); });
  document.addEventListener('pointerdown', e => { if (!game.contains(e.target)) pause('reading'); });
  window.addEventListener('scroll', () => { if (game.getBoundingClientRect().top < -8) pause('reading'); }, { passive: true });
  game.addEventListener('focusout', () => queueMicrotask(() => {
    const active = document.activeElement;
    if (source === 'keyboard' && active.matches('button,input,select')) cancel();
    if (active !== document.body && !game.contains(active)) pause('reading');
  }));
  function line(a, b, color, width = 2) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function circle(x, y, r, fill, stroke, width = 2) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); } }
  function draw() {
    if (!session) return;
    ctx.clearRect(0, 0, 1000, 760); ctx.fillStyle = '#192325'; ctx.fillRect(0, 0, 1000, 760);
    const h = pendingH || session.h, width = Math.max(2, 1 / scale);
    for (let x = 80; x <= 920; x += 140) line({ x, y: 100 }, { x, y: 740 }, '#263335', 1);
    for (let y = 180; y < 760; y += 140) line({ x: 30, y }, { x: 970, y }, '#263335', 1);
    if (!tutorialStage && !session.transition && session.phase === 'playing') {
      const w = session.waves[session.waveIndex % session.waves.length], next = session.spawnCursor;
      if (next < 8) { const x = w.incomingX[next]; line({ x, y: 70 }, { x, y: 92 }, '#829b98', width); line({ x: x - 7, y: 85 }, { x, y: 92 }, '#829b98', width); line({ x: x + 7, y: 85 }, { x, y: 92 }, '#829b98', width); }
    }
    for (const ball of session.caught()) {
      const path = C.preview(h, ball.u, session.targets);
      ctx.setLineDash([10, 9]); line(path.from, path.to, path.targetId ? '#e5edbb' : '#81aca5', width); ctx.setLineDash([]);
      circle(path.to.x, path.to.y, 4, path.targetId ? '#ffd166' : '#81aca5');
    }
    for (const t of session.targets) {
      if (!t.lit) {
        ctx.setLineDash([4, 5]); circle(t.x, t.y, 34, '#ffd1660a', '#b7a76a', Math.max(1.5, .6 / scale)); ctx.setLineDash([]);
        circle(t.x, t.y, 24, '#252c28', '#ffd166', Math.max(4, 1.6 / scale));
      } else {
        circle(t.x, t.y, 24, '#70e1cb', '#d0f8e3', 2);
        line({ x: t.x - 10, y: t.y }, { x: t.x - 2, y: t.y + 8 }, '#15362d', 4);
        line({ x: t.x - 2, y: t.y + 8 }, { x: t.x + 12, y: t.y - 10 }, '#15362d', 4);
      }
    }
    ctx.beginPath(); ctx.moveTo(80, 500); ctx.quadraticCurveTo(2 * h.x - 500, 2 * h.y - 500, 920, 500);
    ctx.lineTo(920, 746); ctx.lineTo(80, 746); ctx.closePath(); ctx.fillStyle = '#70e1cb06'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(80, 500); ctx.quadraticCurveTo(2 * h.x - 500, 2 * h.y - 500, 920, 500); ctx.strokeStyle = '#70e1cb'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
    circle(80, 500, 8, '#819a96'); circle(920, 500, 8, '#819a96');
    for (const b of session.balls) {
      const p = b.state === 'caught' ? C.curve(h, b.u) : b;
      if (!settings.reduced && !settings.lowFeedback) {
        if (b.state === 'outgoing') line(p, { x: p.x - b.vx / 55, y: p.y - b.vy / 55 }, '#f4f5ef70', 4);
        if (b.state === 'incoming') line({ x: p.x, y: p.y - 22 }, { x: p.x, y: p.y - 10 }, '#c4d7d060', 3);
      }
      circle(p.x, p.y, 15, b.state === 'incoming' ? '#dbe4d918' : '#70e1cb28');
      const age = Number.isFinite(b.caughtTick) ? (session.tick - b.caughtTick) / 120 : 1;
      if (b.state === 'caught' && age < .2 && !settings.reduced && !settings.lowFeedback) {
        const squash = 1 - .22 * Math.sin(Math.PI * age / .2);
        ctx.beginPath(); ctx.ellipse(p.x,p.y,10/squash,10*squash,0,0,Math.PI*2); ctx.fillStyle='#f4f5ef';ctx.fill();ctx.strokeStyle='#70e1cb';ctx.lineWidth=2;ctx.stroke();
      } else circle(p.x, p.y, 10, b.state === 'outgoing' ? '#ffd166' : '#f4f5ef', b.state === 'caught' ? '#70e1cb' : null, 2);
      if (b.state === 'caught') {
        const n = b.id % 4;
        if (n === 0) circle(p.x, p.y, 2.5, '#233b34');
        if (n === 1) line({ x: p.x - 4, y: p.y }, { x: p.x + 4, y: p.y }, '#233b34', 2);
        if (n === 2) { circle(p.x - 3, p.y, 2, '#233b34'); circle(p.x + 3, p.y, 2, '#233b34'); }
        if (n === 3) { line({ x: p.x - 4, y: p.y }, { x: p.x + 4, y: p.y }, '#233b34', 2); line({ x: p.x, y: p.y - 4 }, { x: p.x, y: p.y + 4 }, '#233b34', 2); }
      }
    }
    const now = performance.now(); effects = effects.filter(e => now - e.at < 450);
    if (!settings.reduced && !settings.lowFeedback) for (const e of effects) {
      const t = (now - e.at) / 450; ctx.globalAlpha = 1 - t; circle(e.x, e.y, 24 + t * 30, null, e.color, 3); ctx.globalAlpha = 1;
    }
    $('handle').style.left = `${h.x / 10}%`; $('handle').style.top = `${h.y / 7.6}%`;
    $('handle').classList.toggle('upper', (760 - h.y) * scale < 42);
    $('handle').hidden = session.phase !== 'playing';
  }
  function processEvents(events) {
    for (const e of events) {
      sound(e.type, e.k);
      if (e.type === 'capture') effects.push({ ...e, at: performance.now(), color: '#70e1cb' });
      if (e.type === 'hit') effects.push({ ...e, at: performance.now(), color: '#ffd166' });
      if (e.type === 'full') notify('已接满，新球会穿过');
      if (e.type === 'rejected' && e.reason === 'transition') notify('准备下一波，球仍保留在带上');
      if (e.type === 'volley') notify(e.perfect ? `全部命中 · ${e.hits} 环${tutorialStage || settings.hideScore ? '' : ` +${e.points}`}` : e.hits ? `命中 ${e.hits} 环${tutorialStage || settings.hideScore ? '' : ` +${e.points}`}` : '没打中；看虚线，换个形状再试');
      if (e.type === 'clear') {
        if (tutorialStage === 1) { startTutorial(2); notify('一颗命中！再试两颗', 2.2); return; }
        if (tutorialStage === 2) { warmupDone(); return; }
        resetInput();
        notify(`这一波全亮${settings.hideScore ? '' : ' · 清波 +100'}`);
      }
      if (e.type === 'waveFail') {
        if (tutorialStage) { const stage = tutorialStage; startTutorial(stage); notify('球已补回，看虚线再试', 2.2); return; }
        resetInput();
        notify(`还差 ${e.remaining} 个环，下一波继续`);
      }
      if (e.type === 'end' && !tutorialStage) { showResults(e.reason); return; }
    }
  }
  function frame(now) {
    const elapsed = (now - frameLast) / 1000; frameLast = now;
    if (!session.paused && session.phase !== 'results') {
      if (elapsed > .2) pause('lag');
      else {
        accumulator += elapsed * (mode === 'slow' && !tutorialStage ? .5 : 1);
        let count = 0;
        while (accumulator >= C.DT && count++ < 24 && !session.paused && session.phase !== 'results') {
          if (source && keys.size) {
            const h = pendingH || session.h, speed = keys.has('Shift') ? 90 : 360;
            move({ x: h.x + (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * speed * C.DT, y: h.y + (Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'))) * speed * C.DT });
          }
          const actions = queue; queue = []; let events;
          try { events = session.step(actions); }
          catch (error) {
            session.diagnostic = { tick: session.tick, reason: String(error.message).slice(0,80) };
            showPanel('error', '这一局已暂停', '<p>球路计算遇到了问题，本局停止计分。请重玩这一局。</p>', [button('重玩这一局', () => tutorialStage ? startTutorial(tutorialStage) : startRun(mode, true), true)], false);
            accumulator = 0; break;
          }
          if (!source) pendingH = null;
          accumulator -= C.DT; processEvents(events);
        }
      }
    } else accumulator = 0;
    update(); draw(); requestAnimationFrame(frame);
  }
  // Read-only diagnostics are opt-in; they do not supply gameplay controls.
  if (new URLSearchParams(location.search).has('qa')) window.demoQA = { snapshot: () => session.snapshot(), record: () => ({ waves: session.waves, commands: session.commands, events: session.history, seed: session.seed, snapshot: session.snapshot() }), settings: () => ({ ...settings }) };
  startTutorial(); new ResizeObserver(sizeArena).observe($('arena-wrap')); sizeArena(); requestAnimationFrame(frame);
})();
