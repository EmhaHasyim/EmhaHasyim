// Fetches live GitHub numbers and regenerates glass-stats.svg (light) + glass-stats-dark.svg.
// Runs daily via .github/workflows/update-stats.yml and locally with `node scripts/update-stats.mjs`.
import { writeFileSync } from 'node:fs';

const OWNER = 'EmhaHasyim';
const HEADERS = {
  'User-Agent': 'update-stats',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}),
};

async function gh(path) {
  const r = await fetch('https://api.github.com' + path, { headers: HEADERS });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

// ---- metrics: public repos, total stars, member since, languages ----
async function account() {
  const [user, repos] = await Promise.all([
    gh(`/users/${OWNER}`),
    gh(`/users/${OWNER}/repos?per_page=100&affiliation=owner&type=public`),
  ]);
  const own = repos.filter((r) => !r.fork);
  return {
    repos: own.length,
    stars: own.reduce((a, r) => a + r.stargazers_count, 0),
    sinceYear: user.created_at.slice(0, 4),
    sinceLabel: new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    reposList: own.map((r) => r.name),
  };
}

async function languages(reposList) {
  const sums = {};
  for (const repo of reposList) {
    const langs = await gh(`/repos/${OWNER}/${repo}/languages`);
    for (const [k, v] of Object.entries(langs)) sums[k] = (sums[k] || 0) + v;
  }
  return sums;
}

const LANG_COLORS = { TypeScript: '#3178C6', Rust: '#DEA584', Svelte: '#FF3E00', JavaScript: '#F1E05A', CSS: '#663399', HTML: '#E34C26', Vue: '#41B883' };
function topLanguages(sums) {
  const total = Object.values(sums).reduce((a, b) => a + b, 0);
  const entries = Object.entries(sums).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 3);
  const rest = total - top.reduce((a, [, v]) => a + v, 0);
  const segs = top.map(([name, v]) => ({ name, pct: Math.round((v / total) * 100), color: LANG_COLORS[name] || '#94A3B8' }));
  const used = segs.reduce((a, s) => a + s.pct, 0);
  if (rest > 0 && top.length < 4) segs.push({ name: 'Lainnya', pct: Math.max(1, 100 - used), color: '#94A3B8' });
  else if (segs.length) segs[segs.length - 1].pct = 100 - (used - segs[segs.length - 1].pct);
  return segs;
}

// ---- themes ----
const PALETTES = {
  light: {
    bg: ['#F6F0FF', '#F3F9FF', '#FFF0F8'],
    blobs: [['#A78BFA', 0.5], ['#22D3EE', 0.4], ['#F472B6', 0.35], ['#8B5CF6', 0.22]],
    tile: { fill: '#FFFFFF', fo: 0.55, stroke: '#FFFFFF', so: 0.95, shadow: '#8B5CF6', sho: 0.12 },
    text: '#1F2328', labelOp: 0.45, subOp: 0.55, sepOp: 0.3, sepWhite: 0.85,
  },
  dark: {
    bg: ['#211B3A', '#131A33', '#2B1128'],
    blobs: [['#8B5CF6', 0.55], ['#22D3EE', 0.45], ['#F472B6', 0.5], ['#06B6D4', 0.3]],
    tile: { fill: '#FFFFFF', fo: 0.07, stroke: '#FFFFFF', so: 0.18, shadow: '#000000', sho: 0.5 },
    text: '#F3EEFF', labelOp: 0.62, subOp: 0.55, sepOp: 0.35, sepWhite: 0.9,
  },
};

