#!/bin/sh
# Rebuild public/phase2/phantom.wasm from Bryforge/phase1.
# The phantom patch (eight cfg gates) is phase1-phantom.patch, beside
# this script; apply it to a clean edge/stable checkout first.
set -eu
SRC="${1:?usage: build-phase2.sh <phase1 checkout with the phantom patch applied>}"
export PATH="$HOME/.cargo/bin:$PATH"
cd "$SRC"
RUSTUP_TOOLCHAIN=1.94.0 cargo build --release --target wasm32-wasip1 -p phase1 --bin phase1
cp target/wasm32-wasip1/release/phase1.wasm "$(dirname "$0")/../../public/phase2/phantom.wasm"
echo "phantom.wasm rebuilt: $(wc -c < "$(dirname "$0")/../../public/phase2/phantom.wasm") bytes"
