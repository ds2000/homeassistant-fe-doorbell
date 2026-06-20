# Neolink Doorbell Talk add-on image.
#
# Stage 1 builds a patched Neolink that fixes upstream issue #371 — the Reolink
# Video Doorbell advertises two <audioStreamMode> values, which crashes stock
# Neolink's TalkAbility parser ("does not support talk"). The fix is submitted
# upstream as QuantumEntangledAndy/neolink#415; once merged you can delete
# stage 1 and COPY the binary from the official image instead.
#
# The build is heavy (compiles Neolink from source). On low-spec/low-disk hosts,
# build the binary elsewhere (see scripts/build-neolink.sh) and swap stage 2's
# COPY for a prebuilt `neolink` in the build context.

# ---- Stage 1: build patched neolink ----------------------------------------
FROM rust:bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
      git pkg-config libssl-dev \
      libgstrtspserver-1.0-dev libgstreamer1.0-dev \
      libgstreamer-plugins-base1.0-dev libgtk2.0-dev libglib2.0-dev \
    && apt-get clean
RUN git clone --depth 1 -b fix-371-talkability-audiostreammode \
      https://github.com/nythtech-nl/neolink /src
WORKDIR /src
RUN cargo build --release --bin neolink

# ---- Stage 2: runtime -------------------------------------------------------
FROM quantumentangledandy/neolink:latest
ENV RUST_LOG=info,neolink=warn
RUN apt-get update && apt-get install -y --no-install-recommends python3 && apt-get clean
COPY --from=build /src/target/release/neolink /usr/local/bin/neolink
COPY run.sh /run.sh
ENTRYPOINT []
# run.sh is baked into the image — users only provide /config/addons/neolink.toml.
CMD ["sh","/run.sh"]
