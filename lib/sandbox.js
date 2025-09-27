'use strict';
/**
 * Secure sandbox runner for extracting and scanning packages.
 * Uses Docker to isolate extraction and analysis.
 *
 * Security defaults:
 * - --read-only
 * - --network=none
 * - --cap-drop=ALL
 * - runs as non-root user inside container (-u 1000:1000)
 * - limits memory and cpu
 *
 * This implementation uses child_process.spawn (no shell) and builds args safely.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function dockerAvailable() {
  try {
    const which = spawn('docker', ['version', '--format', '{{.Server.Version}}']);
    // note: caller should handle async availability; this is a quick sync hint
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Runs a docker container with strict flags to extract a tarball to a host temp dir.
 * @param {string} tarballPath - absolute path to tar.gz on host
 * @param {string} outDir - absolute path to host output directory (must exist)
 * @param {object} options - { image, memLimit, cpus }
 * @returns {Promise<{code:number, stdout:string, stderr:string}>}
 */
function runExtractionInSandbox(tarballPath, outDir, options = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(tarballPath)) return reject(new Error('tarball not found'));
    const image = options.image || 'alpine:3.18';
    const mem = options.memLimit || '256m';
    const cpus = options.cpus || '0.5';
    // Mount only the tarball (read-only) and the output dir (read-write tmp)
    const args = [
      'run', '--rm',
      '--read-only',
      '--network=none',
      '--cap-drop=ALL',
      '--memory=' + mem,
      '--cpus=' + cpus,
      '-u', '1000:1000',
      '-v', `${path.dirname(tarballPath)}:/in:ro`,
      '-v', `${outDir}:/out:rw`,
      image,
      'sh', '-c',
      // minimal extraction inside container: extract tar from /in to /out
      `mkdir -p /out && tar -xzf /in/${path.basename(tarballPath)} -C /out`
    ];

    const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => reject(err));
    proc.on('close', code => resolve({ code, stdout, stderr }));
  });
}

module.exports = {
  runExtractionInSandbox,
  dockerAvailable
};
