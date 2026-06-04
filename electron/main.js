const { app, BrowserWindow } = require('electron');
const { fork } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ASSESSMENT_HOST = '127.0.0.1';

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

async function startAssessmentServer() {
  if (serverProcess) return Promise.resolve();

  const serverEntry = getAssessmentServerEntry();
  if (!fs.existsSync(serverEntry)) {
    throw new Error('Assessment server build not found. Run npm run assessment:build first.');
  }

  const storageDir = getAppStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });
  assessmentPort = await getAvailablePort();

  serverProcess = fork(serverEntry, [], {
    cwd: app.getPath('userData'),
    env: {
      ...process.env,
      HOST: ASSESSMENT_HOST,
      PORT: String(assessmentPort),
      APP_STORAGE_DIR: storageDir
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
