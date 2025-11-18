const fs = require('fs');
const path = require('path');

// Lightweight mock loggers
const loggers = {
  system: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
};

// Minimal DAL stub capturing inserted entries
class DalStub {
  constructor() { this.entries = []; }
  async createLogEntry(entry) { this.entries.push(entry); return this.entries.length; }
}

const FileIngestionEngine = require('../engines/file-ingestion-engine');

describe('FileIngestionEngine', () => {
  const tmpDir = path.join(__dirname, '..', 'temp-file-ingestion-test');
  const testLogFile = path.join(tmpDir, 'test.log');
  let dal;

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    // Prepare a file with both JSON and regex lines BEFORE initialization so chokidar emits 'add'
    const lines = [
      JSON.stringify({ timestamp: '2025-11-14T12:00:00Z', level: 'INFO', message: 'Startup complete' }),
      '2025-11-14T12:00:01Z WARN Something happened'
    ];
    fs.writeFileSync(testLogFile, lines.join('\n'));
    process.env.FILE_INGESTION_ENABLED = 'true';
    process.env.FILE_INGESTION_DIRECTORY = tmpDir;
    process.env.FILE_INGESTION_FILE_PATTERN = '**/*.log';
    process.env.FILE_INGESTION_MODE = 'auto';
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    delete process.env.FILE_INGESTION_ENABLED;
    delete process.env.FILE_INGESTION_DIRECTORY;
    delete process.env.FILE_INGESTION_FILE_PATTERN;
    delete process.env.FILE_INGESTION_MODE;
  });

  test('ingests real lines from watched file without fabrication', async () => {
    dal = new DalStub();
    const engine = new FileIngestionEngine({}, loggers, dal);
    const initResult = await engine.initialize();
    expect(initResult).toBe(true);

    // Wait for watcher to pick up initial file
    await new Promise(r => setTimeout(r, 800));

    // Ensure both lines ingested (JSON + regex)
    expect(dal.entries.length).toBeGreaterThanOrEqual(2);
    const messages = dal.entries.map(e => e.message);
    expect(messages).toContain('Startup complete');
    expect(messages.some(m => m.includes('Something happened'))).toBe(true);

    // Assert no placeholder/fabricated messages
    expect(messages.some(m => /placeholder|mock/i.test(m))).toBe(false);
  });
});
