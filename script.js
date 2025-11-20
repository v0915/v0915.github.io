// Robust integer parser (digit-by-digit)
function toInt(v){
  const s = String(v ?? '').replace(/[^\d-]/g,'');
  return s.length ? parseInt(s,10) : 0;
}

const STORAGE_KEY = 'checklist_with_summary_v3_structured';

// Helper: get all sections with data-section
function getSections(){
  return Array.from(document.querySelectorAll('section.card[data-section]'));
}

// Helper: get rows inside a section (ordered)
function getSectionRows(sectionEl){
  return Array.from(sectionEl.querySelectorAll('.card-body .row'));
}

// Read numeric value from a given row (supports .pct-input or .pct-label or fallback text)
function readRowValue(row){
  if(!row) return 0;
  const right = row.querySelector('.right');
  if(!right) return 0;
  const input = right.querySelector('.pct-input');
  if(input) return toInt(input.value);
  const lbl = right.querySelector('.pct-label');
  if(lbl && lbl.dataset && lbl.dataset.value) return toInt(lbl.dataset.value);
  // fallback parse displayed pct
  const pctText = right.querySelector('.pct')?.textContent || '';
  return toInt(pctText);
}

// Write numeric value to a given row (update label/input and toggle dataset)
function writeRowValue(row, num){
  const right = row.querySelector('.right');
  if(!right) return;
  const lbl = right.querySelector('.pct-label');
  const input = right.querySelector('.pct-input');

  if(input){
    input.value = String(num);
  }
  if(lbl){
    lbl.dataset.value = String(num);
    lbl.textContent = (num >= 0 ? '+' + num + '%' : num + '%');
  }
  // if neither exist (unexpected), try to create label
  if(!lbl && !input){
    const pctWrap = right.querySelector('.pct') || right;
    const span = document.createElement('span');
    span.className = 'pct-label';
    span.dataset.value = String(num);
    span.textContent = (num >= 0 ? '+' + num + '%' : num + '%');
    if(pctWrap) pctWrap.appendChild(span);
  }

  const toggle = row.querySelector('.toggle');
  if(toggle) toggle.dataset.value = String(num);
}

// Read toggle boolean from a row
function readRowToggle(row){
  const t = row.querySelector('.toggle');
  return t ? !!t.checked : false;
}

// Write toggle boolean to a row
function writeRowToggle(row, val){
  const t = row.querySelector('.toggle');
  if(t) t.checked = !!val;
}

// SAVE: structured object per section -> ordered rows with {value,checked}
function saveSettings(){
  const sections = {};
  getSections().forEach(sec => {
    const key = sec.dataset.section || 'unknown';
    sections[key] = [];
    const rows = getSectionRows(sec);
    rows.forEach(row => {
      const v = readRowValue(row);
      const c = readRowToggle(row);
      sections[key].push({ value: v, checked: !!c });
    });
  });

  const payload = { meta: { savedAt: Date.now() }, sections };
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }catch(e){
    console.warn('Could not save settings', e);
  }
}

// LOAD: structured settings -> write values back to rows by order
function loadSettings(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return;
  try{
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.sections) return;
    const savedSections = parsed.sections;

    getSections().forEach(sec => {
      const key = sec.dataset.section || 'unknown';
      const rows = getSectionRows(sec);
      const savedRows = Array.isArray(savedSections[key]) ? savedSections[key] : [];
      rows.forEach((row, idx) => {
        const item = savedRows[idx];
        if(item){
          writeRowValue(row, toInt(item.value));
          writeRowToggle(row, !!item.checked);
        }
      });
    });
  }catch(e){
    console.warn('Could not parse/load saved settings', e);
  }
}

// Recalculate totals for all sections
function updateAllTotals(){
  getSections().forEach(sec => {
    const key = sec.dataset.section;
    let total = 0;
    const rows = getSectionRows(sec);
    rows.forEach(row => {
      const toggle = row.querySelector('.toggle');
      if(toggle && toggle.checked){
        const v = readRowValue(row);
        total += v;
      }
    });
    const totalEl = document.getElementById('total-' + key) || sec.querySelector('.total');
    if(totalEl) totalEl.textContent = total + '%';
  });

  updateSummaryFromSections();
}

