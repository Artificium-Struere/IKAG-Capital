/**
 * IKAG Capital — form and listings backend.
 *
 * Bound to the "IKAG Submissions" spreadsheet, deployed as a web app under
 * contact@ikag.capital. This file is a complete replacement for the script
 * contents: paste it whole.
 *
 * Deployment must be: Execute as = Me, Who has access = Anyone.
 * Publishing a change: Deploy → Manage deployments → pencil → New version.
 * See DEPLOY.md in this folder.
 *
 * Failure policy: every POST is written to "All Submissions" before anything
 * else runs. After that, saving the row and sending the alert are attempted
 * independently, so one failing never stops the other, and anything that
 * throws is written to "Errors" and mailed to NOTIFY_EMAIL.
 */

/* Who gets the alert on every submission. Comma separated.
 *
 * Keep contact@ikag.capital first, and add a second address that is NOT
 * contact@ikag.capital. This script runs as contact@ikag.capital, and Gmail
 * can file a message you send to yourself with your Sent mail instead of
 * your inbox. A second address is never both sender and recipient.
 *
 *   var NOTIFY_EMAIL = 'contact@ikag.capital,you@gmail.com';
 */
var NOTIFY_EMAIL  = 'contact@ikag.capital';
var SENDER_NAME   = 'IKAG Website';
var IKAG_PHONE    = '(866) 778-1354';
var PHOTO_ROOT    = 'IKAG Listing Photos';
var MAX_PHOTOS    = 10;

var TAB_ALL       = 'All Submissions';
var TAB_REFERRALS = 'Unsecured Referrals';
var TAB_DEALS     = 'Deal Submissions';
var TAB_LISTINGS  = 'IKAG Listings';
var TAB_INQUIRIES = 'Listing Inquiries';
var TAB_ERRORS    = 'Errors';

/* Sheet status → status the public page receives. Nothing else is served. */
var PUBLIC_STATUSES = { 'approved': 'New', 'under contract': 'Under Contract' };

var LISTING_HEADERS_ = [
  'Listing ID', 'Timestamp', 'Status', 'Lister Name', 'Lister Email', 'Lister Phone',
  'Company / Entity', 'Role', 'Category', 'Property Type', 'Full Address', 'City', 'State',
  'Asking Price', 'Units', 'Sq Ft', 'ARV', 'Rent', 'Description', 'Photo File IDs'
];

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

  diagnose();
}

/**
 * Run from the editor any time. Logs what the deployment is actually doing
 * and sends one separate test message to each NOTIFY_EMAIL address, so you
 * can tell which address does and does not receive.
 */
function diagnose() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Script runs as:    ' + Session.getEffectiveUser().getEmail());
  Logger.log('Live web app URL:  ' + (ScriptApp.getService().getUrl() || 'not deployed'));
  Logger.log('Spreadsheet:       ' + ss.getName() + '  ' + ss.getUrl());
  Logger.log('Tabs:              ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
  Logger.log('Photo folder:      ' + folder_(PHOTO_ROOT).getUrl());
  Logger.log('Notify addresses:  ' + recipients_().join(', '));
  Logger.log('Mail quota left:   ' + MailApp.getRemainingDailyQuota() + ' recipients today');
  Logger.log('Listing sequence:  ' + (PropertiesService.getScriptProperties().getProperty('listingSeq') || '0'));

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  recipients_().forEach(function (addr) {
    try {
      MailApp.sendEmail({
        to: addr,
        name: SENDER_NAME,
        subject: 'IKAG alert test to ' + addr + ' at ' + stamp,
        body: 'If you are reading this in the inbox of ' + addr + ', submission alerts reach it.\n\n' +
              'Sent by ' + Session.getEffectiveUser().getEmail() + '.\n'
      });
      Logger.log('Test sent to:      ' + addr);
    } catch (err) {
      Logger.log('Test FAILED to:    ' + addr + '  ' + err);
    }
  });
}

/* ------------------------------------------------------------------- doGet */

/**
 * Public read. Returns only Approved and Under Contract rows, built from a
 * fixed whitelist of keys. The full address and every lister contact field
 * are never read into the response object.
 */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};

  if (p.action === 'ping') {
    return json_({ ok: true, message: 'IKAG endpoint is live.', time: new Date().toISOString() });
  }

  try {
    return json_({ ok: true, listings: publicListings_() });
  } catch (err) {
    logError_('doGet', err, p);
    return json_({ ok: false, error: 'Could not load listings.' });
  }
}

