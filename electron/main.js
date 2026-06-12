const { app, BrowserWindow } = require('electron');
const { fork } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ASSESSMENT_HOST = '127.0.0.1';
const DEFAULT_ASSESSMENT_PORT = 3201;
const ASSIGNMENT_HOST = '0.0.0.0';
const DEFAULT_ASSIGNMENT_ADMIN_PORT = 3002;
const DEFAULT_ASSIGNMENT_TEACHER_PORT = 3003;
const DEFAULT_ASSIGNMENT_STUDENT_PORT = 3004;

app.setName('ai-student-assessment-helper');
app.setPath('userData', path.join(app.getPath('appData'), 'ai-student-assessment-helper'));

let mainWindow = null;
let serverProcess = null;
let assessmentPort = null;
let assignmentAdminPort = null;
let assignmentTeacherPort = null;
let assignmentStudentPort = null;
let activeMode = null;

function getAppRoot() {
  return app.getAppPath();
}

function getAssessmentServerEntry() {
  return path.join(getAppRoot(), 'assessment', 'server', 'dist', 'index.js');
}

function getAssignmentServerEntry() {
  return path.join(getAppRoot(), 'assignment', 'server', 'dist', 'index.js');
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
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolve(true));
    });
  });
}

async function getAssessmentPort() {
  if (process.env.ASSESSMENT_PORT) return Number(process.env.ASSESSMENT_PORT);
  if (await isPortAvailable(DEFAULT_ASSESSMENT_PORT)) return DEFAULT_ASSESSMENT_PORT;
  return getAvailablePort();
}

async function getAssignmentAdminPort() {
  if (process.env.ASSIGNMENT_ADMIN_PORT) return Number(process.env.ASSIGNMENT_ADMIN_PORT);
  if (process.env.ASSIGNMENT_PORT) return Number(process.env.ASSIGNMENT_PORT);
  if (await isPortAvailable(DEFAULT_ASSIGNMENT_ADMIN_PORT)) return DEFAULT_ASSIGNMENT_ADMIN_PORT;
  return getAvailablePort();
}

async function getAssignmentTeacherPort(adminPort) {
  if (process.env.ASSIGNMENT_TEACHER_PORT) return Number(process.env.ASSIGNMENT_TEACHER_PORT);
  const preferred = adminPort === DEFAULT_ASSIGNMENT_ADMIN_PORT
    ? DEFAULT_ASSIGNMENT_TEACHER_PORT
    : Number(adminPort) + 1;
  if (await isPortAvailable(preferred)) return preferred;
  return getAvailablePort();
}

async function getAssignmentStudentPort(teacherPort) {
  if (process.env.ASSIGNMENT_STUDENT_PORT) return Number(process.env.ASSIGNMENT_STUDENT_PORT);
  const preferred = teacherPort === DEFAULT_ASSIGNMENT_TEACHER_PORT
    ? DEFAULT_ASSIGNMENT_STUDENT_PORT
    : Number(teacherPort) + 1;
  if (await isPortAvailable(preferred)) return preferred;
  return getAvailablePort();
}

async function startAssessmentServer() {
  if (serverProcess && activeMode === 'assessment') return Promise.resolve();
  stopServer();

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
    activeMode = null;
  });
  activeMode = 'assessment';

  return waitForServer(`http://${ASSESSMENT_HOST}:${assessmentPort}`);
}

