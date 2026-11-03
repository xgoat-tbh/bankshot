import { CONFIG } from './config.js';
import { createWorld, stepWorld } from './physics.js';
import { createCampaignProvider } from './generator.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { safeStore } from './state.js';
import { mountRace } from './network/race-ui.js';
import { resolveRelayUrl } from './network/relay.js';
import { createProfileService } from './profile.js';

export function mountGame(root) {
  const store = safeStore();
  let campaignSeed = store.data.userSeed;
  let campaignRooms = createCampaignProvider(campaignSeed, 32);
  const getRoom = index => {
    if (campaignSeed !== store.data.userSeed) {
      campaignSeed = store.data.userSeed;
      campaignRooms = createCampaignProvider(campaignSeed, 32);
    }
    return campaignRooms(index);
  };
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const settings = { reducedMotion: false, aimPreview: true };
  const chaptersSeen = new Set();
  let phase = 'intro';
  let levelIndex = store.data.currentLevel;
  let world = null;
  let returnScreen = 'title';
  let guideReturn = 'title';
  let lastTime = 0;
  let accumulator = 0;
  let frameId = 0;
  let destroyed = false;
  let transition = 0;
  let closeRace = null;
  let profile;
  let unsubscribeProfile;
  const abort = new AbortController();

  const ui = new UI(root, getRoom, store, action);
  const renderer = new Renderer(ui.canvas);
  const input = new Input(ui.canvas, renderer, () => world || renderer.titleWorld, {
    pause: togglePause, restart, guide: openGuide,
    kind: kind => ui.setInput(kind),
    shot: () => { store.recordShot(); ui.update(world, input); },
  });
  function getProfile() {
    if (!profile) {
      profile = createProfileService({
        relayUrl: resolveRelayUrl,
        campaign: () => store.data,
        onCampaign: snapshot => store.importProfileCampaign(snapshot),
      });
      unsubscribeProfile = profile.subscribe(snapshot => {
        if (phase === 'profile') ui.renderProfile(snapshot);
      });
      profile.ready.catch(error => {
        if (!destroyed && phase === 'profile') ui.profileNotice(error.message || 'PROFILE UNAVAILABLE');
      });
    }
    return profile;
  }
  async function profileAction(name) {
    const service = getProfile();
    const callsign = root.querySelector('[data-profile-callsign]');
    const recovery = root.querySelector('[data-profile-recovery]');
    try {
      await service.ready;
      if (destroyed || phase !== 'profile') return;
      if (name === 'profile-copy' || name === 'profile-export') {
        const token = name === 'profile-copy' ? service.snapshot.agentToken : service.exportToken();
        try {
          await navigator.clipboard.writeText(token);
          ui.profileNotice(name === 'profile-copy' ? 'AGENT TOKEN COPIED' : 'RECOVERY CODE COPIED');
        } catch {
          root.querySelector('.profile-recovery').open = true;
          recovery.value = token;
          recovery.focus(); recovery.select();
          ui.profileNotice('COPY THE SELECTED TEXT');
        }
      } else if (name === 'profile-rename') {
        await service.rename(callsign.value);
        delete callsign.dataset.edited;
        callsign.value = service.snapshot.callsign;
        ui.profileNotice('CALL-SIGN SAVED');
      } else if (name === 'profile-recover') {
        const restored = await service.recover(recovery.value);
        recovery.value = '';
        delete callsign.dataset.edited;
        ui.renderProfile(service.snapshot);
        ui.profileNotice(restored.status === 'online' ? 'PROFILE RESTORED' : 'RECOVERY CODE SAVED / CONNECT TO RESTORE PROGRESS');
      }
    } catch (error) {
      ui.profileNotice(error.message || 'PROFILE ACTION FAILED');
    }
  }
  updateSettings();
  renderer.setWorld(renderer.titleWorld, 'title', performance.now() / 1000);
  if (window.matchMedia('(pointer: coarse)').matches) input.setKind('touch');

  function updateSettings() {
    const mode = store.data.settings.reducedMotionMode ?? (store.data.settings.reducedMotion ? 'on' : 'system');
    settings.reducedMotion = mode === 'system' ? media.matches : mode === 'on';
    settings.aimPreview = store.data.settings.aimPreview;
    ui.setSettings({ ...store.data.settings, ...settings }, mode === 'system' && media.matches);
    renderer.reducedMotion = settings.reducedMotion;
    input.touchSensitivity = store.data.settings.touchSensitivity ?? 1;
    renderer.highDpi = store.data.settings.highDpi !== false;
    renderer.resize();
  }
  function resetClock() { accumulator = 0; lastTime = 0; }
  function abandonAttempt(force = false) {
    if (world && world.shots > 0 && world.status !== 'won' && !world.abandoned) {
      if (force || world.shots >= world.budget) {
        store.recordFailure(levelIndex);
        world.abandoned = true;
      } else {
        store.data.activeAttempt = null;
        store.save();
      }
    }
  }
  async function startLevel(index, outcome = '', retry = false) {
    if (!store.canPlay(index)) return;
    const token = ++transition;
    if (retry) store.data.activeAttempt = null;
    else abandonAttempt(outcome === 'budget' || outcome === 'hazard' || (index !== levelIndex));
    input.enabled = false;
    input.reset();
    levelIndex = index;
    const level = getRoom(index);
    store.select(index);
    world = createWorld(level);
    world.budget = store.calculateBudget(index, level.par);
    world.winStreak = store.data.winStreak ?? 0;
    world.lossStreak = store.data.lossStreak ?? 0;
    world.lastOutcome = outcome;
    resetClock();
    phase = 'game';
    renderer.setWorld(world, 'game', performance.now() / 1000);
    ui.setLevel(level, index);
    ui.show('game');
    ui.update(world, input);
    if ((index - 1) % CONFIG.game.chapterSize === 0 && !chaptersSeen.has(index)) {
      chaptersSeen.add(index);
      phase = 'chapter';
      await ui.showChapter(level);
      if (destroyed || token !== transition) return;
      phase = 'game';
      resetClock();
    }
    input.enabled = !document.hidden;
    if (document.hidden) pause();
  }
  function restart() {
    if (!world || !['game', 'pause', 'result'].includes(phase)) return;
    startLevel(levelIndex, '', true);
  }
  function title() {
    ++transition;
    abandonAttempt(true);
    input.enabled = false;
    input.cancel();
    phase = 'title';
    world = null;
    resetClock();
    renderer.setWorld(renderer.titleWorld, 'title', performance.now() / 1000);
    ui.show('title');
  }
  function pause() {
    if (phase !== 'game') return;
    input.enabled = false;
    input.cancel();
    phase = 'pause';
    resetClock();
    world.px = world.x; world.py = world.y; world.previousAngle = world.angle;
    ui.update(world, input);
    ui.show('pause');
  }
  function resume() {
    if (phase !== 'pause' || !world || document.hidden) return;
    phase = 'game';
    resetClock();
    input.enabled = true;
    ui.show('game');
  }
  function togglePause() {
    if (phase === 'guide') closeGuide();
    else if (phase === 'game') pause();
    else if (phase === 'pause') resume();
    else if (['settings', 'levels', 'stats', 'profile'].includes(phase)) back();
    else if (phase === 'result') showScreen('levels');
  }
  function openGuide() {
    if (phase === 'intro' || phase === 'chapter') return;
    if (phase === 'guide') { closeGuide(); return; }
    guideReturn = phase;
    phase = 'guide';
    input.enabled = false;
    input.cancel();
    resetClock();
    if (world) { world.px = world.x; world.py = world.y; world.previousAngle = world.angle; }
    ui.openGuide();
  }
  function closeGuide() {
    if (phase !== 'guide') return;
    // UI closure also dispatches guide-close; change phase before invoking it.
    phase = guideReturn;
    ui.closeGuide();
    if (ui.screen !== phase) ui.show(phase);
    store.markGuideSeen();
    resetClock();
    input.enabled = phase === 'game' && !document.hidden;
    if (phase === 'game' && document.hidden) pause();
  }
  function showScreen(screen) {
    returnScreen = phase === 'pause' || phase === 'result' ? phase : 'title';
    phase = screen;
    input.enabled = false;
    input.cancel();
    resetClock();
    ui.show(screen);
  }
  function back() {
    if ((returnScreen === 'pause' || returnScreen === 'result') && world) {
      phase = returnScreen;
      ui.show(phase);
    } else title();
  }
  function action(name, data = {}) {
    if (phase === 'intro') return;
    if (name === 'race') {
      input.enabled = false;
      input.cancel();
      const previousPhase = phase;
      phase = 'race';
      resetClock();
      closeRace = mountRace(root, { profile: getProfile(), onExit: () => { closeRace = null; phase = previousPhase; resetClock(); input.enabled = phase === 'game'; } });
    }
    else if (name === 'play') startLevel(store.data.currentLevel);
    else if (name === 'level') startLevel(Number(data.index));
    else if (name === 'title') title();
    else if (name === 'home') { if (phase === 'game') pause(); else title(); }
    else if (['levels', 'settings', 'stats'].includes(name)) showScreen(name);
    else if (name === 'profile') {
      showScreen('profile');
      const existing = !!profile;
      const service = getProfile();
      ui.renderProfile(service.snapshot);
      if (existing) service.refresh().catch(() => {});
    }
    else if (name.startsWith('profile-') && phase === 'profile') profileAction(name);
    else if (name === 'setting') { store.toggle(data.key); updateSettings(); }
    else if (name === 'setting-value') { store.setSetting(data.key, data.key === "touchSensitivity" ? Number(data.value) : data.value); updateSettings(); }
    else if (name === 'back') back();
    else if (name === 'pause') togglePause();
    else if (name === 'resume') resume();
    else if (name === 'restart') {
      if (ui.turnsExceededOpen) ui.closeTurnsExceeded?.();
      else restart();
    }
    else if (name === 'next') startLevel(levelIndex + 1);
    else if (name === 'guide') openGuide();
    else if (name === 'guide-close') closeGuide();
  }
  async function complete() {
    const token = transition;
    phase = 'result';
    input.enabled = false;
    input.cancel();
    const grade = store.recordSuccess(world.level, world.shots, world.shots, world.budget, world.time, store.data.currentFailStreak === 0);
    if (profile) profile.ready.then(() => profile.refresh()).catch(() => {});
    ui.update(world, input);
    const rankInfo = store.getRankInfo();
    if (rankInfo.justPromoted) { phase = 'promotion'; await ui.showPromotion(rankInfo); }
    if (destroyed || token !== transition) return;
    phase = 'result';
    ui.result(world, levelIndex, grade);
  }
  function frame(timestamp) {
    if (destroyed) return;
    const now = timestamp / 1000;
    const delta = lastTime ? Math.max(0, Math.min(now - lastTime, CONFIG.physics.maxFrame)) : 0;
    lastTime = now;
    input.update(delta);
    if (phase === 'game') {
      accumulator += delta;
      while (accumulator >= CONFIG.physics.step) {
        stepWorld(world);
        accumulator -= CONFIG.physics.step;
        if (world.status === 'won') { complete(); accumulator = 0; break; }
        if (world.lastOutcome === 'hazard' && world.failures > 0) { startLevel(levelIndex, 'hazard'); break; }
        if (world.status === 'ready' && world.shots >= world.budget) {
          phase = 'turns-exceeded';
          input.enabled = false;
          input.cancel();
          const currentRoom = getRoom(levelIndex);
          ui.showTurnsExceeded({
            level: currentRoom,
            shots: world.shots,
            par: currentRoom.par,
            onRetry: () => {
              phase = 'game';
              input.enabled = true;
              startLevel(levelIndex, 'budget');
            }
          });
          break;
        }
      }
      ui.update(world, input);
    }
    if (!['levels', 'settings', 'stats', 'profile'].includes(phase)) renderer.draw(now, phase === 'game' ? accumulator / CONFIG.physics.step : 1, input, settings);
    frameId = requestAnimationFrame(frame);
  }
  function visibility() {
    input.cancel();
    resetClock();
    if (document.hidden) {
      pause();
      if (phase === 'guide' && guideReturn === 'game') guideReturn = 'pause';
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else if (!frameId) frameId = requestAnimationFrame(frame);
  }
  function resize() {
    if (input.dragging) input.cancel();
    renderer.resize();
  }
  document.addEventListener('visibilitychange', visibility, { signal: abort.signal });
  media.addEventListener('change', updateSettings, { signal: abort.signal });
  window.addEventListener('resize', resize, { signal: abort.signal });
  const observer = new ResizeObserver(resize);
  const unsubscribe = store.subscribe?.(() => {
    updateSettings();
    if (phase === 'levels' || phase === 'stats') ui.show(phase);
  });
  observer.observe(root);
  frameId = requestAnimationFrame(frame);
  ui.startIntro().then(() => {
    if (destroyed) return;
    phase = 'title';
    ui.show('title');
    if (!store.data.seenGuide) openGuide();
  });
  return () => {
    destroyed = true;
    ++transition;
    cancelAnimationFrame(frameId);
    observer.disconnect();
    abort.abort();
    input.destroy();
    ui.destroy();
    closeRace?.();
    unsubscribe?.();
    unsubscribeProfile?.();
    profile?.destroy();
    store.destroy?.();
  };
}
if (typeof document !== 'undefined') {
  const root = document.getElementById('root');
  if (root) mountGame(root);
}
