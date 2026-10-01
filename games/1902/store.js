(function(root) {
  'use strict';
  const PREFIX='sweeprelay.1902.html.v1.';
  class Store {
    constructor(storage, rules) { this.storage=storage; this.rules=rules; this.generation=0; this.warning=''; this.available=true; }
    decode(raw) {
      const e=JSON.parse(raw);
      if (e.schema!==1 || !Number.isSafeInteger(e.generation) || e.generation<1 || this.rules.sha256(JSON.stringify(e.data))!==e.checksum) throw new Error('Invalid save envelope');
      if (!e.data || !e.data.session || !e.data.settings || !Array.isArray(e.data.actions) || e.data.actions.length>50000) throw new Error('Invalid save data');
      const s=this.rules.Session.restore(e.data.session);
      const replayed=new this.rules.Session(s.targets,s.seed);
      for (const action of e.data.actions) {
        if (!action || !['BEGIN','ROTATE','COMMIT','PASS','PAUSE','RESUME'].includes(action.kind) || !Number.isSafeInteger(action.units)) throw new Error('Invalid action');
        if (!replayed.apply(action.kind,action.units).accepted) throw new Error('Rejected saved action');
      }
      if (JSON.stringify(replayed.snapshot())!==JSON.stringify(s.snapshot())) throw new Error('Saved state does not match actions');
      return e;
    }
    slots() {
      return ['a','b'].map(slot=>{
        const raw=this.storage.getItem(PREFIX+slot);
        if (!raw) return {slot,raw:null,envelope:null};
        try {return {slot,raw,envelope:this.decode(raw)};} catch (error) {return {slot,raw,envelope:null,damaged:true};}
      });
    }
    load() {
      try {
        const slots=this.slots(),valid=slots.filter(s=>s.envelope).sort((a,b)=>b.envelope.generation-a.envelope.generation);
        if (slots.some(s=>s.damaged)) this.warning=valid.length?'保存有损坏，已恢复有效备份。':'保存有损坏，原数据已保留；当前从教学局开始。';
        if (valid.length) {this.generation=valid[0].envelope.generation; return valid[0].envelope.data;}
      } catch(error) {this.available=false; this.warning='浏览器未允许本地保存，可从菜单导出记录。';}
      return null;
    }
    save(data) {
      try {
        const slots=this.slots();
        for (const s of slots.filter(s=>s.damaged)) {
          const name=PREFIX+'damaged.'+this.rules.sha256(s.raw).slice(0,16);
          this.storage.setItem(name,s.raw);
          if (this.storage.getItem(name)!==s.raw) throw new Error('Corrupt preservation failed');
        }
        const next=slots.find(s=>!s.envelope)||slots.slice().sort((a,b)=>a.envelope.generation-b.envelope.generation)[0];
        const generation=Math.max(this.generation,...slots.map(s=>s.envelope?s.envelope.generation:0))+1;
        const envelope={schema:1,generation,checksum:this.rules.sha256(JSON.stringify(data)),data};
        const raw=JSON.stringify(envelope);
        this.storage.setItem(PREFIX+next.slot,raw);
        const readback=this.storage.getItem(PREFIX+next.slot);
        if (readback!==raw || this.decode(readback).generation!==generation) throw new Error('Save verification failed');
        this.generation=generation; this.available=true; return true;
      } catch(error) {this.available=false; this.warning='未能保存当前进度，可从菜单导出记录。'; return false;}
    }
  }
  const api={Store,PREFIX};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.SweepStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
