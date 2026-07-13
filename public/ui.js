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
