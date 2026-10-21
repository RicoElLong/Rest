/* Shared preview logic. Production issuance and redemption must be server-owned. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  function dayEndSamara(now) {
    const local = new Date(now + 4 * 3600000);
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - 4 * 3600000;
  }
  function validateState(value, config) {
    if (!value || value.version !== 1 || value.campaign !== config.id) return null;
    if (!Number.isSafeInteger(value.spinAt) || value.spinAt < 0 || !Number.isSafeInteger(value.nextAt) || !Number.isSafeInteger(value.expiresAt)) return null;
    if (value.nextAt !== value.spinAt + config.cooldownDays * DAY || value.expiresAt !== dayEndSamara(value.spinAt)) return null;
    if (!config.prizes.some(prize => prize.id === value.prizeId) || !/^DEMO-SH-[A-F0-9]{16}$/.test(value.code)) return null;
    return value;
  }
  function canSpin(state, now) { return !state || now >= state.nextAt; }
  function randomIndex(count, randomWord) {
    if (!Number.isInteger(count) || count < 1 || count > 65536) throw new Error('Invalid prize count');
    const ceiling = Math.floor(4294967296 / count) * count;
    let value;
    do { value = randomWord(); if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new Error('Invalid random word'); } while (value >= ceiling);
    return value % count;
  }
  function makeState(config, index, now, hex) {
    if (config.mode !== 'preview') throw new Error('Only review mode is supported by this build');
    const prize = config.prizes[index];
    if (!prize || !/^[A-F0-9]{16}$/.test(hex)) throw new Error('Invalid preview prize');
    return {version:1, campaign:config.id, spinAt:now, nextAt:now + config.cooldownDays * DAY, expiresAt:dayEndSamara(now), prizeId:prize.id, code:'DEMO-SH-' + hex};
  }
  function couponText(prize, state) { return prize.name + ' | ' + prize.benefit + ' | ' + state.code; }
  const api = {DAY, dayEndSamara, validateState, canSpin, randomIndex, makeState, couponText};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchmidtRouletteCore = api;
})(typeof window === 'object' ? window : globalThis);
