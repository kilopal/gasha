#!/usr/bin/env node
const { Command } = require('commander');
const core = require('../lib/core');
const pkg = require('../package.json');
const program = new Command();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

// Helper function for colored output
function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Enhanced banner with colors and styling
function createBanner() {
  const banner = `
${colorize('='.repeat(80), 'cyan')}
${colorize('🛡️  GASHA - Security Wrapper for npm/yarn', 'bright')} ${colorize('v' + pkg.version, 'dim')}
${colorize('='.repeat(80), 'cyan')}

${colorize('A security wrapper around npm and yarn that adds cryptographic signing,', 'white')}
${colorize('Merkle tree verification, transparency logs, and static analysis to your', 'white')}
${colorize('existing workflow. Developers stay in their ecosystem while gaining', 'white')}
${colorize('enterprise-grade supply chain security protection.', 'white')}

${colorize('='.repeat(80), 'cyan')}
`;
  return banner;
}

// Enhanced examples section
function createExamples() {
  return `
${colorize('📚  QUICK START', 'yellow')}
${colorize('='.repeat(80), 'cyan')}

${colorize('System Check:', 'bright')}
  ${colorize('$ gasha doctor', 'green')}                    ${colorize('# Check system readiness', 'dim')}

${colorize('Secure Package Management (npm/yarn wrapper):', 'bright')}
  ${colorize('$ gasha install express', 'green')}          ${colorize('# Install with security checks', 'dim')}
  ${colorize('$ gasha install lodash@4.17.21', 'green')}   ${colorize('# Install specific version', 'dim')}
  ${colorize('$ gasha audit express --ai', 'green')}       ${colorize('# Audit package security', 'dim')}

${colorize('Publishing with Security (npm wrapper):', 'bright')}
  ${colorize('$ gasha keygen --out ./keys', 'green')}      ${colorize('# Generate signing keys', 'dim')}
  ${colorize('$ gasha sign ./dist --key ./keys/private.pem', 'green')}  ${colorize('# Sign before publish', 'dim')}
  ${colorize('$ npm publish ./dist', 'green')}             ${colorize('# Publish via npm (normal)', 'dim')}

${colorize('Verification & Transparency:', 'bright')}
  ${colorize('$ gasha verify ./pkg.tgz', 'green')}         ${colorize('# Verify package signature', 'dim')}
  ${colorize('$ gasha log view', 'green')}                 ${colorize('# View security log', 'dim')}
  ${colorize('$ gasha explain express', 'green')}          ${colorize('# Explain package purpose', 'dim')}

${colorize('='.repeat(80), 'cyan')}
`;
}

// Enhanced links section
function createLinks() {
  return `
${colorize('🔗  RESOURCES', 'yellow')}
${colorize('='.repeat(80), 'cyan')}

  ${colorize('📖', 'blue')} ${colorize('Documentation:', 'bright')} ${colorize('https://github.com/kilopal/gasha', 'cyan')}
  ${colorize('🐛', 'red')} ${colorize('Report Issues:', 'bright')} ${colorize('https://github.com/kilopal/gasha/issues', 'cyan')}
  ${colorize('💬', 'magenta')} ${colorize('Discussions:', 'bright')} ${colorize('https://github.com/kilopal/gasha/discussions', 'cyan')}
  ${colorize('🔒', 'yellow')} ${colorize('Security:', 'bright')} ${colorize('https://github.com/kilopal/gasha/security', 'cyan')}

${colorize('='.repeat(80), 'cyan')}
`;
}

// Enhanced CLI with better descriptions and formatting
program
  .name('gasha')
  .version(pkg.version)
  .description(colorize('🛡️ A security wrapper around npm and yarn that adds cryptographic signing, Merkle tree verification, transparency logs, and static analysis to your existing workflow. Developers stay in their ecosystem while gaining enterprise-grade supply chain security protection.', 'white'))
  .usage(colorize('<command> [options]', 'bright'))
  .addHelpText('before', createBanner())
  .addHelpText('after', createExamples() + createLinks());

program.command('keygen')
  .description('🔑 Generate cryptographic keypairs for package signing')
  .option('--out <dir>', 'Output directory for key files', './keys')
  .option('--algo <alg>', 'Cryptographic algorithm (ed25519|rsa)', 'ed25519')
  .addHelpText('after', `
Examples:
  $ gasha keygen --out ./my-keys --algo ed25519
  $ gasha keygen --algo rsa
  `)
  .action(async (opts) => {
    console.log(colorize('🔑 Generating cryptographic keypair...', 'yellow') + '\n');
    const success = await core.keygen(opts.out, opts.algo);
    if (success) {
      console.log(`\n${colorize('✅ Keypair generated successfully', 'green')} ${colorize('in', 'dim')} ${colorize(opts.out, 'cyan')}`);
      console.log(`   ${colorize('Private key:', 'dim')} ${colorize(`${opts.out}/private.pem`, 'red')}`);
      console.log(`   ${colorize('Public key:', 'dim')}  ${colorize(`${opts.out}/public.pem`, 'green')}`);
    } else {
      console.error(`\n${colorize('❌ Key generation failed', 'red')}`);
      process.exit(1);
    }
  });

