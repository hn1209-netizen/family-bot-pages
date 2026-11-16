// 家族Bot のメニューから開くページ（プリント・ピアノ・買い物リスト・使い方）
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
        '<li>このページは ' + ex('使い方') + ' と送ると、いつでも開けます。</li></ul>');
  }

  route();
})();
