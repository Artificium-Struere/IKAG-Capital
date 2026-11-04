/**
 * IKAG Capital — form and listings backend.
 *
 * Bound to the "IKAG Submissions" spreadsheet, deployed as a web app under
 * contact@ikag.capital. This file is a complete replacement for the script
 * contents: it keeps the existing referral and deal handlers untouched and
 * adds the listings program on top, so pasting it whole is safe.
 *
 * Deployment must be: Execute as = Me, Who has access = Anyone.
 * See DEPLOY.md in this folder.
 */

/* Who gets the alert on every submission. Comma separated, no spaces.
 *
 * Add a second address that is NOT contact@ikag.capital. This script runs as
 * contact@ikag.capital, and Gmail can file a message you send to yourself with
 * your Sent mail instead of putting it in your inbox. A second address removes
 * all doubt, because it is never both sender and recipient.
 *
 *   var NOTIFY_EMAIL = 'contact@ikag.capital,you@gmail.com';
 */
var NOTIFY_EMAIL  = 'contact@ikag.capital';
var IKAG_PHONE    = '(866) 778-1354';
var PHOTO_ROOT    = 'IKAG Listing Photos';

/* Names/emails that never create deal rows or alert emails (junk / abuse).
 * Match is case-insensitive substring across name, email, company, and related fields.
 * Submissions are still logged to All Submissions as BLOCKED so we have a record.
 */
var BLOCKED_SUBMITTERS = [
  'robertshofe',
  'robert shofe',
  'robert.shofe',
  'xmnoqznp@formtests.info',
  'spkbgd@1win.xyz',
  // 2026-11-04 casino / "$3,222" spam flood on unsecured-referral
  '1win.xyz', '1win.com', 'go-bv.php', 'go-na.php', 'bonus balance',
  '$3,222', 'promo code', 'bonus code', 'zero deposit', 'no deposit needed',
  'hs=51c603359b7b61aaa2493fce921d47b4', 'hs=a365fe9aa69c61075327eb6fafdabfe0',
  'bgg~671lbkbz0p7mt7ywd',
  'dragueopr.net', 'jetroom.ru', 'rdccii.com', 'darejeans.com', 'fretigo.com',
  'drive-piscine.fr', 'recrootixsolution.com', 'a711lions.org', 'kodomoji.com',
  'reelshub.ru', 'neastar.ru', 'hosomi-kogyo.co.jp', 'meghahpl.com',
  'advodocs.ru', 'toomat.ru', 'drkaze.ru', 'apollobulk.com', 'demolinkace.com',
  // older non-casino junk on deal-submission
  'mickeybrent', 'narcolog', 'formtests.info'
];

/* ------------------------------------------------------- anti-spam config
 * See SECURITY-PARAMETERS.md at the repo root for what each one does and
 * how to tune it. Every rejection returns the same silent "ok" so a bot
 * cannot tell which rule caught it.
 */
var SEC = {
  FORM_TOKEN:        'ikag-fv1-7Hq2Lm9X',  // must match IKAG_FORM_TOKEN in the site pages
  REQUIRE_TOKEN:     true,                 // false = log-only for the token/timestamp checks
  HONEYPOT_FIELD:    'website',            // hidden input; humans leave it empty
  MIN_FILL_MS:       3000,                 // faster than 3 s from page render = bot
  MAX_AGE_MS:        24 * 3600 * 1000,     // form rendered more than 24 h ago = stale/replayed
  PER_EMAIL_PER_HOUR: 5,                   // same email, any form
  GLOBAL_PER_MINUTE: 20,                   // all forms combined; excess dropped silently
  GLOBAL_PER_HOUR:   120,
  MAX_NAME_LEN:      120,                  // name / company / short fields
  MAX_TEXT_LEN:      5000,                 // notes / summary / description / trackRecord
  MAX_LINKS_ANY_FIELD: 1,                  // more than this many links in one field = reject
  MAX_NON_ASCII_RATIO: 0.30,               // share of non-ASCII chars in all text
  REJECT_LOG_PER_HOUR: 25,                 // cap on BLOCKED rows written to All Submissions
  ERROR_LOG_PER_HOUR:  30,                 // cap on rows written to Errors
  MAX_SUBJECT_LEN:   180                   // Gmail rejects very long subjects
};

