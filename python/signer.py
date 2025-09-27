#!/usr/bin/env python3
"""Signer using cryptography.hazmat for RSA or ECDSA signing of artifact digests.
This script demonstrates safe signing with a local private key file (PEM).
Prefer cosign for production; use this path only when you control private keys securely.
"""
import argparse
import hashlib
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, ec, ed25519
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed

def sha256_of_file(path):
    h = hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.digest()

def load_private_key(pem_path, password=None):
    with open(pem_path,'rb') as f:
        data = f.read()
    key = serialization.load_pem_private_key(data, password=password)
    return key

def sign_with_private_key(artifact_path, key_path, out_sig_path):
    digest = sha256_of_file(artifact_path)
    key = load_private_key(key_path)
    if isinstance(key, ed25519.Ed25519PrivateKey):
        sig = key.sign(digest)
    elif isinstance(key, rsa.RSAPrivateKey):
        sig = key.sign(
            digest,
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
            Prehashed(hashes.SHA256())
        )
    elif isinstance(key, ec.EllipticCurvePrivateKey):
        sig = key.sign(digest, ec.ECDSA(Prehashed(hashes.SHA256())))
    else:
        raise SystemExit('Unsupported key type')
    with open(out_sig_path, 'wb') as f:
        f.write(sig)
    print('Wrote signature to', out_sig_path)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('artifact', help='path to artifact')
    p.add_argument('--key', required=True, help='path to private key PEM')
    p.add_argument('--out', default='artifact.sig', help='output signature path')
    args = p.parse_args()
    art = Path(args.artifact)
    if not art.exists():
        raise SystemExit('artifact not found')
    sign_with_private_key(str(art), args.key, args.out)

if __name__ == '__main__':
    main()
