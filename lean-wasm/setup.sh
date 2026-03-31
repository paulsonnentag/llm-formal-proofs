#!/bin/bash
# Setup script for Lean 4 WASM
# Downloads and patches the Lean 4 WASM build for macOS compatibility

set -e

LEAN_VERSION="4.15.0"
WASM_URL="https://github.com/leanprover/lean4/releases/download/v${LEAN_VERSION}/lean-${LEAN_VERSION}-linux_wasm32.tar.zst"
WASM_DIR="lean-${LEAN_VERSION}-linux_wasm32"

cd "$(dirname "$0")"

echo "Downloading Lean ${LEAN_VERSION} WASM build..."
curl -L -o "lean-wasm.tar.zst" "$WASM_URL"

echo "Extracting..."
zstd -d "lean-wasm.tar.zst"
tar -xf "lean-wasm.tar"
rm "lean-wasm.tar" "lean-wasm.tar.zst"

echo "Patching for macOS compatibility..."
cd "${WASM_DIR}/bin"
cp lean.js lean-patched.js

# Patch filesystem mounts for macOS (uses /Users instead of /home)
sed -i '' 's|FS.mount(NODEFS,{root:"/home"},"/home")|try{FS.mkdir("/Users");FS.mkdir("/Users/paul");FS.mount(NODEFS,{root:"/Users/paul"},"/Users/paul")}catch(e){}|g' lean-patched.js

# Patch chdir to handle mount failures gracefully
sed -i '' 's|FS.chdir(process.cwd())|try{FS.chdir(process.cwd())}catch(e){FS.chdir("/")}|g' lean-patched.js

echo "Done! Lean ${LEAN_VERSION} WASM is ready."
echo "Test with: LEAN_PATH='${WASM_DIR}/lib/lean' node ${WASM_DIR}/bin/lean-patched.js --version"
