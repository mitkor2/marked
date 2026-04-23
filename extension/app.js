'use strict';

// ── State ────────────────────────────────────────────────
const groups     = [];        // { id }
const images     = [];        // { dataUrl }  (compressed)
const activeTags = new Set();

// ── Init ─────────────────────────────────────────────────
window.addEventListener('load', async () => {
  updateCharCount();
  await checkFBLogin();

  // Groups
  document.getElementById('groupInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addGroup();
  });
  document.getElementById('addGroupBtn').addEventListener('click', addGroup);
  document.getElementById('importCSVBtn').addEventListener('click', importCSV);
  document.getElementById('exportCSVBtn').addEventListener('click', exportCSV);
  document.getElementById('csvFile').addEventListener('change', handleCSV);

  // Group list — delegate remove button clicks
  document.getElementById('groupList').addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-group]');
    if (btn) removeGroup(btn.dataset.removeGroup);
  });

  // Tags — delegate clicks on the tag-wrap
  document.getElementById('tagWrap').addEventListener('click', e => {
    const btn = e.target.closest('.tag');
    if (btn) toggleTag(btn);
  });

  // Emoji row — delegate clicks, read emoji from data-emoji attribute
  document.getElementById('emojiRow').addEventListener('click', e => {
    const btn = e.target.closest('.emoji-btn');
    if (btn) ins(btn.dataset.emoji);
  });

  // Dropzone
  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('click', () => document.getElementById('imgInput').click());
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', handleDrop);
  document.getElementById('imgInput').addEventListener('change', addImages);

  // Thumb grid — delegate remove button clicks
  document.getElementById('thumbGrid').addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-img]');
    if (btn) removeImage(parseInt(btn.dataset.removeImg, 10));
  });

  // Post button
  document.getElementById('postBtn').addEventListener('click', startPosting);
});

async function checkFBLogin() {
  try {
    const cookie = await chrome.cookies.get({
      url:  'https://www.facebook.com',
      name: 'c_user',
    });
    document.getElementById('loginBanner').style.display =
      cookie ? 'none' : 'flex';
  } catch {
    document.getElementById('loginBanner').style.display = 'none';
  }
}

// ── Character count ──────────────────────────────────────
function updateCharCount() {
  document.getElementById('message').addEventListener('input', () => {
    const n = document.getElementById('message').value.length;
    const cc = document.getElementById('charCount');
    cc.dataset.i18nChars = n;
    const dict = (typeof T !== 'undefined' && T[typeof currentLang !== 'undefined' ? currentLang : 'en']) || {};
    cc.textContent = n.toLocaleString() + ' ' + (dict['compose.chars'] || 'chars');
  });
}

// ── Emoji insert ─────────────────────────────────────────
function ins(emoji) {
  const ta = document.getElementById('message');
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + emoji + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + emoji.length;
  ta.focus();
}

// ── Tags ─────────────────────────────────────────────────
function toggleTag(btn) {
  const t = btn.dataset.tag;
  if (activeTags.has(t)) { activeTags.delete(t); btn.classList.remove('on'); }
  else                   { activeTags.add(t);    btn.classList.add('on'); }
}