const W = 760, H = 252;
function render(pal, { repos, stars, sinceYear, sinceLabel, segs }) {
  const blob = (cx, cy, r, c1, o) => `
    <radialGradient id="b${cx}${cy}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${c1}" stop-opacity="${o}"/>
      <stop offset="1" stop-color="${c1}" stop-opacity="0"/>
    </radialGradient>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#b${cx}${cy})" filter="url(#soft)"/>`;
  const defs = `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${pal.bg[0]}"/>
        <stop offset="0.55" stop-color="${pal.bg[1]}"/>
        <stop offset="1" stop-color="${pal.bg[2]}"/>
      </linearGradient>
      <filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26"/></filter>
      <filter id="tile" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="${pal.tile.shadow}" flood-opacity="${pal.tile.sho}"/></filter>
      ${pal.blobs.map(([c, o], i) => blob([120, 660, 600, 150][i], [60, 70, 205, 210][i], [120, 130, 110, 90][i], c, o)).join('')}
    </defs>`;
  const tile = (x, y, w, h, rx = 18) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${pal.tile.fill}" fill-opacity="${pal.tile.fo}" stroke="${pal.tile.stroke}" stroke-opacity="${pal.tile.so}" stroke-width="1.2" filter="url(#tile)"/>`;
  const cLabel = (cx, y, t) => `<text x="${cx}" y="${y}" text-anchor="middle" font-family="'Segoe UI',-apple-system,Helvetica,Arial,sans-serif" font-size="10.5" font-weight="600" letter-spacing="2" fill="${pal.text}" fill-opacity="${pal.labelOp}">${t}</text>`;
  const cBig = (cx, y, t, size = 40) => `<text x="${cx}" y="${y}" text-anchor="middle" font-family="'Segoe UI',-apple-system,Helvetica,Arial,sans-serif" font-size="${size}" font-weight="700" fill="${pal.text}">${t}</text>`;
  const cSub = (cx, y, t) => `<text x="${cx}" y="${y}" text-anchor="middle" font-family="'Segoe UI',-apple-system,Helvetica,Arial,sans-serif" font-size="12" fill="${pal.text}" fill-opacity="${pal.subOp}">${t}</text>`;

  const tileW = 226, gap = 17, tH = 96, y0 = 26;
  const rowW = tileW * 3 + gap * 2;
  const x0 = (W - rowW) / 2;
  const items = [
    { label: 'Public repos', num: String(repos), note: 'owned' },
    { label: 'Total stars', num: String(stars), note: 'across repos' },
    { label: 'On GitHub since', num: sinceYear, note: sinceLabel },
  ];
  let out = items.map((t, i) => {
    const x = x0 + i * (tileW + gap);
    const cx = x + tileW / 2;
    return tile(x, y0, tileW, tH) + cLabel(cx, y0 + 28, t.label) + cBig(cx, y0 + 66, t.num) + cSub(cx, y0 + 84, t.note);
  }).join('');

  const y1 = y0 + tH + 14, lH = 106;
  const barW = 470, barH = 16, barY = y1 + 52;
  const barX = (W - barW) / 2;
  let acc = 0;
  let barSvg = '';
  segs.forEach((s, i) => {
    const w = Math.round((barW * s.pct) / 100);
    barSvg += `<rect x="${barX + acc}" y="${barY}" width="${w}" height="${barH}" rx="${i === 0 ? 8 : 0}" fill="${s.color}"/>`;
    if (i > 0) barSvg += `<rect x="${barX + acc - 2}" y="${barY}" width="4" height="${barH}" fill="#FFFFFF" fill-opacity="${pal.sepWhite}"/>`;
    acc += w;
  });

  const approx = (s) => (s.name.length + String(s.pct).length + 1) * 7.1 + 12;
  const sepW = 22;
  let total = 0;
  for (const s of segs) total += approx(s) + sepW;
  total -= sepW;
  let cursor = (W - total) / 2;
  let legSvg = '';
  segs.forEach((s, i) => {
    const w = approx(s);
    legSvg += `<circle cx="${cursor + 6}" cy="${barY + barH + 21}" r="4" fill="${s.color}"/>`;
    legSvg += `<text x="${cursor + 15}" y="${barY + barH + 24}" font-family="'Segoe UI',-apple-system,Helvetica,Arial,sans-serif" font-size="12.5" fill="${pal.text}">${s.name} ${s.pct}%</text>`;
    cursor += w;
    if (i < segs.length - 1) {
      legSvg += `<text x="${cursor}" y="${barY + barH + 24}" text-anchor="middle" font-size="11" fill="${pal.text}" fill-opacity="${pal.sepOp}" font-family="'Segoe UI',-apple-system,Helvetica,Arial,sans-serif">·</text>`;
      cursor += sepW;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats glass">
  ${defs}
  <rect x="0" y="0" width="${W}" height="${H}" rx="26" fill="url(#bg)"/>
  ${out}
  ${tile(x0, y1, rowW, lH)}
  ${cLabel(W / 2, y1 + 28, 'Most used languages')}
  ${barSvg}
  ${legSvg}
</svg>`;
}

const acct = await account();
const langs = await languages(acct.reposList);
const segs = topLanguages(langs);
const data = { repos: acct.repos, stars: acct.stars, sinceYear: acct.sinceYear, sinceLabel: acct.sinceLabel, segs };
for (const [name, pal] of Object.entries(PALETTES)) {
  writeFileSync(new URL(`../glass-stats${name === 'dark' ? '-dark' : ''}.svg`, import.meta.url), render(pal, data));
}
console.log(JSON.stringify({ repos: acct.repos, stars: acct.stars, since: acct.sinceLabel, languages: segs.map((s) => `${s.name} ${s.pct}%`) }));
console.log('glass-stats.svg + glass-stats-dark.svg updated');