function publicListings_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_LISTINGS);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var col    = columns_(values.shift());

  var out = [];
  values.forEach(function (r) {
    var cell = function (h) { return col[h] === undefined ? '' : r[col[h]]; };

    var status = PUBLIC_STATUSES[String(cell('Status')).trim().toLowerCase()];
    if (!status) return;

    var ids = String(cell('Photo File IDs'))
      .split(',').map(function (s) { return s.trim(); }).filter(String);

    // Whitelist, not blacklist: only these keys are ever emitted.
    out.push({
      id:           str_(cell('Listing ID')),
      status:       status,
      category:     str_(cell('Category')),
      propertyType: str_(cell('Property Type')),
      city:         str_(cell('City')),
      state:        str_(cell('State')),
      askingPrice:  price_(cell('Asking Price')),
      units:        blank_(cell('Units')),
      sqft:         blank_(cell('Sq Ft')),
      arv:          blank_(cell('ARV')),
      rent:         blank_(cell('Rent')),
      description:  str_(cell('Description')),
      listedOn:     iso_(cell('Timestamp')),
      photos:       ids.map(function (id) {
                      return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600';
                    })
    });
  });

  out.sort(function (a, b) { return (b.listedOn || '').localeCompare(a.listedOn || ''); });
  return out;
}

/* ------------------------------------------------------------------ doPost */

/**
 * Accepts a urlencoded form post (apply, contact) or a JSON body sent as
 * text/plain (list-property, listings). Routes on `type` or `formType`.
 */
function doPost(e) {
  // 1. Record the raw request before any parsing. Nothing after this can
  //    make a submission invisible.
  try { logRaw_(e); } catch (ignored) {}

  var p, kind;
  try {
    p    = params_(e);
    kind = String(p.type || p.formType || 'unknown');
  } catch (err) {
    fail_('doPost: could not read the request', err, { raw: rawSummary_(e) });
    return json_({ ok: false, error: 'Could not read the request.' });
  }

  try {
    if (kind === 'listing')            return json_(handleListing_(p));
    if (kind === 'inquiry')            return json_(handleInquiry_(p));
    if (kind === 'unsecured-referral') return json_(handleUnsecured_(p));
    if (kind === 'deal-submission')    return json_(handleDeal_(p));

    fail_('doPost: unknown submission type "' + kind + '"', 'No handler for this type.', p);
    return json_({ ok: false, error: 'Unknown submission type.' });
  } catch (err) {
    fail_('doPost: ' + kind, err, p);
    return json_({ ok: false, error: 'Submission failed.' });
  }
}

/* --------------------------------------------------------------- listings */

function handleListing_(p) {
  var problems = [];
  var stamp    = new Date();
  var id;
  try { id = newListingId_(); }
  catch (err) { id = 'IKAG-TMP-' + stamp.getTime(); problems.push('Listing ID: ' + err); }

  var photos = Array.isArray(p.photos) ? p.photos.slice(0, MAX_PHOTOS) : [];
  var saved  = savePhotos_(id, photos, problems);

  var stored = attempt_(problems, 'Sheet row', function () {
    logRow_(TAB_LISTINGS, [
      id, stamp, 'Pending',
      p.name, p.email, p.phone, p.company, p.role,
      p.category, p.propertyType, p.address, p.city, p.state,
      p.askingPrice, p.units, p.sqft, p.arv, p.rent,
      p.description, saved.ids.join(',')
    ]);
  });

  var sent = alert_(problems, {
    replyTo: p.email,
    subject: 'New property listing ' + id + ': ' + v_(p.city) + ', ' + v_(p.state),
    body:
      'A new listing was submitted and is sitting at Pending.\n\n' +
      'Listing ID: '    + id + '\n' +
      'Submitted by: '  + v_(p.name) + ' (' + (p.role || 'role not given') + ')\n' +
      'Email: '         + v_(p.email) + '\n' +
      'Phone: '         + v_(p.phone) + '\n' +
      'Company: '       + v_(p.company) + '\n\n' +
      'Category: '      + v_(p.category) + '\n' +
      'Property type: ' + v_(p.propertyType) + '\n' +
      'Address: '       + v_(p.address) + '\n' +
      'City / State: '  + v_(p.city) + ', ' + v_(p.state) + '\n' +
      'Asking price: '  + v_(p.askingPrice) + '\n' +
      'Units: '         + v_(p.units) + '   Sq ft: ' + v_(p.sqft) +
      '   ARV: '        + v_(p.arv) + '   Rent: ' + v_(p.rent) + '\n\n' +
      'Description:\n'  + v_(p.description) + '\n\n' +
      'Photos received: ' + photos.length + ', saved: ' + saved.ids.length +
      (saved.folderUrl ? '\nPhoto folder: ' + saved.folderUrl : '') + '\n\n' +
      'Set Status to Approved in the sheet to publish it:\n' + sheetUrl_(TAB_LISTINGS) + '\n'
  });

  finish_('listing ' + id, problems, p);
  return { ok: stored || sent, listingId: id, photosSaved: saved.ids.length };
}

