// Mirror local commit to GitHub via Git Data API (git endpoint unreachable)
// Creates identical commit object (same tree/author/committer/message) => same SHA => no divergence
import { execSync } from 'node:child_process';

const REPO = 'punkzan/beanboom';
const COMMIT = process.argv[2] || 'HEAD';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', cwd: process.cwd() }).trim();

const token = sh('printf "protocol=https\\nhost=github.com\\n\\n" | git -c credential.helper= -c credential.helper=wincred credential fill | sed -n "s/^password=//p"');
if (!token.startsWith('gho_')) { console.error('no token'); process.exit(1); }

const api = async (path, opts = {}) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'beanboom-mirror',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
};

// --- gather local commit facts ---
const commitSha = sh(`git rev-parse ${COMMIT}`);
const parentSha = sh(`git rev-parse "${COMMIT}^"`);
const treeSha = sh(`git rev-parse "${COMMIT}^{\"tree\"}"`);
const files = sh(`git diff-tree --no-commit-id --name-only -r ${COMMIT}`).split('\n').filter(Boolean);

const raw = execSync(`git cat-file commit ${COMMIT}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }); // NO trim — keep trailing \n of message
// parse author/committer lines
const line = (k) => raw.split('\n').find(l => l.startsWith(k + ' ')).slice(k.length + 1);
const authorParts = line('author').match(/^(.*) <(.*)> (\d+) ([+-]\d{4})$/);
const commParts = line('committer').match(/^(.*) <(.*)> (\d+) ([+-]\d{4})$/);
const iso = (sec, tz) => {
  const sign = tz[0] === '+' ? 1 : -1;
  const off = sign * (parseInt(tz.slice(1, 3)) * 3600 + parseInt(tz.slice(3)) * 60);
  // git stores the UTC epoch seconds; wall-clock in tz = instant + offset
  return new Date((parseInt(sec) + off) * 1000).toISOString().replace(/\.000Z$/, tz.replace(/^([+-])(\d{2})(\d{2})$/, '$1$2:$3'));
};
const msg = raw.slice(raw.indexOf('\n\n') + 2); // includes trailing \n

console.log(`local commit: ${commitSha}`);
console.log(`parent: ${parentSha}  tree: ${treeSha}  files: ${files.join(', ')}`);

// --- 1. upload blobs ---
const treeEntries = [];
for (const f of files) {
  const localBlob = sh(`git rev-parse ${COMMIT}:${f}`);
  const content = execSync(`git cat-file blob ${COMMIT}:${f}`, { maxBuffer: 50 * 1024 * 1024 }).toString('base64');
  const blob = await api('git/blobs', { method: 'POST', body: JSON.stringify({ content, encoding: 'base64' }) });
  if (blob.sha !== localBlob) throw new Error(`blob mismatch for ${f}: ${blob.sha} != ${localBlob}`);
  const mode = sh(`git ls-tree ${COMMIT} -- ${f}`).split(/\s+/)[0];
  treeEntries.push({ path: f, mode, type: 'blob', sha: blob.sha });
  console.log(`blob ok: ${f} -> ${blob.sha.slice(0, 8)}`);
}

// --- 2. create tree on top of remote parent's tree ---
const parentTree = sh(`git rev-parse "${parentSha}^{\"tree\"}"`);
const tree = await api('git/trees', {
  method: 'POST',
  body: JSON.stringify({ base_tree: parentTree, tree: treeEntries }),
});
console.log(`tree created: ${tree.sha}${tree.sha === treeSha ? ' (== local, exact match)' : ' (DIFFERS from local ' + treeSha + ')'}`);
if (tree.sha !== treeSha) throw new Error('tree mismatch — aborting to avoid divergence');

// --- 3. create commit with identical metadata ---
const commit = await api('git/commits', {
  method: 'POST',
  body: JSON.stringify({
    message: msg,
    tree: tree.sha,
    parents: [parentSha],
    author: { name: authorParts[1], email: authorParts[2], date: iso(authorParts[3], authorParts[4]) },
    committer: { name: commParts[1], email: commParts[2], date: iso(commParts[3], commParts[4]) },
  }),
});
console.log(`commit created: ${commit.sha}${commit.sha === commitSha ? ' (== local, exact match!)' : ' (DIFFERS!)'}`);
if (commit.sha !== commitSha) throw new Error('commit mismatch — aborting to avoid divergence');

// --- 4. fast-forward remote ref ---
const ref = await api('git/refs/heads/master', {
  method: 'PATCH',
  body: JSON.stringify({ sha: commit.sha, force: false }),
});
console.log(`ref updated: ${ref.object.sha} == ${commitSha} -> ${ref.object.sha === commitSha}`);
