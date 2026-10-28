document.getElementById('file').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  const out = [];
  const state = await XBLM.load();

  for (const f of files) {
    const name = XBLM.cleanName(f.name.replace(/\.[^.]+$/, '')) || 'Imported list';
    const { handles, skipped } = XBLM.parseHandles(await f.text());
    if (handles.length === 0) { out.push(`${f.name}: no valid handle found.`); continue; }
    const existing = state.lists[name] || [];
    const merged = [...new Set([...existing, ...handles])];
    state.lists[name] = merged;
    state.active = name;
    out.push(
      `${name}: ${merged.length - existing.length} new account(s), ${merged.length} in total.` +
      (skipped ? ` ${skipped} entr${skipped === 1 ? 'y' : 'ies'} skipped (not a valid handle).` : '')
    );
  }

  await XBLM.save(state);
  document.getElementById('result').textContent = out.join('\n') + '\n\nYou can close this tab and open the extension popup.';
});
