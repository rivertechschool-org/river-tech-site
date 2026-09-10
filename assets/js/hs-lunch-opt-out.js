(function () {
  'use strict';
  const YEAR = '2026-27';
  const VERSION = 'hs-lunch-opt-out-2026-27-v1';
  const PREVIEW = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const BACKEND = PREVIEW ? '/__lunch-api' : 'https://script.google.com/macros/s/AKfycbwhK9l0Ve9IVj9GU4F0BttzPtPD52tMxWNIBs2EUIf5Xg8prXlOQ8UD2Bon74K2aOtH/exec';
  let counter = 0, available = false, sending = false, saved = false, request = null;
  const byId = id => document.getElementById(id);
  const val = id => byId(id).value.trim();

  function addStudent() {
    const list = byId('student-list');
    if (list.children.length >= 12) return;
    const id = 'student-' + (++counter);
    const card = document.createElement('div');
    card.className = 'lo-student';
    card.innerHTML = '<div class="lo-student-head"><strong class="lo-student-title"></strong><button type="button" class="lo-secondary lo-remove">Remove</button></div>' +
      '<div class="reg-row"><label class="reg-label" for="' + id + '-name">Student full name <span class="req">*</span></label><input class="reg-input" id="' + id + '-name" data-field="name" autocomplete="off" maxlength="160" required></div>' +
      '<div><label class="reg-label" for="' + id + '-grade">Grade <span class="req">*</span></label><select class="reg-select" id="' + id + '-grade" data-field="grade" required><option value="">Choose a grade</option><option value="9">9th grade</option><option value="10">10th grade</option><option value="11">11th grade</option><option value="12">12th grade</option></select></div>';
    list.appendChild(card);
    card.querySelector('.lo-remove').addEventListener('click', function () {
      if (list.children.length <= 1) return;
      card.remove(); renumber(); byId('add-student').focus();
    });
    renumber();
    if (list.children.length > 1) card.querySelector('input').focus();
  }
  function renumber() {
    const cards = [...byId('student-list').children];
    cards.forEach(function (card, i) {
      card.querySelector('.lo-student-title').textContent = 'Student ' + (i + 1);
      card.querySelector('.lo-remove').hidden = cards.length === 1;
      card.querySelector('.lo-remove').setAttribute('aria-label', 'Remove student ' + (i + 1));
    });
    byId('add-student').hidden = cards.length >= 12;
  }
  function showError(message) {
    const box = byId('reg-error'); box.textContent = message; box.classList.add('show'); box.focus();
  }
  function clearError() { byId('reg-error').classList.remove('show'); }
  async function config() {
    const response = await fetch(BACKEND + '?action=lunchOptOutConfig', {cache: 'no-store'});
    const data = await response.json();
    if (!response.ok || !data.ok || data.formType !== 'hs-lunch-opt-out' || data.schoolYear !== YEAR || data.policyVersion !== VERSION || data.open !== true)
      throw Error('This form is not accepting submissions yet. Please try again later.');
    return data;
  }
  function payload() {
    return {formType: 'hs-lunch-opt-out', schoolYear: YEAR, policyVersion: VERSION,
      parent: {name: val('parentName'), email: val('parentEmail'), phone: val('parentPhone')},
      students: [...byId('student-list').children].map(card => ({name: card.querySelector('[data-field="name"]').value.trim(), grade: card.querySelector('[data-field="grade"]').value})),
      optOut: {confirmed: byId('optOutConfirmed').checked, signatureName: val('signatureName')}};
  }
  async function requestId(details) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(details)));
    const key = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (!request) {
      try { request = JSON.parse(sessionStorage.getItem('lunch-opt-out-request') || 'null'); } catch (_) {}
    }
    // Retain a retry ID and digest, without storing family details.
    if (!request || request.digest !== key) request = {id: crypto.randomUUID(), digest: key};
    try { sessionStorage.setItem('lunch-opt-out-request', JSON.stringify(request)); } catch (_) {}
    return request.id;
  }
  function receipt(data, details) {
    const list = byId('receipt-students'); list.replaceChildren();
    details.students.forEach(function (student) {
      const item = document.createElement('li'); item.textContent = student.name + ' (grade ' + student.grade + ')'; list.appendChild(item);
    });
    byId('receipt-reference').textContent = data.referenceId;
    byId('lunch-opt-out-form').hidden = true; byId('lo-receipt').hidden = false;
    byId('lo-receipt').focus({preventScroll: true}); byId('lo-receipt').scrollIntoView({block: 'start'});
    if (PREVIEW) byId('receipt-title').textContent = 'Your test opt-out has been recorded.';
    try { sessionStorage.removeItem('lunch-opt-out-request'); } catch (_) {}
  }
  async function submit(event) {
    event.preventDefault(); if (sending || saved) return; clearError();
    const form = byId('lunch-opt-out-form');
    [...form.querySelectorAll('input')].forEach(input => { if (input.type !== 'checkbox') input.value = input.value.trim(); });
    if (!form.reportValidity()) return;
    const details = payload();
    if (new Set(details.students.map(s => s.name.toLocaleLowerCase())).size !== details.students.length) { showError('A student is listed twice. Please remove the duplicate.'); return; }
    if (!available) { showError('The form is not ready. Please reload the page and try again.'); return; }
    sending = true; byId('lo-fields').disabled = true; byId('reg-submit').textContent = 'Saving your opt-out…';
    byId('form-status').textContent = 'Please keep this page open while your opt-out is saved.';
    try {
      const id = await requestId(details);
      await config();
      const response = await fetch(BACKEND, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({...details, requestId: id})});
      const data = await response.json();
      if (!response.ok || !data.ok) throw Error(data.error || 'We could not confirm that your opt-out was saved. Please retry with the same details.');
      if (data.referenceId !== 'LO-' + id || data.studentCount !== details.students.length || data.schoolYear !== YEAR)
        throw Error('We could not verify the confirmation. Please retry with the same details.');
      saved = true; receipt(data, details);
    } catch (e) {
      showError(e.message === 'Failed to fetch' ? 'We could not reach the form service. Please check your connection and retry with the same details.' : e.message);
      byId('form-status').textContent = 'Your entries are still here. You can try submitting again.';
    } finally { sending = false; byId('lo-fields').disabled = false; byId('reg-submit').textContent = 'Submit opt-out →'; }
  }
  document.addEventListener('DOMContentLoaded', async function () {
    byId('preview-notice').hidden = !PREVIEW;
    byId('add-student').addEventListener('click', addStudent);
    byId('receipt-print').addEventListener('click', () => window.print());
    byId('lunch-opt-out-form').addEventListener('submit', submit);
    addStudent();
    try { await config(); available = true; byId('reg-submit').disabled = false; byId('form-status').textContent = ''; }
    catch (e) { byId('form-status').textContent = 'Submissions are currently unavailable.'; showError(e.message); }
  });
})();
