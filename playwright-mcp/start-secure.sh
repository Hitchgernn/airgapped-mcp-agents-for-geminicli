#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

bwrap \
  --ro-bind /usr /usr \
  --symlink usr/lib /lib \
  --symlink usr/lib64 /lib64 \
  --symlink usr/bin /bin \
  --dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --tmpfs /run \
  --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/pki /etc/pki \
  --ro-bind /etc/ssl /etc/ssl \
  --ro-bind /etc/crypto-policies /etc/crypto-policies \
  --ro-bind "$SCRIPT_DIR" /workspace \
  --chdir /workspace \
  node /workspace/index.js
