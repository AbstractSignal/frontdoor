import { useEffect, useRef, useState } from 'react';
import './FrigateCamera.css';

/**
 * Live view for a Frigate camera (Frigate 0.16+, built-in go2rtc).
 *
 * Capability chain:
 *  1. MSE (Chrome/Edge/Firefox): ws /live/mse/api/ws — client sends its codec
 *     capabilities, server answers with the real MIME and streams fMP4 chunks.
 *     Same protocol as Frigate's own player / HA card. TCP only.
 *  2. WebRTC (Safari/iOS — no MediaSource): ws /live/webrtc/api/ws — the offer
 *     MUST include a video transceiver or go2rtc rejects it
 *     ("streams: unknown error").
 *  3. Snapshot polling of /api/<camera>/latest.webp as last resort.
 */
export function FrigateCamera({
  camera,
  label,
  baseUrl = import.meta.env.VITE_FRIGATE_URL || 'http://192.168.66.12:5000',
}: {
  camera: string;
  label?: string;
  baseUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // Lazy start: don't open the stream until the camera is near the viewport —
  // every camera starting full-res decode at page load makes controls lag.
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<'loading' | 'live' | 'snap'>('loading');
  const [diag, setDiag] = useState('starting stream…');
  const [tick, setTick] = useState(0);
  const [muted, setMuted] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [fakeFs, setFakeFs] = useState(false);

  // iOS Safari has no Fullscreen API — there we simulate it with a fixed
  // overlay (no native controls: they hijack zoom/pan gestures).
  const supportsFs =
    Boolean((document as any).fullscreenEnabled) ||
    'requestFullscreen' in Element.prototype;

  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
  };

  const toggleFullscreen = () => {
    if (!supportsFs) {
      setFakeFs((f) => !f);
      return;
    }
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => undefined);
  };

  useEffect(() => {
    document.body.style.overflow = fakeFs ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [fakeFs]);

  useEffect(() => {
    if (!started) return;
    setMode('loading');
    setDiag('starting stream…');
    let disposed = false;
    let live = false;
    let video: HTMLVideoElement | null = null;
    let ws: WebSocket | null = null;
    let snapTimer: ReturnType<typeof setInterval> | null = null;
    let retried = false;
    let ctx: Ctx | null = null;
    const prog = { path: 'none', opened: false, mime: '', bytes: 0, ice: '' };
    const cleanupFns: Array<() => void> = [];

    const failToSnapshots = (why: string) => {
      if (disposed || live || snapTimer) return;
      setDiag(why);
      setMode('snap');
      setTick((t) => t + 1);
      snapTimer = setInterval(() => setTick((t) => t + 1), 1500);
    };

    const watchdogMsg = () =>
      prog.path === 'mse'
        ? `no frames (MSE ws:${prog.opened ? '✓' : '✗'} mime:${prog.mime ? '✓' : '–'} ${Math.round(prog.bytes / 1024)}KB) — snapshot mode`
        : prog.path === 'webrtc'
          ? `no frames (WebRTC ICE ${prog.ice || '—'}) — snapshot mode`
          : 'no frames — using snapshot mode';
    let watchdog2: ReturnType<typeof setTimeout> | null = null;
    const watchdog = setTimeout(() => {
      if (live || snapTimer) return;
      if (!retried && prog.path === 'mse') {
        // MSE connected but never produced a frame (Firefox quirk):
        // tear it down and retry the same stream over WebRTC.
        retried = true;
        setDiag('no video from MSE — retrying via WebRTC…');
        cleanupFns.forEach((fn) => fn());
        cleanupFns.length = 0;
        if (ctx) startWebRtc(ctx);
        // Generous window: cold transcode startup (go2rtc spawns FFmpeg →
        // RTSP → encode) + ICE + first decode can take a while on phones.
        watchdog2 = setTimeout(() => failToSnapshots(watchdogMsg()), 25000);
      } else {
        failToSnapshots(watchdogMsg());
      }
    }, 10000);

    const onPlaying = () => {
      if (disposed || live) return;
      live = true;
      setMode('live');
      setDiag('stream active');
    };

    try {
      video = videoRef.current;
      if (!video) throw new Error('no video element');
      video.onplaying = onPlaying;

      ctx = {
        camera,
        baseUrl,
        video,
        failToSnapshots,
        setDiag: (d) => setDiag(d),
        isLive: () => live,
        setWs: (w) => (ws = w),
        prog,
        cleanupFns,
      };

      if (typeof MediaSource !== 'undefined') startMse(ctx);
      else startWebRtc(ctx);
    } catch (e) {
      failToSnapshots(`${String(e)} — snapshot mode`);
    }

    return () => {
      disposed = true;
      clearTimeout(watchdog);
      if (watchdog2) clearTimeout(watchdog2);
      if (snapTimer) clearInterval(snapTimer);
      cleanupFns.forEach((fn) => fn());
      try { ws?.close(); } catch { /* noop */ }
      video?.removeEventListener('playing', onPlaying);
    };
  }, [camera, baseUrl, started]);

  const posterSrc = `${baseUrl}/api/${encodeURIComponent(camera)}/latest.webp?height=480`;

  const snapSrc = `${baseUrl}/api/${encodeURIComponent(camera)}/latest.webp?height=480&cache=${tick}`;

  return (
    <section ref={sectionRef} className={`frigate-cam ${started ? mode : 'idle'}`}>
      <header>
        <h3>{label ?? camera}</h3>
        <span className="cam-status" title={diag}>
          <span className="dot" />
          {mode === 'live' ? 'LIVE' : mode === 'snap' ? 'SNAPSHOTS' : '…'}
        </span>
      </header>

      <div className={`cam-frame${fakeFs ? ' fake-fs' : ''}`} ref={frameRef}>
        {!started ? (
          <img src={posterSrc} alt={label ?? camera} />
        ) : mode !== 'snap' ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            onClick={() => fakeFs && setFakeFs(false)}
          />
        ) : (
          <img key={tick} src={snapSrc} alt={label ?? camera} />
        )}
        {started && mode !== 'snap' && (
          <div className="cam-controls">
            <button type="button" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
              {muted ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFs || fakeFs ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFs || fakeFs ? '🡼' : '⛶'}
            </button>
          </div>
        )}
      </div>

      {started && mode !== 'live' && <footer className="diag">{diag}</footer>}
    </section>
  );
}

