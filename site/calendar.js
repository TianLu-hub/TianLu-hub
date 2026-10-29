'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const dateLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' });
  const updateLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  let dataset, byDate, months = [], years = [], selected, period, view = 'month', activeTooltip;
  const today = new Date().toISOString().slice(0, 10);
  const utcDate = value => new Date(`${value}T12:00:00Z`);
  const dateKey = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const monthTitle = value => `${monthNames[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}`;
  const countLabel = (number, singular) => `${number.toLocaleString()} ${singular}${number === 1 ? '' : 's'}`;
  const validDate = value => typeof value === 'string' && datePattern.test(value) && !Number.isNaN(utcDate(value).valueOf()) && utcDate(value).toISOString().slice(0, 10) === value;
  const safeCount = value => Number.isSafeInteger(value) && value >= 0;

  function validate(data) {
    if (!data || data.username !== 'TianLu-hub' || !validDate(data.from) || !validDate(data.to) || data.from > data.to || !Array.isArray(data.days) || data.days.length < 1 || data.days.length > 800 || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('Invalid activity data');
    const unique = new Set();
    for (const day of data.days) {
      if (!validDate(day.date) || day.date < data.from || day.date > data.to || unique.has(day.date) || !safeCount(day.commits) || !safeCount(day.contributions) || !levels.includes(day.level)) throw new Error('Invalid daily activity');
      unique.add(day.date);
    }
    return data;
  }

  function dayInfo(date) {
    if (date > today) return { status: 'future', message: 'Future date · activity has not happened yet.' };
    const entry = byDate.get(date);
    if (!entry) return { status: 'unavailable', message: 'Outside the available data, or not yet updated.' };
    return { status: 'available', entry, message: entry.contributions ? 'Public GitHub activity.' : 'No contributions recorded.' };
  }

  function describe(date) {
    const info = dayInfo(date);
    return `${dateLabel.format(utcDate(date))}. ${info.entry ? `${countLabel(info.entry.commits, 'commit')}, ${countLabel(info.entry.contributions, 'contribution')}.` : info.message}`;
  }

  function showTooltip(button) {
    const date = button.dataset.date;
    const info = dayInfo(date);
    const tooltip = $('day-tooltip');
    tooltip.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = `${date} · ${weekdayNames[utcDate(date).getUTCDay()]}`;
    const text = document.createElement('span');
    text.textContent = info.entry ? `${countLabel(info.entry.commits, 'commit')} · ${countLabel(info.entry.contributions, 'contribution')}` : info.message;
    tooltip.append(title, text);
    tooltip.hidden = false;
    activeTooltip = button;
    button.setAttribute('aria-describedby', 'day-tooltip');
    const bounds = button.getBoundingClientRect();
    const tipBounds = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(bounds.left + bounds.width / 2 - tipBounds.width / 2, innerWidth - tipBounds.width - 8));
    const top = bounds.top - tipBounds.height - 10 >= 8 ? bounds.top - tipBounds.height - 10 : bounds.bottom + 10;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.min(top, innerHeight - tipBounds.height - 8)}px`;
  }

  function hideTooltip() {
    $('day-tooltip').hidden = true;
    if (activeTooltip) activeTooltip.removeAttribute('aria-describedby');
    activeTooltip = undefined;
  }

  function selectDate(date) {
    selected = date;
    const info = dayInfo(date);
    $('selected-date').textContent = dateLabel.format(utcDate(date));
    $('selected-status').textContent = `${date} · ${info.message}`;
    $('day-commits').textContent = info.entry ? info.entry.commits.toLocaleString() : '—';
    $('day-contributions').textContent = info.entry ? info.entry.contributions.toLocaleString() : '—';
    document.querySelectorAll('.day').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.date === date)));
  }

  function makeMonth(monthKey, miniature = false) {
    const [year, monthNumber] = monthKey.split('-').map(Number);
    const month = monthNumber - 1;
    const section = document.createElement('section');
    section.className = miniature ? 'mini-month' : 'full-month';
    section.setAttribute('aria-label', monthTitle(monthKey));
    if (miniature) {
      const heading = document.createElement('h3');
      heading.textContent = monthNames[month];
      section.append(heading);
    }
    const weekdays = document.createElement('div');
    weekdays.className = 'weekdays';
    weekdays.setAttribute('aria-hidden', 'true');
    weekdayNames.forEach(name => { const el = document.createElement('span'); el.textContent = miniature ? name[0] : name; weekdays.append(el); });
    const grid = document.createElement('div');
    grid.className = 'month-grid';
    const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
    for (let blank = 0; blank < offset; blank++) { const spacer = document.createElement('span'); spacer.setAttribute('aria-hidden', 'true'); grid.append(spacer); }
    const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= length; day++) {
      const date = dateKey(year, month, day);
      const info = dayInfo(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `day ${info.entry ? `level-${levels.indexOf(info.entry.level)}` : `is-${info.status}`}`;
      button.dataset.date = date;
      button.setAttribute('aria-label', describe(date));
      button.setAttribute('aria-pressed', String(date === selected));
      if (date === today) button.setAttribute('aria-current', 'date');
      const number = document.createElement('span');
      number.className = 'day-number';
      number.textContent = day;
      button.append(number);
      if (!miniature) {
        const count = document.createElement('span');
        count.className = 'day-count';
        if (info.entry) {
          count.append(document.createTextNode(`${info.entry.commits.toLocaleString()} `));
          const unit = document.createElement('span');
          unit.className = 'count-unit';
          unit.textContent = info.entry.commits === 1 ? 'commit' : 'commits';
          const shortUnit = document.createElement('span');
          shortUnit.className = 'count-unit-short';
          shortUnit.textContent = 'c';
          count.append(unit, shortUnit);
        } else count.textContent = info.status === 'future' ? '·' : '—';
        count.setAttribute('aria-hidden', 'true');
        button.append(count);
      }
      button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showTooltip(button); });
      button.addEventListener('pointerleave', hideTooltip);
      button.addEventListener('focus', () => showTooltip(button));
      button.addEventListener('blur', hideTooltip);
      button.addEventListener('click', () => { selectDate(date); showTooltip(button); });
      button.addEventListener('keydown', event => {
        if (event.key === 'Escape') { hideTooltip(); return; }
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (!delta) return;
        event.preventDefault();
        const target = utcDate(date);
        target.setUTCDate(target.getUTCDate() + delta);
        const targetKey = target.toISOString().slice(0, 10);
        if (view === 'month' && months.includes(targetKey.slice(0, 7)) && targetKey.slice(0, 7) !== period) { period = targetKey.slice(0, 7); render(); }
        $('calendar').querySelector(`[data-date="${targetKey}"]`)?.focus();
      });
      grid.append(button);
    }
    section.append(weekdays, grid);
    return section;
  }

  function render() {
    hideTooltip();
    const options = view === 'month' ? months : years;
    $('period').replaceChildren(...options.map(value => { const option = document.createElement('option'); option.value = value; option.textContent = view === 'month' ? monthTitle(value) : value; return option; }));
    $('period').value = period;
    $('period-label').textContent = `Choose ${view}`;
    $('previous').disabled = options.indexOf(period) === 0;
    $('next').disabled = options.indexOf(period) === options.length - 1;
    $('previous').setAttribute('aria-label', `Previous ${view}`);
    $('next').setAttribute('aria-label', `Next ${view}`);
    $('month-view').setAttribute('aria-pressed', String(view === 'month'));
    $('year-view').setAttribute('aria-pressed', String(view === 'year'));
    const container = $('calendar');
    container.replaceChildren();
    container.classList.toggle('year-grid', view === 'year');
    container.setAttribute('aria-label', view === 'month' ? monthTitle(period) : `Year ${period}`);
    if (view === 'month') container.append(makeMonth(period));
    else for (let month = 1; month <= 12; month++) container.append(makeMonth(`${period}-${String(month).padStart(2, '0')}`, true));
    const entries = dataset.days.filter(day => day.date.startsWith(period) && day.date <= today);
    $('stat-commits').textContent = entries.reduce((sum, day) => sum + day.commits, 0).toLocaleString();
    $('stat-contributions').textContent = entries.reduce((sum, day) => sum + day.contributions, 0).toLocaleString();
    $('stat-active').textContent = entries.filter(day => day.contributions > 0).length.toLocaleString();
  }

  function switchView(nextView) {
    if (view === nextView) return;
    period = nextView === 'year' ? period.slice(0, 4) : months.filter(month => month.startsWith(period)).at(-1);
    view = nextView;
    render();
  }

  async function load() {
    $('loading').hidden = false;
    $('error').hidden = true;
    $('activity').hidden = true;
    try {
      const response = await fetch('./calendar-data.json', { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      dataset = validate(await response.json());
      byDate = new Map(dataset.days.map(day => [day.date, day]));
      months = [];
      const cursor = utcDate(`${dataset.from.slice(0, 7)}-01`);
      while (cursor.toISOString().slice(0, 7) <= dataset.to.slice(0, 7)) { months.push(cursor.toISOString().slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1); }
      years = [...new Set(months.map(month => month.slice(0, 4)))];
      period = view === 'month' ? months.at(-1) : years.at(-1);
      selected = dataset.days.map(day => day.date).filter(date => date <= today).sort().at(-1) || dataset.from;
      $('coverage').textContent = `Available dates: ${dataset.from} – ${dataset.to}. Dashed cells are future dates; striped cells have no available data. Colors show total contributions.`;
      $('updated').textContent = `Updated ${updateLabel.format(new Date(dataset.generatedAt))} UTC · refreshes daily.`;
      render();
      selectDate(selected);
      $('activity').hidden = false;
    } catch (error) {
      $('error').hidden = false;
      console.warn('Unable to display activity calendar:', error.message);
    } finally { $('loading').hidden = true; }
  }

  $('retry').addEventListener('click', load);
  $('period').addEventListener('change', event => { period = event.target.value; render(); });
  $('previous').addEventListener('click', () => { const options = view === 'month' ? months : years; period = options[Math.max(0, options.indexOf(period) - 1)]; render(); });
  $('next').addEventListener('click', () => { const options = view === 'month' ? months : years; period = options[Math.min(options.length - 1, options.indexOf(period) + 1)]; render(); });
  $('month-view').addEventListener('click', () => switchView('month'));
  $('year-view').addEventListener('click', () => switchView('year'));
  $('galaga').addEventListener('error', () => { $('galaga').hidden = true; $('arcade-unavailable').hidden = false; });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.day')) hideTooltip(); });
  window.addEventListener('scroll', hideTooltip, { passive: true });
  window.addEventListener('resize', hideTooltip);
  load();
})();
