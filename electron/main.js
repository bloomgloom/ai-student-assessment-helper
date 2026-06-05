const { app, BrowserWindow } = require('electron');
const { fork } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ASSESSMENT_HOST = '127.0.0.1';
const DEFAULT_ASSESSMENT_PORT = 3201;

app.setName('ai-student-assessment-helper');
app.setPath('userData', path.join(app.getPath('appData'), 'ai-student-assessment-helper'));

let mainWindow = null;
let serverProcess = null;
let assessmentPort = null;

function getAppRoot() {
  return app.getAppPath();
}

function getAssessmentServerEntry() {
  return path.join(getAppRoot(), 'assessment', 'server', 'dist', 'index.js');
}

function getAppStorageDir() {
  return path.join(app.getPath('userData'), 'storage');
}

function getBundledPythonPath() {
  const platformPath = process.platform === 'win32'
    ? path.join('Scripts', 'python.exe')
    : path.join('bin', 'python3');
  const relativePath = path.join('assessment', 'python', '.venv', platformPath);
  const candidates = [
    path.join(getAppRoot(), relativePath),
    path.join(process.resourcesPath, 'app.asar.unpacked', relativePath)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      fetch(url)
        .then(() => resolve())
        .catch((error) => {
          if (Date.now() - startedAt > timeoutMs) {
            reject(error);
            return;
          }
          setTimeout(check, 300);
        });
    };

    check();
  });
}

function getAvailablePort() {
  if (process.env.ASSESSMENT_PORT) return Promise.resolve(Number(process.env.ASSESSMENT_PORT));

  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, ASSESSMENT_HOST, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 3001;
      probe.close(() => resolve(port));
    });
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, ASSESSMENT_HOST, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function getAssessmentPort() {
  if (process.env.ASSESSMENT_PORT) return Number(process.env.ASSESSMENT_PORT);
  if (await isPortAvailable(DEFAULT_ASSESSMENT_PORT)) return DEFAULT_ASSESSMENT_PORT;
  return getAvailablePort();
}

async function startAssessmentServer() {
  if (serverProcess) return Promise.resolve();

  const serverEntry = getAssessmentServerEntry();
  if (!fs.existsSync(serverEntry)) {
    throw new Error('Assessment server build not found. Run npm run assessment:build first.');
  }

  const storageDir = getAppStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });
  assessmentPort = await getAssessmentPort();
  const bundledPythonPath = getBundledPythonPath();

  serverProcess = fork(serverEntry, [], {
    cwd: app.getPath('userData'),
    env: {
      ...process.env,
      HOST: ASSESSMENT_HOST,
      PORT: String(assessmentPort),
      APP_STORAGE_DIR: storageDir,
      ...(bundledPythonPath ? { ASSESSMENT_PYTHON: bundledPythonPath } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  serverProcess.stdout?.on('data', (chunk) => console.log(`[assessment] ${chunk}`));
  serverProcess.stderr?.on('data', (chunk) => console.error(`[assessment] ${chunk}`));
  serverProcess.on('exit', () => {
    serverProcess = null;
  });

  return waitForServer(`http://${ASSESSMENT_HOST}:${assessmentPort}`);
}

function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill();
  serverProcess = null;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: 'AI Student Assessment Helper',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await startAssessmentServer();
    await mainWindow.loadURL(`http://${ASSESSMENT_HOST}:${assessmentPort}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <h1>Assessment server failed to start</h1>
      <p>${message}</p>
    `)}`);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopServer);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
