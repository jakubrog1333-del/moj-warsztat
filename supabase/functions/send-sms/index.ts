// Serwerowa wysyłka SMS: token SMSAPI NIGDY nie trafia do przeglądarki.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.10';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SMSAPI_TOKEN = Deno.env.get('SMSAPI_TOKEN') ?? '';
const SMSAPI_SENDER = Deno.env.get('SMSAPI_SENDER') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);

function asE164(value: string): string | null {
  let number = value.replace(/[\s().-]/g, '');
  if (/^\d{9}$/.test(number)) number = '+48' + number;
  if (/^[1-9]\d{8,14}$/.test(number)) number = '+' + number;
  return /^\+[1-9]\d{8,14}$/.test(number) ? number : null;
}
function response(body: unknown, status: number, cors: Record<string,string>) {
  return new Response(JSON.stringify(body), {status, headers: {...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const allowed = !!origin && ALLOWED_ORIGINS.includes(origin);
  const cors = {
    ...(allowed ? {'Access-Control-Allow-Origin':origin} : {}),
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Vary':'Origin',
  };
  if (request.method === 'OPTIONS') return new Response('', {status:allowed ? 204 : 403,headers:cors});
  if (!allowed) return response({error:'Niedozwolone źródło żądania'},403,cors);
  if (request.method !== 'POST') return response({error:'Metoda niedozwolona'},405,cors);
  if (!SMSAPI_TOKEN || !SERVICE_ROLE_KEY) return response({error:'Brak konfiguracji SMSAPI na serwerze'},503,cors);
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return response({error:'Brak sesji'},401,cors);
  try {
    const data = await request.json();
    const workshopId = String(data.workshop_id || '');
    const customerId = String(data.customer_id || '');
    const message = String(data.message || '').trim();
    const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
    if (!uuid.test(workshopId) || !uuid.test(customerId) || message.length < 2 || message.length > 500) {
      return response({error:'Niepoprawny odbiorca lub treść wiadomości'},400,cors);
    }
    const userDb = createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authHeader}},auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error:userError} = await userDb.auth.getUser();
    if (userError || !user) return response({error:'Wymagane zalogowanie'},401,cors);
    const {data:customer,error:customerError} = await userDb.from('customers').select('phone').eq('workshop_id',workshopId).eq('id',customerId).single();
    if (customerError || !customer) return response({error:'Brak uprawnień do klienta'},403,cors);
    const to = asE164(String(customer.phone||''));
    if (!to) return response({error:'Klient nie ma poprawnego numeru telefonu'},400,cors);
    const {data:logId,error:limitError} = await userDb.rpc('reserve_sms',{p_workshop:workshopId,p_customer:customerId});
    if (limitError) return response({error:limitError.message},429,cors);

    const admin = createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
    const payload = new URLSearchParams({to, message, format:'json'});
    if (SMSAPI_SENDER) payload.set('from',SMSAPI_SENDER);
    let providerOk = false;
    let providerId = '';
    let reason = '';
    try {
      const sms = await fetch('https://api.smsapi.pl/sms.do',{
        method:'POST',headers:{'authorization':`Bearer ${SMSAPI_TOKEN}`,'content-type':'application/x-www-form-urlencoded'},
        body:payload.toString(),signal:AbortSignal.timeout(12000),
      });
      const raw = await sms.text();
      let result: Record<string,unknown> = {};
      try {result = JSON.parse(raw)} catch { /* SMSAPI może zwrócić nie-JSON */ }
      providerOk = sms.ok && !result.error && !result.error_code && Array.isArray(result.list) && result.list.length > 0;
      if (providerOk) providerId = String((result.list as Array<{id?:string}>)[0]?.id || '');
      else reason = `SMSAPI HTTP ${sms.status}`;
    } catch { reason = 'Błąd połączenia z SMSAPI'; }
    await admin.from('sms_log').update({status:providerOk?'sent':'failed',provider_id:providerId||null}).eq('id',logId);
    return providerOk ? response({sent:true},200,cors) : response({sent:false,error:reason},502,cors);
  } catch {
    return response({error:'Błąd przetwarzania żądania'},500,cors);
  }
});
