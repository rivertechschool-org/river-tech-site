/* Accessible, progressively enhanced organization tabs. */
(function () {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('[data-jobs-tab]'));
  if (!tabs.length) return;
  const tablist = tabs[0].parentElement;
  tablist.setAttribute('role', 'tablist');
  function activate(tab, focus) {
    tabs.forEach(function (item) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById('panel-' + item.dataset.jobsTab).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, index) {
    const panel = document.getElementById('panel-' + tab.dataset.jobsTab);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    tab.addEventListener('click', function () { activate(tab, false); });
    tab.addEventListener('keydown', function (event) {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target !== undefined) {
        event.preventDefault();
        activate(tabs[target], true);
      }
    });
  });
  const linkedTab = tabs.find(function (tab) { return window.location.hash === "#" + tab.id; });
  activate(linkedTab || tabs[0], false);
})();
