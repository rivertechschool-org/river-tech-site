/** HS lunch opt-outs: add to the existing Field Trip Backend project.
 * Uses LUNCH_REGISTER_ID: signed intake and student flags in the One Masterlist; no emails.
 * Set LUNCH_OPT_OUT_OPEN=true only when the new policy/form is authorized.
 */
const LO_YEAR = '2026-27';
const LO_VERSION = 'hs-lunch-opt-out-2026-27-v1';
const LO_TAB = 'Lunch Opt-Outs 2026-27';
const LO_REG_FIELDS = ['Lunch opt-out', 'Lunch opt-out reference'];
const LO_SYNC_FIELDS = ['Register sync', 'Matched child', 'Synced (UTC)', 'Review note'];
const LO_STATEMENT = 'I am opting the high school students listed on this form out of off-campus lunch. They must remain on campus during lunch rotation.';

function lunchOptOutConfig_() {
  return {ok: true, formType: 'hs-lunch-opt-out', schoolYear: LO_YEAR,
    policyVersion: LO_VERSION, open: cfg('LUNCH_OPT_OUT_OPEN') === 'true' && !!cfg('LUNCH_REGISTER_ID') && cfg('LUNCH_REGISTER_READY') === 'true'};
}

function loText_(value, max) {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
}
function loCell_(value) {
  const text = String(value == null ? '' : value);
  return /^[\s]*[=+@\-]/.test(text) ? "'" + text : text;
}
function loNormalize_(p) {
  if (!p || p.formType !== 'hs-lunch-opt-out' || p.schoolYear !== LO_YEAR || p.policyVersion !== LO_VERSION)
    throw Error('Please reload the current lunch opt-out form and try again.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.requestId || ''))
    throw Error('Please reload the form before submitting.');
  if (!p.optOut || p.optOut.confirmed !== true) throw Error('Please confirm that the listed students must remain on campus.');
  const parent = p.parent || {};
  const name = loText_(parent.name, 160), email = loText_(parent.email, 254).toLowerCase();
  const phone = loText_(parent.phone == null ? '' : parent.phone, 40);
  const signature = loText_(p.optOut.signatureName, 160);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Please enter your name and a valid email address.');
  if (parent.phone && !phone) throw Error('Please check your phone number.');
  if (!signature) throw Error('Please type your full name to sign the opt-out.');
  if (!Array.isArray(p.students) || p.students.length < 1 || p.students.length > 12)
    throw Error('Please include between one and twelve high school students.');
  const seen = new Set();
  const students = p.students.map(function (student) {
    const name = loText_(student && student.name, 160);
    const grade = loText_(student && student.grade, 2);
    if (!name || !/^(9|10|11|12)$/.test(grade)) throw Error('Each student needs a full name and a high school grade.');
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) throw Error('A student is listed twice. Please remove the duplicate.');
    seen.add(key);
    return {name: name, grade: grade};
  });
  return {requestId: p.requestId.toLowerCase(), parent: {name: name, email: email, phone: phone}, students: students, signature: signature};
}
function loHeaders_() {
  return ['Opt-Out ID', 'Request ID', 'Submitted (UTC)', 'School Year', 'Parent / Guardian', 'Parent Email', 'Parent Phone',
    'Student Name', 'Grade', 'Status', 'Opt-Out Confirmed', 'Signature Name', 'Signature Date (Pacific)', 'Policy Version', 'Signed Statement', 'Request Fingerprint'];
}
function loSheet_(test) {
  const id = cfg('LUNCH_REGISTER_ID');
  if (!id) throw Error('Lunch opt-out storage is not configured.');
  const book = SpreadsheetApp.openById(id);
  const tabName = test === true ? 'Lunch Opt-Out QA 2026-27' : LO_TAB;
  let sheet = book.getSheetByName(tabName);
  if (!sheet) sheet = book.insertSheet(tabName);
  const headers = loHeaders_().concat(LO_SYNC_FIELDS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (JSON.stringify(sheet.getRange(1, 1, 1, headers.length).getValues()[0]) !== JSON.stringify(headers)) {
    throw Error('Lunch opt-out sheet headings need staff attention.');
  }
  return sheet;
}
function handleLunchOptOut_(payload, options) {
  // Only owner-run verification supplies options; doPost passes payload alone.
  const test = options && options.test === true;
  let p;
  try { p = loNormalize_(payload); } catch (e) { return {ok: false, error: e.message}; }
  if (!test && !lunchOptOutConfig_().open) return {ok: false, error: 'This form is not accepting submissions yet. Please try again later.'};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return {ok: false, error: 'The form is busy. Please try again in a moment.'};
  try {
    const sheet = loSheet_(test);
    const fingerprint = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify({parent: p.parent, students: p.students, signature: p.signature, version: LO_VERSION}))
      .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    const last = sheet.getLastRow();
    const rows = last > 1 ? sheet.getRange(2, 1, last - 1, loHeaders_().length).getValues() : [];
    const existing = rows.filter(function (r) { return r[1] === p.requestId; });
    if (existing.length) {
      if (existing.length !== p.students.length || existing.some(function (r) { return r[15] !== fingerprint; }))
        return {ok: false, error: 'This submission reference has different details. Please reload the form and check with the school before submitting again.'};
      // A retry must also finish an interrupted Register update.
      loSyncRows_(sheet, p.requestId, test);
      return {ok: true, referenceId: existing[0][0], studentCount: existing.length, schoolYear: LO_YEAR, duplicate: true};
    }
    const now = new Date();
    const reference = 'LO-' + p.requestId;
    const date = Utilities.formatDate(now, 'America/Los_Angeles', 'yyyy-MM-dd');
    const values = p.students.map(function (student) {
      return [reference, p.requestId, now.toISOString(), LO_YEAR, p.parent.name, p.parent.email, p.parent.phone,
        student.name, student.grade, 'Opted out — remain on campus', 'Yes', p.signature, date, LO_VERSION, LO_STATEMENT, fingerprint].map(loCell_);
    });
    // A single batch write records the complete family before success is returned.
    sheet.getRange(last + 1, 1, values.length, loHeaders_().length).setNumberFormat('@').setValues(values);
    SpreadsheetApp.flush();
    const saved = sheet.getRange(last + 1, 1, values.length, loHeaders_().length).getValues();
    if (saved.some(function (row, i) { return row.some(function (cell, j) {
      const expected = values[i][j];
      return String(cell) !== expected && !(expected[0] === "'" && String(cell) === expected.slice(1));
    }); })) throw Error('Opt-out readback did not match.');
    loSyncRows_(sheet, p.requestId, test);
    return {ok: true, referenceId: reference, studentCount: values.length, schoolYear: LO_YEAR};
  } catch (e) {
    Logger.log('Lunch opt-out storage error: ' + e.message);
    return {ok: false, error: 'We could not confirm that your opt-out was saved. Please retry with the same details. If this continues, email learn@rivertech.me.'};
  } finally { lock.releaseLock(); }
}