type Ctx = {
  camera: string;
  baseUrl: string;
  video: HTMLVideoElement;
  failToSnapshots: (why: string) => void;
  setDiag: (d: string) => void;
  setWs: (w: WebSocket) => void;
  isLive: () => boolean;
  prog: { path: string; opened: boolean; mime: string; bytes: number; ice: string };
  cleanupFns: Array<() => void>;
};

const wsUrl = (baseUrl: string, path: string, camera: string) =>
  `${baseUrl.replace(/^http/, 'ws')}${path}?src=${encodeURIComponent(camera)}`;

// Same codec list Frigate's own player probes for MSE capabilities.
const CODECS = [
  'avc1.640029',
  'avc1.64002A',
  'avc1.640033',
  'hvc1.1.6.L153.B0',
  'mp4a.40.2',
  'mp4a.40.5',
  'flac',
  'opus',
];

/** Path 1 — MSE: what Frigate's own player and the HA card use. */
function startMse({ camera, baseUrl, video, failToSnapshots, setWs, prog, cleanupFns }: Ctx) {
  prog.path = 'mse';
  let sb: SourceBuffer | null = null;
  let pending: ArrayBuffer[] = [];
  let sock: WebSocket | null = null;

  const ms = new MediaSource();
  (ms as any).onerror = () => failToSnapshots('MediaSource error — snapshot mode');
  ms.onsourceopen = () => {
    const s = new WebSocket(wsUrl(baseUrl, '/live/mse/api/ws', camera));
    sock = s;
    setWs(s);
    s.binaryType = 'arraybuffer';
    // go2rtc waits for the client to declare what it can play, then answers
    // with the actual MIME (server → {type:"mse",value:<mime>}) and streams fMP4.
    // Same capability handshake as Frigate's own player: send only the
    // codecs this browser actually accepts (Firefox's MSE is video-only,
    // so audio codecs get filtered out and go2rtc streams video-only fMP4).
    const supported = CODECS.filter((c) =>
      MediaSource.isTypeSupported(`video/mp4; codecs="${c}"`),
    ).join();
    s.onopen = () => {
      prog.opened = true;
      if (!supported) failToSnapshots('no supported codecs — snapshot mode');
      else s.send(JSON.stringify({ type: 'mse', value: supported }));
    };
    s.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'error') failToSnapshots(`server: ${msg.value}`);
        else if (msg.type === 'mse' && !sb) {
          prog.mime = String(msg.value);
          try {
            sb = ms.addSourceBuffer(msg.value);
            sb.mode = 'segments';
            sb.addEventListener('updateend', () => {
              while (pending.length > 0 && sb && !sb.updating) {
                const c = pending.shift()!;
                try {
                  sb.appendBuffer(c);
                } catch (e) {
                  failToSnapshots(`append: ${String(e)}`);
                }
              }
              // Firefox will not start playback on an infinite-duration
              // MediaSource unless a live seekable range is maintained at the
              // buffer tail (Frigate's own player does exactly this).
              if (sb && !sb.updating && sb.buffered.length > 0) {
                const end = sb.buffered.end(sb.buffered.length - 1);
                try {
                  ms.setLiveSeekableRange(0, Math.max(end + 15, 30));
                } catch { /* noop */ }
              }
            });
          } catch (e) {
            failToSnapshots(`source buffer: ${String(e)}`);
          }
        }
      } else if (sb) {
        const chunk = ev.data;
        prog.bytes += chunk.byteLength;
        if (sb.updating) pending.push(chunk);
        else {
          try {
            sb.appendBuffer(chunk);
          } catch (e) {
            failToSnapshots(`append: ${String(e)}`);
          }
        }
      }
    };
    s.onerror = () => failToSnapshots('stream socket error — snapshot mode');
    s.onclose = () => failToSnapshots('stream closed — snapshot mode');
  };

  video.srcObject = null;
  video.src = URL.createObjectURL(ms);
  cleanupFns.push(() => {
    if (sock) sock.onopen = sock.onmessage = sock.onerror = sock.onclose = null;
    try { ms.endOfStream(); } catch { /* noop */ }
    if (video.src) URL.revokeObjectURL(video.src);
  });
}

