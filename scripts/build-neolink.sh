#!/usr/bin/env bash
# Build the patched Neolink binary (fixes upstream #371 — dual <audioStreamMode>)
# outside of the add-on, for hosts that are too low on disk/CPU to compile during
# the add-on image build. Produces ./neolink for the target arch, which you can
# drop into the add-on build context (then swap the Dockerfile's stage-1 build
# for `COPY neolink /usr/local/bin/neolink`).
#
# Requires Docker with the requested platform available (e.g. an Apple-silicon
# Mac or any host with binfmt/qemu for cross-arch).
#
# Usage:   ARCH=arm64 ./build-neolink.sh        # arm64 (aarch64) — default
#          ARCH=amd64 ./build-neolink.sh
set -euo pipefail

ARCH="${ARCH:-arm64}"
BRANCH="${BRANCH:-fix-371-talkability-audiostreammode}"
FORK="${FORK:-https://github.com/nythtech-nl/neolink}"
OUT="${OUT:-$(pwd)/neolink}"

echo "Building Neolink ($BRANCH) for linux/$ARCH ..."
docker run --rm --platform "linux/$ARCH" \
  -v "$(pwd)":/out \
  -v neolink-cargo-registry:/usr/local/cargo/registry \
  rust:bookworm bash -c "
    set -e
    apt-get update -qq && apt-get install -y --no-install-recommends \
      git pkg-config libssl-dev libgstrtspserver-1.0-dev libgstreamer1.0-dev \
      libgstreamer-plugins-base1.0-dev libgtk2.0-dev libglib2.0-dev >/dev/null
    git clone --depth 1 -b '$BRANCH' '$FORK' /src
    cd /src
    cargo build --release --bin neolink
    cp target/release/neolink /out/neolink
  "
echo "Done -> $OUT"
file "$OUT" 2>/dev/null || true
