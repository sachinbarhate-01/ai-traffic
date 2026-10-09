const uploadForm = document.querySelector('#upload-form');
const videoInput = document.querySelector('#video-file');
const fileName = document.querySelector('#file-name');
const uploadButton = document.querySelector('#upload-button');
const processButton = document.querySelector('#process-button');
const message = document.querySelector('#app-message');
const simulateButton = document.querySelector('#simulate-button');
const endButton = document.querySelector('#end-button');
let uploadedName = null;

function setMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

async function readResponse(response) {
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Request failed.');
  return payload;
}

videoInput.addEventListener('change', () => {
  const file = videoInput.files[0];
  uploadedName = null;
  processButton.disabled = true;
  if (!file) {
    fileName.textContent = 'Choose a video to upload';
    return;
  }
  fileName.textContent = file.name;
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['mp4', 'avi'].includes(extension)) {
    setMessage('Choose an MP4 or AVI video.', 'error');
    videoInput.value = '';
    fileName.textContent = 'Choose a video to upload';
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    setMessage('This video exceeds the 100 MB limit.', 'error');
    videoInput.value = '';
    fileName.textContent = 'Choose a video to upload';
    return;
  }
  setMessage('Ready to upload.');
});

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = videoInput.files[0];
  if (!file) return setMessage('Choose a video before uploading.', 'error');
  uploadButton.disabled = true;
  setMessage('Uploading video...');
  try {
    const body = new FormData();
    body.append('video', file);
    const response = await fetch('/api/upload', { method: 'POST', body });
    const result = await readResponse(response);
    uploadedName = result.filename;
    processButton.disabled = false;
    setMessage(result.message, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    uploadButton.disabled = false;
  }
});

processButton.addEventListener('click', async () => {
  if (!uploadedName) return setMessage('Upload a video before processing.', 'error');
  processButton.disabled = true;
  setMessage('Running actual vehicle inference on sampled frames...');
  document.querySelector('#inference-status').textContent = 'Inference running';
  try {
    const response = await fetch(`/api/process/${encodeURIComponent(uploadedName)}`, { method: 'POST' });
    const result = await readResponse(response);
    document.querySelector('#vehicle-count').textContent = result.vehicle_count;
    document.querySelector('#sample-count').textContent = `${result.sampled_frames} frames · peak ${result.peak_vehicle_count}`;
    document.querySelector('#density-value').textContent = result.density;
    document.querySelector('#signal-time').textContent = `${result.signal.green_seconds}s`;
    document.querySelector('#signal-label').textContent = `Green time · ${result.signal.label}`;
    document.querySelector('#green-light').classList.add('active');
    document.querySelector('#model-label').textContent = 'Sampled-frame inference';
    const rows = result.detections.map((item) => `<div class="detection-row"><span>${escapeHtml(item.class)}</span><strong>${item.count}</strong></div>`);
    document.querySelector('#detection-list').innerHTML = rows.length ? rows.join('') : '<p class="empty-state">Inference completed: no supported vehicle classes detected in the sampled frames.</p>';
    document.querySelector('#inference-status').textContent = 'Inference complete';
    setMessage(`${result.message} ${result.ambulance_detection}`, 'success');
  } catch (error) {
    document.querySelector('#inference-status').textContent = 'Unavailable';
    setMessage(error.message, 'error');
  } finally {
    processButton.disabled = false;
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function refreshCorridor() {
  try {
    const response = await fetch('/api/corridor');
    const state = await response.json();
    renderCorridor(state);
  } catch {
    document.querySelector('#corridor-message').textContent = 'Corridor status is unavailable.';
  }
}

function renderCorridor(state) {
  const active = Boolean(state.active);
  document.querySelector('#corridor-badge').textContent = active ? 'SIMULATED' : 'NORMAL';
  document.querySelector('#corridor-badge').classList.toggle('active', active);
  document.querySelector('#corridor-message').textContent = state.message;
  document.querySelector('#route-line').className = `route-line ${active ? state.direction : ''}`;
  simulateButton.disabled = active;
  endButton.disabled = !active;
}

simulateButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/corridor/simulate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: document.querySelector('#direction-select').value }),
    });
    renderCorridor(await readResponse(response));
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

endButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/corridor/end', { method: 'POST' });
    renderCorridor(await readResponse(response));
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

refreshCorridor();