// ── Groups ───────────────────────────────────────────────
function extractId(raw) {
  const m = raw.match(/facebook\.com\/groups\/([^/?&#\s]+)/i);
  return m ? m[1] : raw.trim();
}

function addGroup() {
  const raw = document.getElementById('groupInput').value.trim();
  if (!raw) return;
  const id = extractId(raw);
  if (!id) return;
  if (groups.find(g => g.id === id)) { alert('Already added.'); return; }

  groups.push({ id });
  const li = document.createElement('li');
  li.className = 'g-row';
  li.id = 'g-' + CSS.escape(id);
  li.innerHTML = `
    <span class="g-id">${esc(id)}</span>
    <span class="g-badge b-pending" id="st-${esc(id)}">Pending</span>
    <button class="btn-icon" data-remove-group="${esc(id)}">✕</button>
  `;
  document.getElementById('groupList').appendChild(li);
  document.getElementById('groupInput').value = '';
}

function removeGroup(id) {
  const i = groups.findIndex(g => g.id === id);
  if (i !== -1) groups.splice(i, 1);
  document.getElementById('g-' + CSS.escape(id))?.remove();
}

function importCSV() { document.getElementById('csvFile').click(); }

function handleCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    let added = 0;
    ev.target.result.split(/[\r\n]+/).forEach(line => {
      const raw = line.split(',')[0].trim();
      if (!raw) return;
      const id = extractId(raw);
      if (id && !groups.find(g => g.id === id)) {
        document.getElementById('groupInput').value = id;
        addGroup();
        added++;
      }
    });
    alert(`Imported ${added} group(s).`);
  };
  reader.readAsText(file);
  e.target.value = '';
}

function exportCSV() {
  if (!groups.length) { alert('No groups to export.'); return; }
  const blob = new Blob([groups.map(g => g.id).join('\n')], { type: 'text/csv' });
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'groups.csv',
  }).click();
}

// ── Images ───────────────────────────────────────────────
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('dragover');
  processFiles([...e.dataTransfer.files]);
}

function addImages(e) {
  processFiles([...e.target.files]);
  e.target.value = '';
}

function processFiles(files) {
  const slots = 5 - images.filter(Boolean).length;
  if (slots <= 0) { alert('Maximum 5 images.'); return; }
  files.slice(0, slots).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) { alert(`${file.name} is too large (max 8 MB).`); return; }
    // Reserve the slot synchronously so concurrent uploads don't share the same index
    const idx = images.length;
    images.push(null);
    compressImage(file, 1200).then(dataUrl => {
      images[idx] = { dataUrl };
      const div = document.createElement('div');
      div.className = 'thumb';
      div.id = 'th-' + idx;
      div.innerHTML = `<img src="${dataUrl}" /><button class="rm" data-remove-img="${idx}">✕</button>`;
      document.getElementById('thumbGrid').appendChild(div);
    });
  });
}

function removeImage(idx) {
  images[idx] = null;
  document.getElementById('th-' + idx)?.remove();
}

function compressImage(file, maxPx) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else       { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });
}

// ── Start posting ────────────────────────────────────────
async function startPosting() {
  const text = document.getElementById('message').value.trim();
  const link = document.getElementById('linkUrl').value.trim();

  if (!groups.length)                         { alert('Add at least one group.'); return; }
  if (!text && !images.filter(Boolean).length){ alert('Add a message or an image.'); return; }

  await checkFBLogin();
  if (document.getElementById('loginBanner').style.display !== 'none') {
    alert('Please log in to Facebook first, then reload this page.');
    return;
  }

  const tagLine = [...activeTags].map(t => '#' + t.replace(/\s+/g, '')).join(' ');
  const fullMsg = [text, tagLine, link].filter(Boolean).join('\n\n');
  const imgs    = images.filter(Boolean).map(i => i.dataUrl);

  const delay  = parseInt(document.getElementById('delayInput').value)  || 7;
  const jitter = parseInt(document.getElementById('jitterInput').value) || 3;

  // Reset statuses
  groups.forEach(g => setStatus(g.id, 'pending', 'Pending'));

  showProgress();
  document.getElementById('postBtn').disabled = true;

  let done = 0;
  for (const g of groups) {
    setStatus(g.id, 'posting', 'Posting…');
    setStatusMsg(`Posting to group ${done + 1} / ${groups.length}: ${g.id}`);
    addLog(`⏳ Opening ${g.id}…`);

    try {
      await postToGroup(g.id, fullMsg, imgs);
      setStatus(g.id, 'ok', '✅ Done');
      addLog(`✅ ${g.id} — posted successfully!`, 'ok');
    } catch (err) {
      setStatus(g.id, 'err', '❌ Failed');
      addLog(`❌ ${g.id} — ${err.message}`, 'err');
    }

    done++;
    document.getElementById('bar').style.width = Math.round(done / groups.length * 100) + '%';

    if (done < groups.length) {
      const wait = (delay + Math.random() * jitter) * 1000;
      setStatusMsg(`Waiting ${(wait / 1000).toFixed(1)}s before next post…`);
      addLog(`⏱ Waiting ${(wait / 1000).toFixed(1)}s…`);
      await sleep(wait);
    }
  }

  setStatusMsg(`🎉 Done! ${done} group(s) processed.`);
  addLog(`🎉 All done!`, 'ok');
  document.getElementById('postBtn').disabled = false;
}