/**
 * Listing IDs come from a script property, cross-checked against the sheet
 * so a reset property can never hand out an ID that already exists.
 */
function newListingId_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var n = Math.max(parseInt(props.getProperty('listingSeq') || '0', 10), highestListingNumber_()) + 1;
    props.setProperty('listingSeq', String(n));
    return 'IKAG-' + ('0000' + n).slice(-4);
  } finally {
    lock.releaseLock();
  }
}

function highestListingNumber_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_LISTINGS);
  if (!sh || sh.getLastRow() < 2) return 0;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().reduce(function (max, r) {
    var m = /^IKAG-(\d+)$/.exec(String(r[0]).trim());
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
}

/**
 * photos: [{name, mimeType, data}] where data is base64 without the prefix.
 * A file whose sharing cannot be opened is still kept, and reported, because
 * losing the photo is worse than having to share it by hand.
 */
function savePhotos_(listingId, photos, problems) {
  var result = { ids: [], folderUrl: '' };
  if (!photos.length) return result;

  var sub;
  if (!attempt_(problems, 'Photo folder', function () {
    sub = subfolder_(folder_(PHOTO_ROOT), listingId);
    result.folderUrl = sub.getUrl();
  })) return result;

  photos.forEach(function (ph, i) {
    if (!ph || !ph.data) { problems.push('Photo ' + (i + 1) + ': empty'); return; }
    var file;
    if (!attempt_(problems, 'Photo ' + (i + 1) + ' save', function () {
      var data = String(ph.data).replace(/^data:[^,]*,/, '');
      file = sub.createFile(Utilities.newBlob(
        Utilities.base64Decode(data),
        ph.mimeType || 'image/jpeg',
        safeName_(ph.name) || (listingId + '-' + (i + 1) + '.jpg')));
    })) return;
    result.ids.push(file.getId());
    attempt_(problems, 'Photo ' + (i + 1) + ' sharing (will not show on the site until shared)', function () {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    });
  });
  return result;
}

/* -------------------------------------------------------------- inquiries */

function handleInquiry_(p) {
  var problems = [];
  var row = null;
  attempt_(problems, 'Listing lookup', function () { row = listingRow_(p.listingId); });

  var where = row
    ? (row['City'] + ', ' + row['State'] + ' (' + p.listingId + ')')
    : String(p.listingId || 'unknown listing');

  var stored = attempt_(problems, 'Sheet row', function () {
    logRow_(TAB_INQUIRIES, [new Date(), p.listingId, p.fullName, p.email,
                            p.phone, p.entity, p.trackRecord, where]);
  });

  // Internal mail: the full street address is allowed here, never in doGet.
  var sent = alert_(problems, {
    replyTo: p.email,
    subject: 'Listing inquiry on ' + (p.listingId || 'a listing') + ' from ' + (p.fullName || 'someone'),
    body:
      'Property: '      + where + '\n' +
      'Full address: '  + (row ? v_(row['Full Address']) : 'not found in the sheet') + '\n' +
      'Property type: ' + (row ? v_(row['Property Type']) : '') + '\n' +
      'Status: '        + (row ? v_(row['Status']) : '') + '\n' +
      'Asking price: '  + (row ? v_(row['Asking Price']) : '') + '\n' +
      'Listed by: '     + (row ? v_(row['Lister Name']) + ', ' + v_(row['Lister Email']) +
                                   ', ' + v_(row['Lister Phone']) : '') + '\n\n' +
      'From: '          + v_(p.fullName) + '\n' +
      'Email: '         + v_(p.email) + '\n' +
      'Phone: '         + v_(p.phone) + '\n' +
      'Entity: '        + v_(p.entity) + '\n\n' +
      'Track record:\n' + v_(p.trackRecord) + '\n'
  });

  finish_('inquiry on ' + (p.listingId || 'unknown listing'), problems, p);
  return { ok: stored || sent };
}

function listingRow_(id) {
  if (!id) return null;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_LISTINGS);
  if (!sh || sh.getLastRow() < 2) return null;
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head   = values.shift();
  var idCol  = columns_(head)['Listing ID'] || 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idCol]).trim() === String(id).trim()) {
      var o = {};
      head.forEach(function (h, j) { o[h] = values[i][j]; });
      return o;
    }
  }
  return null;
}

