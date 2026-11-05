// USB Transfer Pro helper (Windows)
// Run with:  node usb-server/server.js
// No npm packages needed.
//
// Endpoints
//   GET  /api/usb              list plugged-in removable drives
//   POST /api/browse           open the Windows folder picker, returns { path }
//   POST /api/transfer         start a robocopy transfer  { src, dst }
//   GET  /api/transfer         current transfer status + progress
//   POST /api/transfer/cancel  stop the running transfer

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");

const PORT = 3001;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/* ---------------------------------------------------------------- USB */

// DriveType 2 = removable disk (USB flash drives, SD cards)
const USB_SCRIPT =
  "Get-CimInstance Win32_LogicalDisk | " +
  "Where-Object { $_.DriveType -eq 2 } | " +
  "Select-Object DeviceID,VolumeName,Size,FreeSpace,FileSystem | " +
  "ConvertTo-Json -Compress";

function listUsbDrives() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", USB_SCRIPT],
      { windowsHide: true, timeout: 8000 },
      (error, stdout) => {
        if (error) return resolve([]);

        const text = stdout.trim();
        if (!text) return resolve([]); // nothing plugged in

        try {
          const data = JSON.parse(text);
          // PowerShell returns an object for one drive, an array for many
          const drives = Array.isArray(data) ? data : [data];
          resolve(
            drives.map((d) => ({
              letter: d.DeviceID,
              name: d.VolumeName || "USB Drive",
              size: d.Size || 0,
              free: d.FreeSpace || 0,
              fileSystem: d.FileSystem || "",
            }))
          );
        } catch {
          resolve([]);
        }
      }
    );
  });
}

/* ------------------------------------------------------ Folder picker */

// Same FolderBrowserDialog your Transfer.ps1 uses
const PICKER_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog($owner) -eq 'OK') { Write-Output $dialog.SelectedPath }
`;

function pickFolder() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", PICKER_SCRIPT],
      (error, stdout) => resolve(error ? null : stdout.trim() || null)
    );
  });
}

/* ----------------------------------------------------------- Transfer */

function newJob() {
  return {
    state: "idle", // idle | running | done | error | cancelled
    src: "",
    dst: "",
    total: 0, // files found in the source folder
    processed: 0, // files robocopy has handled so far
    current: "",
    exitCode: null,
    log: [],
  };
}

let job = newJob();
let child = null;

function countFiles(dir) {
  let count = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
      else count++;
    }
  }
  return count;
}

// Same checks as Transfer.ps1
function validate(src, dst) {
  if (typeof src !== "string" || !src || !fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    return "Please select a valid source folder.";
  }
  if (typeof dst !== "string" || !dst.trim()) {
    return "Please select a destination folder.";
  }
  const s = path.resolve(src).replace(/\\+$/, "").toLowerCase();
  const d = path.resolve(dst).replace(/\\+$/, "").toLowerCase();
  if (s === d) return "Source and destination cannot be the same.";
  if (d.startsWith(s + "\\")) return "Destination cannot be inside the source folder.";
  return null;
}

// A path ending in "\" (like E:\) breaks robocopy's argument parsing
function robocopyPath(p) {
  return p.endsWith("\\") ? p + "." : p;
}

const FILE_LINE = /^([A-Za-z]:\\|\\\\)/; // robocopy prints each file as a full path

function startTransfer(src, dst) {
  fs.mkdirSync(dst, { recursive: true });

  job = { ...newJob(), state: "running", src, dst, total: countFiles(src) };

  const args = [
    robocopyPath(src),
    robocopyPath(dst),
    "/E", // include subfolders (same as your script)
    "/MT:16", // 16 threads
    "/R:1",
    "/W:1",
    "/NP", // no per-file percentage
    "/NDL", // no directory lines
    "/NJH",
    "/NJS", // no header / summary
    "/NC",
    "/NS", // no class / size columns
    "/FP", // full path, so each file is one clean line
  ];

  child = spawn("robocopy", args, { windowsHide: true });

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      job.log.push(line);
      if (job.log.length > 200) job.log.shift();

      if (FILE_LINE.test(line)) {
        job.processed++;
        job.current = line;
      }
    }
  });

  child.on("error", (error) => {
    job.state = "error";
    job.log.push("Could not start robocopy: " + error.message);
    child = null;
  });

  child.on("close", (code) => {
    job.exitCode = code;
    if (job.state === "running") {
      // robocopy codes below 8 mean success (same rule as your script)
      job.state = code !== null && code < 8 ? "done" : "error";
    }
    child = null;
  });
}

function cancelTransfer() {
  if (child && job.state === "running") {
    job.state = "cancelled";
    execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], () => {});
  }
}

/* -------------------------------------------------------------- Server */

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  // Only the local React app may call this helper
  const origin = req.headers.origin || "";
  const allowed = LOCAL_ORIGIN.test(origin);

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(allowed ? 204 : 403);
    return res.end();
  }

  if (req.method === "POST" && !allowed) {
    return send(res, 403, { error: "Forbidden" });
  }

  if (req.method === "GET" && req.url === "/api/usb") {
    return send(res, 200, { devices: await listUsbDrives() });
  }

  if (req.method === "POST" && req.url === "/api/browse") {
    return send(res, 200, { path: await pickFolder() });
  }

  if (req.method === "GET" && req.url === "/api/transfer") {
    return send(res, 200, { ...job, log: job.log.slice(-30) });
  }

  if (req.method === "POST" && req.url === "/api/transfer") {
    if (job.state === "running") {
      return send(res, 409, { error: "A transfer is already running." });
    }
    const { src, dst } = await readBody(req);
    const problem = validate(src, dst);
    if (problem) return send(res, 400, { error: problem });

    startTransfer(src, dst);
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url === "/api/transfer/cancel") {
    cancelTransfer();
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "Not found" });
});

// 127.0.0.1 = only this computer can reach it
server.listen(PORT, "127.0.0.1", () => {
  console.log(`USB helper running on http://127.0.0.1:${PORT}`);
});