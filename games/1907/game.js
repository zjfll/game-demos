(() => {
  'use strict';
  const {Session,Geometry:G,P,DT,LAYOUTS}=PivotBreak;
  const $=s=>document.querySelector(s),game=$('#game'),stage=$('#stage'),canvas=$('#board'),ctx=canvas.getContext('2d'),overlay=$('#overlay'),panel=$('#panel');
  const storeKey='pivot-break-1907-demo-v1-settings';
  let settings={sound:true,shake:true,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,brakeToggle:false};
  try{const s=JSON.parse(localStorage.getItem(storeKey)||'null');if(s&&typeof s==='object')for(const key of Object.keys(settings))if(typeof s[key]==='boolean')settings[key]=s[key];}catch{}
  let session=new Session(),mode='welcome',lastEvent=0,fx=[],trail=[],shake=0,labelUntil=0,screenScale=1,prev=performance.now(),accumulator=0,holdBrake=false,selected='open',lastPad=null,padEdges={},padReleaseGate=false,audioCtx=null;
  const sources={left:new Set(),right:new Set(),swap:new Set(),brake:new Set()},physicalKeys=new Set(),physicalPointers=new Set();let releaseGate=false,menuReturn='welcome';
  const mapping={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'swap',ShiftLeft:'brake',ShiftRight:'brake'};
  function focusGame(){game.focus({preventScroll:true});}
  function clearInput(){for(const set of Object.values(sources))set.clear();holdBrake=false;session.buffer=null;padReleaseGate=lastPad!==null;$('.controls').querySelectorAll('button').forEach(b=>b.classList.remove('pressed'));}
  function sound(type){
    if(!settings.sound||!audioCtx)return;
    const table={swap:[380,.06,'triangle'],slow:[180,.055,'triangle'],blocked:[120,.07,'triangle'],wall:[110,.06,'triangle'],shield:[100,.10,'square'],impact:[120,.15,'triangle'],unlock:[620,.20,'sine'],damage:[90,.20,'sawtooth'],warning:[760,.10,'sine'],spike:[150,.14,'triangle'],chain:[240,.12,'triangle']};
    if(!table[type])return;const [freq,duration,wave]=table[type],at=audioCtx.currentTime,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=wave;osc.frequency.setValueAtTime(freq,at);osc.frequency.exponentialRampToValueAtTime(freq*(type==='unlock'?1.8:.55),at+duration);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.07,at+.005);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start(at);osc.stop(at+duration+.01);
  }
  function unlockAudio(){try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();}catch{}}
  function saveSettings(){try{localStorage.setItem(storeKey,JSON.stringify(settings));return true;}catch{return false;}}
  function message(text,time=1.4){$('#impactLabel').textContent=text;labelUntil=performance.now()+time*1000;}
  function button(text,callback,cls=''){const b=document.createElement('button');b.textContent=text;b.className=cls;b.addEventListener('click',e=>{e.stopPropagation();unlockAudio();callback();});return b;}
  function panelBase(kicker,title,text){panel.replaceChildren();const k=document.createElement('span');k.className='kicker';k.textContent=kicker;const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=text;panel.append(k,h,p);overlay.hidden=false;}
  function actions(...items){const div=document.createElement('div');div.className='actions';items.forEach(x=>div.append(x));panel.append(div);}
  function start(layout=selected,tutorial=false){selected=layout;session=new Session(layout,tutorial);lastEvent=0;fx=[];trail=[];accumulator=0;prev=performance.now();mode='playing';overlay.hidden=true;clearInput();releaseGate=physicalKeys.size>0||physicalPointers.size>0;focusGame();updateHUD();}
  function welcome(){
    mode='welcome';session.pause();panelBase('双端杆 / 三个封锁器','把摆动变成前进','实心端固定，空心端绕它转。按一次“换轴”，两端原地交换角色；再转动，身体才会前进。');
    actions(button('开始短教学',()=>start(selected,true),'primary main-action'),button('直接试炼',()=>start(selected),'secondary'));
    const p=document.createElement('p');p.className='fine';p.textContent='试炼目标：高速端击拆掉 3 个封锁器，再整杆进入出口。键盘 A / D 转动，空格换轴，Shift 制动；也可按下方按钮。';panel.append(p);
  }
  function pause(reason='已暂停'){if(mode!=='playing')return;session.pause();clearInput();releaseGate=physicalKeys.size>0||physicalPointers.size>0;mode='paused';accumulator=0;panelBase('局面已保留',reason,'继续后重新按下转向或换轴。按住的动作不会自动执行。');actions(button('继续这一局',resume,'primary main-action'),button(session.tutorial?'重看这一段':'重玩这一局',()=>{const part=session.step;start(session.layout.id,session.tutorial);if(session.tutorial)session.setupTutorial(part);},'secondary'));}
  function resume(){session.resume();mode='playing';overlay.hidden=true;clearInput();releaseGate=physicalKeys.size>0||physicalPointers.size>0;accumulator=0;prev=performance.now();focusGame();}
  function closeSettings(){if(menuReturn==='welcome')welcome();else if(session.status==='playing')resume();else if(session.status==='lesson-done')lessonDone();else result();}
  function showSettings(){
    if(mode!=='settings')menuReturn=mode;if(mode==='playing'){session.pause();clearInput();}
    mode='settings';panelBase('试验台菜单','设置与选台','三张台面的规则相同。更换台面会开始新的一局。');
    actions(button(session.tutorial?'跳过教学，开始试炼':'开始所选台面',()=>start(selected),'primary'),button('重看教学',()=>start(selected,true),'secondary'));
    const label=document.createElement('label');label.textContent='试炼台面';const select=document.createElement('select');select.setAttribute('aria-label','试炼台面');LAYOUTS.forEach(l=>{const o=document.createElement('option');o.value=l.id;o.textContent=l.name;select.append(o);});select.value=selected;select.addEventListener('change',()=>selected=select.value);label.append(select);panel.append(label);
    [['sound','音效'],['shake','轻微震动'],['reduced','减少运动（关闭尾迹与碎片）'],['brakeToggle','制动按一次开 / 关']].forEach(([key,text])=>{const label=document.createElement('label');label.textContent=text;const input=document.createElement('input');input.type='checkbox';input.checked=settings[key];input.addEventListener('change',()=>{settings[key]=input.checked;if(!saveSettings())message('设置本次有效，浏览器未允许保存');});label.append(input);panel.append(label);});
    if(session.tutorial){const row=document.createElement('div');row.className='actions';['摆动','换轴','撞击'].forEach((name,index)=>row.append(button('练习'+name,()=>{start(selected,true);session.setupTutorial(index);updateHUD();})));panel.append(row);}
    panel.append(button(menuReturn==='welcome'?'返回开始':session.status==='playing'?'返回这一局':'返回结果',closeSettings,'back'));
  }
  function result(){
    clearInput();mode='result';const win=session.status==='cleared';
    panelBase(win?'试炼完成':'试炼结束',win?'封锁已拆，整杆离场':'钉击耗尽了生命',win?'三个封锁器已拆掉，整杆已离场。重玩同一台面，可以试不同路线。':'钉击命中了身体。下次换轴后继续摆动，让整杆离开橙圈。');
    const div=document.createElement('div');div.className='results';for(const [label,value]of [['用时',formatTime(session.realTime)],['受击',session.hits+' 次'],['拆锁',(3-session.snapshot().remaining)+' / 3']]){const d=document.createElement('span');d.textContent=label;const s=document.createElement('strong');s.textContent=value;d.append(s);div.append(d);}panel.append(div);
    actions(button('重玩这一局',()=>start(session.layout.id),'primary main-action'),button('换个台面',showSettings,'secondary'));
  }
  function lessonDone(){mode='lesson-done';clearInput();panelBase('三段短教学完成','现在去拆开封锁','你已转动、换轴移出旧落点，并打出了高速冲击。试炼里有三个封锁器，钉击器会重复预告落点。');actions(button('进入试炼',()=>start(selected),'primary main-action'),button('重看教学',()=>start(selected,true),'secondary'));}
  function formatTime(t){const s=Math.floor(t);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
  function active(){return mode==='playing'&&!session.paused&&!releaseGate;}
  function actionDown(action,id){
    if(!active()||sources[action].has(id))return;sources[action].add(id);if(action==='swap'&&sources.swap.size===1)session.requestSwap(session.realTime+Math.max(0,(performance.now()-prev)/1000));if(action==='brake'&&settings.brakeToggle&&sources.brake.size===1)holdBrake=!holdBrake;
    syncButtons();
  }
  function actionUp(action,id){sources[action].delete(id);syncButtons();}
  function syncButtons(){for(const b of $('.controls').querySelectorAll('button'))b.classList.toggle('pressed',sources[b.dataset.action].size>0||(b.dataset.action==='brake'&&holdBrake));}
  document.addEventListener('keydown',e=>{
    const inside=game.contains(document.activeElement);if(!inside)return;
    if(e.code==='Escape'){e.preventDefault();if(e.repeat)return;if(mode==='playing')pause();else if(mode==='paused')resume();else if(mode==='settings')closeSettings();return;}
    if(e.code==='Enter'&&!e.repeat&&mode==='result'&&document.activeElement===game){e.preventDefault();start(session.layout.id);return;}
    const action=mapping[e.code];if(!action)return;
    physicalKeys.add(e.code);
    if(mode!=='playing'||overlay.hidden===false){if(e.repeat&&game.getBoundingClientRect().top>=-28)e.preventDefault();return;}
    e.preventDefault();if(e.repeat||releaseGate)return;actionDown(action,'key:'+e.code);
  });
  document.addEventListener('keyup',e=>{physicalKeys.delete(e.code);const action=mapping[e.code];if(action)actionUp(action,'key:'+e.code);if(physicalKeys.size===0&&physicalPointers.size===0)releaseGate=false;});
  for(const b of $('.controls').querySelectorAll('button')){
    b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();focusGame();unlockAudio();physicalPointers.add(e.pointerId);b.setPointerCapture(e.pointerId);actionDown(b.dataset.action,'pointer:'+e.pointerId);});
    const release=e=>{physicalPointers.delete(e.pointerId);actionUp(b.dataset.action,'pointer:'+e.pointerId);if(!physicalKeys.size&&!physicalPointers.size)releaseGate=false;};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);b.addEventListener('contextmenu',e=>e.preventDefault());
  }
  canvas.addEventListener('pointerdown',()=>{focusGame();unlockAudio();});
  $('#pause').addEventListener('click',()=>{unlockAudio();if(mode==='playing')pause();else if(mode==='paused')resume();});
  $('#menu').addEventListener('click',()=>{unlockAudio();showSettings();});
  overlay.addEventListener('pointerdown',e=>e.stopPropagation());
  window.addEventListener('blur',()=>{pause('离开窗口，已暂停');physicalKeys.clear();physicalPointers.clear();clearInput();releaseGate=false;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('切到后台，已暂停');});
  window.addEventListener('scroll',()=>{if(game.getBoundingClientRect().top< -28)pause('正在阅读说明，已暂停');},{passive:true});
  document.addEventListener('focusin',e=>{if(!game.contains(e.target))pause('操作已离开游戏，已暂停');});
  function pollPad(){
    const pads=navigator.getGamepads?navigator.getGamepads():[],pad=Array.from(pads).find(p=>p&&p.connected);if(lastPad!==null&&!pad){pause('手柄已断开，已暂停');lastPad=null;padEdges={};}
    if(!pad)return;lastPad=pad.index;const vals={swap:!!pad.buttons[5]?.pressed,brake:!!pad.buttons[4]?.pressed,pause:!!pad.buttons[9]?.pressed,confirm:!!pad.buttons[0]?.pressed,back:!!pad.buttons[1]?.pressed,up:!!pad.buttons[12]?.pressed,down:!!pad.buttons[13]?.pressed,left:!!pad.buttons[14]?.pressed,right:!!pad.buttons[15]?.pressed};
    if(vals.pause&&!padEdges.pause){if(mode==='playing')pause();else if(mode==='paused')resume();}
    if(mode!=='playing'){
      if(game.getBoundingClientRect().top>=-28){
        const items=[...panel.querySelectorAll('button,input,select')];if(mode==='paused')items.push($('#menu'));
        const rising=k=>vals[k]&&!padEdges[k],focused=document.activeElement;
        if((rising('left')||rising('right'))&&focused.tagName==='SELECT'){
          focused.selectedIndex=(focused.selectedIndex+(rising('right')?1:-1)+focused.options.length)%focused.options.length;focused.dispatchEvent(new Event('change',{bubbles:true}));
        }else if(rising('up')||rising('down')||rising('left')||rising('right')){
          const delta=rising('up')||rising('left')?-1:1,index=items.indexOf(focused),next=items[(index+delta+items.length)%items.length];
          if(next){next.focus({preventScroll:true});if(panel.contains(next)){const b=next.getBoundingClientRect(),p=panel.getBoundingClientRect();if(b.bottom>p.bottom-8)panel.scrollTop+=b.bottom-p.bottom+8;if(b.top<p.top+8)panel.scrollTop-=p.top+8-b.top;}}
        }
        if(rising('confirm')){const target=items.includes(document.activeElement)?document.activeElement:items[0];if(target){target.focus({preventScroll:true});if(target.tagName!=='SELECT')target.click();}}
        if(rising('back')){if(mode==='settings')closeSettings();else if(mode==='paused')resume();}
      }
      padEdges=vals;return;
    }
    if(!game.contains(document.activeElement)||!active()){padEdges=vals;return;}
    if(padReleaseGate){padEdges=vals;if(Math.abs(pad.axes[0]||0)>.2||vals.swap||vals.brake)return;padReleaseGate=false;}
    if(vals.swap&&!padEdges.swap)session.requestSwap(session.realTime+Math.max(0,(performance.now()-prev)/1000));if(settings.brakeToggle&&vals.brake&&!padEdges.brake)holdBrake=!holdBrake;
    const x=pad.axes[0]||0;padEdges=vals;return {axis:Math.abs(x)<.2?0:Math.sign(x)*(Math.abs(x)-.2)/.8,brake:vals.brake};
  }
  function updateHUD(){
    const s=session.snapshot(),tutorial=session.tutorial;
    $('#health').textContent=tutorial?'练习 · 不计成绩':`生命 ${s.health} / 3`;
    $('#objective').textContent=tutorial?'先学摆动、换轴和高速撞击':s.remaining?`封锁器 ${3-s.remaining} / 3 · 拆完后进入出口`:'封锁已拆 · 把整根杆移进蓝色出口';
    $('#fieldTag').textContent=tutorial?'练习台 · 可跳过 / 重看':`${session.layout.name} · 固定局面`;
    const speed=Math.round(Math.abs(session.motor.omega)*P.length);$('#speed').textContent=speed>=320?`端速 ${speed} · 可强击`:speed?`端速 ${speed} · 轻推`:'静止 · 按住转动';
    $('#speed').style.color=speed>=320?'#b34e2a':'';
    if(tutorial){
      $('#stepTag').textContent=`教学 ${s.step+1} / 3`;
      $('#hint').textContent=s.step===0?'按住“顺转”或“逆转”，让空心端沿弧线摆动。':s.step===1?(session.teachSwapped?'两端仍在原位。继续按住转动，让整根杆离开旧脚印的虚线圈。':'按一次“换轴”。空心端会固定，但身体不会挪动；接着转动移出虚线圈。'):session.teachStrong?'橙色虚线圈即将落钉。换轴并继续转动，让整根杆离开圈；只换轴躲不开。':session.teachSlow?'轻推已观察，测试物已复位。现在按住顺转加速，用空心端高速撞开它。':'先轻点“顺转”，观察慢碰只会轻推。';
    }else{$('#stepTag').textContent=s.remaining?'拆开封锁':'前往出口';$('#hint').textContent=s.remaining?'按住转动加速，用空心端撞带数字的封锁器；换轴后再转动，才能接近下一个。':'出口已打开。用摆动与换轴把两端和整根杆都移进蓝色区域。';}
    $('#pause').textContent=mode==='paused'?'继续':'暂停';
  }
  function consumeEvents(){
    for(const e of session.events){if(e.id<=lastEvent)continue;lastEvent=e.id;sound(e.type);
      if(e.point)fx.push({...e,age:0});
      const labels={swap:'换轴：身体位置不变',slow:'轻推 · 加速后用活动端撞',blocked:'被挡住了 · 反向转动或换轴',wall:'碰墙止转 · 可反向或换轴',shield:'盾面挡住了 · 从侧后撞',impact:'高速击退',unlock:'封锁器已拆开',damage:'钉击命中身体 · '+session.health+' 次生命',warning:'橙圈即将落钉 · 转走整根杆',chain:'二次撞击 · 冲力减弱',diagnostic:'接触求解已安全停下 · 请反向或换轴', 'lesson-retry':'还在落点里 · 重试这一段', 'practice-reset':'慢碰只轻推 · 测试物已复位'};
      if(labels[e.type])message(labels[e.type],e.type==='warning'?1.8:1.25);
      if(['impact','unlock','damage'].includes(e.type))shake=.15;
      if(e.type==='cleared'||e.type==='failed')result();if(e.type==='lesson-done')lessonDone();
    }
  }
  function resize(){const w=stage.clientWidth,h=stage.clientHeight,scale=Math.min(w/1280,h/720);screenScale=scale;const cw=Math.max(1,1280*scale),ch=Math.max(1,720*scale),dpr=Math.min(devicePixelRatio||1,3);canvas.style.width=cw+'px';canvas.style.height=ch+'px';canvas.width=Math.round(cw*dpr);canvas.height=Math.round(ch*dpr);draw();}
  new ResizeObserver(resize).observe(stage);window.addEventListener('resize',resize);
  function circle(p,r,fill,stroke,width=2){ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}}
  function path(poly,fill,stroke,width=2){ctx.beginPath();ctx.moveTo(poly[0].x,poly[0].y);poly.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
  function text(str,x,y,size=22,color='#345554',align='left',bold=false){ctx.font=`${bold?'700':'500'} ${Math.max(size,11/Math.max(.15,screenScale))}px system-ui, sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(str,x,y);}
  function draw(){
    if(!canvas.width)return;ctx.setTransform(canvas.width/1280,0,0,canvas.height/720,0,0);ctx.clearRect(0,0,1280,720);ctx.fillStyle='#dbe5df';ctx.fillRect(0,0,1280,720);
    ctx.save();if(shake>0&&settings.shake&&!settings.reduced)ctx.translate(Math.sin(performance.now()*.13)*3,Math.cos(performance.now()*.09)*2);
    ctx.fillStyle='#eef1e6';ctx.fillRect(80,96,1120,560);ctx.strokeStyle='#becac0';ctx.lineWidth=2;ctx.strokeRect(80,96,1120,560);
    ctx.strokeStyle='#dce3d7';ctx.lineWidth=1;for(let x=96;x<1200;x+=32){ctx.beginPath();ctx.moveTo(x,96);ctx.lineTo(x,656);ctx.stroke();}for(let y=112;y<656;y+=32){ctx.beginPath();ctx.moveTo(80,y);ctx.lineTo(1200,y);ctx.stroke();}
    for(const p of [G.v(59,75),G.v(1221,75),G.v(59,677),G.v(1221,677)]){circle(p,8,'#a5b5aa','#819c8e');ctx.strokeStyle='#e4ebe2';ctx.beginPath();ctx.moveTo(p.x-4,p.y);ctx.lineTo(p.x+4,p.y);ctx.stroke();}
    const q=G.pose(session.motor),remaining=session.snapshot().remaining;
    if(!session.tutorial){const ex=session.layout.exit;ctx.fillStyle=remaining?'#dde6de':'#b8dce0';ctx.fillRect(ex.x,ex.y,ex.w,ex.h);ctx.strokeStyle=remaining?'#9fb6ab':'#268397';ctx.lineWidth=3;ctx.setLineDash(remaining?[9,7]:[]);ctx.strokeRect(ex.x,ex.y,ex.w,ex.h);ctx.setLineDash([]);text(remaining?'出口待开':'出口',ex.x+ex.w/2,ex.y+ex.h/2,28,remaining?'#768d82':'#136779','center',true);}
    for(const o of session.obstacles.filter(o=>!o.id.startsWith('wall'))){path(o.poly,'#c0cec4','#607d6f',3);const p=o.poly;ctx.strokeStyle='#e4ebe0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p[0].x+8,p[0].y+8);ctx.lineTo(p[1].x-8,p[1].y+8);ctx.stroke();}
    if(session.tutorial&&session.step===0){ctx.strokeStyle='#94b9b5';ctx.lineWidth=3;ctx.setLineDash([8,8]);ctx.beginPath();ctx.arc(q.a.x,q.a.y,72,-1.4,1.4);ctx.stroke();ctx.setLineDash([]);text('按住转动',q.a.x+160,q.a.y,27,'#357e83','center',true);}
    if(session.tutorial&&session.step===1){circle(session.teachStart,52,'#d6e4e020','#61a4a3',3);ctx.setLineDash([6,6]);ctx.strokeStyle='#87a7a0';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(430,390);ctx.lineTo(502,390);ctx.stroke();ctx.setLineDash([]);text('旧落点',430,300,25,'#4a8482','center');}
    for(const h of session.hazards){const active=h.active,t=G.len(G.sub(q.a,h.pos));circle(h.pos,h.r,active?'#e89e6b88':'#f6ae7530','#d26635',3);ctx.save();ctx.beginPath();ctx.arc(h.pos.x,h.pos.y,h.r,0,Math.PI*2);ctx.clip();ctx.strokeStyle=active?'#c65228':'#d7895290';ctx.lineWidth=active?4:2;for(let x=h.pos.x-100;x<h.pos.x+100;x+=13){ctx.beginPath();ctx.moveTo(x,h.pos.y-60);ctx.lineTo(x+100,h.pos.y+60);ctx.stroke();}ctx.restore();if(!active){ctx.setLineDash([9,7]);circle(h.pos,h.r+6,null,'#d26a32',3);ctx.setLineDash([]);const progress=G.clamp?G.clamp(1-(h.starts-session.ruleTime)/.9,0,1):Math.max(0,Math.min(1,1-(h.starts-session.ruleTime)/.9));circle(h.pos,Math.max(4,h.r*(1-progress)),null,'#c8602c',2);}else{ctx.strokeStyle='#9b391b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(h.pos.x-10,h.pos.y-10);ctx.lineTo(h.pos.x+10,h.pos.y+10);ctx.moveTo(h.pos.x+10,h.pos.y-10);ctx.lineTo(h.pos.x-10,h.pos.y+10);ctx.stroke();}}
    for(const e of session.entities){
      if(e.dead&&session.ruleTime>e.wreckUntil){if(e.kind==='lock'){circle(e.pos,23,null,'#a2c0ae',2);ctx.strokeStyle='#75a797';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(e.pos.x-9,e.pos.y);ctx.lineTo(e.pos.x-2,e.pos.y+7);ctx.lineTo(e.pos.x+10,e.pos.y-8);ctx.stroke();}continue;}
      ctx.save();ctx.translate(e.pos.x,e.pos.y);ctx.globalAlpha=e.dead?.5:1;
      if(e.kind==='lock'){circle(G.v(),22,'#c5683a','#7f432d',3);circle(G.v(),14,'#e0a371','#efcf99',2);text(String(e.number),0,0,24,'#3d352b','center',true);for(let i=0;i<4;i++){const a=i*Math.PI/2;circle(G.v(Math.cos(a)*29,Math.sin(a)*29),3,'#9b724d');}}
      else if(e.kind==='pin'){circle(G.v(),19,'#365554','#173e43',3);ctx.strokeStyle='#eff0d9';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.moveTo(0,-8);ctx.lineTo(0,8);ctx.stroke();if(e.phase==='telegraph')circle(G.v(),27,null,'#ce6936',3);}
      else if(e.kind==='shield'){circle(G.v(),25,'#506965','#294942',2);ctx.rotate(e.facing);ctx.strokeStyle='#153f49';ctx.lineWidth=12;ctx.beginPath();ctx.arc(0,0,19,-1.35,1.35);ctx.stroke();ctx.strokeStyle='#dce5d4';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,19,-1.35,1.35);ctx.stroke();ctx.fillStyle='#9bccc4';ctx.beginPath();ctx.moveTo(-28,-8);ctx.lineTo(-13,0);ctx.lineTo(-28,8);ctx.closePath();ctx.fill();if(e.phase==='telegraph'){ctx.strokeStyle='#95af9e';ctx.setLineDash([8,7]);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(35,0);ctx.lineTo(78,0);ctx.stroke();ctx.setLineDash([]);}}
      else{circle(G.v(),19,'#6c8681','#365751',3);ctx.strokeStyle='#d4e0cd';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,-8);ctx.lineTo(8,8);ctx.moveTo(8,-8);ctx.lineTo(-8,8);ctx.stroke();}
      ctx.restore();
    }
    if(!settings.reduced){for(let i=0;i<trail.length;i++){const p=trail[i];circle(p,5,'#51a2a4'+Math.round((i/trail.length)*90).toString(16).padStart(2,'0'));}}
    if(session.ruleTime<session.protectUntil){ctx.strokeStyle='#248e9c';ctx.lineWidth=23;ctx.setLineDash([7,6]);ctx.beginPath();ctx.moveTo(q.A.x,q.A.y);ctx.lineTo(q.B.x,q.B.y);ctx.stroke();ctx.setLineDash([]);circle(q.A,19,null,'#248e9c',2);circle(q.B,19,null,'#248e9c',2);}
    ctx.lineCap='round';ctx.strokeStyle='#1f464a';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(q.A.x,q.A.y);ctx.lineTo(q.B.x,q.B.y);ctx.stroke();ctx.strokeStyle='#bad0c7';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(q.A.x,q.A.y);ctx.lineTo(q.B.x,q.B.y);ctx.stroke();
    for(const [id,p]of [['A',q.A],['B',q.B]]){circle(p,14,id===session.motor.fixed?'#1e7887':'#f5f5df','#1c515d',3);if(id==='A'){ctx.strokeStyle=id===session.motor.fixed?'#e1ead2':'#367a80';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-5,p.y-4);ctx.lineTo(p.x+5,p.y-4);ctx.moveTo(p.x-5,p.y+4);ctx.lineTo(p.x+5,p.y+4);ctx.stroke();}else circle(p,5,id===session.motor.fixed?'#e1ead2':null,'#327886',2);}
    circle(q.a,22,null,'#328e9b',2);ctx.strokeStyle='#1f788a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(q.a.x,q.a.y,26,.3,1.4);ctx.stroke();circle(q.b,19,null,'#ce7040',2);
    for(const f of fx){if(!f.point)continue;const progress=f.age/.55;if(progress>1)continue;ctx.globalAlpha=1-progress;const color=['damage','warning','spike'].includes(f.type)?'#cc6233':['unlock','impact','chain'].includes(f.type)?'#238794':'#7fa999';circle(f.point,12+progress*29,null,color,3);if(!settings.reduced&&['unlock','impact'].includes(f.type)){for(let i=0;i<7;i++){const a=i*2.399+f.id;const pos=G.add(f.point,G.v(Math.cos(a)*progress*55,Math.sin(a)*progress*55));ctx.fillStyle=color;ctx.fillRect(pos.x-3,pos.y-3,6,6);}}ctx.globalAlpha=1;}
    if(session.tutorial&&session.step===2&&!session.teachStrong)text('测试物：轻推 / 高速撞开',620,250,24,'#426d6c','center');
    ctx.restore();
  }
  function frame(now){
    const rawElapsed=Math.max(0,(now-prev)/1000),elapsed=Math.min(.1,rawElapsed);const pad=pollPad();prev=now;
    if(mode==='playing'&&game.getBoundingClientRect().top< -28)pause('正在阅读说明，已暂停');
    if(mode==='playing'&&!session.paused){
      session.realTime+=rawElapsed;accumulator+=elapsed;let ticks=0;while(accumulator>=DT&&ticks++<7){const keyboardAxis=(sources.right.size?1:0)-(sources.left.size?1:0),axis=keyboardAxis||(sources.right.size&&sources.left.size?0:pad?.axis||0),brake=settings.brakeToggle?holdBrake:sources.brake.size>0||!!pad?.brake;session.stepTick({axis:releaseGate?0:axis,brake},DT,0);accumulator-=DT;consumeEvents();if(mode!=='playing')break;}
      updateHUD();const q=G.pose(session.motor);if(Math.abs(session.motor.omega)>1&&!settings.reduced){trail.push({...q.b});if(trail.length>20)trail.shift();}else if(trail.length)trail.shift();
    }
    fx.forEach(f=>f.age+=elapsed);fx=fx.filter(f=>f.age<.55);shake=Math.max(0,shake-elapsed);if(now>labelUntil)$('#impactLabel').textContent='';draw();requestAnimationFrame(frame);
  }
  // Read-only inspection is available for local QA. Tests import engine.js for
  // fixture writes; the shipping page has no teleport or automatic-play action.
  window.PivotDemo={snapshot:()=>session.snapshot(),events:()=>session.events.map(e=>({...e})),ui:()=>({mode,settings:{...settings},focused:game.contains(document.activeElement),releaseGate}),version:'html-0.1.0'};
  welcome();updateHUD();resize();requestAnimationFrame(frame);
})();
