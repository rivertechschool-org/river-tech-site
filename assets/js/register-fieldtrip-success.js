(async function () {
  'use strict';
  const endpoint = 'https://script.google.com/macros/s/AKfycbwhK9l0Ve9IVj9GU4F0BttzPtPD52tMxWNIBs2EUIf5Xg8prXlOQ8UD2Bon74K2aOtH/exec';
  const title = document.getElementById('confirmation-title');
  const status = document.getElementById('confirmation-status');
  const session = new URLSearchParams(location.search).get('session_id');
  if (!session || !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(session)) {
    title.textContent = 'Hidden Acres registration';
    status.textContent = 'There is no payment confirmation to check on this page. Please use the registration form to sign up.';
    return;
  }
  if (['localhost','127.0.0.1','[::1]'].includes(location.hostname)) {
    title.textContent = 'Payment confirmation preview';
    status.textContent = 'No payment is checked or recorded in this preview.'; return;
  }
  try {
    const response = await fetch(endpoint + '?action=hiddenAcresStatus&session_id=' + encodeURIComponent(session));
    if (!response.ok) throw new Error('connection');
    const result = await response.json();
    if (!result.ok || result.tripId !== 'hidden-acres-2026-09-16') throw new Error('unverified');
    if (result.paid) {
      title.textContent = 'You’re signed up';
      status.textContent = 'Your Hidden Acres registration and payment are confirmed. We look forward to seeing your student on Wednesday, September 16.';
      document.getElementById('confirmation-reference').textContent = 'Registration reference: ' + result.registrationId;
      sessionStorage.removeItem('hidden-acres-2026-09-16');
    } else {
      title.textContent = 'Payment is not yet confirmed';
      status.textContent = 'If you just paid, refresh this page shortly. If you did not finish payment, return to the registration form or contact Mary.';
    }
  } catch (_) {
    title.textContent = 'We couldn’t confirm your payment yet';
    status.textContent = 'Please refresh this page shortly. If you already paid, do not pay again; contact the school so we can check your registration.';
  }
})();
