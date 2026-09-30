(async function () {
  'use strict';
  const endpoint = 'https://script.google.com/macros/s/AKfycbwhK9l0Ve9IVj9GU4F0BttzPtPD52tMxWNIBs2EUIf5Xg8prXlOQ8UD2Bon74K2aOtH/exec';
  const title = document.getElementById('confirmation-title');
  const status = document.getElementById('confirmation-status');
  const session = new URLSearchParams(location.search).get('session_id');
  if (!session || !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(session)) {
    title.textContent = 'Pumpkin Patch registration';
    status.textContent = 'There is no payment confirmation to check on this page. Please use the registration form to sign up.';
    return;
  }
  if (['localhost','127.0.0.1','[::1]'].includes(location.hostname)) {
    title.textContent = 'Payment confirmation preview';
    status.textContent = 'No payment is checked or recorded in this preview.'; return;
  }
  try {
    const response = await fetch(endpoint + '?action=pumpkin_status&session_id=' + encodeURIComponent(session));
    if (!response.ok) throw new Error('connection');
    let result = await response.json();
    // Preserve confirmation links for the previous trip, using its own verifier.
    if (!result.ok) {
      const previous = await fetch(endpoint + '?action=hiddenAcresStatus&session_id=' + encodeURIComponent(session));
      if (previous.ok) {const old = await previous.json(); if (old.ok && old.tripId === 'hidden-acres-2026-09-16') result = old;}
    }
    if (!result.ok || !['pumpkin-patch-2026-10-07','hidden-acres-2026-09-16'].includes(result.tripId)) throw new Error('unverified');
    document.getElementById('upcoming-trip-details').hidden = result.tripId !== 'pumpkin-patch-2026-10-07';
    if (result.paid) {
      title.textContent = result.tripId === 'pumpkin-patch-2026-10-07' ? 'You’re signed up' : 'Previous payment confirmed';
      status.textContent = result.tripId === 'pumpkin-patch-2026-10-07'
        ? 'Your Pumpkin Patch registration and payment are confirmed. We look forward to seeing you on Wednesday, October 7.'
        : 'Your previous Hidden Acres registration and payment for September 16, 2026 are confirmed.';
      document.getElementById('confirmation-reference').textContent = 'Registration reference: ' + result.registrationId;
      sessionStorage.removeItem(result.tripId);
    } else {
      title.textContent = 'Payment is not yet confirmed';
      status.textContent = 'If you just paid, refresh this page shortly. If you did not finish payment, return to the registration form or contact Mary.';
    }
  } catch (_) {
    title.textContent = 'We couldn’t confirm your payment yet';
    status.textContent = 'Please refresh this page shortly. If you already paid, do not pay again; contact the school so we can check your registration.';
  }
})();
