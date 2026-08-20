(() => {
  const root = document.querySelector(".show");
  const layers = ["#far-layer", "#mid-layer", "#front-layer"].map((selector) => document.querySelector(selector));
  const contexts = layers.map((canvas) => canvas.getContext("2d", { alpha: true }));
  const TAU = Math.PI * 2;
  const random = (min, max) => min + Math.random() * (max - min);
  const choose = (items) => items[(Math.random() * items.length) | 0];
  const rgba = (color, alpha) => `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;

  const scenes = {
    1: {
      palette: [[255, 116, 181], [255, 205, 158], [211, 151, 255], [255, 238, 222]],
      shapes: ["bloom", "heart", "petal", "willow"],
      autoDelay: 2900,
    },
    2: {
      palette: [[80, 235, 255], [112, 103, 255], [206, 88, 255], [226, 250, 255]],
      shapes: ["orbit", "helix", "prism", "portal"],
      autoDelay: 2300,
    },
    3: {
      palette: [[130, 231, 255], [224, 249, 255], [111, 169, 255], [193, 154, 255]],
      shapes: ["snowflake", "iceCrown", "icicle", "snowflake"],
      autoDelay: 2100,
    },
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  const requestedScene = Number(new URLSearchParams(window.location.search).get("scene"));
  let scene = [1, 2, 3].includes(requestedScene) ? requestedScene : 1;
  let sceneClicks = 0;
  let transitioning = false;
  let lastFrame = performance.now();
  let lastRenderedFrame = 0;
  let lastAuto = 0;
  let rockets = [];
  let particles = [];
  let rings = [];
  let ambient = [];

  class SceneAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.reverb = null;
      this.noiseBuffer = null;
      this.sceneBus = null;
      this.sources = [];
      this.timer = null;
      this.ready = false;
      this.currentScene = 0;
    }

    async unlock() {
      if (this.ready) {
        if (this.ctx.state === "suspended") await this.ctx.resume();
        return;
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.38;
      this.master.connect(this.ctx.destination);

      this.reverb = this.ctx.createConvolver();
      const impulse = this.ctx.createBuffer(2, this.ctx.sampleRate * 3.2, this.ctx.sampleRate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.7);
        }
      }
      this.reverb.buffer = impulse;
      this.reverb.connect(this.master);

      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const noiseData = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = Math.random() * 2 - 1;

      this.ready = true;
      root.dataset.audio = "ready";
      await this.ctx.resume();
      this.switchScene(scene);
    }

    connectOutput(node, wet = 0.35) {
      node.connect(this.sceneBus || this.master);
      if (wet > 0) {
        const send = this.ctx.createGain();
        send.gain.value = wet;
        node.connect(send);
        send.connect(this.reverb);
      }
    }

    oscillator(frequency, type, gainValue, bus, detune = 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(bus);
      osc.start();
      this.sources.push(osc);
      return { osc, gain };
    }

    makeNoise(bus, filterType, frequency, gainValue) {
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = filterType;
      filter.frequency.value = frequency;
      filter.Q.value = 0.75;
      gain.gain.value = gainValue;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      source.start();
      this.sources.push(source);
      return { source, filter, gain };
    }

    switchScene(nextScene) {
      if (!this.ready || nextScene === this.currentScene) return;
      const now = this.ctx.currentTime;
      const previousBus = this.sceneBus;
      const previousSources = this.sources;
      if (this.timer) clearInterval(this.timer);

      this.sceneBus = this.ctx.createGain();
      this.sceneBus.gain.setValueAtTime(0.0001, now);
      this.sceneBus.gain.exponentialRampToValueAtTime(0.13, now + 1.25);
      this.sceneBus.connect(this.master);
      this.sceneBus.connect(this.reverb);
      this.sources = [];
      this.currentScene = nextScene;
      root.dataset.audioScene = String(nextScene);

      if (previousBus) {
        previousBus.gain.cancelScheduledValues(now);
        previousBus.gain.setValueAtTime(Math.max(previousBus.gain.value, 0.0001), now);
        previousBus.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
        setTimeout(() => previousSources.forEach((source) => { try { source.stop(); } catch {} }), 1200);
      }

      if (nextScene === 1) this.startRomanticScene();
      if (nextScene === 2) this.startCyberScene();
      if (nextScene === 3) this.startWinterScene();
    }

    startRomanticScene() {
      const bus = this.ctx.createGain();
      bus.gain.value = 0.52;
      bus.connect(this.sceneBus);
      [110, 138.59, 164.81, 220].forEach((note, index) => {
        this.oscillator(note, index % 2 ? "triangle" : "sine", index === 0 ? 0.34 : 0.16, bus, index * 3 - 4);
      });
      const lfo = this.oscillator(0.07, "sine", 0.025, bus);
      lfo.osc.connect(lfo.gain);
      this.timer = setInterval(() => {
        if (this.currentScene === 1) this.tone(choose([659.25, 783.99, 987.77]), 1.7, 0.032, "sine", 0.7);
      }, 1750);
    }

    startCyberScene() {
      const bus = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      bus.gain.value = 0.48;
      filter.type = "lowpass";
      filter.frequency.value = 520;
      bus.connect(filter);
      filter.connect(this.sceneBus);
      this.oscillator(55, "sawtooth", 0.23, bus);
      this.oscillator(82.41, "square", 0.11, bus, -5);
      this.makeNoise(this.sceneBus, "bandpass", 2450, 0.008);
      let step = 0;
      this.timer = setInterval(() => {
        if (this.currentScene !== 2) return;
        const notes = [110, 164.81, 220, 146.83];
        this.tone(notes[step % notes.length], 0.23, 0.052, "square", 0.08);
        if (step % 4 === 3) this.noiseHit(1300, 0.12, 0.025);
        step += 1;
      }, 420);
    }

    startWinterScene() {
      const bus = this.ctx.createGain();
      bus.gain.value = 0.48;
      bus.connect(this.sceneBus);
      [65.41, 130.81, 196, 261.63].forEach((note, index) => {
        this.oscillator(note, "sine", index === 0 ? 0.25 : 0.105, bus, index * 4);
      });
      const wind = this.makeNoise(this.sceneBus, "bandpass", 520, 0.027);
      const windLfo = this.oscillator(0.09, "sine", 140, wind.filter);
      windLfo.gain.connect(wind.filter.frequency);
      let step = 0;
      this.timer = setInterval(() => {
        if (this.currentScene !== 3) return;
        const notes = [1046.5, 1318.51, 1567.98, 2093];
        this.tone(notes[step % notes.length], 2.2, 0.025, "sine", 0.9);
        step += 1;
      }, 1420);
    }

    tone(frequency, duration, volume, type = "sine", wet = 0.35, delay = 0) {
      if (!this.ready) return;
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      this.connectOutput(gain, wet);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }

    noiseHit(frequency, duration, volume, x = width / 2) {
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      source.buffer = this.noiseBuffer;
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = 0.7;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      pan.pan.value = Math.max(-0.8, Math.min(0.8, x / width * 2 - 1));
      source.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      this.connectOutput(pan, 0.25);
      source.start(now);
      source.stop(now + duration + 0.05);
    }

    launch(x) {
      if (!this.ready) return;
      const base = scene === 1 ? 190 : scene === 2 ? 105 : 145;
      this.tone(base, 0.48, 0.035, scene === 2 ? "sawtooth" : "sine", 0.25);
      this.tone(scene === 2 ? 1240 : 780, 0.32, 0.018, "sine", 0.45, 0.08);
      if (scene === 3) this.noiseHit(880, 0.35, 0.024, x);
    }

    burst(x, energy) {
      if (!this.ready) return;
      if (scene === 1) {
        this.noiseHit(650, 0.62, 0.05 + energy * 0.012, x);
        [523.25, 659.25, 783.99].slice(0, energy + 1).forEach((note, i) => this.tone(note, 1.45, 0.026, "sine", 0.8, i * 0.045));
      } else if (scene === 2) {
        this.noiseHit(1650, 0.35, 0.07 + energy * 0.014, x);
        this.tone(72, 0.7, 0.12, "sine", 0.1);
        this.tone(920 + energy * 180, 0.42, 0.035, "square", 0.3, 0.025);
      } else {
        this.noiseHit(1120, 0.7, 0.055 + energy * 0.012, x);
        [1046.5, 1318.51, 1567.98].slice(0, energy + 1).forEach((note, i) => this.tone(note, 2.1, 0.024, "sine", 0.9, i * 0.06));
      }
    }

    transition(from, to) {
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = from === 1 ? "sine" : "sawtooth";
      osc.frequency.setValueAtTime(from === 1 ? 180 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(to === 3 ? 1480 : 980, now + 1.25);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
      osc.connect(gain);
      gain.connect(this.master);
      gain.connect(this.reverb);
      osc.start(now);
      osc.stop(now + 1.5);
    }
  }

  const audio = new SceneAudio();

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, width < 700 ? 0.85 : 1);
    layers.forEach((canvas, index) => {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      contexts[index].setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    seedAmbient();
  }

  function seedAmbient() {
    const base = Math.max(48, Math.min(105, Math.round(width * height / 12500)));
    const count = scene === 3 ? Math.round(base * 1.2) : base;
    ambient = Array.from({ length: count }, (_, index) => ({
      x: random(0, width),
      y: random(0, height),
      z: Math.random(),
      size: random(0.5, 2.5),
      speed: random(0.4, 1.3),
      phase: random(0, TAU),
      spin: random(-1.5, 1.5),
      index,
    }));
  }

  function launch(x = random(width * 0.12, width * 0.88), y = random(height * 0.15, height * 0.6), shape = null, energy = 1, depth = random(0.35, 1)) {
    if (rockets.length > 34) rockets.shift();
    const now = performance.now();
    rockets.push({
      x0: x + random(-22, 22),
      y0: height + 26,
      x1: x,
      y1: y,
      x,
      y: height + 26,
      start: now,
      duration: random(720, 1180),
      shape: shape || choose(scenes[scene].shapes),
      scene,
      energy,
      depth,
      color: choose(scenes[scene].palette),
      trail: [],
    });
    audio.launch(x);
  }

  function addParticle(x, y, vx, vy, color, depth, options = {}) {
    const particleLimit = width < 700 ? 360 : 650;
    if (particles.length >= particleLimit) return;
    particles.push({
      x, y, vx, vy, color, depth,
      life: options.life || random(1.25, 2.25),
      maxLife: options.life || 2.25,
      size: options.size || random(0.9, 2.25) * (0.55 + depth * 0.65),
      drag: options.drag || random(0.971, 0.985),
      gravity: options.gravity ?? random(16, 34),
      twinkle: options.twinkle || random(7, 18),
      phase: random(0, TAU),
      trail: [],
    });
  }

  function explode(rocket) {
    const { x, y, shape, depth, color, energy } = rocket;
    const mobileScale = width < 700 ? 0.62 : 1;
    const count = Math.round((34 + energy * 13) * mobileScale * (0.75 + depth * 0.35));
    const speed = (105 + energy * 24) * (0.7 + depth * 0.35);
    root.dataset.lastShape = shape;
    if (shape === "snowflake") root.dataset.snowflakes = String(Number(root.dataset.snowflakes || 0) + 1);

    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      let angle = t * TAU;
      let magnitude = speed * random(0.7, 1.18);
      let vx = 0;
      let vy = 0;

      if (shape === "heart") {
        const a = t * TAU;
        const hx = 16 * Math.pow(Math.sin(a), 3);
        const hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
        vx = hx * speed * 0.058;
        vy = -hy * speed * 0.058;
      } else if (shape === "petal") {
        const petal = Math.abs(Math.cos(3 * angle));
        magnitude *= 0.38 + petal * 0.82;
        vx = Math.cos(angle) * magnitude;
        vy = Math.sin(angle) * magnitude * 0.84;
      } else if (shape === "willow") {
        angle = random(Math.PI * 1.04, Math.PI * 1.96);
        magnitude *= random(0.75, 1.25);
        vx = Math.cos(angle) * magnitude * 0.78;
        vy = Math.sin(angle) * magnitude * 1.12;
      } else if (shape === "orbit" || shape === "portal") {
        const axis = i % 3;
        angle = t * TAU * 3 + axis * 0.15;
        const tilt = [-0.52, 0.05, 0.57][axis];
        vx = Math.cos(angle) * magnitude;
        vy = Math.sin(angle) * magnitude * 0.28 + vx * tilt * 0.26;
      } else if (shape === "helix") {
        angle = t * TAU * 4.6;
        magnitude *= 0.25 + t * 0.95;
        vx = Math.cos(angle) * magnitude;
        vy = Math.sin(angle) * magnitude;
      } else if (shape === "prism") {
        angle = (i % 6) * Math.PI / 3 + random(-0.025, 0.025);
        vx = Math.cos(angle) * magnitude;
        vy = Math.sin(angle) * magnitude;
      } else if (shape === "snowflake") {
        const arm = i % 6;
        const tier = Math.floor(i / 6) / Math.max(1, Math.floor(count / 6) - 1);
        angle = arm * Math.PI / 3 + (i % 5 === 0 ? (i % 10 ? -0.24 : 0.24) : 0);
        magnitude = speed * (0.24 + tier * 1.05) * random(0.94, 1.07);
        vx = Math.cos(angle) * magnitude;
        vy = Math.sin(angle) * magnitude;
      } else if (shape === "iceCrown") {
        angle = random(Math.PI * 1.05, Math.PI * 1.95);
        vx = Math.cos(angle) * magnitude;
        vy = Math.sin(angle) * magnitude * 1.18;
      } else if (shape === "icicle") {
        angle = random(Math.PI * 0.32, Math.PI * 0.68);
        vx = Math.cos(angle) * magnitude * 0.38;
        vy = Math.sin(angle) * magnitude * 1.12;
      } else {
        angle += random(-0.035, 0.035);
        vx = Math.cos(angle) * magnitude;
        vy = Math.sin(angle) * magnitude;
      }

      const particleColor = shape === "snowflake" && i % 3 ? scenes[3].palette[1] : color;
      addParticle(x, y, vx, vy, particleColor, depth, {
        life: shape === "willow" || shape === "icicle" ? random(1.9, 2.8) : random(1.35, 2.35),
        gravity: shape === "snowflake" ? 9 : shape === "icicle" ? 42 : undefined,
        twinkle: shape === "snowflake" ? 22 : undefined,
      });
    }

    if (["orbit", "portal", "helix", "snowflake"].includes(shape)) {
      rings.push({ x, y, radius: 7, speed: 74 + energy * 18, life: 1, depth, tilt: shape === "snowflake" ? 1 : random(0.28, 0.6), rotation: random(0, TAU), spin: random(-1.2, 1.2), color });
    }

    if (shape === "snowflake") {
      for (let arm = 0; arm < 6; arm += 1) {
        const armAngle = arm * Math.PI / 3;
        for (let tier = 1; tier <= 4; tier += 1) {
          for (const direction of [-1, 1]) {
            const branchAngle = armAngle + direction * 0.36;
            const branchSpeed = speed * 0.18 * tier;
            addParticle(x, y, Math.cos(branchAngle) * branchSpeed, Math.sin(branchAngle) * branchSpeed, tier % 2 ? scenes[3].palette[1] : scenes[3].palette[0], Math.min(1, depth + 0.08), { life: 1.55 + tier * 0.12, gravity: 7, size: 1.4 + depth, twinkle: 23 });
          }
        }
      }
    }

    audio.burst(x, energy);
  }

  function updateRockets(now) {
    for (let i = rockets.length - 1; i >= 0; i -= 1) {
      const rocket = rockets[i];
      const progress = Math.min(1, (now - rocket.start) / rocket.duration);
      const eased = 1 - Math.pow(1 - progress, 2.4);
      rocket.x = rocket.x0 + (rocket.x1 - rocket.x0) * eased + Math.sin(progress * Math.PI) * 14 * (rocket.depth - 0.5);
      rocket.y = rocket.y0 + (rocket.y1 - rocket.y0) * eased;
      rocket.trail.push({ x: rocket.x, y: rocket.y, life: 1 });
      if (rocket.trail.length > 18) rocket.trail.shift();
      rocket.trail.forEach((point) => { point.life -= 0.07; });
      if (progress >= 1) {
        explode(rocket);
        rockets.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.trail.push({ x: p.x, y: p.y, life: p.life });
      if (p.trail.length > (p.depth > 0.82 ? 3 : 2)) p.trail.shift();
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.phase += p.twinkle * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updateRings(dt) {
    rings.forEach((ring) => {
      ring.radius += ring.speed * dt;
      ring.rotation += ring.spin * dt;
      ring.life -= dt * 0.58;
    });
    rings = rings.filter((ring) => ring.life > 0);
  }

  function updateAmbient(dt, now) {
    ambient.forEach((item) => {
      if (scene === 1) {
        item.x += Math.sin(now * 0.00025 + item.phase) * item.speed * 0.35;
        item.y += item.z > 0.72 ? item.speed * 3.1 * dt : 0;
      } else if (scene === 2) {
        item.y += (18 + item.z * 48) * dt;
        item.x += Math.sin(now * 0.001 + item.phase) * 8 * dt;
      } else {
        item.y += (24 + item.z * 92) * dt;
        item.x += (18 + item.z * 42) * dt + Math.sin(now * 0.0011 + item.phase) * 12 * dt;
      }
      if (item.y > height + 20) { item.y = -20; item.x = random(-width * 0.1, width); }
      if (item.x > width + 30) item.x = -30;
      if (item.x < -30) item.x = width + 30;
    });
  }

  function drawAmbient(now) {
    ambient.forEach((item) => {
      const layer = item.z < 0.42 ? 0 : item.z > 0.8 ? 2 : 1;
      const ctx = contexts[layer];
      const alpha = 0.22 + item.z * 0.54;
      ctx.save();
      ctx.translate(item.x, item.y);
      if (scene === 1 && item.z > 0.72) {
        ctx.rotate(now * 0.0004 * item.spin + item.phase);
        ctx.fillStyle = `rgba(255,151,206,${alpha * 0.56})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, item.size * 2.3, item.size, 0, 0, TAU);
        ctx.fill();
      } else if (scene === 2) {
        const color = item.index % 3 === 0 ? scenes[2].palette[0] : scenes[2].palette[1];
        ctx.strokeStyle = rgba(color, alpha * 0.58);
        ctx.lineWidth = Math.max(0.5, item.z * 1.25);
        ctx.beginPath();
        ctx.moveTo(0, -item.size * (4 + item.z * 7));
        ctx.lineTo(0, item.size * 2);
        ctx.stroke();
      } else if (scene === 3) {
        if (item.z > 0.86) {
          drawSnowflake(ctx, 0, 0, item.size * (0.8 + item.z * 1.4), alpha * 0.82, now * 0.0002 * item.spin + item.phase);
        } else {
          ctx.fillStyle = `rgba(221,247,255,${alpha * 0.74})`;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(0.55, item.size * (0.4 + item.z * 0.5)), 0, TAU);
          ctx.fill();
        }
      } else {
        const color = item.index % 4 === 0 ? scenes[1].palette[2] : scenes[1].palette[3];
        ctx.fillStyle = rgba(color, alpha * (0.55 + Math.sin(now * 0.002 + item.phase) * 0.25));
        ctx.beginPath();
        ctx.arc(0, 0, item.size * (0.5 + item.z), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawSnowflake(ctx, x, y, radius, alpha, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = `rgba(221,247,255,${alpha})`;
    ctx.lineWidth = Math.max(0.55, radius * 0.12);
    ctx.beginPath();
    for (let arm = 0; arm < 6; arm += 1) {
      const angle = arm * Math.PI / 3;
      const ex = Math.cos(angle) * radius;
      const ey = Math.sin(angle) * radius;
      ctx.moveTo(0, 0);
      ctx.lineTo(ex, ey);
      for (const tier of [0.55, 0.78]) {
        const bx = Math.cos(angle) * radius * tier;
        const by = Math.sin(angle) * radius * tier;
        for (const direction of [-1, 1]) {
          ctx.moveTo(bx, by);
          ctx.lineTo(bx - Math.cos(angle + direction * 0.62) * radius * 0.24, by - Math.sin(angle + direction * 0.62) * radius * 0.24);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRockets() {
    rockets.forEach((rocket) => {
      const layer = rocket.depth < 0.43 ? 0 : rocket.depth > 0.82 ? 2 : 1;
      const ctx = contexts[layer];
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 1; i < rocket.trail.length; i += 1) {
        const a = rocket.trail[i - 1];
        const b = rocket.trail[i];
        ctx.strokeStyle = rgba(rocket.color, Math.max(0, b.life) * 0.55);
        ctx.lineWidth = 0.7 + rocket.depth * 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(rocket.color, 0.96);
      ctx.shadowColor = rgba(rocket.color, 1);
      ctx.shadowBlur = 5 + rocket.energy;
      ctx.beginPath();
      ctx.arc(rocket.x, rocket.y, 1.6 + rocket.depth * 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawParticles() {
    particles.forEach((p) => {
      const layer = p.depth < 0.43 ? 0 : p.depth > 0.82 ? 2 : 1;
      const ctx = contexts[layer];
      const alpha = Math.max(0, p.life / p.maxLife);
      const pulse = 0.58 + Math.sin(p.phase) * 0.4;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (p.trail.length > 1) {
        ctx.strokeStyle = rgba(p.color, alpha * 0.36);
        ctx.lineWidth = Math.max(0.45, p.size * 0.72);
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        p.trail.forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      }
      ctx.fillStyle = rgba(p.color, alpha * pulse);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.45, p.size * (0.65 + pulse * 0.45)), 0, TAU);
      ctx.fill();
      if (p.depth > 0.82 && alpha > 0.35) {
        ctx.fillStyle = rgba(p.color, alpha * 0.13);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawRings() {
    rings.forEach((ring) => {
      const layer = ring.depth > 0.82 ? 2 : ring.depth < 0.43 ? 0 : 1;
      const ctx = contexts[layer];
      ctx.save();
      ctx.translate(ring.x, ring.y);
      ctx.rotate(ring.rotation);
      ctx.scale(1, ring.tilt);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(ring.color, ring.life * 0.55);
      ctx.lineWidth = 1 + ring.depth * 1.2;
      ctx.shadowColor = rgba(ring.color, ring.life);
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(0, 0, ring.radius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    });
  }

  function autoShow(now) {
    const config = scenes[scene];
    const delay = Math.max(1200, config.autoDelay - sceneClicks * 180);
    if (now - lastAuto < delay || transitioning) return;
    lastAuto = now;
    launch(undefined, undefined, choose(config.shapes), Math.max(1, sceneClicks), random(0.3, 0.78));
  }

  function transitionTo(nextScene) {
    transitioning = true;
    root.classList.add("is-transitioning");
    audio.transition(scene, nextScene);

    const centerShape = scene === 1 ? "petal" : "portal";
    for (let i = 0; i < 3; i += 1) {
      setTimeout(() => launch(width * (0.2 + i * 0.15), random(height * 0.2, height * 0.52), centerShape, 3, 0.82 + i * 0.035), i * 95);
    }

    setTimeout(() => {
      scene = nextScene;
      sceneClicks = 0;
      root.dataset.scene = String(scene);
      root.dataset.energy = "0";
      root.dataset.clicks = "0";
      particles = particles.filter((particle) => particle.life > 0.55);
      seedAmbient();
      audio.switchScene(scene);
      const openingShape = scene === 2 ? "orbit" : "snowflake";
      for (let i = 0; i < 3; i += 1) {
        setTimeout(() => launch(width * (0.26 + i * 0.16), random(height * 0.2, height * 0.5), openingShape, 3, random(0.78, 1)), i * 130);
      }
    }, 900);

    setTimeout(() => {
      transitioning = false;
      root.classList.remove("is-transitioning");
    }, 1900);
  }

  async function interact(event) {
    if (transitioning) return;
    await audio.unlock();
    sceneClicks += 1;
    root.dataset.clicks = String(sceneClicks);
    root.dataset.energy = String(sceneClicks);
    const x = event.clientX ?? width / 2;
    const y = Math.max(height * 0.14, Math.min(height * 0.68, event.clientY ?? height * 0.42));
    const config = scenes[scene];
    const featuredShape = config.shapes[Math.min(sceneClicks - 1, config.shapes.length - 1)];

    launch(x, y, featuredShape, sceneClicks, 0.96);
    for (let i = 0; i < Math.max(0, sceneClicks - 1); i += 1) {
      setTimeout(() => launch(x + random(-width * 0.18, width * 0.18), y + random(-height * 0.12, height * 0.12), choose(config.shapes), sceneClicks, random(0.6, 0.92)), 150 + i * 115);
    }

    if (sceneClicks === 3) {
      if (scene < 3) {
        setTimeout(() => transitionTo(scene + 1), 760);
      } else {
        for (let i = 0; i < 5; i += 1) {
          setTimeout(() => launch(width * (0.12 + i * 0.125), random(height * 0.14, height * 0.52), i % 2 ? "snowflake" : choose(config.shapes), 3, random(0.78, 1)), 340 + i * 120);
        }
        setTimeout(() => {
          sceneClicks = 0;
          root.dataset.clicks = "0";
          root.dataset.energy = "0";
        }, 1850);
      }
    }
  }

  function frame(now) {
    const targetInterval = width < 700 ? 1000 / 36 : 1000 / 45;
    if (now - lastRenderedFrame < targetInterval) {
      requestAnimationFrame(frame);
      return;
    }
    lastRenderedFrame = now;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    contexts.forEach((ctx) => ctx.clearRect(0, 0, width, height));
    updateAmbient(dt, now);
    updateRockets(now);
    updateParticles(dt);
    updateRings(dt);
    autoShow(now);
    drawAmbient(now);
    drawRings();
    drawRockets();
    drawParticles();
    requestAnimationFrame(frame);
  }

  root.addEventListener("pointerdown", interact);
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) lastFrame = performance.now(); });

  root.dataset.scene = String(scene);
  root.dataset.clicks = "0";
  root.dataset.energy = "0";
  resize();
  requestAnimationFrame(frame);
})();
