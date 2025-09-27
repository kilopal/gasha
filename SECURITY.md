# 🔐 Gasha Security Overview

## Current Protections
- Ed25519 cryptographic signing & verification (Python)
- Signature verification before package installation
- Local transparency log of all signatures
- Test mode with benign/malicious samples

## Planned Defenses
- SHA256 hash validation before unpacking
- Sandboxed unpacking (no postinstall/network)
- Static analyzer for suspicious JS files
- Merkle tree signature log
- Public transparency via Sigstore/Rekor
- Proof-of-origin metadata

Gasha aims to provide **defense-in-depth** for the supply chain.
