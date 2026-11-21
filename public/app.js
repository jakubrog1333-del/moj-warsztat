import {esc,fmtDate,fmtDateTime,fmtMoney,toLocalInput,fromLocalInput,csv,slugPhone,ics} from './helpers.js';

const cfg=window.WARSZTAT_CONFIG||{};
const root=document.querySelector('#app');
const STATUSES={new:'Nowe',diagnosis:'Diagnostyka',repair:'Naprawa',ready:'Do odbioru',done:'Zakończone'};
const nav=[['dashboard','📊','Pulpit'],['jobs','🛠️','Zlecenia'],['customers','👥','Klienci'],['vehicles','🚗','Pojazdy'],['calendar','📅','Kalendarz'],['photos','📷','Zdjęcia'],['parts','📦','Części'],['sms','✉️','SMS'],['settings','⚙️','Ustawienia']];
const state={sb:null,user:null,workshop:null,members:[],rows:{},view:'dashboard',month:new Date(new Date().getFullYear(),new Date().getMonth(),1),status:'all',search:'',googleToken:null,googleEvents:[],googleConnected:false,busy:false,photoUrl:null,scanStream:null,scanId:null,installPrompt:null};
const getRow=(table,id)=> (state.rows[table]||[]).find(r=>r.id===id);
const customers=()=>state.rows.customers||[];
const vehicles=()=>state.rows.vehicles||[];
const jobs=()=>state.rows.jobs||[];
const appointments=()=>state.rows.appointments||[];
const parts=()=>state.rows.parts||[];
const photoRecords=()=>state.rows.photos||[];
const membership=()=>state.members.find(m=>m.workshop_id===state.workshop?.id);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const avatar=(s='')=>esc(String(s).slice(0,1).toUpperCase());
const empty=(heading,desc='')=>`<div class="empty"><div class="emoji">🗂️</div><b>${heading}</b><p>${desc}</p></div>`;
const statusBadge=status=>`<span class="badge ${esc(status)}">${STATUSES[status]||'—'}</span>`;
const field=(label,input,name,value='',extra='')=>`<div class="field ${extra}"><label for="f_${name}">${label}</label>${input==='textarea'?`<textarea id="f_${name}" name="${name}">${esc(value)}</textarea>`:`<input id="f_${name}" name="${name}" type="${input}" value="${esc(value)}">`}</div>`;
const option=(value,text,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(text)}</option>`;
function selectField(label,name,items,selected='',placeholder='Wybierz…',required=false){return `<div class="field"><label for="f_${name}">${label}</label><select name="${name}" id="f_${name}" ${required?'required':''}>${placeholder?option('',placeholder,selected):''}${items.map(([id,title])=>option(id,title,selected)).join('')}</select></div>`;}
function notice(message,type=''){return `<div class="notice ${type}">${message}</div>`;}
function errorText(e){return String(e?.message||e||'Wystąpił nieznany błąd');}
function toast(message,isError=false){document.querySelector('#toast')?.remove();let node=document.createElement('div');node.id='toast';node.className=`toast${isError?' error':''}`;node.textContent=message;document.body.append(node);setTimeout(()=>node.remove(),5500)}
function modal(title,content){closeCamera();const el=document.querySelector('#modal');if(!el) return;el.innerHTML=`<div class="modal-header"><h3>${title}</h3><button class="icon-btn" data-action="close-modal" aria-label="Zamknij">×</button></div><div class="modal-body">${content}</div>`;el.showModal();}
function closeModal(){closeCamera();if(state.photoUrl){URL.revokeObjectURL(state.photoUrl);state.photoUrl=null}const el=document.querySelector('#modal');if(el?.open)el.close();}
function download(name,contents,type='text/plain;charset=utf-8'){const blob=contents instanceof Blob?contents:new Blob([contents],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function isConfigured(){return typeof cfg.supabaseUrl==='string'&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.supabaseUrl)&&typeof cfg.supabasePublishableKey==='string'&&cfg.supabasePublishableKey.length>35&&!cfg.supabasePublishableKey.startsWith('WSTAW');}
function configScreen(error=''){
  root.innerHTML=`<div class="auth-backdrop"><div class="auth-box"><div class="auth-logo"><span class="brand-mark">⚙</span><b>Mój Warsztat</b></div><h1>Konfiguracja serwera</h1><p>Aplikacja produkcyjna potrzebuje własnego projektu Supabase. Bez niego nie zapisuje ani nie pokazuje danych klientów.</p>${error?notice(esc(error),'error'):notice('To nie jest problem z telefonem — najpierw administrator musi wykonać instalację.', 'warn')}<ol style="padding-left:18px;line-height:1.9;font-size:13px"><li>Utwórz projekt w Supabase.</li><li>Wykonaj plik <code>supabase/migrations/001_initial.sql</code>.</li><li>Uzupełnij <code>public/config.js</code> publicznymi danymi projektu.</li><li>Opublikuj katalog <code>public</code> na GitHub Pages.</li></ol><p class="tiny">Nie wpisuj tutaj klucza <b>service_role</b>, haseł ani tokenu SMSAPI.</p></div></div>`;
}
function authScreen(mode='login',err=''){
  const registration=mode==='signup';
  root.innerHTML=`<div class="auth-backdrop"><div class="auth-box"><div class="auth-logo"><span class="brand-mark">🔧</span><div><b>Mój Warsztat</b><div class="tiny">Bezpieczny panel serwisu</div></div></div><h1>${registration?'Utwórz konto':'Witaj ponownie'}</h1><p>${registration?'Załóż konto e-mail. Właściciel utworzy warsztat, a administrator dołączy przez zaproszenie.':'Zaloguj się, aby uzyskać dostęp do danych Twojego warsztatu.'}</p>${err?notice(esc(err),'error'):''}<form data-form="auth"><input type="hidden" name="mode" value="${registration?'signup':'login'}"><div class="field"><label>Adres e-mail</label><input type="email" name="email" autocomplete="email" required placeholder="adres@firma.pl"></div><div class="field"><label>Hasło</label><input type="password" name="password" minlength="10" autocomplete="${registration?'new-password':'current-password'}" required placeholder="Min. 10 znaków"></div><button type="submit" class="btn primary wide">${registration?'Utwórz konto':'Zaloguj się'}</button></form><div class="separator">lub</div><button class="btn wide" data-action="google-login">Kontynuuj z Google</button><div style="display:flex;justify-content:space-between;gap:8px;margin-top:13px"><button class="link-btn" data-action="auth-mode" data-mode="${registration?'login':'signup'}">${registration?'Mam już konto':'Utwórz konto'}</button><button class="link-btn" data-action="reset-password">Przypomnij hasło</button></div>${location.search.includes('invite=')?notice('Masz zaproszenie — po zalogowaniu zostanie zweryfikowane.'):''}<p class="tiny" style="margin-top:15px">Dane aplikacji są przechowywane na serwerze, a nie w tym pliku HTML.</p></div></div>`;
}
function setBusy(value){state.busy=value;document.querySelectorAll('.btn').forEach(btn=>{if(btn.dataset.action!=='close-modal') btn.disabled=value})}
async function init(){
  if(!isConfigured()){configScreen();return;}
  try{
    const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.10/+esm');
    state.sb=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
    state.sb.auth.onAuthStateChange((ev,session)=>{
      if(['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(ev)){
        if((state.user?.id||null)!==(session?.user?.id||null)) setTimeout(()=>bootstrap(),0);
      }
      if(ev==='PASSWORD_RECOVERY') setTimeout(()=>promptNewPassword(),0);
    });
    await bootstrap();
  }catch(e){configScreen('Nie udało się wczytać biblioteki logowania. Sprawdź połączenie internetowe i konfigurację. '+errorText(e))}
}
async function bootstrap(){
  if(!state.sb)return;
  root.innerHTML='<main class="boot"><div class="spinner"></div><p>Sprawdzanie konta…</p></main>';
  const {data:{user},error}=await state.sb.auth.getUser();
  if(error||!user){state.user=null;state.workshop=null;state.googleToken=null;authScreen();return;}
  state.user=user;
  try{
    const invitation=new URLSearchParams(location.search).get('invite');
    if(invitation){
      const {data:joined,error:inviteError}=await state.sb.rpc('accept_admin_invite',{p_token:invitation});
      if(!inviteError && joined){
        sessionStorage.setItem('mw_workshop',joined);
        const next=new URL(location.href);next.searchParams.delete('invite');history.replaceState({},'',next.pathname+next.search+next.hash);
        toast('Dołączono do warsztatu jako administrator');
      }else if(inviteError){toast('Nie udało się przyjąć zaproszenia: '+inviteError.message,true)}
    }
    await loadMemberships();
    if(!state.members.length){setupScreen();return;}
    const remembered=sessionStorage.getItem('mw_workshop');
    const target=state.members.find(m=>m.workshop_id===remembered)||state.members[0];
    state.workshop=target.workshops;
    await loadRows();
    render();
  }catch(e){root.innerHTML=`<div class="auth-backdrop"><div class="auth-box"><h1>Nie udało się otworzyć bazy</h1>${notice(esc(errorText(e)),'error')}<button class="btn" data-action="retry">Spróbuj ponownie</button><button class="btn danger" data-action="logout">Wyloguj się</button></div></div>`;}
}
async function loadMemberships(){
  const {data,error}=await state.sb.from('members').select('workshop_id,role,workshops(id,name,phone,owner_id)').order('created_at');
  if(error)throw error;
  state.members=(data||[]).filter(m=>m.workshops);
}
async function queryAll(table){
  const result=[];let offset=0;const batch=500;
  while(true){
    const {data,error}=await state.sb.from(table).select('*').eq('workshop_id',state.workshop.id).order(table==='calendar_links'?'appointment_id':'id',{ascending:true}).range(offset,offset+batch-1);
    if(error)throw error;
    result.push(...(data||[]));
    if(!data||data.length<batch)break;
    offset+=batch;
    if(offset>=10000){toast(`Osiągnięto limit 10 000 rekordów w ${table}; konieczne stronicowanie.`,true);break;}
  }
  return result;
}
async function loadRows(){
  const tables=['customers','vehicles','jobs','appointments','parts','photos','calendar_links'];
  const results=await Promise.all(tables.map(table=>queryAll(table)));
  tables.forEach((table,i)=>state.rows[table]=results[i]);
  const {data:members,error:membersError}=await state.sb.from('members').select('workshop_id,user_id,role').eq('workshop_id',state.workshop.id);
  if(membersError)throw membersError;
  state.rows._members=members||[];
}
function setupScreen(message=''){
  const invite=new URLSearchParams(location.search).get('invite')||'';
  root.innerHTML=`<div class="auth-backdrop"><div class="auth-box"><div class="auth-logo"><span class="brand-mark">🔧</span><b>Mój Warsztat</b></div><h1>Pierwsze uruchomienie</h1><p>Jesteś zalogowany jako <b>${esc(state.user.email)}</b>. Utwórz własny warsztat lub przyjmij zaproszenie od właściciela.</p>${message?notice(esc(message),'warn'):''}${invite?`<form data-form="accept-invite"><input type="hidden" name="token" value="${esc(invite)}"><button class="btn primary wide" type="submit">Przyjmij zaproszenie administratora</button></form><div class="divider"></div>`:''}<form data-form="create-workshop"><div class="field"><label>Nazwa warsztatu</label><input name="name" required minlength="2" maxlength="120" placeholder="np. Auto Serwis Kowalski"></div><div class="field"><label>Telefon warsztatu</label><input name="phone" type="tel" placeholder="np. 501 234 567"></div><button type="submit" class="btn primary wide">Utwórz warsztat jako właściciel</button></form><button class="link-btn" data-action="logout">Wyloguj się</button><p class="tiny">Właściciel może później wysłać administratorowi jednorazowe zaproszenie na wskazany adres e-mail.</p></div></div>`;
}
function sectionHeader(title,subtitle,actions=''){return `<div class="page-head"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="actions">${actions}</div></div>`}
function navHtml(item){return `<button class="nav-btn ${state.view===item[0]?'active':''}" data-action="nav" data-view="${item[0]}"><span>${item[1]}</span>${item[2]}</button>`}
function render(){
  if(!state.workshop)return setupScreen();
  const section=nav.find(n=>n[0]===state.view)||nav[0];
  const content={dashboard:renderDashboard,jobs:renderJobs,customers:renderCustomers,vehicles:renderVehicles,calendar:renderCalendar,photos:renderPhotos,parts:renderParts,sms:renderSms,settings:renderSettings}[state.view]();
  root.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">🔧</span><div><b>Mój Warsztat</b><small>Panel serwisowy</small></div></div><div class="nav-title">Zarządzanie</div>${nav.slice(0,5).map(navHtml).join('')}<div class="nav-title">Narzędzia</div>${nav.slice(5).map(navHtml).join('')}<div class="sidebar-end"><strong>${esc(state.workshop.name)}</strong><span>${membership()?.role==='owner'?'Właściciel':'Administrator'} • Twoje dane są w chmurze</span></div></aside><main class="main"><header class="topbar"><div><h1>${section[1]} ${section[2]}</h1><p>${esc(state.workshop.name)}</p></div><div class="top-actions"><span class="chip">● Serwer</span><span class="user-chip" title="${esc(state.user.email)}">${esc(state.user.email)}</span><button class="btn small" data-action="refresh">↻ Odśwież</button></div></header><div class="content">${content}</div></main><nav class="mobile-nav">${[['dashboard','🏠','Start'],['jobs','🔧','Zlecenia'],['calendar','📅','Terminy'],['customers','👥','Klienci'],['settings','⚙️','Więcej']].map(n=>`<button data-action="nav" data-view="${n[0]}" class="${state.view===n[0]?'active':''}"><span class="mi">${n[1]}</span>${n[2]}</button>`).join('')}</nav></div><dialog id="modal" class="modal"></dialog>`;
}
function findCustomer(id){return getRow('customers',id)?.name||'—'}
function findVehicle(id){const v=getRow('vehicles',id);return v?`${v.make} ${v.model} ${v.registration?'· '+v.registration:''}`:'—'}
function findJob(id){const j=getRow('jobs',id);return j?j.title:'—'}
function renderDashboard(){
  const counts={total:jobs().length,active:jobs().filter(x=>!['done'].includes(x.status)).length,ready:jobs().filter(x=>x.status==='ready').length,today:appointments().filter(x=>toLocalInput(x.starts_at).slice(0,10)===today()).length};
  const cards=[['Aktywne zlecenia',counts.active,'🛠️','Zadania w toku'],['Do odbioru',counts.ready,'✅','Samochody gotowe'],['Wszystkie zlecenia',counts.total,'📋','Historia zleceń'],['Wizyty dziś',counts.today,'📅','Z kalendarza warsztatu']];
  return `${sectionHeader('Dzień dobry!','Przegląd aktualnej pracy warsztatu.',`<button class="btn primary" data-action="edit" data-table="jobs">＋ Nowe zlecenie</button>`)}<div class="grid cols-4">${cards.map(c=>`<div class="card"><div class="stat-top"><span class="stat-label">${c[0]}</span><span class="stat-icon">${c[2]}</span></div><div class="stat-value">${c[1]}</div><div class="stat-detail">${c[3]}</div></div>`).join('')}</div><div class="grid cols-2 section-gap"><section class="card"><h3>Ostatnie zlecenia</h3>${jobs().length?`<div class="table-wrap"><table class="table"><thead><tr><th>Zlecenie</th><th>Status</th><th></th></tr></thead><tbody>${[...jobs()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,5).map(j=>`<tr><td class="wrap"><b>${esc(j.title)}</b><div class="tiny">${esc(findVehicle(j.vehicle_id))}</div></td><td>${statusBadge(j.status)}</td><td><button class="btn small" data-action="edit" data-table="jobs" data-id="${j.id}">Otwórz</button></td></tr>`).join('')}</tbody></table></div>`:empty('Nie ma jeszcze zleceń','Dodaj pierwsze zlecenie, aby rozpocząć.')}</section><section class="card"><h3>Najbliższe wizyty</h3>${appointments().length?`<div class="table-wrap"><table class="table"><thead><tr><th>Termin</th><th>Wizyta</th><th></th></tr></thead><tbody>${appointments().filter(x=>new Date(x.ends_at)>new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).slice(0,5).map(a=>`<tr><td>${fmtDateTime(a.starts_at)}</td><td class="wrap">${esc(a.title)}</td><td><button class="btn small" data-action="edit" data-table="appointments" data-id="${a.id}">Otwórz</button></td></tr>`).join('')}</tbody></table></div>`:empty('Brak nadchodzących wizyt')}</section></div><div class="section-gap">${notice('🔐 Dane klientów, pojazdów, zdjęć i zleceń są przechowywane w prywatnym projekcie Supabase. Dostęp zależy od rzeczywistej roli użytkownika.')}</div>`;
}
function tableHtml(heads,rows){return rows.length?`<div class="table-wrap"><table class="table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:empty('Nie ma jeszcze wpisów','Dodaj pierwszy rekord przyciskiem powyżej.')}
function renderJobs(){
 const filtered=jobs().filter(j=>(state.status==='all'||state.status===j.status)&&`${j.title} ${findCustomer(j.customer_id)} ${findVehicle(j.vehicle_id)}`.toLowerCase().includes(state.search.toLowerCase())).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 return `${sectionHeader('Zlecenia napraw','Twórz, realizuj i zamykaj zlecenia.',`<button class="btn primary" data-action="edit" data-table="jobs">＋ Nowe zlecenie</button>`)}<div class="toolbar"><div class="pill-row">${[['all','Wszystkie'],...Object.entries(STATUSES)].map(([k,v])=>`<button class="pill ${state.status===k?'active':''}" data-action="status" data-status="${k}">${v}</button>`).join('')}</div><form data-form="search" class="actions"><input name="search" placeholder="Szukaj zlecenia…" value="${esc(state.search)}"><button class="btn" type="submit">Szukaj</button></form></div>${tableHtml(['Zlecenie / pojazd','Klient','Przyjęto','Planowany termin','Status','Kosztorys','Akcje'],filtered.map(j=>`<tr><td class="wrap"><b>${esc(j.title)}</b><div class="tiny">${esc(findVehicle(j.vehicle_id))}</div></td><td>${esc(findCustomer(j.customer_id))}</td><td>${esc(j.received_on)}</td><td>${j.due_on?esc(j.due_on):'—'}</td><td>${statusBadge(j.status)}</td><td>${fmtMoney(j.estimate)}</td><td><button class="btn small" data-action="edit" data-table="jobs" data-id="${j.id}">Edytuj</button><button class="btn small danger" data-action="delete" data-table="jobs" data-id="${j.id}">Usuń</button></td></tr>`))}`;
}
function renderCustomers(){
 const rows=[...customers()].sort((a,b)=>a.name.localeCompare(b.name,'pl'));
 return `${sectionHeader('Baza klientów','Dane kontaktowe i historia obsługiwanych pojazdów.',`<button class="btn primary" data-action="edit" data-table="customers">＋ Dodaj klienta</button>`)}${tableHtml(['Klient','Telefon','Adres e-mail','Pojazdy','Akcje'],rows.map(c=>`<tr><td class="strong">${esc(c.name)}</td><td>${esc(c.phone||'—')}</td><td>${esc(c.email||'—')}</td><td>${vehicles().filter(v=>v.customer_id===c.id).length}</td><td><button class="btn small" data-action="edit" data-table="customers" data-id="${c.id}">Edytuj</button><button class="btn small danger" data-action="delete" data-table="customers" data-id="${c.id}">Usuń</button></td></tr>`))}`;
}
function renderVehicles(){
 const rows=[...vehicles()].sort((a,b)=>(a.registration||a.make).localeCompare(b.registration||b.make,'pl'));
 return `${sectionHeader('Pojazdy','VIN, przebiegi, właściciele i przypisanie do zleceń.',`<button class="btn primary" data-action="edit" data-table="vehicles">＋ Dodaj pojazd</button>`)}${tableHtml(['Pojazd','Rejestracja','VIN','Przebieg','Klient','Akcje'],rows.map(v=>`<tr><td class="strong">${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.registration||'—')}</td><td><span class="tiny">${esc(v.vin||'—')}</span></td><td>${v.mileage!=null?Number(v.mileage).toLocaleString('pl-PL')+' km':'—'}</td><td>${esc(findCustomer(v.customer_id))}</td><td><button class="btn small" data-action="edit" data-table="vehicles" data-id="${v.id}">Edytuj</button><button class="btn small danger" data-action="delete" data-table="vehicles" data-id="${v.id}">Usuń</button></td></tr>`))}`;
}
function calendarGrid(){
 const y=state.month.getFullYear(),m=state.month.getMonth();
 const first=new Date(y,m,1),offset=(first.getDay()+6)%7;
 const items=['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(n=>`<div class="cal-label">${n}</div>`);
 for(let d=0;d<42;d++){
   const date=new Date(y,m,1+d-offset);const day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
   const events=appointments().filter(a=>toLocalInput(a.starts_at).slice(0,10)===day).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
   items.push(`<button class="cal-day ${date.getMonth()!==m?'dim':''} ${day===today()?'today':''}" data-action="calendar-day" data-date="${day}"><span class="cal-num">${date.getDate()}</span>${events.slice(0,3).map(a=>`<span class="cal-item">${esc(toLocalInput(a.starts_at).slice(11,16))} ${esc(a.title)}</span>`).join('')}${events.length>3?`<span class="tiny">+${events.length-3}</span>`:''}</button>`);
 }
 return `<div class="calendar">${items.join('')}</div>`;
}
function renderCalendar(){
 const label=new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric'}).format(state.month);
 const events=appointments().slice().sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 return `${sectionHeader('Kalendarz warsztatu','Terminy są wspólne dla warsztatu. Google jest połączony osobno dla każdego użytkownika.',`<button class="btn" data-action="google-connect">${state.googleToken?'✓ Połączono Google':'Połącz Kalendarz Google'}</button><button class="btn primary" data-action="edit" data-table="appointments">＋ Nowa wizyta</button>`)}${notice('Synchronizacja z Google jest uruchamiana ręcznie przez zalogowanego użytkownika. Aplikacja nie przechowuje jego tokenu Google w bazie ani nie kopiuje wydarzeń automatycznie.')}<div class="card"><div class="calendar-bar"><div class="actions"><button class="btn small" data-action="month" data-shift="-1">‹</button><button class="btn small" data-action="month" data-shift="0">Dzisiaj</button><button class="btn small" data-action="month" data-shift="1">›</button></div><span class="calendar-month">${esc(label)}</span></div>${calendarGrid()}</div><div class="grid cols-2 section-gap"><section class="card"><h3>Wizyty warsztatu</h3>${events.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Opis</th><th></th></tr></thead><tbody>${events.slice(0,25).map(a=>`<tr><td>${fmtDateTime(a.starts_at)}</td><td class="wrap">${esc(a.title)}</td><td><div class="actions"><button class="btn small" data-action="edit" data-table="appointments" data-id="${a.id}">Edytuj</button><button class="btn small" data-action="ics" data-id="${a.id}">.ics</button><button class="btn small" data-action="google-push" data-id="${a.id}">Google</button><button class="btn small danger" data-action="delete" data-table="appointments" data-id="${a.id}">×</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('Brak wizyt')}</section><section class="card"><div class="toolbar" style="margin:0 0 8px"><h3 style="margin:0">Mój Kalendarz Google</h3><button class="btn small" data-action="google-fetch">↻ Pobierz terminy</button></div>${state.googleToken?state.googleEvents.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Termin</th><th>Wydarzenie</th></tr></thead><tbody>${state.googleEvents.slice(0,20).map(g=>`<tr><td>${fmtDateTime(g.start?.dateTime||g.start?.date)}</td><td class="wrap">${esc(g.summary||'Bez nazwy')}</td></tr>`).join('')}</tbody></table></div>`:empty('Połączono z Google','Kliknij „Pobierz terminy”.'):empty('Google niepołączony','Kliknij „Połącz Kalendarz Google”, aby wybrać własne konto.')}</section></div>`;
}
function renderPhotos(){
 return `${sectionHeader('Zdjęcia uszkodzeń','Prywatne zdjęcia przypięte do zleceń.',`<button class="btn primary" data-action="photo-upload">📷 Dodaj zdjęcie</button>`)}${notice('Zdjęcia są zapisywane w prywatnym magazynie plików. Ich podgląd jest pobierany po sprawdzeniu sesji i uprawnień.')}${photoRecords().length?`<div class="photo-grid">${[...photoRecords()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(p=>`<div class="photo-item"><div class="photo-icon">📸</div><b>${esc(findJob(p.job_id))}</b><p class="tiny">${esc(p.note||'Brak opisu')}<br>${fmtDateTime(p.created_at)}</p><div class="actions"><button class="btn small" data-action="photo-view" data-id="${p.id}">Zobacz</button><button class="btn small danger" data-action="photo-delete" data-id="${p.id}">Usuń</button></div></div>`).join('')}</div>`:empty('Nie dodano zdjęć')}`;
}
function renderParts(){
 return `${sectionHeader('Magazyn części','Stany magazynowe oraz eksport zapytań dla dostawców.',`<button class="btn" data-action="parts-csv">↓ Eksport CSV</button><button class="btn primary" data-action="edit" data-table="parts">＋ Dodaj część</button>`)}${notice('Integracje dostawców przez API wymagają zawarcia umowy i uzyskania dostępu. Obecna wersja pozwala zarządzać magazynem i eksportować listę zapotrzebowania, bez udawania aktualnych cen z hurtowni.', 'warn')}${tableHtml(['Część','Numer katalogowy','Dostawca','Cena zakupu','Ilość','Akcje'],parts().map(p=>`<tr><td class="strong wrap">${esc(p.name)}</td><td>${esc(p.sku||'—')}</td><td>${esc(p.supplier||'—')}</td><td>${fmtMoney(p.price)}</td><td><span class="badge ${p.qty<=2?'diagnosis':'ready'}">${p.qty} szt.</span></td><td><button class="btn small" data-action="edit" data-table="parts" data-id="${p.id}">Edytuj</button><button class="btn small danger" data-action="delete" data-table="parts" data-id="${p.id}">Usuń</button></td></tr>`))}`;
}
function renderSms(){
 return `${sectionHeader('Wiadomości SMS','Wysyłaj powiadomienia po sprawdzeniu treści i odbiorcy.')}${cfg.smsEnabled?notice('Automatyczne SMS korzystają z serwerowej funkcji Supabase i konta SMSAPI. Wiadomość jest wysyłana wyłącznie po kliknięciu „Wyślij SMS”.'):notice('Wysyłka automatyczna jest wyłączona do czasu skonfigurowania serwerowej funkcji SMSAPI. Możesz nadal przygotować wiadomość i otworzyć aplikację SMS w telefonie.', 'warn')}<div class="grid cols-2"><section class="card"><h3>Nowa wiadomość</h3><form data-form="sms"><div class="field"><label>Odbiorca</label><select name="customer_id" required><option value="">Wybierz klienta…</option>${customers().filter(c=>slugPhone(c.phone)).map(c=>option(c.id,`${c.name} · ${c.phone}`,'' )).join('')}</select></div><div class="field"><label>Szablon</label><select name="template" data-template><option value="ready">Samochód gotowy do odbioru</option><option value="reminder">Przypomnienie o wizycie</option><option value="custom">Własna wiadomość</option></select></div><div class="field"><label>Treść do zatwierdzenia</label><textarea name="message" rows="5" required maxlength="500">Dzień dobry, informujemy, że samochód jest gotowy do odbioru. Pozdrawiamy, ${esc(state.workshop.name)}.</textarea></div><div class="actions"><button type="submit" name="send_type" value="phone" class="btn">📱 Otwórz SMS w telefonie</button>${cfg.smsEnabled?'<button type="submit" name="send_type" value="api" class="btn primary">Wyślij przez SMSAPI</button>':''}</div></form></section><section class="card"><h3>Ważne informacje</h3><p class="muted">SMS może zawierać dane kontaktowe klienta, dlatego upewnij się, że masz właściwą podstawę prawną do wysyłki i aktualny numer telefonu.</p><div class="detail"><b>Odbiorca</b><span>Tylko klient zapisany w Twoim warsztacie</span></div><div class="detail"><b>Automatyczne SMS</b><span>${cfg.smsEnabled?'Włączone (wymagają serwera)':'Wyłączone'}</span></div><div class="detail"><b>Limit bezpieczeństwa</b><span>25 SMS na użytkownika / 24 godziny</span></div><div class="divider"></div><p class="tiny">Wiadomości transakcyjne nie zastępują zgód i obowiązków dotyczących komunikacji marketingowej.</p></section></div>`;
}
function renderSettings(){
 const owner=membership()?.role==='owner';
 const people=(state.rows._members||state.members.filter(m=>m.workshop_id===state.workshop.id));
 return `${sectionHeader('Ustawienia','Konfiguracja warsztatu i przydział uprawnień.')}
 <div class="grid cols-2"><section class="card"><h3>Profil warsztatu</h3><form data-form="workshop-settings"><div class="field"><label>Nazwa warsztatu</label><input name="name" minlength="2" maxlength="120" required value="${esc(state.workshop.name)}" ${owner?'':'disabled'}></div><div class="field"><label>Telefon kontaktowy</label><input name="phone" maxlength="40" value="${esc(state.workshop.phone)}" ${owner?'':'disabled'}></div>${owner?'<button class="btn primary" type="submit">Zapisz ustawienia</button>':''}</form><div class="divider"></div><div class="detail"><b>Twoja rola</b><span>${owner?'Właściciel':'Administrator techniczny'}</span></div><div class="detail"><b>Twoje konto</b><span>${esc(state.user.email)}</span></div><div class="actions section-gap"><button class="btn" data-action="change-workshop">Zmień warsztat</button><button class="btn danger" data-action="logout">Wyloguj się</button></div></section><section class="card"><h3>Użytkownicy</h3>${owner?notice('Tylko właściciel może zaprosić lub usunąć administratora.') : notice('Zarządzasz aplikacją i danymi warsztatu. Właściciel kontroluje przydział dostępu.')}${tableHtml(['Konto / identyfikator','Rola',''],people.map(m=>`<tr><td class="tiny">${esc(m.user_id||m.id||'—')}</td><td>${m.role==='owner'?'Właściciel':'Admin'}</td><td>${owner&&m.role==='admin'?`<button class="btn small danger" data-action="remove-admin" data-user="${m.user_id}">Cofnij</button>`:''}</td></tr>`))}${owner?`<div class="divider"></div><h3>Zaproś administratora</h3><form data-form="invite"><div class="field"><label>E-mail administratora</label><input name="email" type="email" required placeholder="adres@domena.pl"></div><button class="btn primary" type="submit">Utwórz zaproszenie (48 h)</button></form><div id="invite-result"></div>`:''}</section></div><div class="card section-gap"><h3>Pozostałe moduły</h3><div class="actions"><button class="btn" data-action="nav" data-view="vehicles">🚗 Pojazdy</button><button class="btn" data-action="nav" data-view="photos">📷 Zdjęcia</button><button class="btn" data-action="nav" data-view="parts">📦 Części</button><button class="btn" data-action="nav" data-view="sms">✉️ SMS</button></div></div><div class="card section-gap"><h3>Telefon i kalendarz</h3><p class="muted">Na telefonie otwórz stronę przez HTTPS i wybierz „Dodaj do ekranu głównego”. W systemie Android PWA można instalować z menu przeglądarki; na iPhone z menu Udostępnij.</p><div class="actions"><button class="btn" data-action="install">📲 Zainstaluj PWA</button><button class="btn" data-action="google-connect">📅 Połącz Google</button><button class="btn" data-action="google-disconnect">Odłącz Google</button></div><p class="tiny">Logowanie do aplikacji i połączenie Kalendarza Google to osobne zgody. Token Kalendarza Google istnieje tylko w bieżącej sesji karty.</p></div>`;
}
function openEditor(table,id='',date=''){
 const r=id?getRow(table,id):{};if(id&&!r){toast('Nie znaleziono rekordu',true);return;}
 let body='';let label='';
 const formStart=`<form data-form="save" data-table="${table}" data-id="${esc(id)}"><div class="form-grid">`;
 const formEnd=`</div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">Anuluj</button><button type="submit" class="btn primary">Zapisz</button></div></form>`;
 const clients=customers().map(c=>[c.id,c.name]);
 if(table==='customers'){
   label=id?'Edytuj klienta':'Nowy klient';
   body=formStart+field('Imię i nazwisko / firma','text','name',r.name||'')+field('Telefon','tel','phone',r.phone||'')+field('E-mail','email','email',r.email||'')+field('Notatki','textarea','notes',r.notes||'','full')+formEnd;
 }
 if(table==='vehicles'){
   label=id?'Edytuj pojazd':'Nowy pojazd';
   body=formStart+selectField('Właściciel pojazdu','customer_id',clients,r.customer_id,'Wybierz klienta…',true)+field('Marka','text','make',r.make||'')+field('Model','text','model',r.model||'')+field('Numer rejestracyjny','text','registration',r.registration||'')+`<div class="field"><label for="f_vin">VIN (17 znaków)</label><div class="actions"><input style="flex:1;min-width:150px" id="f_vin" name="vin" minlength="0" maxlength="17" value="${esc(r.vin||'')}" placeholder="VIN"><button class="btn small" type="button" data-action="scan-vin">📷 Skanuj</button></div></div>`+field('Rok produkcji','number','year',r.year||'')+field('Przebieg [km]','number','mileage',r.mileage??'')+formEnd;
 }
 if(table==='jobs'){
   label=id?'Edytuj zlecenie':'Nowe zlecenie';
   body=formStart+selectField('Klient','customer_id',clients,r.customer_id,'Wybierz klienta…',true)+selectField('Pojazd','vehicle_id',vehicles().map(v=>[v.id,`${v.make} ${v.model} · ${v.registration} (${findCustomer(v.customer_id)})`]),r.vehicle_id,'Bez pojazdu')+field('Tytuł naprawy','text','title',r.title||'')+selectField('Status','status',Object.entries(STATUSES),r.status||'new','')+field('Data przyjęcia','date','received_on',r.received_on||today())+field('Planowany odbiór','date','due_on',r.due_on||'')+field('Orientacyjny koszt [PLN]','number','estimate',r.estimate||0)+field('Opis usterki / wykonanych prac','textarea','description',r.description||'','full')+formEnd;
 }
 if(table==='appointments'){
   label=id?'Edytuj termin':'Nowa wizyta';
   const start=date?date+'T09:00':toLocalInput(r.starts_at)||toLocalInput(new Date(Date.now()+3600000).toISOString());
   const end=date?date+'T10:00':toLocalInput(r.ends_at)||toLocalInput(new Date(Date.now()+7200000).toISOString());
   body=formStart+field('Tytuł wizyty','text','title',r.title||'Przyjęcie samochodu')+selectField('Zlecenie (opcjonalnie)','job_id',jobs().map(j=>[j.id,j.title+' — '+findCustomer(j.customer_id)]),r.job_id,'Bez zlecenia')+field('Początek','datetime-local','starts_at',start)+field('Koniec','datetime-local','ends_at',end)+field('Uwagi','textarea','notes',r.notes||'','full')+formEnd;
 }
 if(table==='parts'){
   label=id?'Edytuj część':'Dodaj część';
   body=formStart+field('Nazwa części','text','name',r.name||'')+field('Numer katalogowy','text','sku',r.sku||'')+field('Dostawca','text','supplier',r.supplier||'')+field('Cena zakupu PLN','number','price',r.price||0)+field('Ilość na stanie','number','qty',r.qty??0)+formEnd;
 }
 if(!body)return;
 modal(label,body);
 // Domyślne walidacje wymaganych pól — SQL też je sprawdzi.
 for(const key of (table==='customers'?['name']:table==='vehicles'?['make']:table==='jobs'?['title']:table==='appointments'?['title','starts_at','ends_at']:table==='parts'?['name']:[])){
   const el=document.querySelector(`#f_${key}`);if(el)el.required=true;
 }
}
function openPhotoUpload(){
 if(!jobs().length){toast('Najpierw dodaj zlecenie',true);return;}
 modal('Dodaj zdjęcie uszkodzenia',`<form data-form="photo"><div class="form-grid">${selectField('Zlecenie','job_id',jobs().map(j=>[j.id,j.title+' — '+findVehicle(j.vehicle_id)]),'','Wybierz zlecenie…',true)}<div class="field"><label>Zdjęcie z aparatu lub galerii</label><input name="image" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required></div>${field('Opis zdjęcia','textarea','note','','full')}</div><p class="tiny">Maksymalny rozmiar 10 MB. Zdjęcie nie jest publiczne.</p><div class="form-actions"><button class="btn" type="button" data-action="close-modal">Anuluj</button><button class="btn primary" type="submit">Prześlij zdjęcie</button></div></form>`);
}
async function handleSave(form){
 const table=form.dataset.table;const id=form.dataset.id;const f=new FormData(form);let value={};
 const trim=name=>String(f.get(name)||'').trim();
 if(table==='customers')value={name:trim('name'),phone:trim('phone'),email:trim('email'),notes:trim('notes')};
 if(table==='vehicles')value={customer_id:trim('customer_id'),make:trim('make'),model:trim('model'),registration:trim('registration').toUpperCase(),vin:trim('vin').toUpperCase(),year:trim('year')?Number(trim('year')):null,mileage:trim('mileage')?Number(trim('mileage')):null};
 if(table==='jobs')value={customer_id:trim('customer_id'),vehicle_id:trim('vehicle_id')||null,title:trim('title'),status:trim('status'),received_on:trim('received_on'),due_on:trim('due_on')||null,estimate:Number(trim('estimate')||0),description:trim('description')};
 if(table==='appointments'){
   const start=fromLocalInput(trim('starts_at'));const end=fromLocalInput(trim('ends_at'));
   if(new Date(end)<=new Date(start))throw new Error('Koniec wizyty musi być po początku.');
   value={job_id:trim('job_id')||null,title:trim('title'),starts_at:start,ends_at:end,notes:trim('notes')};
 }
 if(table==='parts')value={name:trim('name'),sku:trim('sku'),supplier:trim('supplier'),price:Number(trim('price')||0),qty:Number(trim('qty')||0)};
 if(table==='vehicles' && value.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(value.vin))throw new Error('VIN musi mieć 17 znaków bez liter I, O, Q.');
 if(table==='jobs' && value.vehicle_id){const v=getRow('vehicles',value.vehicle_id);if(v?.customer_id!==value.customer_id)throw new Error('Wybrany pojazd należy do innego klienta.');}
 const request=id?state.sb.from(table).update(value).eq('id',id).eq('workshop_id',state.workshop.id):state.sb.from(table).insert({...value,workshop_id:state.workshop.id});
 const {error}=await request;
 if(error)throw error;
 closeModal();await loadRows();render();toast('Zapisano pomyślnie');
}
async function deleteRecord(table,id){
 const label={customers:'klienta',vehicles:'pojazd',jobs:'zlecenie',appointments:'wizytę',parts:'część'}[table]||'rekord';
 if(!confirm(`Na pewno usunąć ${label}? Tej operacji nie można cofnąć.${table==='appointments'?' Wydarzenie w Google Calendar pozostanie i trzeba usunąć je osobno.':''}`))return;
 const {error}=await state.sb.from(table).delete().eq('workshop_id',state.workshop.id).eq('id',id);
 if(error)throw error;
 await loadRows();render();toast('Usunięto wpis');
}
async function handlePhotoUpload(form){
 const f=new FormData(form);const file=f.get('image');const job=String(f.get('job_id')||'');
 if(!(file instanceof File)||!file.size)throw new Error('Wybierz zdjęcie');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Dozwolone: JPG, PNG lub WebP do 10 MB');
 if(!getRow('jobs',job))throw new Error('Nieprawidłowe zlecenie');
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
 const path=`${state.workshop.id}/${job}/${crypto.randomUUID()}.${ext}`;
 const {error:uploadError}=await state.sb.storage.from('damage-photos').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'60'});
 if(uploadError)throw uploadError;
 const {error:metaError}=await state.sb.from('photos').insert({workshop_id:state.workshop.id,job_id:job,object_path:path,note:String(f.get('note')||'').slice(0,500),uploaded_by:state.user.id});
 if(metaError){await state.sb.storage.from('damage-photos').remove([path]);throw metaError;}
 closeModal();await loadRows();render();toast('Zdjęcie zapisane prywatnie');
}
async function viewPhoto(id){
 const p=getRow('photos',id);if(!p)return;
 const {data,error}=await state.sb.storage.from('damage-photos').download(p.object_path);
 if(error)throw error;
 const url=URL.createObjectURL(data);state.photoUrl=url;
 modal('Zdjęcie — '+esc(findJob(p.job_id)),`<img src="${url}" alt="Zdjęcie uszkodzenia" style="max-width:100%;max-height:65vh;display:block;margin:auto;border-radius:12px"><p class="muted">${esc(p.note||'')}</p>`);
}
async function deletePhoto(id){
 if(!confirm('Usunąć zdjęcie ze zlecenia?'))return;
 const p=getRow('photos',id);if(!p)return;
 const {error:storageError}=await state.sb.storage.from('damage-photos').remove([p.object_path]);
 if(storageError)throw storageError;
 const {error}=await state.sb.from('photos').delete().eq('workshop_id',state.workshop.id).eq('id',id);
 if(error)throw error;
 await loadRows();render();toast('Zdjęcie usunięte');
}
function stopCamera(){if(state.scanId){cancelAnimationFrame(state.scanId);state.scanId=null;}if(state.scanStream){state.scanStream.getTracks().forEach(t=>t.stop());state.scanStream=null;}}
function closeCamera(){stopCamera()}
async function scanVin(){
 if(!('BarcodeDetector' in window)){toast('Ta przeglądarka nie obsługuje skanowania kodów. Możesz wpisać VIN ręcznie.',true);return;}
 let stream;
 try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
   state.scanStream=stream;
   const where=document.querySelector('#f_vin')?.closest('.field');
   if(!where){stopCamera();return;}
   const video=document.createElement('video');video.className='camera-video';video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=stream;where.appendChild(video);
   await video.play();
   const formats=(await BarcodeDetector.getSupportedFormats()).filter(x=>['code_39','code_128','pdf417','data_matrix'].includes(x));
   if(!formats.length)throw new Error('Brak obsługiwanych formatów kodów VIN');
   const detector=new BarcodeDetector({formats});
   let last=0;
   async function tick(ts){
     if(!state.scanStream||!video.isConnected)return;
     if(ts-last>420){last=ts;try{
       const codes=await detector.detect(video);
       for(const code of codes){const vin=String(code.rawValue||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
         if(/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)){const inp=document.querySelector('#f_vin');if(inp)inp.value=vin;stopCamera();video.remove();toast('Odczytano VIN');return;}}
     }catch{ /* kolejne klatki */ }}
     state.scanId=requestAnimationFrame(tick);
   }
   state.scanId=requestAnimationFrame(tick);
 }catch(e){stopCamera();toast('Nie można uruchomić skanera: '+errorText(e),true)}
}
let googleSdkPromise;
function googleSdk(){
 if(window.google?.accounts?.oauth2)return Promise.resolve();
 if(!googleSdkPromise)googleSdkPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
   script.onload=resolve;script.onerror=()=>reject(new Error('Nie można załadować Google Identity Services'));
   document.head.append(script);
 });
 return googleSdkPromise;
}
async function googleConnect(){
 if(!cfg.googleClientId || !cfg.googleClientId.endsWith('.apps.googleusercontent.com')||cfg.googleClientId.startsWith('WSTAW')){
   toast('Administrator musi ustawić Google OAuth Client ID w public/config.js.',true);return;
 }
 await googleSdk();
 const gis=window.google?.accounts?.oauth2;
 if(!gis){toast('Nie załadowano Google Identity Services. Sprawdź internet i blokady przeglądarki.',true);return;}
 const client=gis.initTokenClient({client_id:cfg.googleClientId,scope:'https://www.googleapis.com/auth/calendar.events',callback:(result)=>{
   if(result.error){toast('Google: '+result.error,true);return;}
   state.googleToken=result.access_token;state.googleConnected=true;toast('Połączono Kalendarz Google w tej sesji');render();
 }});
 client.requestAccessToken({prompt:'consent'});
}
async function googleRequest(path,options={}){
 if(!state.googleToken)throw new Error('Najpierw połącz swój Kalendarz Google.');
 const response=await fetch(`https://www.googleapis.com/calendar/v3/${path}`,{
   ...options,headers:{'Authorization':`Bearer ${state.googleToken}`,'Content-Type':'application/json',...(options.headers||{})}
 });
 if(response.status===401){state.googleToken=null;state.googleEvents=[];render();throw new Error('Sesja Google wygasła — połącz Google ponownie.');}
 if(!response.ok){let details='';try{details=(await response.json())?.error?.message||''}catch{}
   throw new Error(`Google Calendar: ${response.status} ${details}`.trim());}
 return response.status===204?{}:response.json();
}
async function fetchGoogle(){
 const now=new Date(),end=new Date(now.getTime()+60*86400000);
 const search=new URLSearchParams({timeMin:now.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'100'});
 const result=await googleRequest('calendars/primary/events?'+search.toString());
 state.googleEvents=result.items||[];render();toast('Pobrano '+state.googleEvents.length+' terminów z Google.');
}
async function pushGoogle(id){
 const a=getRow('appointments',id);if(!a)return;
 if(!state.googleToken)throw new Error('Połącz Kalendarz Google i spróbuj ponownie.');
 if(!confirm(`Zapisać wizytę „${a.title}” w Twoim Kalendarzu Google? Treść i termin zostaną przesłane do Google.`))return;
 const existing=(state.rows.calendar_links||[]).find(x=>x.appointment_id===a.id&&x.user_id===state.user.id);
 const payload={summary:a.title,description:a.notes||'Wizyta warsztatu',start:{dateTime:a.starts_at},end:{dateTime:a.ends_at}};
 let event;
 if(existing){
   try{event=await googleRequest('calendars/primary/events/'+encodeURIComponent(existing.google_event_id),{method:'PATCH',body:JSON.stringify(payload)})}
   catch(e){if(!String(e.message).includes('404'))throw e;}
 }
 if(!event){
   // Idempotentny identyfikator wydarzenia: ponowne kliknięcie nie powinno tworzyć duplikatu.
   const seed=new TextEncoder().encode(state.workshop.id+':'+state.user.id+':'+a.id);
   const digest=await crypto.subtle.digest('SHA-256',seed);
   const stableId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   try{event=await googleRequest('calendars/primary/events',{method:'POST',body:JSON.stringify({...payload,id:stableId})});}
   catch(e){if(!String(e.message).includes('409'))throw e;
     event=await googleRequest('calendars/primary/events/'+stableId,{method:'PATCH',body:JSON.stringify(payload)});
   }
 }
 if(existing){
   const {error}=await state.sb.from('calendar_links').update({google_event_id:event.id,updated_at:new Date().toISOString()}).eq('workshop_id',state.workshop.id).eq('appointment_id',a.id).eq('user_id',state.user.id);
   if(error)throw error;
 }else{
   const {error}=await state.sb.from('calendar_links').insert({workshop_id:state.workshop.id,appointment_id:a.id,user_id:state.user.id,google_event_id:event.id});
   if(error)throw error;
 }
 await loadRows();render();toast('Termin zapisany w Google Calendar');
}
async function handleSms(form,button){
 const f=new FormData(form),customerId=String(f.get('customer_id')||'');const c=getRow('customers',customerId);
 const msg=String(f.get('message')||'').trim();
 if(!c)throw new Error('Wybierz klienta');
 if(msg.length<2||msg.length>500)throw new Error('Treść powinna mieć od 2 do 500 znaków.');
 const phone=slugPhone(c.phone);if(!phone)throw new Error('Numer klienta jest niepoprawny');
 if(button?.value!=='api'){
   const url=`sms:${phone}?body=${encodeURIComponent(msg)}`;
   window.location.href=url;toast('Otwieram aplikację wiadomości w telefonie. SMS nie został wysłany automatycznie.');return;
 }
 if(!cfg.smsEnabled)throw new Error('SMSAPI jest wyłączone');
 if(!confirm(`Wysłać płatną wiadomość SMS do ${c.name} (${phone})?`))return;
 const {data,error}=await state.sb.functions.invoke('send-sms',{body:{workshop_id:state.workshop.id,customer_id:c.id,message:msg}});
 if(error)throw new Error('Nie udało się wysłać SMS: '+errorText(error));
 if(!data?.sent)throw new Error(data?.error||'SMS nie został wysłany');
 toast('SMS przekazano do SMSAPI');
}
async function handleInvitation(form){
 const email=String(new FormData(form).get('email')||'').trim().toLowerCase();
 const {data:token,error}=await state.sb.rpc('create_admin_invite',{p_workshop:state.workshop.id,p_email:email});
 if(error)throw error;
 const link=new URL(window.location.href);link.search='';link.searchParams.set('invite',token);
 const parent=document.querySelector('#invite-result');
 if(parent)parent.innerHTML=`${notice('Zaproszenie aktywne przez 48 godzin. Wyślij ten link administratorowi.')}<div class="invitation" id="invite-link">${esc(link.toString())}</div><button class="btn small" data-action="copy-invite">Kopiuj link</button><p class="tiny">Zaproszenie działa tylko po zalogowaniu na e-mail: ${esc(email)}</p>`;
 toast('Utworzono zaproszenie');
}
async function acceptInvitation(token){
 const {data,error}=await state.sb.rpc('accept_admin_invite',{p_token:token});
 if(error)throw error;
 const next=new URL(location.href);next.searchParams.delete('invite');history.replaceState({},'',next.pathname+next.search+next.hash);
 sessionStorage.setItem('mw_workshop',data);
 await bootstrap();toast('Dołączono do warsztatu jako administrator');
}
async function logout(){closeModal();state.googleToken=null;state.googleEvents=[];state.workshop=null;sessionStorage.removeItem('mw_workshop');await state.sb.auth.signOut();state.user=null;authScreen();}
function promptNewPassword(){const pwd=prompt('Ustaw nowe hasło (minimum 10 znaków)');if(!pwd)return;state.sb.auth.updateUser({password:pwd}).then(({error})=>toast(error?error.message:'Hasło zostało zmienione',!!error));}
async function switchWorkshop(){
 if(state.members.length<2){toast('Twoje konto ma dostęp tylko do jednego warsztatu');return;}
 modal('Wybierz warsztat',`<div class="grid">${state.members.map(m=>`<button class="btn" data-action="choose-workshop" data-id="${m.workshop_id}">${esc(m.workshops.name)} — ${m.role==='owner'?'właściciel':'administrator'}</button>`).join('')}</div>`);
}
async function handleAction(el){
 const action=el.dataset.action;
 if(action==='close-modal'){closeModal();return;}
 if(action==='auth-mode'){authScreen(el.dataset.mode);return;}
 if(action==='nav'){state.view=el.dataset.view;state.search='';render();return;}
 if(action==='status'){state.status=el.dataset.status;render();return;}
 if(action==='edit'){openEditor(el.dataset.table,el.dataset.id);return;}
 if(action==='photo-upload'){openPhotoUpload();return;}
 if(action==='scan-vin'){await scanVin();return;}
 if(action==='photo-view'){await viewPhoto(el.dataset.id);return;}
 if(action==='photo-delete'){await deletePhoto(el.dataset.id);return;}
 if(action==='delete'){await deleteRecord(el.dataset.table,el.dataset.id);return;}
 if(action==='month'){const step=Number(el.dataset.shift);state.month=step===0?new Date(new Date().getFullYear(),new Date().getMonth(),1):new Date(state.month.getFullYear(),state.month.getMonth()+step,1);render();return;}
 if(action==='calendar-day'){openEditor('appointments','',el.dataset.date);return;}
 if(action==='ics'){const item=getRow('appointments',el.dataset.id);if(item)download(`wizyta-${el.dataset.id.slice(0,8)}.ics`,ics(item),'text/calendar;charset=utf-8');return;}
 if(action==='google-connect'){await googleConnect();return;}
 if(action==='google-fetch'){await fetchGoogle();return;}
 if(action==='google-push'){await pushGoogle(el.dataset.id);return;}
 if(action==='google-disconnect'){if(state.googleToken&&window.google?.accounts?.oauth2)window.google.accounts.oauth2.revoke(state.googleToken,()=>{});state.googleToken=null;state.googleEvents=[];render();toast('Odłączono bieżącą sesję Google');return;}
 if(action==='parts-csv'){download('magazyn-czesci.csv',csv(parts(),[{key:'name',label:'Część'},{key:'sku',label:'Numer'},{key:'supplier',label:'Dostawca'},{key:'qty',label:'Stan'},{key:'price',label:'Cena'}]),'text/csv;charset=utf-8');return;}
 if(action==='logout'){await logout();return;}
 if(action==='retry'){await bootstrap();return;}
 if(action==='choose-workshop'){const m=state.members.find(x=>x.workshop_id===el.dataset.id);if(!m)return;sessionStorage.setItem('mw_workshop',m.workshop_id);state.workshop=m.workshops;state.view='dashboard';await loadRows();render();return;}
 if(action==='change-workshop'){await switchWorkshop();return;}
 if(action==='copy-invite'){await navigator.clipboard.writeText(document.querySelector('#invite-link').textContent);toast('Link skopiowany');return;}
 if(action==='remove-admin'){
   if(!confirm('Cofnąć tej osobie dostęp do danych warsztatu?'))return;
   const {error}=await state.sb.rpc('remove_admin',{p_workshop:state.workshop.id,p_user:el.dataset.user});if(error)throw error;
   await loadRows();render();toast('Dostęp cofnięty');return;
 }
 if(action==='install'){
   if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;}
   else alert('Android: menu przeglądarki → Zainstaluj aplikację. iPhone: Udostępnij → Do ekranu początkowego.');return;
 }
 if(action==='google-login'){
   const {error}=await state.sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname+location.search}});
   if(error)throw error;return;
 }
 if(action==='reset-password'){
   const email=prompt('Wpisz adres e-mail do odzyskania hasła:');if(!email)return;
   const {error}=await state.sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
   if(error)throw error;toast('Jeśli konto istnieje, e-mail z instrukcją został wysłany.');return;
 }
}
async function handleForm(form,ev){
 const kind=form.dataset.form;const f=new FormData(form);
 if(kind==='auth'){
   const email=String(f.get('email')||'').trim(),password=String(f.get('password')||'');
   if(f.get('mode')==='signup'){
     const {data,error}=await state.sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname+location.search}});
     if(error)throw error;
     if(!data.session){authScreen('login','Konto utworzone. Sprawdź wiadomość potwierdzającą e-mail, a następnie się zaloguj.');return;}
   }else{
     const {error}=await state.sb.auth.signInWithPassword({email,password});if(error)throw error;
   }
   await bootstrap();return;
 }
 if(kind==='create-workshop'){
   const {data,error}=await state.sb.rpc('create_workshop',{p_name:String(f.get('name')||''),p_phone:String(f.get('phone')||'')});
   if(error)throw error;sessionStorage.setItem('mw_workshop',data);await bootstrap();return;
 }
 if(kind==='accept-invite'){await acceptInvitation(String(f.get('token')));return;}
 if(kind==='save'){await handleSave(form);return;}
 if(kind==='photo'){await handlePhotoUpload(form);return;}
 if(kind==='search'){state.search=String(f.get('search')||'');render();return;}
 if(kind==='sms'){await handleSms(form,ev.submitter);return;}
 if(kind==='invite'){await handleInvitation(form);return;}
 if(kind==='workshop-settings'){
   const {data,error}=await state.sb.from('workshops').update({name:String(f.get('name')||'').trim(),phone:String(f.get('phone')||'').trim()}).eq('id',state.workshop.id).select().single();
   if(error)throw error;state.workshop=data;render();toast('Zapisano ustawienia');return;
 }
}
document.addEventListener('click',async ev=>{
 const target=ev.target.closest('[data-action]');if(!target)return;
 ev.preventDefault();try{await handleAction(target)}catch(e){toast(errorText(e),true)}
});
document.addEventListener('submit',async ev=>{
 const form=ev.target.closest('form[data-form]');if(!form)return;
 ev.preventDefault();if(state.busy)return;
 setBusy(true);
 try{await handleForm(form,ev)}catch(e){toast(errorText(e),true)}finally{setBusy(false)}
});
document.addEventListener('change',event=>{
 const target=event.target;if(target.matches('[data-template]')){
   const textarea=target.closest('form')?.querySelector('textarea[name=message]');if(!textarea)return;
   const templates={ready:`Dzień dobry, informujemy, że samochód jest gotowy do odbioru. Pozdrawiamy, ${state.workshop.name}.`,reminder:`Przypominamy o umówionej wizycie w warsztacie ${state.workshop.name}. Pozdrawiamy.`,custom:''};
   textarea.value=templates[target.value]??'';
 }
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event});
window.addEventListener('online',()=>{if(state.user&&state.workshop)toast('Odzyskano połączenie z internetem')});
if('serviceWorker'in navigator&&(['https:','http:'].includes(location.protocol))){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
// Natychmiast zainicjuj klienta. Bez konfiguracji wyświetl wyłącznie instrukcję.
await init();
