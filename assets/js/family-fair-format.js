// Shared browser/server rules. In Apps Script, add this file as Format.gs.
var FamilyFairFormat = (() => {
  function website(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return {url:'', error:''};
    const url = 'https://' + text.replace(/^https?:\/\//i, '');
    const valid = url.length <= 300 && /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?::443)?(?:[/?#][^\s<>"\\]*)?$/i.test(url);
    return {url, error:valid ? '' : 'Enter a website address such as example.com, or leave this blank.'};
  }
  function description(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    // Keep ordinary abbreviations, web addresses and decimals from counting as sentences.
    const prose = text.replace(/https?:\/\/\S+/gi, url => 'website' + (url.match(/[.!?]+["'”’)\]]*$/u)?.[0] || ''))
      .replace(/\b(?:[a-z]\.){2,}/gi, word => word.replace(/\./g, ''))
      .replace(/\b(?:mr|mrs|ms|dr|st|jr|sr|vs|e\.g|i\.e)\./gi, word => word.replace(/\./g, ''));
    const sentences = prose.split(/[.!?]+["'”’)\]]*(?:\s+|$)/u).filter(part => /[\p{L}\p{N}]/u.test(part)).length;
    let error = '';
    if (!text) error = 'Write a short introduction.';
    else if (/[\r\n\u2028\u2029]/.test(text)) error = 'Keep your description to one paragraph, without line breaks.';
    else if (text.length > 300) error = 'Keep your description to 300 characters or fewer.';
    else if (sentences > 5) error = 'Keep your description to five sentences or fewer.';
    return {text, sentences, error};
  }
  function crop(width, height, zoom = 1, horizontal = 50, vertical = 50) {
    if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid photo dimensions.');
    const clamp = (n, low, high) => Math.min(high, Math.max(low, Number.isFinite(Number(n)) ? Number(n) : low));
    const size = Math.min(width, height) / clamp(zoom, 1, 3);
    return {x:(width - size) * clamp(horizontal, 0, 100) / 100,
      y:(height - size) * clamp(vertical, 0, 100) / 100, size};
  }
  return {website, description, crop};
})();
if (typeof module !== 'undefined') module.exports = FamilyFairFormat;