async function startAssignmentServer() {
  if (serverProcess && activeMode === 'assignment') return Promise.resolve();
  stopServer();

  const serverEntry = getAssignmentServerEntry();
  if (!fs.existsSync(serverEntry)) {
    throw new Error('Assignment server build not found. Run npm run assignment:build first.');
  }

  const storageDir = getAppStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });
  assignmentAdminPort = await getAssignmentAdminPort();
  assignmentTeacherPort = await getAssignmentTeacherPort(assignmentAdminPort);
  assignmentStudentPort = await getAssignmentStudentPort(assignmentTeacherPort);

  serverProcess = fork(serverEntry, [], {
    cwd: app.getPath('userData'),
    env: {
      ...process.env,
      HOST: ASSIGNMENT_HOST,
      ADMIN_PORT: String(assignmentAdminPort),
      TEACHER_PORT: String(assignmentTeacherPort),
      STUDENT_PORT: String(assignmentStudentPort),
      APP_STORAGE_DIR: storageDir
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  serverProcess.stdout?.on('data', (chunk) => console.log(`[assignment] ${chunk}`));
  serverProcess.stderr?.on('data', (chunk) => console.error(`[assignment] ${chunk}`));
  serverProcess.on('exit', () => {
    serverProcess = null;
    activeMode = null;
  });
  activeMode = 'assignment';

  return waitForServer(`http://127.0.0.1:${assignmentAdminPort}`);
}

function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill();
  serverProcess = null;
  activeMode = null;
}

function launcherHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Student Assessment Helper</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: #f6f7f9;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px;
  }
  .wrap { width: min(1040px, 100%); }
  h1 {
    margin: 0;
    font-size: 34px;
    letter-spacing: 0;
    color: #111827;
  }
  .lead {
    margin: 12px 0 32px;
    color: #4b5563;
    font-size: 16px;
    line-height: 1.6;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }
  a.card {
    display: block;
    min-height: 260px;
    padding: 28px;
    border: 1px solid #d7dce3;
    border-radius: 8px;
    background: #fff;
    color: inherit;
    text-decoration: none;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  }
  a.card:hover {
    border-color: #2563eb;
    box-shadow: 0 12px 30px rgba(37, 99, 235, 0.16);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: #eef2ff;
    color: #3730a3;
    font-size: 12px;
    font-weight: 700;
  }
  .title {
    margin: 26px 0 12px;
    font-size: 28px;
    font-weight: 800;
  }
  .desc {
    min-height: 76px;
    margin: 0;
    color: #4b5563;
    line-height: 1.65;
  }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 42px;
    margin-top: 28px;
    padding: 0 16px;
    border-radius: 6px;
    background: #2563eb;
    color: #fff;
    font-weight: 700;
  }
  .note {
    margin-top: 20px;
    color: #6b7280;
    font-size: 13px;
  }
  @media (max-width: 760px) {
    main { padding: 24px; }
    .grid { grid-template-columns: 1fr; }
    h1 { font-size: 28px; }
  }
</style>
</head>
<body>
<main>
  <div class="wrap">
    <h1>실행할 앱을 선택하세요</h1>
    <div class="grid">
      <a class="card" href="app://start/assignment">
        <span class="badge">LAN</span>
        <div class="title">평가 실시</div>
        <p class="desc">수행평가 안내문과 자료를 학생에게 보여주고, 학생 제출 파일을 받습니다.</p>
      </a>
      <a class="card" href="app://start/assessment">
        <span class="badge">Local</span>
        <div class="title">평가 관리</div>
        <p class="desc">평가 영역·기준·안내 등을 관리하고, 학생 별 채점 및 세특을 관리합니다.</p>
      </a>
    </div>
  </div>
</main>
</body>
</html>`;
}

async function showLauncher() {
  stopServer();
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(launcherHtml())}`);
}

async function startMode(mode) {
  try {
    if (mode === 'assignment') {
      await startAssignmentServer();
      await mainWindow.loadURL(`http://127.0.0.1:${assignmentAdminPort}`);
      return;
    }
    await startAssessmentServer();
    await mainWindow.loadURL(`http://${ASSESSMENT_HOST}:${assessmentPort}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <h1>앱 실행 실패</h1>
      <p>${message}</p>
      <p><a href="app://launcher">선택 화면으로 돌아가기</a></p>
    `)}`);
  }
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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) return;
    event.preventDefault();
    if (url === 'app://launcher') {
      showLauncher();
      return;
    }
    if (url === 'app://start/assessment') {
      startMode('assessment');
      return;
    }
    if (url === 'app://start/assignment') {
      startMode('assignment');
    }
  });

  if (process.env.APP_MODE === 'assignment') {
    await startMode('assignment');
  } else if (process.env.APP_MODE === 'assessment') {
    await startMode('assessment');
  } else {
    await showLauncher();
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
