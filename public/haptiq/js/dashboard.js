/* =========================================================
   Haptiq — dashboard
   ---------------------------------------------------------
   Data comes from window.HaptiqData.load() in js/data.js, which the
   brain page shares. Every field is optional; panels with no data show
   an empty state.
   ========================================================= */
(function () {
  'use strict';

  const esc = window.Haptiq.esc;
  const $ = (id) => document.getElementById(id);

  /* ---------- helpers ---------- */
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const empty = (msg) => '<p class="t-p" style="padding:24px 0;text-align:center">' + esc(msg) + '</p>';
  const icon = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>'
  };

  // Map a series into SVG points inside a box
  function scale(values, w, h, pad, min, max) {
    const lo = min != null ? min : Math.min.apply(null, values);
    const hi = max != null ? max : Math.max.apply(null, values);
    const span = hi - lo || 1;
    const step = values.length > 1 ? (w - pad.l - pad.r) / (values.length - 1) : 0;
    return values.map((v, i) => [pad.l + i * step, pad.t + (1 - (v - lo) / span) * (h - pad.t - pad.b)]);
  }
  const line = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

  function sparkline(values, color, dashed) {
    const pts = scale(values, 240, 40, { l: 2, r: 2, t: 4, b: 4 });
    return '<path d="' + line(pts) + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"' + (dashed ? ' stroke-dasharray="4 4"' : '') + '/>';
  }

  /* ---------- renderers ---------- */
  function renderHeader(d) {
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem('haptiq_user') || localStorage.getItem('haptiq_user') || 'null'); } catch (e) {}
    const name = (stored && stored.firstName) || (d.user && d.user.firstName) || 'there';
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = part + ', ' + name + '.';
    $('avatar').textContent = name.charAt(0).toUpperCase();

    const p = d.phase || {};
    const adaptive = (p.month || 1) >= 2;
    $('phaseEyebrow').textContent = 'Month ' + (p.month || 1) + ' · ' + (adaptive ? 'Adaptive stimulation' : 'Baseline');
    $('phaseLine').textContent = adaptive
      ? 'Each attack starts a session. Settings adjust after each pain check.'
      : 'Tracking only this month. Stimulation starts in month 2.';

    $('deviceList').innerHTML = (d.devices || []).map(x =>
      '<div><span class="dot' + (x.connected ? ' on' : '') + '"></span><span><strong>' + esc(x.name) + '</strong><br>' +
      (x.connected ? 'Connected' : 'Not connected') + (x.battery != null ? ' · ' + esc(x.battery) + '%' : '') + '</span></div>').join('');
    $('sampleBanner').hidden = !d.isSample;
  }

  function renderKpis(d) {
    const m = d.monthly || [];
    const cur = m[m.length - 1];
    const base = m[0];
    if (cur) {
      $('kpiDays').textContent = cur.days;
      $('kpiDaysTag').textContent = base && m.length > 1 ? (cur.days - base.days <= 0 ? '' : '+') + (cur.days - base.days) + ' vs baseline' : 'Baseline';
      $('kpiDaysSpark').innerHTML = '<svg viewBox="0 0 240 40" preserveAspectRatio="none">' + sparkline(m.map(x => x.days), '#AE9E91') + '</svg>';
    }
    const s = d.sessions || [];
    if (s.length) {
      const a2 = avg(s.map(x => x.after2h));
      const a0 = avg(s.map(x => x.start));
      $('kpiPain').innerHTML = a2.toFixed(1) + '<small>/ 10</small>';
      $('kpiPainDelta').textContent = 'From ' + a0.toFixed(1) + ' at session start';
    } else {
      $('kpiPainDelta').textContent = 'No sessions yet';
    }
    $('kpiSessions').textContent = s.length;
    $('kpiSessionsSub').textContent = s.length ? 'One per attack' : 'Starts in month 2';
    if (d.streakDays != null) {
      $('kpiStreak').innerHTML = d.streakDays + '<small>days</small>';
      $('kpiStreakSub').textContent = 'Daily check-ins in a row';
    }
  }

  function renderMonthly(d) {
    const m = d.monthly || [];
    const box = $('monthlyChart');
    if (!m.length) { box.innerHTML = empty('Your first month builds the baseline.'); return; }
    const W = 640, H = 260, pad = { l: 40, r: 24, t: 20, b: 34 };
    const max = Math.max(4, Math.ceil(Math.max.apply(null, m.map(x => x.days)) / 4) * 4);
    const pts = scale(m.map(x => x.days), W, H, pad, 0, max);
    const yOf = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    let grid = '';
    for (let v = 0; v <= max; v += max / 4) {
      grid += '<path d="M' + pad.l + ' ' + yOf(v).toFixed(1) + ' H' + (W - pad.r) + '" stroke="#7B7C90" stroke-opacity=".16"/>' +
              '<text x="' + (pad.l - 10) + '" y="' + (yOf(v) + 4).toFixed(1) + '" text-anchor="end" fill="#7B7C90" font-size="12">' + v + '</text>';
    }
    const baseY = yOf(m[0].days).toFixed(1);
    const area = line(pts) + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + yOf(0).toFixed(1) + ' L' + pts[0][0].toFixed(1) + ' ' + yOf(0).toFixed(1) + ' Z';
    const dots = pts.map((p, i) => {
      const last = i === pts.length - 1;
      return (last ? '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="16" fill="#E8D7BC" fill-opacity=".18" class="pulse"/>' : '') +
        '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (last ? 6 : 5) + '" fill="' + (last ? '#E8D7BC' : '#192136') + '" stroke="#AE9E91" stroke-width="2"/>' +
        '<text x="' + p[0].toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" fill="#7B7C90" font-size="12">' + esc(m[i].label) + (m[i].partial ? '*' : '') + '</text>';
    }).join('');
    box.innerHTML =
      '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Migraine days per month">' +
      '<defs><linearGradient id="mArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#AE9E91" stop-opacity=".32"/><stop offset="1" stop-color="#AE9E91" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<path d="M' + pad.l + ' ' + baseY + ' H' + (W - pad.r) + '" stroke="#7B7C90" stroke-width="1.5" stroke-dasharray="5 5"/>' +
      '<path d="' + area + '" fill="url(#mArea)"/>' +
      '<path d="' + line(pts) + '" fill="none" stroke="#E8D7BC" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + '</svg>' +
      (m[m.length - 1].partial ? '<p class="t-p" style="font-size:12px">* Month in progress.</p>' : '');
  }

  function renderToday(d) {
    const t = d.today || {};
    if (t.date) {
      const dt = new Date(t.date + 'T12:00:00');
      $('todayDate').textContent = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    const items = [
      { done: t.checkIn, ico: icon.list, title: 'Daily check-in', sub: 'Migraine today? About 1 minute.' },
      { done: t.trackingTask, ico: icon.eye, title: 'Tracking task', sub: 'With Neon glasses. 3–5 minutes.' },
      { done: t.voiceNote, ico: icon.mic, title: 'Voice note', sub: '30–60 seconds on how you feel.' }
    ];
    $('todayList').innerHTML = items.map(it =>
      '<div class="todo-item"><div class="ico">' + (it.done ? icon.check : it.ico) + '</div>' +
      '<div class="txt"><strong>' + it.title + '</strong><span>' + it.sub + '</span></div>' +
      '<span class="status ' + (it.done ? 'done' : 'todo') + '">' + (it.done ? 'Done' : 'To do') + '</span></div>'
    ).join('');
    const button = $('checkinBtn');
    button.classList.toggle('btn-p', !t.checkIn);
    button.classList.toggle('btn-s', !!t.checkIn);
    button.firstChild.textContent = t.checkIn ? 'Review today’s check-in ' : 'Today’s check-in ';
  }

  function renderCalendar(d) {
    const date = new Date((d.today && d.today.date || '') + 'T12:00:00');
    const today = Number.isNaN(date.getTime()) ? new Date() : date;
    const year = today.getFullYear(), month = today.getMonth();
    const todayNumber = today.getDate();
    const count = new Date(year, month + 1, 0).getDate();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const done = new Set(d.checkinDates || []);
    $('calendarMonth').textContent = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => '<span class="calendar-weekday">' + day + '</span>');
    for (let i = 0; i < offset; i++) cells.push('<span class="calendar-blank"></span>');
    for (let day = 1; day <= count; day++) {
      const key = [year, String(month + 1).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
      const checked = done.has(key);
      const current = day === todayNumber;
      cells.push('<span class="calendar-day' + (checked ? ' checked' : '') + (current ? ' current' : '') + (day > todayNumber ? ' future' : '') + '"' +
        (current ? ' aria-current="date"' : '') + ' aria-label="' + day + (checked ? ', checked in' : current ? ', today' : '') + '">' + day + '</span>');
    }
    $('calendarGrid').innerHTML = cells.join('');
  }

  function renderCheckin(d) {
    const saved = d.checkin;
    $('checkinPreviewNote').hidden = !d.isSample;
    $('checkinState').textContent = saved ? '✓ Checked in today · you can update it' : 'Ready for today’s check-in';
    $('checkinState').classList.toggle('complete', !!saved);
    $('saveCheckin').textContent = saved ? 'Update today’s check-in' : 'Save today’s check-in';
    if (!saved) return;
    const form = $('checkinForm');
    form.elements.migraine.value = saved.migraine ? 'yes' : 'no';
    form.elements.pain.value = saved.pain;
    $('painValue').textContent = saved.pain + ' / 10';
    for (const option of form.querySelectorAll('input[name="symptom"]')) {
      option.checked = (saved.symptoms || []).includes(option.value);
    }
  }

  function renderLastSession(d) {
    const s = d.sessions || [];
    const last = s[s.length - 1];
    if (!last) { $('lastSessionNote').textContent = 'Sessions start in month 2.'; return; }
    $('lastSessionDate').textContent = last.date;
    $('gaugeVal').textContent = last.after2h.toFixed(1);
    $('gaugeSub').textContent = 'pain at 2 h · from ' + last.start;
    $('lastSessionNote').textContent = 'Down ' + (last.start - last.after2h).toFixed(1) + ' points two hours after the session.';
    requestAnimationFrame(() => $('gaugeArc').setAttribute('stroke-dasharray', ((last.after2h / 10) * 351.9).toFixed(1) + ' 352'));
  }

  function renderSettings(d) {
    const list = d.settings || [];
    if (!list.length) { $('settingsList').innerHTML = empty('Settings appear after onboarding.'); return; }
    $('settingsList').innerHTML = list.map(s => {
      const pct = v => (((v - s.min) / (s.max - s.min)) * 100).toFixed(1);
      return '<div class="setrow"><div class="row"><span>' + esc(s.label) + '</span><span class="v">' + esc(s.value + ' ' + s.unit).replace(' %', '%') + '</span></div>' +
        '<div class="trk"><span class="fill" style="width:' + pct(s.value) + '%"></span><span class="lim" style="left:' + pct(s.limit) + '%"></span><span class="knob" style="left:' + pct(s.value) + '%"></span></div>' +
        '<div class="row" style="font-size:12px"><span>' + esc(s.min + ' ' + s.unit) + '</span><span>Limit ' + esc(s.limit + ' ' + s.unit) + '</span></div></div>';
    }).join('');
  }

  function renderPhase(d) {
    const p = d.phase || { month: 1, day: 1, daysInMonth: 30 };
    const n = p.daysInMonth || 30;
    $('phaseTitle').textContent = 'Month ' + p.month;
    $('phaseTag').textContent = 'Day ' + p.day + ' of ' + n;
    $('phaseGrid').style.gridTemplateColumns = 'repeat(' + n + ', minmax(0,1fr))';
    $('phaseGrid').innerHTML = Array.from({ length: n }, (_, i) => '<span class="' + (i + 1 < p.day ? 'done' : i + 1 === p.day ? 'today' : '') + '"></span>').join('');
    $('phaseNote').textContent = p.month >= 2
      ? 'Your doctor gets a summary at the end of the month.'
      : (n - p.day) + ' days until your baseline is done.';
  }

  function renderSessions(d) {
    const s = d.sessions || [];
    const box = $('sessionsChart');
    if (!s.length) { box.innerHTML = empty('No sessions yet. They start in month 2.'); return; }
    const W = 600, H = 240, pad = { l: 36, r: 12, t: 16, b: 32 };
    const yOf = v => pad.t + (1 - v / 10) * (H - pad.t - pad.b);
    const slot = (W - pad.l - pad.r) / s.length;
    const bw = Math.min(26, slot * 0.28);
    let g = '';
    [0, 5, 10].forEach(v => {
      g += '<path d="M' + pad.l + ' ' + yOf(v) + ' H' + (W - pad.r) + '" stroke="#7B7C90" stroke-opacity=".16"/><text x="' + (pad.l - 10) + '" y="' + (yOf(v) + 4) + '" text-anchor="end" fill="#7B7C90" font-size="12">' + v + '</text>';
    });
    s.forEach((x, i) => {
      const cx = pad.l + slot * i + slot / 2;
      g += '<rect x="' + (cx - bw - 3).toFixed(1) + '" y="' + yOf(x.start).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (yOf(0) - yOf(x.start)).toFixed(1) + '" rx="6" fill="#7B7C90" fill-opacity=".45"/>' +
           '<rect x="' + (cx + 3).toFixed(1) + '" y="' + yOf(x.after2h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (yOf(0) - yOf(x.after2h)).toFixed(1) + '" rx="6" fill="#E8D7BC"/>' +
           '<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" fill="#7B7C90" font-size="12">' + esc(x.date) + '</text>';
    });
    box.innerHTML = '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Pain at session start and 2 hours later">' + g + '</svg>';
  }

  function renderEye(d) {
    const sig = d.eyeSignals || [];
    if (!sig.length) { $('eyeSignals').innerHTML = empty('Complete the tracking task to see your eye signals.'); return; }
    $('eyeSignals').innerHTML = sig.map(s => {
      const all = s.attack.concat(s.other);
      const lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      const pts = (v) => scale(v, 600, 70, { l: 4, r: 4, t: 6, b: 6 }, lo, hi);
      return '<div><div class="row" style="font-size:14px"><span>' + esc(s.label) + '</span><span><span class="v">' + avg(s.attack).toFixed(1) + '</span> vs ' + avg(s.other).toFixed(1) + ' ' + esc(s.unit) + '</span></div>' +
        '<svg class="chart-svg" viewBox="0 0 600 70" preserveAspectRatio="none" style="height:70px">' +
        '<path d="' + line(pts(s.other)) + '" fill="none" stroke="#7B7C90" stroke-width="2" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>' +
        '<path d="' + line(pts(s.attack)) + '" fill="none" stroke="#E8D7BC" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg></div>';
    }).join('');
  }

  function renderVoice(d) {
    const v = d.voiceScores || [];
    const box = $('voiceChart');
    if (!v.length) { box.innerHTML = empty('Record a voice note to start this chart.'); return; }
    const max = 100;
    box.innerHTML =
      '<div class="row"><span class="t-p">Last ' + v.length + ' days · higher is better</span><span class="v" style="font-size:28px">' + v[v.length - 1] + '</span></div>' +
      '<div style="display:flex;align-items:flex-end;gap:6px;height:150px;margin-top:8px">' +
      v.map((s, i) => '<span title="' + s + '" style="flex:1;height:' + Math.max(4, (s / max) * 100) + '%;border-radius:6px 6px 2px 2px;background:' +
        (i === v.length - 1 ? 'linear-gradient(180deg,#E8D7BC,#AE9E91)' : 'rgba(123,124,144,.4)') + '"></span>').join('') +
      '</div>';
  }

  function renderAttacks(d) {
    const a = d.attacks || [];
    $('attackCount').textContent = a.length + (a.length === 1 ? ' attack' : ' attacks');
    if (!a.length) { $('attackRows').innerHTML = '<tr><td colspan="7">No attacks logged this month.</td></tr>'; return; }
    $('attackRows').innerHTML = a.map(x =>
      '<tr><td>' + esc(x.date) + '</td>' +
      '<td class="num">' + esc(x.pain) + '<span class="painbar"><i style="width:' + (x.pain * 10) + '%"></i></span></td>' +
      '<td>' + esc(x.location) + '</td>' +
      '<td>' + esc((x.symptoms || []).join(', ') || '—') + '</td>' +
      '<td>' + esc(x.medication || '—') + '</td>' +
      '<td>' + (x.session ? 'Yes' : '—') + '</td>' +
      '<td class="num">' + (x.after2h != null ? esc(x.after2h.toFixed(1)) + '<span class="painbar"><i style="width:' + (x.after2h * 10) + '%"></i></span>' : '—') + '</td></tr>'
    ).join('');
  }

  function renderSummary(d) {
    const s = d.summary;
    if (!s) { $('summaryHeadline').textContent = 'Your first summary arrives after month 1.'; $('summaryText').textContent = ''; return; }
    $('summaryPeriod').textContent = s.period;
    $('summaryHeadline').textContent = s.headline;
    $('summaryText').textContent = s.text;
    // TODO(data): wire these to your backend
    $('summarySend').addEventListener('click', e => { e.preventDefault(); alert('Hook this button up to your send-to-doctor endpoint.'); });
    $('summaryDownload').addEventListener('click', e => { e.preventDefault(); alert('Hook this button up to your PDF export.'); });
  }

  /* ---------- boot ---------- */
  $('logout').addEventListener('click', () => {
    try { sessionStorage.removeItem('haptiq_user'); localStorage.removeItem('haptiq_user'); } catch (e) {}
  });

  let currentData;
  $('painLevel').addEventListener('input', e => {
    $('painValue').textContent = e.target.value + ' / 10';
  });
  $('checkinForm').addEventListener('change', e => {
    if (e.target.name !== 'migraine') return;
    $('painLevel').value = e.target.value === 'yes' ? Math.max(1, Number($('painLevel').value)) : 0;
    $('painValue').textContent = $('painLevel').value + ' / 10';
  });
  $('checkinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const entry = {
      migraine: form.elements.migraine.value === 'yes',
      pain: Number(form.elements.pain.value),
      symptoms: [...form.querySelectorAll('input[name="symptom"]:checked')].map(input => input.value),
      savedAt: new Date().toISOString()
    };
    const button = $('saveCheckin');
    button.disabled = true;
    $('checkinError').hidden = true;
    try {
      await window.HaptiqData.saveCheckin(currentData.today.date, entry);
      currentData = await window.HaptiqData.load();
      renderCheckin(currentData);
      renderToday(currentData);
      renderCalendar(currentData);
      renderKpis(currentData);
    } catch (err) {
      $('checkinError').textContent = 'Could not save your check-in. Please try again.';
      $('checkinError').hidden = false;
      console.error(err);
    } finally {
      button.disabled = false;
    }
  });

  window.HaptiqData.load().then(d => {
    currentData = d;
    renderHeader(d);
    renderCheckin(d);
    renderToday(d);
    renderCalendar(d);
    renderKpis(d);
    renderMonthly(d);
    renderLastSession(d);
    renderSettings(d);
    renderPhase(d);
    renderSessions(d);
    renderEye(d);
    renderVoice(d);
    renderAttacks(d);
    renderSummary(d);
  }).catch(err => {
    console.error(err);
    $('phaseLine').textContent = 'Could not load your data. Refresh to try again.';
  });
})();
