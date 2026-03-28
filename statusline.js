#!/usr/bin/env node
// Claude Code Statusline - nv edition
// Based on gsd-statusline.js (GSD v1.30.0) with rate limit enhancements.
//
// Additions over the original:
//   - 5-hour AND 7-day rate limits are displayed side by side
//   - Rate limit bar uses distinct color thresholds

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Constants ────────────────────────────────────────────────────────────────
// Claude Code reserves ~16.5% of the context window as an autocompact buffer.
// We normalise the displayed usage so that 100% == the usable limit.
const AUTO_COMPACT_BUFFER_PCT = 16.5;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a 10-segment progress bar for rate limit indicators.
 * @param {number} usedPct  0-100
 * @returns {string}
 */
function rateLimitBar(usedPct) {
  const SEGMENTS = 10;
  const filled = Math.min(SEGMENTS, Math.round((usedPct / 100) * SEGMENTS));
  return '█'.repeat(filled) + '░'.repeat(SEGMENTS - filled);
}

/**
 * ANSI-colour a rate limit percentage string.
 * <50% → green, <75% → yellow, <90% → orange, ≥90% → blinking red
 * @param {number} usedPct
 * @param {string} text
 * @returns {string}
 */
function colorRateLimit(usedPct, text) {
  if (usedPct < 50)  return `\x1b[32m${text}\x1b[0m`;
  if (usedPct < 75)  return `\x1b[33m${text}\x1b[0m`;
  if (usedPct < 90)  return `\x1b[38;5;208m${text}\x1b[0m`;
  return `\x1b[5;31m${text}\x1b[0m`;
}

/**
 * Format remaining time until resets_at as "12m", "1h23m", "4h".
 * @param {string|undefined} resetsAt  ISO 8601 string
 * @returns {string}
 */
function formatResetTime(resetsAt, maxMinutes = Infinity) {
  if (!resetsAt) return '';
  const diffMs = (resetsAt * 1000) - Date.now();
  if (diffMs <= 0) return '';
  const totalMin = Math.ceil(diffMs / 60000);
  if (totalMin > maxMinutes) return '';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

/**
 * Format a single rate-limit bucket (e.g. "5h").
 * Returns an empty string when the bucket is absent from the data.
 * @param {object|undefined} bucket  { used_percentage, resets_at }
 * @param {string}           label   e.g. "ses"
 * @returns {string}
 */
function formatRateLimit(bucket, label, resetMaxMinutes = Infinity) {
  if (!bucket || bucket.used_percentage == null) return '';
  const pct = Math.round(bucket.used_percentage);
  const bar = rateLimitBar(pct);
  const reset = formatResetTime(bucket.resets_at, resetMaxMinutes);
  const resetStr = reset ? ` ⏳${reset}` : '';
  return colorRateLimit(pct, `${label}: ${bar} ${pct}%${resetStr}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

let input = '';
// Guard against stdin not closing (e.g. pipe issues on some platforms).
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);

    const model     = data.model?.display_name || 'Claude';
    const dir       = data.workspace?.current_dir || process.cwd();
    const session   = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    // ── Context window ───────────────────────────────────────────────────────
    let ctx = '';
    if (remaining != null) {
      const usableRemaining = Math.max(
        0,
        ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100
      );
      const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

      // Write bridge file for the context-monitor PostToolUse hook.
      if (session) {
        try {
          const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
          fs.writeFileSync(bridgePath, JSON.stringify({
            session_id:           session,
            remaining_percentage: remaining,
            used_pct:             used,
            timestamp:            Math.floor(Date.now() / 1000),
          }));
        } catch (_) { /* best-effort */ }
      }

    }

    // ── Rate limits ──────────────────────────────────────────────────────────
    const rateParts = [
      formatRateLimit(data.rate_limits?.five_hour,  'ses'),
      formatRateLimit(data.rate_limits?.seven_day,  'week', 60 * 24),
    ].filter(Boolean);
    const rateStr = rateParts.length > 0 ? ` │ ${rateParts.join(' ')}` : '';

    // ── Current task from todos ──────────────────────────────────────────────
    let task = '';
    const homeDir   = os.homedir();
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');
    const todosDir  = path.join(claudeDir, 'todos');
    if (session && fs.existsSync(todosDir)) {
      try {
        const files = fs.readdirSync(todosDir)
          .filter(f => f.startsWith(session) && f.includes('-agent-') && f.endsWith('.json'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          const todos      = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
          const inProgress = todos.find(t => t.status === 'in_progress');
          if (inProgress) task = inProgress.activeForm || '';
        }
      } catch (_) { /* silently ignore fs errors */ }
    }

    // ── GSD update banner ────────────────────────────────────────────────────
    let gsdUpdate = '';
    const cacheFile = path.join(claudeDir, 'cache', 'gsd-update-check.json');
    if (fs.existsSync(cacheFile)) {
      try {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (cache.update_available) {
          gsdUpdate = '\x1b[33m⬆ /gsd:update\x1b[0m │ ';
        }
        if (cache.stale_hooks?.length > 0) {
          gsdUpdate += '\x1b[31m⚠ stale hooks — run /gsd:update\x1b[0m │ ';
        }
      } catch (_) {}
    }

    // ── Render ───────────────────────────────────────────────────────────────
    const dirname = path.basename(dir);
    const branch  = data.worktree?.branch ? ` \x1b[2m(${data.worktree.branch})\x1b[0m` : '';
    const dirPart = `\x1b[2m${dirname}\x1b[0m${branch}`;
    const base    = task
      ? `${gsdUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ ${dirPart}`
      : `${gsdUpdate}\x1b[2m${model}\x1b[0m │ ${dirPart}`;

    process.stdout.write(`${base}${ctx}${rateStr}`);
  } catch (_) {
    // Silent fail — never break the statusline.
  }
});
