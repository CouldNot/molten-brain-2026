/* =========================================================
   Haptiq — dashboard data, shared by dashboard.html and brain.html
   ---------------------------------------------------------
   HOW TO CONNECT YOUR DATA
   1. Replace load() below with a real fetch, e.g.
        const res = await fetch('/api/dashboard?user=' + userId);
        return await res.json();
   2. Return an object with the same shape as SAMPLE_DATA.
      Every field is optional; panels with no data show an empty state.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- SAMPLE DATA (delete once your API is wired up) ---------- */
  const SAMPLE_DATA = {
    user: { firstName: 'Alex' },
    phase: { month: 4, day: 12, daysInMonth: 30 },          // month 1 = baseline, 2+ = adaptive
    devices: [
      { name: 'Pupil Labs Neon', connected: true },
      { name: 'DataFeel wearable', connected: true, battery: 78 },
      { name: 'Vision Pro', connected: false }
    ],
    isSample: true,                                         // shows the "sample data" banner; drop it for real data
    today: { date: '2026-10-17', checkIn: false, trackingTask: false, voiceNote: false },
    streakDays: 23,
    monthly: [                                              // migraine days per month, oldest first
      { label: 'Jul', days: 12 },
      { label: 'Aug', days: 10 },
      { label: 'Sep', days: 8 },
      { label: 'Oct', days: 5, partial: true }
    ],
    sessions: [                                             // this month, oldest first
      { date: 'Oct 2', start: 7, after2h: 4.8 },
      { date: 'Oct 5', start: 6, after2h: 3.9 },
      { date: 'Oct 8', start: 8, after2h: 4.6 },
      { date: 'Oct 11', start: 6, after2h: 3.1 },
      { date: 'Oct 15', start: 7, after2h: 3.0 }
    ],
    settings: [                                             // limit = hard safety cap
      { label: 'Frequency', value: 110, unit: 'Hz', min: 20, max: 250, limit: 220 },
      { label: 'Intensity', value: 45, unit: '%', min: 0, max: 100, limit: 80 },
      { label: 'Session length', value: 20, unit: 'min', min: 5, max: 35, limit: 30 }
    ],
    eyeSignals: [                                           // last 14 days, attack-day average vs other days
      { label: 'Blink rate', unit: '/min', attack: [19, 21, 20, 23, 22, 24, 21, 22, 25, 23, 22, 24, 23, 22], other: [15, 16, 15, 14, 16, 15, 16, 15, 14, 15, 16, 15, 15, 16] },
      { label: 'Pupil size', unit: 'mm', attack: [3.6, 3.5, 3.6, 3.4, 3.5, 3.3, 3.4, 3.4, 3.2, 3.3, 3.3, 3.2, 3.3, 3.2], other: [4.1, 4.2, 4.1, 4.2, 4.1, 4.2, 4.2, 4.1, 4.2, 4.1, 4.2, 4.2, 4.1, 4.2] }
    ],
    voiceScores: [62, 58, 64, 41, 55, 67, 70, 66, 48, 61, 69, 72, 68, 71],   // 0–100, last 14 days
    attacks: [                                              // newest first
      { date: 'Oct 15', pain: 7, location: 'Left temple', symptoms: ['Nausea', 'Light'], medication: 'None', session: true, after2h: 3.0 },
      { date: 'Oct 11', pain: 6, location: 'Behind eyes', symptoms: ['Light', 'Sound'], medication: 'Ibuprofen', session: true, after2h: 3.1 },
      { date: 'Oct 8', pain: 8, location: 'Left temple', symptoms: ['Aura', 'Nausea'], medication: 'Triptan', session: true, after2h: 4.6 },
      { date: 'Oct 5', pain: 6, location: 'Neck', symptoms: ['Light'], medication: 'None', session: true, after2h: 3.9 },
      { date: 'Oct 2', pain: 7, location: 'Left temple', symptoms: ['Nausea'], medication: 'None', session: true, after2h: 4.8 }
    ],
    summary: {
      period: 'September summary',
      headline: '8 migraine days, down from 12 at baseline.',
      text: 'Sessions near 110 Hz at 45% intensity were followed by the lowest 2-hour pain scores. Blink rate ran higher on attack days.'
    }
  };

  const localDate = (date = new Date()) =>
    [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const checkinKey = (date) => {
    let userId = 'demo';
    try {
      const user = JSON.parse(sessionStorage.getItem('haptiq_user') || localStorage.getItem('haptiq_user') || 'null');
      userId = user && user.userId || userId;
    } catch (e) {}
    return 'haptiq_checkin_' + encodeURIComponent(userId) + '_' + date;
  };

  function getCheckin(date) {
    try { return JSON.parse(localStorage.getItem(checkinKey(date)) || 'null'); }
    catch (e) { return null; }
  }

  function saveCheckin(date, entry) {
    // Demo persistence only. Replace this with an authenticated API write.
    localStorage.setItem(checkinKey(date), JSON.stringify(entry));
  }

  async function load() {
    // TODO(data): replace with your API call and return actual check-in dates.
    const data = structuredClone(SAMPLE_DATA);
    const now = new Date();
    const today = localDate(now);
    const saved = getCheckin(today);
    data.today.date = today;
    data.phase.day = now.getDate();
    data.phase.daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    data.today.checkIn = !!saved;
    data.checkin = saved;
    if (saved) data.streakDays += 1;
    // Demo calendar: the sample streak fills prior days; today's entry is real local demo data.
    data.checkinDates = Array.from({ length: SAMPLE_DATA.streakDays }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - i - 1);
      return localDate(date);
    });
    if (saved) data.checkinDates.push(today);
    return data;
  }

  window.HaptiqData = { load, saveCheckin };
})();
