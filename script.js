// ===== ป้องกันการซูม (pinch/ctrl+wheel/dblclick/คีย์ลัด) =====
(function preventZoom(){
  const stop = e => { e.preventDefault(); };
  document.addEventListener('gesturestart', stop, { passive:false });
  document.addEventListener('gesturechange', stop, { passive:false });
  document.addEventListener('gestureend', stop, { passive:false });
  window.addEventListener('wheel', e => { if(e.ctrlKey) e.preventDefault(); }, { passive:false });
  window.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && ['=','+','-','0'].includes(e.key)) e.preventDefault();
  }, { passive:false });
  document.addEventListener('dblclick', stop, { passive:false });
})();

(function(){
  'use strict';
  // ===== Constants / Theme =====
  const STORAGE_KEY = 'snooker-lite-v8';
  const GREEN = '#10b981';
  const RED = '#ef4444';
  const DURATION_PLUS = 1000;
  const DURATION_FOUL = 1000;
  const BALLS = [
    { key:'red',    label:'แดง',   value:1, hex:'#ef4444' },
    { key:'yellow', label:'เหลือง',value:2, hex:'#fde047' },
    { key:'green',  label:'เขียว', value:3, hex:'#22c55e' },
    { key:'brown',  label:'น้ำตาล',value:4, hex:'#92400e' },
    { key:'blue',   label:'น้ำเงิน',value:5, hex:'#2563eb' },
    { key:'pink',   label:'ชมพู',  value:6, hex:'#ec4899' },
    { key:'black',  label:'ดำ',    value:7, hex:'#0b0b0b' },
  ];

  // ===== State =====
  const state = {
    players: [],
    selectedId: null,
    results: [],
    expanded: new Set(),
    filter: { mode: 'all', playerId: '' },
    historyEditMode: false,
    selectedHistoryIds: new Set(),
    playerOrder: [],
  };

  // ===== Utils =====
  const qs = sel => document.querySelector(sel);
  const $$$ = sel => Array.from(document.querySelectorAll(sel));
  const uid = () => (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
  const clamp = n => n|0;

  function save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify({ players: state.players, selectedId: state.selectedId, results: state.results, filter: state.filter, playerOrder: state.playerOrder })); }catch(e){}
  }
  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('snooker-lite-v7') || localStorage.getItem('snooker-lite-v6') || localStorage.getItem('snooker-lite-v5') || localStorage.getItem('snooker-lite-v4') || localStorage.getItem('snooker-lite-v3');
      if(raw){
        const s = JSON.parse(raw);
        state.players = Array.isArray(s.players)? s.players: [];
        state.selectedId = s.selectedId ?? null;
        state.results = Array.isArray(s.results)? s.results: [];
        if(s.filter) state.filter = { ...state.filter, ...s.filter };
        state.playerOrder = Array.isArray(s.playerOrder) ? s.playerOrder : [];
      }
    }catch(e){ console.warn('Load failed', e); }
  }

  const selected = () => state.players.find(p=>p.id===state.selectedId) || null;

  function computeWinners(players){
    if(players.length===0) return { top:0, winnerIds: [], winners: [] };
    const top = Math.max(...players.map(p=>p.score));
    const winners = players.filter(p=>p.score===top);
    return { top, winnerIds: winners.map(w=>w.id), winners };
  }

  function rankPlayers(players){
    const sorted = players.slice().sort((a,b)=> b.score - a.score);
    let lastScore = null, lastRank = 0;
    return sorted.map((p,i)=>{
      const pos = (lastScore===null || p.score < lastScore) ? (i+1) : lastRank;
      lastScore = p.score; lastRank = pos;
      return { ...p, pos };
    });
  }

  function filterResults(entries){
    if(state.filter.mode==='all' || !state.filter.playerId) return entries;
    return entries.filter(r => r.players.some(p => p.id === state.filter.playerId));
  }

  function removeEntriesByIds(list, idsSet){ return list.filter(r => !idsSet.has(r.id)); }
  function cleanupExpanded(){ state.expanded = new Set([...state.expanded].filter(id => state.results.some(r=> r.id===id))); }

  // ===== Notice (centered) — optimized with transform =====
  let noticeRAF = null;
  function runNotice({ kind='plus', text='', ballColor='#fff', barColor=GREEN, durationMs=DURATION_PLUS }){
    const wrap = qs('#notice');
    const bar = qs('#noticeBar');
    const ball = qs('#noticeBall');
    const pct = qs('#noticePct');
    const label = qs('#noticeLabel');
    const txt = qs('#noticeText');
    const track = qs('#noticeTrack');
    const trackW = track.clientWidth;

    label.textContent = kind==='foul'? 'ฟาวล์' : 'บันทึกการกด';
    txt.textContent = text || '';
    txt.className = kind==='foul' ? 'text-rose-300 font-semibold' : 'text-emerald-300 font-semibold';
    bar.style.background = `linear-gradient(90deg, ${barColor} 0%, rgba(255,255,255,.15) 100%)`;
    ball.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,.7), rgba(255,255,255,0) 55%), ${ballColor}`;
    wrap.classList.remove('hidden');

    const start = performance.now();
    const tick = now => {
      const p = Math.min(100, Math.round((now-start)/durationMs*100));
      bar.style.transform = `scaleX(${p/100})`;
      const px = (p/100)*trackW - 12;
      ball.style.transform = `translateX(${px}px)`;
      pct.textContent = p + '%';
      if(p < 100){ noticeRAF = requestAnimationFrame(tick); } else { setTimeout(()=> wrap.classList.add('hidden'), 80); }
    };
    cancelAnimationFrame(noticeRAF); noticeRAF = requestAnimationFrame(tick);
  }

  // ===== Celebrate =====
  function showCelebrate(entry){
    const fx = qs('#celebrateFX');
    fx.innerHTML = '';
    const colors = ['#ef4444','#fde047','#22c55e','#2563eb','#ec4899','#ffffff','#f5c542'];
    for(let i=0;i<80;i++){
      const d = document.createElement('div');
      const size = Math.random()*8+6;
      d.style.position='absolute';
      d.style.left = Math.random()*100+'%';
      d.style.top = (-Math.random()*80)+'vh';
      d.style.width = size+'px';
      d.style.height = (size*0.6)+'px';
      d.style.background = colors[(Math.random()*colors.length)|0];
      d.style.opacity = .95;
      d.style.transform = `rotate(${Math.random()*360}deg) translateZ(0)`;
      d.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,.25))';
      d.style.animation = `confetti ${6+Math.random()*4}s cubic-bezier(.2,.6,.2,1) forwards`;
      d.style.animationDelay = (Math.random()*0.8)+'s';
      d.style.borderRadius = '3px';
      fx.appendChild(d);
    }

    const msgEl = qs('#celebrateMsg');
    const board = qs('#celebrateBoard');
    const { winners } = computeWinners(entry.players);
    if(winners.length===1){
      msgEl.innerHTML = `ผู้ชนะคือ <span class="gold-text font-extrabold">${escapeHtml(winners[0].name)}</span> ด้วยคะแนน <b>${winners[0].score}</b>`;
    } else {
      msgEl.innerHTML = `ผลเสมอ: <span class="text-amber-300 font-semibold">${escapeHtml(winners.map(w=>w.name).join(' • '))}</span> (${winners[0]?.score ?? 0} แต้ม)`;
    }
    const rows = rankPlayers(entry.players).map(p=>{
      return `<div class="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10 mt-2">
        <div class="font-semibold"><span class="text-slate-400 mr-1">#${p.pos}</span>${escapeHtml(p.name)}</div>
        <div class="text-lg font-extrabold">${p.score}</div>
      </div>`;
    }).join('');
    board.innerHTML = rows;

    qs('#celebrate').classList.remove('hidden');
  }
  function hideCelebrate(){ qs('#celebrate').classList.add('hidden'); }

  // ===== NEW: Delete Player Function =====
  function deletePlayer(id){
    showConfirm('ลบผู้เล่น', 'ต้องการลบผู้เล่นนี้หรือไม่?', () => {
      state.players = state.players.filter(p => p.id !== id);
      state.playerOrder = state.playerOrder.filter(pid => pid !== id);
      if(state.selectedId === id) state.selectedId = null;
      save(); render();
    });
  }
  window.deletePlayer = deletePlayer; // ให้ปุ่มลบเรียกได้

  // ===== Renderers =====
  function render(){
    qs('#selectedName').textContent = selected()?.name || '—';

    const list = qs('#playersList');
    if(state.players.length===0){
      list.innerHTML = `<div class="p-6 rounded-2xl border border-dashed border-white/20 bg-white/5 text-slate-400 text-center">ยังไม่มีผู้เล่น — เพิ่มชื่อด้านบนได้เลย</div>`;
    } else {
      list.innerHTML = state.players.map(p=>{
        const orderIndex = state.playerOrder.indexOf(p.id);
        const orderText = orderIndex !== -1 ? `ผู้เล่นคนที่ ${orderIndex + 1}` : '';
        const isSelected = state.selectedId === p.id;
        return `
        <div class="player-card p-4 rounded-2xl border-2 transition select-none cursor-pointer flex justify-between items-center animate-fade-in ${isSelected? 'border-sky-400 bg-sky-400/15 selected':'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'}" data-player-id="${p.id}">
          <div class="flex items-center gap-3 flex-1" style="min-width:0;">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 grid place-items-center text-white font-bold text-sm shadow-soft">${escapeHtml(p.name.charAt(0).toUpperCase())}</div>
            <div class="truncate">
              <div class="font-semibold truncate text-lg">${escapeHtml(p.name)}</div>
              ${orderText ? `<div class="text-xs text-slate-400 truncate">${orderText}</div>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-4 ml-3">
            <div class="text-right">
              <div class="text-3xl font-extrabold gradient-text-blue">${p.score}</div>
              <div class="text-xs text-slate-400">แต้ม</div>
            </div>
            <button type="button" aria-label="ลบผู้เล่น ${escapeHtml(p.name)}" class="delete-btn px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 shadow-soft" onclick="event.stopPropagation(); deletePlayer('${p.id}');">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-white" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>`;
      }).join('');
    }

    qs('[data-action="random-player"]').disabled = state.players.length < 2;

    const orderDiv = qs('#playerOrder');
    if(state.playerOrder.length > 0) {
      const orderList = qs('#orderList');
      orderList.innerHTML = state.playerOrder.map((playerId, index) => {
        const player = state.players.find(p => p.id === playerId);
        if(!player) return '';
        return `
          <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-white/10 border border-white/20 ultra-smooth">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 grid place-items-center text-white font-bold text-sm shadow-soft">${index + 1}</div>
              <span class="font-medium">${escapeHtml(player.name)}</span>
            </div>
            <div class="text-xs text-blue-300">${index === 0 ? 'เริ่มก่อน' : `คนที่ ${index + 1}`}</div>
          </div>`;
      }).join('');
      orderDiv.classList.remove('hidden');
    } else {
      orderDiv.classList.add('hidden');
    }

    const pad = qs('#ballsPad');
    const canScore = !!selected();
    pad.innerHTML = BALLS.map(b=>`
      <button data-action="ball" data-ball="${b.key}" class="relative sphere press w-16 h-16 text-white font-bold text-sm shadow-soft transition disabled:opacity-40 disabled:cursor-not-allowed" style="background:${b.hex};" ${canScore?'':'disabled'}>
        <span class="center-abs">${b.value}</span>
      </button>
    `).join('');

    qs('[data-action="foul"]').disabled = !canScore;

    renderResults();
    renderFilterPlayer();
  }

  function renderResults(){
    const list = qs('#resultsList');
    const count = qs('#resultsCount');
    const filtered = filterResults(state.results);
    count.textContent = `${filtered.length} รายการ`;

    if(filtered.length===0){
      list.innerHTML = `<div class="p-4 rounded-xl bg-white/5 text-slate-400 text-center text-sm">ยังไม่มีประวัติ</div>`;
      return;
    }

    list.innerHTML = filtered.slice().reverse().map(r=>{
      const { winners } = computeWinners(r.players);
      const isExpanded = state.expanded.has(r.id);
      const isSelected = state.selectedHistoryIds.has(r.id);
      const time = new Date(r.at).toLocaleString('th-TH', { dateStyle:'short', timeStyle:'short' });

      let summary = '';
      if(winners.length===1){
        summary = `${escapeHtml(winners[0].name)} ชนะ (${winners[0].score})`;
      } else {
        summary = `เสมอ: ${escapeHtml(winners.map(w=>w.name).join(', '))} (${winners[0]?.score ?? 0})`;
      }

      return `
        <div class="rounded-xl border border-white/10 bg-white/5 overflow-hidden ultra-smooth">
          <div class="p-3 flex items-center justify-between cursor-pointer hover:bg-white/10 transition" data-action="toggle-result" data-result-id="${r.id}">
            <div class="flex items-center gap-3">
              ${state.historyEditMode ? `<input type="checkbox" class="w-4 h-4 rounded border-white/20 bg-white/10 text-sky-500 focus:ring-sky-500 focus:ring-offset-0" data-result-checkbox="${r.id}" ${isSelected?'checked':''}/>`:''}
              <div>
                <div class="font-medium text-sm">${summary}</div>
                <div class="text-xs text-slate-400">${time}</div>
              </div>
            </div>
            <svg class="w-4 h-4 text-slate-400 transition-transform ${isExpanded?'rotate-180':''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
          </div>
          ${isExpanded ? `
            <div class="px-3 pb-3 border-t border-white/10 bg-white/5">
              <div class="mt-2 space-y-1">
                ${rankPlayers(r.players).map(p=>`
                  <div class="flex items-center justify-between text-sm">
                    <span><span class="text-slate-400">#${p.pos}</span> ${escapeHtml(p.name)}</span>
                    <span class="font-semibold">${p.score}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>`;
    }).join('');
  }

  function renderFilterPlayer(){
    const sel = qs('#filterPlayer');
    sel.innerHTML = '<option value="">— เลือกผู้เล่น —</option>' + state.players.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    sel.value = state.filter.playerId;
  }

  function renderHistoryEditMode(){
    const tools = qs('#historyTools');
    const editBtn = tools.querySelector('[data-action="history-edit-toggle"]');
    const delSelBtn = qs('#btnDeleteSelected');
    const delAllBtn = qs('#btnDeleteAll');
    const selCount = qs('#selCount');

    if(state.historyEditMode){
      editBtn.textContent = 'เสร็จ';
      editBtn.classList.add('bg-sky-600', 'hover:bg-sky-700');
      editBtn.classList.remove('btn-glass', 'hover:bg-white/20');
      delSelBtn.classList.remove('hidden');
      delAllBtn.classList.remove('hidden');
      selCount.classList.remove('hidden');
      selCount.textContent = `เลือก ${state.selectedHistoryIds.size} รายการ`;
      delSelBtn.disabled = state.selectedHistoryIds.size === 0;
    } else {
      editBtn.textContent = 'แก้ไข';
      editBtn.classList.remove('bg-sky-600', 'hover:bg-sky-700');
      editBtn.classList.add('btn-glass', 'hover:bg-white/20');
      delSelBtn.classList.add('hidden');
      delAllBtn.classList.add('hidden');
      selCount.classList.add('hidden');
      state.selectedHistoryIds.clear();
    }
  }

  // ===== Event Handlers =====
  function addPlayer(){
    const input = qs('#nameInput');
    const name = input.value.trim();
    if(!name) return;
    if(state.players.some(p=>p.name===name)){
      showModal('ชื่อซ้ำ', 'มีผู้เล่นชื่อนี้อยู่แล้ว');
      return;
    }
    const player = { id: uid(), name, score: 0 };
    state.players.push(player);
    input.value = '';
    save(); render();
  }

  function randomPlayer(){
    if(state.players.length < 2) return;
    const shuffled = [...state.players].sort(() => Math.random() - 0.5);
    state.playerOrder = shuffled.map(p => p.id);
    const firstPlayer = shuffled[0];
    qs('#randomPlayerName').textContent = firstPlayer.name;
    qs('#randomResult').classList.remove('hidden');
    save(); render();
  }

  function selectPlayer(id){
    state.selectedId = state.selectedId === id ? null : id;
    save(); render();
  }

  function addScore(ballKey){
    const p = selected();
    if(!p) return;
    const ball = BALLS.find(b=>b.key===ballKey);
    if(!ball) return;
    p.score = p.score + ball.value;
    runNotice({ text: `${p.name} +${ball.value}`, ballColor: ball.hex });
    save(); render();
  }

  function addFoul(){
    const p = selected();
    if(!p) return;
    p.score = p.score - 4;
    runNotice({ kind:'foul', text: `${p.name} -4`, ballColor: RED, barColor: RED, durationMs: DURATION_FOUL });
    save(); render();
  }

  function endGame(){
    if(state.players.length===0){
      showModal('ไม่มีผู้เล่น', 'เพิ่มผู้เล่นก่อนจบเกมส์');
      return;
    }
    const snapshot = state.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
    const entry = { id: uid(), at: Date.now(), players: snapshot, winnerIds: computeWinners(snapshot).winnerIds };
    state.results.push(entry);

    state.players.forEach(p => p.score = 0);
    state.selectedId = null;

    showCelebrate(entry);
    save(); render();
  }

  function resetGame(){
    showConfirm('เริ่มเกมส์ใหม่', 'ต้องการเริ่มเกมส์ใหม่หรือไม่? คะแนนปัจจุบันจะถูกรีเซ็ต', ()=>{
      state.players.forEach(p => p.score = 0);
      state.selectedId = null;
      state.playerOrder = [];
      qs('#randomResult').classList.add('hidden');
      save(); render();
    });
  }

  function toggleResult(id){
    if(state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);
    render();
  }

  function setFilter(mode, playerId=''){
    state.filter = { mode, playerId };
    save(); render();
  }

  function toggleHistoryEditMode(){
    state.historyEditMode = !state.historyEditMode;
    if(!state.historyEditMode) state.selectedHistoryIds.clear();
    renderHistoryEditMode(); render();
  }

  function toggleHistorySelection(id){
    if(state.selectedHistoryIds.has(id)) state.selectedHistoryIds.delete(id);
    else state.selectedHistoryIds.add(id);
    renderHistoryEditMode(); render();
  }

  function deleteSelectedHistory(){
    if(state.selectedHistoryIds.size===0) return;
    showConfirm('ลบประวัติที่เลือก', `ต้องการลบประวัติ ${state.selectedHistoryIds.size} รายการหรือไม่?`, ()=>{
      state.results = removeEntriesByIds(state.results, state.selectedHistoryIds);
      state.selectedHistoryIds.clear();
      cleanupExpanded();
      save(); render(); renderHistoryEditMode();
    });
  }

  function deleteAllHistory(){
    if(state.results.length===0) return;
    showConfirm('ลบประวัติทั้งหมด', 'ต้องการลบประวัติทั้งหมดหรือไม่?', ()=>{
      state.results = [];
      state.selectedHistoryIds.clear();
      state.expanded.clear();
      save(); render(); renderHistoryEditMode();
    });
  }

  // ===== Modal/Confirm =====
  function showModal(title, msg){
    qs('#modalTitle').textContent = title;
    qs('#modalMsg').textContent = msg;
    qs('#modal').classList.remove('hidden');
  }
  function hideModal(){ qs('#modal').classList.add('hidden'); }

  let confirmCallback = null;
  function showConfirm(title, msg, onOk){
    qs('#confirmTitle').textContent = title;
    qs('#confirmMsg').textContent = msg;
    confirmCallback = onOk;
    qs('#confirm').classList.remove('hidden');
  }
  function hideConfirm(){
    qs('#confirm').classList.add('hidden');
    confirmCallback = null;
  }
  function confirmOk(){
    if(confirmCallback) confirmCallback();
    hideConfirm();
  }

  function escapeHtml(text){ return text.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ===== Event Delegation =====
  document.addEventListener('click', e => {
    const actionEl = e.target.closest('[data-action]');
    if(actionEl){
      const action = actionEl.dataset.action;
      switch(action){
        case 'add-player': addPlayer(); break;
        case 'random-player': randomPlayer(); break;
        case 'ball': {
          const ballHost = e.target.closest('[data-ball]');
          if(ballHost) addScore(ballHost.dataset.ball);
          break;
        }
        case 'foul': addFoul(); break;
        case 'end': endGame(); break;
        case 'reset': resetGame(); break;
        case 'toggle-result': {
          const host = e.target.closest('[data-result-id]');
          if(host) toggleResult(host.dataset.resultId);
          break;
        }
        case 'filter-all': setFilter('all'); break;
        case 'filter-player': setFilter('player'); break;
        case 'history-edit-toggle': toggleHistoryEditMode(); break;
        case 'history-delete-selected': deleteSelectedHistory(); break;
        case 'history-delete-all': deleteAllHistory(); break;
        case 'celebrate-close': hideCelebrate(); break;
        case 'modal-close': hideModal(); break;
        case 'confirm-cancel': hideConfirm(); break;
        case 'confirm-ok': confirmOk(); break;
      }
    }

    const playerEl = e.target.closest('[data-player-id]');
    if(playerEl) selectPlayer(playerEl.dataset.playerId);

    const resultCheckbox = e.target.closest('[data-result-checkbox]');
    if(resultCheckbox){
      const id = resultCheckbox.dataset.resultCheckbox;
      toggleHistorySelection(id);
      e.stopPropagation();
    }
  });

  document.addEventListener('keydown', e => {
    if(e.key==='Enter' && e.target.id==='nameInput') addPlayer();
  });

  document.addEventListener('change', e => {
    if(e.target.id==='filterPlayer'){
      setFilter('player', e.target.value);
    }
  });

  // ===== Init =====
  load();
  render();
  renderHistoryEditMode();

  // ===== Dev Tests =====
  function runTests(){
    const out = [];
    try{
      out.push(`✓ State initialized: ${state.players.length} players, ${state.results.length} results`);
      out.push(`✓ UID generator: ${uid().length > 10 ? 'OK' : 'FAIL'}`);
      out.push(`✓ Clamp function: ${clamp(-5.7)} === -5`);
      const testPlayers = [{id:'a',name:'A',score:10},{id:'b',name:'B',score:15},{id:'c',name:'C',score:10}];
      const winnersObj = computeWinners(testPlayers);
      out.push(`✓ Winner computation: ${winnersObj.winners.length === 1 && winnersObj.winners[0].name === 'B' ? 'OK' : 'FAIL'}`);
      const ranked = rankPlayers(testPlayers);
      out.push(`✓ Ranking: ${ranked[0].pos === 1 && ranked[1].pos === 2 && ranked[2].pos === 2 ? 'OK' : 'FAIL'}`);
      out.push(`✓ All tests completed at ${new Date().toLocaleTimeString()}`);
    } catch(err){
      out.push(`✗ Test error: ${err.message}`);
    }
    const el = qs('#testsOut'); if(el) el.textContent = out.join('\n');
  }
  setTimeout(runTests, 100);
})();
