const input = document.getElementById("trafficVideo");
const preview = document.getElementById("videoPreview");
const uploadStatus = document.getElementById("uploadStatus");
const processingStatus = document.getElementById("processingStatus");
const processingError = document.getElementById("processingError");
const uploadButton = document.getElementById("uploadButton");
const processButton = document.getElementById("processButton");
const progress = document.getElementById("processingProgress");
const annotatedSection = document.getElementById("annotatedSection");
let currentVideoUrl = null;
let uploadedFilename = null;
let liveStatusTimer = null;

function clearAnalysis() {
    document.getElementById("analysisDetails").hidden = true;
    annotatedSection.hidden = true;
    document.getElementById("classCounts").replaceChildren();
    document.getElementById("vehicleCount").textContent = "--";
    document.getElementById("density").textContent = "Not analysed";
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
        uploadStatus.textContent = "No video selected.";
        return;
    }

    const extension = file.name.split(".").pop().toLowerCase();
    const maxBytes = Number(input.dataset.maxBytes);
    if (!["mp4", "avi", "mov"].includes(extension)) {
        clearPreview();
        uploadStatus.textContent = "Choose an MP4, AVI, or MOV video.";
        input.value = "";
        return;
    }
    if (file.size > maxBytes) {
        clearPreview();
        uploadStatus.textContent = `The selected video exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;
        input.value = "";
        return;
    }

    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(file);
    preview.src = currentVideoUrl;
    preview.style.display = "block";
    uploadStatus.textContent = `Selected: ${file.name}`;
    processingStatus.textContent = "Ready to upload.";
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
    try {
        const body = new FormData();
        body.append("video", file);
        const result = await readJson(await fetch("/api/upload", { method: "POST", body }));
        uploadedFilename = result.filename;
        processButton.disabled = false;
        uploadStatus.textContent = result.message;
        processingStatus.textContent = "Upload complete. Ready for inference.";
    } catch (error) {
        uploadStatus.textContent = "Upload failed.";
        processingError.textContent = error.message;
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
    progress.hidden = false;
    progress.removeAttribute("value");
    processingError.textContent = "";
    processingStatus.textContent = "Processing every video frame with YOLO. This may take a while.";
    try {
        const result = await readJson(await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: uploadedFilename }),
        }));
        document.getElementById("vehicleCount").textContent = result.vehicle_detections;
        document.getElementById("density").textContent = result.density;
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
        const annotatedVideo = document.getElementById("annotatedVideo");
        annotatedVideo.src = result.annotated_video_url;
        annotatedVideo.load();
        annotatedSection.hidden = false;
        document.getElementById("processingProgress").value = 1;
        processingStatus.textContent = `${result.message} ${result.frames_processed} frames processed.`;
    } catch (error) {
        processingStatus.textContent = "Processing failed. No detection results were reported.";
        processingError.textContent = error.message;
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
}

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
    }
});

endEmergency.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/corridor/end", { method: "POST" });
        showCorridorState(await readJson(response));
    } catch (error) {
        emergencyStatus.textContent = error.message;
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

    if (state.error) {
        usbError.textContent = state.error;
    } else if (state.active) {
        usbError.textContent = "";
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
    }

    if (!state.active && state.status !== "connecting") {
        usbFrame.hidden = true;
        usbFrame.removeAttribute("src");
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
    } catch {
        usbStatus.textContent = "Could not read USB camera connection status.";
    }
}

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
    } finally {
        usbFrame.hidden = true;
        usbFrame.removeAttribute("src");
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
    }
});

refreshLiveStatus();
