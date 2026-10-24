// One meeting from this browser's side: a WebRTC connection to every other participant (a mesh),
// signalled through the room's HTTP inbox, plus a data channel per connection for chat, reactions
// and who-is-muted state. React reads it through subscribe()/snapshot().
//
// Every connection has the same fixed layout, created once by the participant who joined later:
// transceiver 0 is the microphone, 1 the camera and 2 the screen share, then the data channel.
// Turning the camera off or starting a share only swaps tracks (replaceTrack), so the call never
// renegotiates after it is set up, and both sides know which incoming track is which by position.

export type PublicPeer = { id: string; name: string; joinedAt: number; host: boolean };
export type Settings = { locked: boolean; waitingRoom: boolean };
export type Phase = "joining" | "waiting" | "in" | "left" | "denied" | "removed" | "ended" | "error";

/** What each participant shares about themselves over the data channel. */
export type PeerState = { muted: boolean; camOff: boolean; hand: boolean; sharing: boolean; recording: boolean };

export type Remote = PeerState &
  PublicPeer & {
    conn: "connecting" | "connected" | "reconnecting" | "failed";
    /** Microphone + camera. */
    media: MediaStream;
    screen: MediaStream;
    /** 0 unknown, 1 poor, 2 fair, 3 good. */
    quality: 0 | 1 | 2 | 3;
  };

export type ChatMessage = { id: string; from: string; name: string; text: string; at: number };
export type Reaction = { id: string; from: string; emoji: string };
export type Notice = { id: string; text: string };

export type MeetingState = {
  phase: Phase;
  error: string | null;
  code: string;
  title: string;
  startedAt: number;
  self: PublicPeer & PeerState;
  remotes: Remote[];
  waiting: PublicPeer[];
  settings: Settings;
  chat: ChatMessage[];
  reactions: Reaction[];
  notices: Notice[];
  /** Participants whose microphone is loud right now; "self" is the local user. */
  speaking: string[];
  activeSpeaker: string | null;
};

type Link = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  offerer: boolean;
  candidates: RTCIceCandidateInit[];
  out: unknown[];
  sending: Promise<void>;
  seq: number;
  analyser: AnalyserNode | null;
  /** Set once the description is out; candidates found after that are trickled one by one. */
  described: boolean;
};

type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type Wire =
  | ({ t: "state"; name: string } & PeerState)
  | { t: "chat"; id: string; text: string; at: number }
  | { t: "react"; emoji: string }
  | { t: "mute" }
  | { t: "lower-hand" };

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Waits for ICE gathering to finish, but not for long. Each signal is an HTTP round trip through
 * the room, so sending the description with its candidates in it saves several of them.
 */
