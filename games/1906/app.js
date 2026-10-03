(() => {
  'use strict';
  const R = DouXian, $ = id => document.getElementById(id), canvas = $('board'), ctx = canvas.getContext('2d');
  const NS = 'pro2demo-1906:', game = $('game');
  let session = null, recovered = null, generation = 0, screen = 'home', pauseReason = '', lastScore = null;
  let pending = [], keys = new Set(), pointer = null, lastDevice = null, lastPointerType = null, lastT = 0, accumulator = 0;
  let scale = 1, dpr = 1, effects = [], rebound = null, audio = null, lastSound = {}, savedAt = -1;
  let prefs = { mute:false, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
    input:'hold', feedback:'standard', preview:true }, profile = {}, storageOK = true, warning = '';
  function storageRead(key) { try { return localStorage.getItem(NS+key); } catch { storageOK=false; return null; } }
  function storageWrite(key,value) { try { localStorage.setItem(NS+key,value); return true; } catch { storageOK=false; return false; } }
  try {
    const p = JSON.parse(storageRead('settings') || 'null');
    if (p) prefs = { mute:p.mute===true, reduced:p.reduced===true,
      input:p.input==='toggle'?'toggle':'hold', feedback:p.feedback==='quiet'?'quiet':'standard', preview:p.preview!==false };
    const q = JSON.parse(storageRead('profile') || '{}');
    if (q && typeof q==='object' && !Array.isArray(q)) for (const k of ['preview','no-preview'])
      if (Number.isInteger(q[k]) && q[k]>=0 && q[k]<1e9) profile[k]=q[k];
  } catch { warning='设置数据无效，已使用默认设置。'; }
  const raws = ['a','b'].map(k => storageRead('session:'+k));
  const decoded = raws.map(R.decode).filter(Boolean).sort((a,b)=>b.generation-a.generation);
  if (decoded.length) { recovered=decoded[0].s; generation=decoded[0].generation;
    if (raws.some((x,i)=>x && !R.decode(x))) warning='一份保存数据损坏，已找到另一份可恢复局面。'; }
  else if (raws.some(Boolean)) warning='保存数据无效。原数据已保留，可以开始新局。';
  function save(force=false) {
    if (!session || (!force && session.tick-savedAt<120)) return;
    if (!R.validate(session)) { storageOK=false; return; }
    const next=generation+1, raw=R.encode(session,next), key='session:'+(next%2?'a':'b');
    if (storageWrite(key,raw) && R.decode(storageRead(key))) { generation=next; savedAt=session.tick; }
    updateStorage();
  }
  function updateStorage() { $('storage-status').textContent=storageOK?'离线试玩 · 局面保存在本机':'本机保存不可用 · 仍可试玩'; }
  function unlockSound() {
    if (prefs.mute) return;
    try { if (!audio) audio=new (window.AudioContext||window.webkitAudioContext)(); if (audio.state==='suspended') audio.resume(); } catch {}
  }
  function sound(kind) {
    if (!audio || prefs.mute) return;
    const t=audio.currentTime;
    if (lastSound[kind] && t-lastSound[kind]<0.07) return;
    lastSound[kind]=t;
    const notes={catch:[430],stretch:[180],release:[640,420],hit:[740],perfect:[520,650,780],miss:[190]};
    const frequencies=notes[kind]||[400];
    frequencies.forEach((f,i)=>{
      const o=audio.createOscillator(), g=audio.createGain(), start=t+i*.035;
      o.type=kind==='release'?'triangle':'sine';o.frequency.setValueAtTime(f,start);
      if (kind==='release') o.frequency.exponentialRampToValueAtTime(180,start+.12);
      g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(kind==='stretch'?.018:.045/frequencies.length,start+.012);
      g.gain.exponentialRampToValueAtTime(.0001,start+.16);o.connect(g);g.connect(audio.destination);o.start(start);o.stop(start+.18);
    });
  }
  function setHint(h,d) { $('hint').textContent=h; $('detail').textContent=d; }
  function modal(html, nextScreen, takeFocus=true) {
    screen=nextScreen; $('panel').innerHTML=html; $('overlay').hidden=false;
    clearInput(); $('action').disabled=true;
    const first=$('panel').querySelector('button,input,select'); if(first&&takeFocus) first.focus({preventScroll:true});
    if(!takeFocus && game.contains(document.activeElement))document.activeElement.blur();
  }
  function btn(id,text,classes='') { return `<button id="${id}" class="${classes}">${text}</button>`; }
  function home() {
    $('pause').disabled=true;
    modal(`<div class="eyebrow">先用三片试一次</div><h2 id="panel-title">接住，再拉开。</h2>
      <p>把光片送进上方三道槽。先按住下方把手接三片，再向下拉开，松手发射。</p>
      <div class="panel-buttons">${recovered?btn('resume-save','继续上次局面','primary'):''}${btn('tutorial-start','先接三片',recovered?'':'primary')}${btn('quick-start','直接快玩 · 90 秒')}${btn('practice-start','自由练习')}</div>
      ${warning?`<p class="small">${warning}</p>`:''}`, 'home');
    $('tutorial-start').onclick=()=>start('tutorial',1906);
    $('quick-start').onclick=()=>start('quick',newSeed());
    $('practice-start').onclick=()=>start('practice',newSeed());
    if(recovered) $('resume-save').onclick=()=>{
      session=R.copy(recovered);effects=[];lastScore=null;savedAt=session.tick;
      if(session.phase==='RESULT') result();
      else { if(['PLAYING','TAIL'].includes(session.phase)) R.pause(session);
        if(session.phase==='PAUSED') R.awaitRegrab(session); resumeView(); }
    };
  }
  function newSeed() { const a=new Uint32Array(1); try{crypto.getRandomValues(a);return a[0]||1906;}catch{return Date.now()>>>0;} }
  function start(mode,seed,preview=prefs.preview,layout=null) {
    session=R.create(mode,seed);session.preview=preview;
    if(mode==='quick'&&layout){session.queue=R.copy(layout);session.layout=R.copy(layout);}
    effects=[];rebound=null;lastScore=null;savedAt=-120;
    clearInput();screen='play';$('overlay').hidden=true;$('pause').disabled=false;$('action').disabled=false;
    game.focus({preventScroll:true});unlockSound();save(true);refresh();
  }
  function clearInput() {
    pending=[];keys.clear();lastDevice=null;
    canvas._toggleBase=null;
    if(pointer){const p=pointer;pointer=null;try{$('field').releasePointerCapture(p.id);}catch{}}
    accumulator=0;
  }
  function pause(reason='已暂停，光片和时间都停在原处。', takeFocus=true) {
    if(!session || !['PLAYING','TAIL','AWAIT_REGRAB'].includes(session.phase)) return;
    if(session.phase==='AWAIT_REGRAB') session.phase='PAUSED';else R.pause(session);
    pauseReason=reason;clearInput();save(true);
    modal(`<div class="eyebrow">局面已保留</div><h2 id="panel-title">歇一下</h2><p>${reason}</p>
      <div class="panel-buttons">${btn('continue','返回场地','primary')}${btn('same',session.mode==='tutorial'?'重新接三片':'同一来流再试')}${btn('new',session.mode==='tutorial'?'开始 90 秒快玩':'新来流')}</div>`, 'pause', takeFocus);
    $('continue').onclick=()=>{R.awaitRegrab(session);resumeView();};
    $('same').onclick=()=>confirmRestart(session.mode,session.seed);
    $('new').onclick=()=>confirmRestart(session.mode==='tutorial'?'quick':session.mode,newSeed());refresh();
  }
  function resumeView() {
    screen='play';$('overlay').hidden=true;$('action').disabled=false;$('pause').disabled=false;
    clearInput();game.focus({preventScroll:true});refresh();
  }
  function confirmRestart(mode,seed,preview=prefs.preview) {
    const layout=mode==='quick'&&seed===session.seed?R.copy(session.layout):null;
    modal(`<h2 id="panel-title">重开这一局？</h2><p>当前这一局会结束。取消后可以接着玩。</p><div class="panel-buttons two">${btn('cancel','保留当前局面')}${btn('confirm','重开','primary')}</div>`, 'confirm');
    $('confirm').onclick=()=>{prefs.preview=preview;storageWrite('settings',JSON.stringify(prefs));start(mode,seed,preview,layout);};
    $('cancel').onclick=()=>{if(session.phase==='RESULT')result();else{R.awaitRegrab(session);resumeView();}};
  }
  function result() {
    clearInput();save(true);$('pause').disabled=true;
    const st=session.stats, tutorial=session.mode==='tutorial', all=tutorial && st.hit===3;
    let title=tutorial?(all?'三片，齐齐入槽。':'再试一次拉开。'):(session.mode==='practice'?'这一轮练习结束':'这一局收好了。');
    let message=tutorial?(all?'向下拉会展开整袋落点。接下来试试不同间距的光片。':
      (st.caught===0?'光片从弦上穿过去了。先接满三片，再拉开落点。':'有落点偏出槽口。接好后向下拉，让三个落点都变成实心圆再发射。')):
      `命中 ${st.hit} 片，落点偏出 ${st.missed} 片，漏接 ${st.passed} 片。${st.expired?'最后一袋没在 2 秒内释放。':''}`;
    const key=session.preview?'preview':'no-preview';
    if(session.eligible && session.phase==='RESULT') {
      profile[key]=Math.max(profile[key]||0,session.score);storageWrite('profile',JSON.stringify(profile));
    }
    modal(`<div class="eyebrow">${tutorial?'教学成绩 · 不计快玩纪录':session.mode==='practice'?'自由练习 · 不计快玩纪录':'90 秒快玩'}</div>
      <h2 id="panel-title">${title}</h2><div class="result-score">${session.score}<small>分</small></div><p>${message}</p>
      <div class="result-stats"><span><strong>${st.bestBag}</strong>最好一袋</span><span><strong>${st.perfect}</strong>整袋齐入</span><span><strong>${tutorial||session.mode==='practice'?'—':profile[key]||0}</strong>本机最高分</span></div>
      <div class="panel-buttons two">${tutorial?btn('next-quick','开始 90 秒快玩','primary wide'):btn('retry','同一来流再试','primary wide')}
      ${tutorial?btn('retry','重看教学'):btn('new-result','新来流')}${btn('practice-result','自由练习')}</div>`, 'result');
    $('retry').onclick=()=>start(session.mode,session.seed,session.preview,session.mode==='quick'?session.layout:null);
    if(tutorial)$('next-quick').onclick=()=>start('quick',newSeed());else $('new-result').onclick=()=>start(session.mode,newSeed());
    $('practice-result').onclick=()=>start('practice',newSeed());refresh();
  }
  function settings() {
    const from=screen;
    if(session && ['PLAYING','TAIL','AWAIT_REGRAB'].includes(session.phase)) {
      if(session.phase==='AWAIT_REGRAB')session.phase='PAUSED';else R.pause(session);clearInput();save(true);
    }
    modal(`<div class="eyebrow">设置期间暂停</div><h2 id="panel-title">按自己的节奏</h2><div class="settings-body">
      <label>静音<input id="mute" type="checkbox" ${prefs.mute?'checked':''}></label>
      <label>减少运动<input id="reduced" type="checkbox" ${prefs.reduced?'checked':''}></label>
      <label>鼠标 / 触摸操作<select id="input-mode"><option value="hold">按住，松手发射</option><option value="toggle">点一下接，再点发射</option></select></label>
      <label>反馈强度<select id="feedback"><option value="standard">标准</option><option value="quiet">轻量</option></select></label>
      <label>显示落点预览<input id="preview" type="checkbox" ${prefs.preview?'checked':''}></label>
      <p class="small">关闭预览会另记成绩；局中切换需要重开。静音和减少运动不影响规则。</p>
      ${session && session.mode!=='tutorial'?btn('lesson-again','重看三片教学'):''}
      ${session && session.mode==='practice'?btn('finish-practice','结束这轮练习'):''}
      </div><div class="return-row">${btn('settings-back','返回游戏','primary')}</div>`, 'settings');
    $('input-mode').value=prefs.input;$('feedback').value=prefs.feedback;
    for(const id of ['mute','reduced'])$(id).onchange=()=>{prefs[id]=$(id).checked;storageWrite('settings',JSON.stringify(prefs));};
    $('input-mode').onchange=()=>{prefs.input=$('input-mode').value;clearInput();storageWrite('settings',JSON.stringify(prefs));};
    $('feedback').onchange=()=>{prefs.feedback=$('feedback').value;storageWrite('settings',JSON.stringify(prefs));};
    $('preview').onchange=()=>{
      const val=$('preview').checked;
      if(session && session.phase!=='RESULT'){ $('preview').checked=prefs.preview;confirmRestart(session.mode,session.seed,val); }
      else {prefs.preview=val;storageWrite('settings',JSON.stringify(prefs));}
    };
    $('settings-back').onclick=()=>{
      if(!session) home();else if(session.phase==='RESULT') result();
      else {R.awaitRegrab(session);resumeView();}
    };
    if($('lesson-again'))$('lesson-again').onclick=()=>confirmRestart('tutorial',1906);
    if($('finish-practice'))$('finish-practice').onclick=()=>{session.phase='RESULT';result();};
  }
  function enqueue(a) { if(screen==='play' && session){
    if(a.kind==='MOVE'){const i=pending.findIndex(x=>x.kind==='MOVE');if(i>=0){pending[i]=a;return;}}
    pending.push(a);
  } }
  function begin() { unlockSound();enqueue({kind:'BEGIN'}); }
  function release() { enqueue({kind:'RELEASE'}); }
  function position(e) { const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width*960,y:(e.clientY-b.top)/b.height*720}; }
  $('field').addEventListener('pointerdown',e=>{
    if(e.button!==0 || pointer || screen!=='play' || !session || !['PLAYING','TAIL','AWAIT_REGRAB'].includes(session.phase))return;
    const p=position(e);if(p.y<410 || p.y>670 || p.x<0 || p.x>960)return;
    e.preventDefault();canvas.focus({preventScroll:true});unlockSound();keys.clear();lastDevice='pointer';
    const tapToRelease=prefs.input==='toggle' && session.held && session.phase!=='AWAIT_REGRAB';
    if(tapToRelease && e.pointerType!=='touch'){release();return;}
    lastPointerType=e.pointerType;
    pointer={id:e.pointerId,origin:p,base:{...session.handle},latest:p,client:{x:e.clientX,y:e.clientY},startClient:{x:e.clientX,y:e.clientY},moved:false,tapToRelease};
    $('field').setPointerCapture(e.pointerId);if(!tapToRelease)begin();
  });
  $('field').addEventListener('pointermove',e=>{
    if(screen!=='play'||!session)return;
    const p=position(e);
    if(pointer && e.pointerId===pointer.id){pointer.latest=p;pointer.client={x:e.clientX,y:e.clientY};
      if(Math.hypot(e.clientX-pointer.startClient.x,e.clientY-pointer.startClient.y)>4)pointer.moved=true;
      enqueue({kind:'MOVE',x:pointer.base.x+p.x-pointer.origin.x,y:pointer.base.y+p.y-pointer.origin.y});}
    else if(prefs.input==='toggle' && session.held && e.pointerType==='mouse' && lastDevice==='pointer') {
      if(lastPointerType!=='mouse'){lastPointerType='mouse';canvas._toggleBase=null;}
      if(!canvas._toggleBase) canvas._toggleBase={origin:p,base:{...session.handle}};
      const b=canvas._toggleBase;enqueue({kind:'MOVE',x:b.base.x+p.x-b.origin.x,y:b.base.y+p.y-b.origin.y});
    }
  });
  $('field').addEventListener('pointerup',e=>{
    if(!pointer||e.pointerId!==pointer.id)return;
    if(prefs.input==='hold'||(pointer.tapToRelease&&!pointer.moved))release();
    else canvas._toggleBase={origin:pointer.latest,base:{...session.handle}};
    pointer=null;
  });
  $('field').addEventListener('pointercancel',()=>pause('触摸中断，局面已保留。返回后请重新接管。'));
  $('field').addEventListener('lostpointercapture',()=>{if(pointer)pause('操作中断，局面已保留。');});
  game.addEventListener('keydown',e=>{
    if(e.target.closest('input,select,button,a'))return;
    if(e.code==='Escape'){if(screen==='play') {e.preventDefault();pause();}return;}
    if(screen!=='play'||!session)return;
    if(!['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ShiftLeft','ShiftRight'].includes(e.code))return;
    e.preventDefault();
    if(lastDevice!=='keyboard'){ if(pointer){const p=pointer;pointer=null;try{$('field').releasePointerCapture(p.id);}catch{}}lastDevice='keyboard';canvas._toggleBase=null; }
    if(e.code==='Space'&&!e.repeat&&!keys.has('Space')){
      if(prefs.input==='toggle' && session.held && session.phase!=='AWAIT_REGRAB')release();else begin();
    }
    keys.add(e.code);
  });
  game.addEventListener('keyup',e=>{
    if(e.target.closest('input,select,button,a')||screen!=='play')return;
    if(!keys.has(e.code))return;
    keys.delete(e.code);e.preventDefault();if(e.code==='Space'&&prefs.input==='hold'&&lastDevice==='keyboard')release();
  });
  $('action').onclick=()=>{
    if(!session||screen!=='play')return;
    game.focus({preventScroll:true});unlockSound();
    if(session.phase==='AWAIT_REGRAB'||!session.held)begin();else release();
  };
  $('pause').onclick=()=>pause();$('settings').onclick=settings;
  window.addEventListener('blur',()=>pause('离开窗口时已暂停。返回后请重新接管。',false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('页面暂时离开，时间和光片已暂停。',false);});
  window.addEventListener('scroll',()=>{if(window.scrollY>12)pause('阅读说明时已暂停。返回场地后可以接着玩。',false);},{passive:true});
  document.addEventListener('pointerdown',e=>{if(!game.contains(e.target))pause('阅读说明时已暂停。返回场地后可以接着玩。',false);},{capture:true});
  game.addEventListener('focusout',e=>{if(e.relatedTarget&&!game.contains(e.relatedTarget))pause('离开游戏时已暂停。返回后请重新接管。',false);});
  window.addEventListener('pagehide',()=>{if(session){R.pause(session);clearInput();save(true);}});
  function refresh() {
    if(!session)return;
    const toggle=prefs.input==='toggle', submit=toggle?'点按发射':'松手发射';
    const shownPhase=['PAUSED','AWAIT_REGRAB'].includes(session.phase)?session.prior:session.phase;
    $('score').textContent=session.score;$('capacity').textContent=`${session.bag.length} / 6`;
    $('mode').textContent=session.mode==='tutorial'?'短教学':session.mode==='practice'?'自由练习':'90 秒快玩';
    $('time-label').textContent=session.mode==='quick'?'剩余':session.mode==='practice'?'时间':'进度';
    $('time').textContent=session.mode==='quick'?(shownPhase==='TAIL'?`收尾 ${Math.max(0,Math.ceil((5520-session.tick)/60))} 秒`:`${Math.max(0,Math.ceil((5400-session.tick)/60))} 秒`):session.mode==='practice'?'不限时':session.bag.length===3?'拉 · 放':'接 · 拉 · 放';
    $('action').textContent=session.phase==='AWAIT_REGRAB'?'接管并继续':session.held?`发射这一袋${session.bag.length?` · ${session.bag.length} 片`:''}`:'开始接片';
    if(screen!=='play')return;
    if(session.phase==='AWAIT_REGRAB'){setHint('局面保留着，时间还没走。','按住场地下方，或点“接管并继续”。不会自动发射。');return;}
    if(session.phase==='TAIL'){setHint(`最后一袋：在 2 秒内${submit}。`,'仍能左右调整中心、向下拉开；已有在途光片会照常计分。');return;}
    if(session.mode==='tutorial') {
      if(session.batches.length)setHint('整袋已发射，正飞向上方槽口。','落点已经固定；到达后会显示命中和得分。');
      else if(!session.held)setHint(`第一步：${toggle?'点一下':'按住'}下方把手，接住三片。`,'先保持不动，接到三片后再向下拉。也可点“开始接片”。');
      else if(session.bag.length<3)setHint(`正在接片 · ${session.bag.length} / 3`,toggle?'等三片接齐，先别拖动；矩形光片会停在弦上。':'保持按住，先别拖动；矩形光片会停在弦上。');
      else {
        const valid=R.predict(session.handle,session.bag).filter(p=>p.slot>=0).length;
        setHint(valid===3?`三个落点都能进槽，现在${submit}！`:toggle?'第二步：向下拖动，拉开落点。':'第二步：保持按住，向下拉开落点。',valid===3?`${submit}，整袋一起飞出。也可点“发射这一袋”。`:'上方实心圆可进槽，叉号还在槽外。');
      }
    } else if(session.held && session.bag.length) {
      const h=R.predict(session.handle,session.bag).filter(p=>p.slot>=0).length;
      setHint(session.bag.length===6?`袋已满：调整后${submit}。`:session.preview?`已接 ${session.bag.length} 片 · ${h} 片落点可入槽`:`已接 ${session.bag.length} 片 · 整袋一起调整`,session.preview?'左右调中心，向下拉开；实心圆可入槽，叉号偏出。':`左右调中心，向下拉开。${submit}这一袋。`);
    } else if(session.held)setHint('接收中，等光片落到弦上。','接到后可以继续接，也可以调整落点再松手。');
    else if(lastScore && session.tick-lastScore.tick<100)setHint(lastScore.text,'下一袋已可接住。按住下方，或点“开始接片”。');
    else setHint('接住光片，整袋送进上方三道槽。',toggle?'点下方接片；左右调中心、向下拉开，再点一下发射。':'按住下方接片；左右调中心、向下拉开，松手发射。');
  }
  function consume(events) {
    for(const e of events) {
      if(e.kind==='CAPTURE'){sound('catch');effects.push({type:'catch',u:e.u,t:session.tick});}
      if(e.kind==='RELEASE'){sound('release');rebound={h:e.batch.handle,t:session.tick};}
      if(e.kind==='SETTLE') {
        sound(e.perfect?'perfect':e.h?'hit':'miss');
        lastScore={tick:session.tick,text:e.perfect?`齐入！${e.h} 片进 ${e.k} 道槽，+${e.points} 分`:`${e.h} / ${e.n} 片入槽，+${e.points} 分${e.h<e.n?' · 其余落点偏出':''}`};
        effects.push({type:'settle',...e,t:session.tick});
      }
      if(e.kind==='EMPTY_RELEASE')lastScore={tick:session.tick,text:'空袋没有发射。先按住接到光片。'};
      if(['PASSED_UNCAUGHT','OVERFLOW'].includes(e.kind))sound('miss');
      if(e.kind==='RESULT')result();
    }
  }
  function tick() {
    if(!session||screen!=='play')return;
    if(keys.size && session.held && lastDevice==='keyboard') {
      const v=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?2:6;
      const dx=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),dy=(keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0);
      if(dx||dy)pending.push({kind:'MOVE',x:session.handle.x+dx*v,y:session.handle.y+dy*v});
    }
    const actions=pending;pending=[];const oldY=session.handle.y;
    consume(R.step(session,actions));
    if(Math.abs(session.handle.y-oldY)>1&&session.held)sound('stretch');
    save();refresh();
  }
  function resize() {
    const r=$('field').getBoundingClientRect();scale=Math.min(r.width/960,r.height/720);
    const w=Math.max(1,960*scale),h=Math.max(1,720*scale);dpr=Math.min(devicePixelRatio||1,3);
    canvas.style.width=w+'px';canvas.style.height=h+'px';canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    const bounds=canvas.getBoundingClientRect(),pad=$('touch-pad');
    pad.style.left=(bounds.left-r.left)+'px';pad.style.top=(bounds.top-r.top+410*scale)+'px';pad.style.width=w+'px';pad.style.height=(260*scale)+'px';
    if(pointer&&session){const p=position({clientX:pointer.client.x,clientY:pointer.client.y});pointer.origin=p;pointer.latest=p;pointer.base={...session.handle};}
    canvas._toggleBase=null; draw();
  }
  new ResizeObserver(resize).observe($('field'));
  function line(x1,y1,x2,y2,color,width=2,dash=[]) {ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);}
  function text(str,x,y,size=20,color='#66736f',align='center') {ctx.font=`${Math.max(size,11/Math.max(scale,.1))}px -apple-system,"PingFang SC",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(str,x,y);}
  function ribbon(h,active,alpha=1) {
    ctx.globalAlpha=alpha;ctx.fillStyle=active?'#247f78':'#879b92';ctx.beginPath();ctx.moveTo(110,424);ctx.lineTo(h.x,h.y-6);ctx.lineTo(850,424);ctx.lineTo(850,436);ctx.lineTo(h.x,h.y+6);ctx.lineTo(110,436);ctx.closePath();ctx.fill();
    line(110,430,h.x,h.y,active?'#9bc6b4':'#c1c9be',2);line(h.x,h.y,850,430,active?'#9bc6b4':'#c1c9be',2);
    ctx.globalAlpha=1;
  }
  function piece(x,y,kind='incoming',alpha=1) {
    ctx.globalAlpha=alpha;ctx.fillStyle=kind==='held'?'#b57628':kind==='passed'?'#96978c':'#1f2e35';
    if(kind!=='passed'){ctx.fillStyle=kind==='held'?'#b5762820':'#247f7818';ctx.fillRect(x-13,y-17,26,34);ctx.fillStyle=kind==='held'?'#b57628':'#1f2e35';}
    ctx.fillRect(x-6,y-9,12,18);ctx.fillStyle='#f3efe4';ctx.fillRect(x-1,y-9,3,4);ctx.globalAlpha=1;
  }
  function draw() {
    ctx.setTransform(canvas.width/960,0,0,canvas.height/720,0,0);ctx.clearRect(0,0,960,720);
    ctx.fillStyle='#efeddf';ctx.fillRect(0,0,960,720);
    // The instrument markings are deterministic decoration, independent of game RNG.
    for(let x=30;x<960;x+=30)for(let y=30;y<710;y+=30){ctx.fillStyle='#9aa79a30';ctx.fillRect(x,y,1.5,1.5);}
    ctx.strokeStyle='#d7d9ca';ctx.lineWidth=1;ctx.strokeRect(24,24,912,672);
    [250,480,710].forEach((x,i)=>{
      ctx.fillStyle='#dddcca';ctx.fillRect(x-67,64,134,48);ctx.fillStyle='#faf8ef';ctx.fillRect(x-64,68,128,39);
      ctx.fillStyle='#1f2e35';ctx.fillRect(x-58,83,116,10);line(x-58,75,x-58,100,'#b57628',2);line(x+58,75,x+58,100,'#b57628',2);
      for(let j=0;j<=i;j++)line(x-7*i+j*14,117,x-7*i+j*14,124,'#66736f',3);
      text(['Ⅰ','Ⅱ','Ⅲ'][i],x,54,22,'#1f2e35');
    });
    const s=session,h=s?s.handle:{x:480,y:460},now=s?s.tick:0;
    ctx.fillStyle='#247f7808';ctx.fillRect(55,410,850,260);
    line(55,410,55,670,'#b6c3b6',1,[6,8]);line(905,410,905,670,'#b6c3b6',1,[6,8]);
    if(rebound&&!prefs.reduced&&prefs.feedback==='standard'&&now-rebound.t<12)ribbon(rebound.h,true,(1-(now-rebound.t)/12)*.2);
    ribbon(h,s&&s.held);
    [110,850].forEach(x=>{ctx.fillStyle='#1f2e35';ctx.beginPath();ctx.arc(x,430,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#efeddf';ctx.beginPath();ctx.arc(x,430,4,0,Math.PI*2);ctx.fill();});
    if(s) {
      const previews=R.predict(h,s.bag);
      if(s.preview || s.mode==='tutorial')previews.forEach(p=>{
        const ok=p.slot>=0;line(p.start.x,p.start.y-14,p.x,88,ok?'#247f7838':'#a642432d',1.5,[5,8]);
        if(p.x>=12&&p.x<=948){ctx.beginPath();ctx.arc(p.x,88,7,0,Math.PI*2);ctx.fillStyle=ok?'#247f78':'#f3efe4';ctx.fill();ctx.strokeStyle=ok?'#f3efe4':'#a64243';ctx.lineWidth=2;ctx.stroke();if(!ok){line(p.x-4,84,p.x+4,92,'#a64243',2);line(p.x+4,84,p.x-4,92,'#a64243',2);}}
      });
      s.pieces.forEach(p=>piece(p.x,p.y,p.status==='INCOMING'?'incoming':'passed',p.status==='INCOMING'?1:.28));
      s.bag.forEach(p=>{const q=R.onBand(p.u,h);piece(q.x,q.y-15,'held');});
      effects.filter(e=>e.type==='catch'&&now-e.t<8).forEach(e=>{const p=R.onBand(e.u,h),k=prefs.reduced?0:now-e.t;
        ctx.globalAlpha=1-(now-e.t)/8;ctx.strokeStyle='#b57628';ctx.lineWidth=2;ctx.strokeRect(p.x-11-k,p.y-29-k,22+2*k,28+2*k);ctx.globalAlpha=1;});
      s.batches.forEach(b=>b.items.forEach(p=>{
        const t=R.clamp((now-b.release)/39,0,1),x=p.start.x+(p.x-p.start.x)*t,y=p.start.y+(88-p.start.y)*t;
        if(!prefs.reduced&&prefs.feedback==='standard')line(x,y,x-(p.x-p.start.x)*.08,y-(88-p.start.y)*.08,'#b5762840',5);
        piece(x,y,'held');
      }));
      effects=effects.filter(e=>now-e.t<45);
      effects.filter(e=>e.type==='settle').forEach(e=>{
        const age=now-e.t;ctx.globalAlpha=Math.max(0,1-age/45);
        new Set(e.items.filter(p=>p.slot>=0).map(p=>p.slot)).forEach(i=>{
          const x=R.CFG.slots[i];line(x-64,110,x+64,110,'#b57628',4);
          if(!prefs.reduced&&prefs.feedback==='standard'){for(let j=0;j<6;j++){const a=j*Math.PI/3;ctx.fillStyle='#b57628';ctx.fillRect(x+Math.cos(a)*age*1.7-2,88+Math.sin(a)*age-2,4,4);}}
        });
        text(`+${e.points}${e.perfect?'  齐入':''}`,480,180,prefs.feedback==='quiet'?24:32,'#b57628');ctx.globalAlpha=1;
      });
    } else [-.65,0,.65].forEach(u=>{const q=R.onBand(u,h);piece(q.x,250,'incoming',.65);});
    ctx.fillStyle=s&&s.held?'#247f78':'#faf8ee';ctx.beginPath();ctx.arc(h.x,h.y+24,25,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#247f78';ctx.lineWidth=3;ctx.stroke();
    for(let i=0;i<3;i++)line(h.x-9+i*9,h.y+16,h.x-9+i*9,h.y+31,s&&s.held?'#ecf2e7':'#247f78',2);
    for(let i=0;i<6;i++){ctx.fillStyle=s&&i<s.bag.length?'#b57628':'#d3d8c8';ctx.beginPath();ctx.arc(440+i*16,673,4,0,Math.PI*2);ctx.fill();}
    if(!s||!s.held)text('按住这一区域接片',480,625,23,'#66736f');
  }
  function frame(t) {
    if(!lastT)lastT=t;const dt=Math.min((t-lastT)/1000,.1);lastT=t;
    if(screen==='play'&&session){accumulator+=dt;while(accumulator>=1/60){accumulator-=1/60;tick();if(screen!=='play'){accumulator=0;break;}}}else accumulator=0;
    draw();requestAnimationFrame(frame);
  }
  updateStorage();home();resize();requestAnimationFrame(frame);
})();
