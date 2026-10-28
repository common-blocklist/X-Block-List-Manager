// Shared helpers for the popup and the import page.
const XBLM = (() => {
  const KEY_LISTS = 'xblm_lists';       // { "list name": ["handle1", "handle2"] }
  const KEY_ACTIVE = 'xblm_active';     // name of the selected list
  const KEY_PENDING = 'pendingBlockList'; // handoff popup -> dashboard

  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const RESERVED = new Set([
    'home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search',
    'compose', 'login', 'logout', 'signup', 'tos', 'privacy', 'intent', 'share',
    'hashtag', 'jobs', 'premium', 'communities', 'lists', 'bookmarks',
    'following', 'followers', 'verified', 'account', 'download', 'about'
  ]);

  // "https://x.com/Name/with_replies" -> "name" ; non-profile pages -> null
  function handleFromUrl(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const host = u.hostname.replace(/^(www|mobile)\./, '');
    if (host !== 'x.com' && host !== 'twitter.com') return null;
    const seg = u.pathname.split('/').filter(Boolean)[0];
    if (!seg || RESERVED.has(seg.toLowerCase()) || !HANDLE_RE.test(seg)) return null;
    return seg.toLowerCase();
  }

  // Accepts @handle, bare handle, profile URLs; separators: lines, commas, semicolons, spaces.
  // Lines starting with # are ignored.
  function parseHandles(text) {
    const out = new Set();
    text.split(/\r?\n/).forEach((line) => {
      if (line.trim().startsWith('#')) return;
      line.split(/[\s,;]+/).forEach((tok) => {
        if (!tok) return;
        let h = null;
        if (/^https?:\/\//i.test(tok)) {
          h = handleFromUrl(tok);
        } else {
          const t = tok.replace(/^@/, '');
          if (HANDLE_RE.test(t)) h = t.toLowerCase();
        }
        if (h) out.add(h);
      });
    });
    return [...out];
  }

  async function load() {
    const d = await browser.storage.local.get([KEY_LISTS, KEY_ACTIVE]);
    const lists = d[KEY_LISTS] || {};
    let active = d[KEY_ACTIVE];
    if (!active || !lists[active]) active = Object.keys(lists)[0] || null;
    return { lists, active };
  }

  async function save(state) {
    await browser.storage.local.set({
      [KEY_LISTS]: state.lists,
      [KEY_ACTIVE]: state.active
    });
  }

  function cleanName(name) {
    return name.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60);
  }

  return { KEY_PENDING, handleFromUrl, parseHandles, load, save, cleanName };
})();
