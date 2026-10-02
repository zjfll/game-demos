(function(root){
  'use strict';
  class DurableStore {
    constructor(boards){this.boards=boards;this.ready=null;this.queue=Promise.resolve();this.strict=false;try{this.api=root.indexedDB;}catch(e){this.api=null;}}
    open(){
      if(this.ready)return this.ready;
      this.ready=new Promise((resolve,reject)=>{
        if(!this.api){reject(Error('SAVE_STORAGE_UNAVAILABLE'));return;}
        const request=this.api.open('pro2demo-1904',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
        request.onerror=()=>reject(Error(request.error?.name==='VersionError'?'SAVE_FUTURE_SCHEMA':'SAVE_STORAGE_UNAVAILABLE'));
        request.onblocked=()=>reject(Error('SAVE_STORAGE_UNAVAILABLE'));
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
      });return this.ready;
    }
    async load(){
      const db=await this.open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('snapshots','readonly'),store=tx.objectStore('snapshots'),values=[];
        ['current','backup'].forEach((key,i)=>{const r=store.get(key);r.onsuccess=()=>values[i]=r.result;});
        tx.onerror=()=>reject(Error('SAVE_STORAGE_UNAVAILABLE'));
        tx.oncomplete=()=>{
          for(const raw of values){if(!raw)continue;try{return resolve({data:root.ChordStore.decode(raw,this.boards),raw});}catch(e){if(e.message==='SAVE_FUTURE_SCHEMA')return reject(e);}}
          resolve(null);
        };
      });
    }
    save(raw){
      const job=async()=>{
        const incoming=root.ChordStore.decode(raw,this.boards),db=await this.open();
        return new Promise((resolve,reject)=>{
          let tx;
          try{tx=db.transaction('snapshots','readwrite',{durability:'strict'});}catch(e){tx=db.transaction('snapshots','readwrite');}
          this.strict=tx.durability==='strict';
          const store=tx.objectStore('snapshots'),get=store.get('current');let failure=null;
          get.onsuccess=()=>{
            const previous=get.result;
            if(previous){
              try{
                const old=root.ChordStore.decode(previous,this.boards);
                if((old.stamp||0)>(incoming.stamp||0)){failure=Error('SAVE_STALE');tx.abort();return;}
                store.put(previous,'backup');
              }catch(e){
                if(e.message==='SAVE_FUTURE_SCHEMA'){failure=e;tx.abort();return;}
                store.put(String(previous).slice(0,180000),'rejected');
              }
            }
            store.put(raw,'current');
          };
          tx.oncomplete=()=>resolve(this.strict);
          tx.onabort=()=>reject(failure||Error('SAVE_STORAGE_UNAVAILABLE'));
          tx.onerror=()=>{failure ||= Error('SAVE_STORAGE_UNAVAILABLE');};
        });
      };
      const pending=this.queue.catch(()=>{}).then(job);this.queue=pending;return pending;
    }
  }
  root.ChordDurable=DurableStore;
})(globalThis);