// Update summary small cards + overall label
function updateSummaryFromSections(){
  const mapping = [
    {sec:'weekly', elId:'summary-weekly'},
    {sec:'daily', elId:'summary-daily'},
    {sec:'4h', elId:'summary-4h'},
    {sec:'lower-multiples', elId:'summary-lower-multiples'},
    {sec:'lower-tf', elId:'summary-lower-tf'}
  ];

  let overall = 0;
  mapping.forEach(m => {
    const totalEl = document.getElementById('total-' + m.sec);
    const value = totalEl ? toInt(totalEl.textContent) : 0;
    const summaryEl = document.getElementById(m.elId);
    if(summaryEl) summaryEl.textContent = value + '%';
    overall += value;
  });

  const overallEl = document.getElementById('summary-overall');
  if(overallEl) overallEl.textContent = overall + '%';

  const labelEl = document.getElementById('summary-label');
  if(labelEl){
    let label = 'No confluence';
    if(overall >= 100) label = 'Strong Confluence ✓';
    else if(overall >= 60) label = 'Moderate Confluence';
    else if(overall > 0) label = 'Weak Confluence';
    labelEl.textContent = label;
  }
}

// Wire change listeners on all toggles
function wireToggles(){
  document.querySelectorAll('.toggle').forEach(t => {
    t.removeEventListener('change', onToggleChange);
    t.addEventListener('change', onToggleChange);
  });
}

function onToggleChange(e){
  // when toggle flips, read the current row value (supports input or label) and store it to dataset
  const toggle = e.currentTarget;
  const row = toggle.closest('.row');
  const v = readRowValue(row);
  toggle.dataset.value = String(v);
  updateAllTotals();
  saveSettings();
}

// Edit percentages: replace spans with inputs and sync on blur / done
let editing = false;
const editBtn = document.getElementById('editPctBtn');
if(editBtn){
  editBtn.addEventListener('click', () => {
    editing = !editing;
    toggleEditMode(editing);
    editBtn.textContent = editing ? 'Done editing' : 'Edit percentages';
    if(!editing){
      // commit all inputs -> spans and sync toggles
      getSections().forEach(sec => {
        getSectionRows(sec).forEach(row => {
          const right = row.querySelector('.right');
          const input = right?.querySelector('.pct-input');
          if(input){
            const v = toInt(input.value);
            // replace with span
            const span = document.createElement('span');
            span.className = 'pct-label';
            span.dataset.value = String(v);
            span.textContent = (v >= 0 ? '+' + v + '%' : v + '%');
            const pctWrap = right.querySelector('.pct');
            if(pctWrap){
              const existing = pctWrap.querySelector('.pct-label') || pctWrap.firstChild;
              if(existing) pctWrap.replaceChild(span, existing);
              else pctWrap.appendChild(span);
            } else {
              input.parentElement.replaceChild(span, input);
            }
            // sync toggle dataset
            const toggle = row.querySelector('.toggle');
            if(toggle) toggle.dataset.value = String(v);
          } else {
            // normalize existing span values
            const span = right.querySelector('.pct-label');
            if(span){
              const v = toInt(span.dataset.value);
              span.dataset.value = String(v);
              span.textContent = (v >= 0 ? '+' + v + '%' : v + '%');
              const toggle = row.querySelector('.toggle');
              if(toggle) toggle.dataset.value = String(v);
            }
          }
        });
      });

      updateAllTotals();
      saveSettings();
    }
  });
}

// Replace spans with inputs (enter edit mode)
function toggleEditMode(on){
  getSections().forEach(sec => {
    getSectionRows(sec).forEach(row => {
      const right = row.querySelector('.right');
      if(!right) return;
      const span = right.querySelector('.pct-label');
      if(on && span){
        const val = toInt(span.dataset.value);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pct-input';
        input.value = String(val);
        input.title = 'Enter whole number (e.g. 5 or 10)';
        input.addEventListener('keydown', (e) => {
          if(e.key === 'Enter') e.target.blur();
        });
        input.addEventListener('blur', (e) => {
          // when user leaves input, sync toggle immediately
          const v = toInt(e.target.value);
          const toggle = row.querySelector('.toggle');
          if(toggle) toggle.dataset.value = String(v);
          // keep input value as normalized string
          e.target.value = String(v);
        });

        // replace existing span (inside .pct if present) or span directly
        const pctWrap = right.querySelector('.pct');
        if(pctWrap && pctWrap.contains(span)){
          pctWrap.replaceChild(input, span);
        } else {
          span.parentElement.replaceChild(input, span);
        }
        input.focus();
      }
    });
  });

  wireToggles();
}

