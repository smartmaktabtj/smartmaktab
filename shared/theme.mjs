const themeStorageKey='smartmaktab.theme.v1';
export function storedTheme(){
 try{const value=localStorage.getItem(themeStorageKey);return value==='dark'||value==='light'?value:null;}catch{return null;}
}
export function installTheme(button,{initial,onChange}={}){
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 let preferred=initial==='dark'||initial==='light'?initial:storedTheme();
 const mode=()=>preferred??(media.matches?'dark':'light');
 function refresh(){
  const dark=mode()==='dark',tg=document.documentElement.lang==='tg';
  document.documentElement.dataset.theme=dark?'dark':'light';
  const text=dark?(tg?'Реҷаи рӯзона':'Дневной режим'):(tg?'Реҷаи шабона':'Ночной режим');
  button.textContent=dark?'☀ '+text:'☾ '+text;
  button.setAttribute('aria-label',text);
 }
 function set(value){
  if(value!=='dark'&&value!=='light')return;
  preferred=value;
  try{localStorage.setItem(themeStorageKey,value);}catch{}
  refresh();onChange?.(value);
 }
 button.addEventListener('click',()=>set(mode()==='dark'?'light':'dark'));
 media.addEventListener('change',refresh);
 refresh();
 return {mode,set,refresh};
}
