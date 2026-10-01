(function() {
  'use strict';
  const R=window.SweepRules, $=id=>document.getElementById(id);
  const game=$('game'), canvas=$('board'), ctx=canvas.getContext('2d'), overlay=$('overlay');
  const defaults={muted:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,clickMode:false,speed:60};
  let settings={...defaults}, session, board, tutorial=true, guide=0, hints=true;
  let actions=[], assist=new Set(), best={}, sessionId='', finishedRecorded=false;
  let armed=false,capture=null,latch=false,pointerAngle=null,pointerRemainder=0,dead=false,epoch=0;
  let held=null,keys=new Set(),lastTime=0,repeatRemainder=0,repeatStart=0;
  let trails=[],bursts=[],relayTime=-Infinity,boundaryTime=-Infinity,notice='',noticeUntil=0,overlayKind='',confirmAction=null;
  let saveTimer=null,scale=1,audio=null,audioVoices=0,lastBoundarySound=0,saveWarning='';
  let store;
  try {store=new SweepStore.Store(localStorage,R);} catch(e) {store=new SweepStore.Store({getItem(){throw e;},setItem(){throw e;}},R);}
  const saved=store.load();
  if(saved) {
    try {
      session=R.Session.restore(saved.session); actions=saved.actions;
      board={seed:session.seed,targets:session.targets,board_hash:session.board_hash,generator_version:saved.generator_version||R.GENERATOR_VERSION,fallback:!!saved.fallback};
      settings={...defaults,...saved.settings};
      settings.speed=[30,60,90].includes(settings.speed)?settings.speed:60;
      for(const k of ['muted','reduced','clickMode']) settings[k]=!!settings[k];
      tutorial=!!saved.tutorial; guide=Math.max(0,Math.min(3,Number(saved.guide)||0)); hints=saved.hints!==false;
      assist=new Set(Array.isArray(saved.assist)?saved.assist.filter(v=>['drag','click','stepped'].includes(v)):[]);
      best=Object.fromEntries(Object.entries(saved.best||{}).filter(([k,v])=>k.length<200&&Number.isInteger(v)&&v>=0&&v<=4800&&v%100===0));
      sessionId=typeof saved.session_id==='string'?saved.session_id:newId();
      finishedRecorded=!!saved.finished_recorded;
      if(session.phase!=='RESULT'&&session.phase!=='PAUSED') execute('PAUSE');
    }catch(e){session=null;saveWarning='保存内容不完整，已保留原数据；当前从教学局开始。';}
  }
  if(!session) newSession(window.SweepBoards.tutorial,true);
  function newId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
  function newSeed(){const u=new Uint32Array(2);try{crypto.getRandomValues(u);}catch(e){u[0]=Date.now()>>>0;u[1]=Math.floor(Math.random()*4294967296);}return '1902-'+u[0].toString(16)+'-'+u[1].toString(16);}
  function clearInput() {
    epoch++; const old=capture; capture=null; latch=false; armed=false; pointerAngle=null; pointerRemainder=0; dead=false;
    held=null;keys.clear();repeatRemainder=0;
    if(old&&canvas.hasPointerCapture(old.id)) {try{canvas.releasePointerCapture(old.id);}catch(e){}}
  }
  function newSession(layout,isTutorial) {
    clearInput(); board={seed:String(layout.seed),targets:layout.targets.map(t=>({...t})),board_hash:R.boardHash(layout.targets),generator_version:layout.generator_version||R.GENERATOR_VERSION,fallback:!!layout.fallback};
    session=new R.Session(board.targets,board.seed); actions=[];assist.clear();sessionId=newId();finishedRecorded=false;
    tutorial=isTutorial; guide=isTutorial?0:3;hints=isTutorial;trails=[];bursts=[];notice='';relayTime=-Infinity;boundaryTime=-Infinity;
    hidePanel();update();scheduleSave();canvas.focus({preventScroll:true});
  }
  function execute(kind,units=0) {
    const a=session.a.slice(),angle=session.angle,used=session.used,oldPhase=session.phase;
    const r=session.apply(kind,units);
    if(r.accepted) actions.push({kind,units});
    if(kind==='ROTATE') {
      if(r.applied_units) {
        if(!settings.reduced) {trails.push({a,angle,k:r.applied_units,time:performance.now()});if(trails.length>50)trails.shift();}
        if(r.hits.length) {
          if(tutorial&&guide===0)guide=1;
          const points=session.targets.filter(t=>r.hits.includes(t.id));
          if(!settings.reduced)points.forEach(t=>bursts.push({...t,time:performance.now()}));
          tone('collect',Math.min(session.stroke_ids.size,7));
          notice=`本手收了${session.stroke_ids.size}个光点，已即时计分。`;noticeUntil=performance.now()+1300;
        }
      }
      if(Math.abs(r.applied_units)<Math.min(Math.abs(units),240-used)&&session.phase!=='RESULT') boundary();
      if(!r.applied_units&&session.used===240)flashNotice('本手已用满120°，请完成这一手。');
    }
    if(r.accepted&&kind==='BEGIN')tone('begin');
    if(r.accepted&&(kind==='COMMIT'||kind==='PASS')) {
      clearInput();relayTime=performance.now();
      if(kind==='PASS'){flashNotice('原地换手：消耗1手，没有收点。');tone('pass');}
      else if(used){flashNotice('两端已交换，绿色圆环是现在可拖的一端。');tone('relay');if(tutorial&&guide===1)guide=2;else if(tutorial&&guide===2)guide=3;}
      else flashNotice('没有转动，不扣手。');
    }
    if(session.phase==='RESULT'&&oldPhase!=='RESULT') {
      clearInput();tone(session.reason==='CLEAR'?'clear':'end');recordBest();showPanel('result');
    }
    if(r.accepted){update();scheduleSave();}
    return r;
  }
  function boundary() {
    boundaryTime=performance.now();flashNotice('已到边界，试着反向转；挡住的角度不扣。');
    if(performance.now()-lastBoundarySound>700){tone('boundary');lastBoundarySound=performance.now();}
  }
  function flashNotice(text){notice=text;noticeUntil=performance.now()+2200;update();}
  function classKey(){return [...assist].sort().join('+')||'direct';}
  function bestKey(){return R.RULES_VERSION+':'+session.board_hash+':'+classKey();}
  function recordBest(){if(!tutorial&&!finishedRecorded){const k=bestKey();best[k]=Math.max(best[k]||0,session.score);finishedRecorded=true;}}
  function payload(){return {session:session.snapshot(),actions,settings,tutorial,guide,hints,assist:[...assist],best,session_id:sessionId,finished_recorded:finishedRecorded,generator_version:board.generator_version,fallback:board.fallback};}
  function saveNow(){clearTimeout(saveTimer);saveTimer=null;if(session){const ok=store.save(payload());updateSaveStatus();return ok;}return true;}
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,250);}
  function updateSaveStatus(){const text=saveWarning||store.warning;$('save-status').textContent=text||'进度保存在本机';$('save-status').classList.toggle('warning',!!text);}
  function arm(inputClass) {
    if(session.phase==='READY')execute('BEGIN');
    if(session.phase!=='ACTIVE')return false;
    armed=true;assist.add(inputClass);update();scheduleSave();return true;
  }
  function primary(){unlockAudio();if(session.phase==='RESULT'){showPanel('result');return;}if(session.phase==='PAUSED'){resume();return;}if(session.phase==='READY'||!armed)arm('stepped');else execute('COMMIT');}
  function pause(kind='pause',focusPanel=true) {
    clearInput();
    if(session.phase!=='PAUSED'&&session.phase!=='RESULT')execute('PAUSE');
    if(session.phase==='RESULT'){if(kind==='menu')showPanel('menu');return;}
    showPanel(kind,focusPanel);saveNow();
    if(!focusPanel&&game.contains(document.activeElement))document.activeElement.blur();
  }
  function resume() {
    clearInput();hidePanel();
    if(session.phase==='PAUSED')execute('RESUME');
    if(session.phase==='ACTIVE')flashNotice('已保留这一手。重新抓圆环或点“继续这一手”。');
    canvas.focus({preventScroll:true});update();
  }
  function update() {
    if(!session)return;
    $('collected').textContent=48-session.alive.size;$('turns').textContent=session.turns_left;$('score').textContent=session.score;
    $('angle').textContent=(session.used*.5).toLocaleString('zh-CN',{maximumFractionDigits:1})+'°';$('budget').style.width=(session.used/240*100)+'%';
    $('mode').textContent=tutorial?'教学局':'正式局';
    const active=session.phase==='ACTIVE',ready=session.phase==='READY';
    $('primary').textContent=session.phase==='RESULT'?'查看结算':session.phase==='PAUSED'?'继续游戏':ready?'开始这一手':armed?'完成这一手':'继续这一手';
    $('left').disabled=$('right').disabled=!(active&&armed&&session.used<240);
    $('pass').disabled=!ready;$('pause').disabled=session.phase==='RESULT';
    $('skip').hidden=!tutorial||!hints||guide>=3;
    $('guide-label').textContent=tutorial&&hints&&guide<3?`教学 ${Math.min(guide+1,3)} / 3 · 收完48个光点`:'目标 · 12手收完48个光点';
    let hint;
    if(session.phase==='RESULT')hint=session.reason==='CLEAR'?'全部光点已收完。可以再试同局面，或换一份布局。':'12手已用完。剩余光点保留在场上，可以再试同局面。';
    else if(session.phase==='PAUSED')hint='局面与这一手的进展已保留。继续后重新开始操作。';
    else if(dead)hint='指针太靠近固定端。向外拖动，再接着转。';
    else if(active&&!armed)hint='这一手还没结束。重新抓绿色圆环，或点“继续这一手”。';
    else if(active&&session.used===240)hint=latch?'已用满120°。再点场地或点“完成这一手”。':'已用满120°。松手或点“完成这一手”，让另一端接力。';
    else if(tutorial&&hints&&guide===0)hint=active?(latch?'向下移动圆环扫光点，再点一下确认。':'向下拖圆环扫光点；用按钮操作时，按住“向右”。'):(settings.clickMode?'点绿色圆环抓取，向下移动扫光点，再点一下确认。也可点“开始这一手”。':'拖绿色圆环向下扫光点，松手换到另一端。也可点“开始这一手”。');
    else if(tutorial&&hints&&guide===1&&active)hint=latch?'收到了！再点一下或点“完成这一手”，让另一端接力。':'收到了！松手，另一端接力；用按钮时点“完成这一手”。';
    else if(tutorial&&hints&&guide===2)hint='共12手，看看下一端会落在哪里。再拖现在的绿色圆环，或点“开始这一手”。';
    else if(ready)hint=settings.clickMode?'点绿色圆环抓取，移动鼠标扫光点，再点一下确认。':'拖绿色圆环扫光点，松手换端；也可点“开始这一手”。';
    else hint=latch?'移动鼠标扫光点，再点一下确认。反向转也消耗角度。':'整根杆都能收点。松手或点“完成这一手”，就换到另一端。';
    $('hint').textContent=hint;
    $('feedback').textContent=performance.now()<noticeUntil?notice:'菱形端固定，圆环端可拖。';
    document.body.classList.toggle('reduced-motion',settings.reduced);updateSaveStatus();
  }
  function makeButton(text,handler,primaryButton=false){const b=document.createElement('button');b.textContent=text;b.className=primaryButton?'primary':'';b.addEventListener('click',()=>{unlockAudio();handler();});return b;}
  function paragraph(text){const p=document.createElement('p');p.textContent=text;return p;}
  function showPanel(kind,focusPanel=true) {
    overlayKind=kind;overlay.hidden=false;
    for(const node of document.querySelector('.game-inner').children)if(node!==overlay)node.inert=true;
    const content=$('panel-content');content.replaceChildren();confirmAction=kind==='confirm'?confirmAction:null;
    const close=$('panel-close');close.textContent=kind==='result'?'查看场地':'返回游戏';
    const buttons=document.createElement('div');buttons.className='panel-buttons';
    if(kind==='result') {
      $('panel-title').textContent=session.reason==='CLEAR'?'光点全部收完了':'这一局结束了';
      const summary=document.createElement('div');summary.className='result-summary';
      const score=document.createElement('div');score.className='large-score';score.textContent=session.score+' 分';
      const counts=document.createElement('span');counts.textContent=`已收 ${48-session.alive.size} / 48 · 剩余 ${session.alive.size}`;
      summary.append(score,counts);content.append(summary);
      content.append(paragraph(session.reason==='CLEAR'?`用了${12-session.turns_left}手，最后一个光点已收走。`:'12手已经用完。再试同一布局，可以改变每次停手的位置。'));
      content.append(paragraph(tutorial?'这是教学局，不计个人最佳。':`同局面、同操作方式的个人最佳：${best[bestKey()]||session.score}分。`));
      buttons.append(makeButton('再试同局面',()=>newSession(board,tutorial),true),makeButton('新局面',()=>newSession(R.generate(newSeed(),SweepBoards.fallback),false)));
    } else if(kind==='settings') {
      $('panel-title').textContent='设置';
      for(const [key,text] of [['muted','静音'],['reduced','减少运动'],['clickMode','点击抓取，再点确认']]) {
        const label=document.createElement('label'),span=document.createElement('span'),input=document.createElement('input');
        span.textContent=text;input.type='checkbox';input.checked=settings[key];input.addEventListener('change',()=>{settings[key]=input.checked;clearInput();update();scheduleSave();});label.append(span,input);content.append(label);
      }
      const label=document.createElement('label'),span=document.createElement('span'),select=document.createElement('select');span.textContent='按住旋转的速度';
      for(const [value,text] of [[30,'慢 · 30°/秒'],[60,'中 · 60°/秒'],[90,'快 · 90°/秒']]) {const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}
      select.value=settings.speed;select.addEventListener('change',()=>{settings.speed=Number(select.value);clearInput();scheduleSave();});label.append(span,select);content.append(label);
      buttons.append(makeButton('返回游戏',resume,true));
    } else if(kind==='menu') {
      $('panel-title').textContent='游戏菜单';
      buttons.append(makeButton('继续游戏',resume,true),makeButton('设置',()=>showPanel('settings')),makeButton('重玩这一局',()=>requestRestart('retry')),makeButton('新局面',()=>requestRestart('new')),makeButton('重看教学',()=>requestRestart('tutorial')),makeButton('导出局面与动作',exportRecord));
      if(tutorial&&hints&&guide<3)buttons.append(makeButton('跳过教学提示',()=>{hints=false;resume();scheduleSave();}));
      content.append(paragraph(tutorial?'当前是教学局，熟悉后可选择新局面。':'重玩保留光点位置；新局面会重新摆放光点。'));
    } else if(kind==='confirm') {
      $('panel-title').textContent='放弃这一局？';
      content.append(paragraph('重开会放弃当前进展，未结束的这一局不记个人最佳。'));
      buttons.append(makeButton('确认重开',()=>{const action=confirmAction;if(action==='retry')newSession(board,tutorial);else if(action==='tutorial')newSession(SweepBoards.tutorial,true);else newSession(R.generate(newSeed(),SweepBoards.fallback),false);},true),makeButton('保留进展，继续游戏',resume));
    } else {
      $('panel-title').textContent='已暂停';
      content.append(paragraph(session.previous_phase==='ACTIVE'?`这一手已转${session.used*.5}°，收点和分数都已保留。继续后重新抓圆环，或点“继续这一手”。`:'光点和扫杆位置已保留。可以继续这一局。'));
      buttons.append(makeButton('继续游戏',resume,true),makeButton('设置',()=>showPanel('settings')),makeButton('重玩这一局',()=>requestRestart('retry')));
    }
    content.append(buttons);content.scrollTop=0;
    if(focusPanel)requestAnimationFrame(()=>{const b=buttons.querySelector('button');if(b&&!overlay.hidden)b.focus({preventScroll:true});});
  }
  function hidePanel(){overlay.hidden=true;overlayKind='';for(const node of document.querySelector('.game-inner').children)node.inert=false;}
  function requestRestart(action){if(session.phase==='RESULT'){if(action==='retry')newSession(board,tutorial);else if(action==='tutorial')newSession(SweepBoards.tutorial,true);else newSession(R.generate(newSeed(),SweepBoards.fallback),false);return;}pause('pause');confirmAction=action;showPanel('confirm');}
  function exportRecord(){
    saveNow();const final=session.snapshot();for(const key of ['targets','seed','rules_version','board_hash'])delete final[key];
    const data={format:'SweepRelay-local-replay-1',build:'html-1902-1',rules_version:R.RULES_VERSION,generator_version:board.generator_version,board_codec:'sweep-js-board-1',board_hash:session.board_hash,seed:session.seed,targets:session.targets,actions:actions.map(a=>({...a})),input_assist_class:classKey(),tutorial,final};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='SweepRelay-'+session.board_hash.slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function unlockAudio(){if(settings.muted)return;try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch(e){}}
  function tone(kind,level=0){
    if(settings.muted||!audio||audio.state!=='running'||audioVoices>=8)return;
    const notes={begin:[330],collect:[440*2**(level/12)],relay:[520,780],pass:[240,360],boundary:[150],clear:[523,659,784],end:[440,330]};
    (notes[kind]||[330]).forEach((hz,i)=>{if(audioVoices>=8)return;const o=audio.createOscillator(),g=audio.createGain(),time=audio.currentTime+i*.045;o.type=kind==='boundary'?'triangle':'sine';o.frequency.value=hz;g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(.06,time+.006);g.gain.exponentialRampToValueAtTime(.001,time+.12);o.connect(g);g.connect(audio.destination);audioVoices++;o.start(time);o.stop(time+.14);o.onended=()=>{audioVoices--;o.disconnect();g.disconnect();};});
  }
  function pointFrom(e){const box=canvas.getBoundingClientRect();return [(e.clientX-box.left)*720/box.width,(e.clientY-box.top)*480/box.height];}
  const pointAngle=p=>Math.atan2(p[1]-session.a[1],p[0]-session.a[0])*180/Math.PI;
  function startPointer(e) {
    if(e.button!==0&&e.pointerType!=='touch')return;
    if(!overlay.hidden||!['READY','ACTIVE'].includes(session.phase)||capture)return;
    unlockAudio();canvas.focus({preventScroll:true});
    if(latch&&armed){execute('COMMIT');e.preventDefault();return;}
    const p=pointFrom(e),b=R.endpoint(session.a,session.angle);
    const radius=e.pointerType==='touch'?Math.max(24,22/scale):24;
    if(Math.hypot(p[0]-b[0],p[1]-b[1])>radius){flashNotice('请抓绿色圆环，或点“开始这一手”。');return;}
    clearInput();if(!arm(settings.clickMode&&e.pointerType!=='touch'?'click':'drag'))return;
    pointerAngle=pointAngle(p);pointerRemainder=0;dead=false;
    if(settings.clickMode&&e.pointerType!=='touch'){latch=true;}
    else {capture={id:e.pointerId,epoch};canvas.setPointerCapture(e.pointerId);}
    e.preventDefault();update();
  }
  function movePointer(e) {
    if(!armed||session.phase!=='ACTIVE'||(!latch&&(!capture||e.pointerId!==capture.id)))return;
    const p=pointFrom(e);
    if(Math.hypot(p[0]-session.a[0],p[1]-session.a[1])<14){dead=true;pointerAngle=null;pointerRemainder=0;update();return;}
    const angle=pointAngle(p);
    if(pointerAngle===null||dead){pointerAngle=angle;dead=false;pointerRemainder=0;update();return;}
    const delta=((angle-pointerAngle+540)%360)-180;pointerAngle=angle;
    if(Math.abs(delta)>90){pointerRemainder=0;flashNotice('移动跨度太大，已重新接住；接着缓慢转动。');return;}
    const units=delta*2+pointerRemainder;
    // Browser pointer coordinates can lose float precision at an exact half-degree.
    const k=Math.trunc(units+(units>=0?1e-4:-1e-4));pointerRemainder=units-k;
    if(k){const r=execute('ROTATE',k);if(r.applied_units!==k)pointerRemainder=0;}
    if(e.cancelable)e.preventDefault();
  }
  function endPointer(e){const current=capture;if(!current||e.pointerId!==current.id||current.epoch!==epoch)return;capture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(armed&&session.phase==='ACTIVE')execute('COMMIT');}
  canvas.addEventListener('pointerdown',startPointer);canvas.addEventListener('pointermove',movePointer);canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',e=>{if(capture&&e.pointerId===capture.id)pause();});
  canvas.addEventListener('lostpointercapture',()=>{if(capture)pause();});
  function startHold(sign,e){
    if(session.phase!=='ACTIVE'||!armed)return;
    unlockAudio();if(capture||latch){capture=null;latch=false;pointerAngle=null;}
    assist.add('stepped');held={sign,id:e.pointerId,target:e.currentTarget};held.target.setPointerCapture(e.pointerId);
    repeatStart=performance.now()+220;repeatRemainder=0;execute('ROTATE',sign);e.preventDefault();
  }
  for(const [id,sign] of [['left',-1],['right',1]]) {
    const b=$(id);b.addEventListener('pointerdown',e=>startHold(sign,e));
    b.addEventListener('pointerup',e=>{if(held&&held.id===e.pointerId){held=null;repeatRemainder=0;}});
    b.addEventListener('pointercancel',()=>{held=null;repeatRemainder=0;});
    b.addEventListener('click',e=>{if(e.detail===0&&armed&&session.phase==='ACTIVE')execute('ROTATE',sign);});
  }
  $('primary').addEventListener('click',primary);$('pass').addEventListener('click',()=>{unlockAudio();execute('PASS');});
  $('pause').addEventListener('click',()=>pause());$('menu').addEventListener('click',()=>pause('menu'));
  $('skip').addEventListener('click',()=>{hints=false;update();scheduleSave();});
  $('panel-close').addEventListener('click',()=>{if(session.phase==='RESULT'){hidePanel();canvas.focus({preventScroll:true});update();}else resume();});
  game.addEventListener('keydown',e=>{
    if(e.target.matches('input,select,textarea'))return;
    if(e.key==='Tab'&&!overlay.hidden){const focusables=[...overlay.querySelectorAll('button,input,select')].filter(x=>!x.disabled);const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
    if(e.key==='Escape'){e.preventDefault();if(e.repeat)return;if(overlay.hidden)pause();else if(session.phase==='RESULT'){hidePanel();update();}else resume();return;}
    if(!overlay.hidden){if((e.key==='r'||e.key==='R')&&session.phase==='RESULT'){e.preventDefault();if(!e.repeat)newSession(board,tutorial);}return;}
    if(['r','R'].includes(e.key)){e.preventDefault();if(!e.repeat)requestRestart('retry');return;}
    if(e.code==='Space') {if(e.target.closest('button'))return;e.preventDefault();if(!e.repeat)primary();return;}
    if(['ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();if(e.repeat||keys.has(e.key))return;
      if(session.phase!=='ACTIVE'||!armed){flashNotice('先点“开始这一手”或“继续这一手”，再转动。');return;}
      unlockAudio();capture=null;latch=false;pointerAngle=null;held=null;assist.add('stepped');keys.add(e.key);
      repeatStart=performance.now()+220;repeatRemainder=0;execute('ROTATE',e.key==='ArrowRight'?1:-1);
    }
  });
  document.addEventListener('keyup',e=>{keys.delete(e.key);if(!keys.size)repeatRemainder=0;});
  document.addEventListener('pointerdown',e=>{if(!game.contains(e.target)&&session.phase!=='RESULT')pause('pause',false);},true);
  game.addEventListener('focusout',e=>{if(e.relatedTarget&&!game.contains(e.relatedTarget)&&session.phase!=='RESULT')pause('pause',false);});
  window.addEventListener('blur',()=>{if(session.phase!=='RESULT')pause('pause',false);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&session.phase!=='RESULT')pause('pause',false);});
  window.addEventListener('scroll',()=>{if(window.scrollY>game.offsetTop+24&&session.phase!=='PAUSED'&&session.phase!=='RESULT')pause('pause',false);},{passive:true});
  window.addEventListener('pagehide',()=>{clearInput();if(session.phase!=='PAUSED'&&session.phase!=='RESULT')execute('PAUSE');saveNow();});
  window.addEventListener('beforeunload',e=>{if(!saveNow()){e.preventDefault();e.returnValue='';}});
  function resize() {
    const stage=$('stage'),width=Math.max(1,Math.min(stage.clientWidth,stage.clientHeight*1.5)),height=width/1.5;
    canvas.style.width=width+'px';canvas.style.height=height+'px';const dpr=Math.min(devicePixelRatio||1,3);
    canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));scale=width/720;
    if(capture||latch){clearInput();if(session.phase==='ACTIVE')flashNotice('画面尺寸已改变，重新抓圆环或点“继续这一手”。');}
    draw(performance.now());
  }
  new ResizeObserver(resize).observe($('stage'));
  function circle(x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);}
  function label(text,p,color) {
    const size=11/scale,width=text.length*size+12/scale,height=20/scale;
    const candidates=[[p[0]+28,p[1]-40],[p[0]-width-20,p[1]-40],[p[0]+28,p[1]+20],[p[0]-width-20,p[1]+20],[p[0]-width/2,p[1]-70/scale]];
    let pos,lowest=Infinity;
    for(const candidate of candidates){const x=Math.max(4,Math.min(716-width,candidate[0])),y=Math.max(4,Math.min(476-height,candidate[1]));const cost=session.targets.filter(t=>session.alive.has(t.id)&&t.x>x-10&&t.x<x+width+10&&t.y>y-10&&t.y<y+height+10).length;if(cost<lowest){pos=[x,y];lowest=cost;}}
    ctx.font=`600 ${size}px sans-serif`;ctx.textBaseline='middle';ctx.fillStyle='#fafcfb';ctx.fillRect(pos[0],pos[1],width,height);ctx.fillStyle=color;ctx.fillText(text,pos[0]+6/scale,pos[1]+height/2);
    ctx.strokeStyle=color;ctx.lineWidth=1/scale;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(pos[0]+width/2,pos[1]+height/2);ctx.stroke();
  }
  function draw(time) {
    if(!session)return;
    ctx.setTransform(canvas.width/720,0,0,canvas.height/480,0,0);ctx.clearRect(0,0,720,480);ctx.fillStyle='#fafcfb';ctx.fillRect(0,0,720,480);
    ctx.strokeStyle='#e9eeeb';ctx.lineWidth=.7/scale;
    ctx.beginPath();for(let x=40;x<720;x+=40){ctx.moveTo(x,0);ctx.lineTo(x,480);}for(let y=40;y<480;y+=40){ctx.moveTo(0,y);ctx.lineTo(720,y);}ctx.stroke();
    if(!settings.reduced){trails=trails.filter(t=>time-t.time<400);for(const t of trails){ctx.beginPath();ctx.moveTo(...t.a);ctx.arc(t.a[0],t.a[1],120,t.angle*Math.PI/360,(t.angle+t.k)*Math.PI/360,t.k<0);ctx.closePath();ctx.fillStyle=`rgba(0,126,112,${.12*(1-(time-t.time)/400)})`;ctx.fill();}}
    for(const t of session.targets)if(session.alive.has(t.id)){
      circle(t.x,t.y,8);ctx.fillStyle='#fce5d3';ctx.fill();circle(t.x,t.y,5);ctx.fillStyle='#ee9649';ctx.fill();ctx.strokeStyle='#b14c1c';ctx.lineWidth=1;ctx.stroke();circle(t.x,t.y,1.6);ctx.fillStyle='#873917';ctx.fill();
    }
    if(!settings.reduced){bursts=bursts.filter(t=>time-t.time<300);for(const t of bursts){const f=(time-t.time)/300;circle(t.x,t.y,6+f*14);ctx.strokeStyle=`rgba(205,87,27,${1-f})`;ctx.lineWidth=2;ctx.stroke();}}
    const a=session.a,b=R.endpoint(a,session.angle);
    if(session.phase==='ACTIVE'||(session.phase==='PAUSED'&&session.previous_phase==='ACTIVE')){ctx.beginPath();ctx.arc(a[0],a[1],26,0,session.used/240*Math.PI*2);ctx.strokeStyle='#5bac92';ctx.lineWidth=2/scale;ctx.stroke();}
    ctx.lineCap='round';ctx.strokeStyle='#29454a';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
    ctx.strokeStyle='#92b5a4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
    const diamond=Math.max(8,5/scale);ctx.fillStyle='#263c42';ctx.beginPath();ctx.moveTo(a[0],a[1]-diamond);ctx.lineTo(a[0]+diamond,a[1]);ctx.lineTo(a[0],a[1]+diamond);ctx.lineTo(a[0]-diamond,a[1]);ctx.closePath();ctx.fill();ctx.strokeStyle='#fafcfb';ctx.lineWidth=1/scale;ctx.stroke();
    const ring=Math.max(12,8/scale);circle(b[0],b[1],ring);ctx.fillStyle='#fafcfb';ctx.fill();ctx.strokeStyle='#007e70';ctx.lineWidth=2.5/scale;ctx.stroke();circle(b[0],b[1],3);ctx.fillStyle='#007e70';ctx.fill();
    if(session.phase!=='RESULT'){circle(b[0],b[1],Math.max(24,14/scale));ctx.setLineDash([3/scale,4/scale]);ctx.strokeStyle=armed?'#4fa98d':'#84b6a3';ctx.lineWidth=1/scale;ctx.stroke();ctx.setLineDash([]);}
    if(!settings.reduced&&time-relayTime<230){circle(a[0],a[1],diamond+(time-relayTime)/12);ctx.strokeStyle=`rgba(0,126,112,${1-(time-relayTime)/230})`;ctx.lineWidth=2/scale;ctx.stroke();}
    if(time-boundaryTime<800){ctx.strokeStyle='#b54246';ctx.lineWidth=3/scale;ctx.strokeRect(1.5/scale,1.5/scale,720-3/scale,480-3/scale);}
    if(tutorial&&hints&&guide===0){label('固定端',a,'#52676b');label('拖这里',b,'#007e70');}
  }
  function frame(time) {
    const dt=Math.min(50,time-(lastTime||time));lastTime=time;
    if(session.phase==='ACTIVE'&&armed&&overlay.hidden&&time>=repeatStart) {
      let sign=held?held.sign:((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0));
      if(sign){repeatRemainder+=dt*settings.speed*2/1000;const steps=Math.floor(repeatRemainder);repeatRemainder-=steps;if(steps)execute('ROTATE',sign*steps);}
    }
    if(notice&&time>=noticeUntil){notice='';update();}
    draw(time);requestAnimationFrame(frame);
  }
  // Read-only inspection is used by local verification; it cannot play or alter a session.
  window.SweepDemo=Object.freeze({inspect:()=>({state:session.snapshot(),board:{...board,targets:board.targets.map(t=>({...t}))},tutorial,guide,armed,capture:!!capture,latch,assist:classKey(),actions:actions.map(a=>({...a})),settings:{...settings},storage_generation:store.generation,storage_available:store.available})});
  update();resize();requestAnimationFrame(frame);
  if(session.phase==='RESULT')showPanel('result');else if(session.phase==='PAUSED')showPanel('pause');
  else canvas.focus({preventScroll:true});
})();