/* ------------------------------------------------ referral and deal forms */

function handleUnsecured_(p) {
  var problems = [];

  var stored = attempt_(problems, 'Sheet row', function () {
    logRow_(TAB_REFERRALS, [new Date(), p.clientName, p.clientPhone, p.clientCompany,
                            p.reason, p.repName, p.repEmail, p.notes]);
  });

  var details =
    'Client name: '          + v_(p.clientName) + '\n' +
    'Client phone: '         + v_(p.clientPhone) + '\n' +
    'Client company: '       + v_(p.clientCompany) + '\n' +
    'Reason for financing: ' + v_(p.reason) + '\n' +
    'Submitted by: '         + v_(p.repName) + ' (' + v_(p.repEmail) + ')\n' +
    'Notes: '                + (p.notes || 'none') + '\n';

  var sent = alert_(problems, {
    replyTo: p.repEmail,
    subject: 'New client from ' + (p.repName || 'a rep') + ': ' + (p.clientName || 'unnamed'),
    body: details + '\nThe client is expecting a call.\n'
  });

  if (p.repEmail) {
    attempt_(problems, 'Rep confirmation to ' + p.repEmail, function () {
      MailApp.sendEmail({
        to: p.repEmail,
        name: 'IKAG Capital',
        replyTo: recipients_()[0],
        subject: 'Received: ' + (p.clientName || 'your client') + ' is in',
        body: (p.repName ? p.repName + ',\n\n' : '') +
              'We have your submission. Someone from our team will call ' +
              (p.clientName || 'your client') + ' shortly.\n\n' + details +
              '\nQuestions? Call ' + IKAG_PHONE + '.\n\nIKAG Capital\n'
      });
    });
  }

  finish_('referral from ' + (p.repName || 'a rep'), problems, p);
  return { ok: stored || sent };
}

function handleDeal_(p) {
  var problems = [];

  var stored = attempt_(problems, 'Sheet row', function () {
    logRow_(TAB_DEALS, [new Date(), p.name, p.email, p.phone, p.company, p.ikagRep,
                        p.assetType, p.location, p.capitalType, p.capitalAmount, p.summary]);
  });

  var sent = alert_(problems, {
    replyTo: p.email,
    subject: 'New deal: ' + (p.company || p.name || 'unnamed') + ' / ' + v_(p.capitalType),
    body:
      'Name: '         + v_(p.name) + '\n' +
      'Email: '        + v_(p.email) + '\n' +
      'Phone: '        + v_(p.phone) + '\n' +
      'Company: '      + v_(p.company) + '\n' +
      'IKAG Rep: '     + (p.ikagRep || 'none listed') + '\n' +
      'Asset Type: '   + v_(p.assetType) + '\n' +
      'Location: '     + v_(p.location) + '\n' +
      'Capital Type: ' + v_(p.capitalType) + '\n' +
      'Amount: '       + v_(p.capitalAmount) + '\n\n' +
      'Summary:\n'     + v_(p.summary) + '\n'
  });

  finish_('deal from ' + (p.company || p.name || 'unnamed'), problems, p);
  return { ok: stored || sent };
}

/* ------------------------------------------------------- failure handling */

/** Runs fn; on a throw, records the problem and returns false. */
function attempt_(problems, label, fn) {
  try { fn(); return true; }
  catch (err) { problems.push(label + ': ' + err); return false; }
}

/** Sends a submission alert to NOTIFY_EMAIL. Returns false if it could not. */
function alert_(problems, msg) {
  return attempt_(problems, 'Alert email', function () {
    var opts = { to: recipients_().join(','), name: SENDER_NAME, subject: msg.subject, body: msg.body };
    if (msg.replyTo && /@/.test(msg.replyTo)) opts.replyTo = String(msg.replyTo).trim();
    MailApp.sendEmail(opts);
  });
}

