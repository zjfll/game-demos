(function(){'use strict';
const $=id=>document.getElementById(id),game=$('game'),canvas=$('arena'),ctx=canvas.getContext('2d'),overlay=$('overlay'),panel=$('panel');
const D=window.JL_DATA,M=window.JL_META,J=window.Jieliu,C=D.demo_config,col=C.palette,NS='jieliu1909';
const defaultKeys={up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',hold:'Space',pause:'Escape',retry:'KeyR',confirm:'Enter'};
const defaults={mute:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,outline:false,toggle:false,master:100,effects:80,music:35,slow:true,immortal:true,consent:false,keys:defaultKeys};
let settings;try{const saved=JSON.parse(localStorage.getItem(NS+'.settings')||'null');settings={...defaults,...(saved&&typeof saved==='object'?saved:{}),keys:{...defaultKeys,...(saved?.keys||{})}};}catch{settings={...defaults,keys:{...defaultKeys}};}
// Validate persisted values; corrupt storage never blocks play.
for(const k of ['mute','reduced','outline','toggle','slow','immortal','consent'])settings[k]=typeof settings[k]==='boolean'?settings[k]:defaults[k];
for(const k of ['master','effects','music'])settings[k]=Number.isFinite(settings[k])?Math.max(0,Math.min(100,settings[k])):defaults[k];
if(Object.values(settings.keys).some(k=>typeof k!=='string')||new Set(Object.values(settings.keys)).size!==8)settings.keys={...defaultKeys};
function saveSettings(){try{localStorage.setItem(NS+'.settings',JSON.stringify(settings));}catch{}}
let engine=null,screen='TITLE',paused=false,pauseReason='',menuFrom='TITLE',layoutId=0,accumulator=0,lastFrame=0,resultWall=0,terminalWall=0,toastUntil=0;
let touchHold=false,touchVector={x:0,y:0},physical=new Set(),edges=[],gamepadHeld=false,lastPad=null,padPause=false,rebind=null;
let feedback=[],gateAccent=0,lastSignals=[],lastExport=null,firstTutorial=false;
const keyName=code=>({Space:'空格',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Escape:'Esc',Enter:'Enter'}[code]||code.replace(/^Key|^Digit/,''));
class Synth{
 constructor(){this.audio=null;this.voices=[];this.groups={};this.nextNote=0;this.note=0;}
 unlock(){try{if(!this.audio)this.audio=new (window.AudioContext||window.webkitAudioContext)();if(this.audio.state==='suspended')this.audio.resume();}catch{}}
 tone(freq,dur,gain,priority=1,type='sine',music=false){const a=this.audio;if(!a||a.state!=='running'||settings.mute)return;const now=a.currentTime;this.voices=this.voices.filter(v=>v.until>now);
  if(this.voices.length>=8){const low=this.voices.reduce((p,v)=>p.priority<=v.priority?p:v);if(low.priority>priority)return;try{low.osc.stop();}catch{}this.voices=this.voices.filter(v=>v!==low);}
  const osc=a.createOscillator(),amp=a.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.82),now+dur);
  const volume=settings.master/100*(music?settings.music:settings.effects)/100; amp.gain.setValueAtTime(0,now);amp.gain.linearRampToValueAtTime(gain*volume,now+.006);if(type==='triangle'&&priority===3){amp.gain.exponentialRampToValueAtTime(.0001,now+.05);amp.gain.linearRampToValueAtTime(gain*volume,now+.075);}amp.gain.exponentialRampToValueAtTime(.0001,now+dur);osc.connect(amp);amp.connect(a.destination);osc.start();osc.stop(now+dur);osc.onended=()=>{osc.disconnect();amp.disconnect();};this.voices.push({osc,until:now+dur,priority});
 }
 play(type){const now=performance.now();if((type==='delivery'||type==='capture')&&now-(this.groups[type]??-100)<40)return;this.groups[type]=now;
  const map={menu:[480,.09,.08,1],anchor:[340,.07,.055,1],active:[580,.08,.06,1],capture:[720,.045,.025,0],delivery:[1120,.11,.09,1],packet:[880,.18,.09,2],quota:[1320,.24,.09,2],cancel:[260,.055,.022,0],broken:[180,.09,.05,1],warning:[190,.12,.06,3],hit:[90,.18,.10,4],terminal:[240,.24,.06,2]};
  const m=map[type];if(m)this.tone(...m,type==='warning'?'triangle':'sine');if(type==='packet'){this.tone(1100,.17,.04,2);this.tone(1320,.17,.04,2);}if(type==='quota')this.tone(1760,.22,.035,2);
 }
 music(now){if(now<this.nextNote)return;this.nextNote=now+1200;const notes=[110,0,165,0,146.83,0,130.81,0];const n=notes[this.note++%notes.length];if(n)this.tone(n,.38,.025,0,'sine',true);}
 stop(){for(const v of this.voices)try{v.osc.stop();}catch{}this.voices=[];}
}
const sound=new Synth();
function notify(text,seconds=1.6){$('toast').textContent=text;toastUntil=performance.now()+seconds*1000;$('toast').classList.add('show');}
function bodyPanel(title,body,closeText=null){panel.dataset.view=screen;panel.innerHTML='<div class="panel-head"><h2>'+title+'</h2>'+(closeText?'<button id="panelBack">'+closeText+'</button>':'')+'</div><div class="panel-body">'+body+'</div>';if(screen==='RESULT'){const actions=panel.querySelector('.actions');if(actions){actions.classList.add('panel-fixed-actions');panel.appendChild(actions);}}overlay.hidden=false;if(closeText)$('panelBack').onclick=backSettings;}
function showTitle(){screen='TITLE';paused=false;engine=null;clearInput();bodyPanel('借流','<div class="tag">用走位改变弹流</div><p class="intro">把橙圆送进浅绿接收口。<br>按住导流，移动白点拉线，弹从固定端出去。</p><div class="actions"><button id="learn" class="primary">先学怎么导流</button><button id="standard">直接开始3分钟</button><button id="settings">练习与设置</button></div><div class="mini">键盘 / 触摸 / 手柄 · 不需要射击</div>');$('learn').onclick=()=>start('tutorial');$('standard').onclick=()=>start('standard');$('settings').onclick=()=>showSettings('TITLE');updateHUD();draw();}
function clearInput(clearPhysical=false){edges=[];touchHold=false;touchVector={x:0,y:0};$('thumb').style.transform='';if(clearPhysical)physical.clear();}
function held(){return touchHold||gamepadHeld||physical.has(settings.keys.hold)||physical.has('KeyZ');}
function start(mode='standard'){
 sound.unlock();sound.play('menu');clearInput();engine=new J.Engine(D,{layout:mode==='tutorial'?0:layoutId,mode,toggle:settings.toggle,immortal:mode==='practice'&&settings.immortal,consent:settings.consent,logContext:{run_id:'JL-'+Date.now()+'-'+Math.round(performance.now()),build_id:M.build,config_hash:M.hash},wallNow:()=>Date.now()});
 engine.initialSettings={toggle:settings.toggle,slow:mode==='practice'&&settings.slow,immortal:engine.immortal,keys:{...settings.keys}};if(held())engine.mustRelease=true;screen='PLAY';paused=false;accumulator=0;feedback=[];overlay.hidden=true;lastFrame=performance.now();game.focus({preventScroll:true});firstTutorial=mode==='tutorial';updateHUD();draw();
}
function pause(reason='已暂停'){
 if(!engine||screen!=='PLAY'||paused||engine.outcome)return;paused=true;pauseReason=reason;accumulator=0;edges=[];touchHold=false;touchVector={x:0,y:0};$('thumb').style.transform='';sound.stop();engine.emit('pause',{reason});showPause();
}
function showPause(){bodyPanel('已暂停','<p>'+pauseReason+'。场上位置和时间保留。</p><div class="actions"><button id="resume" class="primary">继续这一局</button><button id="restart">'+(engine.mode==='tutorial'?'重置教学':'同局重新开始')+'</button><button id="settings">设置与练习</button><button id="exit">结束这次试玩</button></div>');$('resume').onclick=resume;$('restart').onclick=()=>start(engine.mode);$('settings').onclick=()=>showSettings('PAUSE');$('exit').onclick=()=>{engine.emit('exit');engine.finish('EXIT');paused=false;terminalWall=performance.now();screen='TERMINAL';overlay.hidden=true;};}
function resume(){
 if(!engine)return;const rect=game.getBoundingClientRect();if(rect.top< -24||rect.bottom<innerHeight-24){notify('先回到游戏区域，再点击继续');return;}
 window.scrollTo({top:0,behavior:'instant'});edges=[];engine.syncResume(held());paused=false;screen='PLAY';overlay.hidden=true;engine.emit('resume');accumulator=0;lastFrame=performance.now();game.focus({preventScroll:true});sound.unlock();
}
function showResult(){
 screen='RESULT';paused=false;resultWall=performance.now();clearInput();sound.stop();engine.emit('resultShown');
 const outcome=engine.outcome,title=outcome==='CLEAR'?'送到了，挑战完成':outcome==='FAIL'?'生命耗尽':outcome==='EXIT'?'这次试玩已结束':'还差几段达标';
 const reason=outcome==='CLEAR'?'活到了最后，并完成至少4段送达目标。':outcome==='FAIL'?'橙圆或粉三角碰到了白点。下次可以提前撤线换位。':outcome==='EXIT'?'主动结束；这一局没有标准通关成绩。':'活到了最后，但完成段数少于4段。可以换锚点，让更多弹进接收口。';
 const missing=engine.delivered.map((n,i)=>n<C.run.quotas[i]?(i+1)+'段 '+n+'/'+C.run.quotas[i]:null).filter(Boolean).join('、')||'无';
 bodyPanel(title,'<div class="tag">'+(engine.mode==='practice'?'练习 · 不计标准最佳':'标准挑战')+' · 方向 '+engine.layoutId+'</div><p>'+reason+'</p><div class="result-grid"><div><small>总分</small><strong>'+engine.score.toLocaleString()+'</strong></div><div><small>完成段</small><strong>'+engine.completed+' / 6</strong></div><div><small>实际送达 / 已发圆弹</small><strong>'+engine.delivered.reduce((a,b)=>a+b,0)+' / '+engine.fired+'</strong></div><div><small>完整六连</small><strong>'+engine.completePackets+'</strong></div></div><details><summary>未达标段与漏送明细</summary><p>未达标：'+missing+'</p><p>出流漏出口 '+engine.stats.missed+'；未被接住 '+engine.stats.uncaught+'；主动撤线 '+engine.stats.manual+'；短线取消 '+engine.stats.short+'；过长取消 '+engine.stats.broken+'；受击取消 '+engine.stats.hit+'；过窗取消 '+engine.stats.window+'。</p><p>未发出的未来圆弹不计漏送。提前结束仍在场上的弹未按漏送结算。</p></details><div class="actions inline"><button id="retry" class="primary" disabled>同局再来</button><button id="change" disabled>换个方向</button><button id="reviewTutorial">重看教学</button><button id="title">回到开始</button></div>');
 $('retry').onclick=retry;$('change').onclick=()=>{if(performance.now()-resultWall<300)return;layoutId=(engine.layoutId+1)%8;start(engine.mode);};$('reviewTutorial').onclick=()=>start('tutorial');$('title').onclick=showTitle;
 if(engine.mode==='standard'&&outcome!=='EXIT'){try{const key=NS+'.best.'+engine.layoutId;const best=Number(localStorage.getItem(key)||0);if(engine.score>best)localStorage.setItem(key,String(engine.score));}catch{}}
 if(engine.consent)lastExport=makeExport();
}
function retry(){if(screen!=='RESULT'||performance.now()-resultWall<300)return;layoutId=engine.layoutId;const mode=engine.mode;engine.emit('retry');start(mode);}
function makeExport(){return {build:M.build,configHash:M.hash,canonical:M.canonical,layoutId:engine.layoutId,mode:engine.mode,initialSettings:engine.initialSettings,settings:{toggle:engine.toggle,slow:engine.mode==='practice'&&settings.slow,immortal:engine.immortal,keys:settings.keys},config:D,expandedRecipe:engine.schedule,commands:engine.commands,events:engine.events,outcome:engine.outcome,score:engine.score,delivered:engine.delivered};}
function exportLog(){if(!engine?.consent&&!lastExport){notify('先开启自愿本地记录，再玩一局');return;}const data=engine?.consent?makeExport():lastExport;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='jieliu1909-'+M.build+'-JL-'+data.layoutId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function showSettings(from){menuFrom=from;screen='SETTINGS';edges=[];sound.stop();const checked=k=>settings[k]?' checked':'';
 bodyPanel('练习与设置','<div class="actions inline"><button id="practice" class="primary">开始练习</button><button id="tutorial">重看教学</button></div><label class="setting"><span>导流方式</span><select id="toggleSetting" aria-label="导流方式"><option value="hold"'+(!settings.toggle?' selected':'')+'>按住开启</option><option value="toggle"'+(settings.toggle?' selected':'')+'>按一下开 / 关</option></select></label>'+['slow:练习整体放慢到0.8倍','immortal:练习不死亡','mute:静音','reduced:减少运动效果','outline:危险轮廓增强','consent:自愿记录本地操作日志'].map(s=>{const[k,label]=s.split(':');return '<label class="setting"><span>'+label+'</span><input type="checkbox" id="set_'+k+'"'+checked(k)+'></label>';}).join('')+['master:总音量','effects:音效','music:音乐'].map(s=>{const[k,label]=s.split(':');return '<label class="setting"><span>'+label+'</span><input id="set_'+k+'" type="range" min="0" max="100" value="'+settings[k]+'"></label>';}).join('')+'<div class="subheading">键盘重映射 · 点动作后按新键</div><div class="keys">'+Object.entries({up:'向上',down:'向下',left:'向左',right:'向右',hold:'导流',pause:'暂停',retry:'重试',confirm:'确认'}).map(([k,v])=>'<button data-bind="'+k+'">'+v+' · '+keyName(settings.keys[k])+'</button>').join('')+'</div><p id="bindMessage" class="mini">方向键和 Z 是备用输入。冲突时不会保存。</p><div class="actions inline"><button id="defaultKeys">恢复默认按键</button><button id="export">导出本地日志</button><button id="clearLocal">清除本游戏记录</button></div><p class="mini">日志默认关闭，只记录游戏位置、输入和得分事件；不上传。不死亡和日志从下一局生效。设置和最佳成绩保存在本机。</p><details><summary>版本与布局信息</summary><div>方向 JL-'+layoutId+'；'+M.build+'<br>配置 SHA-256 '+M.hash+'<br>手柄：左摇杆 / 十字键移动，L1 / 下方键导流，Start暂停。移动口的虚线预览不预测未来。</div></details>','返回');
 $('practice').onclick=()=>start('practice');$('tutorial').onclick=()=>start('tutorial');$('toggleSetting').onchange=e=>{settings.toggle=e.target.value==='toggle';if(engine){engine.emit('settingChange',{key:'toggle',value:settings.toggle,applies:'currentRun'});engine.toggle=settings.toggle;}saveSettings();updateSettings();};
 for(const k of ['slow','immortal','mute','reduced','outline','consent'])$('set_'+k).onchange=e=>{settings[k]=e.target.checked;if(engine)engine.emit('settingChange',{key:k,value:settings[k],applies:k==='immortal'||k==='consent'?'nextRun':'currentRun'});saveSettings();updateSettings();};for(const k of ['master','effects','music'])$('set_'+k).oninput=e=>{settings[k]=Number(e.target.value);saveSettings();};
 panel.querySelectorAll('[data-bind]').forEach(b=>b.onclick=()=>{rebind=b.dataset.bind;$('bindMessage').textContent='请按新键；Esc取消。';});
 $('defaultKeys').onclick=()=>{settings.keys={...defaultKeys};saveSettings();showSettings(menuFrom);};$('export').onclick=exportLog;$('clearLocal').onclick=()=>{try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key.startsWith(NS+'.')&&key!==NS+'.settings')localStorage.removeItem(key);}}catch{}lastExport=null;if(engine){engine.events=[];engine.commands=[];}notify('本游戏记录已清除');};
}
function backSettings(){rebind=null;if(menuFrom==='PAUSE'){screen='PLAY';showPause();}else if(menuFrom==='RESULT')showResult();else showTitle();}
function updateSettings(){game.classList.toggle('reduced',settings.reduced);$('mute').textContent=settings.mute?'声音 关':'声音 开';if(settings.mute)sound.stop();$('hold').textContent=settings.toggle?'点按导流':'按住导流';$('holdKey').textContent=keyName(settings.keys.hold)+' / Z · '+(settings.toggle?'再按关闭':'松开撤线');}
$('tutorialSkip').onclick=()=>start('standard');
$('mute').onclick=()=>{sound.unlock();settings.mute=!settings.mute;saveSettings();updateSettings();};$('pause').onclick=()=>{if(screen==='TITLE')showSettings('TITLE');else if(screen==='SETTINGS')backSettings();else if(screen==='RESULT')showSettings('RESULT');else if(paused)showPause();else pause('你手动暂停了');};
function localControl(){const active=screen==='PLAY'&&!paused&&engine&&!engine.outcome;const r=game.getBoundingClientRect();return active&&r.top>=-24&&r.bottom>=innerHeight-24;}
// Keyboard shortcuts are owned only by this focused game area. Outside it, scrolling remains native.
document.addEventListener('keydown',e=>{
 const focused=game.contains(document.activeElement),editable=/INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
 if(!focused||editable||window.scrollY>1||game.getBoundingClientRect().top< -1)return;
 if(rebind){e.preventDefault();if(e.repeat)return;if(e.code==='Escape'){rebind=null;$('bindMessage').textContent='已取消';return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyZ'].includes(e.code)||Object.entries(settings.keys).some(([k,v])=>k!==rebind&&v===e.code)){$('bindMessage').textContent='这个键已用于其他动作，请换一个。';return;}settings.keys[rebind]=e.code;rebind=null;saveSettings();showSettings(menuFrom);updateSettings();return;}
 if(screen==='PLAY'&&!paused&&e.target.tagName==='BUTTON'&&e.target.id!=='hold'&&[settings.keys.up,settings.keys.down,settings.keys.left,settings.keys.right,settings.keys.hold,'KeyZ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
 if(e.repeat){if(localControl()&&[...Object.values(settings.keys),'KeyZ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();return;}const already=physical.has(e.code);physical.add(e.code);if(already)return;
 if(e.code===settings.keys.pause){e.preventDefault();if(screen==='SETTINGS')backSettings();else if(paused)resume();else pause('你手动暂停了');return;}
 if(screen==='RESULT'&&(e.code===settings.keys.retry||e.code===settings.keys.confirm)){e.preventDefault();retry();return;}
 if(!overlay.hidden&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();const items=Array.from(panel.querySelectorAll('button:not(:disabled),select,input'));const index=items.indexOf(document.activeElement);items[(index+(['ArrowUp','ArrowLeft'].includes(e.code)?-1:1)+items.length)%items.length]?.focus();return;}
 if(!overlay.hidden&&e.code===settings.keys.confirm){e.preventDefault();const active=panel.contains(document.activeElement)&&document.activeElement.tagName==='BUTTON'?document.activeElement:panel.querySelector('button.primary,button');active?.click();return;}
 if(!localControl())return;
 if([settings.keys.up,settings.keys.down,settings.keys.left,settings.keys.right,settings.keys.hold,'KeyZ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if((e.code===settings.keys.hold||e.code==='KeyZ')&&!engine.mustRelease)edges.push('press');
});
document.addEventListener('keyup',e=>{const was=physical.delete(e.code);if(was&&(e.code===settings.keys.hold||e.code==='KeyZ')&&screen==='PLAY')edges.push('release');});
game.addEventListener('focusout',e=>{if(!game.contains(e.relatedTarget))pause('焦点离开游戏');});
window.addEventListener('blur',()=>{pause('窗口失去焦点');clearInput(true);gamepadHeld=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause('页面暂时不可见');clearInput(true);}});
window.addEventListener('scroll',()=>{if(window.scrollY>1){pause('你正在阅读下方说明');edges=[];physical.clear();}}, {passive:true});
window.addEventListener('resize',()=>{pause('窗口尺寸已变化');clearInput();resizeCanvas();});
window.addEventListener('gamepaddisconnected',()=>{pause('手柄已断开');gamepadHeld=false;lastPad=null;edges=[];});
canvas.addEventListener('pointerdown',()=>game.focus({preventScroll:true}));
let stickPointer=null;
function moveStick(e){const r=$('stick').getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),m=Math.hypot(dx,dy),max=r.width*.35;const x=dx/Math.max(m,max),y=dy/Math.max(m,max);touchVector={x,y};$('thumb').style.transform='translate('+x*max+'px,'+y*max+'px)';}
$('stick').onpointerdown=e=>{if(!localControl())return;e.preventDefault();game.focus({preventScroll:true});stickPointer=e.pointerId;$('stick').setPointerCapture(e.pointerId);moveStick(e);sound.unlock();};$('stick').onpointermove=e=>{if(e.pointerId===stickPointer){e.preventDefault();moveStick(e);}};
function stopStick(e){if(e.pointerId===stickPointer){stickPointer=null;touchVector={x:0,y:0};$('thumb').style.transform='';}}$('stick').onpointerup=stopStick;$('stick').onpointercancel=stopStick;$('stick').onlostpointercapture=stopStick;
let holdPointer=null;$('hold').onpointerdown=e=>{if(!localControl())return;e.preventDefault();game.focus({preventScroll:true});sound.unlock();holdPointer=e.pointerId;$('hold').setPointerCapture(e.pointerId);touchHold=true;edges.push('press');};
function releaseHold(e){if(e.pointerId===holdPointer){touchHold=false;holdPointer=null;edges.push('release');}}$('hold').onpointerup=releaseHold;$('hold').onpointercancel=releaseHold;$('hold').onlostpointercapture=releaseHold;
function input(){
 let x=(physical.has(settings.keys.right)||physical.has('ArrowRight')?1:0)-(physical.has(settings.keys.left)||physical.has('ArrowLeft')?1:0),y=(physical.has(settings.keys.down)||physical.has('ArrowDown')?1:0)-(physical.has(settings.keys.up)||physical.has('ArrowUp')?1:0);
 if(Math.hypot(touchVector.x,touchVector.y)>0){x=touchVector.x;y=touchVector.y;}
 const pads=navigator.getGamepads?navigator.getGamepads():[],pad=Array.from(pads).find(Boolean);if(pad){
  const v=J.analog(pad.axes[0]||0,pad.axes[1]||0);const px=(pad.buttons[15]?.pressed?1:0)-(pad.buttons[14]?.pressed?1:0),py=(pad.buttons[13]?.pressed?1:0)-(pad.buttons[12]?.pressed?1:0);if(px||py){x=px;y=py;}else if(v.x||v.y){x=v.x;y=v.y;}
  const h=!!(pad.buttons[4]?.pressed||pad.buttons[0]?.pressed);if(h!==gamepadHeld){edges.push(h?'press':'release');gamepadHeld=h;}const pp=!!pad.buttons[9]?.pressed;if(pp&&!padPause){pause('你手动暂停了');}padPause=pp;lastPad=pad.index;
 }else if(lastPad!==null){pause('手柄已断开');lastPad=null;gamepadHeld=false;edges=[];}
 const result={x,y,held:held(),edges:edges.splice(0)};return result;
}
function updateHUD(){const e=engine;$('tutorialSkip').hidden=!(e?.mode==='tutorial'&&screen==='PLAY');$('mute').hidden=e?.mode==='tutorial'&&screen==='PLAY';if(!e){$('phaseLabel').textContent='3分钟挑战';$('stageValue').textContent='6段 · 4段达标过关';$('quotaValue').textContent='0 / 18';$('lifeValue').textContent='3 · 3:00';$('scoreValue').textContent='0';$('hintMain').textContent='把橙圆送进浅绿接收口。';$('hintSub').textContent='按住导流，再移动白点拉线；弹从固定端出去。';$('lineValue').textContent='未放线';return;}
 const tutorial=e.mode==='tutorial',breath=e.localTime>=26;
 $('phaseLabel').textContent=tutorial?'动手教学':e.mode==='practice'?'练习'+(settings.slow?'0.8倍':'')+' · 达标'+e.completed+'/4':'标准 · 达标'+e.completed+'/4';
 $('stageValue').textContent=tutorial?e.phase==='T1'?'1 / 3 拉出通路':e.phase==='T2'?'2 / 3 送进接收口':'3 / 3 躲开三角':(e.stage+1)+' / 6 '+D.phrases.phrases[e.stage].name+(breath?' · 休息':'');
 $('quotaValue').textContent=tutorial?(e.phase==='T2'?e.tutorialDelivered+' / 6':'—'):e.delivered[e.stage]+' / '+C.run.quotas[e.stage]+(e.quotaAwarded[e.stage]?' ✓':'');
 const left=Math.max(0,180-e.time);$('lifeValue').textContent=tutorial?'不死亡':(e.immortal?'不死亡':e.hp+'')+' · '+Math.floor(Math.ceil(left)/60)+':'+String(Math.ceil(left)%60).padStart(2,'0');$('scoreValue').textContent=e.score.toLocaleString();
 let main='',sub='';
 if(tutorial){if(e.phase==='T1'){main='按住导流，向左拉白点到虚线区。';sub='固定端留在原地；方向盘或方向键移动。';}else if(e.phase==='T2'){main='用线接橙圆，把青点送进浅绿口。';sub=e.tutorialHint?'没有送到？松开换固定端；出口远离白点。':'青点已安全，入港才算送到；松开可换端。';}else{main=e.tutorialDone?'已试过导流和躲避，进入3分钟挑战。':'粉三角会穿线，移动白点躲开。';sub='它瞄准预告时的位置，飞出后不会追着你。';}}
 else if(e.phase==='READY'){main='准备：按住导流，向左拉白点。';sub='浅绿边框是接收口；橙圆可接，粉三角要躲。';}
 else if(breath){main='休息4秒，位置保留，生命不回复。';sub=e.stage===5?'最后一段结束，正在收束成绩。':'下一段要重新按下导流；趁现在换个固定端。';}
 else if(e.line==='BROKEN'){main='线过长了：松开，再按下导流。';sub='断线不扣生命，身体可以继续移动。';}
 else if(e.line==='DORMANT'){main='固定端已放下，移动白点把线拉开。';sub='线长到24才接弹；超过320会断，松开可换端。';}
 else if(e.line==='ACTIVE'){main='青点回到固定端；进入接收口才得分。';sub=e.stage===2||e.stage===5?'虚线只指当前方向；离线后的弹不会跟着你转。':e.stage>=3?'粉三角不能接，挪动身体躲开；出口也会跟着改变。':'虚线指向出口；白点身边最后一小段不接弹。';}
 else{main='按住导流，再移动白点拉线送橙圆。';sub=e.stage>=3?'粉三角要躲；松开撤线可以更快移动。':'弹从固定端向远离白点的方向飞出。';}
 $('hintMain').textContent=main;$('hintSub').textContent=sub;$('lineValue').textContent=e.line==='OFF'?'未放线':e.line==='BROKEN'?'过长 · 已断':Math.round(J.distance(e.a,e.p))+(e.line==='DORMANT'?' · 待机':' · 有效');$('hold').classList.toggle('held',e.logicalHold);
}
function handleSignals(){const e=engine;lastSignals=e.signals.splice(0);for(const s of lastSignals){sound.play(s.type);if(s.p)feedback.push({...s,until:performance.now()+360});if(feedback.length>96)feedback.shift();
 if(s.type==='delivery')gateAccent=performance.now()+120;if(s.type==='packet')notify('完整六连 +300');if(s.type==='quota')notify('本段达标 +1000');if(s.type==='broken')notify('过长 · 松开再按');if(s.type==='hit')notify(e.immortal?'练习：碰到了'+(s.kind==='triangle'?'三角':'圆弹'):'受击 · 剩余'+e.hp+'命');
 if(s.type==='tutorial3'){notify('已实际送达6颗！现在试着躲三角',2.4);}
 if(s.type==='tutorialDone'){bodyPanel('准备好了','<p>你已亲手把6颗圆弹送进口，也看过三角穿线。正式局有3点生命，6段中完成4段就过关。</p><div class="actions"><button id="enterStandard" class="primary">进入3分钟挑战</button><button id="resetTutorial">再试教学</button></div>');$('enterStandard').onclick=()=>start('standard');$('resetTutorial').onclick=()=>start('tutorial');}
 if(s.type==='terminal'){screen='TERMINAL';terminalWall=performance.now();edges=[];}
 if(s.type==='error'){paused=true;bodyPanel('运行已暂停','<p class="error">'+s.message+'</p><div class="actions"><button id="errorRestart">同局重新开始</button><button id="errorTitle">回到开始</button></div>');$('errorRestart').onclick=()=>start(e.mode);$('errorTitle').onclick=showTitle;}
 }
}
function resizeCanvas(){const r=$('boardZone').getBoundingClientRect(),size=Math.max(1,Math.floor(Math.min(r.width,r.height)));canvas.style.width=size+'px';canvas.style.height=size+'px';const dpr=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(size*dpr);canvas.height=Math.round(size*dpr);draw();}
function strokeLine(a,b,color,width=2,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);}
function ring(p,r,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();}
function dot(p,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();}
function label(text,p,color=col.muted,size=15,align='center'){ctx.fillStyle=color;ctx.font=size+'px system-ui, sans-serif';ctx.textAlign=align;ctx.fillText(text,p.x,p.y);}
function draw(){
 if(!canvas.width)return;ctx.setTransform(canvas.width/720,0,0,canvas.height/720,0,0);ctx.clearRect(0,0,720,720);ctx.fillStyle=col.arena;ctx.fillRect(0,0,720,720);
 ctx.strokeStyle='#233b47';ctx.lineWidth=1;ctx.beginPath();for(let i=60;i<720;i+=60){ctx.moveTo(i,0);ctx.lineTo(i,720);ctx.moveTo(0,i);ctx.lineTo(720,i);}ctx.stroke();
 const e=engine,p=e?e.p:{x:490,y:260},g=e?e.gate():{edge:'right',center:260,open:true,p:{x:720,y:260}};
 const gp=c=>g.edge==='right'?{x:715,y:c}:g.edge==='left'?{x:5,y:c}:g.edge==='top'?{x:c,y:5}:{x:c,y:715};
 let preview=null,aligned=false;if(e?.line==='ACTIVE'){const L=J.distance(e.a,e.p),n={x:(e.a.x-e.p.x)/L,y:(e.a.y-e.p.y)/L};preview=J.crossing(e.a,{x:e.a.x+n.x*1600,y:e.a.y+n.y*1600});if(preview){const c=preview.edge==='top'||preview.edge==='bottom'?preview.x:preview.y;aligned=preview.edge===g.edge&&Math.abs(c-g.center)<=72;}
  const end={x:e.a.x+(p.x-e.a.x)*(1-18/L),y:e.a.y+(p.y-e.a.y)*(1-18/L)};strokeLine(e.a,end,col.safe,4);strokeLine(end,p,'#4a7079',1,[3,5]);
  strokeLine(e.a,{x:e.a.x+n.x*120,y:e.a.y+n.y*120},aligned?col.gate:'#91aaa5',2,[7,6]);const tip={x:e.a.x+n.x*120,y:e.a.y+n.y*120};strokeLine(tip,{x:tip.x-n.x*12+n.y*7,y:tip.y-n.y*12-n.x*7},col.gate,2);strokeLine(tip,{x:tip.x-n.x*12-n.y*7,y:tip.y-n.y*12+n.x*7},col.gate,2);
  if(preview)ring({x:preview.x,y:preview.y},6,aligned?col.gate:'#8ba0a3',2);
 }
 if(e?.a&&(e.line==='ACTIVE'||e.line==='DORMANT')){ring(e.a,10,col.safe,3);dot(e.a,3,col.safe);if(e.mode==='tutorial'&&e.phase==='T1')label('固定端', {x:e.a.x,y:e.a.y-22},col.safe,18);}
 if(g.open){strokeLine(gp(g.center-72),gp(g.center+72),performance.now()<gateAccent?col.safe:col.gate,aligned?9:6);for(const c of [g.center-72,g.center+72]){const q=gp(c),inward=g.edge==='right'?{x:-14,y:0}:g.edge==='left'?{x:14,y:0}:g.edge==='top'?{x:0,y:14}:{x:0,y:-14};strokeLine(q,{x:q.x+inward.x,y:q.y+inward.y},aligned?col.safe:col.gate,3);}}
 if(!e||e.mode==='tutorial'){label('接收口',g.edge==='right'?{x:660,y:g.center-92}:{x:360,y:42},col.gate,18);}
 if(e?.mode==='tutorial'&&e.phase==='T1'){ctx.strokeStyle='#91aca5';ctx.lineWidth=2;ctx.setLineDash([8,8]);ctx.strokeRect(210,230,145,60);ctx.setLineDash([]);strokeLine({x:445,y:305},{x:310,y:305},'#b5cab6',2,[8,8]);label('向左拉线',{x:292,y:325},col.gate,18);}
 for(const w of e?.warnings||[]){if(w.type==='round'){const source=w.source;ring(source,8,col.round,2);const delta=w.edge==='top'?{x:0,y:38}:{x:38,y:0};const v=e.mode==='tutorial'?delta:J.transform(delta,e.layout,true);strokeLine(source,{x:source.x+v.x,y:source.y+v.y},col.round,2,[5,6]);}
  else{const theta=Math.atan2(w.target.y-w.source.y,w.target.x-w.source.x);for(const spread of [-.1,0,.1]){const v={x:Math.cos(theta+spread),y:Math.sin(theta+spread)},s=w.source;strokeLine(s,{x:s.x+v.x*95,y:s.y+v.y*95},col.triangle,2,[6,5]);}const marker={x:Math.max(16,Math.min(704,w.source.x)),y:Math.max(16,Math.min(704,w.source.y))};ctx.save();ctx.translate(marker.x,marker.y);ctx.rotate(theta);ctx.strokeStyle=col.triangle;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-7,8);ctx.lineTo(-3,0);ctx.lineTo(-7,-8);ctx.closePath();ctx.stroke();ctx.restore();}
 }
 for(const b of e?.bullets||[]){if(b.kind==='triangle'){const angle=Math.atan2(b.v.y,b.v.x);ctx.save();ctx.translate(b.p.x,b.p.y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(-8,8);ctx.lineTo(-4,0);ctx.lineTo(-8,-8);ctx.closePath();ctx.fillStyle=col.triangle;ctx.fill();ctx.strokeStyle=settings.outline?'#fff5fb':'#c85d83';ctx.lineWidth=settings.outline?2:1;ctx.stroke();ctx.restore();}
  else if(b.state==='INCOMING'){dot(b.p,5,col.round);if(settings.outline)ring(b.p,6,'#f9e4ca',1.5);}
  else if(b.state==='GUIDED'){dot(b.p,4,col.safe);ring(b.p,6,'#61d8cf66',1);}
  else{const angle=Math.atan2(b.v.y,b.v.x);ctx.save();ctx.translate(b.p.x,b.p.y);ctx.rotate(angle);ctx.fillStyle=col.safe;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-6,-3);ctx.lineTo(-8,0);ctx.lineTo(-6,3);ctx.closePath();ctx.fill();ctx.restore();}
 }
 const clock=e?.mode==='tutorial'?e.tutorialMicro:e?.micro;const inv=e&&clock<e.invulnUntil;
 dot(p,12,col.player);ring(p,6,'#152630',1.5);dot(p,2,'#152630');if(inv){ring(p,18,col.safe,2.5);ctx.strokeStyle='#e7faf1';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,21,-Math.PI/2,-Math.PI/2+Math.PI*2*(e.invulnUntil-clock)/576);ctx.stroke();}
 if(!e||e.mode==='tutorial'&&e.phase==='T1')label('你',{x:p.x,y:p.y+34},col.player,18);
 const now=performance.now();feedback=feedback.filter(f=>f.until>now);if(!settings.reduced)for(const f of feedback){if(!f.p)continue;const k=1-(f.until-now)/360;ctx.globalAlpha=1-k;ring(f.p,6+14*k,f.type==='hit'?col.triangle:f.type==='delivery'?col.gate:col.safe,2);ctx.globalAlpha=1;}
 if(e?.phase==='READY'){label('准备', {x:360,y:400},col.gate,30);}
 if(e&&!e.gate().open)label('休息 · '+Math.max(0,Math.ceil(30-e.localTime))+'秒',{x:360,y:370},col.gate,25);
}
let menuPadHeld=false,menuPadDirection=0,menuPadNext=0,menuPadPause=false;
function pollMenuPad(now){const pad=Array.from(navigator.getGamepads?.()||[]).find(Boolean);if(!pad){menuPadHeld=false;menuPadPause=false;menuPadDirection=0;return;}const h=!!(pad.buttons[0]?.pressed||pad.buttons[4]?.pressed),pp=!!pad.buttons[9]?.pressed;if(!overlay.hidden){gamepadHeld=h;const direction=pad.buttons[13]?.pressed||pad.buttons[15]?.pressed||(pad.axes[1]||0)>.5?1:pad.buttons[12]?.pressed||pad.buttons[14]?.pressed||(pad.axes[1]||0)<-.5?-1:0;if(direction&&(direction!==menuPadDirection||now>=menuPadNext)){const items=Array.from(panel.querySelectorAll('button:not(:disabled),select,input'));const idx=items.indexOf(document.activeElement);items[(idx+direction+items.length)%items.length]?.focus({preventScroll:true});menuPadNext=now+280;}menuPadDirection=direction;if(h&&!menuPadHeld){const target=panel.contains(document.activeElement)&&document.activeElement.tagName==='BUTTON'?document.activeElement:panel.querySelector('button.primary,button');target?.click();}if(pp&&!menuPadPause){if(paused)resume();else if(screen==='SETTINGS')backSettings();}}menuPadHeld=h;menuPadPause=pp;}
function frame(now){requestAnimationFrame(frame);pollMenuPad(now);if(!lastFrame)lastFrame=now;const elapsed=(now-lastFrame)/1000;lastFrame=now;
 if(engine&&screen==='PLAY'&&!paused&&!engine.error&&!engine.tutorialDone){
  // Catch up every tick. A large gap is explicit pause; never discard active simulation time silently.
  if(elapsed>1){pause('画面停顿超过1秒');return;}
  accumulator+=elapsed*(engine.mode==='practice'&&settings.slow?.8:1);let count=0;
  while(accumulator>=1/120&&!paused&&screen==='PLAY'){const i=input();if(paused)break;engine.tick(i);handleSignals();accumulator-=1/120;if(++count>120){pause('模拟积压超过1秒');break;}}
  sound.music(now);
 }
 if(screen==='TERMINAL'&&now-terminalWall>=600)showResult();if(screen==='RESULT'&&now-resultWall>=300){if($('retry'))$('retry').disabled=false;if($('change'))$('change').disabled=false;}
 if(now>toastUntil)$('toast').classList.remove('show');updateHUD();draw();
 // Poll held state while paused without consuming new gameplay edges.
 if(paused){const pad=Array.from(navigator.getGamepads?.()||[]).find(Boolean);gamepadHeld=!!(pad?.buttons[4]?.pressed||pad?.buttons[0]?.pressed);}
}
// Basic boot validation rejects unavailable or inconsistent frozen recipes.
function validate(){if(!D||D.demo_config.schema_version!=='JL-D0.1'||D.phrases.phrases.length!==6||D.layouts.layouts.length!==8)throw Error('配置版本或段落数量错误');const ids=new Set();let rounds=0,triangles=0;D.phrases.phrases.forEach((p,i)=>{if(p.quota!==C.run.quotas[i]||p.quota>p.packets.length*6)throw Error('配额错误');for(const packet of p.packets){if(ids.has(packet.id)||packet.start_s<.8||packet.start_s+.5>=26||!['top','left'].includes(packet.edge))throw Error('发射配方错误');ids.add(packet.id);rounds+=6;}triangles+=p.triangle_volleys.length*3;});if(rounds!==384||triangles!==30||C.conduit.minimum_length<=C.conduit.body_exclusion||C.conduit.ejection_offset!==0)throw Error('配置边界错误');}
try{validate();updateSettings();showTitle();resizeCanvas();requestAnimationFrame(frame);}catch(err){bodyPanel('配置错误','<p class="error">'+String(err.message)+'</p>');}
new ResizeObserver(resizeCanvas).observe($('boardZone'));
// Read-only state snapshot for diagnostics. Rules are tested separately through engine.js.
window.JL_INSPECT=()=>({screen,paused,phase:engine?.phase,time:engine?.time,mode:engine?.mode,p:engine?{...engine.p}:null,a:engine?.a?{...engine.a}:null,line:engine?.line,hp:engine?.hp,score:engine?.score,delivered:engine?.delivered,fired:engine?.fired,trianglesFired:engine?.trianglesFired,bullets:engine?.bullets.map(b=>({id:b.id,state:b.state,p:{...b.p}})),layout:engine?.layoutId,peak:engine?.peak,outcome:engine?.outcome,hash:M.hash,events:engine?.consent?engine.events:undefined});
})();
