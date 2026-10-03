// Adds an "AI polish" toolbar under every <textarea data-polish="borrower|party|internal">.
// The rewrite keeps every fact; the team reviews it and can undo step by step back to the original.
const SPARK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';

const TONE_OPTIONS = [
  ['excited', '🎉 Excited (good news)'], ['apologetic', 'Apologetic'], ['reassuring', 'Reassuring'],
  ['urgent', 'Politely urgent'], ['friendly', 'Warm & friendly'], ['professional', 'Formal (third parties)'], ['bad_news', 'Delivering bad news']
];

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
      <select class="pb tone" aria-label="Change the tone"><option value="">Tone…</option>${TONE_OPTIONS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <button type="button" class="pb ask" aria-expanded="false">Ask AI…</button>
      <button type="button" class="pb undo" hidden>Undo</button><span class="pmsg" role="status"></span>
      <div class="polish-ask" hidden><input type="text" maxlength="400" placeholder="e.g. mention the appraisal is scheduled for Tuesday, make it sound more personal"><button type="button" class="pb main go">Rewrite</button></div>`;
    ta.insertAdjacentElement('afterend', bar);
    ta.dir = 'auto'; // Hebrew shows right-to-left, English left-to-right
    const history = []; // every earlier version, so Undo can step all the way back
    const msg = bar.querySelector('.pmsg'), undo = bar.querySelector('.undo'), lang = bar.querySelector('.lang');
    // The language button always offers the other language: Hebrew text → "To English", otherwise "To Hebrew".
    const syncLang = () => { const he = /[\u0590-\u05FF]/.test(ta.value); lang.dataset.mode = he ? 'english' : 'hebrew'; lang.textContent = he ? 'To English' : 'To Hebrew'; };
    const syncUndo = () => { undo.hidden = !history.length; undo.textContent = history.length > 1 ? `Undo (${history.length})` : 'Undo'; };
    syncLang();
    ta.addEventListener('input', syncLang);
    const tone = bar.querySelector('.tone'), askBtn = bar.querySelector('.ask'), askRow = bar.querySelector('.polish-ask'), askIn = askRow.querySelector('input');
    const busy = (on) => bar.querySelectorAll('button, select, input').forEach((x) => { x.disabled = on; });
    const run = async (payload) => {
      const text = ta.value.trim();
      if (!text) { msg.textContent = 'Write something first.'; return false; }
      busy(true); msg.textContent = 'Rewriting…';
      let done = false;
      try {
        const r = await fetch('/api/ai/polish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, audience: ta.dataset.polish, ...payload }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not rewrite.');
        history.push(ta.value); if (history.length > 20) history.shift();
        ta.value = d.text; ta.dispatchEvent(new Event('input', { bubbles: true }));
        syncUndo(); msg.textContent = 'Review it before sending.'; done = true;
      } catch (er) { msg.textContent = er.message; }
      busy(false);
      return done;
    };
    // Keep the toolbar's own controls from triggering the surrounding form's change/redraw handlers.
    bar.addEventListener('change', (e) => e.stopPropagation());
    tone.addEventListener('change', async () => { const t = tone.value; if (!t) return; await run({ mode: 'tone', tone: t }); tone.value = ''; });
    const doAsk = async () => { const instruction = askIn.value.trim(); if (!instruction) { askIn.focus(); return; } if (await run({ mode: 'custom', instruction })) askIn.value = ''; };
    askRow.querySelector('.go').addEventListener('click', (e) => { e.preventDefault(); doAsk(); });
    askIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAsk(); } });
    bar.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || b.classList.contains('go')) return;
      e.preventDefault();
      if (b.classList.contains('ask')) { askRow.hidden = !askRow.hidden; b.setAttribute('aria-expanded', String(!askRow.hidden)); if (!askRow.hidden) askIn.focus(); return; }
      if (b.classList.contains('undo')) { if (history.length) { ta.value = history.pop(); ta.dispatchEvent(new Event('input', { bubbles: true })); } syncUndo(); msg.textContent = ''; return; }
      await run({ mode: b.dataset.mode });
    });
  });
}