/** Path 2 — WebRTC: for browsers without MediaSource (Safari/iOS). */
function startWebRtc({ camera, baseUrl, video, failToSnapshots, setDiag, isLive, setWs, prog, cleanupFns }: Ctx) {
  prog.path = 'webrtc';
  let pc: RTCPeerConnection | null = null;
  const stream = new MediaStream();

  try {
    pc = new RTCPeerConnection({ iceServers: [] });
    // Required: without an explicit transceiver the offer has no m-lines and
    // go2rtc rejects it ("streams: unknown error") — same as Frigate's player.
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    let attached = false;
    pc.ontrack = (e) => {
      if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
      if (!attached) {
        attached = true;
        // Clear any MSE blob URL left over from a failed first attempt.
        if (video.src) { video.removeAttribute('src'); video.load(); }
        video.srcObject = stream;
      }
    };
    pc.oniceconnectionstatechange = () => {
      prog.ice = pc ? pc.iceConnectionState : '';
      if (!isLive()) setDiag(`WebRTC connecting… (ICE ${prog.ice})`);
      if (pc?.iceConnectionState === 'failed') failToSnapshots('WebRTC ICE failed — snapshot mode');
    };

    // Phones can't software-decode the 2560×1920 High-profile feed (Firefox
    // Android: ICE connects, zero frames). Ask go2rtc to transcode a 720p
    // H.264 + Opus variant for this path; desktop MSE keeps full resolution.
    const lowRes = `ffmpeg:${camera}#video=h264#width=1280#audio=opus`;
    const sock = new WebSocket(wsUrl(baseUrl, '/live/webrtc/api/ws', lowRes));
    setWs(sock);
    sock.onopen = () => {
      pc?.createOffer()
        .then((o) => pc!.setLocalDescription(o))
        .then(() => sock.send(JSON.stringify({ type: 'webrtc/offer', value: pc!.localDescription!.sdp })))
        .catch((e) => failToSnapshots(`offer: ${String(e)}`));
    };
    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (!pc) return;
      if (msg.type === 'webrtc/answer') {
        pc.setRemoteDescription({ type: 'answer', sdp: msg.value }).catch((e) => failToSnapshots(`answer: ${String(e)}`));
      } else if (msg.type === 'webrtc/candidate') {
        pc.addIceCandidate({ candidate: msg.value, sdpMid: '0' }).catch(() => undefined);
      } else if (msg.type === 'error') {
        failToSnapshots(`server: ${msg.value}`);
      }
    };
    sock.onerror = () => failToSnapshots('stream socket error — snapshot mode');
    sock.onclose = () => failToSnapshots('stream closed — snapshot mode');

    cleanupFns.push(() => {
      sock.onopen = sock.onmessage = sock.onerror = sock.onclose = null;
      try { pc?.close(); } catch { /* noop */ }
    });
  } catch (e) {
    failToSnapshots(`${String(e)} — snapshot mode`);
  }
}
