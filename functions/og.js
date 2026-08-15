// 动态 OG 战绩卡渲染：/og?diff=hard&time=128&name=Punk&w=1
// satori (JSX -> SVG) + resvg-wasm (SVG -> PNG)，Cloudflare Pages Function
import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from './resvg.wasm';
import { INTER_400, INTER_700 } from './og-fonts.js';

const SITE = 'bb.superzan.net';
const DIFF_META = {
  easy: { label: 'EASY', color: '#4caf50' },
  medium: { label: 'MEDIUM', color: '#ff9800' },
  hard: { label: 'HARD', color: '#e53935' },
};

let resvgReady = null;
function ensureResvg() {
  if (!resvgReady) resvgReady = initWasm(resvgWasm);
  return resvgReady;
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
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildElement(diff, timeStr, name, isWin) {
  const meta = DIFF_META[diff];
  const title = isWin ? 'CLEARED!' : 'BOOM!';
  const subtitle = isWin
    ? `${meta.label} mode in ${timeStr}`
    : `hit a mine on ${meta.label} mode`;

  const bead = (color) => ({
    type: 'div',
    props: { style: { width: 28, height: 28, borderRadius: 9999, backgroundColor: color, display: 'flex' } },
  });

  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: 56, backgroundColor: '#f7efe3',
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
                          props: { style: { display: 'flex', fontSize: 28, fontWeight: 400, color: '#6b6257' }, children: [`by ${name}`] },
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
                  children: [isWin ? `${title} ${subtitle}` : subtitle],
                },
              },
            ],
          },
        },
        // 底部：拼豆装饰 + 域名
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
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
                  style: { display: 'flex', alignItems: 'center', gap: 16 },
                  children: [
                    { type: 'div', props: { style: { display: 'flex', fontSize: 30, fontWeight: 700, color: '#e87b3a' }, children: [SITE] } },
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

export async function onRequestGet(context) {
  const { request } = context;
  const u = new URL(request.url);
  const diff = DIFF_META[u.searchParams.get('diff')] ? u.searchParams.get('diff') : 'easy';
  const timeRaw = parseInt(u.searchParams.get('time'), 10);
  const time = Number.isFinite(timeRaw) && timeRaw > 0 && timeRaw < 86400 ? timeRaw : null;
  const name = sanitizeName(u.searchParams.get('name'));
  const isWin = time !== null && u.searchParams.get('w') !== '0';
  const timeStr = time !== null ? fmtTime(time) : '0:00';

  try {
    await ensureResvg();
    const fonts = [
      { name: 'Inter', data: b64ToBuffer(INTER_400), weight: 400, style: 'normal' },
      { name: 'Inter', data: b64ToBuffer(INTER_700), weight: 700, style: 'normal' },
    ];
    const svg = await satori(buildElement(diff, timeStr, name, isWin), {
      width: 1200,
      height: 630,
      fonts,
    });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
    return new Response(png, {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return new Response('og render failed: ' + (e && e.message ? e.message : 'unknown'), {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    });
  }
}
