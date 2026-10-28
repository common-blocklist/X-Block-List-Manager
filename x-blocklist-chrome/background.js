// Works in Firefox (MV2 background script) and Chromium browsers (MV3 service worker).
const api = globalThis.browser ?? chrome;
const toolbarButton = api.action ?? api.browserAction;

// Opens the dashboard page when the toolbar button is clicked.
toolbarButton.onClicked.addListener(async () => {
  const url = api.runtime.getURL("dashboard.html");
  const existing = await api.tabs.query({ url });
  if (existing.length) {
    await api.tabs.update(existing[0].id, { active: true });
    await api.windows.update(existing[0].windowId, { focused: true });
  } else {
    await api.tabs.create({ url });
  }
});
