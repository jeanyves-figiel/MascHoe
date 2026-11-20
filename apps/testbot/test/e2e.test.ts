// End to end (testing.md › Chat test bot): the built bot and a second client (the app's MLS code)
// talk through a mock delivery service. Checks E2EE join, receipts, replies and language switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from './mockServer.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const KEY = 'k'.repeat(32);

test('bot joins, sends Delivered + Read, replies in German, then Portuguese', { timeout: 90_000 }, async () => {
  if (!fs.existsSync(path.join(root, 'dist/peer.mjs'))) execFileSync('node', ['build.mjs'], { cwd: root });
  const srv = await start(KEY);
  const botDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
  const peerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-'));
  const bot = spawn('node', ['dist/bot.mjs'], { cwd: root, env: { ...process.env, API_URL: srv.url, TESTBOT_KEY: KEY, BOT_DATA_DIR: botDir, BOT_POLL_MS: '300' } });
  let botLog = '';
  bot.stdout.on('data', (d) => (botLog += d));
  bot.stderr.on('data', (d) => (botLog += d));
  try {
    // wait for the bot's key packages
    for (let i = 0; i < 100 && !botLog.includes('test bot up'); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(botLog, /test bot up/);
    // async: the mock server runs in this process, so a sync child would block it
    const peer = spawn('node', [path.join(root, 'dist/peer.mjs')], {
      env: { ...process.env, API_URL: srv.url, BOT_PROFILE: 'BOT', BOT_DATA_DIR: peerDir, TEXTS: 'hallo|lang pt|quick', WAIT_MS: '15000' },
    });
    let out = '';
    peer.stdout.on('data', (d) => (out += d));
    await new Promise((r) => peer.on('exit', r));
    const lines = out.trim().split('\n').map((l) => JSON.parse(l));
    const texts = lines.filter((l) => l.got === 'text').map((l) => l.text as string);
    assert.ok(lines.some((l) => l.got === 'delivered'), 'Delivered receipt');
    assert.ok(lines.some((l) => l.got === 'read'), 'Read receipt');
    assert.equal(texts.length, 2, out);
    assert.match(texts[0], /Hey!|Schön|Altstetten|Klingt|Lust|Testbot|Wetter/);
    assert.match(texts[1], /Oi!|você/);
    assert.ok(lines.some((l) => l.got === 'quick_reply' && Number.isInteger(l.k)), 'quick reply with k');
  } finally {
    bot.kill();
    srv.close();
  }
});