// Topbar clear button: clear localStorage and reload
const clearBtn = document.getElementById('clearBtn');
if(clearBtn){
  clearBtn.addEventListener('click', () => {
    if(confirm('Clear saved settings (percentages and toggles)?')){
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });
}

// RESET ALL: set all to 0 and uncheck
const resetAllBtn = document.getElementById('resetAllBtn');
if(resetAllBtn){
  resetAllBtn.addEventListener('click', () => {
    if(!confirm('Reset ALL percentages to +0% and turn all toggles OFF?')) return;

    // 1) Replace any inputs with normalized span = 0 and update labels
    getSections().forEach(sec => {
      getSectionRows(sec).forEach(row => {
        const right = row.querySelector('.right');
        if(!right) return;

        // If input exists, replace it with span +0%
        const input = right.querySelector('.pct-input');
        if(input){
          const span = document.createElement('span');
          span.className = 'pct-label';
          span.dataset.value = '0';
          span.textContent = '+0%';
          const pctWrap = right.querySelector('.pct');
          if(pctWrap && pctWrap.contains(input)) pctWrap.replaceChild(span, input);
          else input.parentElement.replaceChild(span, input);
        } else {
          // ensure span exists and set to +0%
          const span = right.querySelector('.pct-label');
          if(span){
            span.dataset.value = '0';
            span.textContent = '+0%';
          } else {
            const pctWrap = right.querySelector('.pct') || right;
            const spanNew = document.createElement('span');
            spanNew.className = 'pct-label';
            spanNew.dataset.value = '0';
            spanNew.textContent = '+0%';
            if(pctWrap) pctWrap.appendChild(spanNew);
          }
        }

        // Uncheck toggle and set data-value
        const toggle = row.querySelector('.toggle');
        if(toggle){
          toggle.checked = false;
          toggle.dataset.value = '0';
          // dispatch change so any listeners update (visual + totals)
          try{
            const ev = new Event('change', { bubbles: true });
            toggle.dispatchEvent(ev);
          }catch(e){
            // fallback
            toggle.onchange && toggle.onchange();
          }
        }
      });
    });

    // 2) Remove saved settings from storage
    localStorage.removeItem(STORAGE_KEY);

    // 3) Ensure totals and summary update (in case any toggle listeners didn't)
    updateAllTotals();

    // Visual feedback
    const overallEl = document.getElementById('summary-overall');
    if(overallEl){
      overallEl.style.transform = 'scale(1.06)';
      setTimeout(()=> overallEl.style.transform = '', 280);
    }
  });
}

// Initialize app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // First, ensure UI baseline: any missing pct-labels get created from text
  getSections().forEach(sec => {
    getSectionRows(sec).forEach(row => {
      const right = row.querySelector('.right');
      if(!right) return;
      // if pct-label missing but .pct has text, create pct-label
      const pctWrap = right.querySelector('.pct');
      if(pctWrap && !pctWrap.querySelector('.pct-label')){
        const raw = pctWrap.textContent || '';
        const v = toInt(raw);
        pctWrap.textContent = ''; // clear raw
        const span = document.createElement('span');
        span.className = 'pct-label';
        span.dataset.value = String(v);
        span.textContent = (v >= 0 ? '+' + v + '%' : v + '%');
        pctWrap.appendChild(span);
      }
      // ensure toggle dataset reflect label if present
      const span = right.querySelector('.pct-label');
      const toggle = right.querySelector('.toggle');
      if(span && toggle) toggle.dataset.value = span.dataset.value;
    });
  });

  // Force 4H Trend → 10% (find row labelled "Trend" inside section[data-section="4h"])
  try{
    const sec4h = document.querySelector('section[data-section="4h"]');
    if(sec4h){
      const rows = getSectionRows(sec4h);
      const trendRow = rows.find(r => (r.querySelector('.label')?.textContent || '').trim().toLowerCase() === 'trend');
      if(trendRow){
        writeRowValue(trendRow, 10);
      }
    }
  }catch(e){
    // ignore
  }

  // Load saved settings (overrides defaults)
  loadSettings();

  // Normalize all spans/inputs and sync toggles to dataset
  getSections().forEach(sec => {
    getSectionRows(sec).forEach(row => {
      // normalize span
      const span = row.querySelector('.pct-label');
      if(span){
        const v = toInt(span.dataset.value);
        span.dataset.value = String(v);
        span.textContent = (v >= 0 ? '+' + v + '%' : v + '%');
      }
      // normalize input
      const input = row.querySelector('.pct-input');
      if(input){
        input.value = String(toInt(input.value));
      }
      // sync toggle dataset to row value if present
      const toggle = row.querySelector('.toggle');
      if(toggle){
        const v = readRowValue(row);
        toggle.dataset.value = String(v);
      }
    });
  });

  // final wiring
  wireToggles();
  updateAllTotals();
});
