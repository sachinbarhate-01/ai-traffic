const input = document.getElementById("trafficVideo");
const preview = document.getElementById("videoPreview");
const uploadStatus = document.getElementById("uploadStatus");
const processingStatus = document.getElementById("processingStatus");
const processingError = document.getElementById("processingError");
const uploadButton = document.getElementById("uploadButton");
const processButton = document.getElementById("processButton");
const progressWrap = document.getElementById("processingProgressWrap");
const progressBar = document.getElementById("processingProgressBar");
const annotatedSection = document.getElementById("annotatedSection");
const activityList = document.getElementById("activityList");
const activityEmpty = document.getElementById("activityEmpty");
const analyticsChart = document.getElementById("analyticsChart");
const analyticsCaption = document.getElementById("analyticsCaption");
let currentVideoUrl = null;
let uploadedFilename = null;
let liveStatusTimer = null;
let previousLiveStatus = "stopped";

function recordActivity(message, kind = "info") {
    activityEmpty?.remove();
    const item = document.createElement("li");
    item.className = kind;
    const icon = document.createElement("span");
    icon.className = "activity-icon";
    icon.textContent = kind === "error" ? "!" : kind === "success" ? "+" : "·";
    const content = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = message;
    const timestamp = document.createElement("small");
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    content.append(label, timestamp);
    item.append(icon, content);
    activityList.prepend(item);
    while (activityList.children.length > 6) activityList.lastElementChild.remove();
}

function renderAnalytics(counts, caption) {
    const entries = Object.entries(counts || {}).filter(([, count]) => Number(count) > 0);
    analyticsCaption.textContent = caption;
    analyticsChart.replaceChildren();
    if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "chart-empty";
        const icon = document.createElement("span");
        icon.className = "chart-empty-icon";
        icon.textContent = "∿";
        const title = document.createElement("strong");
        title.textContent = "No vehicle detections in this result";
        const detail = document.createElement("small");
        detail.textContent = "No supported classes were returned by model inference.";
        empty.append(icon, title, detail);
        analyticsChart.append(empty);
        return;
    }

    const largest = Math.max(...entries.map(([, count]) => Number(count)));
    for (const [vehicleClass, count] of entries) {
        const row = document.createElement("div");
        row.className = "chart-row";
        const name = document.createElement("span");
        name.className = "chart-name";
        name.textContent = vehicleClass;
        const track = document.createElement("span");
        track.className = "chart-track";
        const fill = document.createElement("span");
        fill.className = "chart-fill";
        fill.style.setProperty("--bar-width", `${(Number(count) / largest) * 100}%`);
        track.append(fill);
        const value = document.createElement("strong");
        value.className = "chart-value";
        value.textContent = count;
        row.append(name, track, value);
        analyticsChart.append(row);
    }
}

function updateSignalKpi(signal) {
    const timing = document.getElementById("signalTiming");
    const note = document.getElementById("signalTimingNote");
    if (!signal || signal.green_seconds === undefined || signal.red_seconds === undefined) {
        timing.textContent = "--";
        note.textContent = "No timing available";
        return;
    }
    timing.textContent = `G ${signal.green_seconds}s / R ${signal.red_seconds}s`;
    note.textContent = `${signal.label || "Prototype timing"} · simulated`;
}

function setBackendStatus(online) {
    document.getElementById("backendStatus").textContent = online ? "Connected" : "Unavailable";
    document.getElementById("backendDot").className = `status-dot ${online ? "online" : "offline"}`;
}

function startClock() {
    const clock = document.getElementById("liveClock");
    const tick = () => {
        clock.dateTime = new Date().toISOString();
        clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
    };
    tick();
    setInterval(tick, 1000);
}