/** After a handler: if anything went wrong, log it and mail it separately. */
function finish_(what, problems, p) {
  var quota = -1;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (ignored) {}
  if (quota >= 0 && quota < 10) {
    problems.push('Mail quota is down to ' + quota + ' recipients for today. Alerts will stop when it reaches 0.');
  }
  if (problems.length) fail_(what, problems.join('\n'), p);
}

/** Writes to Errors and tries to mail the failure. Never throws. */
function fail_(where, err, ctx) {
  logError_(where, err, ctx);
  try {
    MailApp.sendEmail({
      to: recipients_().join(','),
      name: SENDER_NAME,
      subject: 'IKAG website problem: ' + where,
      body: 'Something went wrong handling a website submission. The raw request is in the ' +
            '"' + TAB_ALL + '" tab and the details below are in "' + TAB_ERRORS + '".\n\n' +
            String(err) + '\n\nSubmission:\n' + truncate_(JSON.stringify(scrub_(ctx || {}), null, 2), 20000) +
            '\n\n' + sheetUrl_(TAB_ERRORS) + '\n'
    });
  } catch (ignored) {}
}

function logError_(where, err, ctx) {
  try {
    logRow_(TAB_ERRORS, [new Date(), where + ': ' + String(err),
                         truncate_(JSON.stringify(scrub_(ctx || {})), 45000)]);
  } catch (ignored) {}
}

/* ----------------------------------------------------------------- helpers */

/** The raw-request log row. Uses no JSON parsing, so a bad body still lands. */
function logRaw_(e) {
  var pd   = (e && e.postData) || {};
  var raw  = String(pd.contents || '');
  var kind = (/"(?:type|formType)"\s*:\s*"([^"]*)"/.exec(raw) ||
              /(?:^|&)(?:type|formType)=([^&]*)/.exec(raw) || [])[1] || '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_ALL) || ss.insertSheet(TAB_ALL);
  sh.appendRow([new Date(), 'POST ' + (kind || 'unknown') + ' (' + (pd.type || 'no content type') +
                ', ' + raw.length + ' bytes)', cellText_(rawSummary_(e))]);
}

/** Raw body with base64 photo data replaced by its length, capped for a cell. */
function rawSummary_(e) {
  var raw = String((e && e.postData && e.postData.contents) || '');
  if (!raw && e && e.parameter) raw = JSON.stringify(e.parameter);
  raw = raw.replace(/"data"\s*:\s*"([^"]{200,})"/g, function (m, b64) {
    return '"data":"<' + b64.length + ' base64 chars>"';
  });
  return truncate_(raw, 45000);
}

function params_(e) {
  var raw = String((e && e.postData && e.postData.contents) || '').trim();
  if (raw.charAt(0) === '{') return JSON.parse(raw);   // JSON sent as text/plain
  return (e && e.parameter) ? e.parameter : {};        // urlencoded form post
}

/** Keeps base64 photo payloads out of logs and mail. */
function scrub_(p) {
  if (!p || typeof p !== 'object') return p;
  var o = {};
  Object.keys(p).forEach(function (k) {
    o[k] = (k === 'photos' && Array.isArray(p[k])) ? p[k].length + ' photo(s)' : p[k];
  });
  return o;
}

function recipients_() {
  return NOTIFY_EMAIL.split(',').map(function (s) { return s.trim(); }).filter(String);
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

/** Appends a row of submitted values, neutralising anything Sheets would run as a formula. */
function logRow_(name, values) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.appendRow(values.map(cellText_));
}

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) && !/^-?\d[\d,.]*$/.test(v) ? "'" + v : v;
}

function columns_(head) {
  var col = {};
  head.forEach(function (h, i) { col[String(h).trim()] = i; });
  return col;
}

function folder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function subfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sheetUrl_(tabName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(tabName);
    return ss.getUrl() + (sh ? '#gid=' + sh.getSheetId() : '');
  } catch (e) { return ''; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

function safeName_(s)  { return String(s || '').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '').slice(0, 120); }
function v_(s)         { return s === null || s === undefined ? '' : String(s); }
function str_(v)       { return v === null || v === undefined ? '' : String(v).trim(); }
function blank_(v)     { var s = str_(v); return s === '' ? null : s; }
function price_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var n = Number(str_(v).replace(/[^0-9.]/g, ''));
  return str_(v) === '' || !isFinite(n) || n <= 0 ? null : n;
}
function iso_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
function truncate_(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }
