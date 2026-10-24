// A virtual webcam and microphone for the demo recording, injected before the page loads.
// getUserMedia returns an illustrated person drawn on a canvas, plus a microphone track whose
// "voice" is band-passed noise shaped into syllables. window.__persona.say(ms) makes them talk
// (mouth and audio together), so the app's real speaking detection lights up their tile.
// getDisplayMedia returns a drawn slide deck; __persona.nextSlide() advances it.
(() => {
  const P = window.__PERSONA__;
  if (!P || window.top !== window) return;
  const W = 960, H = 540;
  let level = 0, talkingUntil = 0, slide = 0;

  // ---- voice ------------------------------------------------------------------------------------
  let ctx, gain, dest;
  function audioTrack() {
    if (!ctx) {
      ctx = new AudioContext();
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = P.pitch ?? 700;
      band.Q.value = 0.9;
      gain = ctx.createGain();
      gain.gain.value = 0;
      dest = ctx.createMediaStreamDestination();
      src.connect(band).connect(gain).connect(dest);
      src.start();
    }
    return dest.stream.getAudioTracks()[0].clone();
  }
  setInterval(() => {
    const talking = Date.now() < talkingUntil;
    // Syllables: a new loudness every ~110 ms, with short gaps between words.
    const target = talking ? (Math.random() < 0.18 ? 0.05 : 0.45 + Math.random() * 0.55) : 0;
    level = target;
    if (gain) gain.gain.setTargetAtTime(target * 1.6, ctx.currentTime, 0.03);
  }, 110);

  // ---- face -------------------------------------------------------------------------------------
  const cam = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = cam.getContext("2d");
  let mouth = 0, blinkAt = performance.now() + 1500 + Math.random() * 2500;

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  }

  function room(t) {
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, P.wall[0]);
    wall.addColorStop(1, P.wall[1]);
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    if (P.scene === "window") {
      g.fillStyle = "rgba(255,255,255,.55)";
      roundRect(W - 300, 60, 220, 260, 10);
      g.fill();
      g.strokeStyle = "rgba(120,110,95,.6)";
      g.lineWidth = 8;
      g.stroke();
      g.beginPath();
      g.moveTo(W - 190, 60);
      g.lineTo(W - 190, 320);
      g.moveTo(W - 300, 190);
      g.lineTo(W - 80, 190);
      g.stroke();
    } else if (P.scene === "shelf") {
      g.fillStyle = "rgba(70,50,35,.55)";
      g.fillRect(40, 160, 230, 14);
      g.fillRect(40, 290, 230, 14);
      const books = ["#c0563f", "#3f6ec0", "#d9a441", "#4d8a5b", "#8b5fbf", "#e07a5f", "#2f4858"];
      for (let row = 0; row < 2; row++)
        for (let i = 0; i < 9; i++) {
          g.fillStyle = books[(i * 3 + row) % books.length];
          const h = 70 + ((i * 17 + row * 7) % 30);
          g.fillRect(50 + i * 24, (row ? 290 : 160) - h, 20, h);
        }
    } else if (P.scene === "plant") {
      g.fillStyle = "#b5714a";
      roundRect(W - 210, H - 170, 110, 120, 12);
      g.fill();
      g.fillStyle = "#3f8a52";
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.38 + Math.sin(t / 1400 + i) * 0.03;
        g.save();
        g.translate(W - 155, H - 170);
        g.rotate(a);
        g.beginPath();
        g.ellipse(0, -80, 22, 80, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    } else if (P.scene === "art") {
      g.fillStyle = "#fff";
      roundRect(60, 70, 200, 150, 6);
      g.fill();
      g.fillStyle = "#f2c14e";
      g.beginPath();
      g.arc(120, 130, 32, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#5b8def";
      g.beginPath();
      g.moveTo(70, 210);
      g.lineTo(150, 140);
      g.lineTo(250, 210);
      g.fill();
    }
    // Soft light from the screen in front of them.
    const glow = g.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, W * 0.7);
    glow.addColorStop(0, "rgba(255,255,255,.10)");
    glow.addColorStop(1, "rgba(0,0,0,.28)");
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
  }

  function person(t) {
    const cx = W / 2 + Math.sin(t / 1700) * 8 + Math.sin(t / 900) * 2;
    const cy = 225 + Math.sin(t / 1300) * 3;
    const talk = Date.now() < talkingUntil;
    mouth += ((talk ? level : 0) - mouth) * 0.45;

    // Long hair falls behind the shoulders, so it is drawn first.
    if (P.hair === "long") {
      g.fillStyle = P.hairColor;
      roundRect(cx - 118, cy - 70, 236, 260, 90);
      g.fill();
    }
    // Shoulders and shirt.
    g.fillStyle = P.shirt;
    g.beginPath();
    g.ellipse(cx, H + 70, 290, 225, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = P.skinShade;
    g.fillRect(cx - 34, cy + 80, 68, 90);
    g.fillStyle = P.shirt;
    g.beginPath();
    g.moveTo(cx - 70, cy + 170);
    g.quadraticCurveTo(cx, cy + 235, cx + 70, cy + 170);
    g.lineTo(cx + 120, H);
    g.lineTo(cx - 120, H);
    g.fill();
    g.fillStyle = P.skinShade;
    g.beginPath();
    g.moveTo(cx - 40, cy + 160);
    g.quadraticCurveTo(cx, cy + 215, cx + 40, cy + 160);
    g.fill();

    // Ears and head.
    g.fillStyle = P.skinShade;
    g.beginPath();
    g.ellipse(cx - 96, cy + 8, 16, 26, 0, 0, Math.PI * 2);
    g.ellipse(cx + 96, cy + 8, 16, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = P.skin;
    g.beginPath();
    g.ellipse(cx, cy, 98, 120, 0, 0, Math.PI * 2);
    g.fill();

    // Hair on top.
    g.fillStyle = P.hairColor;
    if (P.hair === "short" || P.hair === "long" || P.hair === "bun") {
      g.beginPath();
      g.ellipse(cx, cy - 58, 104, 76, 0, Math.PI * 1.02, Math.PI * 1.98);
      g.quadraticCurveTo(cx + 40, cy - 70, cx - 20, cy - 92);
      g.quadraticCurveTo(cx - 70, cy - 80, cx - 102, cy - 40);
      g.fill();
    }
    if (P.hair === "bun") {
      g.beginPath();
      g.arc(cx + 8, cy - 140, 40, 0, Math.PI * 2);
      g.fill();
    }
    if (P.hair === "curly") {
      for (let i = 0; i < 16; i++) {
        const a = Math.PI + (i / 15) * Math.PI;
        g.beginPath();
        g.arc(cx + Math.cos(a) * 92, cy - 40 + Math.sin(a) * 95, 30, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Eyes: look around a little, blink every few seconds.
    const look = Math.sin(t / 2300) * 4;
    const blinking = t > blinkAt && t < blinkAt + 140;
    if (t > blinkAt + 140) blinkAt = t + 2500 + Math.random() * 3000;
    for (const side of [-1, 1]) {
      const ex = cx + side * 38;
      const ey = cy - 2;
      if (blinking) {
        g.strokeStyle = "#2a1f1a";
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(ex - 13, ey);
        g.lineTo(ex + 13, ey);
        g.stroke();
      } else {
        g.fillStyle = "#fff";
        g.beginPath();
        g.ellipse(ex, ey, 15, 11, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#2a1f1a";
        g.beginPath();
        g.arc(ex + look, ey + 1, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = P.hairColor;
      g.lineWidth = 6;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(ex - 16, ey - 24 - (talk ? level * 3 : 0));
      g.quadraticCurveTo(ex, ey - 32 - (talk ? level * 4 : 0), ex + 16, ey - 24);
      g.stroke();
    }
    if (P.glasses) {
      g.strokeStyle = "#1d1d1f";
      g.lineWidth = 5;
      roundRect(cx - 62, cy - 20, 50, 38, 10);
      g.stroke();
      roundRect(cx + 12, cy - 20, 50, 38, 10);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 12, cy - 4);
      g.lineTo(cx + 12, cy - 4);
      g.stroke();
    }
    // Nose.
    g.strokeStyle = P.skinShade;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx - 4, cy + 18);
    g.quadraticCurveTo(cx + 8, cy + 36, cx - 6, cy + 40);
    g.stroke();
    if (P.beard) {
      g.fillStyle = P.hairColor;
      g.beginPath();
      g.ellipse(cx, cy + 78, 76, 46, 0, 0, Math.PI);
      g.fill();
    }
    // Mouth: a smile at rest, open in time with the voice.
    const open = mouth * 26;
    if (open > 2) {
      g.fillStyle = "#5b2326";
      g.beginPath();
      g.ellipse(cx, cy + 66, 22, 3 + open / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.fillRect(cx - 12, cy + 64 - open / 2, 24, Math.min(5, open / 3));
    } else {
      g.strokeStyle = "#8a3b3b";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - 22, cy + 62);
      g.quadraticCurveTo(cx, cy + 76, cx + 22, cy + 62);
      g.stroke();
    }
  }

  setInterval(() => {
    const t = performance.now();
    room(t);
    person(t);
  }, 1000 / 24);

  // ---- slides -----------------------------------------------------------------------------------
  const deck = Object.assign(document.createElement("canvas"), { width: 1280, height: 720 });
  const d = deck.getContext("2d");
  const SLIDES = [
    {
      title: "Q4 product roadmap",
      cols: [
        ["Now", ["Faster onboarding", "Team workspaces", "Usage-based billing"]],
        ["Next", ["Mobile app beta", "SSO for enterprise", "Audit log"]],
        ["Later", ["Offline mode", "Public API v2", "Marketplace"]],
      ],
    },
    { title: "Activation is up 18%", bars: [42, 47, 51, 55, 61, 64, 70] },
  ];
  setInterval(() => {
    const s = SLIDES[slide % SLIDES.length];
    d.fillStyle = "#f7f7fb";
    d.fillRect(0, 0, 1280, 720);
    d.fillStyle = "#5b5bd6";
    d.fillRect(0, 0, 1280, 10);
    d.fillStyle = "#14141f";
    d.font = "600 54px system-ui, sans-serif";
    d.fillText(s.title, 80, 120);
    d.fillStyle = "#6b6b80";
    d.font = "26px system-ui, sans-serif";
    d.fillText("Acme · Planning", 80, 165);
    if (s.cols)
      s.cols.forEach(([head, items], i) => {
        const x = 80 + i * 380;
        d.fillStyle = "#fff";
        d.strokeStyle = "#e3e3ee";
        d.lineWidth = 2;
        d.beginPath();
        d.roundRect(x, 220, 340, 400, 18);
        d.fill();
        d.stroke();
        d.fillStyle = ["#5b5bd6", "#e5833a", "#1f9d74"][i];
        d.font = "600 30px system-ui, sans-serif";
        d.fillText(head, x + 30, 275);
        d.fillStyle = "#2c2c3a";
        d.font = "26px system-ui, sans-serif";
        items.forEach((it, j) => {
          d.beginPath();
          d.arc(x + 38, 338 + j * 70, 6, 0, Math.PI * 2);
          d.fill();
          d.fillText(it, x + 58, 347 + j * 70);
        });
      });
    if (s.bars)
      s.bars.forEach((v, i) => {
        d.fillStyle = i === s.bars.length - 1 ? "#5b5bd6" : "#c7c7f2";
        const h = v * 5.5;
        d.beginPath();
        d.roundRect(120 + i * 150, 640 - h, 100, h, 10);
        d.fill();
        d.fillStyle = "#6b6b80";
        d.font = "22px system-ui, sans-serif";
        d.fillText(["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"][i], 140 + i * 150, 680);
      });
  }, 200);

  const md = navigator.mediaDevices;
  md.getUserMedia = async (c = {}) => {
    const tracks = [];
    if (c.video) tracks.push(cam.captureStream(24).getVideoTracks()[0]);
    if (c.audio) tracks.push(audioTrack());
    return new MediaStream(tracks);
  };
  md.getDisplayMedia = async () => deck.captureStream(15);
  md.enumerateDevices = async () => [
    { kind: "videoinput", deviceId: "cam-1", label: "HD Webcam", groupId: "a" },
    { kind: "videoinput", deviceId: "cam-2", label: "Desk Camera", groupId: "b" },
    { kind: "audioinput", deviceId: "mic-1", label: "Built-in Microphone", groupId: "a" },
    { kind: "audioinput", deviceId: "mic-2", label: "USB Headset", groupId: "c" },
    { kind: "audiooutput", deviceId: "spk-1", label: "Built-in Speakers", groupId: "a" },
    { kind: "audiooutput", deviceId: "spk-2", label: "USB Headset", groupId: "c" },
  ];

  window.__persona = {
    say: (ms) => (talkingUntil = Date.now() + ms),
    nextSlide: () => slide++,
  };
})();
