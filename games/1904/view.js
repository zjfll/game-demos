(function(root) {
  'use strict';
  const D=root.ChordRules, colors=['#6dd6c5','#f1c75b','#f39a8b'];
  class BoardView {
    constructor(canvas,arena) {this.canvas=canvas;this.arena=arena;this.ctx=canvas.getContext('2d');this.scale=1;this.resize();}
    resize() {
      const r=this.arena.getBoundingClientRect();
      this.scale=Math.max(.05,Math.min((r.width-2)/960,(r.height-2)/540));
      const w=960*this.scale,h=540*this.scale,dpr=Math.min(window.devicePixelRatio||1,3);
      this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
      this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);
      this.ctx.setTransform(this.canvas.width/960,0,0,this.canvas.height/540,0,0);
    }
    point(e) {const r=this.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*960/r.width,y:(e.clientY-r.top)*540/r.height};}
    circle(p,r,fill,stroke,width=2) {
      const c=this.ctx;c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);
      if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
    }
    line(a,b,color,width=2) {const c=this.ctx;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
    arrow(p,v,color) {
      const speed=Math.hypot(v.x,v.y);if(!speed)return;
      const n={x:v.x/speed,y:v.y/speed},len=35+speed*.055;
      const end={x:p.x+n.x*len,y:p.y+n.y*len};this.line(p,end,color,3);
      this.line(end,{x:end.x-n.x*11-n.y*6,y:end.y-n.y*11+n.x*6},color,3);
      this.line(end,{x:end.x-n.x*11+n.y*6,y:end.y-n.y*11-n.x*6},color,3);
    }
    pearl(p,i) {
      const c=this.ctx;this.circle(p,10,colors[i],'#f5f8ee',1.5);c.strokeStyle='#162723';c.fillStyle='#162723';c.lineWidth=2;
      if(i===0)this.circle(p,3,'#162723');
      if(i===1){this.line({x:p.x-3,y:p.y-5},{x:p.x-3,y:p.y+5},'#162723',2);this.line({x:p.x+3,y:p.y-5},{x:p.x+3,y:p.y+5},'#162723',2);}
      if(i===2){c.beginPath();c.moveTo(p.x,p.y-5);c.lineTo(p.x+5,p.y+4);c.lineTo(p.x-5,p.y+4);c.closePath();c.fill();}
    }
    at(plan,i,t) {
      const frames=plan.traces[i].frames,index=Math.min(360,Math.floor(t*120)),a=frames[index],b=frames[Math.min(360,index+1)],u=Math.min(1,t*120-index);
      return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};
    }
    draw(m) {
      const c=this.ctx;c.clearRect(0,0,960,540);c.fillStyle='#263330';c.fillRect(0,0,960,540);
      c.strokeStyle='#40534a';c.lineWidth=1;
      for(let x=40;x<960;x+=40)for(let y=40;y<540;y+=40){c.fillStyle='#62726930';c.fillRect(x,y,1.5,1.5);}
      c.strokeStyle='#738377';c.lineWidth=2;c.strokeRect(10,10,940,520);
      for(const b of m.state.board.bumpers){
        this.circle(b,b.r,'#768579','#b7c5b9',2);c.save();c.beginPath();c.arc(b.x,b.y,b.r-2,0,Math.PI*2);c.clip();
        for(let a=-b.r*2;a<b.r*2;a+=12)this.line({x:b.x-b.r,y:b.y+a},{x:b.x+b.r,y:b.y+a-b.r*2},'#344a3d',3);c.restore();
      }
      const visible=m.playing?m.before.consumed:m.state.consumed;
      m.state.board.rings.forEach((p,i)=>{
        let hit=null;
        if(m.playing) hit=m.plan.events.find(e=>e.type==='RingHit'&&e.object===i&&e.time<=m.time);
        if(visible[i])return;
        if(hit){const age=m.time-hit.time;if(age>.22||m.settings.reduced)return;c.globalAlpha=1-age/.22;this.circle(p,20+(m.settings.feedback==='rich'?age*30:0),null,colors[hit.pearl],3);c.globalAlpha=1;return;}
        this.circle(p,20,null,'#f1f4df',2.6);this.circle(p,2,'#adbda063');
      });
      if(m.playing||m.lastPlan) {
        const plan=m.playing?m.plan:m.lastPlan,t=m.playing?m.time:plan.duration;
        plan.traces.forEach((tr,i)=>{
          c.globalAlpha=m.settings.reduced?.25:.7;
          for(const s of tr.path){if(s.t0>t)break;if(m.playing&&s.t1<t-(m.settings.reduced?.08:.3))continue;
            if(!m.playing&&s.t1<plan.duration-.45)continue;
            const u=s.t1>t?(t-s.t0)/(s.t1-s.t0):1;
            this.line(s.a,{x:s.a.x+(s.b.x-s.a.x)*u,y:s.a.y+(s.b.y-s.a.y)*u},colors[i],2.5);
          }c.globalAlpha=1;
        });
      }
      if(m.aiming&&m.preview) {
        m.preview.forEach((tr,i)=>{
          const bounces=tr.events.filter(e=>e.type==='SolidBounce');
          const cutoff=m.settings.preview==='full'?3:Math.min(.35,bounces.length?bounces[0].time+.06:3,bounces[1]?.time||3);
          c.setLineDash([7,7]);c.globalAlpha=.65;
          for(const s of tr.path){if(s.t0>=cutoff)break;const u=Math.min(1,(cutoff-s.t0)/(s.t1-s.t0||1));this.line(s.a,{x:s.a.x+(s.b.x-s.a.x)*u,y:s.a.y+(s.b.y-s.a.y)*u},colors[i],2);}
          c.setLineDash([]);c.globalAlpha=1;
        });
      }
      const pearls=m.playing?m.state.pearls.map((_,i)=>this.at(m.plan,i,m.time)):m.state.pearls;
      if(m.aiming || (m.tutorial&&!m.playing&&!m.doneTutorial)) {
        const q=m.aiming?m.q:{x:480,y:460};
        pearls.forEach((p,i)=>{c.globalAlpha=m.aiming?.6:.32;this.line(p,q,colors[i],2);c.globalAlpha=1;this.arrow(p,D.launch(p,q),colors[i]);});
        c.setLineDash(m.aiming?[]:[5,4]);this.circle(q,16,'#172a2370',m.aiming?'#ffffff':'#cbd8b4',2);c.setLineDash([]);
        this.line({x:q.x-5,y:q.y},{x:q.x+5,y:q.y},'#f5f7ec',2);this.line({x:q.x,y:q.y-5},{x:q.x,y:q.y+5},'#f5f7ec',2);
      }
      if(m.playing&&m.time<.12&&!m.settings.reduced){c.globalAlpha=(1-m.time/.12)*.65;m.before.pearls.forEach((p,i)=>this.line(p,m.plan.q,colors[i],2));c.globalAlpha=1;}
      pearls.forEach((p,i)=>this.pearl(p,i));
      if(m.playing)for(const e of m.plan.events){
        const age=m.time-e.time;if(age<0||age>.24)continue;
        if(e.type==='Perfect'){const p=m.state.board.rings[e.object];c.globalAlpha=1-age/.24;this.line({x:p.x-7,y:p.y},{x:p.x+7,y:p.y},'#fff9af',3);this.line({x:p.x,y:p.y-7},{x:p.x,y:p.y+7},'#fff9af',3);c.globalAlpha=1;}
        if(e.type==='SolidBounce'&&!m.settings.reduced){c.globalAlpha=1-age/.24;this.line(e,{x:e.x+e.nx*18,y:e.y+e.ny*18},colors[e.pearl],3);c.globalAlpha=1;}
      }
      if(!m.playing&&m.lastPlan)for(const e of m.lastPlan.events.filter(e=>e.type==='NearMiss')){
        const p=m.state.board.rings[e.object];c.setLineDash([3,5]);this.circle(p,26,null,'#f1c75b99',1.5);c.setLineDash([]);
      }
    }
  }
  class Sound {
    constructor(){this.ctx=null;this.voices=0;}
    unlock(){try{this.ctx ||= new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}catch(e){}}
    tone(freq,kind,settings,delay=0){
      if(!this.ctx||settings.mute||!settings.volume||this.voices>=8)return;
      try{const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=kind;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(settings.volume*.12,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.16);o.connect(g);g.connect(this.ctx.destination);this.voices++;o.onended=()=>{this.voices--;o.disconnect();g.disconnect();};o.start(t);o.stop(t+.18);}catch(e){}
    }
    release(s){[196,247,294].forEach((f,i)=>this.tone(f,['sine','triangle','sine'][i],s,i*.015));}
    event(e,s,n){if(e.type==='RingHit')this.tone(330+Math.min(n,12)*27,'sine',s);if(e.type==='Perfect')this.tone(880,'sine',s);if(e.type==='SolidBounce')this.tone(120+e.pearl*20,'triangle',s);}
  }
  root.ChordView={BoardView,Sound};
})(globalThis);
