// UI helpers — bubbles, structures, placeholders. Popovers/tools/chronicle arrive in Tasks 6-7.
const UI = {
  sayHooks: [],
  onSay(fn) { this.sayHooks.push(fn); },

  bubble(c, text, kind = 'speech') {
    const layer = document.getElementById('bubbles');
    const [px, py] = View.px(c.pos);
    const div = document.createElement('div');
    div.className = `bubble bubble-${kind}`;
    div.textContent = kind === 'whisper' ? `(to you) ${text}` : text;
    const stack = layer.querySelectorAll(`[data-for="${c.id}"]`).length;
    div.dataset.for = c.id;
    div.style.left = `${Math.min(innerWidth - 240, Math.max(8, px - 60))}px`;
    div.style.top = `${Math.max(8, py - 70 - stack * 34)}px`;
    layer.appendChild(div);
    setTimeout(() => { div.classList.add('bubble-fade'); setTimeout(() => div.remove(), 900); }, 7000);
  },

  renderStructure(id, s) {
    const layer = document.getElementById('structures');
    let g = layer.querySelector(`[data-id="${id}"]`);
    if (!g) {
      g = el('g', { class: 'structure', 'data-id': id }, layer);
      el('g', { filter: 'url(#goo)', opacity: 0.22, class: 'structure-goo' }, g);
      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('class', 'structure-label');
      g.appendChild(label);
    }
    const goo = g.querySelector('.structure-goo');
    goo.replaceChildren();
    const scale = Math.min(innerWidth, innerHeight);
    let sx = 0, sy = 0;
    for (const [x, y, r] of s.blobs) {
      const [px, py] = View.px([x, y]);
      el('circle', { cx: px, cy: py, r: r * scale, fill: s.tint || '#8a7350' }, goo);
      sx += px; sy += py;
    }
    const label = g.querySelector('.structure-label');
    if (s.blobs.length) {
      label.textContent = s.name;
      label.setAttribute('x', sx / s.blobs.length);
      label.setAttribute('y', sy / s.blobs.length + 4);
    }
  },

  developing(prompt) {
    const hud = document.getElementById('hud');
    let box = hud.querySelector('.developing-stack');
    if (!box) {
      box = document.createElement('div');
      box.className = 'developing-stack';
      hud.appendChild(box);
    }
    const chip = document.createElement('div');
    chip.className = 'developing-chip';
    chip.textContent = `specimen developing — "${prompt.slice(0, 60)}"`;
    box.appendChild(chip);
  },
  resolveDeveloping() {
    document.querySelector('.developing-chip')?.remove();
  },
};

UI.initHud = function initHud() {
  const hud = document.getElementById('hud');

  // creation bar
  const bar = document.createElement('form');
  bar.className = 'creation-bar';
  bar.innerHTML = `<input class="creation-input" type="text"
    placeholder="Describe a new specimen — its nature, goals, temperament" maxlength="500">`;
  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = bar.querySelector('input');
    const prompt = input.value.trim();
    if (!prompt) return;
    Net.input({ type: 'create', prompt });
    UI.developing(prompt);
    input.value = '';
  });
  hud.appendChild(bar);

  // creature click -> popover (drag handled in Task 7; a click is a <6px pointer travel)
  let downAt = null;
  document.getElementById('slide').addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY, e.target.closest('.creature')];
  });
  document.getElementById('slide').addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const [x, y, g] = downAt;
    downAt = null;
    if (Math.hypot(e.clientX - x, e.clientY - y) > 6 || !g) return;
    UI.openTag(g.dataset.id);
  });
};

// escape director/user-authored strings before innerHTML interpolation
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

UI.threads = {}; // id -> [{who: 'you'|'them', text}]
UI.openTag = function openTag(id) {
  document.querySelector('.specimen-tag')?.remove();
  const c = App.world.creatures[id];
  if (!c) return;
  const [px, py] = View.px(c.pos);
  const tag = document.createElement('div');
  tag.className = 'specimen-tag';
  tag.dataset.id = id;
  tag.style.left = `${Math.min(innerWidth - 270, px + 40)}px`;
  tag.style.top = `${Math.max(10, py - 80)}px`;

  const sliders = Object.entries(c.attributes || {}).map(([name, val]) => `
    <label class="tag-slider">${esc(name)}
      <input type="range" min="0" max="1" step="0.05" value="${val}" data-attr="${esc(name)}">
    </label>`).join('');
  const options = Object.keys(CHASSIS)
    .map((k) => `<option value="${esc(k)}" ${k === c.chassis ? 'selected' : ''}>${esc(k)}</option>`).join('');
  const thread = (UI.threads[id] || [])
    .map((m) => `<div class="thread-${m.who}">${m.who === 'you' ? 'You: ' : ''}${esc(m.text)}</div>`).join('');

  tag.innerHTML = `
    <button class="tag-close" type="button">×</button>
    <div class="tag-name">${esc(c.name)}</div>
    <div class="tag-epithet">${esc(c.epithet || '')} — <span class="tag-mood">${esc(c.mood)}</span></div>
    ${sliders}
    <label class="tag-slider">chassis <select class="tag-chassis">${options}</select></label>
    <div class="tag-thread">${thread}</div>
    <form class="tag-whisper"><input type="text" placeholder="Whisper to ${esc(c.name)}…" maxlength="300"></form>`;

  tag.querySelector('.tag-close').addEventListener('click', () => tag.remove());
  tag.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('change', () => {
    const name = r.dataset.attr, value = parseFloat(r.value);
    c.attributes[name] = value;
    Net.input({ type: 'set-attribute', id, name, value });
  }));
  tag.querySelector('.tag-chassis').addEventListener('change', (e) => {
    Net.input({ type: 'set-chassis', id, chassis: e.target.value });
  });
  tag.querySelector('.tag-whisper').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    const text = inp.value.trim();
    if (!text) return;
    (UI.threads[id] ??= []).push({ who: 'you', text });
    Net.input({ type: 'whisper', id, text });
    inp.value = '';
    UI.openTag(id); // re-render thread
  });
  document.getElementById('hud').appendChild(tag);
};

// whispers back from the director land in the thread
UI.onSay((a) => {
  if (a.target !== 'user') return;
  (UI.threads[a.id] ??= []).push({ who: 'them', text: a.text });
  const open = document.querySelector('.specimen-tag');
  if (open && open.dataset.id === a.id) UI.openTag(a.id);
});
