const form = document.querySelector('#entry-form');
const status = form.querySelector('.form-status');
const linkPanel = form.querySelector('#film-link');
const uploadPanel = form.querySelector('#film-upload');
const linkInput = form.elements.filmUrl;
const videoInput = form.elements.filmFile;
const submitter = form.elements.submitter;
const guardianDetails = form.querySelector('#guardian-details');
const guardianName = form.elements.guardianName;
const controls = [...form.elements].filter(control => control.matches('input, select, button'));
const maxVideoBytes = 100_000_000;
const uploadChunkBytes = 4 * 1024 * 1024;
let lastAttempt;

function updateFilmMethod() {
  const isUpload = form.elements.filmMethod.value === 'upload';
  linkPanel.hidden = isUpload;
  linkInput.disabled = isUpload;
  linkInput.required = !isUpload;
  uploadPanel.hidden = !isUpload;
  videoInput.disabled = !isUpload;
  videoInput.required = isUpload;
}

function updateSubmitter() {
  const isGuardian = submitter.value === 'parent-guardian';
  guardianDetails.hidden = !isGuardian;
  guardianName.disabled = !isGuardian;
  guardianName.required = isGuardian;
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.toggleAttribute('data-error', isError);
}

async function sendToIntake(endpoint, body, timeout = 45000) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=UTF-8'},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error('Intake request failed');
  const result = await response.json();
  if (!result.ok) {
    const error = new Error(result.message);
    error.publicMessage = result.message;
    throw error;
  }
  return result;
}

async function encodeChunk(chunk) {
  const bytes = new Uint8Array(await chunk.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 32768) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
  }
  return btoa(binary);
}

async function submitHostedEntry(endpoint, id, entry, film) {
  if (!film) return sendToIntake(endpoint, {action: 'save-link', id, entry});
  const metadata = {...entry, fileName: film.name, fileSize: film.size};
  const started = await sendToIntake(endpoint, {action: 'start-upload', id, entry: metadata});
  if (started.saved) return started;
  let offset = started.offset;
  while (offset < film.size) {
    showStatus(`Uploading your film… ${Math.floor(offset * 100 / film.size)}%`);
    const chunk = await encodeChunk(film.slice(offset, offset + uploadChunkBytes));
    const result = await sendToIntake(endpoint, {action: 'upload-chunk', id, offset, chunk}, 90000);
    if (!Number.isInteger(result.offset) || result.offset <= offset || result.offset > film.size) {
      throw new Error('Unexpected upload offset');
    }
    offset = result.offset;
  }
  if (offset !== film.size) throw new Error('Unexpected upload size');
  return sendToIntake(endpoint, {action: 'finish-upload', id, entry: metadata});
}

for (const radio of form.elements.filmMethod) {
  radio.addEventListener('change', updateFilmMethod);
}
submitter.addEventListener('change', updateSubmitter);
updateFilmMethod();
updateSubmitter();

form.addEventListener('submit', async event => {
  event.preventDefault();

  if (location.protocol === 'file:') {
    showStatus('Open the browser preview to try submitting an entry.', true);
    return;
  }

  const isUpload = form.elements.filmMethod.value === 'upload';
  const film = isUpload ? videoInput.files[0] : null;
  if (isUpload && (!film || !/\.(mp4|mov)$/i.test(film.name) || film.size === 0 || film.size > maxVideoBytes)) {
    showStatus('Choose an MP4 or MOV file up to 100 MB, or submit a link to your film.', true);
    videoInput.focus();
    return;
  }

  const formData = new FormData(form);
  formData.delete('filmMethod');
  formData.delete('filmFile');
  const entry = Object.fromEntries(formData);
  const content = JSON.stringify(entry);
  if (content !== lastAttempt?.content || film !== lastAttempt?.film) {
    lastAttempt = { content, film, id: crypto.randomUUID() };
  }
  formData.set('id', lastAttempt.id);
  if (film) formData.set('filmFile', film);

  controls.forEach(control => { control.disabled = true; });
  showStatus(isUpload ? 'Uploading your film. Keep this page open…' : 'Saving your entry…');

  try {
    const preview = ['127.0.0.1', 'localhost'].includes(location.hostname);
    let result;
    let saved;
    if (preview) {
      const response = await fetch(form.action, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(isUpload ? 300_000 : 12_000),
      });
      result = await response.json();
      saved = response.ok;
    } else {
      const endpoint = form.dataset.intakeUrl;
      if (!endpoint) {
        showStatus('The competition is not accepting entries right now.', true);
        return;
      }
      result = await submitHostedEntry(endpoint, lastAttempt.id, entry, film);
      saved = result.saved === true;
    }
    showStatus(result.message, !saved);
    if (saved) {
      form.reset();
      lastAttempt = undefined;
    }
  } catch (error) {
    showStatus(error.publicMessage || 'We couldn’t confirm that your entry was saved. Your answers are still here. Please try again.', true);
  } finally {
    controls.forEach(control => { control.disabled = false; });
    updateFilmMethod();
    updateSubmitter();
  }
});
