// 家族Bot のメニューから開くページ（プリント・ピアノ・買い物リスト・家事リスト・使い方）
// データは Google Apps Script（family-bot）のAPIから読み書きする。
// URLの「#」以降に s（Apps ScriptのデプロイID）と k（鍵）を持たせる。「#」以降はサーバーに送られない。
// このファイルには秘密の情報を含めない。
(() => {
  'use strict';

  // ===== 設定・URL =====
  const hash = () => new URLSearchParams(location.hash.slice(1));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できなくても動く */ } },
  };
  // 正しい形のIDだけを使う（「undefined」などの壊れたリンクは保存しない）
  const valid = v => !!v && v !== 'undefined' && v !== 'null' && /^[A-Za-z0-9_-]{10,}$/.test(v);
  const S = valid(hash().get('s')) ? hash().get('s') : store.get('fb_s');
  const K = valid(hash().get('k')) ? hash().get('k') : store.get('fb_k');
  if (valid(hash().get('s'))) store.set('fb_s', S);
  if (valid(hash().get('k'))) store.set('fb_k', K);
  const API = 'https://script.google.com/macros/s/' + S + '/exec';

  const $ = id => document.getElementById(id);
  const app = $('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = p => '#s=' + encodeURIComponent(S) + '&k=' + encodeURIComponent(K) + (p && p !== 'home' ? '&p=' + p : '');
  const pageName = () => hash().get('p') || 'home';
  const status = t => { $('status').textContent = t || ''; };

  // ===== API =====
  async function api(name, params) {
    const q = new URLSearchParams(Object.assign({ api: name, k: K }, params || {}));
    let res;
    try {
      res = await fetch(API + '?' + q.toString());
    } catch (e) {
      throw new Error('サーバーにつながりません（通信状態か、メニューのリンクを確認してください）');
    }
    let body;
    try { body = await res.json(); } catch (e) { throw new Error('サーバーの応答を読めません（' + res.status + '）'); }
    if (!body.ok) throw new Error(body.error || 'エラー');
    return body.data;
  }
  // 前回の内容をすぐ表示し、裏で最新を読み込んで入れ替える
  function cached(key) { const v = store.get('fb_cache_' + key); try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function remember(key, data) { store.set('fb_cache_' + key, JSON.stringify(data)); }

  // ===== 日付 =====
  const WD = '日月火水木金土';
  function md(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return ymd || '';
    const wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return (+m[2]) + '/' + (+m[3]) + '(' + WD[wd] + ')';
  }
  // 時刻は日本時間で表示する（端末の時刻設定に左右されない）
  const hm = t => new Date(t).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit' });

  // ===== ルーティング =====
  function route() {
    if (!valid(S) || !valid(K)) {
      app.innerHTML = '<p class="empty">ページのリンクが正しくありません。LINEのメニューのボタンのリンクを設定し直してください。</p>';
      return;
    }
    window.scrollTo(0, 0);
    const p = pageName();
    if (p === 'shop') return shopPage();
    if (p === 'help') return helpPage();
    if (p === 'chores' || p === 'chores-routines') return choresPage(p);
    if (p === 'chores-stats') return choreStatsPage();
    return homePages(p);
  }
  window.addEventListener('hashchange', route);

  // ===== プリント・ピアノ =====
  let home = cached('home');

  function homePages(p) {
    const draw = () => {
      if (!home) { app.innerHTML = '<p class="empty">読み込み中…</p>'; return; }
      app.innerHTML = p === 'past-print' ? pastPrints() : p === 'past-piano' ? pastPiano() : homeTop();
    };
    draw();
    status('更新中…');
    api('home').then(d => { home = d; remember('home', d); if (['home', 'past-print', 'past-piano'].includes(pageName())) draw(); status(''); })
      .catch(e => status('更新できませんでした：' + e.message));
  }

  function printCard(x, latest) {
    const period = x.period ? '対象 ' + x.period.replace(/\d{4}-/g, '').replace(/-/g, '/') : '発行 ' + x.issued;
    return '<a class="card' + (latest ? ' latest' : '') + '" href="' + esc(x.url) + '">' +
      '<div class="num">' + esc(x.number) + (latest ? ' <span class="badge">最新</span>' : '') + '</div>' +
      '<div class="title">' + esc(x.title) + '</div><div class="meta">' + esc(period) + '</div></a>';
  }
  function pianoCard(x, latest, timeOnly) {
    return '<a class="card' + (latest ? ' latest' : '') + '" href="' + esc(x.url) + '"><div class="num">' +
      esc((timeOnly ? '' : md(x.day) + ' ') + hm(x.at)) + (latest ? ' <span class="badge">最新</span>' : '') + '</div></a>';
  }

  function homeTop() {
    const prints = home.prints || [], piano = home.piano || [];
    const day = piano.length ? piano[0].day : null;
    const latestPiano = piano.filter(x => x.day === day);
    return '<h1>📄 最新のプリント</h1>' +
      (prints.length ? printCard(prints[0], true) : '<p class="empty">まだプリントがありません。</p>') +
      (prints.length > 1 ? '<a class="more" href="' + link('past-print') + '">過去の一覧（' + (prints.length - 1) + '件）›</a>' : '') +
      '<h1 class="sec">🎹 ピアノの宿題</h1>' +
      (latestPiano.length ? latestPiano.map((x, i) => pianoCard(x, i === 0)).join('') : '<p class="empty">まだありません。メニューの「ピアノ」を押してから写真を送ると保存されます。</p>') +
      (piano.length > latestPiano.length ? '<a class="more" href="' + link('past-piano') + '">過去の一覧（' + (piano.length - latestPiano.length) + '枚）›</a>' : '') +
      '<a class="navlink" href="' + link('chores') + '">🧹 家事リスト<span>›</span></a>' +
      '<a class="helplink" href="' + link('help') + '">❓ 使い方</a>';
  }

  function pastPrints() {
    const prints = (home.prints || []).slice(1);
    return '<a class="back" href="' + link('home') + '">‹ もどる</a><h1>📄 プリント（過去）</h1>' +
      (prints.length ? prints.map(x => printCard(x, false)).join('') : '<p class="empty">過去のプリントはありません。</p>');
  }

  function pastPiano() {
    const piano = home.piano || [];
    const latest = piano.length ? piano[0].day : null;
    const past = piano.filter(x => x.day !== latest);
    const days = [];
    past.forEach(x => { let g = days.find(d => d.day === x.day); if (!g) days.push(g = { day: x.day, list: [] }); g.list.push(x); });
    return '<a class="back" href="' + link('home') + '">‹ もどる</a><h1>🎹 ピアノの宿題（過去）</h1>' +
      (days.length ? days.map(g => '<h2>' + esc(md(g.day)) + '</h2>' + g.list.map(x => pianoCard(x, false, true)).join('')).join('') : '<p class="empty">過去の分はありません。</p>');
  }

  // ===== 買い物リスト =====
  let shop = cached('shop');
  let seq = 0, editing = false, target = null, origIcon = '';
  const norm = s => String(s).replace(/[\s　]/g, '');

  function shopPage() {
    app.innerHTML =
      '<a class="back" href="' + link('home') + '">‹ プリント・ピアノ</a><h1>🛒 買い物リスト</h1>' +
      '<div id="list"><p class="empty">読み込み中…</p></div>' +
      '<h2 id="doneHead" style="display:none">✓ 買った物</h2><div id="done"></div>' +
      '<div id="addArea">' +
      '<div class="addhead"><h2>＋ 追加する</h2><button class="editbtn" id="editBtn">✏️ 編集</button></div>' +
      '<div class="editnote">直したいボタンをタップしてください。終わったら「完了」を押します。</div>' +
      '<div class="panel" id="panel"><b id="panelTitle"></b>' +
      '<div class="row"><input id="eIcon" class="icon" placeholder="自動" maxlength="4"><input id="eName"><select id="eCat"></select></div>' +
      '<div class="row"><button class="save" id="eSave">保存</button><button class="hide" id="eHide">このボタンを消す</button><button class="cancel" id="eCancel">やめる</button></div></div>' +
      '<div class="add"><input id="name" placeholder="ほかの物を入力" enterkeyhint="done"><select id="cat"></select><button id="addBtn">追加</button></div>' +
      '<div id="favs"></div></div>';
    editing = false;
    bindShop();
    if (shop) renderShop();
    status('更新中…');
    api('shop').then(d => applyShop(d, 0)).catch(e => status('更新できませんでした：' + e.message));
  }

  // 返ってきた最新の状態を反映する（あとから送った操作の結果だけを使い、古い結果で上書きしない）
  function applyShop(d, mySeq) {
    if (mySeq !== seq) return;
    shop = Object.assign({ guess: shop && shop.guess }, d);
    remember('shop', shop);
    if (pageName() === 'shop') renderShop();
    status('');
  }
  function send(name, params) {
    const my = ++seq;
    status('保存中…');
    api(name, params).then(d => applyShop(d, my)).catch(e => status('エラー：' + e.message));
  }

  function renderShop() {
    if (!$('list')) return;
    const catIcon = n => (shop.groups.find(g => g.name === n) || {}).icon || '';
    const todo = shop.items.filter(x => !x.done), done = shop.items.filter(x => x.done);
    const row = x => '<div class="item' + (x.done ? ' done' : '') + '" data-id="' + esc(x.id) + '"><div class="box">' + (x.done ? '✓' : '') +
      '</div><div class="name">' + (x.icon ? x.icon + ' ' : '') + esc(x.name) + '</div><button class="del" data-del="' + esc(x.id) + '">×</button></div>';
    $('list').innerHTML = todo.length
      ? shop.categories.map(c => { const xs = todo.filter(x => x.cat === c); return xs.length ? '<h3>' + catIcon(c) + ' ' + esc(c) + '</h3>' + xs.map(row).join('') : ''; }).join('')
      : '<p class="empty">リストは空です。下のボタンから追加してください。</p>';
    $('done').innerHTML = done.map(row).join('');
    $('doneHead').style.display = done.length ? '' : 'none';
    const onList = new Set(todo.map(x => norm(x.name)));
    $('favs').innerHTML = shop.groups.filter(g => g.items.length).map(g =>
      '<h3>' + g.icon + ' ' + esc(g.name) + '</h3><div class="grid">' + g.items.map(f =>
        '<button class="fav' + (onList.has(norm(f.name)) ? ' on' : '') + '" data-name="' + esc(f.name) + '" data-cat="' + esc(g.name) + '">' +
        '<span class="i">' + (f.icon || '') + '</span><span class="t">' + esc(f.name) + '</span></button>').join('') + '</div>').join('');
    if (!$('cat').options.length) $('cat').innerHTML = shop.categories.map(c => '<option>' + esc(c) + '</option>').join('');
  }

  function bindShop() {
    const addLocal = (name, cat) => { shop.items.push({ id: 'tmp' + Date.now(), name, cat, icon: '', done: false }); renderShop(); };
    app.onclick = e => {
      if (!shop) return;
      const del = e.target.closest('[data-del]');
      if (del) { shop.items = shop.items.filter(x => x.id !== del.dataset.del); renderShop(); return send('shopRemove', { id: del.dataset.del }); }
      const item = e.target.closest('.item');
      if (item) { const x = shop.items.find(y => y.id === item.dataset.id); if (x) { x.done = !x.done; renderShop(); } return send('shopToggle', { id: item.dataset.id }); }
      const fav = e.target.closest('.fav');
      if (fav && editing) return openPanel(fav.dataset.name, fav.dataset.cat, fav.querySelector('.i').textContent);
      if (fav && !fav.classList.contains('on')) { addLocal(fav.dataset.name, fav.dataset.cat); return send('shopAdd', { name: fav.dataset.name }); }
    };
    const addTyped = () => {
      const v = $('name').value.trim(); if (!v || !shop) return;
      const c = $('cat').value; $('name').value = ''; addLocal(v, c); send('shopAdd', { name: v, cat: c });
    };
    $('addBtn').onclick = addTyped;
    $('name').onkeydown = e => { if (e.key === 'Enter') addTyped(); };
    // 入力中の品物から種類を推測して選んでおく（変えることもできる）
    $('name').oninput = () => {
      const g = ((shop && shop.guess) || []).find(([, re]) => new RegExp(re).test($('name').value));
      $('cat').value = g ? g[0] : '学用品・その他';
    };
    $('editBtn').onclick = () => {
      editing = !editing;
      $('addArea').classList.toggle('editing', editing);
      $('editBtn').textContent = editing ? '完了' : '✏️ 編集';
      closePanel();
    };
    $('eSave').onclick = () => {
      if (!target) return;
      const icon = $('eIcon').value.trim();
      const params = { old: target, name: $('eName').value.trim(), cat: $('eCat').value };
      if (icon !== origIcon) params.icon = icon;  // 変えていなければ送らない（空にしたら自動で付け直し）
      send('shopEdit', params); closePanel();
    };
    $('eHide').onclick = () => {
      if (!target) return;
      shop.groups.forEach(g => { g.items = g.items.filter(f => f.name !== target); }); renderShop();
      send('shopHide', { name: target }); closePanel();
    };
    $('eCancel').onclick = closePanel;
  }
  function openPanel(name, cat, icon) {
    target = name; origIcon = icon || '';
    $('panelTitle').textContent = '「' + name + '」を編集';
    $('eIcon').value = origIcon; $('eName').value = name;
    $('eCat').innerHTML = shop.categories.map(c => '<option' + (c === cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
    $('panel').classList.add('show');
    $('panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function closePanel() { target = null; const p = $('panel'); if (p) p.classList.remove('show'); }

  // ===== 家事リスト =====
  // リスト（p=chores）・ルーティン（p=chores-routines）・集計（p=chores-stats）
  // 画面からは誰が開いているか分からないので、最初に「自分」を選んでもらい、この端末に覚えておく
  let chores = cached('chores');
  let cseq = 0, picking = null, editing2 = null;
  const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
  const WDS = '日月火水木金土';
  const me = () => { const v = store.get('fb_me'); return chores && chores.members.some(m => m.id === v) ? v : null; };
  const nameOf = (id, members) => id === 'both' ? '2人で' : ((members || chores.members).find(m => m.id === id) || {}).name || '（不明）';
  const pts = n => (Math.round(n * 10) / 10) + '点';
  const ptsOpts = sel => [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + '点</option>').join('');
  const catOpts = sel => chores.categories.map(c => '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  const TEMPLATES = [
    { name: '食器洗い', period: '毎日', count: 3, points: 2, cat: '料理・片付け' },
    { name: '夕食づくり', period: '毎日', count: 1, points: 4, cat: '料理・片付け' },
    { name: '洗濯', period: '毎日', count: 1, points: 2, cat: '洗濯' },
    { name: '洗濯物をたたむ', period: '毎日', count: 1, points: 2, cat: '洗濯' },
    { name: '風呂掃除', period: '毎日', count: 1, points: 2, cat: '掃除' },
    { name: '寝かしつけ', period: '毎日', count: 1, points: 3, cat: '育児' },
    { name: '学校・保育園の準備', period: '毎日', count: 1, points: 2, cat: '育児' },
    { name: 'ゴミ出し', period: '毎週', when: '', count: 1, points: 1, cat: '掃除' },
    { name: '掃除機', period: '毎週', when: '土', count: 1, points: 3, cat: '掃除' },
    { name: 'トイレ掃除', period: '毎週', when: '土', count: 1, points: 2, cat: '掃除' },
    { name: 'シーツ交換', period: '間隔', when: '14', count: 1, points: 2, cat: '洗濯' },
    { name: '換気扇の掃除', period: '間隔', when: '90', count: 1, points: 4, cat: '掃除' },
  ];

  function periodLabel(r) {
    const n = r.count > 1 ? '・1日' + r.count + '回' : '';
    if (r.period === '毎週') return '毎週 ' + (r.when ? r.when.split(',').join('・') : '（曜日なし）') + n;
    if (r.period === '毎月') return '毎月 ' + (r.when ? r.when.split(',').map(x => x === '末' ? '末日' : x + '日').join('・') : '') + n;
    if (r.period === '間隔') return (r.when || '?') + '日ごと' + n;
    return '毎日' + (r.count > 1 ? ' ' + r.count + '回' : '');
  }

  function choreHead(p) {
    const t = (q, label) => '<a class="tab' + (p === q ? ' on' : '') + '" href="' + link(q) + '">' + label + '</a>';
    return '<a class="back" href="' + link('home') + '">‹ プリント・ピアノ</a><h1>🧹 家事リスト</h1>' +
      '<div class="tabs">' + t('chores', '📋 リスト') + t('chores-routines', '🔁 ルーティン') + t('chores-stats', '📊 集計') + '</div>';
  }

  function choresPage(p) {
    picking = null; editing2 = null;
    app.innerHTML = choreHead(p) + '<div id="cbody"><p class="empty">読み込み中…</p></div>';
    bindChores();
    if (chores) renderChores();
    status('更新中…');
    api('chores').then(d => applyChores(d, 0)).catch(e => status('更新できませんでした：' + e.message));
  }

  function applyChores(d, my) {
    if (my !== cseq) return;
    chores = d; remember('chores', d);
    if (['chores', 'chores-routines'].includes(pageName())) renderChores();
    status('');
  }
  function csend(name, params) {
    const my = ++cseq;
    status('保存中…');
    api(name, params).then(d => applyChores(d, my)).catch(e => status('エラー：' + e.message));
  }

  function renderChores() {
    const body = $('cbody'); if (!body || !chores) return;
    body.innerHTML = pageName() === 'chores-routines' ? routinesHtml() : choreListHtml();
  }

  function whoAmIHtml() {
    return '<div class="whoami"><b>👤 あなたはどちらですか？</b><p>やった人を記録するために使います（この端末に覚えておきます）。</p><div class="pick">' +
      chores.members.map((m, i) => '<button data-me="' + esc(m.id) + '" style="--c:' + COLORS[i % 4] + '">' + esc(m.name) + '</button>').join('') + '</div></div>';
  }

  function choreListHtml() {
    if (!me()) return whoAmIHtml();
    const mine = me();
    const others = chores.members.filter(m => m.id !== mine);
    const row = x => {
      const open = picking === x.id;
      return '<div class="citem' + (open ? ' open' : '') + '" data-cid="' + esc(x.id) + '"><div class="box"></div><div class="name">' + esc(x.name) +
        (x.since ? ' <span class="since">' + x.since + '日前から</span>' : '') + '</div><span class="pt">' + x.points + '点</span>' +
        '<button class="del" data-cdel="' + esc(x.id) + '" aria-label="やらずに消す">×</button></div>' +
        (open ? '<div class="whopick"><span>だれがやった？</span><div class="pick">' +
          '<button data-who="' + esc(mine) + '" style="--c:' + COLORS[chores.members.findIndex(m => m.id === mine) % 4] + '">自分</button>' +
          others.map(m => '<button data-who="' + esc(m.id) + '" style="--c:' + COLORS[chores.members.indexOf(m) % 4] + '">' + esc(m.name) + '</button>').join('') +
          '<button data-who="both" style="--c:#06c755">' + (chores.members.length > 2 ? 'みんなで' : '2人で') + '</button>' +
          '<button class="no" data-who="">やめる</button></div></div>' : '');
    };
    const cats = chores.categories;
    const todo = chores.items;
    return '<div class="me">👤 ' + esc(nameOf(mine)) + 'として記録します <button class="link" data-reme="1">変える</button></div>' +
      (todo.length ? todo.map(row).join('') : '<p class="empty">残っている家事はありません 🎉</p>') +
      (chores.done.length ? '<h2>✓ 終わった家事（' + 12 + '時間以内）</h2>' + chores.done.map(x =>
        '<div class="citem done"><div class="box">✓</div><div class="name">' + esc(x.name) + ' <span class="by">' + esc(nameOf(x.by)) + '</span></div>' +
        '<span class="pt">' + x.points + '点</span><button class="undo" data-undo="' + esc(x.id) + '">取り消す</button></div>').join('') : '') +
      '<h2>＋ 家事を追加する</h2><div class="add chadd"><input id="cname" placeholder="例：網戸を洗う" enterkeyhint="done">' +
      '<select id="cpts">' + ptsOpts(2) + '</select></div><div class="add"><select id="ccat">' + catOpts(cats[cats.length - 1]) + '</select>' +
      '<button id="caddBtn">追加</button></div>' +
      '<p class="note">毎日・毎週などの決まった家事は「🔁 ルーティン」に登録すると、自動でリストに入ります。</p>';
  }

  function routinesHtml() {
    const rs = chores.routines;
    const card = r => '<div class="rcard' + (r.stopped ? ' stopped' : '') + '" data-rid="' + esc(r.id) + '"><div class="name">' + esc(r.name) +
      (r.stopped ? ' <span class="since">停止中</span>' : '') + '</div><div class="meta">' + esc(periodLabel(r)) + '・' + r.points + '点・' + esc(r.cat) + '</div></div>';
    return (editing2 ? routineForm(editing2) : '') +
      (rs.length ? rs.map(r => editing2 && editing2.id === r.id ? '' : card(r)).join('') : '<p class="empty">まだルーティンがありません。</p>') +
      (editing2 && !editing2.id ? '' : '<button class="newbtn" data-rnew="1">＋ ルーティンを追加</button>' +
        '<h3>よくある家事から追加</h3><div class="chips">' +
        TEMPLATES.filter(t => !rs.some(r => r.name === t.name)).map((t, i) => '<button class="chip" data-tpl="' + TEMPLATES.indexOf(t) + '">' + esc(t.name) + '</button>').join('') + '</div>') +
      '<p class="note">やる日が来ると朝4時の区切りで自動でリストに入ります。前の分がまだ残っているときは追加しません（いつも1つだけ）。点数は1〜5点で、家事の重さの目安です。夫婦で相談して決めるのがおすすめです。</p>';
  }

  function routineForm(r) {
    const wds = (r.when || '').split(',');
    return '<div class="panel show rform"><b>' + (r.id ? '「' + esc(r.name) + '」を編集' : 'ルーティンを追加') + '</b>' +
      '<label>家事の名前<input id="rname" value="' + esc(r.name || '') + '" placeholder="例：風呂掃除"></label>' +
      '<label>くり返し<select id="rperiod">' + [['毎日', '毎日'], ['毎週', '毎週（曜日）'], ['毎月', '毎月（日にち）'], ['間隔', '〇日ごと']].map(([v, l]) =>
        '<option value="' + v + '"' + (r.period === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '<div class="when" data-for="毎週"' + (r.period === '毎週' ? '' : ' hidden') + '><div class="wds">' + WDS.split('').map(w =>
        '<button class="wd' + (r.period === '毎週' && wds.includes(w) ? ' on' : '') + '" data-wd="' + w + '">' + w + '</button>').join('') + '</div></div>' +
      '<label class="when" data-for="毎月"' + (r.period === '毎月' ? '' : ' hidden') + '>日にち（「1,15」「末」など）<input id="rmonth" inputmode="text" value="' + esc(r.period === '毎月' ? r.when || '' : '') + '" placeholder="例：1,15"></label>' +
      '<label class="when" data-for="間隔"' + (r.period === '間隔' ? '' : ' hidden') + '>何日ごと<input id="rdays" type="number" min="1" max="366" inputmode="numeric" value="' + esc(r.period === '間隔' ? r.when || '' : '') + '" placeholder="例：14"></label>' +
      '<div class="row3"><label>やる日の回数<select id="rcount">' + [1, 2, 3, 4, 5, 6].map(n => '<option' + (n === (r.count || 1) ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
      '<label>点数<select id="rpts">' + ptsOpts(r.points || 2) + '</select></label>' +
      '<label>種類<select id="rcat">' + catOpts(r.cat || chores.categories[0]) + '</select></label></div>' +
      '<p class="note">回数を2以上にすると「（1回目）」「（2回目）」…に分かれ、回ごとに1つだけ入ります。</p>' +
      '<div class="row"><button class="save" data-rsave="1">保存</button>' +
      (r.id ? '<button class="cancel" data-rstop="' + (r.stopped ? '0' : '1') + '">' + (r.stopped ? '再開する' : '止める') + '</button><button class="hide" data-rdel="1">消す</button>' : '') +
      '<button class="cancel" data-rcancel="1">やめる</button></div></div>';
  }

  function bindChores() {
    app.onclick = e => {
      if (!chores) return;
      const t = sel => e.target.closest(sel);
      let b;
      if ((b = t('[data-me]'))) { store.set('fb_me', b.dataset.me); return renderChores(); }
      if (t('[data-reme]')) { store.set('fb_me', ''); return renderChores(); }
      if ((b = t('[data-cdel]'))) {
        if (!confirm('やらずにリストから消しますか？（記録には残りません）')) return;
        chores.items = chores.items.filter(x => x.id !== b.dataset.cdel); picking = null; renderChores();
        return csend('choreRemove', { id: b.dataset.cdel });
      }
      if ((b = t('[data-who]'))) {
        const who = b.dataset.who, id = picking;
        picking = null;
        if (!who || !id) return renderChores();
        const x = chores.items.find(y => y.id === id);
        chores.items = chores.items.filter(y => y.id !== id);
        if (x) chores.done.unshift({ id: 'tmp' + Date.now(), name: x.name, points: x.points, by: who, at: Date.now() });
        renderChores();
        return csend('choreDone', { id: id, who: who, by: me() });
      }
      if ((b = t('[data-undo]'))) {
        if (/^tmp/.test(b.dataset.undo)) return;
        chores.done = chores.done.filter(x => x.id !== b.dataset.undo); renderChores();
        return csend('choreUndo', { id: b.dataset.undo });
      }
      if ((b = t('.citem:not(.done)'))) { picking = picking === b.dataset.cid ? null : b.dataset.cid; return renderChores(); }
      if (t('#caddBtn')) return addChore();
      // ルーティン
      if (t('[data-rnew]')) { editing2 = { name: '', period: '毎日', count: 1, points: 2, cat: chores.categories[0] }; renderChores(); return window.scrollTo(0, 0); }
      if ((b = t('[data-tpl]'))) { editing2 = Object.assign({}, TEMPLATES[+b.dataset.tpl]); renderChores(); return window.scrollTo(0, 0); }
      if ((b = t('.rcard'))) { editing2 = Object.assign({}, chores.routines.find(r => r.id === b.dataset.rid)); renderChores(); return window.scrollTo(0, 0); }
      if ((b = t('[data-wd]'))) { b.classList.toggle('on'); return; }
      if (t('[data-rcancel]')) { editing2 = null; return renderChores(); }
      if (t('[data-rsave]')) return saveRoutine();
      if ((b = t('[data-rstop]'))) { const id = editing2.id; editing2 = null; renderChores(); return csend('routineStop', { id: id, stop: b.dataset.rstop }); }
      if (t('[data-rdel]')) {
        if (!confirm('「' + editing2.name + '」のルーティンを消しますか？（今リストにある分と、これまでの記録は残ります）')) return;
        const id = editing2.id; chores.routines = chores.routines.filter(r => r.id !== id); editing2 = null; renderChores();
        return csend('routineDelete', { id: id });
      }
    };
    app.onchange = e => {
      if (e.target.id !== 'rperiod') return;
      app.querySelectorAll('.when').forEach(el => { el.hidden = el.dataset.for !== e.target.value; });
    };
    app.onkeydown = e => { if (e.target.id === 'cname' && e.key === 'Enter') addChore(); };
  }

  function addChore() {
    const v = $('cname').value.trim(); if (!v) return;
    const p = +$('cpts').value, c = $('ccat').value;
    $('cname').value = '';
    chores.items.push({ id: 'tmp' + Date.now(), name: v, routine: false, points: p, cat: c, since: 0 });
    renderChores();
    csend('choreAdd', { name: v, points: p, cat: c, by: me() });
  }

  function saveRoutine() {
    const period = $('rperiod').value;
    const when = period === '毎週' ? Array.from(app.querySelectorAll('.wd.on')).map(b => b.dataset.wd).join(',')
      : period === '毎月' ? $('rmonth').value.trim() : period === '間隔' ? $('rdays').value.trim() : '';
    const name = $('rname').value.trim();
    if (!name) return status('家事の名前を入れてください');
    if (period !== '毎日' && !when) return status(period === '毎週' ? '曜日を選んでください' : period === '毎月' ? '日にちを入れてください' : '何日ごとかを入れてください');
    const params = { id: editing2.id || '', name: name, period: period, when: when, count: $('rcount').value, points: $('rpts').value, cat: $('rcat').value };
    editing2 = null; renderChores();
    csend('routineSave', params);
  }

  // ----- 集計 -----
  let cstats = cached('choreStats');

  function choreStatsPage() {
    app.innerHTML = choreHead('chores-stats') + '<div id="cbody"><p class="empty">読み込み中…</p></div>';
    app.onclick = null; app.onchange = null; app.onkeydown = null;
    if (cstats) renderStats();
    status('更新中…');
    api('choreStats', { weeks: 8 }).then(d => { cstats = d; remember('choreStats', d); if (pageName() === 'chores-stats') renderStats(); status(''); })
      .catch(e => status('更新できませんでした：' + e.message));
  }

  function renderStats() {
    const body = $('cbody'); if (!body) return;
    const s = cstats, ms = s.members;
    const sum = o => ms.reduce((a, m) => a + (o[m.id] || 0), 0);
    const color = i => COLORS[i % 4];
    // 積み上げの横棒。scale を渡すと長さも比べられる（なければ100%の割合）
    const bar = (o, scale) => {
      const all = sum(o);
      if (!all) return '<div class="bar empty"></div>';
      const width = scale ? Math.max(all / scale * 100, 4) : 100;
      return '<div class="bar" style="width:' + width + '%">' + ms.map((m, i) => {
        const v = o[m.id] || 0; if (!v) return '';
        return '<span style="width:' + (v / all * 100) + '%;background:' + color(i) + '">' + (v / all >= 0.18 ? Math.round(v) : '') + '</span>';
      }).join('') + '</div>';
    };
    const legend = '<div class="legend">' + ms.map((m, i) => '<span><i style="background:' + color(i) + '"></i>' + esc(m.name) + '</span>').join('') +
      '<span class="lnote">「2人で」は半分ずつ</span></div>';
    const summary = (title, o, n) => {
      const all = sum(o);
      return '<div class="scard"><div class="h">' + title + '</div>' + bar(o) +
        '<div class="nums">' + ms.map((m, i) => '<div><i style="background:' + color(i) + '"></i>' + esc(m.name) + '<b>' + pts(o[m.id] || 0) + '</b>' +
          (all ? '<small>' + Math.round((o[m.id] || 0) / all * 100) + '%' + (n ? '・' + Math.round(n[m.id] || 0) + '件' : '') + '</small>' : '') + '</div>').join('') + '</div></div>';
    };
    const cur = s.weeks[s.weeks.length - 1], prev = s.weeks[s.weeks.length - 2];
    const maxWeek = Math.max(1, ...s.weeks.map(w => sum(w.pts)));
    const mdS = d => { const [, m, dd] = d.split('-').map(Number); return m + '/' + dd; };
    const total30 = sum(s.recent.pts);
    if (!total30 && !sum(cur.pts)) {
      body.innerHTML = legend + '<p class="empty">まだ記録がありません。リストの家事をタップして「だれがやった？」を選ぶと、ここに集計されます。</p>';
      return;
    }
    const maxCat = Math.max(1, ...s.cats.map(c => sum(c.pts)));
    const maxCh = Math.max(1, ...s.chores.map(c => sum(c.pts)));
    body.innerHTML = legend +
      summary('今週（' + mdS(cur.start) + '〜）', cur.pts, cur.n) +
      (prev && sum(prev.pts) ? summary('先週', prev.pts, prev.n) : '') +
      summary('直近30日', s.recent.pts, s.recent.n) +
      '<h2>週ごとの推移</h2><div class="scard">' + s.weeks.map(w => '<div class="srow"><span class="lab">' + mdS(w.start) + '〜</span>' +
        '<div class="track">' + bar(w.pts, maxWeek) + '</div><span class="tot">' + Math.round(sum(w.pts)) + '</span></div>').join('') + '</div>' +
      (s.cats.length ? '<h2>種類ごと（直近30日）</h2><div class="scard">' + s.cats.map(c => '<div class="srow"><span class="lab">' + esc(c.name) + '</span>' +
        '<div class="track">' + bar(c.pts, maxCat) + '</div><span class="tot">' + Math.round(sum(c.pts)) + '</span></div>').join('') + '</div>' : '') +
      (s.chores.length ? '<h2>家事ごと（直近30日）</h2><div class="scard">' + s.chores.map(c => '<div class="srow"><span class="lab">' + esc(c.name) + '</span>' +
        '<div class="track">' + bar(c.pts, maxCh) + '</div><span class="tot">' + Math.round(sum(c.pts)) + '</span></div>').join('') + '</div>' : '') +
      '<p class="note">棒の中の数字は点数です。点数は家事の重さの目安なので、合わないと思ったら「🔁 ルーティン」で直してください。</p>';
  }

  // ===== 使い方 =====
  function helpPage() {
    const sec = (icon, title, body) => '<div class="help"><div class="h">' + icon + ' ' + title + '</div>' + body + '</div>';
    const ex = t => '<span class="ex">' + t + '</span>';
    app.innerHTML = '<a class="back" href="' + link('home') + '">‹ もどる</a><h1>❓ 家族Botの使い方</h1>' +
      '<p class="lead">LINEで写真を送ったり、画面下のボタンを押したりするだけで使えます。</p>' +
      sec('📄', '学校のプリントを読み取る',
        '<ol><li>届いたプリントの写真をLINEで送ります（PDFも可）。</li>' +
        '<li>3〜5分で、持ち物・宿題・時間割・締切・行事・下校時刻をまとめた結果が届きます（送った人にだけ届きます）。</li></ol>' +
        '<p>2つのAIで読み取って照らし合わせ、読みが分かれた所は別のAIが確認します。それでも確定できなかった所には <b>(?)</b> が付くので、プリントで確かめてください。</p>' +
        '<p class="tip">💡 明るい場所で、紙を平らにして真上から撮ると、読み間違いが減ります。1枚につき1回送れば十分です。</p>') +
      sec('🔔', '毎日の通知',
        '<ul><li><b>学校がある日</b>：下校時刻に「今日の宿題」と「明日の準備（持ち物・時間割・下校時刻・予定）」が届きます。</li>' +
        '<li><b>次の日が休みの日（金曜・連休前）</b>は届きません。</li>' +
        '<li><b>日曜・連休の最終日</b>：13:30に、次の登校日の準備が届きます。</li>' +
        '<li>締切が近い物（⚠️）、準備しておく物（🧰）もあわせて知らせます。</li></ul>' +
        '<p>今すぐ見たいときは、画面下の <b>🔔 通知</b> を押すか、' + ex('通知') + ' と送ります。</p>') +
      sec('🛒', '買い物リスト',
        '<ul><li>画面下の <b>🛒 買い物</b> で開きます。夫婦で同じリストを使います。</li>' +
        '<li>種類ごとのボタンをタップするとリストに入ります。ボタンにない物は入力して「追加」（次からボタンになります）。</li>' +
        '<li>お店では、リストの品物をタップすると「買った」になります。</li>' +
        '<li>リストに間違えて入れた物は「×」で消せます。</li>' +
        '<li>ボタンの名前や種類を直したいとき・いらないボタンを消したいときは、「＋ 追加する」の横の <b>✏️ 編集</b> を押してから、そのボタンをタップします（消したボタンは、同じ名前を入力して追加すれば戻ります）。アイコンもここで変えられます（空にして保存すると、自動で付け直します）。</li>' +
        '<li>新しく入力した物には、合う絵文字があれば自動でアイコンが付きます。</li>' +
        '<li>LINEで ' + ex('買う 牛乳') + ' と送っても追加できます（' + ex('買う 牛乳、卵') + ' でまとめて）。</li>' +
        '<li>プリントに買う必要がありそうな物があると、結果の下に「🛒」のボタンが出ます。タップするだけでリストに入ります。</li></ul>') +
      sec('🧹', '家事リスト',
        '<ul><li><b>📄 プリント</b> のページの下の「🧹 家事リスト」で開きます（LINEで ' + ex('家事') + ' と送っても、今のリストとページのリンクが届きます）。</li>' +
        '<li>終わった家事をタップして、<b>だれがやったか</b>（自分・相手・2人で）を選ぶとリストから消え、記録されます。間違えたら「終わった家事」の「取り消す」で戻せます。</li>' +
        '<li>やらずに消したいときは「×」（記録には残りません）。</li>' +
        '<li>毎日・毎週・毎月・〇日ごとの家事は <b>🔁 ルーティン</b> に登録すると、朝4時の区切りで自動でリストに入ります。前の分がまだ残っているときは追加しません（いつも1つだけ）。</li>' +
        '<li>1日に何回もする家事は回数を2以上にすると「（1回目）」「（2回目）」に分かれます。</li>' +
        '<li>家事には1〜5点の点数（重さ）があり、<b>📊 集計</b> で、どちらがどれだけやっているかを週ごと・種類ごと・家事ごとに見られます。毎週日曜の夜にもLINEでまとめが届きます。</li>' +
        '<li>LINEで ' + ex('家事 網戸洗い') + ' と送ると追加、' + ex('済 風呂掃除') + ' で自分がやったとして記録（' + ex('済 風呂掃除 2人で') + ' で2人で）。</li>' +
        '<li>初めて開いたときに「あなたはどちらですか？」と聞かれます。その端末で使う人を選んでください。</li></ul>') +
      sec('🎹', 'ピアノの宿題',
        '<ol><li>画面下の <b>🎹 ピアノ</b> を押します（または ' + ex('ピアノ') + ' と送ります）。</li>' +
        '<li>10分以内に写真を送ると、そのまま保存されます（読み取りはしません。何枚でも可）。</li></ol>' +
        '<p>保存した写真は、<b>📄 プリント</b> のページの「ピアノの宿題」から見られます。</p>') +
      sec('📂', '取り込んだプリントを見る',
        '<p>画面下の <b>📄 プリント</b> で、最新のプリントの写真が開けます。前の分は「過去の一覧」から見られます。</p>') +
      sec('✏️', '読み間違いを直す・覚えさせる',
        '<ul><li>' + ex('訂正 まちがい→ただしい') + '（例：' + ex('訂正 マスク（よび３つ）→マスク（ぶどう）') + '）と送ると直ります。次の読み取りからも参考にします。</li>' +
        '<li>' + ex('メモ 〇〇') + '（例：' + ex('メモ ぶどう・いちごは給食当番のグループ名') + '）と送ると覚えて、読み取りの参考にします。</li></ul>') +
      sec('💬', 'そのほか',
        '<ul><li>上のどれにも当たらない文字を送ると、AIと会話できます。</li>' +
        '<li>このページは ' + ex('使い方') + ' と送ると、いつでも開けます。</li>' +
        '<li>プリントを送ったのに結果が届かないときは ' + ex('再読み取り') + ' と送ると、読み取れていなかったプリントを読み直します（毎朝6時にも自動で確認します）。</li></ul>');
  }

  route();
})();
