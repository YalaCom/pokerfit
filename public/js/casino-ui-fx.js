/**
 * FIT Casino — UI FX Layer (visual + audio only)
 * Does NOT touch spin math, RTP, API payloads, or game logic.
 * Hooks into DOM events and existing UI callbacks.
 */
(function () {
  "use strict";

  const Howl = window.Howl;
  const gsap = window.gsap;
  if (!Howl) return;

  function synthWav({ freq = 440, duration = 0.1, gain = 0.2, sweep = 0, type = "sine" }) {
    const sr = 12000;
    const n = Math.max(32, Math.floor(sr * duration));
    const bytes = new Uint8Array(44 + n * 2);
    const dv = new DataView(bytes.buffer);
    writeStr(dv, 0, "RIFF");
    dv.setUint32(4, 36 + n * 2, true);
    writeStr(dv, 8, "WAVE");
    writeStr(dv, 12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    writeStr(dv, 36, "data");
    dv.setUint32(40, n * 2, true);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const f = freq + sweep * t;
      const env = Math.pow(1 - t, 1.5) * Math.min(1, t * 18);
      phase += (2 * Math.PI * f) / sr;
      let sample = Math.sin(phase);
      if (type === "square") sample = sample > 0 ? 1 : -1;
      if (type === "triangle") sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
      sample *= gain * env;
      dv.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, Math.round(sample * 32767))), true);
    }
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  function writeStr(dv, o, s) {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  }

  const DEFS = {
    uiClick: { freq: 520, duration: 0.05, gain: 0.22, sweep: 80 },
    uiTab: { freq: 380, duration: 0.08, gain: 0.2, sweep: 120 },
    uiHover: { freq: 680, duration: 0.04, gain: 0.12, sweep: 40 },
    uiCoin: { freq: 920, duration: 0.07, gain: 0.2, sweep: 160 },
    uiSuccess: { freq: 440, duration: 0.35, gain: 0.22, sweep: 480 },
    uiSpin: { freq: 180, duration: 0.14, gain: 0.24, sweep: 100 },
    uiModal: { freq: 300, duration: 0.12, gain: 0.18, sweep: 200 },
    uiJackpotTick: { freq: 780, duration: 0.04, gain: 0.1, sweep: 60 },
    uiDaily: { freq: 360, duration: 0.5, gain: 0.28, sweep: 620 },
    uiBoot: { freq: 120, duration: 0.6, gain: 0.15, sweep: 280 },
    lobbyAmbient: { freq: 55, duration: 5.5, gain: 0.06, sweep: 22 },
    lobbyAmbient2: { freq: 82, duration: 4.8, gain: 0.05, sweep: 30 },
  };

  const sounds = new Map();
  let master = 0.85;
  let musicVol = 0.35;
  let sfxVol = 0.8;
  let muted = false;
  let ambientPlaying = false;
  let unlocked = false;

  function get(name) {
    if (sounds.has(name)) return sounds.get(name);
    const d = DEFS[name];
    if (!d) return null;
    const loop = name.startsWith("lobbyAmbient");
    const h = new Howl({
      src: [synthWav(d)],
      format: ["wav"],
      loop,
      volume: loop ? musicVol : sfxVol,
      preload: true,
    });
    sounds.set(name, h);
    return h;
  }

  function play(name, { volume = 1, rate = 1 } = {}) {
    if (muted || !unlocked) return;
    const h = get(name);
    if (!h) return;
    const id = h.play();
    const isMusic = name.startsWith("lobbyAmbient");
    h.volume(Math.min(1, volume) * (isMusic ? musicVol : sfxVol) * master, id);
    h.rate(rate, id);
    return id;
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      const h = get("uiClick");
      if (h) {
        const id = h.play();
        h.volume(0, id);
        h.stop(id);
      }
    } catch {}
    startLobbyMusic();
  }

  function startLobbyMusic() {
    if (muted || ambientPlaying) return;
    ambientPlaying = true;
    const a = get("lobbyAmbient");
    const b = get("lobbyAmbient2");
    if (a && !a.playing()) {
      a.play();
      a.volume(musicVol * master * 0.7);
    }
    setTimeout(() => {
      if (b && !b.playing() && ambientPlaying && !muted) {
        b.play();
        b.volume(musicVol * master * 0.45);
      }
    }, 1800);
  }

  function stopLobbyMusic() {
    ambientPlaying = false;
    get("lobbyAmbient")?.stop();
    get("lobbyAmbient2")?.stop();
  }

  function duckLobby(level = 0.2) {
    const a = get("lobbyAmbient");
    const b = get("lobbyAmbient2");
    if (a?.playing()) a.volume(musicVol * master * level);
    if (b?.playing()) b.volume(musicVol * master * level * 0.6);
  }

  function restoreLobby() {
    if (!ambientPlaying || muted) return;
    const a = get("lobbyAmbient");
    const b = get("lobbyAmbient2");
    if (a?.playing()) a.volume(musicVol * master * 0.7);
    if (b?.playing()) b.volume(musicVol * master * 0.45);
  }

  function pulseBalance() {
    const el = document.getElementById("balance")?.closest(".balance-chip");
    if (!el) return;
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    play("uiCoin", { volume: 0.7 });
  }

  function animateJackpot(from, to) {
    const el = document.getElementById("jackpotValue");
    if (!el || !gsap) {
      if (el) el.textContent = formatNum(to);
      return;
    }
    const obj = { v: Number(from) || 0 };
    gsap.to(obj, {
      v: Number(to) || 0,
      duration: 1.4,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = formatNum(obj.v);
      },
    });
  }

  function formatNum(v) {
    return Math.floor(Number(v) || 0).toLocaleString("ru-RU");
  }

  function sparkleAt(x, y, count = 12) {
    if (!gsap) return;
    for (let i = 0; i < count; i++) {
      const s = document.createElement("div");
      s.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:6px;height:6px;border-radius:50%;
        background:${i % 2 ? "#f0d06a" : "#5ce9ff"};pointer-events:none;z-index:400;
        box-shadow:0 0 8px currentColor`;
      document.body.appendChild(s);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = 40 + Math.random() * 80;
      gsap.to(s, {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - 20,
        opacity: 0,
        scale: 0.2,
        duration: 0.6 + Math.random() * 0.4,
        ease: "power2.out",
        onComplete: () => s.remove(),
      });
    }
  }

  function confettiBurst() {
    if (!gsap) return;
    const colors = ["#f0d06a", "#5ce9ff", "#b48cff", "#ff6b9d", "#fff"];
    for (let i = 0; i < 28; i++) {
      const c = document.createElement("div");
      const size = 4 + Math.random() * 6;
      c.style.cssText = `position:fixed;left:50%;top:40%;width:${size}px;height:${size * 1.4}px;
        background:${colors[i % colors.length]};pointer-events:none;z-index:400;border-radius:2px;
        box-shadow:0 0 6px ${colors[i % colors.length]}`;
      document.body.appendChild(c);
      gsap.fromTo(
        c,
        { x: 0, y: 0, opacity: 1, rotation: Math.random() * 360 },
        {
          x: (Math.random() - 0.5) * 320,
          y: 120 + Math.random() * 280,
          opacity: 0,
          rotation: Math.random() * 720,
          duration: 1.2 + Math.random() * 0.8,
          ease: "power2.out",
          onComplete: () => c.remove(),
        }
      );
    }
  }

  function bindUI() {
    const unlockEvents = ["pointerdown", "touchstart", "keydown"];
    unlockEvents.forEach((ev) =>
      document.addEventListener(
        ev,
        () => {
          unlock();
        },
        { once: true, passive: true }
      )
    );

    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => play("uiTab", { volume: 0.8 }));
    });

    document.addEventListener(
      "click",
      (e) => {
        const t = e.target.closest("button");
        if (!t) return;
        if (t.id === "spinBtn") {
          play("uiSpin", { volume: 1 });
          return;
        }
        if (t.id === "dailyCard") {
          play("uiDaily", { volume: 0.9 });
          setTimeout(confettiBurst, 80);
          return;
        }
        if (t.classList.contains("slot-card")) {
          play("uiClick", { volume: 0.9, rate: 1.1 });
          const rect = t.getBoundingClientRect();
          sparkleAt(rect.left + rect.width * 0.5, rect.top + rect.height * 0.4, 10);
          return;
        }
        if (t.id === "bonusBuyBtn" || t.dataset?.buy) {
          play("uiModal", { volume: 0.9 });
          return;
        }
        play("uiClick", { volume: 0.55 });
      },
      true
    );

    if (window.matchMedia("(hover:hover)").matches) {
      document.addEventListener(
        "mouseover",
        (e) => {
          const card = e.target.closest(".slot-card, .mini-card, .direction-btn");
          if (card && !card._fxHover) {
            card._fxHover = true;
            play("uiHover", { volume: 0.35 });
            setTimeout(() => {
              card._fxHover = false;
            }, 300);
          }
        },
        true
      );
    }

    const observer = new MutationObserver(() => {
      const slotView = document.getElementById("slotView");
      if (!slotView) return;
      if (!slotView.classList.contains("hidden")) {
        duckLobby(0.08);
      } else {
        restoreLobby();
      }
    });
    const slotView = document.getElementById("slotView");
    if (slotView) observer.observe(slotView, { attributes: true, attributeFilter: ["class"] });

    const bal = document.getElementById("balance");
    if (bal) {
      let last = bal.textContent;
      const mo = new MutationObserver(() => {
        if (bal.textContent !== last) {
          last = bal.textContent;
          pulseBalance();
        }
      });
      mo.observe(bal, { characterData: true, childList: true, subtree: true });
    }

    const jp = document.getElementById("jackpotValue");
    if (jp) {
      let lastJp = jp.textContent;
      const mo = new MutationObserver(() => {
        if (jp.textContent !== lastJp) {
          const from = Number(String(lastJp).replace(/\s/g, "").replace(/,/g, "")) || 0;
          const to = Number(String(jp.textContent).replace(/\s/g, "").replace(/,/g, "")) || 0;
          lastJp = jp.textContent;
          if (Math.abs(to - from) > 0) {
            jp.textContent = formatNum(from);
            animateJackpot(from, to);
            play("uiJackpotTick", { volume: 0.4 });
          }
        }
      });
      mo.observe(jp, { characterData: true, childList: true, subtree: true });
    }
  }

  window.CasinoUIFX = {
    play,
    unlock,
    pulseBalance,
    confettiBurst,
    sparkleAt,
    startLobbyMusic,
    stopLobbyMusic,
    duckLobby,
    restoreLobby,
    setMuted(v) {
      muted = !!v;
      if (muted) stopLobbyMusic();
      else if (unlocked) startLobbyMusic();
    },
    setMusicVolume(v) {
      musicVol = Math.max(0, Math.min(1, Number(v) || 0));
      restoreLobby();
    },
    setSfxVolume(v) {
      sfxVol = Math.max(0, Math.min(1, Number(v) || 0));
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI);
  } else {
    bindUI();
  }

  const boot = document.getElementById("bootScreen");
  if (boot) {
    const mo = new MutationObserver(() => {
      if (boot.classList.contains("hide") || boot.classList.contains("hidden")) {
        play("uiBoot", { volume: 0.6 });
        mo.disconnect();
      }
    });
    mo.observe(boot, { attributes: true, attributeFilter: ["class"] });
  }
})();