var SHORT_FIELDS_ = ['name', 'fullName', 'clientName', 'repName', 'company', 'entity',
                     'clientCompany', 'ikagRep', 'reason', 'assetType', 'location',
                     'capitalType', 'capitalAmount', 'city', 'state', 'role',
                     'category', 'propertyType', 'listingId', 'phone', 'clientPhone',
                     'email', 'repEmail'];
var NAME_FIELDS_  = ['name', 'fullName', 'clientName', 'repName', 'company', 'entity',
                     'clientCompany', 'ikagRep'];
var LONG_FIELDS_  = ['notes', 'summary', 'description', 'trackRecord', 'address'];

/* Fields the real site never sends. The 2026 casino bot posts `referralPartner`
 * (from an old form layout), so its presence alone marks a bot. */
var FOREIGN_FIELDS_ = ['referralPartner'];

var SPAM_RE_ = /(\* \* \*|go-[a-z]{2}\.php|promo ?code|bonus code|bonus account|bonus balance|welcome bonus|casino|slot machine|slot players|free spins|jackpot|no deposit|zero deposit|1win|crypto giveaway|viagra|cialis|narcolog|seo services|backlinks)/i;

var DISPOSABLE_DOMAINS_ = ['formtests.info', 'mailinator.com', 'guerrillamail.com', 'sharklasers.com',
  '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'yopmail.com', 'trashmail.com',
  'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com',
  'mohmal.com', 'emailondeck.com', 'mintemail.com', '1win.xyz'];

var TAB_ALL       = 'All Submissions';
var TAB_REFERRALS = 'Unsecured Referrals';
var TAB_DEALS     = 'Deal Submissions';
var TAB_LISTINGS  = 'IKAG Listings';
var TAB_INQUIRIES = 'Listing Inquiries';
var TAB_ERRORS    = 'Errors';

/* Only these statuses are ever served to the public page. */
var PUBLIC_STATUSES = ['Approved', 'Under Contract'];

/* ------------------------------------------------------------------ setup */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  tab_(ss, TAB_ALL,       ['Timestamp', 'Source', 'Raw Data']);
  tab_(ss, TAB_REFERRALS, ['Timestamp', 'Client Name', 'Client Phone', 'Client Company',
                           'Reason for Financing', 'Rep Name', 'Rep Email', 'Notes']);
  tab_(ss, TAB_DEALS,     ['Timestamp', 'Name', 'Email', 'Phone', 'Company / Sponsorship Entity',
                           'IKAG Representative', 'Asset Type', 'Location', 'Capital Type Needed',
                           'Approximate Capital Amount', 'Short Deal Summary']);
  tab_(ss, TAB_LISTINGS,  LISTING_HEADERS_);
  tab_(ss, TAB_INQUIRIES, ['Timestamp', 'Listing ID', 'Full Name', 'Email', 'Phone',
                           'Entity / Company', 'Track Record', 'Property']);
  tab_(ss, TAB_ERRORS,    ['Timestamp', 'Error', 'Raw Data']);

  DriveApp.getRootFolder();           // forces the Drive scope prompt during setup
  folder_(PHOTO_ROOT);

  Logger.log('Script runs as:   ' + Session.getEffectiveUser().getEmail());
  Logger.log('Notify email:     ' + NOTIFY_EMAIL);
  Logger.log('Email quota left: ' + MailApp.getRemainingDailyQuota());
  Logger.log('Photo folder:     ' + folder_(PHOTO_ROOT).getUrl());

  notify_({
    to: NOTIFY_EMAIL,
    subject: 'IKAG setup test',
    body: 'Tabs and the listing photo folder are ready.\n'
  });
}

