import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

const TOOL_NAME = 'go-arch-lint';
const DEFAULT_VERSION = 'v1.15.0';
const REPO = 'fe3dback/go-arch-lint';

/**
 * Known-good SHA256 checksums for release archives, keyed by version and then
 * by asset filename. These are vendored from the upstream `checksums.txt` and
 * act as the trust anchor: for pinned versions the expected hash lives in this
 * repository, so a download is rejected even if the upstream release asset is
 * later tampered with.
 *
 * For versions not present here, the action falls back to the `checksums.txt`
 * published alongside the release (see resolveExpectedChecksum).
 *
 * To pin a new version: download its checksums.txt from the release and add an
 * entry here (e.g. `curl -fsSL .../<version>/checksums.txt`).
 */
const KNOWN_CHECKSUMS: Record<string, Record<string, string>> = {
  'v1.15.0': {
    'go-arch-lint_1.15.0_darwin_amd64.tar.gz':
      'aa85c68a811673d4d3a510d8d616fedb523e9c58eb4a30a997decbb87e0970d6',
    'go-arch-lint_1.15.0_darwin_arm64.tar.gz':
      '37c8ebd36bfedb97c14486ff480f91c60bf0901ccc600aee2044591c13b72922',
    'go-arch-lint_1.15.0_linux_386.tar.gz':
      '2a4295e91dfbcd6fbd4b13b4ddc16cf6c68eecf07bf9b424c9eb500737065b38',
    'go-arch-lint_1.15.0_linux_amd64.tar.gz':
      'b694a40d4b880b7665b164da6023775ba7461ac2110de09f0b2dddd1c58d4176',
    'go-arch-lint_1.15.0_linux_arm64.tar.gz':
      'b806132ca67f98e932f84228e2bed14ee1a99abe0226dab352c63e63c2ded976',
    'go-arch-lint_1.15.0_windows_386.zip':
      'a07c3869041d6172afab124ff76ab82646f49d735ccadbf92769e1e0f14f118f',
    'go-arch-lint_1.15.0_windows_amd64.zip':
      '9188711fb8edd9cff371c729e6dcd41631080ca015a3cdd68a04163811baa510',
    'go-arch-lint_1.15.0_windows_arm64.zip':
      '2014f1c3d812eb81600aaaeb82d5f4a6ea7394d942bd1fb8e6fbc27512e48767',
  },
};

/**
 * Normalizes the version input to always include the leading 'v'.
 * Accepts both 'v1.2.3' and '1.2.3'.
 */
function normalizeVersion(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

/**
 * Validates that the version string looks like a semver tag (vX.Y.Z).
 */
function validateVersion(version: string): void {
  if (!/^v\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Invalid version format: "${version}". Expected format: v1.2.3 or 1.2.3`
    );
  }
}

/**
 * Maps Node's process.platform to the OS token used in go-arch-lint's
 * goreleaser archive names (darwin, linux, windows).
 */
function getOS(): string {
  switch (process.platform) {
    case 'darwin':
      return 'darwin';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * Maps Node's process.arch to the arch token used in go-arch-lint's
 * goreleaser archive names (amd64, arm64, 386).
 */
function getArch(): string {
  switch (process.arch) {
    case 'x64':
      return 'amd64';
    case 'arm64':
      return 'arm64';
    case 'ia32':
      return '386';
    default:
      throw new Error(`Unsupported architecture: ${process.arch}`);
  }
}

/**
 * Builds the release asset filename for the current platform.
 *
 * goreleaser archive naming uses lowercase OS and Go-style arch names, e.g.:
 *   go-arch-lint_1.15.0_linux_amd64.tar.gz
 *   go-arch-lint_1.15.0_windows_amd64.zip
 */
function getAssetFilename(version: string): { filename: string; isZip: boolean } {
  // Strip the leading 'v' for use in the archive filename.
  const semver = version.replace(/^v/, '');
  const os = getOS();
  const arch = getArch();
  const isZip = os === 'windows';
  const ext = isZip ? 'zip' : 'tar.gz';
  const filename = `${TOOL_NAME}_${semver}_${os}_${arch}.${ext}`;
  return { filename, isZip };
}

/**
 * Builds the download URL for a named release asset.
 */
function getAssetURL(version: string, filename: string): string {
  return `https://github.com/${REPO}/releases/download/${version}/${filename}`;
}

/**
 * Computes the hex-encoded SHA256 of a file.
 */
function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/**
 * Parses a goreleaser-style `checksums.txt` ("<sha256>  <filename>" per line)
 * and returns the checksum for the given filename, or undefined if absent.
 */
function parseChecksums(contents: string, filename: string): string | undefined {
  for (const line of contents.split('\n')) {
    const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (match && match[2] === filename) {
      return match[1].toLowerCase();
    }
  }
  return undefined;
}

/**
 * Validates that a string is a hex-encoded SHA256 (64 hex chars) and returns it
 * lowercased.
 */
function normalizeChecksum(input: string): string {
  const trimmed = input.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      `Invalid checksum: "${input}". Expected a 64-character hex-encoded SHA256.`
    );
  }
  return trimmed.toLowerCase();
}

