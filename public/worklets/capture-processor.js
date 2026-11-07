// AudioWorklet: batches mono input into 2048-sample Float32 chunks and posts them
// to the main thread (transferred, no copy). Runs at the AudioContext sample rate.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(2048)
    this.n = 0
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === this.buf.length) {
          const chunk = this.buf.slice()
          this.port.postMessage(chunk, [chunk.buffer])
          this.n = 0
        }
      }
    }
    return true
  }
}

registerProcessor('capture-processor', CaptureProcessor)
