// Timers inside a dedicated worker are not throttled when the dashboard tab is in the
// background (Chrome clamps main-thread timers in hidden tabs to about once per minute).
self.onmessage = (e) => {
  const { id, ms } = e.data;
  setTimeout(() => self.postMessage({ id }), ms);
};
