// Records the meeting on this computer: every participant's video is drawn into a grid on a
// canvas, all microphones are mixed, and MediaRecorder writes a WebM file that downloads on stop.
// Nothing is uploaded; other participants see a recording indicator.

export type RecordedTile = { name: string; video: HTMLVideoElement | null; audio: MediaStreamTrack | null; showVideo: boolean };

const W = 1280;
const H = 720;

export class Recorder {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private audio = new AudioContext();
  private mix = this.audio.createMediaStreamDestination();
  private wired = new Set<string>();
  private timer: ReturnType<typeof setInterval>;
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];

  constructor(
    private tiles: () => RecordedTile[],
    private title: string,
  ) {
    this.canvas.width = W;
    this.canvas.height = H;
    // A timer, not requestAnimationFrame: frames keep coming while the tab is in the background.
    this.timer = setInterval(() => this.draw(), 1000 / 30);
    this.draw();
    const stream = new MediaStream([...this.canvas.captureStream(30).getVideoTracks(), ...this.mix.stream.getAudioTracks()]);
    const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(1000);
  }

  private draw() {
    const tiles = this.tiles();
    for (const t of tiles) {
      if (t.audio && !this.wired.has(t.audio.id)) {
        this.wired.add(t.audio.id);
        this.audio.createMediaStreamSource(new MediaStream([t.audio])).connect(this.mix);
      }
    }
    const { ctx } = this;
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, W, H);
    const n = Math.max(1, tiles.length);
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const gap = 8;
    const tw = (W - gap * (cols + 1)) / cols;
    const th = (H - gap * (rows + 1)) / rows;
    tiles.forEach((t, i) => {
      const x = gap + (i % cols) * (tw + gap);
      const y = gap + Math.floor(i / cols) * (th + gap);
      ctx.fillStyle = "#1a1d25";
      ctx.fillRect(x, y, tw, th);
      const v = t.video;
      if (t.showVideo && v && v.videoWidth) {
        // Cover the tile, cropping the video's overflow like the on-screen tiles do.
        const scale = Math.max(tw / v.videoWidth, th / v.videoHeight);
        const sw = tw / scale;
        const sh = th / scale;
        ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, x, y, tw, th);
      } else {
        ctx.fillStyle = "#3b4256";
        ctx.beginPath();
        ctx.arc(x + tw / 2, y + th / 2, Math.min(tw, th) / 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8eaf2";
        ctx.font = `600 ${Math.round(Math.min(tw, th) / 8)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.name.slice(0, 1).toUpperCase(), x + tw / 2, y + th / 2);
      }
      ctx.font = "500 18px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const label = t.name;
      const lw = ctx.measureText(label).width + 20;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(x + 10, y + th - 40, lw, 30);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 20, y + th - 19);
    });
  }

  /** Stops and downloads the recording. */
  stop() {
    clearInterval(this.timer);
    return new Promise<void>((done) => {
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: "video/webm" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        a.download = `${this.title.replace(/[^\w -]/g, "").trim() || "meeting"} ${stamp}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        void this.audio.close();
        done();
      };
      this.recorder.stop();
    });
  }
}
