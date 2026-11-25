const DB = 'smartmaktab-synthetic-approval-outbox';
const STORE = 'submissions';

function open() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'slot'});
    request.onerror=()=>reject(request.error);
    let blocked=false;
    request.onblocked=()=>{ blocked=true; reject(new Error('Outbox storage is blocked')); };
    request.onsuccess=()=>{
      const db=request.result;
      if (blocked) db.close();
      else { db.onversionchange=()=>db.close(); resolve(db); }
    };
  });
}

export function createApprovalOutbox(apiOrigin) {
  // The API origin is part of the slot even though storage is already isolated by page origin.
  const slotFor=(user,school)=>JSON.stringify([apiOrigin,user,school]);
  async function operate(mode,user,school,operation) {
    const db=await open();
    try {
      return await new Promise((resolve,reject)=>{
        const slot=slotFor(user,school);
        const tx=db.transaction(STORE,mode);
        const store=tx.objectStore(STORE);
        let value;
        tx.oncomplete=()=>resolve(value); // Do not send the RPC before the transaction commits.
        tx.onabort=()=>reject(tx.error ?? new Error('Outbox transaction aborted'));
        const get=store.get(slot);
        get.onsuccess=()=>{
          try { value=operation(get.result,store,slot); }
          catch { tx.abort(); }
        };
      });
    } finally { db.close(); }
  }
  return {
    read:(user,school)=>operate('readonly',user,school,current=>current ?? null),
    stage:(user,school,{id,title})=>operate('readwrite',user,school,(current,store,slot)=>{
      if (current) return current;
      const entry={slot,id,title,attempted:false};
      store.add(entry);
      return entry;
    }),
    begin:(user,school,id)=>operate('readwrite',user,school,(current,store)=>{
      if (current?.id!==id) return null;
      if (current.attempted) return current;
      const entry={...current,attempted:true};
      store.put(entry);
      return entry;
    }),
    remove:(user,school,id,{unattemptedOnly=false}={})=>operate('readwrite',user,school,(current,store)=>{
      if (current?.id!==id || (unattemptedOnly && current.attempted)) return false;
      store.delete(current.slot);
      return true;
    })
  };
}