// ── Open a Facebook group tab, inject poster, get result ─
async function postToGroup(groupId, message, imageDataUrls) {
  const url = `https://www.facebook.com/groups/${groupId}`;
  const tab = await chrome.tabs.create({ url, active: false });

  try {
    await waitForTabLoad(tab.id);
    await sleep(4500);   // wait for React / Comet to render the feed composer

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   fbPostOnPage,
      args:   [{ message, imageDataUrls }],
    });

    const res = results?.[0]?.result;
    if (!res)        throw new Error('No response from the page');
    if (res.error)   throw new Error(res.error);
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function waitForTabLoad(tabId) {
  // Check if already loaded — avoids missing the event if it fires before we listen
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.status === 'complete') return;

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdate);
      reject(new Error('Tab load timed out after 30s'));
    }, 30000);

    function onUpdate(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(t);
        chrome.tabs.onUpdated.removeListener(onUpdate);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdate);
  });
}

// ══════════════════════════════════════════════════════════
//  THIS FUNCTION IS INJECTED INTO EACH FACEBOOK GROUP TAB
//  — must be self-contained (no closures / external refs) —
// ══════════════════════════════════════════════════════════
async function fbPostOnPage({ message, imageDataUrls }) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Wait for a CSS selector to appear and be visible
  async function waitFor(selector, root, maxMs) {
    const deadline = Date.now() + (maxMs || 15000);
    while (Date.now() < deadline) {
      const el = (root || document).querySelector(selector);
      if (el && el.offsetParent !== null) return el;
      await sleep(300);
    }
    return null;
  }

  // Walk text nodes looking for composer placeholder text (case-insensitive, partial match).
  // Also checks aria-placeholder and aria-label attributes in case the text is in attributes
  // rather than real text nodes (Facebook sometimes uses CSS pseudo-elements for placeholder text).
  function findComposerTrigger(root) {
    const searchRoot = root || document.body;

    // 1. Text-node walk — covers cases where placeholder is a real DOM text node
    const TRIGGER_PHRASES = ['write something', "what's on your mind", 'whats on your mind'];
    const walker = document.createTreeWalker(
      searchRoot,
      NodeFilter.SHOW_TEXT,
      null
    );
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent.trim().toLowerCase();
      if (!TRIGGER_PHRASES.some(p => txt.startsWith(p))) continue;
      // Found the text node — walk up to find a clickable ancestor
      let el = node.parentElement;
      if (!el || el.offsetParent === null) continue;
      let clickTarget = el;
      for (let up = 0; up < 8 && el && el !== document.body; up++) {
        const role = el.getAttribute('role');
        if (role === 'button' || role === 'textbox' ||
            el.tagName === 'BUTTON' || el.getAttribute('tabindex') === '0') {
          clickTarget = el;
          break;
        }
        el = el.parentElement;
      }
      return clickTarget;
    }

    // 2. Attribute walk — covers cases where FB renders the placeholder via aria-label / aria-placeholder
    //    on a non-text-node element (common in newer Comet builds)
    const allEls = searchRoot.querySelectorAll('[aria-placeholder],[aria-label],[placeholder]');
    for (const el of allEls) {
      if (el.offsetParent === null) continue;
      const attr = (
        el.getAttribute('aria-placeholder') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') || ''
      ).toLowerCase();
      if (TRIGGER_PHRASES.some(p => attr.includes(p))) return el;
    }

    return null;
  }

  // Find the clickable wrapper around the lexical editor that Facebook shows
  // on the group feed page.  Clicking the editor directly sometimes opens the
  // in-place composer instead of the Create Post modal, so we prefer to click
  // the outermost [role="button"] parent that contains it.
  function findLexicalTrigger() {
    const lex = document.querySelector('[data-lexical-editor="true"]');
    if (!lex || lex.offsetParent === null) return null;
    // Walk up looking for a role=button / role=textbox wrapper
    let el = lex.parentElement;
    let best = lex;
    for (let up = 0; up < 12 && el && el !== document.body; up++) {
      const role = el.getAttribute('role');
      if (role === 'button' || role === 'textbox') { best = el; break; }
      // Stop if we reach a dialog — the lexical editor is already inside the modal
      if (role === 'dialog') break;
      el = el.parentElement;
    }
    return best;
  }

  // ── Login check ───────────────────────────────────────
  if (/login|checkpoint|recover/.test(location.href)) {
    return { error: 'Not logged in to Facebook — please log in and try again' };
  }

  // ── Step 1: Click the "Write something…" placeholder ─
  // Priority order:
  //  1. Attribute selectors (fast when FB includes matching aria attrs)
  //  2. data-pagelet scoped search (Comet architecture pagelet containers)
  //  3. Lexical editor wrapper (Facebook's current editor framework)
  //  4. TreeWalker / aria-attribute text search (catches plain-text or aria-only placeholders)
  let placeholder = null;
  const ATTR_SELECTORS = [
    // Classic aria-placeholder selectors
    '[aria-placeholder*="Write something"]',
    '[aria-placeholder*="write something"]',
    '[aria-label*="Write something to the group"]',
    '[aria-label*="Write something"]',
    '[aria-label*="write something"]',
    // data-testid selectors (may still work on some builds)
    '[data-testid="status-attachment-mentions-input"]',
    '[data-testid="comet-composer-post-target"]',
    // Placeholder attribute (non-contenteditable inputs)
    '[placeholder*="Write something"]',
  ];

  for (let attempt = 0; attempt < 25 && !placeholder; attempt++) {
    // 1. Attribute selectors
    for (const sel of ATTR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) { placeholder = el; break; }
    }

    // 2. Scoped search inside known Facebook Comet pagelet containers
    if (!placeholder) {
      const PAGELET_NAMES = [
        'GroupComposer', 'GroupComposerPage',
        'ProfileComposer', 'FeedComposer', 'NewsFeedComposer',
      ];
      for (const name of PAGELET_NAMES) {
        const pagelet = document.querySelector(`[data-pagelet="${name}"]`);
        if (pagelet) {
          const found = findComposerTrigger(pagelet);
          if (found) { placeholder = found; break; }
        }
      }
    }

    // 3. Lexical editor wrapper — find the clickable role=button parent around it
    if (!placeholder) {
      placeholder = findLexicalTrigger();
    }

    // 4. Full-document TreeWalker / aria-attribute text search
    if (!placeholder) {
      placeholder = findComposerTrigger(document.body);
    }

    if (!placeholder) await sleep(500);
  }

  if (!placeholder) {
    return { error: 'Could not find the "Write something" area — are you a member of this group?' };
  }

  placeholder.click();

  // ── Step 2: Wait for the Create Post modal ───────────
  let modal = null;
  for (let attempt = 0; attempt < 20 && !modal; attempt++) {
    // Prefer the dialog that contains "Create post" heading or "Write something"
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    modal = dialogs.find(d =>
      d.offsetParent !== null && (
        d.textContent.includes('Create post') ||
        d.textContent.includes('Write something')
      )
    ) || (dialogs.find(d => d.offsetParent !== null));
    if (!modal) await sleep(400);
  }

  if (!modal) {
    return { error: 'Create Post window did not open after clicking the composer' };
  }
  await sleep(800); // let modal finish animating / rendering

  // ── Step 3: Find and focus the text editor in the modal
  // The "Write something..." inside the modal is a placeholder child —
  // click it to make sure focus lands on the contenteditable, then type.
  let editable = await waitFor('[contenteditable="true"][role="textbox"]', modal, 6000);
  if (!editable) editable = await waitFor('[contenteditable="true"]', modal, 3000);
  if (!editable) {
    return { error: 'Text editor not found inside the Create Post window' };
  }

  // Click the "Write something..." placeholder inside the modal to ensure focus
  const innerPlaceholder = findComposerTrigger(modal);
  if (innerPlaceholder && innerPlaceholder !== editable) innerPlaceholder.click();

  editable.click();
  editable.focus();
  await sleep(400);

  document.execCommand('insertText', false, message);
  await sleep(500);

  // Verify text was entered; if not, use clipboard paste fallback
  if (!editable.textContent.includes(message.slice(0, 20))) {
    const dt = new DataTransfer();
    dt.setData('text/plain', message);
    editable.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt, bubbles: true, cancelable: true,
    }));
    await sleep(500);
  }

  // ── Step 4: Upload images via the photo button ───────
  if (imageDataUrls && imageDataUrls.length > 0) {
    // The photo button is in the "Add to your post" bar inside the modal.
    // It has aria-label "Photo/video" or "Photo/Video" (green icon in screenshots).
    const photoBtn = [...modal.querySelectorAll('[role="button"], button')].find(el => {
      if (!el.offsetParent) return false;
      const lbl = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
      return lbl.includes('photo') || lbl.includes('video');
    });

    if (photoBtn) {
      photoBtn.click();
      await sleep(1800);

      // File input appears after clicking — prefer one that accepts images
      const fileInput = document.querySelector('input[type="file"][accept*="image"]')
                     || document.querySelector('input[type="file"]');

      if (fileInput) {
        const dt = new DataTransfer();
        for (const dataUrl of imageDataUrls) {
          const blob = await fetch(dataUrl).then(r => r.blob());
          dt.items.add(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
        }
        try {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files').set;
          setter.call(fileInput, dt.files);
        } catch {
          Object.defineProperty(fileInput, 'files', { value: dt.files, configurable: true });
        }
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input',  { bubbles: true }));
        await sleep(3500 + imageDataUrls.length * 1500);
      }
    }
  }

  // ── Step 5: Click the Post button inside the modal ───
  let postBtn = null;
  for (let attempt = 0; attempt < 24 && !postBtn; attempt++) {
    postBtn = [...modal.querySelectorAll('button, [role="button"]')].find(el => {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      if (!el.offsetParent) return false;
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      return label === 'Post';
    });
    if (!postBtn) await sleep(500);
  }

  if (!postBtn) {
    return { error: 'Post button not found or still disabled — text may be empty, or images are still uploading' };
  }

  postBtn.click();
  await sleep(4000);

  if (/login|checkpoint/.test(location.href)) {
    return { error: 'Session expired while posting' };
  }

  return { success: true };
}

// ── UI helpers ───────────────────────────────────────────
function showProgress() {
  const el = document.getElementById('progressCard');
  el.style.display = 'flex';
  document.getElementById('logList').innerHTML = '';
  document.getElementById('bar').style.width = '0';
  el.scrollIntoView({ behavior: 'smooth' });
}

function setStatus(id, cls, label) {
  const el = document.getElementById('st-' + CSS.escape(id));
  if (!el) return;
  el.className   = 'g-badge b-' + cls;
  el.textContent = label;
}

function setStatusMsg(msg) {
  document.getElementById('statusMsg').textContent = msg;
}

function addLog(msg, cls) {
  const ul = document.getElementById('logList');
  const li = document.createElement('li');
  if (cls) li.className = cls;
  li.textContent = msg;
  ul.appendChild(li);
  ul.scrollTop = ul.scrollHeight;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
