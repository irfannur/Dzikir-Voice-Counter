import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Dhikr, RecognizedSegment, SegmentResult, SessionRecord } from '@/types'
import { DhikrCounterEngine } from '@/services/counter/DhikrCounterEngine'
import { db } from '@/database/indexedDb'

export type SessionState = 'idle' | 'running' | 'paused'
export type RecognitionStatus = 'idle' | 'listening' | 'processing' | 'recognized' | 'unrecognized' | 'error'

/**
 * Reactive wrapper around DhikrCounterEngine for the active session.
 * Phase 1 feeds it manual counts; Phase 2 will call submitSegment() with
 * recognized utterances from the speech provider.
 */
export const useCounterStore = defineStore('counter', () => {
  const dhikr = ref<Dhikr | null>(null)
  const engine = ref<DhikrCounterEngine | null>(null)
  const state = ref<SessionState>('idle')
  const status = ref<RecognitionStatus>('idle')
  const count = ref(0)
  const target = ref(33)
  const accepted = ref(0)
  const rejected = ref(0)
  const manualCorrections = ref(0)
  const lastUtterance = ref('')
  /** Last recognition events, newest first. Diagnostics for tuning thresholds. */
  const debugLog = ref<{ at: number; text: string; durMs: number; latencyMs?: number; accepted: boolean; reason?: string; score: number }[]>([])
  const startedAt = ref(0)
  const elapsedMs = ref(0)
  const targetReached = ref(false)
  const saveError = ref<string | null>(null)

  let timer: number | undefined
  let tickStart = 0
  let accumulated = 0

  const progress = computed(() => (target.value > 0 ? Math.min(100, (count.value / target.value) * 100) : 0))

  function sync() {
    const e = engine.value
    if (!e) return
    count.value = e.count
    accepted.value = e.stats.accepted
    rejected.value = e.stats.rejected
    manualCorrections.value = e.manualCorrections
    if (e.count >= target.value && target.value > 0 && !targetReached.value) targetReached.value = true
  }

  function startTimer() {
    tickStart = Date.now()
    window.clearInterval(timer)
    timer = window.setInterval(() => {
      elapsedMs.value = accumulated + (Date.now() - tickStart)
    }, 500)
  }

  function stopTimer() {
    if (timer !== undefined) {
      accumulated += Date.now() - tickStart
      elapsedMs.value = accumulated
      window.clearInterval(timer)
      timer = undefined
    }
  }

  function begin(d: Dhikr, t: number) {
    dhikr.value = d
    target.value = t
    engine.value = new DhikrCounterEngine(d, t)
    count.value = accepted.value = rejected.value = manualCorrections.value = 0
    lastUtterance.value = ''
    debugLog.value = []
    targetReached.value = false
    accumulated = 0
    elapsedMs.value = 0
    startedAt.value = Date.now()
    state.value = 'running'
    status.value = 'idle'
    startTimer()
  }

  function pause() {
    if (state.value !== 'running') return
    engine.value?.pause()
    state.value = 'paused'
    stopTimer()
  }

  function resume() {
    if (state.value !== 'paused') return
    engine.value?.resume()
    state.value = 'running'
    startTimer()
  }

  function setTarget(t: number) {
    target.value = t
    if (engine.value) engine.value.target = t
    targetReached.value = count.value >= t && t > 0
  }

  function continueAfterTarget() {
    targetReached.value = false
    setTarget(count.value + (dhikr.value?.defaultTarget ?? 33))
  }

  function increment() {
    engine.value?.manualIncrement()
    sync()
  }

  function decrement() {
    engine.value?.manualDecrement()
    sync()
  }

  function reset() {
    engine.value?.reset()
    targetReached.value = false
    accumulated = 0
    elapsedMs.value = 0
    startedAt.value = Date.now()
    if (state.value === 'running') startTimer()
    sync()
  }

  /** Entry point for recognized utterances (Phase 2). */
  function submitSegment(seg: RecognizedSegment): SegmentResult | null {
    if (!engine.value || state.value !== 'running') return null
    const res = engine.value.handleSegment(seg)
    lastUtterance.value = seg.text
    debugLog.value = [
      { at: Date.now(), text: seg.text, durMs: Math.round(seg.endMs - seg.startMs), latencyMs: seg.latencyMs && Math.round(seg.latencyMs), accepted: res.accepted, reason: res.reason, score: Math.round(res.score * 100) / 100 },
      ...debugLog.value,
    ].slice(0, 15)
    status.value = res.accepted ? 'recognized' : 'unrecognized'
    sync()
    return res
  }

  function setStatus(s: RecognitionStatus) {
    status.value = s
  }

  /** Ends the session and saves it locally if anything was counted. */
  async function finish(): Promise<SessionRecord | null> {
    stopTimer()
    state.value = 'idle'
    status.value = 'idle'
    saveError.value = null
    if (!dhikr.value || (count.value === 0 && manualCorrections.value === 0)) return null
    const endedAt = Date.now()
    const rec: SessionRecord = {
      id: `s-${startedAt.value}`,
      dhikrId: dhikr.value.id,
      dhikrName: dhikr.value.name,
      total: count.value,
      target: target.value,
      startedAt: startedAt.value,
      endedAt,
      durationMs: accumulated,
      stats: { accepted: accepted.value, rejected: rejected.value },
      manualCorrections: manualCorrections.value,
    }
    try {
      await db.put('sessions', rec)
    } catch (e) {
      saveError.value = (e as Error).message
    }
    return rec
  }

  return {
    dhikr, state, status, count, target, accepted, rejected, manualCorrections, lastUtterance, debugLog,
    elapsedMs, targetReached, saveError, progress,
    begin, pause, resume, setTarget, continueAfterTarget, increment, decrement, reset, submitSegment, setStatus, finish,
  }
})
