/* Review-only campaign. These are proposed terms, not an active restaurant offer. */
(function (root) {
  'use strict';
  const config = {
    id: 'schmidt-review-20261022-v1',
    mode: 'preview',
    title: 'Фарт Шмидта',
    timezone: 'Europe/Samara',
    cooldownDays: 7,
    telegramUrl: 'https://t.me/RESTSCHMIDTBOT?start=src_roulette_preview',
    prizes: [
      {id:'lemonade', name:'Лимонад Натахтари', short:'Лимонад', benefit:'В подарок к горячему', wheel:'К горячему', image:'assets/roulette/lemonade.webp', terms:'Одна бутылка лимонада при заказе одного горячего блюда из списка акции.'},
      {id:'discount', name:'Заказ от 3 000 ₽', short:'На заказ', benefit:'Скидка 15%', wheel:'−15% на заказ', image:'assets/roulette/discount.svg', terms:'15% на заказ кухни от 3 000 ₽ до скидки. Максимальная выгода — 750 ₽.'},
      {id:'fries', name:'Картофель фри', short:'Картофель фри', benefit:'В подарок к шашлыку', wheel:'К шашлыку', image:'assets/roulette/fries.webp', terms:'Одна порция картофеля фри при заказе одной порции шашлыка из списка акции.'},
      {id:'sauce', name:'Сацебели', short:'Сацебели', benefit:'В подарок к грилю', wheel:'К грилю', image:'assets/roulette/sauce.webp', terms:'Одна порция соуса сацебели при заказе одного блюда на гриле из списка акции.'},
      {id:'bread', name:'Грузинский лаваш', short:'Грузинский лаваш', benefit:'В подарок от 1 500 ₽', wheel:'От 1 500 ₽', image:'assets/roulette/bread.webp', terms:'Одна порция грузинского лаваша при заказе кухни от 1 500 ₽ до скидок.'},
      {id:'khachapuri', name:'Хачапури по-аджарски', short:'Хачапури', benefit:'Скидка 20% на блюдо', wheel:'−20% на блюдо', image:'assets/roulette/khachapuri.webp', terms:'20% на одно хачапури по-аджарски при заказе одного горячего блюда из списка акции.'}
    ]
  };
  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.SchmidtRouletteConfig = config;
})(typeof window === 'object' ? window : globalThis);
