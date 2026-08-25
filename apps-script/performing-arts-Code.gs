/**
 * River Tech — Performing Arts Choices (2026-27) Backend
 * Google Apps Script web app. Deploy with:
 *   Deploy > New deployment > Type: Web app
 *   Execute as: Me (learn@rivertech.me)
 *   Who has access: Anyone
 *
 * Receives one FAMILY's performing arts choices — one or more children —
 * writes one sheet row per child, emails the family a copy, and notifies
 * staff once for the whole family. No payment processing.
 *
 * Script Properties (Project Settings > Script Properties):
 *   SHEET_ID — set automatically by running setupSheet() once from the editor.
 */

// ---- Config -------------------------------------------------------------
function cfg(key) { return PropertiesService.getScriptProperties().getProperty(key); }

const NOTIFY_EMAILS = ["learn@rivertech.me", "dhegelund@gmail.com"];
const SCHOOL_NAME = "River Tech School of Performing Arts & Technology";
const SHEET_NAME = "Performing Arts Choices 2026-27";
const SHEET_TAB_NAME = "Choices";
const MAX_CHILDREN = 6;

// ---- Web-app entrypoints ------------------------------------------------
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    return json_(handleSubmission(payload));
  } catch (err) {
    Logger.log("doPost error: " + err + "\n" + (err && err.stack));
    return json_({ ok: false, error: "Server error: " + err.message });
  }
}

function doGet() {
  return json_({ ok: true, message: "Performing Arts Choices backend is alive.", form: "performing-arts-choices" });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Core handler -------------------------------------------------------
/**
 * Accepts the family shape { parent, children: [...] } and, for safety, the
 * original single-student shape { parent, student, join, ... } that the first
 * version of the form sent.
 */
function normalise_(p) {
  if (p && p.children && p.children.length) return p.children.slice(0, MAX_CHILDREN);
  if (p && p.student) {
    return [{
      name: p.student.name, age: p.student.age,
      join: p.join, aladdin: p.aladdin, roles: p.roles,
      experience: p.experience, artsQuestion: p.artsQuestion,
      artsChoice: p.artsChoice, spanish: p.spanish
    }];
  }
  return [];
}

function handleSubmission(p) {
  if (!p || !p.parent || !p.parent.name || !p.parent.email) {
    return { ok: false, error: "Parent name and email are required." };
  }

  const kids = normalise_(p).filter(function (c) { return c && c.name; });
  if (kids.length === 0) return { ok: false, error: "Please add at least one student." };

  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (!c.age) return { ok: false, error: "Please choose an age for " + c.name + "." };
    // 2026-08-25: join and spanish are no longer required — Monday a la carte
    // families skip them, and Dan wants the form submittable with gaps.
  }

  const referenceId = "PA-" + Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyyMMdd-HHmmss")
    + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0");

  writeToSheet_(referenceId, p, kids);
  sendParentEmail_(referenceId, p, kids);
  sendNotificationEmail_(referenceId, p, kids);

  return { ok: true, referenceId: referenceId, children: kids.length };
}

// ---- Sheet write --------------------------------------------------------
function headerRow_() {
  return [
    "Reference ID", "Submitted (UTC)", "School Year",
    "Student Name", "Age",
    "Parent Name", "Parent Email",
    "Joining Performances", "Aladdin Audition", "Roles of Interest",
    "Stage Experience",
    "Arts Question Shown", "Arts Choice",
    "Spanish", "Notes"
  ];
}

