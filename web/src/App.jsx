import { useEffect, useState } from "react";
import "./App.css";
import TransferPage from "./TransferPage";

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "transfers", label: "Transfers", icon: "⇄" },
  { id: "history", label: "History", icon: "◷" },
  { id: "devices", label: "Devices", icon: "▣" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "about", label: "About", icon: "ⓘ" },
];

const USB_API = "http://127.0.0.1:3001/api/usb";

function formatSize(bytes) {
  if (!bytes) return "0 GB";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? gb.toFixed(1) + " GB" : (bytes / 1024 ** 2).toFixed(0) + " MB";
}

function App() {
  const [activePage, setActivePage] = useState("dashboard");

  // Auto-detected USB drives
  const [usbDevices, setUsbDevices] = useState([]);
  const [helperOnline, setHelperOnline] = useState(true);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("usb-transfer-theme") || "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("usb-transfer-theme", theme);
  }, [theme]);

  const currentPage = menuItems.find((item) => item.id === activePage);

  function toggleTheme() {
    setTheme((previous) => (previous === "dark" ? "light" : "dark"));
  }

  // Check for USB drives when the app opens, then every 2 seconds
  useEffect(() => {
    let cancelled = false;

    async function checkUSB() {
      try {
        const response = await fetch(USB_API);
        const data = await response.json();
        if (!cancelled) {
          setUsbDevices(data.devices || []);
          setHelperOnline(true);
        }
      } catch {
        if (!cancelled) {
          setUsbDevices([]);
          setHelperOnline(false);
        }
      }
    }

    checkUSB();
    const timer = setInterval(checkUSB, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function renderPage() {
    switch (activePage) {
      case "dashboard":
        return (
          <>
            <div className="welcome-section">
              <span className="eyebrow">YOUR FILE MANAGEMENT CENTER</span>
              <h1>Welcome to USB Transfer Pro</h1>
              <p>
                Manage your USB devices and transfer files between storage
                devices and your computer.
              </p>
            </div>

            <div className="dashboard-grid">
              <div className="panel">
                <div className="panel-icon">▣</div>
                <h3>USB Devices</h3>
                <h2>
                  {usbDevices.length > 0
                    ? `${usbDevices[0].name} (${usbDevices[0].letter})`
                    : "Not connected"}
                </h2>
                <p>
                  {usbDevices.length > 0
                    ? `${formatSize(usbDevices[0].free)} free of ${formatSize(usbDevices[0].size)}`
                    : "Plug in a USB device and it will appear here."}
                </p>
              </div>

              <div className="panel">
                <div className="panel-icon">⇄</div>
                <h3>Recent Transfers</h3>
                <h2>0</h2>
                <p>Your transfer activities will appear here.</p>
              </div>
            </div>

            <div className="panel introduction">
              <h2>What can you do with USB Transfer Pro?</h2>
              <p>
                USB Transfer Pro helps you identify USB drives, browse
                storage, transfer files, monitor progress, and review your
                transfer history.
              </p>

              <button
                className="primary-button"
                onClick={() => setActivePage("transfers")}
              >
                Start a Transfer →
              </button>
            </div>
          </>
        );

      case "transfers":
        return (
          <TransferPage usbDevices={usbDevices} helperOnline={helperOnline} />
        );

      case "history":
        return (
          <div className="panel">
            <h1>Transfer History</h1>
            <p>
              Review completed, failed, and cancelled transfer operations.
            </p>
            <p>No transfer history available yet.</p>
          </div>
        );

      case "devices":
        return (
          <div className="devices-page">
            <div className="panel">
              <h1>Connected Devices</h1>

              {!helperOnline && (
                <p className="error-message">
                  USB helper is not running. Start it with: node usb-server/server.js
                </p>
              )}

              {helperOnline && usbDevices.length === 0 && (
                <p>No USB device detected. Plug one in and it will appear automatically.</p>
              )}

              {usbDevices.map((device) => (
                <div className="setting-item" key={device.letter}>
                  <div>
                    <h3>
                      ▣ {device.name} ({device.letter})
                    </h3>
                    <p>
                      {device.fileSystem} · {formatSize(device.free)} free of{" "}
                      {formatSize(device.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "settings":
        return (
          <div className="panel settings-panel">
            <h1>Application Settings</h1>
            <p>Personalize your USB Transfer Pro experience.</p>

            <div className="setting-item">
              <div>
                <h3>Appearance</h3>
                <p>Choose your preferred application theme.</p>
              </div>

              <div className="theme-options">
                <button
                  className={`theme-option ${
                    theme === "light" ? "selected" : ""
                  }`}
                  onClick={() => setTheme("light")}
                >
                  ☀ Light
                </button>

                <button
                  className={`theme-option ${
                    theme === "dark" ? "selected" : ""
                  }`}
                  onClick={() => setTheme("dark")}
                >
                  ☾ Dark
                </button>
              </div>
            </div>

            <div className="setting-item">
              <div>
                <h3>Application Version</h3>
                <p>USB Transfer Pro version 1.0.0</p>
              </div>
            </div>

            <div className="setting-item">
              <div>
                <h3>Developer</h3>
                <p>Bereket Asfaw | Ethiopia</p>
              </div>
            </div>
          </div>
        );

      case "about":
        return (
          <div className="panel about-panel">
            <div className="about-logo">U</div>
            <h1>USB Transfer Pro</h1>
            <span className="about-version">VERSION 1.0.0</span>

            <p className="about-description">
              USB Transfer Pro is a modern file transfer application designed
              to make transferring files between USB storage devices and
              computers simple, organized, and reliable.
            </p>

            <h3>Our Purpose</h3>
            <p>
              The application aims to simplify USB device management, improve
              the file transfer experience, and provide clear monitoring of
              transfer activities.
            </p>

            <h3>Key Capabilities</h3>
            <ul>
              <li>USB device detection and information</li>
              <li>File and folder browsing</li>
              <li>Send and receive file transfers</li>
              <li>Transfer progress and monitoring</li>
              <li>Transfer history and activity records</li>
              <li>Light and dark appearance themes</li>
            </ul>

            <div className="developer-card">
              <span>DEVELOPED BY</span>
              <h2>Bereket Asfaw</h2>
              <p>Ethiopia 🇪🇹</p>
            </div>
          </div>
        );

      default:
        return <h1>Page not found</h1>;
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">U</div>
          <div>
            <h2>USB TRANSFER</h2>
            <span>PRO EDITION</span>
          </div>
        </div>

        <p className="menu-heading">MAIN MENU</p>

        <nav className="menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`menu-item ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => setActivePage(item.id)}
            >
              <span className="menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>USB Transfer Pro</span>
          <small>Developed by Bereket Asfaw</small>
          <small>Version 1.0.0</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Main Menu / </span>
            <strong>{currentPage?.label}</strong>
          </div>

          <div className="topbar-actions">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title="Change application theme"
            >
              {theme === "dark" ? "☀ Light Mode" : "☾ Dark Mode"}
            </button>

            <div className="status">
              <span className="status-dot"></span>
              {usbDevices.length > 0 ? "USB Connected" : "Ready"}
            </div>
          </div>
        </header>

        <section className="page-content">{renderPage()}</section>
      </main>
    </div>
  );
}

export default App;