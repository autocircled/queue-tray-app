const { app, Menu, Tray, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ipcMain } = require("electron");
const logFile = path.join(__dirname, "app.log");

let tray = null;
let serverProcess = null;

ipcMain.on("save-delay", (event, val) => {
  if (!isNaN(val)) {
    const cfg = loadConfig();
    cfg.delay = val;
    saveConfig(cfg);
    console.log("Saved new delay:", val);
    writeLog("Saved new delay: " + val);
  }
});

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

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "icon.ico"); // optional
  tray = new Tray(iconPath);
  writeLog("System ready.");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Start Server", click: startServer },
    { label: "Stop Server", click: stopServer },
    { label: "Set Delay...", click: setDelay },
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
    height: 300,
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

  serverProcess = spawn(exePath, [cfg.delay], { detached: false });

  serverProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    writeLog(msg);
  });

  serverProcess.stderr.on("data", (data) => {
    const msg = "ERR: " + data.toString().trim();
    writeLog(msg);
  });

  serverProcess.on("exit", () => {
    writeLog("Server stopped");
    serverProcess = null;
  });

  console.log("Server started with delay:", cfg.delay);
  writeLog(`Server started with delay: ${cfg.delay}`);
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    console.log("Server stopped!");
    writeLog("Server stopped!");
  }
}

function writeLog(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  console.log(message); // still show in console if open
}

app.on("window-all-closed", (e) => e.preventDefault()); // keep tray running
