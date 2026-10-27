// Runs inside x.com tabs so requests are same-origin and use your logged-in session.
(() => {
  if (window.__xBlockListManager) return;
  window.__xBlockListManager = true;

  // Public bearer token used by the X web client itself.
  const BEARER =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

  function getCsrf() {
    const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    return m ? m[1] : null;
  }

  async function callBlockApi(action, handle) {
    const csrf = getCsrf();
    if (!csrf) {
      return { ok: false, status: 0, fatal: true, message: "Not logged in to X in this tab (no ct0 cookie)." };
    }
    try {
      const res = await fetch(`${location.origin}/i/api/1.1/blocks/${action}.json`, {
        method: "POST",
        credentials: "include",
        headers: {
          authorization: `Bearer ${BEARER}`,
          "x-csrf-token": csrf,
          "x-twitter-auth-type": "OAuth2Session",
          "x-twitter-active-user": "yes",
          "x-twitter-client-language": "en",
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ screen_name: handle, skip_status: "1" }).toString()
      });
      let data = null;
      try { data = await res.json(); } catch (_) {}
      const err = data && data.errors && data.errors[0];
      const reset = Number(res.headers.get("x-rate-limit-reset"));
      return {
        ok: res.ok,
        status: res.status,
        code: err ? err.code : null,
        message: err ? err.message : res.ok ? "" : `HTTP ${res.status}`,
        resetAt: reset ? reset * 1000 : null
      };
    } catch (e) {
      return { ok: false, status: 0, message: "Network error: " + e.message };
    }
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === "xbl-ping") {
      return Promise.resolve({ ok: true, loggedIn: !!getCsrf() });
    }
    if (msg.type === "xbl-api") {
      return callBlockApi(msg.action === "unblock" ? "destroy" : "create", msg.handle);
    }
  });
})();
