const key=/^[A-Z0-9][A-Z0-9-]{0,23}$/;
const day=/^20\d\d-\d\d-\d\d$/;
const validDate=s=>{if(typeof s!=='string'||!day.test(s))return false;const d=new Date(`${s}T00:00:00Z`);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===s;};
const tidy=(value,max)=>typeof value==='string'&&value.trim()&&value.trim().length<=max&&!/[\x00-\x1f\x7f]/.test(value)?value.trim():'';
export const newLoans=()=>({items:[],history:[]});
export function updateLoans(store,action){
 const {kind}=action,code=tidy(action.code,24).toUpperCase(),title=tidy(action.title,100),reader=tidy(action.reader,24).toUpperCase();
 if(!key.test(code))return {error:'badCode'};
 if(kind==='add'){
  if(!title)return {error:'badTitle'};
  if(store.items.some(x=>x.code===code))return {error:'duplicate'};
  if(store.items.length>=80)return {error:'limit'};
  return {next:{items:[...store.items,{code,title}],history:store.history}};
 }
 if(!store.items.some(x=>x.code===code))return {error:'badCode'};
 const open=store.history.find(row=>row.code===code&&!row.returned);
 if(kind==='lend'){
  if(open)return {error:'alreadyOut'};
  if(!key.test(reader)||!validDate(action.issued)||!validDate(action.due)||action.due<action.issued)return {error:'badLoan'};
  if(store.history.length>=80)return {error:'limit'};
  return {next:{items:store.items,history:[...store.history,{code,reader,issued:action.issued,due:action.due,returned:''}]}};
 }
 if(kind==='return'){
  if(!open)return {error:'alreadyIn'};
  if(!validDate(action.today)||action.today<open.issued)return {error:'badDate'};
  return {next:{items:store.items,history:store.history.map(row=>row===open?{...row,returned:action.today}:row)}};
 }
 return {error:'badCode'};
}
export function readLoans(raw){
 let state=newLoans();if(!raw||!Array.isArray(raw.items)||!Array.isArray(raw.history))return state;
 for(const item of raw.items.slice(0,80)){if(item){const {next}=updateLoans(state,{...item,kind:'add'});if(next)state=next;}}
 for(const row of raw.history.slice(0,80))if(row){const {next}=updateLoans(state,{...row,kind:'lend'});if(next){state=next;if(row.returned){const returned=updateLoans(state,{kind:'return',code:row.code,today:row.returned});if(returned.next)state=returned.next;}}}
 return state;
}
export function loanRows(state,today){return state.items.map(item=>{const loan=state.history.find(row=>row.code===item.code&&!row.returned);return {...item,loan,status:loan?loan.due<today?'overdue':'out':'available'};});}
