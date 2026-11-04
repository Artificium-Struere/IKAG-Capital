// Local test of doPost screening. Run: node apps-script/test/doPost.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const rows = {}, mails = [];
const cacheStore = {};
const ctx = {
  console, Date, JSON, Math, parseInt, isNaN, String, Array, Object,
  CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSheetByName: n => ({ appendRow: v => (rows[n] = rows[n] || []).push(v), getLastRow: () => 1, getSheetId: () => 0 }),
    insertSheet: n => ({ appendRow: v => (rows[n] = rows[n] || []).push(v) }), getUrl: () => 'u' }) },
  GmailApp: { sendEmail: (to, s) => { if (s.length > 250) throw new Error('subject too long'); mails.push(s); } },
  MailApp: { sendEmail: () => {} }, Logger: { log: () => {} },
  ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '0', setProperty: () => {} }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
const TK = ctx.SEC ? null : null;
const tk = vm.runInContext('SEC.FORM_TOKEN', ctx);
const good = (o) => Object.assign({ _tk: tk, _ts: String(Date.now() - 20000), website: '' }, o);
const post = p => ctx.doPost({ postData: { contents: JSON.stringify(p) } });
const screen = (p) => vm.runInContext('screen_', ctx)(p, p.type || p.formType);
let fail = 0;
function expect(label, p, want) {
  const got = screen(p);
  const ok = want === '' ? got === '' : got !== '';
  console.log((ok ? 'PASS ' : 'FAIL ') + label + ' -> ' + (got || 'accepted'));
  if (!ok) fail++;
}
const deal = good({ formType: 'deal-submission', name: 'Jane Smith', email: 'jane@sponsorco.com', phone: '(212) 555-0142',
  company: 'Sponsor Co LLC', ikagRep: '', assetType: 'Multifamily', location: 'Austin, TX', capitalType: 'Bridge',
  capitalAmount: '$5M - $8M', summary: '120-unit value-add, bonus depreciation, $250k earnest money deposit, 18 month timeline. See https://sponsorco.com/deal' });
const ref = good({ formType: 'unsecured-referral', clientName: 'Bob Lee', clientPhone: '555-201-3344', clientCompany: 'Lee Plumbing',
  reason: 'Working capital', repName: 'Ann Rep', repEmail: 'ann@gmail.com', notes: '' });
expect('legit deal', deal, '');
expect('legit referral', ref, '');
expect('legit inquiry', good({ type: 'inquiry', listingId: 'IKAG-0003', fullName: 'José Núñez', email: 'jose@x.co', phone: '+1 305 555 0101', entity: 'JN Holdings', trackRecord: '12 deals' }), '');
expect('legit listing', good({ type: 'listing', name: 'Kim', email: 'kim@kim.com', phone: '6465550000', city: 'Bronx', state: 'NY', description: 'Nice 6-family', photos: [] }), '');
expect('casino bot (real sample)', { formType: 'unsecured-referral', clientName: '* * * 🚀 NEW PROJECT LAUNCH: Get $3000 ... http://reelshub.ru/go-na.php?u10upn 🔑 * * *',
  clientPhone: '948254206644', repEmail: 'shuvankarbyapari69@gmail.com', notes: '4tcew9', referralPartner: 'zq3vtt', repName: 'h93n9t', clientCompany: '8eo5n2', reason: '8xcfzb' }, 'x');
expect('casino w/ stolen token', good({ formType: 'unsecured-referral', clientName: 'Claim $1777 http://rdccii.com/go-bv.php?x', clientPhone: '380334144017', clientCompany: 'ykrmby', reason: 'x34lxu', repName: '789pm1', repEmail: 'a@gmail.com', notes: 'urkezd' }), 'x');
expect('no token', Object.assign({}, deal, { _tk: '' }), 'x');
expect('too fast', Object.assign({}, deal, { _ts: String(Date.now() - 500) }), 'x');
expect('stale', Object.assign({}, deal, { _ts: String(Date.now() - 3 * 86400000) }), 'x');
expect('honeypot', Object.assign({}, deal, { website: 'http://x' }), 'x');
expect('2 links', Object.assign({}, deal, { summary: 'http://a.com http://b.com' }), 'x');
expect('html', Object.assign({}, deal, { summary: '<a href=x>hi</a>' }), 'x');
expect('bad phone', Object.assign({}, deal, { phone: '12' }), 'x');
expect('bad email', Object.assign({}, deal, { email: 'nope' }), 'x');
expect('disposable', Object.assign({}, deal, { email: 'z@mailinator.com' }), 'x');
expect('robertshofe', Object.assign({}, deal, { name: 'RobertShofe' }), 'x');
expect('cyrillic flood', Object.assign({}, deal, { summary: 'Наркологическая клиника помощь круглосуточно анонимно выезд' }), 'x');
expect('long name', Object.assign({}, deal, { name: 'a'.repeat(200) }), 'x');
// rate limit: 5 per email per hour
for (let i = 0; i < 5; i++) screen(Object.assign({}, ref, { repEmail: 'rate@test.com' }));
expect('6th from same email', Object.assign({}, ref, { repEmail: 'rate@test.com' }), 'x');
// end-to-end + long subject fix
const r = post(Object.assign({}, deal, { email: 'e2e@co.com', company: 'C'.repeat(110) }));
console.log(r.t === 'ok' && rows['Deal Submissions'] && mails.length ? 'PASS e2e deal row+mail' : 'FAIL e2e'); if (!(rows['Deal Submissions'] && mails.length)) fail++;
vm.runInContext("notify_({to:'a',subject:'x'.repeat(900),body:''})", ctx);
console.log(mails[mails.length - 1].length <= 180 ? 'PASS subject clipped' : 'FAIL subject');
post({ formType: 'unsecured-referral', clientName: '* * * spam * * *' });
console.log(!rows['Errors'] ? 'PASS spam writes no Errors row' : 'FAIL errors');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
