(() => {
  'use strict';
  const {R,Session}=ScoopRules;
  const $=id=>document.getElementById(id), game=$('game'), canvas=$('field'), wrap=$('field-wrap'), ctx=canvas.getContext('2d'), panel=$('panel'), overlay=$('overlay');
  const names=['圆形','方形','三角'], colors=['#258476','#c17e48','#727ba6'], pale=['#dcece1','#f4e4ce','#e6e6f0'];
  const KEY='scoop-snap-1905-html-v1';
  let settings={muted:false,volume:.35,feedback:'medium',reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,slow:false}, best={}, storageOK=true, session, dialog='', pointer=null, keyboardHolding=false, cursor={x:180,y:240}, keys=new Set(), scale=1, displayWidth=960, fx=[], pulses=[], toastUntil=0, audioCtx, lastSave=0;
  let saved=null;
  try { const raw=localStorage.getItem(KEY); if(raw && raw.length<2500000) { const data=JSON.parse(raw); if(data.schema!==1 || data.rules!==R.version) storageOK=false; if(data.schema===1 && data.rules===R.version) { if(data.settings) { for(const k of ['muted','reduced','slow']) if(typeof data.settings[k]==='boolean') settings[k]=data.settings[k]; if(['minimal','medium','reduced'].includes(data.settings.feedback)) settings.feedback=data.settings.feedback; if(Number.isFinite(data.settings.volume)) settings.volume=Math.max(0,Math.min(1,data.settings.volume)); } if(data.best && typeof data.best==='object') best=Object.fromEntries(Object.entries(data.best).filter(([k,v])=>k.length<80 && Number.isFinite(v) && v>=0)); if(data.rules===R.version && data.session) saved=Session.restore(data.session); } } else if(raw) storageOK=false; } catch { storageOK=false; }
  const seed=()=> { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return (Date.now()^Math.floor(performance.now()*1000))>>>0; } };
  function persist() {
    if(!storageOK) return;
    try { localStorage.setItem(KEY,JSON.stringify({schema:1,rules:R.version,settings,best,session:session?.mode!=='tutorial'?session.snapshot():null})); lastSave=session?.tick||0; } catch { storageOK=false; }
  }
  function sound(type) {
    if(settings.muted || !audioCtx || settings.volume===0) return;
    try { const now=audioCtx.currentTime, g=audioCtx.createGain(); g.connect(audioCtx.destination); g.gain.setValueAtTime(settings.volume*.11,now); g.gain.exponentialRampToValueAtTime(.0001,now+.17); const freqs={press:[185],capture:[300+session.held.length*38],release:[220,440],result:[440,550,660],miss:[130]}[type]||[240]; freqs.forEach((f,i)=>{const o=audioCtx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(f,now+i*.018); o.connect(g); o.start(now+i*.018); o.stop(now+.18);}); } catch {}
  }
  function activateAudio() { try { audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{}); } catch {} }
  function message(text,seconds=3) { $('feedback').textContent=text; toastUntil=performance.now()+seconds*1000; }
  function newSession(mode='standard',mechanism='full',same=false) {
    pointer=null; keyboardHolding=false; keys.clear(); fx=[]; pulses=[]; closePanel();
    const sSeed=same?session.seed:seed(), traffic=same?session.traffic:null;
    session=new Session({seed:sSeed,mode,mechanism,traffic}); session.assist={slow:mode==='practice' && settings.slow}; cursor={x:180,y:240};
    message(mode==='tutorial'?'先练三颗圆形；教学得分不计入正式局。':mechanism==='full'?'先选一群，再在同形收口下方按住立锚。':mechanism==='collect'?'实验：拖过同形，松手立即得分；没有发射。':'实验：固定起点预装六颗；按住拖动瞄准，松手发射。',5);
    game.focus({preventScroll:true}); persist(); updateUI();
  }
  function closePanel() { dialog=''; overlay.hidden=true; panel.innerHTML=''; }
  function showPanel(kind,eyebrow,title,body,buttons) {
    dialog=kind; overlay.hidden=false;
    panel.innerHTML='<div class="panel-header"><span class="panel-eyebrow"></span><h2 id="panel-title"></h2></div><div class="panel-body"></div><div class="panel-actions"></div>';
    panel.querySelector('.panel-eyebrow').textContent=eyebrow; panel.querySelector('h2').textContent=title; panel.querySelector('.panel-body').innerHTML=body;
    for(const b of buttons) { const el=document.createElement('button'); el.textContent=b.label; if(b.primary) el.className='primary'; el.addEventListener('click',e=>{e.stopPropagation();activateAudio();b.action();}); panel.querySelector('.panel-actions').append(el); }
  }
  function releaseControl() { if(pointer!==null) { try{canvas.releasePointerCapture(pointer);}catch{} pointer=null; } keyboardHolding=false; keys.clear(); }
  function pause(reason='已暂停') {
    if(!session || !['playing','settling'].includes(session.phase)) return;
    releaseControl(); session.pause(); message('本兜已放回；继续后重新按住，不会误发射。',4); persist();
    showPanel('pause','歇一下',reason,'<p>局面和剩余时间已保留。手里未发出的粒子已放回，回来后重新按住立锚。</p>',[{label:'继续游戏',primary:true,action:()=>{closePanel();session.resume();game.focus({preventScroll:true});persist();}},{label:'重玩这一局',action:()=>confirmRetry()}]); updateUI();
  }
  function confirmRetry() {
    if(['playing','settling'].includes(session.phase)) {releaseControl();session.pause();}
    showPanel('confirm','重新尝试','重玩这一局？','<p>当前得分会清空；重新出现的粒群和时间顺序保持相同。</p>',[{label:'确认重玩',primary:true,action:()=>newSession(session.mode,session.mechanism,true)},{label:'返回',action:()=>pausePanel()}]);
  }
  function pausePanel() { showPanel('pause','歇一下','已暂停','<p>点击继续后重新按住立锚。</p>',[{label:'继续游戏',primary:true,action:()=>{closePanel();session.resume();game.focus({preventScroll:true});}},{label:'重玩这一局',action:confirmRetry}]); }
  function ready() {
    releaseControl(); session.pause(); updateUI();
    showPanel('ready','现在轮到你','把同形送到同形收口','<p>先在目标下方按住，再拖过同形粒子。拉到锚点下方，看落点，松手发射。</p><p>正式局 90 秒；练习不限时，两者分别记分。</p>',[{label:'开始 90 秒',primary:true,action:()=>newSession()},{label:'自由练习',action:()=>newSession('practice')}]);
  }
  function results() {
    releaseControl(); persist();
    if(session.mode==='tutorial') {
      showPanel('tutorialDone','第一束送达','三颗圆形，全部到达','<div class="score-large">+60<span style="font-size:14px"> 分</span></div><p>圆形进圆形收口。下一次可以自己选择锚点和路线；教学分数不会带入正式局。</p>',[{label:'开始 90 秒',primary:true,action:()=>newSession()},{label:'自由练习',action:()=>newSession('practice')}]); return;
    }
    const key=[R.version,session.mode,session.mechanism,session.assist?.slow?'slow':'normal'].join(':'); let record=false;
    if(session.mode==='standard' && session.phase==='results') { const old=best[key]||0; if(session.score>old) {best[key]=session.score;record=true;persist();} }
    const label=session.mechanism==='collect'?'仅收集实验':session.mechanism==='fixed'?'固定发射实验':session.mode==='practice'?'自由练习':'90 秒完成';
    const comment=session.sent===0?'这一局还没有成功发射。重试时先在收口下方立锚，再拖过同形粒子。':session.hits===session.sent?'发出的粒子全部送达。可以重试同样的来流，再试不同收法。':`共送达 ${session.hits} / ${session.sent} 颗。失手的落点已用叉号标出；重试可调整锚点或兜口位置。`;
    showPanel('results',label,record?'这次刷新了本模式纪录':'这一局结束',`<div class="score-large">${session.score}<span style="font-size:14px"> 分</span></div><div class="result-meta"><span>整束 ${session.fullCount} 次</span><span>最多连束 ${session.maxChain}</span></div><p>${comment}</p>`,[{label:'重玩这一局',primary:true,action:()=>newSession(session.mode,session.mechanism,true)},{label:'换一局',action:()=>newSession(session.mode,session.mechanism)},{label:'设置',action:showSettings}]); updateUI();
  }
  function showSettings() {
    const prior=dialog; if(['playing','settling'].includes(session.phase)) {releaseControl();session.pause();}
    showPanel('settings','按你的习惯','设置','<label class="setting-row">静音<input id="mute-setting" type="checkbox"></label><label class="setting-row">音量<input id="volume-setting" type="range" min="0" max="1" step="0.05" aria-label="音量"></label><label class="setting-row">反馈<select id="feedback-setting" aria-label="反馈"><option value="minimal">最小</option><option value="medium">适中</option><option value="reduced">减弱</option></select></label><label class="setting-row">减少运动<input id="motion-setting" type="checkbox"></label><label class="setting-row">练习慢速<input id="slow-setting" type="checkbox"></label><p class="setting-note">慢速只用于练习：规则不变，时间以一半速度推进；不记标准纪录。</p><label class="setting-row">动作版本<select id="mechanism-setting" aria-label="动作版本"><option value="full">完整收束</option><option value="collect">仅收集 · 实验</option><option value="fixed">固定发射 · 实验</option></select></label><p id="experiment-note" class="setting-note experimental"></p><label class="setting-row" id="fixed-kind-row" hidden>预装形状<select id="fixed-kind" aria-label="预装形状"><option value="0">圆形</option><option value="1">方形</option><option value="2">三角</option></select></label><button id="start-experiment">开始所选版本</button><button id="reteach">重看教学</button><button id="end-practice">结束练习</button><button id="export-record">导出本局记录</button><p class="setting-note" id="save-note"></p>',[{label:'返回游戏',primary:true,action:()=>{persist();if(prior==='results'||session.phase==='results') results();else if(prior==='tutorialDone') results();else if(prior==='ready') ready();else pausePanel();}}]);
    $('mute-setting').checked=settings.muted; $('volume-setting').value=settings.volume; $('feedback-setting').value=settings.feedback; $('motion-setting').checked=settings.reduced; $('slow-setting').checked=settings.slow;
    for(const [id,key] of [['mute-setting','muted'],['motion-setting','reduced'],['slow-setting','slow']]) $(id).addEventListener('change',()=>{settings[key]=$(id).checked;if(key==='slow'&&session.mode==='practice')session.assist.slow=settings.slow;document.body.classList.toggle('reduce-motion',settings.reduced);persist();});
    $('volume-setting').addEventListener('input',()=>{settings.volume=Number($('volume-setting').value);persist();}); $('feedback-setting').addEventListener('change',()=>{settings.feedback=$('feedback-setting').value;persist();});
    $('mechanism-setting').value=session.mechanism; const expNote=()=>{const m=$('mechanism-setting').value;$('experiment-note').textContent=m==='full'?'主玩法：沿途收集，再拉紧发射。':m==='collect'?'实验：沿途收集，松手每颗 10 分；没有弹射和整束奖励。':'实验：起点固定在同形收口下方，预装六颗；按住拖动瞄准，不需要收集。';$('fixed-kind-row').hidden=m!=='fixed';};expNote();$('mechanism-setting').onchange=expNote;
    $('start-experiment').onclick=()=>{const m=$('mechanism-setting').value,k=Number($('fixed-kind').value);newSession('standard',m);session.fixedKind=k;};
    $('reteach').onclick=()=>newSession('tutorial'); $('end-practice').hidden=session.mode!=='practice'; $('end-practice').onclick=()=>{closePanel();session.resume();session.endPractice();}; $('export-record').onclick=exportPreview; $('save-note').textContent=storageOK?'记录仅保存在本浏览器；导出不会上传。':'浏览器存储不可用或记录损坏；本次仍可试玩和手动导出。';persist();updateUI();
  }
  function exportPreview() {
    const record=session.record(), description=`只导出本局匿名记录：\n动作版本：${names.length && (session.mechanism==='full'?'完整收束':session.mechanism==='collect'?'仅收集实验':'固定发射实验')}\n分数：${session.score}\n输入动作：${record.commands.length} 条\n内容：规则版本、种子、展开来流、命令、结算与异常\n不含身份信息，不会上传。`;
    showPanel('export','留给自己','导出本局记录','<p class="export-preview" id="export-description"></p>',[{label:'保存 JSON',primary:true,action:()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({...record,assist:session.assist},null,2)],{type:'application/json'}));a.download='兜弹-匿名试玩记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);showSettings();}},{label:'返回设置',action:showSettings}]); $('export-description').textContent=description;
  }
  function updateUI() {
    if(!session) return;
    const tutorial=session.mode==='tutorial', experimental=session.mechanism!=='full';
    $('mode-label').textContent=tutorial?'试一束':experimental?'实验':session.mode==='practice'?'练习':'90 秒'; $('score').textContent=session.score; $('chain').textContent=session.chain;
    $('time-label').textContent=tutorial?'教学':session.mode==='practice'?'练习':'剩余'; $('time').textContent=tutorial||session.mode==='practice'?'不限时':session.phase==='settling'?'结算中':`${Math.floor(Math.ceil(session.remaining/60)/60)}:${String(Math.ceil(session.remaining/60)%60).padStart(2,'0')}`;
    $('payload').textContent=`兜里 ${session.held.length} / 6`; $('cancel-btn').disabled=!session.scoop||session.phase!=='playing';$('skip-btn').hidden=!tutorial;$('pause-btn').disabled=!['playing','settling'].includes(session.phase);
    let hint,sub;
    if(session.phase==='settling'){hint='时间到了，正在结算已经飞出的粒子。';sub='手里未发出的兜已放回。';}
    else if(session.phase==='paused'){hint='局面已暂停。';sub='点击「继续游戏」后，重新按住立锚。';}
    else if(session.phase==='results'){hint='这一局结束。';sub='重玩会保留同样的来流，可以换一种收法。';}
    else if(!session.scoop) {
      hint=tutorial?'把圆形送到左边圆形收口。':session.mechanism==='collect'?'实验：只收集同形，松手得分。':session.mechanism==='fixed'?`实验：预装六颗${names[session.fixedKind??0]}，拉紧后松手。`:'把同形粒子送进顶部同形收口。';
      sub=tutorial?'先在「按住这里」处按住，再拖过下面的圆形。':session.mechanism==='collect'?'按住拖过一群；第一颗决定形状，最多六颗。':session.mechanism==='fixed'?'起点固定在同形收口下方；向下拉紧，看落点后松手。':'先在目标下方按住立锚，再拖过同形；拉到锚点下方后松手。';
    } else if(!session.held.length){hint='锚点已固定，继续按住。';sub=tutorial?'把兜口向下拖过三颗圆形。':'拖过一群粒子；第一颗决定这一兜的形状。';}
    else if(session.mechanism==='collect'){hint=`已收 ${session.held.length} 颗${names[session.held[0].kind]}。`;sub='松手立即得分；本实验不发射。';}
    else { const p=session.preview(),q=p.rays.filter(r=>r.hit.success).length; hint=`已收 ${session.held.length} 颗${names[session.held[0].kind]}，保持按住。`; sub=!p.valid?(p.reason==='short'?'再拉远一点；距离太短会放回。':'兜口太靠边；向场地里面移动再松手。'):q===session.held.length?'所有落点都在同形收口内，现在松手发射。':`预计送达 ${q} / ${session.held.length}。调整兜口，让叉号进同形收口后松手。`; }
    $('hint').textContent=hint;$('subhint').textContent=sub;
    if(performance.now()>toastUntil) $('feedback').textContent=session.mechanism==='collect'?'实验成绩单独保存；松手每颗 10 分。':session.scoop?`张力 ${Math.round((session.preview()?.tension||0)*100)}% · 实心点能送达，叉号会失手`:'圆进圆、方进方、三角进三角。按住 → 收集 → 拉紧 → 松手';
  }
  const cancellation={empty:'没有收到粒子，已取消。重新按住，再拖过一群。',short:'拉得太短，粒子已放回。下次再拉远一点。',unsafe:'出发队形碰到边界，整兜已放回。把兜口移向场地里面。',cancel:'本兜已放回原位，可以重新选路线。',timeout:'时间到了，未发出的兜已放回。',pause:'暂停时本兜已放回，继续后重新按住。'};
  function onEvents(events) {
    for(const e of events) {
      if(e.type==='press') sound('press');
      if(e.type==='capture'){sound('capture');fx.push({x:session.scoop?.B.x||180,y:session.scoop?.B.y||440,kind:e.kind,start:performance.now(),type:'capture'});}
      if(e.type==='release'){sound('release');message(`已发出 ${e.n} 颗；可以立即收下一兜。`,1.5);}
      if(e.type==='cancel'){sound('miss');message(cancellation[e.reason]||'本兜已放回。',4);}
      if(e.type==='collect'){sound('result');message(`收到了 ${e.n} 颗，+${e.delta} 分；再选一群。`);}
      if(e.type==='arrival') {fx.push({...e,start:performance.now()});if(e.success)pulses.push({kind:e.kind,start:performance.now()});}
      if(e.type==='result') {
        sound(e.q===e.n?'result':'miss');
        let why=e.reasons.includes('wrong-shape')?'有粒子进了其他形状的收口。':e.reasons.some(r=>['left','right','bottom'].includes(r))?'有粒子碰到侧边或底边。':e.reasons.includes('near-left')?'落点略偏左。':e.reasons.includes('near-right')?'落点略偏右。':'落点超出同形收口。';
        message(e.q===e.n?`${e.n>=3?'整束送达':'全部送达'} ${e.q} / ${e.n}，+${e.delta} 分！再收一群。`:`送达 ${e.q} / ${e.n}，+${e.delta} 分。${why}下次调整锚点和兜口。`,4);persist();
        if(session.mode==='tutorial'){
          session.phase='results';
          if(e.n===3&&e.q===3) results();
          else showPanel('tutorialRetry','再试一束',`这束送达 ${e.q} / ${e.n} 颗`,`<p>${e.q===e.n?'先把三颗都收进来，再送出一整束。':why+'先在圆形收口下方的标记立锚，再向下拖过三颗圆形。'}</p><p>把兜口移到锚点正下方，落点全进圆形收口后松手。</p>`,[{label:'再试教学',primary:true,action:()=>newSession('tutorial')},{label:'跳过教学',action:ready}]);
        }
      }
      if(e.type==='end') results();
    }
  }
  function map(e) {const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*960/r.width,y:(e.clientY-r.top)*600/r.height};}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button===2){e.preventDefault();if(session.phase==='playing')session.enqueue('cancel');return;}
    if(e.button!==0 || pointer!==null || dialog || session.phase!=='playing') return;
    e.preventDefault();activateAudio();canvas.focus({preventScroll:true});pointer=e.pointerId;canvas.setPointerCapture(pointer);cursor=map(e);session.enqueue('press',cursor);
  });
  // A second mouse button does not emit pointerdown while the first stays held.
  canvas.addEventListener('mousedown',e=>{if(e.button===2){e.preventDefault();releaseControl();if(session.phase==='playing')session.enqueue('cancel');}});
  canvas.addEventListener('pointermove',e=>{cursor=map(e);if(e.pointerId!==pointer||dialog||session.phase!=='playing')return;e.preventDefault();if(e.buttons&2){releaseControl();session.enqueue('cancel');return;}const list=e.getCoalescedEvents?.()||[];for(const p of list.length?list:[e])session.enqueue('move',map(p));});
  canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;e.preventDefault();pointer=null;if(!dialog&&session.phase==='playing')session.enqueue('release',map(e));try{canvas.releasePointerCapture(e.pointerId);}catch{}});
  function canceled(e){if(e.pointerId!==pointer)return;pointer=null;session.actions=[];session.cancel('cancel');message('操作已中断，本兜已放回。重新按住即可。');}
  canvas.addEventListener('pointercancel',canceled);canvas.addEventListener('lostpointercapture',canceled);canvas.addEventListener('contextmenu',e=>{e.preventDefault();releaseControl();if(session.phase==='playing')session.enqueue('cancel');});
  game.addEventListener('keydown',e=>{
    if(e.target.matches('input,select,button') || dialog || !game.contains(document.activeElement)) return;
    if(e.code==='Escape'){e.preventDefault();pause();return;}
    if(session.phase!=='playing')return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);return;}
    if(e.code==='KeyC'){e.preventDefault();session.enqueue('cancel');keyboardHolding=false;return;}
    if(e.code==='Space'){e.preventDefault();if(e.repeat)return;activateAudio();keyboardHolding=!keyboardHolding;session.enqueue(keyboardHolding?'press':'release',cursor);}
    if(e.code==='KeyR'){e.preventDefault();confirmRetry();}
  });
  game.addEventListener('keyup',e=>keys.delete(e.code));
  game.addEventListener('focusout',e=>{if(e.relatedTarget&&!game.contains(e.relatedTarget))pause('离开场地，已暂停');});
  window.addEventListener('blur',()=>pause('切换窗口，已暂停'));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('离开页面，已暂停');});
  window.addEventListener('scroll',()=>{if(window.scrollY>24)pause('阅读说明，已暂停');},{passive:true});
  $('pause-btn').onclick=()=>pause();$('cancel-btn').onclick=()=>{releaseControl();session.enqueue('cancel');};$('settings-btn').onclick=()=>{activateAudio();showSettings();};$('skip-btn').onclick=ready;
  function resize() { const r=wrap.getBoundingClientRect();const width=Math.max(1,Math.min(r.width,r.height*1.6)),height=width/1.6;displayWidth=width;scale=width/960;canvas.style.width=width+'px';canvas.style.height=height+'px';const dpr=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(canvas.width/960,0,0,canvas.height/600,0,0); }
  new ResizeObserver(resize).observe(wrap);window.addEventListener('resize',resize);
  function shape(x,y,kind,r,color,fill=true) {ctx.beginPath();if(kind===0)ctx.arc(x,y,r,0,Math.PI*2);else if(kind===1)ctx.rect(x-r*.87,y-r*.87,r*1.74,r*1.74);else{ctx.moveTo(x,y-r*1.1);ctx.lineTo(x+r,y+r*.8);ctx.lineTo(x-r,y+r*.8);ctx.closePath();}ctx.fillStyle=color;ctx.strokeStyle=fill?'#34463d':color;ctx.lineWidth=1.3/scale;if(fill)ctx.fill();ctx.stroke();}
  function text(value,x,y,size=20,color='#506450',align='center',minCSS=11) {ctx.font=`600 ${Math.max(size,minCSS/scale)}px -apple-system, sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y);}
  function line(a,b,color,width=1,dash=[]) {ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=width/scale;ctx.setLineDash(dash.map(n=>n/scale));ctx.stroke();ctx.setLineDash([]);}
  function cross(x,y,color='#aa6551',r=5/scale) {line({x:x-r,y:y-r},{x:x+r,y:y+r},color,1.6);line({x:x-r,y:y+r},{x:x+r,y:y-r},color,1.6);}
  function draw(now) {
    ctx.clearRect(0,0,960,600);ctx.fillStyle='#efeddf';ctx.fillRect(0,0,960,600);
    ctx.save();ctx.strokeStyle='#d8ddd0';ctx.lineWidth=.7/scale;ctx.setLineDash([2/scale,8/scale]);for(let x=60;x<960;x+=60){ctx.beginPath();ctx.moveTo(x,80);ctx.lineTo(x,590);ctx.stroke();}ctx.setLineDash([]);
    for(let k=0;k<3;k++){const c=R.centers[k],pulse=pulses.some(p=>p.kind===k&&now-p.start<220);ctx.fillStyle=pulse?'#cbded1':pale[k];ctx.beginPath();ctx.roundRect(c-64,-25,128,102,18);ctx.fill();ctx.strokeStyle=colors[k];ctx.lineWidth=2/scale;ctx.beginPath();ctx.moveTo(c-64,0);ctx.lineTo(c+64,0);ctx.stroke();shape(c,25,k,Math.max(12,6/scale),colors[k]);text(names[k]+'收口',c,65,20,colors[k],'center',10);}
    for(const t of session.free){ctx.globalAlpha=session.mode!=='tutorial'&&t.life<120?.45+.3*(t.life/120):1;shape(t.x,t.y,t.kind,Math.max(8,5.5/scale),colors[t.kind]);if(t.life<120&&session.mode!=='tutorial'){ctx.strokeStyle=colors[t.kind];ctx.lineWidth=1/scale;ctx.beginPath();ctx.arc(t.x,t.y,Math.max(16,9/scale),-Math.PI/2,-Math.PI/2+2*Math.PI*t.life/120);ctx.stroke();}}
    ctx.globalAlpha=1;
    if(session.mode==='tutorial'&&!session.scoop&&session.score===0){const A={x:180,y:240},target={x:180,y:390};line(A,target,'#94aa92',1.5,[4,5]);ctx.beginPath();ctx.arc(A.x,A.y,Math.max(22,12/scale),0,Math.PI*2);ctx.strokeStyle='#267d6c';ctx.lineWidth=2/scale;ctx.stroke();text('按住这里',A.x,A.y-35,25,'#267d6c','center',12);text('再拖过圆形',210,490,23,'#5b7158','center',11);}
    if(session.scoop) {
      const {A,B}=session.scoop, p=session.preview(),kind=session.held[0]?.kind??0,color=colors[kind];
      ctx.fillStyle=pale[kind]+'a8';ctx.beginPath();ctx.arc(B.x,B.y,42,0,Math.PI*2);ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.5/scale;ctx.stroke();
      const d=p.rays[0]?.d||{x:0,y:-1},u={x:-d.y,y:d.x},half=(p.width||60)/2+8;
      for(const sign of [-1,1]){const end={x:B.x+u.x*half*sign,y:B.y+u.y*half*sign};ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.quadraticCurveTo((A.x+end.x)/2+u.x*sign*12,(A.y+end.y)/2+u.y*sign*12,end.x,end.y);ctx.strokeStyle=p.valid||!session.held.length?color:'#ac7356';ctx.lineWidth=2/scale;ctx.stroke();}
      ctx.beginPath();ctx.ellipse(B.x,B.y,half,18,Math.atan2(u.y,u.x),0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=2/scale;ctx.stroke();
      ctx.beginPath();ctx.arc(A.x,A.y,5/scale,0,Math.PI*2);ctx.fillStyle='#3c5145';ctx.fill();text('锚',A.x,A.y-18/scale,20,'#3c5145','center',11);
      if(session.mechanism!=='collect')for(const r of p.rays){line(r.p,r.hit,p.valid?(r.hit.success?'#398c77a0':'#b27a6690'):'#b47d69',1,[4,6]);if(r.hit.success){ctx.beginPath();ctx.arc(r.hit.x,Math.max(5/scale,r.hit.y),4/scale,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}else cross(r.hit.x,Math.max(5/scale,Math.min(600-5/scale,r.hit.y)));}
      session.held.forEach((t,i)=>{const rp=p.rays[i]?.p||{x:B.x+(i-(session.held.length-1)/2)*20,y:B.y};shape(rp.x,rp.y,t.kind,Math.max(8,5.5/scale),colors[t.kind]);});
    }
    for(const v of session.volleys)for(const m of v.members)if(!m.done){if(!settings.reduced&&settings.feedback==='medium')line({x:m.x-m.d.x*30,y:m.y-m.d.y*30},m,colors[m.kind]+'55',2);shape(m.x,m.y,m.kind,Math.max(8,5.5/scale),colors[m.kind]);}
    fx=fx.filter(f=>now-f.start< (f.type==='capture'?200:1500));pulses=pulses.filter(p=>now-p.start<300);
    for(const f of fx){if(f.type==='capture'){if(settings.reduced||settings.feedback!=='medium')continue;ctx.beginPath();ctx.arc(f.x,f.y,42+(now-f.start)/10,0,Math.PI*2);ctx.strokeStyle=colors[f.kind]+'50';ctx.lineWidth=1/scale;ctx.stroke();}else{const x=Math.max(8/scale,Math.min(960-8/scale,f.x)),y=Math.max(8/scale,Math.min(600-8/scale,f.y));if(f.success){ctx.fillStyle=colors[f.kind];ctx.beginPath();ctx.arc(x,y,4/scale,0,Math.PI*2);ctx.fill();}else cross(x,y);}}
    if(document.activeElement===canvas && pointer===null&&!dialog){ctx.beginPath();ctx.arc(cursor.x,cursor.y,6/scale,0,Math.PI*2);ctx.strokeStyle='#5c6a55';ctx.lineWidth=1/scale;ctx.stroke();}
    ctx.restore();
  }
  let previous=performance.now(),accumulator=0;
  function frame(now) {
    const dt=Math.min(now-previous,100);previous=now;
    if(session && !dialog && ['playing','settling'].includes(session.phase)) {
      const slowed=session.assist?.slow ? .5 : 1;accumulator+=dt*slowed;
      while(accumulator>=1000/60){accumulator-=1000/60;
        if(keys.size){const dx=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),dy=(keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0);cursor={x:Math.max(8,Math.min(952,cursor.x+dx*6)),y:Math.max(8,Math.min(592,cursor.y+dy*6))};if(keyboardHolding)session.enqueue('move',cursor);}
        onEvents(session.step());if(dialog)break;
      }
      if(session.mode!=='tutorial'&&session.tick-lastSave>=120)persist();
    } else accumulator=0;
    updateUI();draw(now);requestAnimationFrame(frame);
  }
  if(saved){session=saved;closePanel();if(saved.phase==='results')results();else{pausePanel();message('已恢复上次局面；点击继续后重新接管。',5);}}else newSession('tutorial');
  document.body.classList.toggle('reduce-motion',settings.reduced);resize();requestAnimationFrame(frame);
  // Read-only inspection for local verification; no alternative rule or score path.
  window.ScoopDemo=Object.freeze({state:()=>session.snapshot(),record:()=>session.record(),settings:()=>({...settings}),layout:()=>({width:displayWidth,scale}),version:R.version});
})();
