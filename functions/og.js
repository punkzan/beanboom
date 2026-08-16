// 动态 OG 战绩卡渲染：/og?diff=hard&time=128&name=Punk&w=1
// satori (JSX -> SVG) + resvg-wasm (SVG -> PNG)，Cloudflare Pages Function
import satori from 'satori';
// Vendored copy of @resvg/resvg-wasm patched to instantiate the wasm module
// synchronously. The stock async WebAssembly.instantiate() op was hanging
// forever in ~30% of edge isolates, tripping workerd's hang detector (1101)
// and poisoning every request served by that isolate.
import { Resvg, initWasm } from './resvg-wasm-sync.js';
import resvgWasm from './resvg.wasm';
import { INTER_400, INTER_700 } from './og-fonts.js';
import { FALLBACK_B64 } from './og-fallback-b64.js';
import { QR_DATA_URL } from './og-qr-dataurl.js';

const SITE = 'bb.superzan.net';
const DIFF_META = {
  easy: { label: 'EASY', color: '#4caf50' },
  medium: { label: 'MEDIUM', color: '#ff9800' },
  hard: { label: 'HARD', color: '#e53935' },
};

// Kick off WASM instantiation at module evaluation (isolate creation) and
// track readiness with a flag. CRITICAL: never await this promise inside a
// request. In ~40% of edge isolates the underlying wasm compile/instantiate
// op never settles; awaiting it taints the whole request (workerd raises
// "Promise will never complete" and turns the response into a 1101 error
// page, no matter what the handler returns afterwards). Un-awaited pending
// promises are harmless — un-awaited code cannot taint the response.
let wasmReady = false;
initWasm(resvgWasm).then(
  () => {
    wasmReady = true;
    console.log('[og] background initWasm resolved');
  },
  (e) => console.log('[og] background initWasm rejected:', e && e.message)
);

// The request that triggers lazy module evaluation on a fresh isolate runs in
// "global scope" for workerd: any runtime op (setTimeout, async I/O, even the
// ops satori performs on first use) throws "Disallowed operation called
// within global scope" and the whole request dies with 1101. Subsequent
// requests on the same isolate are normal. So request #1 on every isolate
// must be 100% synchronous — serve the inlined fallback and warm the render
// pipeline afterwards via waitUntil (runs after the response is out the
// door, so failures cannot taint the delivered response).
let isolateWarmed = false;

function fallbackResponse() {
  return new Response(b64ToBuffer(FALLBACK_B64), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=600',
    },
  });
}

