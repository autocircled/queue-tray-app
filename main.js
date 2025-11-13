const { app, Menu, Tray, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ipcMain } = require("electron");
const logFile = path.join(__dirname, "app.log");

let tray = null;
let serverProcess = null;
let logs = []; // Store logs in memory
const MAX_LOGS = 1000; // Maximum number of logs to keep in memory
let logsWindow = null;

ipcMain.on("save-delay", (event, val) => {
  if (!isNaN(val)) {
    const cfg = loadConfig();
    cfg.delay = val;
    saveConfig(cfg);
    console.log("Saved new delay:", val);
    writeLog("Saved new delay: " + val);
  }
});

ipcMain.on("get-initial-logs", (event) => {
  event.sender.send("initial-logs", logs);
  writeLog("Initial logs sent to window");
});

ipcMain.on("clear-logs", () => {
  logs = [];
  sendLogsToWindow("Logs cleared.");
  writeLog("Logs cleared.");
});

function sendLogsToWindow(msg) {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.webContents.send("new-log", msg);
    writeLog(msg);
  }
  // Keep only the most recent logs to prevent memory leaks
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(logs.length - MAX_LOGS);
  }
}

const configPath = path.join(__dirname, "config.json");

function loadConfig() {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  return { delay: 2000 };
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

logs = [
  "Initializing system...",
  "Server executable path loaded.",
  "Waiting for start command...",
  "System ready."
];

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "icon.ico"); // optional
  tray = new Tray(iconPath);
  writeLog("System ready.");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Start Server", click: startServer },
    { label: "Stop Server", click: stopServer },
    { label: "Set Delay...", click: setDelay },
    { label: "View Logs", click: showLogsWindow },
    { type: "separator" },
    { label: "Exit", click: () => { stopServer(); app.quit(); } },
  ]);

  tray.setToolTip("API Queue Server");
  tray.setContextMenu(contextMenu);
});

function setDelay() {
  const cfg = loadConfig();
  const win = new BrowserWindow({
    width: 300,
    height: 150,
    resizable: false,
    title: "Set Delay",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadURL(
    `data:text/html;charset=utf-8,
     <body style="font-family:sans-serif;text-align:center;margin-top:30px;">
       <h3>Set API Delay</h3>
       <input id="delay" type="number" value="${cfg.delay}" style="width:80px;"> ms
       <br><br>
       <button onclick="save()">Save</button>
       <script>
         const { ipcRenderer } = require('electron');
         function save() {
           const val = document.getElementById('delay').value;
           ipcRenderer.send('save-delay', parseInt(val));
           window.close();
         }
       </script>
     </body>`
  );
}

function startServer() {
  if (serverProcess) return;
  const cfg = loadConfig();

  const exePath = path.join(__dirname, "api-queue-server.exe");

  logs = []; // clear previous logs

  serverProcess = spawn(exePath, [cfg.delay], { detached: false });

  serverProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    logs.push(msg);
    sendLogsToWindow(msg);
    writeLog(msg);
  });

  serverProcess.stderr.on("data", (data) => {
    const msg = "ERR: " + data.toString().trim();
    logs.push(msg);
    sendLogsToWindow(msg);
    writeLog(msg);
  });

  serverProcess.on("exit", () => {
    logs.push("Server stopped");
    sendLogsToWindow("Server stopped");
    writeLog("Server stopped");
    serverProcess = null;
  });

  console.log("Server started with delay:", cfg.delay);
  sendLogsToWindow(`Server started with delay: ${cfg.delay}`);
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    console.log("Server stopped!");
    writeLog("Server stopped!");
  }
}

function showLogsWindow() {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus();
    return;
  }

  logsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: "API Queue Server Logs",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  
  // Clear logs when window is closed
  logsWindow.on('closed', () => {
    logsWindow = null;
  });

  logsWindow.loadURL(
    `data:text/html;charset=utf-8,
      <html>
        <body style="font-family:monospace; background:#111; color:#0f0; padding:10px;">
          <h3 style="color:white;">Server Logs</h3>
          <div id="logBox" style="height:520px; overflow-y:auto; border:1px solid #333; padding:5px; background:#000; white-space: pre-wrap; word-wrap: break-word;"></div>
          <div style="margin-top: 5px;">
            <button onclick="clearLogs()" style="padding: 3px 8px;">Clear Logs</button>
          </div>
          <script>
            const { ipcRenderer } = require('electron');
            const box = document.getElementById('logBox');
            ipcRenderer.on('new-log', (_, msg) => {
              const div = document.createElement('div');
              div.textContent = msg;
              box.appendChild(div);
              box.scrollTop = box.scrollHeight;
            });
            ipcRenderer.send('get-initial-logs');
            ipcRenderer.on('initial-logs', (_, all) => {
              box.innerHTML = '';
              all.forEach(l => {
                const div = document.createElement('div');
                div.textContent = l;
                box.appendChild(div);
              });
              box.scrollTop = box.scrollHeight;
            });
            
            function clearLogs() {
              box.innerHTML = '';
              ipcRenderer.send('clear-logs');
            }
          </script>
        </body>
      </html>`
  );
}

function writeLog(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  console.log(message); // still show in console if open
}

app.on("window-all-closed", (e) => e.preventDefault()); // keep tray running
