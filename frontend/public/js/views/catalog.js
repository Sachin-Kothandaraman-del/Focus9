import { h, clear, toast, spinner, money } from '../ui.js';
import { api } from '../api.js';

export async function renderCatalog(screen, ctx) {
  clear(screen);
  screen.appendChild(spinner());
  let materials = [];
  try {
    materials = (await api.materials()).materials;
  } catch (e) {
    clear(screen);
    screen.appendChild(h('div', { class: 'empty' }, e.message));
    return;
  }
  clear(screen);

  const cart = new Map(); // materialId -> qty

  screen.appendChild(h('div', { style: 'margin:2px 2px 6px' }, [
    h('div', { class: 'strong', style: 'font-size:19px' }, 'New material request'),
    h('div', { class: 'muted small' }, 'Select PPE / safety items. Quantities above the per-person allocation will require E&E approval.'),
  ]));

  const deptInput = h('select', {}, ['Pot Line 1', 'Pot Line 2', 'Casthouse', 'Carbon Plant', 'Maintenance', 'Other'].map((d) => h('option', {}, d)));
  screen.appendChild(h('label', { class: 'field', style: 'margin-top:10px' }, [h('span', { class: 'lbl' }, 'Department'), deptInput]));

  const allocNote = h('div', { class: 'hint', id: 'allocNote' });
  const listCard = h('div', { class: 'card' });
  screen.appendChild(listCard);

  materials.forEach((m) => {
    const qEl = h('span', { class: 'q' }, '0');
    const dec = h('button', { onclick: () => bump(-1) }, '−');
    const inc = h('button', { onclick: () => bump(1) }, '+');
    const overChip = h('span', { class: 'chip over', style: 'display:none' }, 'over allocation');

    function bump(d) {
      const cur = cart.get(m.id) || 0;
      const next = Math.max(0, Math.min(m.stockQty, cur + d));
      if (next === 0) cart.delete(m.id); else cart.set(m.id, next);
      qEl.textContent = String(next);
      overChip.style.display = next > m.allocatedQty ? 'inline-flex' : 'none';
      updateBar();
    }

    listCard.appendChild(
      h('div', { class: 'mat' }, [
        h('div', { class: 'ico' }, m.code.replace('PPE-', '')),
        h('div', { class: 'grow' }, [
          h('div', { class: 'name' }, [m.name, ' ', overChip]),
          h('div', { class: 'small muted' }, `${money(m.unitPrice)} / ${m.uom} · allocation ${m.allocatedQty}`),
        ]),
        h('div', { class: 'qtybox' }, [dec, qEl, inc]),
      ])
    );
  });

  screen.appendChild(allocNote);

  const bar = h('button', { class: 'btn', style: 'margin-top:8px', disabled: true, onclick: submit }, 'Add items to continue');
  screen.appendChild(bar);
  screen.appendChild(h('button', { class: 'btn outline', style: 'margin-top:10px', onclick: () => ctx.navigate('home') }, 'Cancel'));

  function updateBar() {
    let units = 0, total = 0, over = false;
    for (const [id, qty] of cart) {
      const m = materials.find((x) => x.id === id);
      units += qty; total += qty * m.unitPrice;
      if (qty > m.allocatedQty) over = true;
    }
    if (units === 0) {
      bar.disabled = true; bar.textContent = 'Add items to continue';
      allocNote.textContent = '';
    } else {
      bar.disabled = false;
      bar.textContent = `Create request · ${units} unit${units > 1 ? 's' : ''} · ${money(total)}`;
      allocNote.innerHTML = over
        ? '⚠️ Some quantities exceed the per-person allocation — this request will route to <b>E&E approval</b>.'
        : '✓ All quantities are within allocation — this request will be <b>auto-approved</b>.';
    }
  }

  async function submit() {
    const lines = [...cart.entries()].map(([materialId, qty]) => ({ materialId, qty }));
    bar.disabled = true; bar.textContent = 'Creating…';
    try {
      const { request } = await api.createRequest({ department: deptInput.value, lines });
      await api.submit(request.id); // create + submit in one tap
      toast(`Request ${request.requestNo} submitted`);
      ctx.navigate('request/' + request.id);
    } catch (e) {
      toast(e.message, true);
      bar.disabled = false; updateBar();
    }
  }
}
