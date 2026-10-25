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

/** What each participant shares about themselves over the data channel. `cc`: wants live captions. */
export type PeerState = { muted: boolean; camOff: boolean; hand: boolean; sharing: boolean; recording: boolean; cc: boolean };

export type Remote = PeerState &
  PublicPeer & {
    conn: "connecting" | "connected" | "reconnecting" | "failed";
    /** Microphone + camera. */
    media: MediaStream;
    screen: MediaStream;
    /** 0 unknown, 1 poor, 2 fair, 3 good. */
    quality: 0 | 1 | 2 | 3;
  };

/** `to` is set on private messages (the other person's id); `app` on messages posted through the API. */
export type ChatMessage = { id: string; from: string; name: string; text: string; at: number; to?: string; app?: boolean };
export type Reaction = { id: string; from: string; emoji: string };
export type Notice = { id: string; text: string; action?: { label: string; run: () => void } };
/** One speaker's latest line of live captions. */
export type Caption = { from: string; name: string; text: string; at: number };

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
  /** Who the host has spotlighted for everyone ("self" for this user). */
  spotlight: string | null;
  captions: Caption[];
  /** Captions can't run in this browser (no speech recognition). */
  captionsUnavailable: boolean;
  /** The microphone is muted but the user seems to be talking. */
  talkingWhileMuted: boolean;
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
  | { t: "chat"; id: string; text: string; at: number; private?: boolean }
  | { t: "react"; emoji: string }
  | { t: "mute" }
  | { t: "lower-hand" }
  | { t: "spotlight"; id: string | null }
  | { t: "caption"; text: string };

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SpeechRecognitionImpl = () => (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

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
  private recognition: Recognition | null = null;
  private levelTrack: MediaStreamTrack | null = null;
  private loudWhileMuted = 0;
  private pushToTalk = false;
  /** Sound effects for joins, leaves and knocks; off for tests and recordings with ?quiet. */
  sounds = true;

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
      self: { id: "", name, joinedAt: 0, host: false, muted: !audioOn, camOff: !camOn, hand: false, sharing: false, recording: false, cc: false },
      remotes: [],
      waiting: [],
      settings: { locked: false, waitingRoom: false },
      chat: [],
      reactions: [],
      notices: [],
      speaking: [],
      activeSpeaker: null,
      spotlight: null,
      captions: [],
      captionsUnavailable: false,
      talkingWhileMuted: false,
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
  private notice(text: string, action?: Notice["action"], ms = 4500) {
    const n: Notice = { id: uid(), text, action };
    this.set({ notices: [...this.state.notices, n].slice(-4) });
    setTimeout(() => this.dismiss(n.id), ms);
  }
  dismiss = (id: string) => this.set({ notices: this.state.notices.filter((x) => x.id !== id) });

  /** A soft two-note chime, synthesised: up for arrivals, down for departures. */
  private chime(kind: "in" | "out" | "knock") {
    if (!this.sounds || !this.audio || this.audio.state !== "running") return;
    const notes = kind === "in" ? [660, 880] : kind === "out" ? [740, 494] : [880, 880];
    const t0 = this.audio.currentTime;
    notes.forEach((f, i) => {
      const o = this.audio!.createOscillator();
      const g = this.audio!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const at = t0 + i * 0.13;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.06, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      o.connect(g).connect(this.audio!.destination);
      o.start(at);
      o.stop(at + 0.4);
    });
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
    this.stopCaptions();
    this.levelTrack?.stop();
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
        this.chime("in");
        this.set({ waiting: this.state.waiting.filter((w) => w.id !== p.id) });
        return;
      }
      case "peer-left": {
        const { id } = data as { id: string };
        const r = this.state.remotes.find((x) => x.id === id);
        this.drop(id);
        if (r) {
          this.notice(`${r.name} left`);
          this.chime("out");
        }
        return;
      }
      case "knock": {
        const p = data as PublicPeer;
        if (!this.state.waiting.some((w) => w.id === p.id)) this.set({ waiting: [...this.state.waiting, p] });
        this.notice(`${p.name} is in the waiting room`, { label: "Admit", run: () => void this.admit(p.id) }, 9000);
        this.chime("knock");
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
      case "app-message": {
        const m = data as { id: string; app: string; appId: string; text: string; at: number };
        this.set({ chat: [...this.state.chat, { id: m.id, from: `app:${m.appId}`, name: m.app, text: m.text, at: m.at, app: true }] });
        this.notice(`${m.app}: ${m.text.length > 80 ? `${m.text.slice(0, 80)}…` : m.text}`);
        return;
      }
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
      cc: false,
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
    this.set({
      remotes: this.state.remotes.filter((r) => r.id !== id),
      speaking: this.state.speaking.filter((s) => s !== id),
      spotlight: this.state.spotlight === id ? null : this.state.spotlight,
      captions: this.state.captions.filter((c) => c.from !== id),
    });
    this.syncCaptions();
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
    dc.onopen = () => {
      this.sendTo(id, this.stateMessage());
      // A host tells newcomers who is in the spotlight.
      if (this.state.self.host && this.state.spotlight) this.sendTo(id, { t: "spotlight", id: this.state.spotlight === "self" ? this.state.self.id : this.state.spotlight });
    };
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
    const { name, muted, camOff, hand, sharing, recording, cc } = this.state.self;
    return { t: "state", name, muted, camOff, hand, sharing, recording, cc };
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
      this.setRemote(from, { muted: msg.muted, camOff: msg.camOff, hand: msg.hand, sharing: msg.sharing, recording: msg.recording, cc: Boolean(msg.cc) });
      this.syncCaptions();
    } else if (msg.t === "chat") {
      const text = String(msg.text).slice(0, 2000);
      this.set({ chat: [...this.state.chat, { id: msg.id, from, name: r.name, text, at: msg.at, to: msg.private ? "self" : undefined }] });
      if (msg.private) this.notice(`${r.name} (privately): ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`);
    } else if (msg.t === "react") {
      this.addReaction(from, String(msg.emoji).slice(0, 8));
    } else if (msg.t === "mute" && r.host) {
      if (!this.state.self.muted) this.toggleMic();
      this.notice(`${r.name} muted you`);
    } else if (msg.t === "lower-hand" && r.host) {
      this.setSelf({ hand: false });
      this.shareState();
    } else if (msg.t === "spotlight" && r.host) {
      const id = msg.id === this.state.self.id ? "self" : msg.id;
      this.set({ spotlight: id });
      if (id) this.notice(id === "self" ? `${r.name} spotlighted you for everyone` : `${r.name} spotlighted ${this.state.remotes.find((x) => x.id === id)?.name ?? "someone"}`);
    } else if (msg.t === "caption") {
      this.showCaption(from, r.name, String(msg.text).slice(0, 300));
    }
  }

  // ---- controls -------------------------------------------------------------------------------

  toggleMic() {
    const muted = !this.state.self.muted;
    this.local.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.setSelf({ muted });
    this.set({ talkingWhileMuted: false });
    this.shareState();
    this.syncCaptions();
  }

  /** Hold the space bar to talk while muted, as in Zoom. */
  holdToTalk(down: boolean) {
    if (down && this.state.self.muted && !this.pushToTalk) {
      this.pushToTalk = true;
      this.toggleMic();
    } else if (!down && this.pushToTalk) {
      this.pushToTalk = false;
      if (!this.state.self.muted) this.toggleMic();
    }
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

  /** Sends to everyone, or privately to one participant. */
  sendChat(text: string, to?: string) {
    const clean = text.trim().slice(0, 2000);
    if (!clean) return;
    const msg = { id: uid(), text: clean, at: Date.now() };
    if (to) this.sendTo(to, { t: "chat", ...msg, private: true });
    else this.broadcast({ t: "chat", ...msg });
    this.set({ chat: [...this.state.chat, { ...msg, from: "self", name: this.state.self.name, to }] });
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

  /** Host: put someone on everyone's main stage (or clear it with null). */
  setSpotlight(id: string | null) {
    if (!this.state.self.host) return;
    this.set({ spotlight: id });
    this.broadcast({ t: "spotlight", id: id === "self" ? this.state.self.id : id });
  }

  // ---- live captions --------------------------------------------------------------------------
  // Each browser transcribes its own microphone (Web Speech API) while anyone in the call has
  // captions on, and sends the text over the data channel. Audio never goes anywhere new.

  toggleCaptions() {
    if (!SpeechRecognitionImpl() && !this.state.self.cc) this.set({ captionsUnavailable: true });
    this.setSelf({ cc: !this.state.self.cc });
    this.shareState();
    this.syncCaptions();
  }

  private syncCaptions() {
    const wanted = (this.state.self.cc || this.state.remotes.some((r) => r.cc)) && !this.state.self.muted && this.state.phase === "in";
    if (wanted && !this.recognition) this.startCaptions();
    else if (!wanted && this.recognition) this.stopCaptions();
  }

  private startCaptions() {
    const Impl = SpeechRecognitionImpl();
    if (!Impl) return;
    const rec = new Impl();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    let last = 0;
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      const text = r[0].transcript.trim();
      if (!text) return;
      // Interim results update often; send at most a few a second, and always the final one.
      if (!r.isFinal && Date.now() - last < 250) return;
      last = Date.now();
      this.broadcast({ t: "caption", text });
      this.showCaption("self", this.state.self.name, text);
    };
    // Recognition stops on its own after a silence; keep it going while captions are wanted.
    rec.onend = () => {
      if (this.recognition === rec) setTimeout(() => this.recognition === rec && rec.start(), 250);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.recognition = null;
        this.set({ captionsUnavailable: true });
      }
    };
    this.recognition = rec;
    try {
      rec.start();
    } catch {
      this.recognition = null;
    }
  }

  private stopCaptions() {
    const rec = this.recognition;
    this.recognition = null;
    rec?.stop();
  }

  private showCaption(from: string, name: string, text: string) {
    if (!this.state.self.cc) return;
    const at = Date.now();
    this.set({ captions: [...this.state.captions.filter((c) => c.from !== from && at - c.at < 6000), { from, name, text, at }].slice(-3) });
    setTimeout(() => this.set({ captions: this.state.captions.filter((c) => Date.now() - c.at < 5500) }), 6000);
  }

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
    this.levelTrack?.stop();
    this.levelTrack = null;
    if (!mic) return;
    // A clone keeps hearing while the real track is muted, so speech while muted can be pointed out.
    this.levelTrack = mic.clone();
    this.levelTrack.enabled = true;
    this.localAnalyser = this.audio.createAnalyser();
    this.localAnalyser.fftSize = 512;
    this.audio.createMediaStreamSource(new MediaStream([this.levelTrack])).connect(this.localAnalyser);
  }

  private measure() {
    const now = Date.now();
    const level = (a: AnalyserNode | null) => {
      if (!a) return 0;
      const buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      return Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
    };
    const mine = level(this.localAnalyser);
    if (this.state.self.muted && mine > SPEAKING * 1.5) this.loudWhileMuted++;
    else this.loudWhileMuted = Math.max(0, this.loudWhileMuted - 1);
    if (this.loudWhileMuted > 10 && !this.state.talkingWhileMuted) {
      this.set({ talkingWhileMuted: true });
      setTimeout(() => this.set({ talkingWhileMuted: false }), 4000);
    }
    const levels: [string, number][] = [["self", this.state.self.muted ? 0 : mine]];
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
