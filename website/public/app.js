(function () {
  'use strict';

  const token = location.pathname.split('/p/')[1];
  if (!token) {
    document.getElementById('subtitle').textContent =
      'No session token in the URL — open this page via the link the plugin gave you in-game.';
    return;
  }

  const els = {
    subtitle: document.getElementById('subtitle'),
    loading: document.getElementById('loading'),
    expiredBanner: document.getElementById('expiredBanner'),
    appliedBanner: document.getElementById('appliedBanner'),
    builder: document.getElementById('builder'),
    preview: document.getElementById('preview'),
    charCount: document.getElementById('charCount'),
    countdown: document.getElementById('countdown'),
    segments: document.getElementById('segments'),
    addSegment: document.getElementById('addSegment'),
    loadExample: document.getElementById('loadExample'),
    save: document.getElementById('save'),
    saveStatus: document.getElementById('saveStatus'),
    template: document.getElementById('segmentTemplate'),
    stopTemplate: document.getElementById('colorStopTemplate'),
    formatRadios: document.querySelectorAll('input[name="format"]'),
    historySection: document.getElementById('historySection'),
    historyList: document.getElementById('historyList'),
    historyItemTemplate: document.getElementById('historyItemTemplate'),
  };

  let nextId = 1;
  const uid = () => `seg-${nextId++}`;

  // Set from the server's response in init() (config.js MAX_PREFIX_LENGTH)
  // rather than hardcoded here, so this page always matches whatever the
  // backend actually enforces. 160 is just a sane fallback in case that
  // field is ever missing.
  let MAX_PREFIX_LENGTH = 160;

  /** @type {Array<object>} */
  let segments = [];
  let expiresAt = null;
  let countdownTimer = null;
  let obfuscateTimer = null;
  let saved = false;
  let saving = false;

  function currentFormat() {
    const checked = document.querySelector('input[name="format"]:checked');
    return checked ? checked.value : 'legacy';
  }

  function serializeCurrent() {
    return currentFormat() === 'minimessage'
      ? window.PrefixSerialize.serializeMiniMessage(segments)
      : window.PrefixSerialize.serializeSegments(segments);
  }

  function defaultSegment(overrides) {
    return Object.assign(
      {
        id: uid(),
        text: '',
        mode: 'solid',
        colors: ['#FFFFFF'],
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        obfuscated: false,
      },
      overrides
    );
  }

  // Visually equivalent to the classic example
  // "&8[&#FF99CC&lF...&lY&8] &7» &#CC66FF" — expressed entirely in hex
  // (LuckPerms renders '&8'/'&7' and their hex equivalents identically),
  // which keeps this tool's output format uniform and simple.
  function exampleSegments() {
    return [
      defaultSegment({ text: '[', colors: ['#555555'] }),
      defaultSegment({
        text: 'FEMBOY',
        mode: 'gradient',
        colors: ['#FF99CC', '#CC66FF'],
        bold: true,
      }),
      defaultSegment({ text: ']', colors: ['#555555'] }),
      defaultSegment({ text: ' » ', colors: ['#AAAAAA'] }),
      defaultSegment({ text: '', colors: ['#CC66FF'] }),
    ];
  }

  function charColors(segment) {
    const count = segment.text.length || 1;
    return PrefixColor.gradientColors(segment.colors, count);
  }

  function renderPreview() {
    els.preview.innerHTML = '';
    for (const segment of segments) {
      const colors = charColors(segment);
      const chars = segment.text.length ? segment.text.split('') : [];
      chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.color = colors[i];
        if (segment.bold) span.style.fontWeight = '700';
        if (segment.italic) span.style.fontStyle = 'italic';
        let decorations = [];
        if (segment.underline) decorations.push('underline');
        if (segment.strikethrough) decorations.push('line-through');
        if (decorations.length) span.style.textDecoration = decorations.join(' ');
        if (segment.obfuscated) span.dataset.obfuscated = '1';
        els.preview.appendChild(span);
      });
    }
    const built = serializeCurrent();
    els.charCount.textContent = `${built.length} / ${MAX_PREFIX_LENGTH} chars (raw)`;
    const overLimit = built.length > MAX_PREFIX_LENGTH;
    els.charCount.classList.toggle('over-limit', overLimit);
    if (!saving) els.save.disabled = overLimit;
  }

  const OBFUSCATE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function tickObfuscation() {
    els.preview.querySelectorAll('span[data-obfuscated="1"]').forEach((span) => {
      span.textContent = OBFUSCATE_POOL[Math.floor(Math.random() * OBFUSCATE_POOL.length)];
    });
  }

  /**
   * Renders a colored preview for a saved *legacy* prefix string into
   * `container`. Only needs to understand the exact shape this tool's own
   * serializer produces (a '&#RRGGBB' color plus zero or more of
   * &l/&o/&n/&m/&k immediately before every character) — history entries
   * only ever contain strings this tool itself generated and validated.
   * Format flags reset every character (there's no &r reset code in our
   * output — each character's active state is always fully re-specified),
   * only the color persists until the next '&#RRGGBB'.
   */
  function renderLegacyPreview(container, text) {
    container.innerHTML = '';
    let i = 0;
    let color = '#FFFFFF';
    while (i < text.length) {
      let bold = false, italic = false, underline = false, strikethrough = false;
      while (text[i] === '&' && i + 1 < text.length) {
        const next = text[i + 1];
        if (next === '#' && text.length >= i + 8) {
          color = text.slice(i + 2, i + 8);
          i += 8;
        } else if (next === 'l') { bold = true; i += 2; }
        else if (next === 'o') { italic = true; i += 2; }
        else if (next === 'n') { underline = true; i += 2; }
        else if (next === 'm') { strikethrough = true; i += 2; }
        else if (next === 'k') { i += 2; } // obfuscated — static preview shows the real character
        else { i += 2; } // unrecognized code, skip defensively
      }
      if (i >= text.length) break; // trailing color-only code with no character
      const span = document.createElement('span');
      span.textContent = text[i];
      i += 1;
      span.style.color = color.startsWith('#') ? color : `#${color}`;
      if (bold) span.style.fontWeight = '700';
      if (italic) span.style.fontStyle = 'italic';
      const decorations = [];
      if (underline) decorations.push('underline');
      if (strikethrough) decorations.push('line-through');
      if (decorations.length) span.style.textDecoration = decorations.join(' ');
      container.appendChild(span);
    }
  }

  function relativeTime(ms) {
    const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function renderHistory(entries) {
    els.historyList.innerHTML = '';
    els.historySection.hidden = entries.length === 0;
    entries.forEach((entry) => {
      const node = els.historyItemTemplate.content.firstElementChild.cloneNode(true);
      const previewEl = node.querySelector('.history-preview');
      const badge = node.querySelector('.history-format-badge');
      const time = node.querySelector('.history-time');
      const useBtn = node.querySelector('.history-use');

      if (entry.format === 'minimessage') {
        previewEl.textContent = entry.prefixString;
        previewEl.classList.add('history-preview-plain');
        badge.textContent = 'MiniMessage';
      } else {
        renderLegacyPreview(previewEl, entry.prefixString);
        badge.textContent = 'Legacy';
      }
      time.textContent = relativeTime(entry.savedAt);

      useBtn.addEventListener('click', () => editHistoryEntry(entry));

      els.historyList.appendChild(node);
    });
  }

  async function loadHistory() {
    try {
      const res = await fetch(`/api/prefix/${token}/history`);
      if (!res.ok) return; // non-fatal — just don't show the section
      const data = await res.json();
      renderHistory(data.entries || []);
    } catch (err) {
      // Non-fatal — history is a nice-to-have, never block the builder over it.
    }
  }

  // Loads a history entry into the builder for editing — mirrors "Load
  // example" rather than instantly reapplying it, so e.g. the text can be
  // changed while keeping the same gradient. Nothing is saved until the
  // player explicitly hits Save again.
  function editHistoryEntry(entry) {
    const radio = document.querySelector(`input[name="format"][value="${entry.format}"]`);
    if (radio) radio.checked = true;

    nextId = 1;
    segments = window.PrefixDeserialize.parseToSegments(entry.prefixString, entry.format)
      .map((s) => defaultSegment(s));
    renderSegments();
    onChange();
  }

  function minStopsFor(mode) {
    return mode === 'gradient' ? 2 : 1;
  }

  function renderStops(stopsContainer, addStopBtn, segment) {
    stopsContainer.innerHTML = '';
    const min = minStopsFor(segment.mode);
    segment.colors.forEach((color, index) => {
      const node = els.stopTemplate.content.firstElementChild.cloneNode(true);
      const input = node.querySelector('.stop-input');
      const label = node.querySelector('.stop-label');
      const removeBtn = node.querySelector('.stop-remove');

      input.value = color;
      label.textContent = color.toUpperCase();
      removeBtn.hidden = segment.mode !== 'gradient' || segment.colors.length <= min;

      input.addEventListener('input', () => {
        segment.colors[index] = input.value;
        label.textContent = input.value.toUpperCase();
        onChange();
      });
      removeBtn.addEventListener('click', () => {
        segment.colors.splice(index, 1);
        renderStops(stopsContainer, addStopBtn, segment);
        onChange();
      });

      stopsContainer.appendChild(node);
    });
    addStopBtn.hidden = segment.mode !== 'gradient';
  }

  function segmentEl(segment) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = segment.id;

    const textInput = node.querySelector('.seg-text');
    const modeSelect = node.querySelector('.seg-mode');
    const stopsContainer = node.querySelector('.color-stops');
    const addStopBtn = node.querySelector('.add-stop');
    const removeBtn = node.querySelector('.seg-remove');
    const fmtBtns = node.querySelectorAll('.fmt-btn');

    textInput.value = segment.text;
    modeSelect.value = segment.mode;
    renderStops(stopsContainer, addStopBtn, segment);
    fmtBtns.forEach((btn) => {
      const key = btn.dataset.fmt;
      btn.classList.toggle('active', !!segment[key]);
    });

    textInput.addEventListener('input', () => {
      segment.text = textInput.value;
      onChange();
    });
    modeSelect.addEventListener('change', () => {
      segment.mode = modeSelect.value;
      if (segment.mode === 'gradient' && segment.colors.length < 2) {
        // Give them a second, visibly different stop to start editing
        // rather than a degenerate 1-color "gradient".
        const base = segment.colors[0] || '#FFFFFF';
        segment.colors.push(base === '#FFFFFF' ? '#FF66CC' : '#FFFFFF');
      } else if (segment.mode === 'solid') {
        segment.colors = [segment.colors[0] || '#FFFFFF'];
      }
      renderStops(stopsContainer, addStopBtn, segment);
      onChange();
    });
    addStopBtn.addEventListener('click', () => {
      const last = segment.colors[segment.colors.length - 1] || '#FFFFFF';
      segment.colors.push(last);
      renderStops(stopsContainer, addStopBtn, segment);
      onChange();
    });
    removeBtn.addEventListener('click', () => {
      segments = segments.filter((s) => s.id !== segment.id);
      renderSegments();
      onChange();
    });
    fmtBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.fmt;
        segment[key] = !segment[key];
        btn.classList.toggle('active', segment[key]);
        onChange();
      });
    });

    // Drag-and-drop reordering.
    node.addEventListener('dragstart', () => node.classList.add('dragging'));
    node.addEventListener('dragend', () => node.classList.remove('dragging'));

    return node;
  }

  function renderSegments() {
    els.segments.innerHTML = '';
    segments.forEach((segment) => els.segments.appendChild(segmentEl(segment)));
  }

  els.segments.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = els.segments.querySelector('.dragging');
    if (!dragging) return;
    const after = [...els.segments.querySelectorAll('.segment:not(.dragging)')].find((el) => {
      const rect = el.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2;
    });
    if (after) {
      els.segments.insertBefore(dragging, after);
    } else {
      els.segments.appendChild(dragging);
    }
  });
  els.segments.addEventListener('drop', () => {
    const orderedIds = [...els.segments.querySelectorAll('.segment')].map((el) => el.dataset.id);
    segments = orderedIds.map((id) => segments.find((s) => s.id === id));
    onChange();
  });

  function onChange() {
    renderPreview();
  }

  els.addSegment.addEventListener('click', () => {
    segments.push(defaultSegment({ text: 'Text' }));
    renderSegments();
    onChange();
  });

  els.loadExample.addEventListener('click', () => {
    nextId = 1;
    segments = exampleSegments();
    renderSegments();
    onChange();
  });

  els.formatRadios.forEach((radio) => radio.addEventListener('change', onChange));

  function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `⏳ ${m}:${String(s).padStart(2, '0')}`;
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        showExpired();
        return;
      }
      els.countdown.textContent = formatCountdown(remaining);
    }, 1000);
  }

  function showExpired() {
    els.loading.hidden = true;
    els.builder.hidden = true;
    els.appliedBanner.hidden = true;
    els.expiredBanner.hidden = false;
    els.subtitle.textContent = '';
  }

  function sendClose() {
    if (saved) return; // don't cancel a save that's already in flight/done
    try {
      navigator.sendBeacon(`/api/prefix/${token}/close`);
    } catch (e) {
      /* best effort */
    }
  }
  window.addEventListener('beforeunload', sendClose);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendClose();
  });

  els.save.addEventListener('click', async () => {
    const format = currentFormat();
    const prefixString = serializeCurrent();
    if (prefixString.length > MAX_PREFIX_LENGTH) return; // guarded by disabled state too
    saving = true;
    els.save.disabled = true;
    els.saveStatus.textContent = 'Saving…';
    try {
      const res = await fetch(`/api/prefix/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixString, format }),
      });
      if (res.status === 410) {
        showExpired();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        els.saveStatus.textContent = body.error || 'Save failed — try again.';
        saving = false;
        els.save.disabled = false;
        return;
      }
      saved = true;
      clearInterval(countdownTimer);
      els.builder.hidden = true;
      els.appliedBanner.hidden = false;
      els.subtitle.textContent = '';
    } catch (err) {
      els.saveStatus.textContent = 'Network error — try again.';
      saving = false;
      els.save.disabled = false;
    }
  });

  async function init() {
    let res;
    try {
      res = await fetch(`/api/prefix/${token}`);
    } catch (err) {
      els.loading.hidden = true;
      els.subtitle.textContent = 'Could not reach the server. Refresh to retry.';
      return;
    }
    if (res.status === 410) {
      showExpired();
      return;
    }
    if (!res.ok) {
      els.loading.hidden = true;
      els.subtitle.textContent = 'Something went wrong loading this session.';
      return;
    }
    const data = await res.json();
    els.loading.hidden = true;
    if (data.status === 'applied') {
      els.appliedBanner.hidden = false;
      els.subtitle.textContent = '';
      return;
    }

    expiresAt = data.expiresAt;
    if (data.maxPrefixLength > 0) MAX_PREFIX_LENGTH = data.maxPrefixLength;
    els.subtitle.textContent = `Building a custom prefix for ${data.playerName}`;
    els.builder.hidden = false;

    segments = [defaultSegment({ text: 'Text' })];
    renderSegments();
    onChange();
    startCountdown();
    obfuscateTimer = setInterval(tickObfuscation, 90);
    loadHistory();
  }

  init();
})();