const appShell = document.getElementById("appShell");
const sidebarToggle = document.getElementById("sidebarToggle");
function syncSidebarControl() {
    const mobile = window.matchMedia("(max-width: 620px)").matches;
    const compact = window.matchMedia("(max-width: 1180px)").matches;
    const expanded = mobile
        ? appShell.classList.contains("sidebar-open")
        : compact
            ? appShell.classList.contains("sidebar-expanded")
            : !appShell.classList.contains("sidebar-collapsed");
    sidebarToggle.setAttribute("aria-expanded", String(expanded));
    sidebarToggle.setAttribute("aria-label", expanded ? "Collapse navigation" : "Expand navigation");
}
sidebarToggle.addEventListener("click", () => {
    const mobile = window.matchMedia("(max-width: 620px)").matches;
    if (mobile) appShell.classList.toggle("sidebar-open");
    if (!mobile && window.matchMedia("(max-width: 1180px)").matches) {
        const expanded = appShell.classList.toggle("sidebar-expanded");
        appShell.classList.toggle("sidebar-collapsed", !expanded);
    } else if (!mobile) {
        const collapsed = appShell.classList.toggle("sidebar-collapsed");
        appShell.classList.toggle("sidebar-expanded", !collapsed);
    }
    syncSidebarControl();
});
window.addEventListener("resize", syncSidebarControl);
syncSidebarControl();
document.querySelectorAll(".side-nav a").forEach((link) => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".side-nav a").forEach((item) => item.classList.remove("active"));
        link.classList.add("active");
        appShell.classList.remove("sidebar-open");
        syncSidebarControl();
    });
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        appShell.classList.remove("sidebar-open");
        syncSidebarControl();
    }
});
startClock();

function clearAnalysis() {
    document.getElementById("analysisDetails").hidden = true;
    annotatedSection.hidden = true;
    document.getElementById("classCounts").replaceChildren();
    document.getElementById("vehicleCount").textContent = "--";
    document.getElementById("vehicleCountNote").textContent = "Awaiting inference";
    document.getElementById("density").textContent = "--";
    document.getElementById("framesKpi").textContent = "--";
    document.getElementById("framesKpiNote").textContent = "No completed video run";
    progressWrap.hidden = true;
    progressWrap.classList.remove("is-busy", "is-complete");
    progressBar.style.removeProperty("width");
    document.getElementById("progressLabel").textContent = "Processing";
    updateSignalKpi(null);
    renderAnalytics({}, "Waiting for model output");
}

function clearPreview() {
    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = null;
    preview.removeAttribute("src");
    preview.style.display = "none";
}

input.addEventListener("change", () => {
    const file = input.files[0];
    uploadedFilename = null;
    processButton.disabled = true;
    processingError.textContent = "";
    clearAnalysis();
    if (!file) {
        clearPreview();
        document.getElementById("selectedFileName").textContent = "Select a video from this laptop";
        uploadStatus.textContent = "No video selected.";
        return;
    }

    const extension = file.name.split(".").pop().toLowerCase();
    const maxBytes = Number(input.dataset.maxBytes);
    if (!["mp4", "avi", "mov"].includes(extension)) {
        clearPreview();
        document.getElementById("selectedFileName").textContent = "Select a video from this laptop";
        uploadStatus.textContent = "Choose an MP4, AVI, or MOV video.";
        input.value = "";
        return;
    }
    if (file.size > maxBytes) {
        clearPreview();
        document.getElementById("selectedFileName").textContent = "Select a video from this laptop";
        uploadStatus.textContent = `The selected video exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;
        input.value = "";
        return;
    }

    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(file);
    preview.src = currentVideoUrl;
    preview.style.display = "block";
    document.getElementById("selectedFileName").textContent = file.name;
    uploadStatus.textContent = `Selected: ${file.name}`;
    processingStatus.textContent = "Ready to upload.";
    recordActivity(`Selected ${file.name}`);
});

async function readJson(response) {
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Request failed (${response.status}).`);
    }
    return result;
}

uploadButton.addEventListener("click", async () => {
    const file = input.files[0];
    if (!file) {
        uploadStatus.textContent = "Select an MP4, AVI, or MOV video first.";
        return;
    }

    uploadButton.disabled = true;
    uploadStatus.textContent = "Uploading video...";
    processingError.textContent = "";
    recordActivity(`Uploading ${file.name}`);
    try {
        const body = new FormData();
        body.append("video", file);
        const result = await readJson(await fetch("/api/upload", { method: "POST", body }));
        uploadedFilename = result.filename;
        processButton.disabled = false;
        uploadStatus.textContent = result.message;
        processingStatus.textContent = "Upload complete. Ready for inference.";
        recordActivity(`Upload accepted: ${file.name}`, "success");
    } catch (error) {
        uploadStatus.textContent = "Upload failed.";
        processingError.textContent = error.message;
        recordActivity(`Upload failed: ${error.message}`, "error");
    } finally {
        uploadButton.disabled = false;
    }
});

