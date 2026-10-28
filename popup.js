let state = { lists: {}, active: null };
let currentHandle = null;
let deleteArmed = false;

const $ = (id) => document.getElementById(id);

function say(msg) { $('status').textContent = msg; }

async function persist() { await XBLM.save(state); render(); }

function render() {
  const names = Object.keys(state.lists);
  const hasLists = names.length > 0;

  $('empty').hidden = hasLists;
  $('listPanel').hidden = !hasLists;
  $('listRow').hidden = !hasLists;
  if (!hasLists && $('newRow').hidden) { $('newRow').hidden = false; $('newName').focus(); }

  const sel = $('listSelect');
  sel.textContent = '';
  names.forEach((n) => {
    const o = document.createElement('option');
    o.value = n; o.textContent = `${n} (${state.lists[n].length})`;
    if (n === state.active) o.selected = true;
    sel.appendChild(o);
  });
  if (!hasLists) return;

  const handles = state.lists[state.active];

  $('current').textContent = '';
  if (currentHandle) {
    $('current').append('Current profile: ');
    const b = document.createElement('b');
    b.textContent = '@' + currentHandle;
    $('current').appendChild(b);
  } else {
    $('current').textContent = 'Open a profile on x.com to add it.';
  }

  const already = currentHandle && handles.includes(currentHandle);
  $('addBtn').disabled = !currentHandle || already;
  $('addBtn').textContent = already ? 'Already in this list' : 'Add account to list';

  $('count').textContent = `${handles.length} account${handles.length === 1 ? '' : 's'}`;
  $('blockBtn').disabled = handles.length === 0;
  $('exportBtn').disabled = handles.length === 0;
  $('deleteBtn').textContent = deleteArmed ? 'Click again to delete' : 'Delete list';

  const ul = $('items');
  ul.textContent = '';
  handles.forEach((h) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = 'https://x.com/' + h; a.target = '_blank'; a.textContent = '@' + h;
    const x = document.createElement('button');
    x.textContent = '\u00d7'; x.title = 'Remove @' + h; x.setAttribute('aria-label', 'Remove @' + h);
    x.addEventListener('click', async () => {
      state.lists[state.active] = state.lists[state.active].filter((v) => v !== h);
      await persist();
    });
    li.append(a, x);
    ul.appendChild(li);
  });
}

async function createList() {
  const name = XBLM.cleanName($('newName').value);
  if (!name) { say('Enter a name for the list.'); return; }
  if (state.lists[name]) { say('A list with this name already exists.'); return; }
  state.lists[name] = [];
  state.active = name;
  $('newName').value = '';
  $('newRow').hidden = true;
  say(`List "${name}" created.`);
  await persist();
}

function exportList() {
  const handles = state.lists[state.active];
  const blob = new Blob([handles.join('\n') + '\n'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = state.active + '.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  say(`Exported ${handles.length} accounts.`);
}

async function blockList() {
  const handles = state.lists[state.active];
  // The dashboard runs the queue (a popup closes as soon as it loses focus).
  await browser.storage.local.set({ [XBLM.KEY_PENDING]: handles });
  await browser.tabs.create({ url: browser.runtime.getURL('dashboard.html') });
  window.close();
}

async function init() {
  state = await XBLM.load();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  currentHandle = tab && tab.url ? XBLM.handleFromUrl(tab.url) : null;

  $('listSelect').addEventListener('change', async (e) => {
    state.active = e.target.value; deleteArmed = false; await persist();
  });
  $('newBtn').addEventListener('click', () => { $('newRow').hidden = false; $('newName').focus(); });
  $('cancelBtn').addEventListener('click', () => { $('newRow').hidden = true; });
  $('createBtn').addEventListener('click', createList);
  $('newName').addEventListener('keydown', (e) => { if (e.key === 'Enter') createList(); });

  $('addBtn').addEventListener('click', async () => {
    state.lists[state.active].push(currentHandle);
    say(`@${currentHandle} added to "${state.active}".`);
    await persist();
  });
  $('toggleBtn').addEventListener('click', () => {
    const ul = $('items'); ul.hidden = !ul.hidden;
    $('toggleBtn').textContent = ul.hidden ? 'Show accounts' : 'Hide accounts';
  });
  $('blockBtn').addEventListener('click', blockList);
  $('exportBtn').addEventListener('click', exportList);
  $('importBtn').addEventListener('click', async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('import.html') });
    window.close();
  });
  $('deleteBtn').addEventListener('click', async () => {
    if (!deleteArmed) { deleteArmed = true; render(); return; }
    delete state.lists[state.active];
    state.active = Object.keys(state.lists)[0] || null;
    deleteArmed = false;
    say('List deleted.');
    await persist();
  });
  $('dashboardBtn').addEventListener('click', async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('dashboard.html') });
    window.close();
  });

  render();
}

init();
