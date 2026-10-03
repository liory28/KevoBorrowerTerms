// Adds an "AI polish" toolbar under every <textarea data-polish="borrower|party|internal">.
// The rewrite keeps every fact; the team reviews it and can undo step by step back to the original.
const SPARK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';

export function enhancePolish(root = document) {
  root.querySelectorAll('textarea[data-polish]').forEach((ta) => {
    if (ta.dataset.polishReady || ta.disabled) return;
    ta.dataset.polishReady = '1';
    const bar = document.createElement('div');
    bar.className = 'polish-bar';
    bar.innerHTML = `<button type="button" class="pb main" data-mode="polish">${SPARK} Polish with AI</button>
      <button type="button" class="pb" data-mode="shorter">Shorter</button>
      <button type="button" class="pb" data-mode="simpler">Simpler</button>
      <button type="button" class="pb lang"></button>
      <button type="button" class="pb undo" hidden>Undo</button><span class="pmsg" role="status"></span>`;
    ta.insertAdjacentElement('afterend', bar);
    ta.dir = 'auto'; // Hebrew shows right-to-left, English left-to-right
    const history = []; // every earlier version, so Undo can step all the way back
    const msg = bar.querySelector('.pmsg'), undo = bar.querySelector('.undo'), lang = bar.querySelector('.lang');
    // The language button always offers the other language: Hebrew text → "To English", otherwise "To Hebrew".
    const syncLang = () => { const he = /[\u0590-\u05FF]/.test(ta.value); lang.dataset.mode = he ? 'english' : 'hebrew'; lang.textContent = he ? 'To English' : 'To Hebrew'; };
    const syncUndo = () => { undo.hidden = !history.length; undo.textContent = history.length > 1 ? `Undo (${history.length})` : 'Undo'; };
    syncLang();
    ta.addEventListener('input', syncLang);
    bar.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault();
      if (b.classList.contains('undo')) { if (history.length) { ta.value = history.pop(); ta.dispatchEvent(new Event('input', { bubbles: true })); } syncUndo(); msg.textContent = ''; return; }
      const text = ta.value.trim();
      if (!text) { msg.textContent = 'Write something first.'; return; }
      bar.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      msg.textContent = 'Rewriting…';
      try {
        const r = await fetch('/api/ai/polish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, mode: b.dataset.mode, audience: ta.dataset.polish }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not rewrite.');
        history.push(ta.value); if (history.length > 20) history.shift();
        ta.value = d.text; ta.dispatchEvent(new Event('input', { bubbles: true }));
        syncUndo(); msg.textContent = 'Review it before sending.';
      } catch (er) { msg.textContent = er.message; }
      bar.querySelectorAll('button').forEach((x) => { x.disabled = false; });
    });
  });
}