async function warmUpPipeline() {
  // Exercise the full satori + Resvg path once so every lazy init (yoga wasm,
  // font decode caches) happens here, inside a waitUntil context.
  const fonts = [
    { name: 'Inter', data: b64ToBuffer(INTER_400), weight: 400, style: 'normal' },
    { name: 'Inter', data: b64ToBuffer(INTER_700), weight: 700, style: 'normal' },
  ];
  const svg = await satori(buildElement('easy', '0:42', 'warmup', true), {
    width: 1200,
    height: 630,
    fonts,
  });
  new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  console.log('[og] warm-up render complete');
}

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' timed out after ' + ms + 'ms')), ms)),
  ]);
}

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function sanitizeName(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 20);
  return s || null;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function buildContent(diff, timeStr, name, isWin) {
  const meta = DIFF_META[diff];
  const title = isWin ? 'CLEARED!' : 'BOOM!';
  const subtitle = isWin
    ? meta.label + ' mode in ' + timeStr
    : 'hit a mine on ' + meta.label + ' mode';

  const bead = (color) => ({
    type: 'div',
    props: { style: { width: 28, height: 28, borderRadius: 9999, backgroundColor: color, display: 'flex' } },
  });

  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: 50,
        backgroundColor: '#f7efe3',
        backgroundImage: 'linear-gradient(135deg, #fdf9f1 0%, #f5e3cd 100%)',
        fontFamily: 'Inter', color: '#2d2d2d',
      },
      children: [
        // 顶部：难度 pill + 玩家名 | 品牌
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 16 },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex', backgroundColor: meta.color, color: '#ffffff',
                          fontSize: 26, fontWeight: 700, letterSpacing: 3,
                          padding: '10px 28px', borderRadius: 9999,
                        },
                        children: [meta.label],
                      },
                    },
                    name
                      ? {
                          type: 'div',
                          props: { style: { display: 'flex', fontSize: 28, fontWeight: 400, color: '#6b6257' }, children: ['by ' + name] },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 12 },
                  children: [
                    // 迷你地雷图标
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: 36, height: 36, borderRadius: 9999, display: 'flex',
                          backgroundColor: '#2d2d2d',
                        },
                        children: [],
                      },
                    },
                    { type: 'div', props: { style: { display: 'flex', fontSize: 32, fontWeight: 700, letterSpacing: 2 }, children: ['BEAN BOOM'] } },
                  ],
                },
              },
            ],
          },
        },
        // 中部：主标题 + 时间
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', fontSize: 110, fontWeight: 700, letterSpacing: 4, lineHeight: 1.1 },
                  children: [isWin ? timeStr : title],
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', fontSize: 40, fontWeight: 400, color: '#6b6257', marginTop: 8 },
                  children: [isWin ? title + ' ' + subtitle : subtitle],
                },
              },
            ],
          },
        },
        // 底部：拼豆装饰 + 域名（左） | QR 码（右）
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
            children: [
              // Left: beads + domain
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', gap: 14 },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', gap: 14, alignItems: 'center' },
                        children: [
                          bead('#e87b3a'), bead('#4caf50'), bead('#42a5f5'), bead('#ffca28'), bead('#ef5350'), bead('#8d6e63'),
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', fontSize: 30, fontWeight: 700, color: '#e87b3a' },
                        children: [SITE],
                      },
                    },
                  ],
                },
              },
              // Right: QR code + "Scan to play" label
              // Single <img> with data URL (625 per-cell divs caused 1102 CPU limit)
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
                  children: [
                    {
                      type: 'img',
                      props: {
                        src: QR_DATA_URL,
                        style: {
                          width: 116,
                          height: 116,
                          backgroundColor: '#ffffff',
                          padding: 8,
                          borderRadius: 10,
                        },
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', fontSize: 16, fontWeight: 700, color: '#6b6257', letterSpacing: 1 },
                        children: ['SCAN TO PLAY'],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

function buildElement(diff, timeStr, name, isWin) {
  // Outer wrapper creates brand border via padding + backgroundColor
  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', display: 'flex',
        backgroundColor: '#e87b3a', padding: 6,
      },
      children: [buildContent(diff, timeStr, name, isWin)],
    },
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const u = new URL(request.url);
  const diff = DIFF_META[u.searchParams.get('diff')] ? u.searchParams.get('diff') : 'easy';
  const timeRaw = parseInt(u.searchParams.get('time'), 10);
  const time = Number.isFinite(timeRaw) && timeRaw > 0 && timeRaw < 86400 ? timeRaw : null;
  const name = sanitizeName(u.searchParams.get('name'));
  const isWin = time !== null && u.searchParams.get('w') !== '0';
  const timeStr = time !== null ? fmtTime(time) : '0:00';

  // Request #1 on this isolate: pure sync fallback, then warm the pipeline
  // in the background. Never await anything here — see comment above.
  if (!isolateWarmed) {
    isolateWarmed = true;
    try {
      context.waitUntil(
        warmUpPipeline().catch((e) => console.log('[og] warm-up failed:', e && e.message))
      );
    } catch (e) {
      console.log('[og] waitUntil unavailable:', e && e.message);
    }
    return fallbackResponse();
  }

  if (!wasmReady) {
    // Warm-up still in flight (or poisoned): sync fallback, no awaits.
    return fallbackResponse();
  }

  try {
    const fonts = [
      { name: 'Inter', data: b64ToBuffer(INTER_400), weight: 400, style: 'normal' },
      { name: 'Inter', data: b64ToBuffer(INTER_700), weight: 700, style: 'normal' },
    ];
    const svg = await withTimeout(
      satori(buildElement(diff, timeStr, name, isWin), {
        width: 1200,
        height: 630,
        fonts,
      }),
      10000,
      'satori'
    );
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
    return new Response(png, {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    console.log('[og] dynamic render failed:', e && e.message);
    return fallbackResponse();
  }
}
