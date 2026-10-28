// Adds an "add to list" button on x.com profile pages, left of the "..." button.
// Uses the list currently selected in the extension popup.
(() => {
  const BTN_ID = 'xblm-add-btn';
  const STYLE_ID = 'xblm-style';
  let timer = null;

  // Fixed accent colours that read well on both X's light and dark themes.
  const CSS = `
    #${BTN_ID} {
      display: inline-flex; align-items: center; justify-content: center;
      box-sizing: border-box; padding: 0 16px; margin-right: 8px;
      border: 1px solid transparent; border-radius: 9999px;
      font: 700 14px/1 -apple-system, "Segoe UI", Roboto, sans-serif;
      white-space: nowrap; cursor: pointer; transition: filter .15s;
    }
    #${BTN_ID}[data-state="add"] { background: #1d9bf0; border-color: #1d9bf0; color: #fff; }
    #${BTN_ID}[data-state="add"]:hover { filter: brightness(1.12); }
    #${BTN_ID}[data-state="added"] { background: transparent; border-color: #00ba7c; color: #00ba7c; cursor: default; }
    #${BTN_ID}[data-state="none"] {
      background: transparent; cursor: default; opacity: .6;
      color: var(--xblm-fg, currentColor); border-color: var(--xblm-fg, currentColor);
    }
  `;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

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

  // Match X's own buttons: same height, same vertical margins, same alignment.
  function matchLayout(btn, anchor, before) {
    const h = Math.round(anchor.getBoundingClientRect().height) || 36;
    const cs = getComputedStyle(before);
    btn.style.height = h + 'px';
    btn.style.marginTop = cs.marginTop;
    btn.style.marginBottom = cs.marginBottom;
    btn.style.alignSelf = cs.alignSelf !== 'auto' ? cs.alignSelf : 'center';
    btn.style.setProperty('--xblm-fg', getComputedStyle(anchor).color);
  }

  function setState(btn, state, text, disabled, title) {
    if (btn.textContent !== text) btn.textContent = text; // avoid useless DOM mutations
    btn.dataset.state = state;
    btn.disabled = disabled;
    btn.title = title;
  }

  function short(name) {
    return name.length > 18 ? name.slice(0, 17) + '\u2026' : name;
  }

  async function sync() {
    const handle = XBLM.handleFromUrl(location.href);
    const anchor = findAnchor();
    let btn = document.getElementById(BTN_ID);

    if (!handle || !anchor) { if (btn) btn.remove(); return; }

    ensureStyle();
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
    matchLayout(btn, anchor, before);
    btn.dataset.handle = handle;

    const st = await XBLM.load();
    if (!st.active) {
      setState(btn, 'none', 'No list', true, 'Create a list from the extension popup first');
    } else if (st.lists[st.active].includes(handle)) {
      setState(btn, 'added', '\u2713 In ' + short(st.active), true, '@' + handle + ' is already in "' + st.active + '"');
    } else {
      setState(btn, 'add', '+ ' + short(st.active), false, 'Add @' + handle + ' to "' + st.active + '"');
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
