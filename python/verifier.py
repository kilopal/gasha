#!/usr/bin/env python3
"""Verifier using cryptography.hazmat to verify signatures created by signer.py.
Prefer cosign for production verification; this script verifies a raw signature against a public key.
"""
import argparse, hashlib
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, ec, ed25519
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed

def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.digest()

def load_public_key(pem_path):
    with open(pem_path,'rb') as f:
        data = f.read()
    key = serialization.load_pem_public_key(data)
    return key

def verify_signature(artifact_path, sig_path, pubkey_path):
    digest = sha256_of_file(artifact_path)
    key = load_public_key(pubkey_path)
    sig = open(sig_path,'rb').read()
    try:
        if hasattr(key, 'verify'):
            # Try Ed25519 first (simplest)
            if isinstance(key, ed25519.Ed25519PublicKey):
                key.verify(sig, digest)
                print('OK (Ed25519)')
                return 0
            # Try RSA
            elif hasattr(key, 'key_size'):  # RSA keys have key_size
                key.verify(sig, digest, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH), Prehashed(hashes.SHA256()))
                print('OK (RSA)')
                return 0
            # Try ECDSA
            else:
                key.verify(sig, digest, ec.ECDSA(Prehashed(hashes.SHA256())))
                print('OK (ECDSA)')
                return 0
        raise SystemExit('Verification failed')
    except Exception as e:
        print('Verification error:', e)
        return 2

def main():
    p = argparse.ArgumentParser()
    p.add_argument('artifact')
    p.add_argument('--sig', required=True)
    p.add_argument('--pub', required=True)
    args = p.parse_args()
    rc = verify_signature(args.artifact, args.sig, args.pub)
    if rc == 0:
        print('Verification OK for', args.artifact)
    else:
        raise SystemExit(2)

if __name__ == '__main__':
    main()
