// =====================================================================
// Sound utilities — Web Audio API for match events
// =====================================================================

export function playWhistleSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, ctx.currentTime)  // Whistle frequency
    osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1)  // Rise
    osc.frequency.setValueAtTime(800, ctx.currentTime + 0.3)  // Fall
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.setValueAtTime(0.5, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.8)  // Fade out
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.8)
  } catch (err) {
    // AudioContext not available, skip
  }
}

export function playGoalSound() {
  try {
    const ctx = new AudioContext()
    // Celebratory sound - higher pitch, longer
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(523, ctx.currentTime)  // C5
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15)  // E5
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3)  // G5
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.6)
  } catch (err) {
    // AudioContext not available, skip
  }
}