processButton.addEventListener("click", async () => {
    if (!uploadedFilename) {
        processingError.textContent = "Upload a video before starting inference.";
        return;
    }

    processButton.disabled = true;
    uploadButton.disabled = true;
    progressWrap.hidden = false;
    progressWrap.classList.remove("is-complete");
    progressWrap.classList.add("is-busy");
    document.getElementById("progressLabel").textContent = "INFERENCE IN PROGRESS";
    processingError.textContent = "";
    processingStatus.textContent = "Processing every video frame with YOLO. This may take a while.";
    recordActivity("Frame-by-frame inference started");
    try {
        const result = await readJson(await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: uploadedFilename }),
        }));
        document.getElementById("vehicleCount").textContent = result.vehicle_detections;
        document.getElementById("vehicleCountNote").textContent = `${result.frames_processed} frames · detection instances`;
        document.getElementById("density").textContent = result.density;
        document.getElementById("framesKpi").textContent = result.frames_processed;
        document.getElementById("framesKpiNote").textContent = "Frames analyzed from uploaded clip";
        updateSignalKpi(result.signal);
        document.getElementById("totalDetections").textContent = result.vehicle_detections;
        document.getElementById("averageVehicles").textContent = result.average_vehicle_count;
        document.getElementById("peakVehicles").textContent = result.peak_vehicle_count;
        document.getElementById("framesProcessed").textContent = result.frames_processed;

        const classCounts = document.getElementById("classCounts");
        classCounts.replaceChildren();
        for (const [vehicleClass, count] of Object.entries(result.counts)) {
            const item = document.createElement("li");
            item.textContent = `${vehicleClass}: ${count} detections`;
            classCounts.append(item);
        }
        if (classCounts.childElementCount === 0) {
            const item = document.createElement("li");
            item.textContent = "No supported vehicle classes detected.";
            classCounts.append(item);
        }

        document.getElementById("analysisDetails").hidden = false;
        document.getElementById("analysisSource").textContent = "Uploaded video";
        renderAnalytics(result.counts, "Uploaded video · all processed frames");
        const annotatedVideo = document.getElementById("annotatedVideo");
        annotatedVideo.src = result.annotated_video_url;
        annotatedVideo.load();
        annotatedSection.hidden = false;
        progressWrap.classList.remove("is-busy");
        progressWrap.classList.add("is-complete");
        document.getElementById("progressLabel").textContent = `${result.frames_processed} FRAMES COMPLETE`;
        processingStatus.textContent = `${result.message} ${result.frames_processed} frames processed.`;
        recordActivity(`Inference complete · ${result.frames_processed} frames · density ${result.density}`, "success");
    } catch (error) {
        progressWrap.classList.remove("is-busy");
        progressWrap.hidden = true;
        processingStatus.textContent = "Processing failed. No detection results were reported.";
        processingError.textContent = error.message;
        recordActivity(`Inference failed: ${error.message}`, "error");
    } finally {
        processButton.disabled = !uploadedFilename;
        uploadButton.disabled = false;
    }
});

const emergencyStatus = document.getElementById("emergencyStatus");
const startEmergency = document.getElementById("startEmergency");
const endEmergency = document.getElementById("endEmergency");

function showCorridorState(state) {
    emergencyStatus.textContent = state.active
        ? `SIMULATED: ${state.direction.toUpperCase()} priority`
        : "Normal traffic";
    startEmergency.disabled = state.active;
    endEmergency.disabled = !state.active;
    document.getElementById("corridorDot").className = `status-dot ${state.active ? "warning" : "online"}`;
    if (state.active !== showCorridorState.wasActive) {
        recordActivity(state.active ? `Corridor simulation active · ${state.direction}bound` : "Corridor simulation returned to normal", "success");
    }
    showCorridorState.wasActive = state.active;
}
showCorridorState.wasActive = false;