var LISTING_HEADERS_ = [
  'Listing ID', 'Timestamp', 'Status', 'Lister Name', 'Lister Email', 'Lister Phone',
  'Company / Entity', 'Role', 'Category', 'Property Type', 'Full Address', 'City', 'State',
  'Asking Price', 'Units', 'Sq Ft', 'ARV', 'Rent', 'Description', 'Photo File IDs'
];

/* ------------------------------------------------------------------- doGet */

/**
 * Public read. Returns only Approved and Under Contract rows, and only the
 * fields a visitor is allowed to see. The full address, the lister's name,
 * email and phone are never written into the response.
 */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};

  if (p.action === 'ping') {
    return json_({ ok: true, message: 'IKAG endpoint is live.', time: new Date().toISOString() });
  }

  try {
    return json_({ ok: true, listings: publicListings_() });
  } catch (err) {
    logError_(err, p);
    return json_({ ok: false, error: 'Could not load listings.' });
  }
}

function publicListings_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_LISTINGS);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(1, 1, sh.getLastRow(), LISTING_HEADERS_.length).getValues();
  var head   = values.shift();
  var col    = {};
  head.forEach(function (h, i) { col[h] = i; });

  var out = [];
  values.forEach(function (r) {
    var status = String(r[col['Status']] || '').trim();
    if (PUBLIC_STATUSES.indexOf(status) === -1) return;

    var ids = String(r[col['Photo File IDs']] || '')
      .split(',').map(function (s) { return s.trim(); }).filter(String);

    // Whitelist, not blacklist: only these keys are ever emitted.
    out.push({
      id:           String(r[col['Listing ID']] || ''),
      status:       status,
      category:     String(r[col['Category']] || ''),
      propertyType: String(r[col['Property Type']] || ''),
      city:         String(r[col['City']] || ''),
      state:        String(r[col['State']] || ''),
      askingPrice:  num_(r[col['Asking Price']]),
      units:        blank_(r[col['Units']]),
      sqft:         blank_(r[col['Sq Ft']]),
      arv:          blank_(r[col['ARV']]),
      rent:         blank_(r[col['Rent']]),
      description:  String(r[col['Description']] || ''),
      listedOn:     iso_(r[col['Timestamp']]),
      photos:       ids.map(function (id) {
                      return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
                    })
    });
  });

  out.sort(function (a, b) { return (b.listedOn || '').localeCompare(a.listedOn || ''); });
  return out;
}