/**
 * Resolves the expected SHA256 for a release asset.
 *
 * Precedence: an explicit caller-supplied checksum wins, then the vendored
 * checksum (KNOWN_CHECKSUMS) so the trust anchor lives in this repo, then the
 * release's `checksums.txt` as a fallback for versions that aren't pinned here.
 */
async function resolveExpectedChecksum(
  version: string,
  filename: string,
  overrideChecksum?: string
): Promise<string> {
  if (overrideChecksum) {
    core.info(`Using caller-supplied checksum for ${filename}`);
    return normalizeChecksum(overrideChecksum);
  }

  const pinned = KNOWN_CHECKSUMS[version]?.[filename];
  if (pinned) {
    core.info(`Using pinned checksum for ${filename}`);
    return pinned.toLowerCase();
  }

  core.info(
    `No pinned checksum for ${version}; fetching checksums.txt from the release`
  );
  const checksumsURL = getAssetURL(version, 'checksums.txt');
  core.debug(`Checksums URL: ${checksumsURL}`);
  const checksumsPath = await tc.downloadTool(checksumsURL);
  const contents = fs.readFileSync(checksumsPath, 'utf8');
  const expected = parseChecksums(contents, filename);
  if (!expected) {
    throw new Error(
      `Could not find a checksum for "${filename}" in the release checksums.txt`
    );
  }
  return expected;
}

/**
 * Verifies that the file at archivePath matches the expected SHA256, throwing
 * a descriptive error on mismatch.
 */
function verifyChecksum(
  archivePath: string,
  filename: string,
  expected: string
): void {
  const actual = sha256File(archivePath);
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${filename}:\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        `The downloaded archive does not match the expected hash. ` +
        `This may indicate a corrupted download or a tampered release asset.`
    );
  }
  core.info(`Checksum verified for ${filename} (${actual})`);
}

async function run(): Promise<void> {
  try {
    const rawVersion = core.getInput('version') || DEFAULT_VERSION;
    const version = normalizeVersion(rawVersion);
    validateVersion(version);

    const checksumInput = core.getInput('checksum');

    core.info(`Setting up ${TOOL_NAME} ${version}`);

    // Check the tool cache first.
    let toolPath = tc.find(TOOL_NAME, version);
    if (toolPath) {
      core.info(`Found cached ${TOOL_NAME} ${version} at ${toolPath}`);
    } else {
      core.info(`Downloading ${TOOL_NAME} ${version}...`);
      const { filename, isZip } = getAssetFilename(version);
      const url = getAssetURL(version, filename);
      core.debug(`Download URL: ${url}`);

      const archivePath = await tc.downloadTool(url);

      // Verify the archive against the expected SHA256 before extracting.
      const expected = await resolveExpectedChecksum(
        version,
        filename,
        checksumInput || undefined
      );
      verifyChecksum(archivePath, filename, expected);

      const extractedPath = isZip
        ? await tc.extractZip(archivePath)
        : await tc.extractTar(archivePath);

      // Cache the extracted directory so subsequent runs skip the download.
      // The binary lives at the root of the extracted archive.
      toolPath = await tc.cacheDir(extractedPath, TOOL_NAME, version);
      core.info(`Cached ${TOOL_NAME} ${version} at ${toolPath}`);
    }

    core.addPath(toolPath);
    core.info(`${TOOL_NAME} ${version} is ready`);

    // Emit the resolved version as an output so callers can reference it.
    core.setOutput('version', version);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
