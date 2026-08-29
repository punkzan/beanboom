// /share 深链落地页：携带战绩参数（diff/time/name），返回动态 og:image meta
// 爬虫（FB/X/Telegram）抓到专属战绩卡预览；真实用户访问时 JS 跳转首页并保留 UTM
export async function onRequestGet(context) {
  const { request } = context;
  const u = new URL(request.url);

  const DIFFS = ['easy', 'medium', 'hard'];
  const diff = DIFFS.includes(u.searchParams.get('diff')) ? u.searchParams.get('diff') : 'easy';
  const timeRaw = parseInt(u.searchParams.get('time'), 10);
  const hasTime = Number.isFinite(timeRaw) && timeRaw > 0 && timeRaw < 86400;
  const time = hasTime ? timeRaw : null;
  const name = u.searchParams.get('name')
    ? String(u.searchParams.get('name')).replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 20)
    : '';
  const MODES = ['egg', 'classic', 'timetrial'];
  const mode = MODES.includes(u.searchParams.get('mode')) ? u.searchParams.get('mode') : null;
  const isWin = time !== null && u.searchParams.get('w') !== '0';

  // 保留 UTM 参数透传到首页
  const utm = ['utm_source', 'utm_medium', 'utm_campaign']
    .filter((k) => u.searchParams.get(k))
    .map((k) => `${k}=${encodeURIComponent(u.searchParams.get(k))}`)
    .join('&');

  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
  const title = time !== null
    ? (isWin ? `${name ? name + ' cleared ' : 'Cleared '}${diffLabel} mode in ${fmt(time)} — Bean Boom` : `Boom on ${diffLabel} mode — Bean Boom`)
    : 'Bean Boom — Free Online Minesweeper Game';
  const desc = time !== null
    ? `Can you beat this ${diffLabel} mode time in Bean Boom? Play free and join the global leaderboard.`
    : 'Classic minesweeper with bead art style. Play free online.';

  const ogQ = new URLSearchParams({ diff, w: isWin ? '1' : '0' });
  if (time !== null) ogQ.set('time', String(time));
  if (name) ogQ.set('name', name);
  if (mode) ogQ.set('mode', mode);
  const origin = `https://${u.host}`;
  const ogImage = `${origin}/og?${ogQ.toString()}`;
  const shareUrl = `${origin}/share?${ogQ.toString()}`;
  const targetParams = [];
  if (mode) targetParams.push(`mode=${mode}`);
  if (utm) targetParams.push(utm);
  const target = `${origin}/${targetParams.length ? '?' + targetParams.join('&') : ''}`;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const html = `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, follow">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://bb.superzan.net/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bean Boom">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(shareUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
</head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f7efe3;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="text-align:center;padding:24px">
  <div style="font-size:22px;color:#e87b3a;font-weight:bold;letter-spacing:2px">BEAN BOOM</div>
  <h1 style="font-size:20px;color:#2d2d2d;margin:16px 0">${esc(title)}</h1>
  <p style="color:#6b6257;margin:0 0 24px">${esc(desc)}</p>
  <a href="${esc(target)}" style="display:inline-block;background:#e87b3a;color:#fff;text-decoration:none;padding:14px 36px;border-radius:9999px;font-size:18px;font-weight:bold">Play Now</a>
</div>
<script>setTimeout(function(){location.replace(${JSON.stringify(target)})},1200)</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
