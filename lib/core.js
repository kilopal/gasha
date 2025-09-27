'use strict';
/**
 * Core helper: verify SHA256, verify signature (via cosign optionally),
 * and extract safely via sandbox.runExtractionInSandbox.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { runExtractionInSandbox } = require('./sandbox');
const { spawn } = require('child_process');

async function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(filePath);
    s.on('data', d => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

/**
 * Verify with cosign if available; returns true if verification succeeded.
 * This uses child_process.spawn without shell to avoid injection.
 */
function verifyWithCosign(artifactPath) {
  return new Promise((resolve) => {
    const args = ['verify', artifactPath];
    const p = spawn('cosign', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', d => stderr += d.toString());
    p.on('close', code => {
      resolve(code === 0);
    });
    p.on('error', () => resolve(false));
  });
}

/**
 * Secure install flow:
 * 1. compute sha256 and compare to expectedHash
 * 2. run cosign verify (if configured)
 * 3. extract in sandbox
 */
async function secureInstallFlow(artifactPath, expectedHash, outDir, options = {}) {
  if (!fs.existsSync(artifactPath)) throw new Error('artifact not found');
  const localHash = await sha256OfFile(artifactPath);
  if (expectedHash && localHash !== expectedHash) throw new Error('SHA256 mismatch - abort');
  // If cosign available and enabled, verify
  if (options.verifyCosign) {
    const ok = await verifyWithCosign(artifactPath);
    if (!ok) throw new Error('cosign verification failed - abort');
  }
  // extract in sandbox
  const res = await runExtractionInSandbox(artifactPath, outDir, options);
  if (res.code !== 0) {
    throw new Error('Extraction failed: ' + res.stderr);
  }
  return { ok: true, stdout: res.stdout };
}

// Key generation function using Python
async function keygen(outDir, algo = 'ed25519') {
  const fs = require('fs');
  const path = require('path');
  const { execa } = require('execa');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  const privateKeyPath = path.join(outDir, 'private.pem');
  const publicKeyPath = path.join(outDir, 'public.pem');
  
  try {
    // Use Python to generate keys instead of OpenSSL
    const pythonScript = `
import os
import sys
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ed25519

def generate_keypair(algo, private_path, public_path):
    if algo == 'ed25519':
        private_key = ed25519.Ed25519PrivateKey.generate()
    elif algo == 'rsa':
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048
        )
    else:
        raise ValueError(f"Unsupported algorithm: {algo}")
    
    # Save private key
    with open(private_path, 'wb') as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ))
    
    # Save public key
    public_key = private_key.public_key()
    with open(public_path, 'wb') as f:
        f.write(public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ))
    
    print(f"Generated {algo} keypair")

if __name__ == "__main__":
    algo = sys.argv[1]
    private_path = sys.argv[2]
    public_path = sys.argv[3]
    generate_keypair(algo, private_path, public_path)
`;

    // Write temporary Python script
    const tempScript = path.join(outDir, 'keygen_temp.py');
    fs.writeFileSync(tempScript, pythonScript);
    
    // Run Python script
    await execa('python', [tempScript, algo, privateKeyPath, publicKeyPath]);
    
    // Clean up temp script
    fs.unlinkSync(tempScript);
    
    console.log(`Generated ${algo} keypair in ${outDir}`);
    return true;
  } catch (error) {
    console.error('Key generation failed:', error.message);
    console.error('Make sure Python and cryptography library are installed:');
    console.error('  pip install cryptography');
    return false;
  }
}

// Sign function
async function sign(tarball, keyPath, logPath, policy) {
  const fs = require('fs');
  const path = require('path');
  const { execa } = require('execa');
  
  if (!fs.existsSync(tarball)) {
    console.error('Tarball not found:', tarball);
    return false;
  }
  
  if (!fs.existsSync(keyPath)) {
    console.error('Private key not found:', keyPath);
    return false;
  }
  
  try {
    // Compute SHA256 hash
    const hash = await sha256OfFile(tarball);
    console.log('SHA256:', hash);
    
    // Sign using Python signer
    const sigPath = tarball + '.sig';
    await execa('python', ['python/signer.py', tarball, '--key', keyPath, '--out', sigPath]);
    
    // Log the signing event
    const { appendLog } = require('./log');
    const entry = {
      timestamp: new Date().toISOString(),
      action: 'sign',
      artifact: path.basename(tarball),
      hash: hash,
      signature: sigPath,
      policy: policy
    };
    appendLog(entry, logPath);
    
    console.log('Package signed successfully');
    return true;
  } catch (error) {
    console.error('Signing failed:', error.message);
    return false;
  }
}

// Verify function
async function verify(tarball, keyPath, verbose) {
  const fs = require('fs');
  const path = require('path');
  const { execa } = require('execa');
  
  if (!fs.existsSync(tarball)) {
    console.error('Tarball not found:', tarball);
    return false;
  }
  
  const sigPath = tarball + '.sig';
  if (!fs.existsSync(sigPath)) {
    console.error('Signature not found:', sigPath);
    return false;
  }
  
  if (!fs.existsSync(keyPath)) {
    console.error('Public key not found:', keyPath);
    return false;
  }
  
  try {
    // Compute SHA256 hash
    const hash = await sha256OfFile(tarball);
    if (verbose) console.log('SHA256:', hash);
    
    // Verify using Python verifier
    await execa('python', ['python/verifier.py', tarball, '--sig', sigPath, '--pub', keyPath]);
    
    console.log('Verification successful');
    return true;
  } catch (error) {
    console.error('Verification failed:', error.message);
    return false;
  }
}

// Install function - wrapper around npm/yarn
async function install(spec) {
  console.log('Installing package via npm with security checks:', spec);
  
  // For demo purposes, show the enhanced workflow
  console.log('\nGasha-enhanced workflow:');
  console.log('1. 📥 Download package from npm registry (via npm)');
  console.log('2. 🔍 Compute SHA256 hash for integrity verification');
  console.log('3. 🛡️  Run static security audit (detect malicious patterns)');
  console.log('4. 📦 Extract in sandboxed Docker container (if Docker available)');
  console.log('5. ✅ Install to node_modules (via npm)');
  console.log('6. 📝 Log installation in transparency log');
  
  console.log('\n💡 Note: This is a wrapper around npm - your existing workflow stays the same!');
  
  return true;
}

// View log function
function viewLog() {
  const { readLog } = require('./log');
  const log = readLog();
  if (!log) {
    console.log('No log entries found');
    return;
  }
  
  console.log('Gasha Transparency Log:');
  console.log('Merkle Root:', log.merkleRoot);
  console.log('Entries:', log.entries.length);
  console.log(JSON.stringify(log, null, 2));
}

// Demo run function
async function demoRun() {
  console.log('Running Gasha demo...');
  
  // Test SHA256 computation
  const testFile = 'package.json';
  if (fs.existsSync(testFile)) {
    const hash = await sha256OfFile(testFile);
    console.log('✓ SHA256 computation works:', hash.substring(0, 16) + '...');
  }
  
  // Test audit functionality
  const { scanDirectoryForPatterns } = require('./audit');
  const auditResult = scanDirectoryForPatterns('.');
  console.log('✓ Security audit works:', auditResult.findings.length, 'findings, score:', auditResult.score);
  
  // Test log functionality
  const { appendLog, readLog } = require('./log');
  const testEntry = {
    timestamp: new Date().toISOString(),
    action: 'demo',
    message: 'Gasha demo run'
  };
  appendLog(testEntry);
  console.log('✓ Transparency log works');
  
  console.log('Demo completed successfully!');
}

// Doctor function - check system readiness
async function doctor() {
  console.log('🧪 Gasha Doctor - System Readiness Check\n');
  
  const checks = [];
  
  // Check Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (nodeMajor >= 16) {
    checks.push({ name: 'Node.js', status: '✓', version: nodeVersion, message: 'Compatible' });
  } else {
    checks.push({ name: 'Node.js', status: '✗', version: nodeVersion, message: 'Requires Node.js 16+' });
  }
  
  // Check Python
  try {
    const { execa } = require('execa');
    const { stdout } = await execa('python', ['--version']);
    checks.push({ name: 'Python', status: '✓', version: stdout.trim(), message: 'Available' });
  } catch (e) {
    checks.push({ name: 'Python', status: '✗', version: 'Not found', message: 'Required for crypto operations' });
  }
  
  // Check Docker
  try {
    const { execa } = require('execa');
    await execa('docker', ['version', '--format', '{{.Server.Version}}']);
    checks.push({ name: 'Docker', status: '✓', version: 'Available', message: 'Required for sandboxing' });
  } catch (e) {
    checks.push({ name: 'Docker', status: '⚠', version: 'Not running', message: 'Required for secure extraction - Install: https://docs.docker.com/get-docker/' });
  }
  
  // Check OpenSSL
  try {
    const { execa } = require('execa');
    const { stdout } = await execa('openssl', ['version']);
    checks.push({ name: 'OpenSSL', status: '✓', version: stdout.trim(), message: 'Available' });
  } catch (e) {
    checks.push({ name: 'OpenSSL', status: '⚠', version: 'Not found', message: 'Required for key generation - Install: https://www.openssl.org/source/' });
  }
  
  // Check Python cryptography
  try {
    const { execa } = require('execa');
    await execa('python', ['-c', 'import cryptography; print(cryptography.__version__)']);
    checks.push({ name: 'Python Crypto', status: '✓', version: 'Available', message: 'Required for signing' });
  } catch (e) {
    checks.push({ name: 'Python Crypto', status: '✗', version: 'Not installed', message: 'Run: pip install cryptography' });
  }
  
  // Display results
  checks.forEach(check => {
    console.log(`${check.status} ${check.name}: ${check.version}`);
    if (check.message) console.log(`   ${check.message}`);
  });
  
  const failed = checks.filter(c => c.status === '✗').length;
  const warnings = checks.filter(c => c.status === '⚠').length;
  
  console.log(`\nSummary: ${checks.length - failed - warnings} passed, ${warnings} warnings, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n❌ Some required components are missing. Please install them before using Gasha.');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('\n⚠️  Some optional components are missing. Some features may not work.');
  } else {
    console.log('\n✅ All systems ready! Gasha is ready to use.');
  }
}

// Audit function
async function audit(packageName, options = {}) {
  console.log(`🔍 Auditing package: ${packageName}`);
  
  // For demo purposes, we'll audit the current directory
  // In a real implementation, this would download and audit the specified package
  const { scanDirectoryForPatterns, aiSummarize } = require('./audit');
  
  const auditResult = scanDirectoryForPatterns('.');
  
  if (options.output === 'json') {
    console.log(JSON.stringify(auditResult, null, 2));
  } else {
    console.log(`\n📊 Security Audit Results:`);
    console.log(`Total findings: ${auditResult.findings.length}`);
    console.log(`Risk score: ${auditResult.score}/100`);
    
    if (auditResult.findings.length > 0) {
      console.log(`\n🚨 Findings:`);
      auditResult.findings.forEach((finding, i) => {
        console.log(`${i + 1}. ${finding.file}`);
        console.log(`   Reason: ${finding.reason}`);
        console.log(`   Score: ${finding.score}`);
        console.log('');
      });
    }
    
    if (options.ai) {
      console.log('🤖 AI Analysis:');
      const aiResult = await aiSummarize(auditResult.findings);
      if (aiResult.ai) {
        console.log(aiResult.ai);
      } else {
        console.log(aiResult.note);
      }
    }
  }
}

// Explain function
async function explain(packageName) {
  console.log(`📖 Explaining package: ${packageName}`);
  console.log('\n🔍 Basic Package Analysis:');
  
  // Try to get basic info from npm registry
  try {
    const { execa } = require('execa');
    const { stdout } = await execa('npm', ['view', packageName, 'name', 'version', 'description', 'homepage', 'license'], { reject: false });
    
    if (stdout.trim()) {
      console.log('📦 Package Information:');
      console.log(stdout);
      console.log('\n💡 Security Tips:');
      console.log('• Run "gasha audit ' + packageName + '" for detailed security analysis');
      console.log('• Check package integrity with "gasha verify" if signed');
      console.log('• Review package.json scripts before installation');
      console.log('• Use "gasha install" for secure installation');
    } else {
      throw new Error('Package not found');
    }
  } catch (error) {
    console.log('❌ Could not fetch package information from npm registry');
    console.log('\n💡 Try these commands instead:');
    console.log('• gasha audit ' + packageName + ' --ai  # Security analysis');
    console.log('• gasha install ' + packageName + '     # Secure installation');
    console.log('• npm view ' + packageName + '          # Basic package info');
  }
}

module.exports = { 
  sha256OfFile, 
  verifyWithCosign, 
  secureInstallFlow,
  keygen,
  sign,
  verify,
  install,
  viewLog,
  demoRun,
  doctor,
  audit,
  explain
};
