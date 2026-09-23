// Frameshift server. Conversion runs here, not in the visitor's browser.
// ffmpeg (from the ffmpeg-static package) is only started when a job actually runs.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const MAX_MB = parseInt(process.env.MAX_MB || '500', 10);
const KEEP_MS = 20 * 60 * 1000; // delete files 20 minutes after upload
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'frameshift-'));

const app = express();
const jobs = new Map();
const queue = [];
let running = false;

const upload = multer({
  storage: multer.diskStorage({
    destination: TMP,
    filename: (_r, f, cb) => cb(null, crypto.randomUUID() + path.extname(f.originalname).toLowerCase())
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_r, f, cb) => {
    const ok = ['.mov', '.mp4', '.m4v'].includes(path.extname(f.originalname).toLowerCase());
    cb(ok ? null : new Error('Only .mov, .mp4 or .m4v files are supported.'), ok);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/convert', (req, res) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${MAX_MB} MB.` : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    const id = crypto.randomUUID();
    jobs.set(id, {
      id, input: req.file.path, output: path.join(TMP, id + '.mp4'),
      name: path.basename(req.file.originalname, path.extname(req.file.originalname)),
      fast: (req.body && req.body.speed) === 'fast',
      status: 'queued', progress: 0, created: Date.now()
    });
    queue.push(id);
    next();
    res.json({ id });
  });
});

app.get('/api/status/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'Job expired or not found.' });
  const pos = queue.indexOf(j.id);
  res.json({ status: j.status, progress: j.progress, error: j.error, position: pos + 1 });
});

app.get('/api/download/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j || j.status !== 'done') return res.status(404).send('Not ready or expired.');
  res.download(j.output, `${j.name}-frameshift.mp4`);
});

// One conversion at a time: free hosting has very little CPU/RAM.
function next() {
  if (running || !queue.length) return;
  const job = jobs.get(queue.shift());
  if (!job) return next();
  running = true;
  job.status = 'converting';
  convert(job).catch((e) => { job.status = 'error'; job.error = e.message; })
    .finally(() => { fs.unlink(job.input, () => {}); running = false; next(); });
}

function ffmpegBin() { return require('ffmpeg-static'); } // loaded only when needed

function run(args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin(), args);
    let log = '';
    p.stderr.on('data', (d) => { const s = d.toString(); log += s; onLine && onLine(s); });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, log }));
  });
}

const toSec = (h, m, s) => (+h) * 3600 + (+m) * 60 + parseFloat(s);

async function convert(job) {
  // Read the file's info (duration, fps, HDR) without needing ffprobe.
  const probe = await run(['-hide_banner', '-i', job.input]);
  const d = probe.log.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const duration = d ? toSec(d[1], d[2], d[3]) : 0;
  const v = (probe.log.match(/Stream #.*Video:.*/) || [''])[0];
  if (!v) throw new Error('No video found in this file.');
  const fps = parseFloat((v.match(/([\d.]+) fps/) || [0, 30])[1]);
  const hdr = /bt2020|smpte2084|arib-std-b67|10le/.test(v);

  const filters = (tonemap) => {
    const f = [];
    if (fps > 30.5) f.push('fps=30');
    // Shrink first: the colour fix below is slow, so it should run on 1080p pixels, not 4K ones.
    f.push("scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2");
    if (tonemap) f.push('zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709',
      'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv');
    f.push('format=yuv420p');
    return f.join(',');
  };

  const args = (tonemap) => ['-y', '-i', job.input, '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', filters(tonemap),
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
    '-preset', job.fast ? 'ultrafast' : 'veryfast', '-crf', '23', '-maxrate', '8M', '-bufsize', '16M',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
    '-movflags', '+faststart', '-map_metadata', '-1', job.output];

  const onLine = (s) => {
    const t = [...s.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)].pop();
    if (t && duration) job.progress = Math.min(99, Math.round(toSec(t[1], t[2], t[3]) / duration * 100));
  };

  let r = await run(args(hdr), onLine);
  if (r.code !== 0 && hdr) { job.progress = 0; r = await run(args(false), onLine); } // fallback if HDR filter is missing
  if (r.code !== 0) throw new Error('Conversion failed. The file may be damaged or unsupported.');
  job.progress = 100;
  job.status = 'done';
}

setInterval(() => {
  for (const [id, j] of jobs) {
    if (Date.now() - j.created > KEEP_MS) {
      fs.unlink(j.input, () => {}); fs.unlink(j.output, () => {}); jobs.delete(id);
    }
  }
}, 60 * 1000).unref();

app.listen(PORT, () => console.log(`Frameshift running on port ${PORT} (max ${MAX_MB} MB)`));
