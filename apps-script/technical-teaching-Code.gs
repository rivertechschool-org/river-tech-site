/** River Tech LLC technical teaching intake. Deploy separately from the legacy forms.
 * Set JOBS_LIVE_SHEET_ID and JOBS_LIVE_FILES_FOLDER_ID to dedicated, private Drive resources.
 */
const JOBS_HEADERS = [
  'Application ID', 'Received (UTC)', 'First name', 'Last name', 'Email', 'Specialties',
  'Qualifications and professional experience', 'Work example', 'Teaching experience',
  'How they would teach', 'Work sample link', 'Work sample files', 'Earliest start'
];
const JOBS_MAX_FILES = 6;
const JOBS_MAX_FILE_BYTES = 8 * 1024 * 1024;
const JOBS_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function doGet() {
  return jobsJson_({ok: true, intake: 'technical-teaching'});
}

function doPost(event) {
  let submission;
  try {
    const body = event.postData.contents;
    if (body.length > Math.ceil(JOBS_MAX_TOTAL_BYTES * 4 / 3) + 50000) {
      throw new Error('Work samples must total 20 MB or less.');
    }
    submission = jobsValidate_(JSON.parse(body));
  } catch (error) {
    return jobsJson_({ok: false, error: error.message || 'Please check your application.'});
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const sheet = SpreadsheetApp.openById(properties.getProperty('JOBS_LIVE_SHEET_ID')).getSheetByName('Applicants');
    const folder = DriveApp.getFolderById(properties.getProperty('JOBS_LIVE_FILES_FOLDER_ID'));
    const applicationId = jobsSave_(submission, sheet, folder);
    return jobsJson_({ok: true, applicationId: applicationId});
  } catch (error) {
    console.error('Technical teaching intake failed: ' + error.message);
    return jobsJson_({ok: false, error: 'We couldn’t confirm receipt. Please try again.'});
  }
}

function jobsJson_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function jobsText_(input, key, label, limit, required) {
  const value = typeof input[key] === 'string' ? input[key].trim() : '';
  if (required && !value) throw new Error('Please fill in ' + label + '.');
  if (value.length > limit) throw new Error(label + ' must be ' + limit + ' characters or fewer.');
  return value;
}

function jobsValidate_(input) {
  if (!input || typeof input !== 'object' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.requestId || '')) {
    throw new Error('Please reload the form and try again.');
  }
  const fields = [
    ['firstName', 'first name', 100], ['lastName', 'last name', 100], ['email', 'email', 254],
    ['specialties', 'specialties', 500], ['qualifications', 'qualifications', 4000],
    ['workExample', 'work example', 4000], ['teachingExperience', 'teaching experience', 4000],
    ['teachingExample', 'teaching approach', 4000]
  ];
  const application = {id: 'RTJ-' + input.requestId.toLowerCase()};
  fields.forEach(function (field) {
    application[field[0]] = jobsText_(input, field[0], field[1], field[2], true);
  });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) throw new Error('Please enter a valid email address.');
  application.workSampleLink = jobsText_(input, 'workSampleLink', 'work sample link', 2000, false);
  application.startTiming = jobsText_(input, 'startTiming', 'start timing', 250, false);
  if (application.workSampleLink && !/^https?:\/\/[^\s/]+(?:[^\s]*)$/i.test(application.workSampleLink)) {
    throw new Error('Use an https:// or http:// link to your work.');
  }
  if (!Array.isArray(input.workSampleFiles) || input.workSampleFiles.length > JOBS_MAX_FILES) {
    throw new Error('Choose up to six work sample files.');
  }
  let total = 0;
  application.files = input.workSampleFiles.map(function (file) {
    if (!file || typeof file.base64 !== 'string' || file.base64.length > Math.ceil(JOBS_MAX_FILE_BYTES / 3) * 4) {
      throw new Error('Each work sample file must be 8 MB or less.');
    }
    const bytes = Utilities.base64Decode(file.base64);
    total += bytes.length;
    if (bytes.length > JOBS_MAX_FILE_BYTES || total > JOBS_MAX_TOTAL_BYTES) {
      throw new Error('Work sample files must be 8 MB or less each and 20 MB or less in total.');
    }
    const name = typeof file.name === 'string' ? file.name.slice(-180).replace(/[^\p{L}\p{N} ._-]/gu, '_') : '';
    const mime = jobsFileType_(name, bytes);
    if (!mime) throw new Error('Work sample files must be PDFs, JPGs, PNGs, or WebP images.');
    return {name: name, bytes: bytes, mime: mime};
  });
  if (!application.workSampleLink && !application.files.length) throw new Error('Add a work-sample link or choose at least one file.');
  return application;
}

function jobsFileType_(name, bytes) {
  function startsAt(offset, prefix) {
    return prefix.every(function (value, i) { return (bytes[offset + i] & 255) === value; });
  }
  if (/\.pdf$/i.test(name) && startsAt(0, [37, 80, 68, 70, 45])) return 'application/pdf';
  if (/\.jpe?g$/i.test(name) && startsAt(0, [255, 216, 255])) return 'image/jpeg';
  if (/\.png$/i.test(name) && startsAt(0, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (/\.webp$/i.test(name) && startsAt(0, [82, 73, 70, 70]) && startsAt(8, [87, 69, 66, 80])) return 'image/webp';
  return '';
}

function jobsSafeCell_(value) {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function jobsHasRow_(sheet, id) {
  const count = sheet.getLastRow() - 1;
  return count > 0 && !!sheet.getRange(2, 1, count, 1).createTextFinder(id).matchEntireCell(true).findNext();
}

function jobsSave_(application, sheet, parentFolder) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let sampleFolder;
  try {
    if (!sheet) throw new Error('Applicants sheet missing.');
    if (sheet.getLastRow() === 0) sheet.appendRow(JOBS_HEADERS);
    if (jobsHasRow_(sheet, application.id)) return application.id;
    let fileLinks = '';
    if (application.files.length) {
      sampleFolder = parentFolder.createFolder(application.id);
      fileLinks = application.files.map(function (file, index) {
        const blob = Utilities.newBlob(file.bytes, file.mime, (index + 1) + '-' + file.name);
        return sampleFolder.createFile(blob).getUrl();
      }).join('\n');
    }
    sheet.appendRow([
      application.id, new Date().toISOString(), application.firstName, application.lastName, application.email,
      application.specialties, application.qualifications, application.workExample, application.teachingExperience,
      application.teachingExample, application.workSampleLink, fileLinks, application.startTiming
    ].map(jobsSafeCell_));
    SpreadsheetApp.flush();
    return application.id;
  } catch (error) {
    if (sheet && jobsHasRow_(sheet, application.id)) return application.id;
    if (sampleFolder) sampleFolder.setTrashed(true);
    throw error;
  } finally {
    lock.releaseLock();
  }
}