/** One row per child. Siblings share a reference id with a -1, -2 suffix. */
function writeToSheet_(referenceId, p, kids) {
  const sheetId = cfg("SHEET_ID");
  if (!sheetId) throw new Error("SHEET_ID is not configured. Run setupSheet() once from the editor.");
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(SHEET_TAB_NAME) || ss.insertSheet(SHEET_TAB_NAME);

  if (sh.getLastRow() === 0) {
    const header = headerRow_();
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }

  const submitted = p.submittedAt || new Date().toISOString();
  const rows = kids.map(function (c, idx) {
    return [
      kids.length > 1 ? (referenceId + "-" + (idx + 1)) : referenceId,
      submitted,
      p.schoolYear || "2026-27",
      c.name,
      c.age,
      p.parent.name,
      p.parent.email,
      c.join,
      c.aladdin || "",
      c.roles || "",
      c.experience || "",
      c.artsQuestion || "",
      c.artsChoice || "",
      c.spanish,
      p.notes || ""
    ];
  });

  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

// ---- Emails -------------------------------------------------------------
function childLines_(c) {
  const lines = ["  " + c.name + " (age " + c.age + ")"];
  if (c.join) lines.push("    Joining our performances: " + c.join);
  if (c.join === "Yes" && c.aladdin) {
    lines.push("    Auditioning for Aladdin on August 31: " + c.aladdin);
    if (c.roles) lines.push("    Roles of interest: " + c.roles);
  }
  if (c.artsChoice) lines.push("    Arts choice this quarter: " + c.artsChoice);
  if (c.spanish) lines.push("    Spanish this quarter: " + c.spanish);
  return lines;
}

function anyJoining_(kids) {
  for (var i = 0; i < kids.length; i++) { if (kids[i].join === "Yes") return true; }
  return false;
}

function sendParentEmail_(referenceId, p, kids) {
  const first = (p.parent.name || "").split(" ")[0] || "there";
  const who = kids.length === 1 ? kids[0].name + "'s" : "your students'";

  let lines = [
    "Hi " + first + ",",
    "",
    "Thank you for sending in " + who + " performing arts choices for the coming year. Here is what we have:",
    ""
  ];
  kids.forEach(function (c) {
    lines = lines.concat(childLines_(c));
    lines.push("");
  });
  lines.push("Reference: " + referenceId);
  lines.push("");

  if (anyJoining_(kids)) {
    lines.push("Our first audition is for Aladdin on Monday, August 31, from 10:30 to 2:30 here at the school. The audition material is on the School Start Hub at rivertechschool.com.");
    lines.push("");
  }

  lines.push("If anything above is wrong, just reply to this email and we will fix it.");
  lines.push("");
  lines.push("Warmly,");
  lines.push("Dan Hegelund");
  lines.push(SCHOOL_NAME);
  lines.push("927 E Polston Ave, Post Falls, ID 83854");

  try {
    MailApp.sendEmail({
      to: p.parent.email,
      replyTo: "learn@rivertech.me",
      subject: "Performing arts choices received — " + p.parent.name,
      body: lines.join("\n"),
      name: "River Tech School"
    });
  } catch (err) { Logger.log("Parent email failed: " + err); }
}

function sendNotificationEmail_(referenceId, p, kids) {
  let lines = [
    "New performing arts choices submitted.",
    "",
    "Reference: " + referenceId,
    "Submitted: " + (p.submittedAt || new Date().toISOString()),
    "",
    "Parent: " + p.parent.name,
    "Email:  " + p.parent.email,
    "Students: " + kids.length,
    ""
  ];
  kids.forEach(function (c) {
    lines = lines.concat(childLines_(c));
    lines.push("    Question shown: " + (c.artsQuestion || "—"));
    lines.push("");
  });
  if (p.notes) {
    lines.push("Notes: " + p.notes);
    lines.push("");
  }
  lines.push(kids.length + " row(s) appended to " + SHEET_NAME + ".");

  const names = kids.map(function (c) { return c.name; }).join(", ");
  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAILS.join(","),
      subject: "[Performing Arts] " + p.parent.name + " — " + names,
      body: lines.join("\n"),
      name: "River Tech Forms"
    });
  } catch (err) { Logger.log("Notification email failed: " + err); }
}

// ---- Setup & self-test --------------------------------------------------
/**
 * Run ONCE from the editor (Run > setupSheet). Creates the backing sheet
 * owned by this account (learn@rivertech.me), writes the header row, and
 * stores its ID in Script Properties. Safe to re-run — it no-ops if set.
 */
function setupSheet() {
  const existing = cfg("SHEET_ID");
  if (existing) { Logger.log("SHEET_ID already set: " + existing); return existing; }
  const ss = SpreadsheetApp.create(SHEET_NAME);
  const sh = ss.getSheets()[0];
  sh.setName(SHEET_TAB_NAME);
  const header = headerRow_();
  sh.appendRow(header);
  sh.getRange(1, 1, 1, header.length).setFontWeight("bold");
  sh.setFrozenRows(1);
  PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
  Logger.log("Created sheet: " + ss.getUrl());
  Logger.log("SHEET_ID: " + ss.getId());
  return ss.getId();
}

function verifyConfig() {
  const sheetId = cfg("SHEET_ID");
  Logger.log("SHEET_ID set: " + !!sheetId);
  if (sheetId) {
    try { Logger.log("Sheet name: " + SpreadsheetApp.openById(sheetId).getName()); }
    catch (e) { Logger.log("Cannot open sheet: " + e.message); }
  }
}

function selfTest() {
  const fake = {
    submittedAt: new Date().toISOString(),
    formType: "performing-arts-choices",
    schoolYear: "2026-27",
    parent: { name: "Test Parent", email: Session.getActiveUser().getEmail() || "dhegelund@gmail.com" },
    children: [
      { name: "Elder Test", age: 14, join: "Yes", aladdin: "Yes", roles: "Genie",
        experience: "Two years of choir.", artsQuestion: "Dance / ukulele and guitar / piano",
        artsChoice: "Piano", spanish: "Yes" },
      { name: "Younger Test", age: 7, join: "No", aladdin: "", roles: "",
        experience: "", artsQuestion: "Not asked (age 6-8)", artsChoice: "", spanish: "No" }
    ],
    notes: ""
  };
  Logger.log(JSON.stringify(handleSubmission(fake), null, 2));
}
