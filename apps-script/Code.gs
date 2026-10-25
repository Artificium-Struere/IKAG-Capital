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

/* ------------------------------------------------------------------ doPost */

/**
 * Routes on `type` for the listings program and on `formType` for the
 * existing forms, so both keep working. Accepts either a urlencoded form
 * post or a JSON body sent as text/plain.
 */
function doPost(e) {
  var p = params_(e);
  var kind = p.type || p.formType || 'unknown';

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
  try {
    logRow_(TAB_ERRORS, [new Date(), String(err), truncate_(JSON.stringify(scrub_(ctx || {})), 45000)]);
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