// The signed intake is the durable record. Staff review and temporary delivery
// failures remain visible in that same book; neither can discard a parent's opt-out.
function loName_(s) {
  return String(s || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}
function loNames_(s) {
  const full = loName_(s), noAlias = full.replace(/\s*\([^)]*\)/g, '').trim();
  const names = [full, noAlias];
  const alias = full.match(/^\S+\s+\(([^)]+)\)(\s+.+)$/);
  if (alias) names.push(alias[1] + alias[2]);
  return names;
}
function loRegister_(book, test) {
  const sheet = book.getSheetByName(test ? 'Lunch Register QA 2026-27' : 'Register');
  if (!sheet) throw Error('Register not available.');
  const rows = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const h = rows.shift(), ix = {};
  ['Child', 'Parent email', 'Parent 2 email', 'Placed by Dan', 'Program', 'Status'].concat(LO_REG_FIELDS).forEach(function (key) {
    ix[key] = h.indexOf(key);
    if (ix[key] < 0 || h.lastIndexOf(key) !== ix[key]) throw Error('Register column contract needs attention.');
  });
  return {sheet: sheet, rows: rows, header: h, ix: ix};
}
function loSyncRows_(intake, requestId, test) {
  const n = intake.getLastRow() - 1;
  if (n < 1) return {applied: 0, review: 0, pending: 0};
  const rows = intake.getRange(2, 1, n, 20).getValues(), counts = {applied: 0, review: 0, pending: 0};
  rows.forEach(function (record, i) {
    if (requestId && record[1] !== requestId) return;
    if (record[16] === 'Applied' || record[16] === 'Closed by office') return;
    const state = intake.getRange(i + 2, 17, 1, 4);
    try {
      // Re-read immediately before each scoped write, rather than retaining row indexes.
      const reg = loRegister_(intake.getParent(), test), ix = reg.ix;
      const names = reg.rows.map(function (r, index) { return {row: r, index: index}; })
        .filter(function (x) { return loNames_(x.row[ix.Child]).indexOf(loName_(record[7])) >= 0; });
      const matches = names.filter(function (x) {
        return [x.row[ix['Parent email']], x.row[ix['Parent 2 email']]].some(function (email) {
          return loName_(email) === loName_(record[5]);
        });
      });
      let note = '';
      if (matches.length !== 1) note = 'Verify student and parent identity; no unique name plus parent email match.';
      const found = matches.length === 1 ? matches[0] : null;
      if (found && (found.row[ix['Placed by Dan']] !== 'HS' ||
          ['Enrolled', 'Committed'].indexOf(found.row[ix.Status]) < 0 ||
          ['Double Major', 'Full-time', 'Performing Arts', 'Technology'].indexOf(found.row[ix.Program]) < 0))
        note = 'Verify current full-time high school enrollment before applying.';
      if (note) {
        state.setNumberFormat('@').setValues([['Needs review', '', '', note]]);
        counts.review++; return;
      }
      const rowNumber = found.index + 2;
      const fresh = reg.sheet.getRange(rowNumber, 1, 1, reg.header.length).getValues()[0];
      if (JSON.stringify(fresh) !== JSON.stringify(found.row)) throw Error('Register row changed; retry.');
      const current = String(fresh[ix[LO_REG_FIELDS[0]]] || '');
      if (current && current !== 'Opted out — remain on campus') {
        state.setNumberFormat('@').setValues([['Needs review', String(fresh[ix.Child]), '', 'Existing lunch value requires office review.']]);
        counts.review++; return;
      }
      const source = String(record[0]);
      // Separate named cells preserve all enrollment columns, including later additions.
      reg.sheet.getRange(rowNumber, ix[LO_REG_FIELDS[0]] + 1).setNumberFormat('@').setValues([['Opted out — remain on campus']]);
      reg.sheet.getRange(rowNumber, ix[LO_REG_FIELDS[1]] + 1).setNumberFormat('@').setValues([[loCell_(source)]]);
      SpreadsheetApp.flush();
      const verify = reg.sheet.getRange(rowNumber, 1, 1, reg.header.length).getValues()[0];
      if (verify[ix.Child] !== fresh[ix.Child] || verify[ix[LO_REG_FIELDS[0]]] !== 'Opted out — remain on campus' ||
          verify[ix[LO_REG_FIELDS[1]]] !== source) throw Error('Register readback failed.');
      loAudit_(intake.getParent(), test, fresh[ix.Child], current, source);
      state.setNumberFormat('@').setValues([['Applied', loCell_(fresh[ix.Child]), new Date().toISOString(), '']]);
      SpreadsheetApp.flush();
      if (state.getValues()[0][0] !== 'Applied') throw Error('Delivery status readback failed.');
      counts.applied++;
    } catch (e) {
      counts.pending++;
      try { state.setNumberFormat('@').setValues([['Pending retry', '', '', 'Automatic retry pending; signed opt-out is saved.']]); } catch (_) {}
      Logger.log('Lunch Register delivery pending: ' + e.message);
    }
  });
  return counts;
}
function loAudit_(book, test, child, before, source) {
  const sheet = book.getSheetByName(test ? 'Lunch Audit QA 2026-27' : 'Change log');
  if (!sheet) throw Error('Register audit log is not available.');
  const headers = sheet.getRange(1, 1, 1, 6).getValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(['When', 'Child', 'Column', 'Before', 'After', 'Who'])) throw Error('Audit column contract changed.');
  const who = 'Lunch form ' + source;
  const n = sheet.getLastRow(), prior = n > 1 ? sheet.getRange(2, 1, n - 1, 6).getValues() : [];
  if (prior.some(function (r) { return r[1] === child && r[2] === LO_REG_FIELDS[0] && r[5] === who; })) return;
  sheet.getRange(n + 1, 1, 1, 6).setNumberFormat('@').setValues([[new Date().toISOString(), child, LO_REG_FIELDS[0], before, 'Opted out — remain on campus', who].map(loCell_)]);
}
function reconcileLunchOptOuts() {
  // Owner-installed time trigger. No public route accepts a test flag or sheet ID.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try { return loSyncRows_(loSheet_(false), null, false); }
  finally { lock.releaseLock(); }
}
