(function () {
  'use strict';

  const form = document.getElementById('jobs-application');
  if (!form) return;
  const workLink = document.getElementById('jobs-portfolio');
  const workFiles = document.getElementById('jobs-work-files');
  const status = document.getElementById('jobs-application-result');
  const button = form.querySelector('button[type="submit"]');
  const bytesPerMb = 1024 * 1024;
  let endpoint = form.dataset.endpoint;
  let requestId;
  let sending = false;

  function validateWorkSamples() {
    const link = workLink.value.trim();
    const files = Array.from(workFiles.files);
    let linkError = '';
    let fileError = '';
    if (!link && !files.length) linkError = 'Add a work-sample link or choose at least one file.';
    if (link && !/^https?:\/\//i.test(link)) linkError = 'Use an https:// or http:// link to your work.';
    if (files.length > 6) fileError = 'Choose up to six work sample files.';
    else if (files.some(function (file) { return file.size > 8 * bytesPerMb; })) fileError = 'Each file must be 8 MB or less.';
    else if (files.reduce(function (total, file) { return total + file.size; }, 0) > 20 * bytesPerMb) fileError = 'Files must total 20 MB or less.';
    workLink.setCustomValidity(linkError);
    workFiles.setCustomValidity(fileError);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.addEventListener('error', function () { reject(new Error('We couldn’t read a selected file. Please choose it again.')); });
      reader.addEventListener('load', function () {
        resolve({name: file.name, base64: reader.result.split(',', 2)[1]});
      });
      reader.readAsDataURL(file);
    });
  }

  workLink.addEventListener('input', validateWorkSamples);
  workFiles.addEventListener('change', validateWorkSamples);
  validateWorkSamples();

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!endpoint || sending) return;
    validateWorkSamples();
    if (!form.reportValidity()) return;

    sending = true;
    button.disabled = true;
    status.hidden = false;
    status.textContent = 'Sending your application…';
    try {
      requestId = requestId || crypto.randomUUID();
      const application = Object.fromEntries(new FormData(form));
      application.requestId = requestId;
      application.workSampleFiles = await Promise.all(Array.from(workFiles.files, readFile));
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(application)
      });
      if (!response.ok) throw new Error('We couldn’t confirm receipt. Please try again.');
      const result = await response.json();
      if (!result.ok || !result.applicationId) throw new Error(result.error || 'We couldn’t confirm receipt. Please try again.');
      status.textContent = 'Application received. Your reference is ' + result.applicationId + '.';
      form.reset();
      validateWorkSamples();
      requestId = undefined;
    } catch (error) {
      status.textContent = error.message || 'We couldn’t confirm receipt. Please try again.';
    } finally {
      sending = false;
      button.disabled = false;
    }
  });

  if (endpoint) {
    button.disabled = false;
    button.textContent = 'Submit application';
  } else if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    fetch('/__jobs-preview/health').then(function (response) {
      return response.ok ? response.json() : null;
    }).then(function (result) {
      if (!result || result.intake !== 'technical-teaching') return;
      endpoint = '/__jobs-preview/submit';
      button.disabled = false;
      button.textContent = 'Send test application';
      document.getElementById('application-note').textContent = 'Local application test. Use fictional details and files.';
    }).catch(function () {});
  }
})();
