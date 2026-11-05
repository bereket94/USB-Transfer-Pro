import { useEffect, useState } from "react";
import "./transfer.css";

const API = "http://127.0.0.1:3001/api";

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();
  return { ok: response.ok, data };
}

async function loadStatus(setJob) {
  try {
    const response = await fetch(`${API}/transfer`);
    setJob(await response.json());
  } catch {
    /* helper offline: ignore */
  }
}

function TransferPage({ usbDevices, helperOnline }) {
  const [mode, setMode] = useState("send");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [job, setJob] = useState(null);
  const [message, setMessage] = useState("");

  const usbRoot = usbDevices.length > 0 ? usbDevices[0].letter + "\\" : "";
  const running = job?.state === "running";

  // Auto-fill the USB side: SEND -> destination, RECEIVE -> source
  useEffect(() => {
    if (mode === "send") setDestination(usbRoot);
    else setSource(usbRoot);
  }, [mode, usbRoot]);

  // If the page is opened while a transfer is running, pick it back up
  useEffect(() => {
    loadStatus(setJob);
  }, []);

  // Poll progress while copying
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => loadStatus(setJob), 500);
    return () => clearInterval(timer);
  }, [running]);

  function changeMode(newMode) {
    if (newMode === mode || running) return;
    // Keep the PC folder, swap which side it is on
    const pcFolder = mode === "send" ? source : destination;
    setMode(newMode);
    if (newMode === "send") {
      setSource(pcFolder);
      setDestination(usbRoot);
    } else {
      setSource(usbRoot);
      setDestination(pcFolder);
    }
  }

  async function browse(setter) {
    setMessage("");
    try {
      const { data } = await postJSON(`${API}/browse`);
      if (data.path) setter(data.path);
    } catch {
      setMessage("Could not open the folder picker. Is the USB helper running?");
    }
  }

  async function startTransfer() {
    setMessage("");

    const confirmed = window.confirm(
      `Start copying?\n\nFrom: ${source}\nTo: ${destination}`
    );
    if (!confirmed) return;

    try {
      const { ok, data } = await postJSON(`${API}/transfer`, {
        src: source.trim(),
        dst: destination.trim(),
      });

      if (!ok) {
        setMessage(data.error || "Could not start the transfer.");
        return;
      }

      setJob({ state: "running", total: 0, processed: 0, current: "", log: [] });
    } catch {
      setMessage("USB helper is not running. Start it with: node usb-server/server.js");
    }
  }

  async function cancelTransfer() {
    try {
      await postJSON(`${API}/transfer/cancel`);
      loadStatus(setJob);
    } catch {
      /* ignore */
    }
  }

  // Progress + status text
  let percent = 0;
  if (job?.state === "done") percent = 100;
  else if (job?.total > 0) {
    percent = Math.min(99, Math.round((job.processed / job.total) * 100));
  }

  let statusText = "Ready to transfer files.";
  let statusIsError = false;

  if (!helperOnline) {
    statusText = "USB helper is not running. Start it with: node usb-server/server.js";
    statusIsError = true;
  } else if (message) {
    statusText = message;
    statusIsError = true;
  } else if (job?.state === "running") {
    statusText = `Copying... ${job.processed} of ${job.total} files`;
  } else if (job?.state === "done") {
    statusText = `Transfer completed successfully. Robocopy code: ${job.exitCode}`;
  } else if (job?.state === "error") {
    statusText = `Transfer error. Robocopy code: ${job.exitCode ?? "n/a"}`;
    statusIsError = true;
  } else if (job?.state === "cancelled") {
    statusText = "Transfer cancelled.";
  }

  return (
    <div className="panel transfer-panel">
      <h1>USB FILE TRANSFER</h1>

      <div className="mode-options">
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === "send"}
            disabled={running}
            onChange={() => changeMode("send")}
          />
          SEND (PC to USB)
        </label>

        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === "receive"}
            disabled={running}
            onChange={() => changeMode("receive")}
          />
          RECEIVE (USB to PC)
        </label>
      </div>

      <div className="path-field">
        <label>SOURCE FOLDER</label>
        <div className="path-row">
          <input
            className="path-input"
            value={source}
            disabled={running}
            placeholder={mode === "receive" ? "Plug in a USB drive..." : "Choose a folder on your PC"}
            onChange={(e) => setSource(e.target.value)}
          />
          <button
            className="browse-button"
            disabled={running || !helperOnline}
            onClick={() => browse(setSource)}
          >
            Browse...
          </button>
        </div>
      </div>

      <div className="path-field">
        <label>DESTINATION FOLDER</label>
        <div className="path-row">
          <input
            className="path-input"
            value={destination}
            disabled={running}
            placeholder={mode === "send" ? "Plug in a USB drive..." : "Choose a folder on your PC"}
            onChange={(e) => setDestination(e.target.value)}
          />
          <button
            className="browse-button"
            disabled={running || !helperOnline}
            onClick={() => browse(setDestination)}
          >
            Browse...
          </button>
        </div>
      </div>

      <div className={`transfer-status ${statusIsError ? "error" : ""}`}>
        {statusText}
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>

      {running && job.current && (
        <div className="transfer-current">{job.current}</div>
      )}

      <div className="transfer-actions">
        <button
          className="primary-button"
          disabled={running || !helperOnline}
          onClick={startTransfer}
        >
          START TRANSFER
        </button>

        {running && (
          <button className="secondary-button" onClick={cancelTransfer}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default TransferPage;