function gathered(pc: RTCPeerConnection, ms = 1500) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((done) => {
    const finish = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      done();
    };
    const check = () => pc.iceGatheringState === "complete" && finish();
    const timer = setTimeout(finish, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}
const SPEAKING = 0.04;

export class Meeting {
  private state: MeetingState;
  private listeners = new Set<() => void>();
  private links = new Map<string, Link>();
  private token = "";
  private iceServers: RTCIceServer[] = [];
  private ack: string[] = [];
  private seen = new Set<string>();
  private polling = false;
  private lastMessageAt = 0;
  private screenTrack: MediaStreamTrack | null = null;
  private audio: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private lastLoud = new Map<string, number>();

  constructor(
    code: string,
    name: string,
    /** Microphone and camera from the lobby; either track may be missing. */
    public local: MediaStream,
    private hostKey: string | null,
  ) {
    const audioOn = local.getAudioTracks().some((t) => t.enabled);
    const camOn = local.getVideoTracks().some((t) => t.readyState === "live");
    this.state = {
      phase: "joining",
      error: null,
      code,
      title: "",
      startedAt: Date.now(),
      self: { id: "", name, joinedAt: 0, host: false, muted: !audioOn, camOff: !camOn, hand: false, sharing: false, recording: false },
      remotes: [],
      waiting: [],
      settings: { locked: false, waitingRoom: false },
      chat: [],
      reactions: [],
      notices: [],
      speaking: [],
      activeSpeaker: null,
    };
  }

  // ---- React plumbing -------------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  snapshot = () => this.state;
  private set(patch: Partial<MeetingState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private setSelf(patch: Partial<MeetingState["self"]>) {
    this.set({ self: { ...this.state.self, ...patch } });
  }
  private setRemote(id: string, patch: Partial<Remote>) {
    this.set({ remotes: this.state.remotes.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }
  /** A short message at the bottom of the call; disappears on its own. */
  toast = (text: string) => this.notice(text);
  private notice(text: string) {
    const n = { id: uid(), text };
    this.set({ notices: [...this.state.notices, n].slice(-4) });
    setTimeout(() => this.set({ notices: this.state.notices.filter((x) => x !== n) }), 4500);
  }

  // ---- joining and leaving --------------------------------------------------------------------

  private async api(path: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/rooms/${this.state.code}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, peerId: this.state.self.id, token: this.token }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error ?? "Request failed"), { status: res.status });
    return json;
  }

  async join() {
    try {
      this.audio = new AudioContext();
      this.watchLocalAudio();
      const [config, joined] = await Promise.all([
        fetch("/api/config").then((r) => r.json()),
        this.api("", { action: "join", name: this.state.self.name, hostKey: this.hostKey }),
      ]);
      this.iceServers = config.iceServers;
      this.token = joined.token;
      this.setSelf({ ...joined.peer });
      this.set({ title: joined.title, settings: joined.settings, waiting: joined.waiting, phase: joined.status === "admitted" ? "in" : "waiting" });
      addEventListener("pagehide", this.beacon);
      if (joined.status === "admitted") this.enter(joined.peers);
      this.timers.push(setInterval(() => this.measure(), 120), setInterval(() => this.checkQuality(), 3000));
      void this.pollLoop();
    } catch (e) {
      this.set({ phase: "error", error: (e as Error).message });
    }
  }

  /** Admitted: connect to everyone already here. As the newest participant, this side offers. */
  private enter(peers: PublicPeer[]) {
    this.set({ phase: "in", startedAt: Date.now() });
    for (const p of peers) {
      this.addRemote(p);
      void this.connect(p.id, true);
    }
  }

  private beacon = () => {
    if (!this.token) return;
    navigator.sendBeacon(`/api/rooms/${this.state.code}`, JSON.stringify({ action: "leave", peerId: this.state.self.id, token: this.token }));
  };

  /** Leaves the meeting, or with `forEveryone` as host, ends it for all. */
  async leave(forEveryone = false) {
    const ending = forEveryone && this.state.self.host && (await this.api("", { action: "end" }).then(() => true, () => false));
    this.beacon();
    this.shutdown(ending ? "ended" : "left");
  }

  private shutdown(phase: Phase) {
    this.token = "";
    removeEventListener("pagehide", this.beacon);
    this.timers.forEach(clearInterval);
    this.links.forEach((l) => l.pc.close());
    this.links.clear();
    this.local.getTracks().forEach((t) => t.stop());
    this.screenTrack?.stop();
    void this.audio?.close();
    this.set({ phase, remotes: [] });
  }

  // ---- the inbox ------------------------------------------------------------------------------

  private async pollLoop() {
    if (this.polling) return;
    this.polling = true;
    let failures = 0;
    while (this.token) {
      try {
        const ack = this.ack;
        this.ack = [];
        const res = await this.api("/poll", { ack });
        failures = 0;
        for (const m of res.messages as { id: string; from: string; type: string; data: unknown }[]) {
          this.ack.push(m.id);
          if (this.seen.has(m.id)) continue;
          this.seen.add(m.id);
          this.lastMessageAt = Date.now();
          await this.handle(m.from, m.type, m.data).catch((e) => console.warn("convene:", m.type, e));
        }
        if (res.ended && this.token) this.shutdown("ended");
        else if (res.status === "removed" && this.token) this.shutdown("removed");
        else if (res.status === "denied" && this.token) this.shutdown("denied");
      } catch (e) {
        if ((e as { status?: number }).status === 401 && this.token) {
          this.shutdown("error");
          this.set({ error: "You were disconnected from the meeting." });
        }
        failures++;
      }
      // Quick while anything is being set up or just changed; slow and cheap once the call is steady.
      const busy = this.state.phase === "waiting" || Date.now() - this.lastMessageAt < 4000 || this.state.remotes.some((r) => r.conn !== "connected");
      await new Promise((r) => setTimeout(r, failures ? Math.min(8000, 500 * 2 ** failures) : busy ? 350 : 2000));
    }
    this.polling = false;
  }

  private async handle(from: string, type: string, data: unknown) {
    switch (type) {
      case "signal":
        for (const s of data as Signal[]) await this.onSignal(from, s);
        return;
      case "peer-joined": {
        const p = data as PublicPeer;
        this.addRemote(p);
        this.notice(`${p.name} joined`);
        this.set({ waiting: this.state.waiting.filter((w) => w.id !== p.id) });
        return;
      }
      case "peer-left": {
        const { id } = data as { id: string };
        const r = this.state.remotes.find((x) => x.id === id);
        this.drop(id);
        if (r) this.notice(`${r.name} left`);
        return;
      }
      case "knock": {
        const p = data as PublicPeer;
        if (!this.state.waiting.some((w) => w.id === p.id)) this.set({ waiting: [...this.state.waiting, p] });
        this.notice(`${p.name} is in the waiting room`);
        return;
      }
      case "knock-cancelled":
        this.set({ waiting: this.state.waiting.filter((w) => w.id !== (data as { id: string }).id) });
        return;
      case "admitted":
        this.enter((data as { peers: PublicPeer[] }).peers);
        return;
      case "settings":
        this.set({ settings: data as Settings });
        return;
    }
  }

  // ---- connections ----------------------------------------------------------------------------

  private addRemote(p: PublicPeer) {
    if (this.state.remotes.some((r) => r.id === p.id)) return;
    const remote: Remote = {
      ...p,
      muted: false,
      camOff: false,
      hand: false,
      sharing: false,
      recording: false,
      conn: "connecting",
      media: new MediaStream(),
      screen: new MediaStream(),
      quality: 0,
    };
    this.set({ remotes: [...this.state.remotes, remote].sort((a, b) => a.joinedAt - b.joinedAt) });
  }

  private drop(id: string) {
    this.links.get(id)?.pc.close();
    this.links.delete(id);
    this.lastLoud.delete(id);
    this.set({ remotes: this.state.remotes.filter((r) => r.id !== id), speaking: this.state.speaking.filter((s) => s !== id) });
  }

  private connect(id: string, offerer: boolean): Link {
    const existing = this.links.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const dc = pc.createDataChannel("convene", { negotiated: true, id: 0 });
    const link: Link = { pc, dc, offerer, candidates: [], out: [], sending: Promise.resolve(), seq: 0, analyser: null, described: false };
    this.links.set(id, link);

    pc.onicecandidate = (e) => e.candidate && link.described && this.send(id, { candidate: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") this.setRemote(id, { conn: "connected" });
      else if (s === "disconnected") this.setRemote(id, { conn: "reconnecting" });
      else if (s === "failed") {
        this.setRemote(id, { conn: "reconnecting" });
        if (link.offerer) void this.offer(id, true);
      }
    };
    dc.onopen = () => this.sendTo(id, this.stateMessage());
    dc.onmessage = (e) => this.onWire(id, JSON.parse(e.data));

    if (offerer) {
      const [mic] = this.local.getAudioTracks();
      const [cam] = this.local.getVideoTracks();
      pc.addTransceiver(mic ?? "audio", { direction: "sendrecv" });
      pc.addTransceiver(cam ?? "video", { direction: "sendrecv" });
      pc.addTransceiver(this.screenTrack ?? "video", { direction: "sendrecv" });
      this.bindIncoming(id, link);
      void this.offer(id, false);
    }
    return link;
  }

  /** Hands the incoming microphone, camera and screen tracks to the UI, by transceiver position. */
  private bindIncoming(id: string, link: Link) {
    const [mic, cam, screen] = link.pc.getTransceivers();
    this.setRemote(id, { media: new MediaStream([mic.receiver.track, cam.receiver.track]), screen: new MediaStream([screen.receiver.track]) });
    if (this.audio) {
      const source = this.audio.createMediaStreamSource(new MediaStream([mic.receiver.track]));
      link.analyser = this.audio.createAnalyser();
      link.analyser.fftSize = 512;
      source.connect(link.analyser);
    }
  }

  private async offer(id: string, restart: boolean) {
    const link = this.links.get(id);
    if (!link) return;
    if (restart) link.pc.restartIce();
    link.described = false;
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await gathered(link.pc);
    link.described = true;
    this.send(id, { description: link.pc.localDescription!.toJSON() });
  }

  private async onSignal(from: string, s: Signal) {
    if (s.description?.type === "offer") {
      const fresh = !this.links.has(from);
      const link = this.connect(from, false);
      await link.pc.setRemoteDescription(s.description);
      if (fresh) {
        // Answerer: take the offerer's three slots and put this side's tracks in them.
        const [mic, cam, screen] = link.pc.getTransceivers();
        mic.direction = cam.direction = screen.direction = "sendrecv";
        await mic.sender.replaceTrack(this.local.getAudioTracks()[0] ?? null);
        await cam.sender.replaceTrack(this.local.getVideoTracks()[0] ?? null);
        await screen.sender.replaceTrack(this.screenTrack);
        this.bindIncoming(from, link);
      }
      await this.flushCandidates(link);
      link.described = false;
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      await gathered(link.pc);
      link.described = true;
      this.send(from, { description: link.pc.localDescription!.toJSON() });
    } else if (s.description?.type === "answer") {
      const link = this.links.get(from);
      if (!link || link.pc.signalingState !== "have-local-offer") return;
      await link.pc.setRemoteDescription(s.description);
      await this.flushCandidates(link);
    } else if (s.candidate) {
      const link = this.links.get(from);
      if (!link) return;
      if (link.pc.remoteDescription) await link.pc.addIceCandidate(s.candidate).catch(() => {});
      else link.candidates.push(s.candidate);
    }
  }

  private async flushCandidates(link: Link) {
    for (const c of link.candidates.splice(0)) await link.pc.addIceCandidate(c).catch(() => {});
  }

  /** Queues a signal; signals to one participant go out in small ordered batches. */
  private send(to: string, s: Signal) {
    const link = this.links.get(to);
    if (!link) return;
    link.out.push(s);
    if (link.out.length > 1) return;
    link.sending = link.sending
      .then(() => new Promise((r) => setTimeout(r, 40)))
      .then(async () => {
        const data = link.out.splice(0);
        await this.api("", { action: "signal", to, seq: ++link.seq, data }).catch(() => {});
      });
  }

  // ---- the data channel -----------------------------------------------------------------------

  private stateMessage(): Wire {
    const { name, muted, camOff, hand, sharing, recording } = this.state.self;
    return { t: "state", name, muted, camOff, hand, sharing, recording };
  }
  private sendTo(id: string, msg: Wire) {
    const dc = this.links.get(id)?.dc;
    if (dc?.readyState === "open") dc.send(JSON.stringify(msg));
  }
  private broadcast(msg: Wire) {
    for (const id of this.links.keys()) this.sendTo(id, msg);
  }
  private shareState() {
    this.broadcast(this.stateMessage());
  }

  private onWire(from: string, msg: Wire) {
    const r = this.state.remotes.find((x) => x.id === from);
    if (!r) return;
    if (msg.t === "state") {
      if (msg.hand && !r.hand) this.notice(`${r.name} raised their hand ✋`);
      if (msg.sharing && !r.sharing) this.notice(`${r.name} is sharing their screen`);
      if (msg.recording && !r.recording) this.notice(`${r.name} started recording`);
      this.setRemote(from, { muted: msg.muted, camOff: msg.camOff, hand: msg.hand, sharing: msg.sharing, recording: msg.recording });
    } else if (msg.t === "chat") {
      const text = String(msg.text).slice(0, 2000);
      this.set({ chat: [...this.state.chat, { id: msg.id, from, name: r.name, text, at: msg.at }] });
    } else if (msg.t === "react") {
      this.addReaction(from, String(msg.emoji).slice(0, 8));
    } else if (msg.t === "mute" && r.host) {
      if (!this.state.self.muted) this.toggleMic();
      this.notice(`${r.name} muted you`);
    } else if (msg.t === "lower-hand" && r.host) {
      this.setSelf({ hand: false });
      this.shareState();
    }
  }

  // ---- controls -------------------------------------------------------------------------------

  toggleMic() {
    const muted = !this.state.self.muted;
    this.local.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.setSelf({ muted });
    this.shareState();
  }

  async toggleCamera(deviceId?: string) {
    if (!this.state.self.camOff) {
      this.local.getVideoTracks().forEach((t) => {
        t.stop();
        this.local.removeTrack(t);
      });
      await this.replace(1, null);
      this.setSelf({ camOff: true });
    } else {
      const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(deviceId) });
      const [track] = s.getVideoTracks();
      this.local.addTrack(track);
      await this.replace(1, track);
      this.setSelf({ camOff: false });
    }
    this.shareState();
  }

  /** Switches the microphone or camera to another device without dropping the call. */
  async switchDevice(kind: "audioinput" | "videoinput", deviceId: string) {
    const video = kind === "videoinput";
    if (video && this.state.self.camOff) return;
    const s = await navigator.mediaDevices.getUserMedia(video ? { video: videoConstraints(deviceId) } : { audio: audioConstraints(deviceId) });
    const [track] = video ? s.getVideoTracks() : s.getAudioTracks();
    const old = video ? this.local.getVideoTracks() : this.local.getAudioTracks();
    if (!video) track.enabled = !this.state.self.muted;
    old.forEach((t) => {
      t.stop();
      this.local.removeTrack(t);
    });
    this.local.addTrack(track);
    await this.replace(video ? 1 : 0, track);
    if (!video) this.watchLocalAudio();
  }

  private async replace(slot: number, track: MediaStreamTrack | null) {
    await Promise.all([...this.links.values()].map((l) => l.pc.getTransceivers()[slot]?.sender.replaceTrack(track)));
  }

  async startShare() {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    const [track] = s.getVideoTracks();
    track.contentHint = "detail";
    track.onended = () => void this.stopShare();
    this.screenTrack = track;
    await this.replace(2, track);
    this.setSelf({ sharing: true });
    this.shareState();
    return track;
  }

  async stopShare() {
    this.screenTrack?.stop();
    this.screenTrack = null;
    await this.replace(2, null);
    this.setSelf({ sharing: false });
    this.shareState();
  }

  get screen() {
    return this.screenTrack;
  }

  toggleHand() {
    this.setSelf({ hand: !this.state.self.hand });
    this.shareState();
  }

  setRecording(recording: boolean) {
    this.setSelf({ recording });
    this.shareState();
  }

  sendChat(text: string) {
    const clean = text.trim().slice(0, 2000);
    if (!clean) return;
    const msg = { id: uid(), text: clean, at: Date.now() };
    this.broadcast({ t: "chat", ...msg });
    this.set({ chat: [...this.state.chat, { ...msg, from: "self", name: this.state.self.name }] });
  }

  react(emoji: string) {
    this.broadcast({ t: "react", emoji });
    this.addReaction("self", emoji);
  }

  private addReaction(from: string, emoji: string) {
    const r = { id: uid(), from, emoji };
    this.set({ reactions: [...this.state.reactions, r] });
    setTimeout(() => this.set({ reactions: this.state.reactions.filter((x) => x !== r) }), 3200);
  }

  // ---- host controls --------------------------------------------------------------------------

  admit = (id: string) => this.hostCall("admit", id);
  deny = (id: string) => this.hostCall("deny", id);
  remove = (id: string) => this.hostCall("remove", id);
  muteParticipant = (id: string) => this.sendTo(id, { t: "mute" });
  lowerHand = (id: string) => this.sendTo(id, { t: "lower-hand" });
  muteAll = () => this.broadcast({ t: "mute" });

  private async hostCall(action: string, target: string) {
    try {
      await this.api("", { action, target });
      if (action !== "remove") this.set({ waiting: this.state.waiting.filter((w) => w.id !== target) });
    } catch (e) {
      this.notice((e as Error).message);
    }
  }

  async updateSettings(patch: Partial<Settings>) {
    this.set({ settings: { ...this.state.settings, ...patch } });
    await this.api("", { action: "settings", ...patch }).catch((e) => this.notice((e as Error).message));
  }

  // ---- levels and quality ---------------------------------------------------------------------

  private watchLocalAudio() {
    if (!this.audio) return;
    const [mic] = this.local.getAudioTracks();
    if (!mic) return;
    this.localAnalyser = this.audio.createAnalyser();
    this.localAnalyser.fftSize = 512;
    this.audio.createMediaStreamSource(new MediaStream([mic])).connect(this.localAnalyser);
  }

  private measure() {
    const now = Date.now();
    const level = (a: AnalyserNode | null) => {
      if (!a) return 0;
      const buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      return Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
    };
    const levels: [string, number][] = [["self", this.state.self.muted ? 0 : level(this.localAnalyser)]];
    for (const [id, link] of this.links) levels.push([id, this.state.remotes.find((r) => r.id === id)?.muted ? 0 : level(link.analyser)]);
    for (const [id, v] of levels) if (v > SPEAKING) this.lastLoud.set(id, now);
    // Speaking holds for a moment after the voice drops, so highlights don't flicker between words.
    const speaking = levels.filter(([id]) => now - (this.lastLoud.get(id) ?? 0) < 600).map(([id]) => id);
    const loudest = levels.filter(([, v]) => v > SPEAKING).sort((a, b) => b[1] - a[1])[0]?.[0];
    const active = loudest ?? this.state.activeSpeaker;
    if (speaking.join() !== this.state.speaking.join() || active !== this.state.activeSpeaker) this.set({ speaking, activeSpeaker: active ?? null });
  }

  private async checkQuality() {
    for (const [id, link] of this.links) {
      if (link.pc.connectionState !== "connected") continue;
      let rtt = 0;
      let lost = 0;
      let received = 0;
      (await link.pc.getStats()).forEach((s) => {
        if (s.type === "candidate-pair" && s.nominated && s.currentRoundTripTime !== undefined) rtt = s.currentRoundTripTime;
        if (s.type === "inbound-rtp") {
          lost += s.packetsLost ?? 0;
          received += s.packetsReceived ?? 0;
        }
      });
      const loss = received ? lost / (lost + received) : 0;
      const quality = rtt > 0.4 || loss > 0.08 ? 1 : rtt > 0.2 || loss > 0.02 ? 2 : 3;
      if (this.state.remotes.find((r) => r.id === id)?.quality !== quality) this.setRemote(id, { quality });
    }
  }
}

export const videoConstraints = (deviceId?: string): MediaTrackConstraints => ({
  deviceId: deviceId ? { exact: deviceId } : undefined,
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
});

export const audioConstraints = (deviceId?: string): MediaTrackConstraints => ({
  deviceId: deviceId ? { exact: deviceId } : undefined,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
});
