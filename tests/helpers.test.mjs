import test from 'node:test';
import assert from 'node:assert/strict';
import {esc,fmtDate,fmtMoney,toLocalInput,fromLocalInput,csv,slugPhone,ics} from '../public/helpers.js';

test('sanitizes untrusted HTML, including quotes',()=>{
 assert.equal(esc(`<img onerror='x'>&`),'&lt;img onerror=&#39;x&#39;&gt;&amp;');
});
test('formats date and money safely',()=>{
 assert.equal(fmtDate('nonsense'),'—');
 assert.match(fmtMoney(50),/50/);
});
test('round-trip local datetime consistent',()=>{
 const iso='2026-11-21T14:30:00.000Z';
 assert.equal(fromLocalInput(toLocalInput(iso)),iso);
});
test('exports CSV with spreadsheet injection safely quoted',()=>{
 const result=csv([{a:'Part; "A"'}],[{key:'a',label:'Name'}]);
 assert.match(result,/"Part; ""A"""/);
});
test('protects CSV cells from formula evaluation',()=>{
 const result=csv([{a:'=1+2',b:' +SUM(A1:A2)'}],[{key:'a',label:'Nazwa'},{key:'b',label:'Opis'}]);
 assert.match(result,/"'=1\+2"/);
 assert.match(result,/"' \+SUM/);
});
test('validates phone numbers',()=>{
 assert.equal(slugPhone('501 600 700'),'+48501600700');
 assert.equal(slugPhone('+48 501 600 700'),'+48501600700');
 assert.equal(slugPhone('abc'),'');
});
test('generates valid UTC calendar export with escaped content',()=>{
 const data={id:'123',starts_at:'2026-11-21T10:00:00Z',ends_at:'2026-11-21T11:00:00Z',title:'Naprawa, test',notes:'A;B'};
 const result=ics(data);assert.match(result,/BEGIN:VEVENT\r\n/);assert.match(result,/DTSTART:20261121T100000Z/);
 assert.match(result,/SUMMARY:Naprawa\\, test/);assert.match(result,/DESCRIPTION:A\\;B/);
});