function isBlockedSubmitter_(p) {
  var hay = [
    p.name, p.fullName, p.clientName, p.repName, p.email, p.repEmail,
    p.company, p.entity, p.clientCompany,
    p.notes, p.reason, p.summary, p.referralPartner, p.ikagRep
  ].join(' ').toLowerCase();
  for (var i = 0; i < BLOCKED_SUBMITTERS.length; i++) {
    if (hay.indexOf(BLOCKED_SUBMITTERS[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ doPost */

/**
 * Routes on `type` for the listings program and on `formType` for the
 * existing forms, so both keep working. Accepts either a urlencoded form
 * post or a JSON body sent as text/plain.
 */
function doPost(e) {
  var p = params_(e);
  var kind = String(p.type || p.formType || 'unknown').slice(0, 40);
  var why = '';
  try { why = screen_(p, kind); } catch (err) { why = 'screen-error'; }

  if (why) {
    // Silent OK: no data row, no email, no Errors row. Log a capped sample only.
    if (underCap_('rejlog', SEC.REJECT_LOG_PER_HOUR, 3600)) {
      try {
        logRow_(TAB_ALL, [new Date(), 'BLOCKED ' + kind + ' [' + why + ']',
                          truncate_(JSON.stringify(scrub_(p)), 2000)]);
      } catch (ignored) {}
    }
    return ok_();
  }

  try {
    logRow_(TAB_ALL, [new Date(), 'POST ' + kind, truncate_(JSON.stringify(scrub_(p)), 45000)]);
  } catch (ignored) {}

  try {
    if (kind === 'listing')              return json_(handleListing_(p));
    if (kind === 'inquiry')              return json_(handleInquiry_(p));
    if (kind === 'unsecured-referral') { handleUnsecured_(p); return ok_(); }
    if (kind === 'deal-submission')    { handleDeal_(p);      return ok_(); }
    return ok_();
  } catch (err) {
    logError_(err, p);
    return json_({ ok: false, error: String(err) });
  }
}

/* -------------------------------------------------------------- screening */

/** Returns '' to accept, or a short reason code to drop silently. */
function screen_(p, kind) {
  var KNOWN = ['listing', 'inquiry', 'unsecured-referral', 'deal-submission'];
  if (KNOWN.indexOf(kind) === -1) return 'unknown-kind';

  // 1. Honeypot
  if (String(p[SEC.HONEYPOT_FIELD] || '').trim() !== '') return 'honeypot';

  // 2. Token + render timestamp (only real pages running our JS have these)
  if (SEC.REQUIRE_TOKEN) {
    if (String(p._tk || '') !== SEC.FORM_TOKEN) return 'token';
    var ts = parseInt(p._ts, 10), age = Date.now() - ts;
    if (!ts || isNaN(age)) return 'no-ts';
    if (age < SEC.MIN_FILL_MS) return 'too-fast';
    if (age > SEC.MAX_AGE_MS) return 'stale';
  }

  // 3. Fields our forms never send
  for (var f = 0; f < FOREIGN_FIELDS_.length; f++) {
    if (p[FOREIGN_FIELDS_[f]] !== undefined) return 'foreign-field';
  }

  // 4. Explicit blocklist
  if (isBlockedSubmitter_(p)) return 'blocklist';

  // 5. Lengths, links, HTML
  var all = [];
  var i, k, v;
  for (i = 0; i < SHORT_FIELDS_.length; i++) {
    v = str_(p[SHORT_FIELDS_[i]]);
    if (v.length > SEC.MAX_NAME_LEN) return 'too-long';
    all.push(v);
  }
  for (i = 0; i < LONG_FIELDS_.length; i++) {
    v = str_(p[LONG_FIELDS_[i]]);
    if (v.length > SEC.MAX_TEXT_LEN) return 'too-long';
    all.push(v);
  }
  for (i = 0; i < NAME_FIELDS_.length; i++) {
    v = str_(p[NAME_FIELDS_[i]]);
    if (/https?:|www\.|<[a-z\/!]|\[url|\.(ru|xyz|php)\b/i.test(v)) return 'link-in-name';
    if (/[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/.test(v)) return 'emoji-in-name';
  }
  for (i = 0; i < all.length; i++) {
    var links = (all[i].match(/https?:\/\/|www\./gi) || []).length;
    if (links > SEC.MAX_LINKS_ANY_FIELD) return 'links';
    if (/<\s*(a|script|iframe|img)\b/i.test(all[i])) return 'html';
  }

  // 6. Content patterns
  var text = all.join(' ');
  if (SPAM_RE_.test(text)) return 'keywords';
  if (text.replace(/\s/g, '').length > 20) {
    var non = (text.match(/[^\x00-\x7F]/g) || []).length;
    if (non / text.length > SEC.MAX_NON_ASCII_RATIO) return 'non-ascii';
  }
  // Bot filler: 3+ fields that are 5-8 chars of mixed lowercase letters and digits ("8xcfzb", "4tcew9")
  var junk = 0;
  for (k in p) {
    v = str_(p[k]);
    if (/^[a-z0-9]{5,8}$/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v)) junk++;
  }
  if (junk >= 3) return 'random-filler';

  // 7. Email / phone formats
  var email = str_(p.email || p.repEmail);
  if (!/^[^@\s<>]+@[^@\s<>]+\.[a-z]{2,24}$/i.test(email)) return 'email-format';
  var dom = email.split('@')[1] ? email.split('@')[1].toLowerCase() : '';
  if (dom && DISPOSABLE_DOMAINS_.indexOf(dom) !== -1) return 'disposable';
  var phones = [p.phone, p.clientPhone];
  for (i = 0; i < phones.length; i++) {
    if (phones[i] === undefined || str_(phones[i]) === '') continue;
    var ph = str_(phones[i]);
    if (!/^[0-9+().\-\s x]+$/i.test(ph)) return 'phone-format';
    var d = ph.replace(/\D/g, '').length;
    if (d < 7 || d > 15) return 'phone-format';
  }

  // 8. Rate limits (last, so junk never burns the legit budget)
  if (email && !underCap_('em:' + email.toLowerCase(), SEC.PER_EMAIL_PER_HOUR, 3600)) return 'rate-email';
  if (!underCap_('g:min', SEC.GLOBAL_PER_MINUTE, 60)) return 'rate-global';
  if (!underCap_('g:hr', SEC.GLOBAL_PER_HOUR, 3600)) return 'rate-global-hr';
  return '';
}

/** Counts hits on `key` in CacheService; true while count <= max in the window. */
function underCap_(key, max, ttlSec) {
  var cache = CacheService.getScriptCache();
  var lock  = LockService.getScriptLock();
  var got = false;
  try { got = lock.tryLock(3000); } catch (ignored) {}
  try {
    var bucket = Math.floor(Date.now() / (ttlSec * 1000));
    var ck = 'rl:' + key + ':' + bucket;
    var n = parseInt(cache.get(ck) || '0', 10) + 1;
    cache.put(ck, String(n), ttlSec + 5);
    return n <= max;
  } finally {
    if (got) lock.releaseLock();
  }
}

function str_(v) { return String(v == null ? '' : v).trim(); }

/* --------------------------------------------------------------- listings */

function handleListing_(p) {
  var id    = newListingId_();
  var stamp = new Date();

  var photos = Array.isArray(p.photos) ? p.photos.slice(0, 10) : [];
  var ids    = savePhotos_(id, photos);

  logRow_(TAB_LISTINGS, [
    id, stamp, 'Pending',
    p.name || '', p.email || '', p.phone || '', p.company || '', p.role || '',
    p.category || '', p.propertyType || '', p.address || '', p.city || '', p.state || '',
    p.askingPrice || '', p.units || '', p.sqft || '', p.arv || '', p.rent || '',
    p.description || '', ids.join(',')
  ]);

  notify_({
    to: NOTIFY_EMAIL,
    replyTo: p.email || NOTIFY_EMAIL,
    subject: 'New property listing ' + id + ': ' + (p.city || '') + ', ' + (p.state || ''),
    body:
      'A new listing was submitted and is sitting at Pending.\n\n' +
      'Listing ID: '   + id + '\n' +
      'Submitted by: ' + (p.name || '') + ' (' + (p.role || 'role not given') + ')\n' +
      'Email: '        + (p.email || '') + '\n' +
      'Phone: '        + (p.phone || '') + '\n' +
      'Company: '      + (p.company || '') + '\n\n' +
      'Category: '     + (p.category || '') + '\n' +
      'Property type: '+ (p.propertyType || '') + '\n' +
      'Address: '      + (p.address || '') + '\n' +
      'City / State: ' + (p.city || '') + ', ' + (p.state || '') + '\n' +
      'Asking price: ' + (p.askingPrice || '') + '\n' +
      'Units: '        + (p.units || '') + '   Sq ft: ' + (p.sqft || '') +
      '   ARV: '       + (p.arv || '') + '   Rent: ' + (p.rent || '') + '\n\n' +
      'Description:\n' + (p.description || '') + '\n\n' +
      'Photos saved: ' + ids.length + '\n\n' +
      'Set Status to Approved in the sheet to publish it:\n' + sheetRowUrl_(TAB_LISTINGS) + '\n'
  });

  return { ok: true, listingId: id, photosSaved: ids.length };
}

function newListingId_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var n = parseInt(props.getProperty('listingSeq') || '0', 10) + 1;
    props.setProperty('listingSeq', String(n));
    return 'IKAG-' + ('0000' + n).slice(-4);
  } finally {
    lock.releaseLock();
  }
}

/** photos: [{name, mimeType, data}] where data is base64 without the prefix. */
function savePhotos_(listingId, photos) {
  if (!photos.length) return [];
  var sub = subfolder_(folder_(PHOTO_ROOT), listingId);
  var ids = [];
  photos.forEach(function (ph, i) {
    if (!ph || !ph.data) return;
    try {
      var blob = Utilities.newBlob(
        Utilities.base64Decode(ph.data),
        ph.mimeType || 'image/jpeg',
        ph.name || (listingId + '-' + (i + 1) + '.jpg'));
      var file = sub.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      ids.push(file.getId());
    } catch (err) {
      logError_(err, { listingId: listingId, photoIndex: i });
    }
  });
  return ids;
}

/* -------------------------------------------------------------- inquiries */

function handleInquiry_(p) {
  var stamp = new Date();
  var row   = listingRow_(p.listingId);
  var where = row
    ? (row['City'] + ', ' + row['State'] + ' (' + p.listingId + ')')
    : String(p.listingId || 'unknown listing');

  logRow_(TAB_INQUIRIES, [
    stamp, p.listingId || '', p.fullName || '', p.email || '',
    p.phone || '', p.entity || '', p.trackRecord || '', where
  ]);

  notify_({
    to: NOTIFY_EMAIL,
    replyTo: p.email || NOTIFY_EMAIL,
    subject: 'Listing inquiry on ' + (p.listingId || 'a listing') + ' from ' + (p.fullName || 'someone'),
    body:
      'Property: '      + where + '\n' +
      'Full address: '  + (row ? row['Full Address'] : 'not found in the sheet') + '\n' +
      'Status: '        + (row ? row['Status'] : '') + '\n' +
      'Asking price: '  + (row ? row['Asking Price'] : '') + '\n\n' +
      'From: '          + (p.fullName || '') + '\n' +
      'Email: '         + (p.email || '') + '\n' +
      'Phone: '         + (p.phone || '') + '\n' +
      'Entity: '        + (p.entity || '') + '\n\n' +
      'Track record:\n' + (p.trackRecord || '') + '\n'
  });

  return { ok: true };
}

function listingRow_(id) {
  if (!id) return null;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_LISTINGS);
  if (!sh || sh.getLastRow() < 2) return null;
  var values = sh.getRange(1, 1, sh.getLastRow(), LISTING_HEADERS_.length).getValues();
  var head   = values.shift();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(id).trim()) {
      var o = {};
      head.forEach(function (h, j) { o[h] = values[i][j]; });
      return o;
    }
  }
  return null;
}

/* ------------------------------------------- existing handlers, unchanged */

function handleUnsecured_(p) {
  logRow_(TAB_REFERRALS, [new Date(), p.clientName, p.clientPhone, p.clientCompany,
                          p.reason, p.repName, p.repEmail, p.notes]);

  var details =
    'Client name: '          + (p.clientName || '') + '\n' +
    'Client phone: '         + (p.clientPhone || '') + '\n' +
    'Client company: '       + (p.clientCompany || '') + '\n' +
    'Reason for financing: ' + (p.reason || '') + '\n' +
    'Submitted by: '         + (p.repName || '') + ' (' + (p.repEmail || '') + ')\n' +
    'Notes: '                + (p.notes || 'none') + '\n';

  notify_({
    to: NOTIFY_EMAIL,
    replyTo: p.repEmail || NOTIFY_EMAIL,
    subject: 'New client from ' + (p.repName || 'a rep') + ': ' + (p.clientName || 'unnamed'),
    body: details + '\nThe client is expecting a call.\n'
  });

  if (p.repEmail) {
    notify_({
      to: p.repEmail,
      subject: 'Received: ' + (p.clientName || 'your client') + ' is in',
      body: (p.repName ? p.repName + ',\n\n' : '') +
            'We have your submission. Someone from our team will call ' +
            (p.clientName || 'your client') + ' shortly.\n\n' + details +
            '\nQuestions? Call ' + IKAG_PHONE + '.\n\nIKAG Capital\n'
    });
  }
}

function handleDeal_(p) {
  logRow_(TAB_DEALS, [new Date(), p.name, p.email, p.phone, p.company, p.ikagRep,
                      p.assetType, p.location, p.capitalType, p.capitalAmount, p.summary]);

  notify_({
    to: NOTIFY_EMAIL,
    replyTo: p.email || NOTIFY_EMAIL,
    subject: 'New deal: ' + (p.company || p.name || 'unnamed') + ' / ' + (p.capitalType || ''),
    body:
      'Name: '         + (p.name || '') + '\n' +
      'Email: '        + (p.email || '') + '\n' +
      'Phone: '        + (p.phone || '') + '\n' +
      'Company: '      + (p.company || '') + '\n' +
      'IKAG Rep: '     + (p.ikagRep || 'none listed') + '\n' +
      'Asset Type: '   + (p.assetType || '') + '\n' +
      'Location: '     + (p.location || '') + '\n' +
      'Capital Type: ' + (p.capitalType || '') + '\n' +
      'Amount: '       + (p.capitalAmount || '') + '\n\n' +
      'Summary:\n'     + (p.summary || '') + '\n'
  });
}

/* ----------------------------------------------------------------- helpers */

/**
 * Sends a notification. Prefers GmailApp because MailApp mail from
 * contact@ikag.capital to itself lands in Spam, while GmailApp lands in the
 * Inbox. Falls back to MailApp if GmailApp throws. Takes the same object
 * shape MailApp.sendEmail does: {to, subject, body, replyTo?, htmlBody?, name?}.
 */
function notify_(msg) {
  // anti-spam: one-line, length-capped subject (Gmail throws "argument too large: subject")
  msg.subject = String(msg.subject || '').replace(/[\r\n]+/g, ' ');
  if (msg.subject.length > SEC.MAX_SUBJECT_LEN) msg.subject = msg.subject.slice(0, SEC.MAX_SUBJECT_LEN - 1) + '…';
  var opts = {};
  if (msg.replyTo)  opts.replyTo  = msg.replyTo;
  if (msg.htmlBody) opts.htmlBody = msg.htmlBody;
  if (msg.name)     opts.name     = msg.name;
  try {
    GmailApp.sendEmail(msg.to, msg.subject, msg.body || '', opts);
  } catch (err) {
    logError_(err, { notify: 'GmailApp failed, using MailApp', to: msg.to, subject: msg.subject });
    MailApp.sendEmail(msg);
  }
}

function params_(e) {
  if (e && e.postData && e.postData.contents) {
    var raw = e.postData.contents;
    if (raw.charAt(0) === '{') {
      try { return JSON.parse(raw); } catch (ignored) {}
    }
  }
  return (e && e.parameter) ? e.parameter : {};
}

/** Keeps base64 photo payloads out of the raw log column. */
function scrub_(p) {
  var o = {};
  Object.keys(p).forEach(function (k) {
    if (k === 'photos' && Array.isArray(p[k])) {
      o[k] = p[k].length + ' photo(s)';
    } else {
      o[k] = p[k];
    }
  });
  return o;
}

function tab_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function logRow_(name, values) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.appendRow(values);
}

function logError_(err, ctx) {
  if (!underCap_('errlog', SEC.ERROR_LOG_PER_HOUR, 3600)) return;   // a flood can't fill the sheet
  try {
    logRow_(TAB_ERRORS, [new Date(), String(err), truncate_(JSON.stringify(scrub_(ctx || {})), 4000)]);
  } catch (ignored) {}
}

function folder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function subfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sheetRowUrl_(tabName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(tabName);
  return ss.getUrl() + (sh ? '#gid=' + sh.getSheetId() : '');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

function ok_() {
  return ContentService.createTextOutput('ok');
}

function num_(v)       { return (v === '' || v === null || v === undefined) ? null : v; }
function blank_(v)     { var s = String(v == null ? '' : v).trim(); return s === '' ? null : s; }
function iso_(v)       { try { return new Date(v).toISOString(); } catch (e) { return ''; } }
function truncate_(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }
