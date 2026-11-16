// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a per-protocol
// detail view with the model's own inputs and the protocol's farm plan, and a
// method section with the comparables table and a live model sandbox. No
// network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var BASE = {
    growthWeight: DATA.model.growth_weight,
    chainStep: DATA.model.chain_step,
    maturityFloor: DATA.model.maturity_floor
  };
  var state = {
    q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token',
    sort: 'implied', dir: -1, selected: null,
    sandbox: { growthWeight: BASE.growthWeight, chainStep: BASE.chainStep, maturityFloor: BASE.maturityFloor }
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 100) / 100).toFixed(2) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and the category multiple, and checks the number board.json
  // carries, so the page's code and the board's data are visibly the same
  // arithmetic. The sandbox moves the three weights and recomputes live.
  function impliedOf(row, w) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * w.growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = w.maturityFloor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * (1 - w.maturityFloor);
    var extra = Math.max(0, Math.min((row.chains || []).length - 1, m.chain_max_steps));
    var chainMult = 1 + extra * w.chainStep;
    // Stepwise, like the model: whole dollars at each step, so the sandbox
    // off its weights aside, this recomputes the board's number exactly.
    var base = Math.round(row.tvl_usd * row.comp_multiple);
    var afterGrowth = Math.round(base * growthMult);
    var afterMaturity = Math.round(afterGrowth * maturity);
    var implied = Math.max(1, Math.round(afterMaturity * chainMult));
    return { implied: implied, growthMult: growthMult, maturityMult: maturity, chainMult: chainMult };
  }
  function sandboxActive() {
    return state.sandbox.growthWeight !== BASE.growthWeight ||
      state.sandbox.chainStep !== BASE.chainStep ||
      state.sandbox.maturityFloor !== BASE.maturityFloor;
  }
  function shownValue(row) {
    return sandboxActive() ? impliedOf(row, state.sandbox).implied : row.implied_value_usd;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('gaming') >= 0 || c.indexOf('nft') >= 0) return 'Use $' + capital + ' to play or mint through ' + name + ' on ' + chain + ' and keep the assets.';
    if (c.indexOf('ai') >= 0 || c.indexOf('services') >= 0) return 'Spend $' + capital + " on " + name + "'s service on " + chain + ' and keep the receipt.';
    if (c.indexOf('payments') >= 0 || c.indexOf('paymaster') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(20, Math.round(capital / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + Math.max(20, Math.round(capital / 3)) + ' against the supply on ' + name + ', then repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + small + " through " + name + "'s main pool on " + chain + ' and add the proceeds back.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the hedge on ' + name + ' and open a fresh one half its size.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + small + ' back through ' + name + ' so both directions are on record.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Top up the position by $' + small + ' on ' + name + ' so the balance grows.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first market position on ' + name + ' and place a second one.';
    return 'Do one more on-chain action on ' + name + ', such as a swap, a vote or a deposit, so the wallet is not a single deposit.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + gas + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in stages and keep enough gas to exit.', cost: 'nothing but the log', time: '5 minutes to log, a week to unwind' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlist = true;
    if (params.get('tab') === 'live') state.tab = 'live';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  var watchlistSet = new Set(DATA.watchlist || []);

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlist && !watchlistSet.has(r.slug)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.comp_multiple; bv = b.comp_multiple; }
      else if (key === 'confidence') { av = a.confidence; bv = b.confidence; }
      else { av = shownValue(a); bv = shownValue(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('div', null,
      el('section', { class: 'lede' },
        el('div', null,
          el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
          el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' rankable pre-token protocols below that floor — every one the snapshot holds. Implied value is a model, not a promise.' })
        ),
        el('div', { class: 'facts' },
          el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
          el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
          el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
          el('div', { class: 'fact' }, el('span', { text: 'Global mcap / TVL' }), el('b', { text: fmtMult(DATA.global_median) }))
        )
      ),
      top ? el('div', { class: 'cover' },
        el('b', { text: '#1 ' + top.name + ' — ' }),
        el('span', { text: fmtUsd(top.implied_value_usd) + ' implied, ' + (top.category || 'Other') + ' on ' + (top.chains && top.chains.length ? top.chains[0] : 'an unnamed chain') + ', ' + fmtPct(top.change_7d) + ' in 7 days. Select any row for its model and farm plan.' })
      ) : null
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 12);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', class: 'sort-btn', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  // The radar screen: one SVG scatter of the whole board, log-log, TVL against
  // implied value. Right means more TVL, up means more implied value, bubble
  // size is age, colour is category, a gold ring is the watchlist. A dot is a
  // protocol: click it for its model and farm plan.
  var PALETTE = ['#f2b13d', '#5ea8ff', '#3ddc97', '#f26d6d', '#c792ea', '#4dd0e1', '#ffb74d', '#81c784', '#e57373', '#64b5f6'];
  function catColor(cat) {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var i = cats.indexOf(cat || 'Other');
    return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function jsMedian(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function scatterPanel() {
    var all = DATA.rows;
    var shown = rows();
    var W = 1160, H = 460, L = 72, R = 20, T = 18, B = 42;
    var minX = Math.min.apply(null, all.map(function (r) { return r.tvl_usd; }));
    var maxX = Math.max.apply(null, all.map(function (r) { return r.tvl_usd; }));
    var minY = Math.min.apply(null, all.map(function (r) { return r.implied_value_usd; }));
    var maxY = Math.max.apply(null, all.map(function (r) { return r.implied_value_usd; }));
    var x0 = Math.floor(Math.log10(Math.max(1, minX))), x1 = Math.ceil(Math.log10(Math.max(1, maxX)));
    var y0 = Math.floor(Math.log10(Math.max(1, minY))), y1 = Math.ceil(Math.log10(Math.max(1, maxY)));
    function X(v) { return L + (Math.log10(Math.max(1, v)) - x0) / (x1 - x0) * (W - L - R); }
    function Y(v) { return T + (1 - (Math.log10(Math.max(1, v)) - y0) / (y1 - y0)) * (H - T - B); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter plot of TVL against implied value for every pre-token protocol">';
    var p;
    for (p = x0; p <= x1; p++) {
      var gx = X(Math.pow(10, p));
      s += '<line x1="' + gx.toFixed(1) + '" y1="' + T + '" x2="' + gx.toFixed(1) + '" y2="' + (H - B) + '" stroke="#223350" stroke-width="1"/>';
      var lastTick = p === x1;
      s += '<text x="' + (lastTick ? W - 4 : gx).toFixed(1) + '" y="' + (H - 14) + '" fill="#8fa3bd" font-size="12" text-anchor="' + (lastTick ? 'end' : 'middle') + '">' + fmtUsd(Math.pow(10, p)) + '</text>';
    }
    for (p = y0; p <= y1; p++) {
      var gy = Y(Math.pow(10, p));
      s += '<line x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '" stroke="#223350" stroke-width="1"/>';
      s += '<text x="' + (L - 8) + '" y="' + (gy + 4).toFixed(1) + '" fill="#8fa3bd" font-size="12" text-anchor="end">' + fmtUsd(Math.pow(10, p)) + '</text>';
    }
    var medX = jsMedian(all.map(function (r) { return r.tvl_usd; }));
    var medY = jsMedian(all.map(function (r) { return r.implied_value_usd; }));
    s += '<line x1="' + X(medX).toFixed(1) + '" y1="' + T + '" x2="' + X(medX).toFixed(1) + '" y2="' + (H - B) + '" stroke="#f2b13d" stroke-width="1" stroke-dasharray="5 5" opacity="0.55"/>';
    s += '<line x1="' + L + '" y1="' + Y(medY).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(medY).toFixed(1) + '" stroke="#f2b13d" stroke-width="1" stroke-dasharray="5 5" opacity="0.55"/>';
    s += '<text x="' + (L + 4) + '" y="' + (T + 12) + '" fill="#8fa3bd" font-size="12">TVL (log) vs implied value (log) — dashed lines are the medians</text>';
    shown.forEach(function (r) {
      var age = r.age_days === null || r.age_days === undefined ? 365 : r.age_days;
      var rad = 3 + Math.min(Math.max(age, 0), 1095) / 1095 * 3.5;
      var wl = watchlistSet.has(r.slug);
      s += '<circle data-slug="' + esc(r.slug) + '" cx="' + X(r.tvl_usd).toFixed(1) + '" cy="' + Y(shownValue(r)).toFixed(1) + '" r="' + (wl ? rad + 1.5 : rad).toFixed(1) + '" fill="' + catColor(r.category) + '" fill-opacity="0.85"' + (wl ? ' stroke="#f2b13d" stroke-width="1.5"' : '') + '><title>' + esc(r.name) + ' — ' + fmtUsd(shownValue(r)) + ' implied, TVL ' + fmtUsd(r.tvl_usd) + '</title></circle>';
    });
    // The five strongest displayed rows, labelled where they fit: a label
    // that would collide with one already placed drops to the next offset.
    var labeled = shown.slice().sort(function (a, b) { return shownValue(b) - shownValue(a); }).slice(0, 5);
    var placed = [];
    labeled.forEach(function (r) {
      var text = '#' + r.rank + ' ' + r.name;
      var w = text.length * 6.8 + 4;
      var cx = X(r.tvl_usd);
      var anchorEnd = cx + 8 + w > W - R - 4;
      var tx = anchorEnd ? cx - 8 : cx + 8;
      var baseY = Y(shownValue(r)) - 6;
      var offsets = [0, 18, -18, 36, -36];
      for (var k = 0; k < offsets.length; k++) {
        var y = baseY + offsets[k];
        var box = { x: anchorEnd ? tx - w : tx, y: y - 11, w: w, h: 14 };
        var clash = placed.some(function (b) { return box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h; });
        if (!clash && y > T + 10 && y < H - B - 4) {
          placed.push(box);
          s += '<text x="' + tx.toFixed(1) + '" y="' + y.toFixed(1) + '" fill="#e9eff8" font-size="12" text-anchor="' + (anchorEnd ? 'end' : 'start') + '" pointer-events="none">' + esc(text) + '</text>';
          break;
        }
      }
    });
    s += '</svg>';
    var box = el('div', { class: 'scatter' });
    box.innerHTML = s;
    Array.prototype.forEach.call(box.querySelectorAll('circle[data-slug]'), function (c) {
      c.addEventListener('click', function () { openDetail(c.getAttribute('data-slug')); });
      c.style.cursor = 'pointer';
    });
    var caption = shown.length === all.length
      ? 'Every row at a glance. Right means more TVL, up means more implied value, bigger means older, gold ring means watchlist. Click a dot for its model and farm plan.'
      : 'Showing ' + shown.length + ' of ' + all.length + ' rows, on the whole board\u2019s axes. Right means more TVL, up means more implied value, bigger means older, gold ring means watchlist. Click a dot for its model and farm plan.';
    return el('section', { class: 'panel radar' },
      el('h2', { text: 'The radar screen' }),
      el('p', { class: 'sub', text: caption }),
      box
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { var v = shownValue(r); if (v > max) max = v; });
    if (!max) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badgeClass = r.rank === 1 ? 'rank-badge top1' : r.rank <= 3 ? 'rank-badge top3' : 'rank-badge';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: badgeClass, text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (watchlistSet.has(r.slug) ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.comp_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownValue(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownValue(r)) })
        )),
        el('td', { class: 'num' }, el('span', { class: 'conf' + (r.confidence >= 70 ? ' high' : r.confidence >= 40 ? ' mid' : ' low'), text: String(r.confidence) })),
        el('td', null, el('span', { class: 'status pre', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' + (sandboxActive() ? ' Sandbox weights active: values are exploratory, board.json keeps the submitted model.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Mcap / TVL'),
            sortHeader('implied', 'Implied value'),
            sortHeader('confidence', 'Confidence'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap-to-TVL ratios price it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    var topComps = DATA.comps.slice(0, 12);
    var sandbox = el('div', { class: 'sandbox' },
      el('div', { class: 'field' },
        el('label', { for: 'sb-growth', text: 'Growth weight: ' + state.sandbox.growthWeight.toFixed(2) }),
        el('input', { type: 'range', id: 'sb-growth', min: '0', max: '1', step: '0.05', value: String(state.sandbox.growthWeight), oninput: function (e) { state.sandbox.growthWeight = parseFloat(e.target.value); render(); } })
      ),
      el('div', { class: 'field' },
        el('label', { for: 'sb-chain', text: 'Chain bonus per extra chain: ' + (state.sandbox.chainStep * 100).toFixed(1) + '%' }),
        el('input', { type: 'range', id: 'sb-chain', min: '0', max: '0.06', step: '0.005', value: String(state.sandbox.chainStep), oninput: function (e) { state.sandbox.chainStep = parseFloat(e.target.value); render(); } })
      ),
      el('div', { class: 'field' },
        el('label', { for: 'sb-mat', text: 'Maturity floor: ' + state.sandbox.maturityFloor.toFixed(2) }),
        el('input', { type: 'range', id: 'sb-mat', min: '0.4', max: '0.8', step: '0.05', value: String(state.sandbox.maturityFloor), oninput: function (e) { state.sandbox.maturityFloor = parseFloat(e.target.value); render(); } })
      ),
      sandboxActive() ? el('button', { class: 'button', type: 'button', text: 'Reset to submitted model', onclick: function () { state.sandbox = { growthWeight: BASE.growthWeight, chainStep: BASE.chainStep, maturityFloor: BASE.maturityFloor }; render(); } }) : null,
      el('p', { class: 'sandbox-note', text: 'The sandbox only re-prices what you see here. board.json keeps the submitted model (' + DATA.model_version + '), so a verdict on the board is a verdict on the submitted numbers.' })
    );
    var compRows = topComps.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.count) }),
        el('td', { class: 'num', text: c.category_median === null ? 'n/a' : fmtMult(c.category_median) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      );
    });
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'Every row is priced off the market: its TVL times its category\u2019s market-cap-to-TVL multiple, taken from the live-token protocols that already trade in that category. Thin categories are shrunk toward the global multiple (weight n / (n + ' + m.shrink_k + ')), and every multiple is capped at ' + fmtMult(m.multiple_cap) + ' so one degenerate comp cannot price a whole category. Growth, age and chain breadth adjust that priced base. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x min(comps(category), ' + m.multiple_cap + ') x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.chain_max_steps + ') x ' + m.chain_step + ') )'
      ),
      el('p', { text: 'The multiples use circulating market cap, not fully diluted value, so the board is conservative by construction: a launch is usually priced on FDV, which is at least the circulating value. Multiples are quoted to four decimals and the waterfall rounds to whole dollars at each step, so this page recomputes every row\u2019s number exactly from the figures the row carries — open a row and the detail view shows the check. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The live-token protocols are set aside with their market caps shown — and their ratios price the board.' }),
      el('p', { text: 'Every row names the five live peers that price it — same category first, nearest by TVL — and carries a confidence score from 0 to 100: up to 40 points for how many live comps price its category, 30 for how tightly those comps\u2019 multiples agree, and 15 each for having its growth and its age on record. Open a row to see its peers, its waterfall and its confidence; the rank is always by implied value, the confidence says how much the price means.' }),
      el('table', { class: 'comps' },
        el('caption', { text: 'Category comparables: the market-cap-to-TVL multiples the board is priced on (best-covered categories).' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comps' }), el('th', { scope: 'col', text: 'Category median' }), el('th', { scope: 'col', text: 'Multiple used' }))),
        el('tbody', null, compRows)
      ),
      sandbox
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var check = impliedOf(row, BASE);
    var shown = impliedOf(row, state.sandbox);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (watchlistSet.has(row.slug) ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + row.comp_count + ' comps)' }), el('b', { class: 'num', text: fmtMult(row.comp_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(check.implied) + (check.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + (sandboxActive() ? ' Sandbox weights price it at ' + fmtUsd(shown.implied) + ' here.' : '') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'How the value builds up' }),
      el('div', { class: 'waterfall' },
        [['TVL x category multiple (' + fmtMult(row.comp_multiple) + ')', row.base_value_usd],
         ['x growth multiplier (' + String(row.growth_multiplier) + ')', row.after_growth_usd],
         ['x maturity multiplier (' + String(row.maturity_multiplier) + ')', row.after_maturity_usd],
         ['x chain multiplier (' + String(row.chain_multiplier) + ')', row.implied_value_usd]].map(function (step) {
          return el('div', { class: 'wf-row' },
            el('span', { class: 'wf-label', text: step[0] }),
            el('div', { class: 'wf-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((step[1] / Math.max(1, row.implied_value_usd)) * 100)) + '%' })),
            el('span', { class: 'num', text: fmtUsd(step[1]) })
          );
        })
      ),
      el('p', { class: 'sub', text: 'Each step is the snapshot\u2019s own figures: no step invents a number the snapshot does not carry.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Confidence: ' + row.confidence + ' / 100' }),
      el('p', { class: 'sub', text: 'Depth ' + row.confidence_depth + ' of 40 (' + row.comp_count + ' live comps price this category) · agreement ' + row.confidence_dispersion + ' of 30 (how tightly those comps\u2019 multiples agree) · records ' + row.confidence_completeness + ' of 30 (growth and age on file). A thin category or a missing figure costs points openly.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The peers that price it' }),
      el('p', { class: 'sub', text: 'The five live-token protocols nearest this one — same category first, nearest by TVL. Their multiples are the market this row is priced from.' }),
      el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Peer' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
        el('tbody', null, row.peers.map(function (peer) {
          return el('tr', null,
            el('td', { text: peer.name }),
            el('td', { class: 'num', text: fmtUsd(peer.tvl_usd) }),
            el('td', { class: 'num', text: fmtUsd(peer.mcap_usd) }),
            el('td', { class: 'num', text: fmtMult(peer.multiple) })
          );
        }))
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub', text: row.risk_note }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('p', { class: 'note', text: 'Farming a pre-token protocol is a bet that a token comes, not a promise that one does. Never pay to claim an airdrop, and never farm with money you need back.' }));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(scatterPanel());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(methodPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Implied values are this entry\u2019s own claim, priced from the snapshot\u2019s figures; they are not a prediction that a token is issued, or when.' }),
      el('p', { text: 'A protocol is shown as recording no token when its DefiLlama record carries no token — that record is not proof it has none.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
