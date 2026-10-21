(() => {
  'use strict';
  const config = window.SchmidtRouletteConfig, core = window.SchmidtRouletteCore;
  const roots = [...document.querySelectorAll('[data-roulette]')];
  if (!roots.length || !config || !core) return;
  const key = 'schmidt.roulette.preview.v1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const date = (ms, time = true) => new Intl.DateTimeFormat('ru-RU', {timeZone:config.timezone, day:'numeric', month:'long', ...(time ? {hour:'2-digit',minute:'2-digit'} : {})}).format(ms);
  let spinning = false, rotation = 0, state = null, storageReady = true, corrupt = false;
  function read() {
    corrupt = false;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const value = core.validateState(JSON.parse(raw), config);
      if (!value) corrupt = true;
      return value;
    } catch (_) { corrupt = true; return null; }
  }
  try { localStorage.setItem(key + '.check','1'); localStorage.removeItem(key + '.check'); } catch (_) { storageReady = false; }
  state = read();
  function say(message) { roots.forEach(root => { root.querySelector('[data-roulette-status]').textContent = message; }); }
  function render() {
    const now = Date.now(), allowed = storageReady && !corrupt && core.canSpin(state, now);
    roots.forEach(root => {
      const button = root.querySelector('[data-spin]');
      button.disabled = !allowed || spinning;
      root.querySelector('[data-spin-label]').textContent = spinning ? 'КРУТИМ' : allowed ? 'ПУСК' : '7 ДНЕЙ';
      root.querySelector('[data-attempt-count]').textContent = allowed ? '1' : '0';
      root.querySelector('[data-next-spin]').textContent = state && now < state.nextAt ? 'Следующая попытка: ' + date(state.nextAt) + ' · Самара' : 'Одна бесплатная попытка каждые 7 дней';
      const result = root.querySelector('[data-roulette-result]');
      result.hidden = !state || spinning;
      if (state && !spinning) {
        const prize = config.prizes.find(item => item.id === state.prizeId);
        const expired = now >= state.expiresAt;
        const visual = result.querySelector('[data-result-image]'); visual.src = prize.image; visual.alt = 'Иллюстрация: ' + prize.name;
        result.querySelector('[data-result-name]').textContent = prize.name;
        result.querySelector('[data-result-benefit]').textContent = prize.benefit;
        result.querySelector('[data-result-terms]').textContent = prize.terms;
        result.querySelector('[data-coupon-text]').value = core.couponText(prize,state);
        result.querySelector('[data-result-expiry]').textContent = expired ? 'Срок закончился. Следующая попытка — ' + date(state.nextAt) + ' по Самаре.' : 'Только сегодня: до 23:59, ' + date(state.expiresAt - 1, false) + ' · Самара';
        result.querySelector('[data-copy]').disabled = expired;
        result.querySelector('[data-telegram-result]').hidden = expired;
        result.classList.toggle('is-expired', expired);
      }
    });
    if (!storageReady || corrupt) say('Браузер не смог сохранить попытку. Откройте макет в обычной вкладке с доступным хранилищем.');
  }
  roots.forEach(root => {
    const list = root.querySelector('[data-prize-list]');
    if (!list.children.length) config.prizes.forEach(prize => {
      const li = document.createElement('li'), image = document.createElement('img'), copy = document.createElement('div'), title = document.createElement('strong'), text = document.createElement('p');
      image.src = prize.image; image.alt = ''; image.width = 72; image.height = 72; image.loading = 'lazy';
      title.textContent = prize.name + ' — ' + prize.benefit; text.textContent = prize.terms;
      copy.append(title,text); li.append(image,copy); list.append(li);
    });
    root.querySelector('[data-spin]').addEventListener('click', () => {
      if (spinning) return;
      spinning = true; render();
      const run = () => {
        state = read();
        if (corrupt || !storageReady || !core.canSpin(state, Date.now())) { spinning = false; render(); say('Попытка уже использована. Ваш результат сохранён.'); return; }
        try {
          const index = core.randomIndex(config.prizes.length, () => crypto.getRandomValues(new Uint32Array(1))[0]);
          const bytes = crypto.getRandomValues(new Uint8Array(8));
          const hex = [...bytes].map(value => value.toString(16).padStart(2,'0')).join('').toUpperCase();
          const candidate = core.makeState(config,index,Date.now(),hex);
          // Persist before animation: a reload must never grant another local attempt.
          localStorage.setItem(key,JSON.stringify(candidate));
          state = candidate;
          render();
          const target = (360 - index * (360 / config.prizes.length)) % 360;
          rotation = Math.ceil(rotation / 360) * 360 + 5 * 360 + target;
          roots.forEach(item => item.querySelector('[data-wheel-rotor]').style.transform = 'rotate(' + rotation + 'deg)');
          say('Колесо вращается…');
          const finish = () => { if (!spinning) return; spinning = false; render(); say('Результат макета: ' + config.prizes[index].name + '. Демонстрационный код готов к копированию.'); };
          if (reduced.matches) finish(); else setTimeout(finish,4600);
        } catch (_) { state = read(); spinning = false; render(); say('Не удалось сохранить попытку. Обновите страницу, чтобы восстановить результат.'); }
      };
      if (navigator.locks) navigator.locks.request(key,run).catch(() => { spinning = false; render(); say('Попробуйте открыть макет заново.'); }); else run();
    });
    root.querySelector('[data-copy]').addEventListener('click', async event => {
      if (!state || Date.now() >= state.expiresAt) { render(); return; }
      const area = root.querySelector('[data-coupon-text]'), button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(area.value);
        button.textContent = 'Скопировано ✓'; say('Название, выгода и код скопированы.');
        setTimeout(() => { button.textContent = 'Скопировать всё'; },2200);
      } catch (_) {
        area.focus(); area.select();
        // Compatibility for local previews and clients without the modern Clipboard API.
        let copied = false;
        try { copied = document.execCommand('copy'); } catch (_) {}
        if (copied) { button.textContent = 'Скопировано ✓'; say('Название, выгода и код скопированы.'); setTimeout(() => { button.textContent = 'Скопировать всё'; },2200); }
        else say('Текст выделен. Скопируйте его вручную через меню телефона или Ctrl+C.');
      }
    });
    root.querySelector('[data-telegram-link]').href = config.telegramUrl;
    root.querySelector('[data-demo-chat]').addEventListener('click', () => {
      const dialog = root.querySelector('[data-bot-preview]'), prize = config.prizes.find(item => item.id === state?.prizeId);
      if (!state || !prize || Date.now() >= state.expiresAt) { render(); return; }
      dialog.querySelector('[data-chat-coupon]').textContent = core.couponText(prize,state);
      dialog.querySelector('[data-admin-prize]').textContent = prize.name + ' · ' + prize.benefit;
      dialog.querySelector('[data-admin-terms]').textContent = prize.terms;
      dialog.querySelector('[data-admin-code]').textContent = state.code;
      dialog.showModal();
    });
    root.querySelector('[data-close-chat]').addEventListener('click', () => root.querySelector('[data-bot-preview]').close());
    root.querySelector('[data-bot-preview]').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
    root.querySelector('[data-controls]').hidden = false;
  });
  if (state) {
    const index = config.prizes.findIndex(prize => prize.id === state.prizeId);
    rotation = (360 - index * 60) % 360;
    roots.forEach(root => { const rotor = root.querySelector('[data-wheel-rotor]'); rotor.style.transition = 'none'; rotor.style.transform = 'rotate(' + rotation + 'deg)'; requestAnimationFrame(() => requestAnimationFrame(() => { rotor.style.transition = ''; })); });
  }
  addEventListener('storage',event => { if (event.key === key || event.key === null) { state = read(); render(); } });
  addEventListener('pageshow',() => { state = read(); render(); });
  document.addEventListener('visibilitychange',() => { if (!document.hidden) { state = read(); render(); } });
  setInterval(render,30000);
  render();
})();
