const $ = (id) => document.getElementById(id);
const drop = $('drop'), input = $('file'), pick = $('pick'), job = $('job');
let timer, clock, t0, current;

['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && start(e.dataTransfer.files[0]));
input.addEventListener('change', () => input.files[0] && start(input.files[0]));
$('again').addEventListener('click', reset);
$('retry').addEventListener('click', reset);

const mb = (b) => (b / 1048576).toFixed(b > 10485760 ? 0 : 1) + ' MB';
const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function step(n) { // 0 choose, 1 convert, 2 download
  [...$('steps').children].forEach((li, i) => { li.className = i < n ? 'done' : i === n ? 'on' : ''; });
}
function show(pct, msg, opts = {}) {
  $('fill').style.width = pct + '%';
  $('bar').classList.toggle('wait', !!opts.wait);
  $('pct').textContent = opts.wait ? '' : pct + '%';
  $('msg').textContent = msg;
  $('msg').className = opts.err ? 'err' : '';
}
function reset() {
  clearInterval(timer); clearInterval(clock);
  job.classList.add('hidden'); pick.classList.remove('hidden');
  $('result').classList.add('hidden'); $('failbtn').classList.add('hidden');
  input.value = ''; step(0);
}

function start(file) {
  if (!/\.(mov|mp4|m4v)$/i.test(file.name)) { alert('Please choose a .mov, .mp4 or .m4v video.'); input.value = ''; return; }
  current = file; t0 = Date.now();
  pick.classList.add('hidden'); job.classList.remove('hidden');
  $('fname').textContent = file.name; step(1);
  clock = setInterval(() => { $('time').textContent = 'Elapsed ' + mmss((Date.now() - t0) / 1000); }, 500);
  show(0, 'Uploading…');

  const fd = new FormData();
  fd.append('speed', document.querySelector('input[name=speed]:checked').value);
  fd.append('video', file);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/convert');
  xhr.upload.onprogress = (e) => e.lengthComputable && show(Math.round(e.loaded / e.total * 100), 'Uploading ' + mb(e.loaded) + ' of ' + mb(e.total));
  xhr.upload.onload = () => show(0, 'Starting…', { wait: true });
  xhr.onerror = () => fail('Could not reach the server. Check your connection and try again.');
  xhr.onload = () => {
    let r = {}; try { r = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status !== 200) return fail(r.error || 'Upload failed.');
    poll(r.id);
  };
  xhr.send(fd);
}

function fail(text) {
  clearInterval(timer); clearInterval(clock);
  show(0, text, { err: true }); $('failbtn').classList.remove('hidden');
}

function poll(id) {
  let convStart = 0;
  timer = setInterval(async () => {
    try {
      const r = await (await fetch('/api/status/' + id)).json();
      if (r.error && !r.status) return fail(r.error);
      if (r.status === 'queued') show(0, r.position > 1 ? `Waiting in line (${r.position - 1} ahead)…` : 'Waiting to start…', { wait: true });
      else if (r.status === 'converting') {
        if (!convStart) convStart = Date.now();
        let msg = 'Converting…';
        if (r.progress >= 5) { const left = (Date.now() - convStart) / 1000 * (100 - r.progress) / r.progress; msg = 'Converting, about ' + mmss(left) + ' left'; }
        show(r.progress, msg, { wait: r.progress === 0 });
      } else if (r.status === 'error') fail(r.error);
      else if (r.status === 'done') {
        clearInterval(timer); clearInterval(clock); step(3);
        show(100, 'Finished in ' + mmss((Date.now() - t0) / 1000));
        $('time').textContent = '';
        $('dl').href = '/api/download/' + id;
        $('sizes').textContent = 'Original ' + mb(current.size);
        $('result').classList.remove('hidden');
      }
    } catch { /* keep trying */ }
  }, 1500);
}