program.command('sign <tarball>')
  .description('✍️  Cryptographically sign a package tarball')
  .option('--key <path>', 'Path to private key file', './keys/private.pem')
  .option('--log <file>', 'Transparency log file path', './gasha-log.json')
  .option('--policy <p>', 'Signing policy (warn|strict)', 'warn')
  .addHelpText('after', `
Examples:
  $ gasha sign ./dist/package.tgz --key ./keys/private.pem
  $ gasha sign ./my-package.tgz --policy strict
  `)
  .action(async (tarball, opts) => {
    console.log(`${colorize('✍️  Signing package:', 'yellow')} ${colorize(tarball, 'cyan')}\n`);
    const ok = await core.sign(tarball, opts.key, opts.log, opts.policy);
    if (ok) {
      console.log(`\n${colorize('✅ Package signed successfully', 'green')}`);
      console.log(`   ${colorize('Signature:', 'dim')} ${colorize(`${tarball}.sig`, 'red')}`);
      console.log(`   ${colorize('Log entry:', 'dim')} ${colorize(opts.log, 'cyan')}`);
    } else {
      console.error(`\n${colorize('❌ Signing failed', 'red')}`);
      process.exit(2);
    }
  });

program.command('verify <tarball>')
  .description('🔍 Verify package signature and integrity')
  .option('--key <path>', 'Path to public key file', './keys/public.pem')
  .option('--verbose', 'Show detailed verification information', false)
  .addHelpText('after', `
Examples:
  $ gasha verify ./package.tgz --key ./keys/public.pem
  $ gasha verify ./package.tgz --verbose
  `)
  .action(async (tarball, opts) => {
    console.log(`🔍 Verifying package: ${tarball}\n`);
    const ok = await core.verify(tarball, opts.key, opts.verbose);
    if (ok) {
      console.log(`\n✅ Package verification successful`);
    } else {
      console.error('\n❌ Package verification failed');
      process.exit(3);
    }
  });

program.command('install <spec>')
  .description('📦 Install package via npm/yarn with security verification and sandboxing')
  .option('--verify', 'Verify package signature before installation', true)
  .addHelpText('after', `
Examples:
  $ gasha install express              # Install via npm with security checks
  $ gasha install lodash@4.17.21      # Install specific version securely
  $ gasha install ./local-package.tgz # Install local package with verification
  `)
  .action(async (spec) => {
    console.log(`${colorize('📦 Installing package securely:', 'yellow')} ${colorize(spec, 'cyan')}\n`);
    try {
      await core.install(spec);
      console.log(`\n${colorize('✅ Package installed successfully', 'green')}`);
    } catch (e) {
      console.error(`\n${colorize('❌ Installation failed:', 'red')} ${colorize(e.message || e, 'red')}`);
      process.exit(4);
    }
  });

program.command('log view')
  .description('📋 View transparency log entries and Merkle root')
  .addHelpText('after', `
Examples:
  $ gasha log view
  `)
  .action(() => {
    console.log(`${colorize('📋 Viewing transparency log...', 'yellow')}\n`);
    core.viewLog();
  });

program.command('doctor')
  .description('🧪 Check system readiness and dependencies')
  .addHelpText('after', `
This command checks for:
  • Node.js version compatibility
  • Python installation and cryptography library
  • Docker availability for sandboxing
  • OpenSSL for key generation

Examples:
  $ gasha doctor
  `)
  .action(async () => {
    await core.doctor();
  });

program.command('audit <package>')
  .description('🔍 Perform security audit on package')
  .option('--ai', 'Include AI-powered risk analysis')
  .option('--output <format>', 'Output format (json|text)', 'text')
  .addHelpText('after', `
Examples:
  $ gasha audit express
  $ gasha audit lodash --ai
  $ gasha audit ./package --output json
  `)
  .action(async (pkg, opts) => {
    await core.audit(pkg, opts);
  });

program.command('explain <package>')
  .description('📖 Explain package purpose and security implications')
  .addHelpText('after', `
Examples:
  $ gasha explain express
  $ gasha explain lodash
  `)
  .action(async (pkg) => {
    await core.explain(pkg);
  });

program.command('test-run')
  .description('🧪 Run demo test to verify Gasha functionality')
  .addHelpText('after', `
This command tests:
  • SHA256 computation
  • Security auditing
  • Transparency logging
  • Core functionality

Examples:
  $ gasha test-run
  `)
  .action(async () => {
    console.log(`${colorize('🧪 Running Gasha demo test...', 'yellow')}\n`);
  await core.demoRun();
});

program.parse(process.argv);
