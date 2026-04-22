#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

TARGET_WORKSPACE=$(readlink -f "${1:-$(pwd)}")

bwrap \
  --ro-bind /usr /usr \
  --symlink usr/lib /lib \
  --symlink usr/lib64 /lib64 \
  --symlink usr/bin /bin \
  --dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --tmpfs /run \
  --unshare-net \
  --ro-bind "$SCRIPT_DIR" /server-code \
  --bind "$TARGET_WORKSPACE" /workspace \
  --chdir /workspace \
  node /server-code/index.js
