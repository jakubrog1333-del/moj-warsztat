export function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
}
export function fmtMoney(number) {
  return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(Number(number)||0);
}
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,16);
}
export function fromLocalInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Niepoprawna data i godzina.');
  return date.toISOString();
}
export function csv(rows, fields) {
  const quote = val => {let s=String(val ?? '');if (/^\s*[=+\-@]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`;};
  return '\uFEFF' + [fields.map(f=>quote(f.label)).join(';'),...rows.map(r=> fields.map(f=>quote(r[f.key])).join(';'))].join('\r\n');
}
export function slugPhone(phone) {
  const p = String(phone || '').replace(/[\s().-]/g,'');
  if (/^\d{9}$/.test(p)) return '+48'+p;
  return /^\+?[1-9]\d{8,14}$/.test(p) ? (p.startsWith('+') ? p : '+'+p) : '';
}
export function ics(appointment) {
  const clean = s => String(s || '').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g, x=>'\\'+x);
  const stamp = d => new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Moj Warsztat//PL', 'BEGIN:VEVENT',
    `UID:${appointment.id}@moj-warsztat`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(appointment.starts_at)}`,`DTEND:${stamp(appointment.ends_at)}`,
    `SUMMARY:${clean(appointment.title)}`, `DESCRIPTION:${clean(appointment.notes)}`,
    'END:VEVENT','END:VCALENDAR'];
  // RFC 5545 line endings.
  return lines.join('\r\n')+'\r\n';
}
