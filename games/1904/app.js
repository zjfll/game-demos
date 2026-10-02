(function(){
  'use strict';
  const D=ChordRules, B=ChordBoards, S=ChordStore, $=id=>document.getElementById(id);
  const game=$('game'),canvas=$('board'),overlay=$('overlay'),view=new ChordView.BoardView(canvas,$('arena')),sound=new ChordView.Sound();
  let local;try{local=localStorage;}catch(e){local={getItem(){throw e;},setItem(){throw e;}};}
  const store=new S.Store(local,B),loaded=store.load(),durable=new ChordDurable(B);
  let settings=loaded?loaded.settings:{...S.defaults},bests=loaded?loaded.bests:{},boardIndex=loaded?loaded.boardIndex:0;
  const randomId=crypto.getRandomValues(new Uint32Array(2));
  let tutorial=loaded?loaded.tutorial:true,generation=randomId[0]*65536+(randomId[1]&65535),action=loaded?loaded.state.actions.length:0,session=new D.Session(B[boardIndex],generation);
  if(loaded){session.state=loaded.state;session.phase=session.state.shots===0||session.state.consumed.every(Boolean)?'results':'ready';}
  let q={x:480,y:460},paused=false,panel=null,preview=null,aimDirty=false,pointer=null,before=null,plan=null,lastPlan=null,time=0,eventIndex=0,hitCount=0,doneTutorial=false;
  let lastFrame=performance.now(),feedback='',log=[],activeKeys=new Set();
  let recovering=true;
  const readyHint=()=>{
    const action=settings.input==='toggle'?'点空白处选拉点，移动后再点一次发射。':'按住空白处拖动拉点，松手发射。';
    const rule=B[boardIndex].bumpers.length?'实心斜纹圆会反弹；珠子相遇会穿过。':B[boardIndex].tip;
    return boardIndex>=2?rule+' '+action:action+' 三颗珠都朝远离拉点的方向走。';
  };
  const snapshot=()=>({state:session.state,settings,boardIndex,tutorial,bests});
  function persist(){
    const localOK=store.save(D.copy(snapshot())),stamp=store.stamp,token=generation;
    if(store.blocked||!store.lastRaw){$('saveNote').textContent=store.message;return;}
    $('saveNote').textContent='正在保存进度';
    durable.save(store.lastRaw).then(strict=>{
      if(store.stamp===stamp&&generation===token)$('saveNote').textContent=strict?'进度已保存':'已记录进度；强退可能丢失最后一拨。';
    }).catch(e=>{
      if(e.message==='SAVE_FUTURE_SCHEMA'){store.blocked=true;store.message='存档版本较新，本次不会覆盖原存档。';}
      if(store.stamp===stamp&&generation===token)$('saveNote').textContent=store.blocked?store.message:localOK?'已记录当前浏览器进度；强退可能丢失最后一拨。':'保存不可用，本次可继续玩；重开可能丢失进度。';
    });
  }
  function gameFocus(){(panel?$('closePanel'):game).focus({preventScroll:true});}
  function isActive(){return game.contains(document.activeElement)&&game.getBoundingClientRect().top>=-20&&game.getBoundingClientRect().bottom>innerHeight*.5;}
  function cancel(message='已取消，机会没有减少。'){
    if(session.phase==='aiming'){session.phase='ready';preview=null;pointer=null;feedback=message;activeKeys.clear();update();}
  }
  function reset(index=boardIndex,teach=false){
    recovering=false;
    pointer=null;activeKeys.clear();boardIndex=index;tutorial=teach;doneTutorial=false;session=new D.Session(B[index],++generation);action=0;
    q={x:480,y:460};paused=false;plan=null;lastPlan=null;preview=null;time=0;before=null;feedback='';closePanel(false);persist();update();gameFocus();
  }
  function aim(p){
    if(recovering||paused||panel||!['ready','aiming'].includes(session.phase))return;
    if(!D.inside(p))return;session.phase='aiming';q=D.quantize(p);aimDirty=true;feedback='';update();
  }
  function commit(){
    if(recovering||paused||panel||session.phase!=='aiming')return;
    before=D.copy(session.state);
    const result=session.submit({id:'action-'+generation+'-'+(++action),generation,session:session.id,q});
    if(!result.ok){cancel(result.error==='SIM_LIMIT'?'这次反弹计算遇到异常，未使用机会。请重玩或换个拉点。':'这个拉点不能发射，移动拉点后再试。');return;}
    plan=result.plan;lastPlan=null;time=0;eventIndex=0;hitCount=0;preview=null;pointer=null;activeKeys.clear();sound.release(settings);
    log.push({board:B[boardIndex].id,session:session.id,generation,action:session.state.actions.length,q:plan.q,hash:plan.hash,...plan.breakdown,tutorial,preview:settings.preview});if(log.length>64)log.shift();
    if(!tutorial&&(session.state.shots===0||session.state.consumed.every(Boolean))){const key=B[boardIndex].id+'|'+settings.preview;bests[key]=Math.max(bests[key]||0,session.state.score);}
    persist();update();
    if(settings.reduced){time=plan.duration;finish();}
  }
  function finish(){
    if(session.phase!=='playback')return;
    time=plan.duration;eventIndex=plan.events.length;lastPlan=plan;session.finish();
    const s=plan.breakdown;
    feedback=s.n?`这一拨穿了 ${s.n} 个环。${s.allThree?'三颗珠都有贡献。':s.perfect?`其中 ${s.perfect} 个从环心经过。`:''}停位已保留。`:'这一拨没有碰到环，用掉了 1 次机会。换个拉点再试。';
    if(tutorial){doneTutorial=true;session.phase='results';openPanel('tutorialEnd');}
    else if(session.phase==='results'){
      const key=B[boardIndex].id+'|'+settings.preview;bests[key]=Math.max(bests[key]||0,session.state.score);persist();openPanel('results');
    }
    update();
  }
  function update(){
    const s=session.state;$('shots').textContent=s.shots===1?'最后 1 拨':s.shots+' 拨';
    const hits=session.phase==='playback'?before.consumed.filter(Boolean).length+hitCount:s.consumed.filter(Boolean).length;
    $('rings').textContent=hits+' / 12';$('score').textContent=settings.bonus?s.score+' 分':'已穿 '+hits+' 环';
    $('mode').textContent=tutorial?'教学 · 不计成绩':settings.preview==='full'?'完整预览 · 辅助成绩':'第 '+(boardIndex+1)+' / 6 盘';
    $('goal').textContent=session.phase==='playback'?'正在弹射，观察三条路线。':session.phase==='results'?'这一盘结束了。':`4 次机会，穿过所有空心圆环。`;
    if(recovering)$('hint').textContent='正在读取上次进度，请稍候。';
    else if(paused)$('hint').textContent='已暂停。继续后保留当前局面。';
    else if(session.phase==='aiming')$('hint').textContent=settings.input==='toggle'?'三条箭头朝远离拉点的方向。再点一次，或按“发射”。':'三条箭头朝远离拉点的方向。松手发射；拉点外移会增大力度。';
    else if(session.phase==='playback')$('hint').textContent='圆环只消失，不反弹。三颗珠停下后，再选下一个拉点。';
    else $('hint').textContent=feedback||(tutorial?'按住珠子下方的虚线小圆，拖动拉点后松手。三条箭头是各自的方向。':readyHint());
    $('primary').textContent=session.phase==='playback'?'跳过动画':session.phase==='aiming'?'发射':'选择拉点';
    $('primary').disabled=recovering||paused||!!panel||session.phase==='results';
    ['menu','pause','retry','tutorialAction'].forEach(id=>$(id).disabled=recovering);
    $('tutorialAction').textContent=tutorial?'跳过教学':'选盘';$('pause').textContent=paused?'继续':'暂停';
  }
  function closePanel(resume=true){overlay.hidden=true;panel=null;if(resume)paused=false;if(resume&&settings.reduced&&session.phase==='playback')finish();update();}
  function button(text,handler,primary=false){const b=document.createElement('button');b.textContent=text;if(primary)b.className='primary';b.onclick=handler;return b;}
  function p(text){const el=document.createElement('p');el.textContent=text;return el;}
  function openPanel(kind){
    cancel('');paused=true;panel=kind;overlay.hidden=false;activeKeys.clear();pointer=null;
    const body=$('panelBody'),footer=$('panelFooter');body.replaceChildren();footer.replaceChildren();
    const titles={pause:'已暂停',menu:'更多',settings:'设置',boards:'选择一盘',results:'这一盘的结果',tutorialEnd:'第一拨完成',debug:'检查与反馈对照'};
    $('panelTitle').textContent=titles[kind];$('closePanel').textContent=kind==='results'||kind==='tutorialEnd'?'查看棋盘':'返回游戏';
    if(kind==='pause'){
      body.append(p('局面已保留。未松手的拉点会取消，已经发射的结果不会撤销。'));
      footer.append(button('重玩这一盘',()=>reset(boardIndex,tutorial)),button('继续游戏',()=>{closePanel();gameFocus();},true));
    }
    if(kind==='menu'){
      const list=document.createElement('div');list.className='menu-list';
      list.append(button('选择一盘',()=>openPanel('boards')),button('设置',()=>openPanel('settings')),
        button('重看教学',()=>reset(0,true)),button('检查与反馈对照',()=>openPanel('debug')));body.append(list);
      footer.append(button('继续游戏',()=>{closePanel();gameFocus();},true));
    }
    if(kind==='boards'){
      body.append(p('六个固定布局。重玩会保留同一盘的完整初始布局。'));
      const list=document.createElement('div');list.className='menu-list';B.forEach((b,i)=>{const el=button(b.name,()=>reset(i));el.className='board-choice';const sub=document.createElement('span');sub.textContent=b.family;el.append(sub);list.append(el);});body.append(list);
    }
    if(kind==='settings'){
      function setting(label,key,type,options){
        const row=document.createElement('label');row.className='setting';const title=document.createElement('span');title.textContent=label;
        let input;
        if(type==='select'){input=document.createElement('select');for(const [value,text]of options){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}input.value=settings[key];}
        else{input=document.createElement('input');input.type=type;if(type==='checkbox')input.checked=settings[key];else{input.min=0;input.max=1;input.step=.05;input.value=settings[key];}}
        input.setAttribute('aria-label',label);input.onchange=()=>{settings[key]=type==='checkbox'?input.checked:type==='range'?Number(input.value):input.value;
          if(key==='input')cancel('输入方式已切换，重新选择拉点。');
          if(key==='preview'){reset(boardIndex,tutorial);openPanel('settings');}else persist();update();};row.append(title,input);body.append(row);
      }
      setting('静音','mute','checkbox');setting('音效音量','volume','range');setting('减少动态','reduced','checkbox');
      setting('输入方式','input','select',[['drag','按住拖动，松手发射'],['toggle','点一下选点，再点发射']]);
      setting('路线预览','preview','select',[['off','关闭'],['short','短预览（默认）'],['full','完整预览（辅助）']]);
      body.append(p('更改路线预览会重玩当前盘。完整预览的成绩单独记录。减少动态会直接显示停位和本拨结果。'));
      footer.append(button('恢复默认',()=>{settings={...S.defaults};reset(boardIndex,tutorial);openPanel('settings');}),button('返回游戏',()=>{closePanel();gameFocus();},true));
    }
    if(kind==='results'){
      const n=session.state.consumed.filter(Boolean).length,clear=n===12;
      body.append(p(clear?'12 个环全部穿过，清盘完成。':'4 次机会已用完，还剩 '+(12-n)+' 个环。重玩同一盘，可以换个拉点试试。'));
      const num=document.createElement('div');num.className='result-number';num.textContent=n+' / 12 ';const unit=document.createElement('span');unit.textContent='已穿圆环';num.append(unit);body.append(num);
      const key=B[boardIndex].id+'|'+settings.preview;
      body.append(p(settings.bonus?`本盘 ${session.state.score} 分 · 最好一拨 ${session.state.bestShot} 环`:`最好一拨 ${session.state.bestShot} 环`));
      if(settings.bonus&&plan?.breakdown.bonus)body.append(p(`提前清盘，还剩 ${session.state.shots} 拨，加 ${plan.breakdown.bonus} 分。`));
      if(settings.bonus)body.append(p(`${settings.preview==='full'?'辅助':'当前预览'}最好成绩：${bests[key]||session.state.score} 分。`));
      footer.append(button('重玩这一盘',()=>reset()),button('下一盘',()=>reset((boardIndex+1)%6),true));
    }
    if(kind==='tutorialEnd'){
      const n=session.state.consumed.filter(Boolean).length;
      body.append(p(`这一拨穿了 ${n} 个环。珠子按三条箭头各自弹出，新的停位会保留。`),p('教学到这里，不计入成绩。现在从同一初始盘开始，试试四拨内穿过全部圆环。'));
      footer.append(button('再试教学',()=>reset(0,true)),button('开始这一盘',()=>reset(0,false),true));
    }
    if(kind==='debug'){
      body.append(p('仅本地记录最近 64 拨的拉点、规则结果与预览配置。导出不会上传。'));
      const row=document.createElement('label');row.className='setting';row.textContent='反馈强度';const select=document.createElement('select');select.setAttribute('aria-label','反馈强度');
      [['basic','基础反馈'],['rich','增强反馈']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o);});select.value=settings.feedback;select.onchange=()=>{settings.feedback=select.value;persist();};row.append(select);body.append(row);
      const label=document.createElement('label');label.className='setting';label.textContent='显示分数与奖金';const check=document.createElement('input');check.type='checkbox';check.checked=settings.bonus;check.onchange=()=>{settings.bonus=check.checked;persist();update();};label.append(check);body.append(label);
      const out=document.createElement('pre');out.className='debug-output';out.textContent=JSON.stringify({rules:D.R.version,board:B[boardIndex].id,phase:session.phase,lastHash:plan?.hash,lastEvents:plan?.events.slice(-12),actions:session.state.actions},null,2);body.append(out);
      footer.append(button('导出本地记录',()=>{const blob=new Blob([JSON.stringify({rules:D.R.version,board:session.state.board,state:session.state,settings,log},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='共弦-本地试玩记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}),button('返回游戏',()=>{closePanel();gameFocus();},true));
    }
    update();$('closePanel').focus({preventScroll:true});
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||recovering||paused||panel)return;if(!['ready','aiming'].includes(session.phase))return;
    if(pointer!==null&&pointer!==e.pointerId)return;
    e.preventDefault();gameFocus();sound.unlock();const pos=view.point(e);
    if(session.phase==='ready'&&session.state.pearls.some(p=>D.dist(p,pos)<=16)){feedback='请按住空白处选拉点，不用拖动珠子。';update();return;}
    if(settings.input==='toggle'&&session.phase==='aiming'){aim(pos);commit();return;}
    aim(pos);if(settings.input==='drag'){pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);}
  });
  canvas.addEventListener('pointermove',e=>{
    if(session.phase!=='aiming'||paused||panel)return;
    if(settings.input==='drag'&&pointer!==e.pointerId)return;
    const pos=view.point(e);if(D.inside(pos))aim(pos);
  });
  canvas.addEventListener('pointerup',e=>{
    if(settings.input!=='drag'||pointer!==e.pointerId)return;
    pointer=null;const pos=view.point(e);if(!D.inside(pos)){cancel('在棋盘外松手，已取消；机会没有减少。');return;}
    if(session.phase==='aiming'){aim(pos);commit();}
  });
  canvas.addEventListener('pointercancel',()=>cancel());
  canvas.addEventListener('lostpointercapture',()=>{if(pointer!==null)cancel();});
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();cancel();});
  $('primary').onclick=()=>{gameFocus();sound.unlock();if(session.phase==='playback')finish();else if(session.phase==='aiming')commit();else aim(q);};
  $('retry').onclick=()=>reset(boardIndex,tutorial);$('tutorialAction').onclick=()=>tutorial?reset(0,false):openPanel('boards');
  $('pause').onclick=()=>{if(panel){closePanel();gameFocus();}else openPanel('pause');};$('menu').onclick=()=>openPanel('menu');
  $('closePanel').onclick=()=>{closePanel();gameFocus();};
  game.addEventListener('keydown',e=>{
    if(!isActive()||recovering)return;
    if(panel&&e.code==='Tab'){
      const nodes=[...overlay.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.getClientRects().length),i=nodes.indexOf(document.activeElement);
      if(i<0||e.shiftKey&&i===0||!e.shiftKey&&i===nodes.length-1){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0]?.focus({preventScroll:true});}return;
    }
    if(e.target.matches('input,select,textarea')||e.repeat&&['Space','Escape','KeyR','KeyN'].includes(e.code))return;
    if(e.code==='Escape'){e.preventDefault();if(panel){closePanel();gameFocus();}else if(session.phase==='aiming')cancel();else openPanel('pause');return;}
    if(panel||paused||e.target.tagName==='BUTTON')return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();activeKeys.add(e.code);if(session.phase==='ready')aim(q);}
    if(e.code==='Space'){e.preventDefault();sound.unlock();if(session.phase==='ready')aim(q);else if(session.phase==='aiming')commit();}
    if(e.code==='KeyR'){e.preventDefault();reset(boardIndex,tutorial);}if(e.code==='KeyN'){e.preventDefault();reset((boardIndex+1)%6);}
  });
  window.addEventListener('keyup',e=>activeKeys.delete(e.code));
  function leave(){cancel('已取消未发射的拉点。');activeKeys.clear();if(!panel)openPanel('pause');}
  window.addEventListener('blur',leave);document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
  game.addEventListener('focusout',e=>{if(e.relatedTarget&&!game.contains(e.relatedTarget))leave();});
  window.addEventListener('scroll',()=>{if(game.getBoundingClientRect().top<-40)leave();},{passive:true});
  new ResizeObserver(()=>{view.resize();cancel('画面大小已改变，请重新选择拉点。');}).observe($('arena'));
  function frame(now){
    const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
    if(!paused&&!panel){
      if(session.phase==='aiming'&&activeKeys.size){const speed=(activeKeys.has('ShiftLeft')||activeKeys.has('ShiftRight')?35:260)*dt;
        const nx=q.x+(activeKeys.has('ArrowRight')?speed:0)-(activeKeys.has('ArrowLeft')?speed:0),ny=q.y+(activeKeys.has('ArrowDown')?speed:0)-(activeKeys.has('ArrowUp')?speed:0);
        aim({x:Math.max(0,Math.min(960,nx)),y:Math.max(0,Math.min(540,ny))});
      }
      if(session.phase==='playback'){
        time=Math.min(plan.duration,time+dt);
        while(eventIndex<plan.events.length&&plan.events[eventIndex].time<=time){const e=plan.events[eventIndex++];if(e.type==='RingHit')hitCount++;if(settings.feedback==='rich'||e.type==='RingHit')sound.event(e,settings,hitCount);}
        update();if(time>=plan.duration)finish();
      }
    }
    if(aimDirty&&session.phase==='aiming'){
      aimDirty=false;
      try{preview=settings.preview==='off'?null:session.state.pearls.map((p,i)=>D.trajectory(p,D.launch(p,q),session.state.board.bumpers,i));}
      catch(e){preview=null;}
    }
    view.draw({state:session.state,settings,q,tutorial,doneTutorial,aiming:session.phase==='aiming',playing:session.phase==='playback',time,plan,before,lastPlan,preview});
    requestAnimationFrame(frame);
  }
  $('saveNote').textContent=loaded||store.message?store.message:'先试一拨，不计成绩';update();
  requestAnimationFrame(frame);
  // Read-only inspection used by the local verification runner; no gameplay commands are exposed.
  window.ChordInspect=()=>D.copy({state:session.state,phase:session.phase,session:session.id,generation,recovering,paused,panel,q,tutorial,settings,time,hash:plan?.hash,log});
  const recoveryGeneration=generation;
  let recoveryTimer;
  Promise.race([durable.load(),new Promise((_,reject)=>{recoveryTimer=setTimeout(()=>reject(Error('SAVE_TIMEOUT')),1200);})]).then(saved=>{
    if(!saved||store.blocked||generation!==recoveryGeneration)return;
    if((saved.data.stamp||0)>=(loaded?.stamp||0)){
      const s=saved.data;boardIndex=s.boardIndex;tutorial=s.tutorial;settings=s.settings;bests=s.bests;session=new D.Session(B[boardIndex],++generation);session.state=s.state;
      session.phase=s.state.shots===0||s.state.consumed.every(Boolean)?'results':'ready';action=s.state.actions.length;store.lastRaw=saved.raw;store.stamp=s.stamp||0;
      store.message=s.state.actions.length?'上一次弹射已结算；已恢复停位和剩余机会。':'已恢复这一盘，4 次机会尚未使用。';
    }
  }).catch(e=>{
    if(e.message==='SAVE_FUTURE_SCHEMA'){store.blocked=true;store.message='存档版本较新。本次可以玩，但不会覆盖原存档。';}
  }).finally(()=>{
    clearTimeout(recoveryTimer);recovering=false;$('saveNote').textContent=store.message||(tutorial?'先试一拨，不计成绩':'准备好就选一个拉点');update();
    if(tutorial&&session.state.actions.length){doneTutorial=true;session.phase='results';openPanel('tutorialEnd');}
    else if(session.phase==='results')openPanel('results');
  });
})();
