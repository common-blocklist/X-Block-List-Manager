// Opens the dashboard page when the toolbar button is clicked.
browser.browserAction.onClicked.addListener(async () => {
  const url = browser.runtime.getURL("dashboard.html");
  const existing = await browser.tabs.query({ url });
  if (existing.length) {
    await browser.tabs.update(existing[0].id, { active: true });
    await browser.windows.update(existing[0].windowId, { focused: true });
  } else {
    await browser.tabs.create({ url });
  }
});
