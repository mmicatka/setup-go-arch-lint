import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

const TOOL_NAME = 'go-arch-lint';
const DEFAULT_VERSION = 'v1.15.0';
const REPO = 'fe3dback/go-arch-lint';

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
 * Builds the download URL for a go-arch-lint release asset.
 *
 * goreleaser archive naming uses lowercase OS and Go-style arch names, e.g.:
 *   go-arch-lint_1.15.0_linux_amd64.tar.gz
 *   go-arch-lint_1.15.0_windows_amd64.zip
 */
function getDownloadURL(version: string): { url: string; isZip: boolean } {
  // Strip the leading 'v' for use in the archive filename.
  const semver = version.replace(/^v/, '');
  const os = getOS();
  const arch = getArch();
  const isZip = os === 'windows';
  const ext = isZip ? 'zip' : 'tar.gz';
  const filename = `${TOOL_NAME}_${semver}_${os}_${arch}.${ext}`;
  const url = `https://github.com/${REPO}/releases/download/${version}/${filename}`;
  return { url, isZip };
}

async function run(): Promise<void> {
  try {
    const rawVersion = core.getInput('version') || DEFAULT_VERSION;
    const version = normalizeVersion(rawVersion);
    validateVersion(version);

    core.info(`Setting up ${TOOL_NAME} ${version}`);

    // Check the tool cache first.
    let toolPath = tc.find(TOOL_NAME, version);
    if (toolPath) {
      core.info(`Found cached ${TOOL_NAME} ${version} at ${toolPath}`);
    } else {
      core.info(`Downloading ${TOOL_NAME} ${version}...`);
      const { url, isZip } = getDownloadURL(version);
      core.debug(`Download URL: ${url}`);

      const archivePath = await tc.downloadTool(url);
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