async function refreshCorridor() {
    try {
        const response = await fetch("/api/corridor");
        showCorridorState(await response.json());
    } catch {
        emergencyStatus.textContent = "Status unavailable";
    }
}

startEmergency.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/corridor/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ direction: document.getElementById("emergencyDirection").value }),
        });
        showCorridorState(await readJson(response));
    } catch (error) {
        emergencyStatus.textContent = error.message;
        recordActivity(`Corridor simulation failed: ${error.message}`, "error");
    }
});

endEmergency.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/corridor/end", { method: "POST" });
        showCorridorState(await readJson(response));
    } catch (error) {
        emergencyStatus.textContent = error.message;
        recordActivity(`Corridor reset failed: ${error.message}`, "error");
    }
});

refreshCorridor();

const usbStartButton = document.getElementById("startUsbLive");
const usbStopButton = document.getElementById("stopUsbLive");
const usbStatus = document.getElementById("usbConnectionStatus");
const usbError = document.getElementById("usbLiveError");
const usbFrame = document.getElementById("usbLiveFrame");
const usbMetrics = document.getElementById("usbLiveMetrics");

function renderLiveStatus(state) {
    usbStatus.textContent = state.message || "USB camera status unavailable.";
    usbStartButton.disabled = Boolean(state.active);
    usbStopButton.disabled = !state.active;
    document.getElementById("usbStatusDot").className = `status-dot ${state.active ? "online" : state.status === "error" || state.status === "unavailable" ? "offline" : ""}`;
    document.getElementById("usbBadgeText").textContent = state.status === "streaming"
        ? "LIVE"
        : state.active ? "CONNECTING" : state.status === "error" || state.status === "unavailable" ? "ERROR" : "OFFLINE";

    if (state.error) {
        usbError.textContent = state.error;
        if (previousLiveStatus !== state.status) recordActivity(`USB camera error: ${state.error}`, "error");
    } else if (state.active) {
        usbError.textContent = "";
    }
    if (previousLiveStatus !== state.status && state.status !== "error" && state.status !== "unavailable") {
        if (state.status === "streaming") recordActivity("USB camera inference is live", "success");
        if (state.status === "stopped" && previousLiveStatus !== "stopped") recordActivity("USB camera stopped");
    }
    previousLiveStatus = state.status;

    const cameraEmpty = document.getElementById("cameraEmpty");
    const viewportLiveTag = document.getElementById("viewportLiveTag");
    cameraEmpty.hidden = state.status === "streaming";
    viewportLiveTag.hidden = !state.active;
    if (state.active && state.status !== "streaming") {
        cameraEmpty.querySelector("strong").textContent = "Connecting to camera stream";
        cameraEmpty.querySelector("small").textContent = "Waiting for the first annotated frame.";
    } else if (!state.active) {
        cameraEmpty.querySelector("strong").textContent = state.status === "unavailable" || state.status === "error"
            ? "Camera feed unavailable"
            : "Camera feed is offline";
        cameraEmpty.querySelector("small").textContent = state.message || "Connect a webcam bridge, then start live video.";
    }

    if (state.frame_vehicle_count !== null && state.frame_vehicle_count !== undefined) {
        document.getElementById("usbVehicleCount").textContent = state.frame_vehicle_count;
        document.getElementById("usbDensity").textContent = state.density || "--";
        document.getElementById("usbSignalStatus").textContent = state.signal
            ? `SIMULATED PLAN: Green ${state.signal.green_seconds}s / Red ${state.signal.red_seconds}s`
            : "--";
        document.getElementById("usbSignalTiming").textContent = state.signal
            ? state.signal.label
            : "Software simulation only.";

        const list = document.getElementById("usbClassCounts");
        list.replaceChildren();
        for (const [vehicleClass, count] of Object.entries(state.counts || {})) {
            const item = document.createElement("li");
            item.textContent = `${vehicleClass}: ${count}`;
            list.append(item);
        }
        if (list.childElementCount === 0) {
            const item = document.createElement("li");
            item.textContent = "No supported vehicles detected in this frame.";
            list.append(item);
        }
        usbMetrics.hidden = false;
        document.getElementById("vehicleCount").textContent = state.frame_vehicle_count;
        document.getElementById("vehicleCountNote").textContent = "Current USB camera frame";
        document.getElementById("density").textContent = state.density || "--";
        document.getElementById("framesKpi").textContent = "--";
        document.getElementById("framesKpiNote").textContent = "Live endpoint has no cumulative frame total";
        updateSignalKpi(state.signal);
        renderAnalytics(state.counts, "USB live camera · current frame");
    }

    if (!state.active && state.status !== "connecting") {
        usbFrame.hidden = true;
        usbFrame.removeAttribute("src");
        document.getElementById("viewportLiveTag").hidden = true;
        usbMetrics.hidden = true;
        document.getElementById("usbVehicleCount").textContent = "--";
        document.getElementById("usbDensity").textContent = "--";
        document.getElementById("usbSignalStatus").textContent = "--";
        document.getElementById("usbSignalTiming").textContent = "Software simulation only.";
        document.getElementById("usbClassCounts").replaceChildren();
        if (liveStatusTimer) {
            clearInterval(liveStatusTimer);
            liveStatusTimer = null;
        }
    }
}

