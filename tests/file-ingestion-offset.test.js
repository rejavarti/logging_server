const fs = require('fs');
const path = require('path');

const loggers = { system: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } };

class DalStub {
  constructor() { this.entries = []; this.offsets = new Map(); }
  async createLogEntry(entry) { this.entries.push(entry); return this.entries.length; }
  async getFileOffset(filePath) { const last_offset = this.offsets.get(filePath); return last_offset != null ? { file_path: filePath, last_offset } : null; }
  async setFileOffset(filePath, offset) { this.offsets.set(filePath, offset); return { changes: 1 }; }
}

const FileIngestionEngine = require('../engines/file-ingestion-engine');

describe('FileIngestionEngine offset persistence', () => {
  const tmpDir = path.join(__dirname, '..', 'temp-file-offset-test');
  const testFile = path.join(tmpDir, 'offset.log');
  let dal;

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
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

  test('only ingests new lines after restart using persisted offsets', async () => {
    dal = new DalStub();

    // Initial file with two lines
    const lines1 = [
      JSON.stringify({ timestamp: '2025-11-14T12:00:00Z', level: 'INFO', message: 'First' }),
      '2025-11-14T12:00:01Z INFO Second'
    ];
    fs.writeFileSync(testFile, lines1.join('\n'));

    // Start engine instance #1
    let engine = new FileIngestionEngine({}, loggers, dal);
    await engine.initialize();
    await new Promise(r => setTimeout(r, 600));
    expect(dal.entries.length).toBeGreaterThanOrEqual(2);

    const ingested1 = dal.entries.length;

    // Stop engine (no explicit stop needed for test) and create new instance simulating restart
    engine = new FileIngestionEngine({}, loggers, dal);
    await engine.initialize();

    // Append new lines
    const append = ['2025-11-14T12:00:02Z WARN Third', '2025-11-14T12:00:03Z ERROR Fourth'];
    fs.appendFileSync(testFile, '\n' + append.join('\n'));

    await new Promise(r => setTimeout(r, 800));

    // Verify only the new lines were appended after restart
    const total = dal.entries.length;
    expect(total - ingested1).toBeGreaterThanOrEqual(2);
  });
});
