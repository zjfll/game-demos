(function(root) {
  'use strict';
  const D = root.ChordRules || require('./domain.js');
  const defaults = { mute:false, reduced:false, input:'drag', preview:'short', volume:.35, feedback:'rich', bonus:true };
  function validSettings(s) {
    return s && typeof s.mute==='boolean' && typeof s.reduced==='boolean' && ['drag','toggle'].includes(s.input) &&
      ['off','short','full'].includes(s.preview) && Number.isFinite(s.volume) && s.volume>=0 && s.volume<=1 &&
      ['basic','rich'].includes(s.feedback) && typeof s.bonus==='boolean';
  }
  function decode(raw, boards) {
    if (typeof raw!=='string' || raw.length>180000) throw Error('SAVE_CORRUPT');
    const s=JSON.parse(raw);
    if (s.schema>1) throw Error('SAVE_FUTURE_SCHEMA');
    if (s.stamp!==undefined&&(!Number.isSafeInteger(s.stamp)||s.stamp<0)) throw Error('SAVE_CORRUPT');
    if (s.schema!==1 || s.rules!==D.R.version || !validSettings(s.settings) || typeof s.tutorial!=='boolean' ||
      !Number.isInteger(s.boardIndex) || s.boardIndex<0 || s.boardIndex>=boards.length || !s.state ||
      !Array.isArray(s.state.actions) || s.state.actions.length>4 || s.checksum!==D.hash(s.payload)) throw Error('SAVE_CORRUPT');
    if (D.hash(s.payload)!==D.hash({state:s.state,settings:s.settings,boardIndex:s.boardIndex,tutorial:s.tutorial,bests:s.bests})) throw Error('SAVE_CORRUPT');
    if (D.hash(s.state.board)!==D.hash(boards[s.boardIndex])) throw Error('SAVE_CORRUPT');
    const replay=new D.Session(boards[s.boardIndex]);
    for(const [i,q]of s.state.actions.entries()) {
      replay.phase='aiming';const result=replay.submit({id:'saved-'+i,generation:replay.generation,session:replay.id,q});
      if(!result.ok)throw Error('SAVE_CORRUPT');replay.finish();
    }
    const state=replay.state;
    if (D.hash(state)!==D.hash(s.state)) throw Error('SAVE_CORRUPT');
    if (!s.bests || Object.keys(s.bests).length>18 || Object.entries(s.bests).some(([k,v])=>
      !/^(fan-[12]|wall-[12]|cross-1|leave-1)\|(off|short|full)$/.test(k) || !Number.isInteger(v) || v<0 || v>1000)) throw Error('SAVE_CORRUPT');
    return s;
  }
  function encode(data,stamp=0) {
    const payload={state:data.state,settings:data.settings,boardIndex:data.boardIndex,tutorial:data.tutorial,bests:data.bests};
    return JSON.stringify({schema:1,rules:D.R.version,stamp,...payload,payload,checksum:D.hash(payload)});
  }
  class Store {
    constructor(storage,boards) {this.storage=storage;this.boards=boards;this.key='pro2demo-1904';this.blocked=false;this.message='';this.lastRaw=null;this.stamp=0;}
    load() {
      try {
        let damaged=false;
        for(const suffix of ['', '.backup']) {
          const raw=this.storage.getItem(this.key+suffix); if(!raw) continue;
          try {const s=decode(raw,this.boards);this.lastRaw=raw;this.stamp=s.stamp||0;this.message=damaged?'存档损坏，已恢复上一份有效进度。':s.state.actions.length?'上一次弹射已结算；已恢复停位和剩余机会。':'已恢复这一盘，4 次机会尚未使用。';return s;}
          catch(e) {
            if(e.message==='SAVE_FUTURE_SCHEMA') {this.blocked=true;this.message='存档版本较新。本次可以玩，但不会覆盖原存档。';return null;}
            damaged=true;
            if(!this.storage.getItem(this.key+'.rejected')) this.storage.setItem(this.key+'.rejected',raw.slice(0,180000));
          }
        }
        if(damaged) this.message='存档无法读取，已开始新盘。损坏内容已保留。';
      } catch(e) {this.message='本地保存不可用，本次仍可正常游玩。';}
      return null;
    }
    save(data) {
      if(this.blocked) return false;
      try {
        const raw=encode(data,Math.max(Date.now(),this.stamp+1));const checked=decode(raw,this.boards);this.lastRaw=raw;this.stamp=checked.stamp;
        const old=this.storage.getItem(this.key);
        if(old) {try {decode(old,this.boards);this.storage.setItem(this.key+'.backup',old);} catch(e) { /* Preserve rejected data; do not replace a valid backup. */ }}
        this.storage.setItem(this.key,raw);
        if(this.storage.getItem(this.key)!==raw) throw Error('SAVE_ACK');
        this.message='进度已保存';return true;
      } catch(e) {this.message='保存未成功，本次可继续玩；重新打开可能丢失进度。';return false;}
    }
  }
  const api={defaults,validSettings,decode,encode,Store};root.ChordStore=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