async function refreshLiveStatus() {
    try {
        const response = await fetch("/api/live/status", { cache: "no-store" });
        renderLiveStatus(await response.json());
        setBackendStatus(response.ok);
        refreshLiveStatus.reportedError = false;
    } catch {
        usbStatus.textContent = "Could not read USB camera connection status.";
        setBackendStatus(false);
        if (!refreshLiveStatus.reportedError) recordActivity("Flask service status unavailable", "error");
        refreshLiveStatus.reportedError = true;
    }
}
refreshLiveStatus.reportedError = false;

usbStartButton.addEventListener("click", async () => {
    usbStartButton.disabled = true;
    usbError.textContent = "";
    usbStatus.textContent = "Opening configured OpenCV camera...";
    try {
        const result = await readJson(await fetch("/api/live/start", { method: "POST" }));
        usbFrame.src = `${result.stream_url}?t=${Date.now()}`;
        usbFrame.hidden = false;
        usbMetrics.hidden = false;
        usbStopButton.disabled = false;
        usbStatus.textContent = result.message;
        if (liveStatusTimer) clearInterval(liveStatusTimer);
        liveStatusTimer = setInterval(refreshLiveStatus, 750);
    } catch (error) {
        usbStartButton.disabled = false;
        usbStatus.textContent = "USB live video could not start.";
        usbError.textContent = error.message;
        recordActivity(`USB camera start failed: ${error.message}`, "error");
        await refreshLiveStatus();
    }
});

usbStopButton.addEventListener("click", async () => {
    usbStopButton.disabled = true;
    try {
        const response = await fetch("/api/live/stop", { method: "POST" });
        const state = await response.json();
        renderLiveStatus(state);
    } catch (error) {
        usbError.textContent = `Could not stop USB live video: ${error.message}`;
        recordActivity(`USB camera stop failed: ${error.message}`, "error");
    } finally {
        usbFrame.hidden = true;
        usbFrame.removeAttribute("src");
        document.getElementById("cameraEmpty").hidden = false;
        document.getElementById("cameraEmpty").querySelector("strong").textContent = "Camera feed is offline";
        document.getElementById("cameraEmpty").querySelector("small").textContent = "Connect a webcam bridge, then start live video.";
        document.getElementById("viewportLiveTag").hidden = true;
        usbStartButton.disabled = false;
        if (liveStatusTimer) {
            clearInterval(liveStatusTimer);
            liveStatusTimer = null;
        }
    }
});

usbFrame.addEventListener("error", () => {
    if (!usbStopButton.disabled) {
        usbError.textContent = "Annotated live stream disconnected. Check camera and model status.";
        recordActivity("Annotated camera stream disconnected", "error");
        refreshLiveStatus();
    }
});

refreshLiveStatus();
