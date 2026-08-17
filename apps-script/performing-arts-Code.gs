/**
 * River Tech — Performing Arts Choices (2026-27) Backend
 * Google Apps Script web app. Deploy with:
 *   Deploy > New deployment > Type: Web app
 *   Execute as: Me (learn@rivertech.me)
 *   Who has access: Anyone
 *
 * Receives one full-time student's performing arts choices, writes a row
 * to the Sheet, emails the family a copy, and notifies staff.
 * No payment processing.
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
const FORM_PAGE_URL = "https://www.rivertechschool.com/pages/register-performing-arts-2026-27.html";

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
function handleSubmission(p) {
  if (!p || !p.student || !p.student.name) return { ok: false, error: "Please enter your student's name." };
  if (!p.parent || !p.parent.name || !p.parent.email) return { ok: false, error: "Parent name and email are required." };
  if (!p.student.age) return { ok: false, error: "Please choose your student's age." };
  if (!p.join) return { ok: false, error: "Please tell us whether your student will join our performances." };
  if (!p.spanish) return { ok: false, error: "Please answer the Spanish question." };

  const referenceId = "PA-" + Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyyMMdd-HHmmss")
    + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0");

  writeToSheet_(referenceId, p);
  sendParentEmail_(referenceId, p);
  sendNotificationEmail_(referenceId, p);

  return { ok: true, referenceId: referenceId };
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

function writeToSheet_(referenceId, p) {
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

  sh.appendRow([
    referenceId,
    p.submittedAt || new Date().toISOString(),
    p.schoolYear || "2026-27",
    p.student.name,
    p.student.age,
    p.parent.name,
    p.parent.email,
    p.join,
    p.aladdin || "",
    p.roles || "",
    p.experience || "",
    p.artsQuestion || "",
    p.artsChoice || "",
    p.spanish,
    p.notes || ""
  ]);
}

// ---- Emails -------------------------------------------------------------
function choiceLines_(p) {
  const lines = [];
  lines.push("Joining our performances: " + p.join);
  if (p.join === "Yes" && p.aladdin) {
    lines.push("Auditioning for Aladdin on August 31: " + p.aladdin);
    if (p.roles) lines.push("Roles of interest: " + p.roles);
  }
  if (p.artsChoice) lines.push("Arts choice this quarter: " + p.artsChoice);
  lines.push("Spanish this quarter: " + p.spanish);
  return lines;
}

function sendParentEmail_(referenceId, p) {
  const first = (p.parent.name || "").split(" ")[0] || "there";
  let lines = [
    "Hi " + first + ",",
    "",
    "Thank you for sending in " + p.student.name + "'s performing arts choices for the coming year. Here is what we have:",
    ""
  ];
  lines = lines.concat(choiceLines_(p).map(function (l) { return "  " + l; }));
  lines.push("");
  lines.push("Reference: " + referenceId);
  lines.push("");

  if (p.join === "Yes") {
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
      subject: "Performing arts choices received — " + p.student.name,
      body: lines.join("\n"),
      name: "River Tech School"
    });
  } catch (err) { Logger.log("Parent email failed: " + err); }
}

function sendNotificationEmail_(referenceId, p) {
  let lines = [
    "New performing arts choices submitted.",
    "",
    "Reference: " + referenceId,
    "Submitted: " + (p.submittedAt || new Date().toISOString()),
    "",
    "Student: " + p.student.name + "  (age " + p.student.age + ")",
    "Parent:  " + p.parent.name,
    "Email:   " + p.parent.email,
    ""
  ];
  lines = lines.concat(choiceLines_(p));
  lines.push("");
  lines.push("Question shown: " + (p.artsQuestion || "—"));
  if (p.experience) {
    lines.push("");
    lines.push("Stage experience: " + p.experience);
  }
  if (p.notes) {
    lines.push("");
    lines.push("Notes: " + p.notes);
  }
  lines.push("");
  lines.push("Row appended to " + SHEET_NAME + ".");

  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAILS.join(","),
      subject: "[Performing Arts] " + p.student.name + " — joining: " + p.join
        + (p.artsChoice ? (" / " + p.artsChoice) : ""),
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
    student: { name: "Test Student", age: 12 },
    parent: { name: "Test Parent", email: Session.getActiveUser().getEmail() || "dhegelund@gmail.com" },
    join: "Yes",
    aladdin: "Yes",
    roles: "Genie",
    experience: "Two years of choir.",
    artsQuestion: "Dance / ukulele and guitar / piano",
    artsChoice: "Piano",
    spanish: "Yes",
    notes: ""
  };
  Logger.log(JSON.stringify(handleSubmission(fake), null, 2));
}
