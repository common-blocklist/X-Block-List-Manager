// Adds an "add to list" button on x.com profile pages, left of the "..." button.
// Uses the list currently selected in the extension popup.
(() => {
  const BTN_ID = 'xblm-add-btn';
  let timer = null;

  function findAnchor() {
    // The "..." button of someone else's profile.
    return document.querySelector('[data-testid="userActions"]');
  }

  // Find the row holding the profile action buttons, and the child of that row
  // that contains the "..." button: our button goes right before it.
  function placement(anchor) {
    let item = anchor;
    while (item.parentElement) {
      const p = item.parentElement;
      if (p.querySelector('[data-testid="sendDMFromProfile"], [data-testid$="-follow"], [data-testid$="-unfollow"]')) {
        return { parent: p, before: item };
      }
      item = p;
    }
    return { parent: anchor.parentElement, before: anchor };
  }

  function applyStyle(btn, ref) {
    Object.assign(btn.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      height: '36px',
      padding: '0 16px',
      marginRight: '8px',
      borderRadius: '9999px',
      border: '1px solid rgba(128,128,128,0.6)',
      background: 'transparent',
      color: getComputedStyle(ref).color,
      font: '700 14px/1 -apple-system, "Segoe UI", sans-serif',
      whiteSpace: 'nowrap',
      cursor: 'pointer'
    });
  }

  function setLabel(btn, text, disabled, title) {
    if (btn.textContent !== text) btn.textContent = text; // avoid useless DOM mutations
    btn.disabled = disabled;
    btn.title = title;
    btn.style.opacity = disabled ? '0.6' : '1';
    btn.style.cursor = disabled ? 'default' : 'pointer';
  }

  function short(name) {
    return name.length > 18 ? name.slice(0, 17) + '\u2026' : name;
  }

  async function sync() {
    const handle = XBLM.handleFromUrl(location.href);
    const anchor = findAnchor();
    let btn = document.getElementById(BTN_ID);

    if (!handle || !anchor) { if (btn) btn.remove(); return; }

    const { parent, before } = placement(anchor);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.addEventListener('click', onClick);
    }
    if (btn.parentElement !== parent || btn.nextElementSibling !== before) {
      parent.insertBefore(btn, before);
    }
    applyStyle(btn, anchor);
    btn.dataset.handle = handle;

    const st = await XBLM.load();
    if (!st.active) {
      setLabel(btn, 'No list', true, 'Create a list from the extension popup first');
    } else if (st.lists[st.active].includes(handle)) {
      setLabel(btn, '\u2713 In ' + short(st.active), true, '@' + handle + ' is already in "' + st.active + '"');
    } else {
      setLabel(btn, '+ ' + short(st.active), false, 'Add @' + handle + ' to "' + st.active + '"');
    }
  }

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget.dataset.handle;
    const st = await XBLM.load();
    if (!st.active || !handle) return;
    const list = st.lists[st.active];
    if (!list.includes(handle)) {
      list.push(handle);
      await XBLM.save(st);
    }
    sync();
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(sync, 250); };

  // X is a single-page app: watch the DOM to catch navigation between profiles.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.xblm_lists || changes.xblm_active)) schedule();
  });
  schedule();
})();
