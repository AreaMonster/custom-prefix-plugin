'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const logger = require('./logger');
const sessionsRouter = require('./routes/sessions');
const prefixRouter = require('./routes/prefix');
const adminRouter = require('./routes/admin');

const app = express();

// Player history and the audit log persist to disk here — verify it's
// actually writable at startup rather than only finding out lazily (and
// silently) the first time someone saves a prefix. This is what would
// have caught the "container runs as a non-root user but a bind-mounted
// ./data got auto-created owned by root" permissions gotcha immediately
// instead of it quietly discarding data on every restart.
function checkDataDirWritable() {
  const dataDir = path.join(__dirname, '..', 'data');
  const probeFile = path.join(dataDir, '.write-test');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(probeFile, 'ok');
    fs.unlinkSync(probeFile);
    logger.info(`data directory is writable (${dataDir}) — history/audit log will persist across restarts.`);
  } catch (err) {
    logger.error('=================================================================');
    logger.error(`CANNOT WRITE TO ${dataDir} — player history and the audit log will`);
    logger.error('NOT persist and will be lost on every restart. Error: ' + err.message);
    logger.error('If running in Docker: check that ./data on the HOST is writable by');
    logger.error('whichever user the container runs as (e.g. `chmod 777 website/data`');
    logger.error('or delete the folder and let the container recreate it).');
    logger.error('=================================================================');
  }
}
checkDataDirWritable();

// Behind a reverse proxy (nginx/Caddy) so req.ip reflects the real client
// for the rate limiter, and so express knows it's on HTTPS.
app.set('trust proxy', 1);

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use('/api/sessions', sessionsRouter);
app.use('/api/prefix', prefixRouter);
app.use('/api/admin', adminRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Player-facing link: /p/:token loads the same static builder page, which
// reads the token out of the URL client-side.
app.get('/p/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('unhandled error', err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(config.port, () => {
  logger.info(`custom-prefix backend listening on port ${config.port}`);
  logger.info(`public base URL: ${config.publicBaseUrl}`);
});
