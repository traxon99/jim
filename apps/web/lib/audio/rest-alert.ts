/**
 * The rest-timer completion alert. `navigator.vibrate` doesn't exist on iOS
 * (docs/ARCHITECTURE.md §2, constraint 3), so completion is audio-only —
 * and iOS only allows an `AudioContext` to start from within a user gesture,
 * so it's created lazily on the first tap in an active session and reused
 * for every alert after that, rather than created fresh (and blocked) when
 * the timer itself fires with no gesture behind it.
 */
let sharedContext: AudioContext | null = null;

export function primeRestAlertAudio(): void {
  if (sharedContext) {
    if (sharedContext.state === "suspended") void sharedContext.resume();
    return;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  sharedContext = new Ctor();
}

export function playRestAlert(): void {
  const ctx = sharedContext;
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.4);

  // A short second beep so it reads as an alert rather than a UI blip.
  const oscillator2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  oscillator2.type = "sine";
  oscillator2.frequency.value = 880;
  gain2.gain.setValueAtTime(0.0001, ctx.currentTime + 0.45);
  gain2.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.47);
  gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
  oscillator2.connect(gain2);
  gain2.connect(ctx.destination);
  oscillator2.start(ctx.currentTime + 0.45);
  oscillator2.stop(ctx.currentTime + 0.85);
}
