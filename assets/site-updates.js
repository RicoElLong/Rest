(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const originalPhone = '+78920000000';
  const phoneLabel = phone => phone.startsWith('+7') && phone.length === 12
    ? phone.replace(/^(\+7)(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 ($2) $3-$4-$5')
    : phone;

  function updateContacts(settings) {
    for (const link of all(`a[href="tel:${originalPhone}"]`)) {
      link.href = 'tel:' + settings.phone;
      if (link.textContent.trim() === phoneLabel(originalPhone)) link.textContent = phoneLabel(settings.phone);
    }
    for (const link of all('a[href*="/146001632122/"]')) link.href = settings.map_url;
    for (const place of all('.location-address, .booking-address, .menu-visit div > p, .mobile-header-address, .location-map-caption small')) {
      if (place.matches('.mobile-header-address') && settings.address === 'Самара, улица Лейтенанта Шмидта, 1В') continue;
      const label = place.querySelector('.location-detail-label');
      place.replaceChildren(...(label ? [label] : []), document.createTextNode(settings.address));
    }
    if (settings.hours && $('.location-address')) {
      const hours = document.createElement('p');
      hours.className = 'location-address';
      const label = document.createElement('span');
      label.className = 'location-detail-label';
      label.textContent = 'Часы работы';
      hours.append(label, document.createTextNode(settings.hours));
      $('.location-address').after(hours);
    }
    for (const link of all('[data-telegram-widget]')) {
      const target = new URL(settings.telegram);
      target.search = new URL(link.href).search;
      link.href = target.href;
    }
    for (const link of all('.delivery-trigger')) link.href = settings.delivery;
  }

  function enableBooking() {
    const tableUrl = '/booking?kind=table';
    const banquetUrl = '/booking?kind=banquet';
    for (const link of all('a.restaurant-action[href^="tel:"], .menu-visit a[href^="tel:"]')) {
      link.href = tableUrl;
    }
    for (const link of all('.banquet-panel a[href^="tel:"]')) {
      link.href = banquetUrl;
      if (link.hasAttribute('aria-label')) link.setAttribute('aria-label', 'Обсудить банкет · ' + link.closest('.hall').querySelector('h3').textContent);
    }
    const original = $('.booking-content a.gold-button');
    if (!original) return;
    const apply = original.cloneNode(false);
    apply.href = banquetUrl;
    apply.textContent = 'Обсудить банкет';
    original.replaceWith(apply);
  }

  function updatePromotions(promotions) {
    const section = $('#promotions');
    if (!promotions.length) {
      if (section) section.hidden = true;
      for (const link of all('[data-header-promotions]')) link.hidden = true;
      return;
    }
    const original = section?.querySelector('.promotion-feature');
    if (!original) return;
    const cards = promotions.map((promotion, index) => {
      const card = original.cloneNode(true);
      const title = card.querySelector('h3');
      if (index > 0) title.id += '-' + (index + 1);
      title.textContent = promotion.title;
      card.setAttribute('aria-labelledby', title.id);
      const imageWrap = card.querySelector('.promotion-photo');
      if (promotion.image) {
        const image = imageWrap.querySelector('img');
        if (image.getAttribute('src') !== promotion.image) {
          image.alt = '';
          image.src = new URL(promotion.image, location.origin + '/').href;
        }
      } else {
        imageWrap.remove();
        card.classList.add('promotion-text-only');
      }
      const badge = card.querySelector('.eyebrow');
      if (title.textContent !== original.querySelector('h3').textContent) badge.remove();
      if (promotion.terms) {
        const terms = document.createElement('p');
        terms.className = 'promotion-terms';
        terms.textContent = promotion.terms;
        title.after(terms);
      }
      const button = card.querySelector('.promotion-telegram');
      if (promotion.cta && promotion.url) {
        button.href = promotion.url;
        button.firstChild.textContent = promotion.cta + ' ';
      } else button.remove();
      return card;
    });
    original.replaceWith(...cards);
  }

  fetch('/assets/site-content.json')
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (!data) return;
      updateContacts(data.settings);
      updatePromotions(data.promotions);
      if (data.settings.booking) enableBooking();
    })
    .catch(() => {
      // Keep the original static contacts and promotions if the update is temporarily unavailable.
    });
})();
