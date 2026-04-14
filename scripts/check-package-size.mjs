import { execFile as execFileCallback } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const packageJsonPath = new URL('../package.json', import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(packageJsonPath)));
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

const thresholdPercent = Number.parseFloat(
  process.env.PACKAGE_SIZE_MAX_INCREASE_PERCENT ?? '70',
);
const baselineTag = process.env.PACKAGE_SIZE_BASELINE_TAG ?? 'latest';
const baselineSpec =
  process.env.PACKAGE_SIZE_BASELINE_PACKAGE_SPEC ??
  `${packageJson.name}@${baselineTag}`;

if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0) {
  console.error(
    'PACKAGE_SIZE_MAX_INCREASE_PERCENT must be a non-negative number.',
  );
  process.exit(1);
}

const tempDir = await mkdtemp(path.join(tmpdir(), 'package-size-check-'));
const npmCacheDir = path.join(tempDir, 'npm-cache');
let exitCode = 0;

try {
  const [currentPack, baselinePack] = await Promise.all([
    packPackage({
      cwd: packageRoot,
      destination: tempDir,
      cacheDir: npmCacheDir,
    }),
    packPackage({
      cwd: packageRoot,
      destination: tempDir,
      cacheDir: npmCacheDir,
      spec: baselineSpec,
    }).catch((error) => {
      if (isMissingPublishedPackage(error)) {
        console.log(
          `No published baseline found for ${baselineSpec}. Skipping package size check.`,
        );
        return null;
      }

      throw error;
    }),
  ]);

  if (!baselinePack) {
    exitCode = 0;
  } else {
    const comparisons = [
      compareMetric('tarball size', baselinePack.size, currentPack.size),
      compareMetric(
        'unpacked size',
        baselinePack.unpackedSize,
        currentPack.unpackedSize,
      ),
    ];

    const summaryLines = [
      `Package size check for ${packageJson.name}`,
      `Baseline: ${baselinePack.name}@${baselinePack.version} (${baselineSpec})`,
      `Candidate: ${currentPack.name}@${currentPack.version} (workspace)`,
      '',
      ...comparisons.map(formatComparison),
    ];

    console.log(summaryLines.join('\n'));
    await writeGitHubSummary({
      packageName: packageJson.name,
      baselinePack,
      currentPack,
      comparisons,
      thresholdPercent,
    });

    const violations = comparisons.filter(
      (comparison) => comparison.increasePercent > thresholdPercent,
    );

    if (violations.length > 0) {
      console.error('');
      console.error(
        `Package size increased by more than ${thresholdPercent}% for: ${violations
          .map((violation) => violation.label)
          .join(', ')}.`,
      );
      exitCode = 1;
    }
  }
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

process.exitCode = exitCode;

async function packPackage({ cwd, destination, cacheDir, spec }) {
  const args = ['pack'];

  if (spec) {
    args.push(spec);
  }

  args.push('--json', '--pack-destination', destination);

  const { stdout } = await execFile('npm', args, {
    cwd,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: cacheDir,
      npm_config_cache: cacheDir,
    },
  });

  const [result] = JSON.parse(stdout);

  if (!result) {
    throw new Error(`npm pack returned no result for ${spec ?? 'workspace'}.`);
  }

  return result;
}

function compareMetric(label, baselineValue, currentValue) {
  const delta = currentValue - baselineValue;
  const increasePercent =
    baselineValue === 0
      ? currentValue === 0
        ? 0
        : Number.POSITIVE_INFINITY
      : (delta / baselineValue) * 100;

  return {
    label,
    baselineValue,
    currentValue,
    delta,
    increasePercent,
  };
}

function formatComparison(comparison) {
  const sign = comparison.delta >= 0 ? '+' : '-';
  const deltaValue = `${sign}${formatBytes(Math.abs(comparison.delta))}`;
  const percent = Number.isFinite(comparison.increasePercent)
    ? `${comparison.increasePercent >= 0 ? '+' : ''}${comparison.increasePercent.toFixed(1)}%`
    : '+inf%';

  return [
    `- ${comparison.label}: ${formatBytes(comparison.currentValue)} vs ${formatBytes(
      comparison.baselineValue,
    )}`,
    `  delta ${deltaValue} (${percent})`,
  ].join('\n');
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function isMissingPublishedPackage(error) {
  const message = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}\n${error?.message ?? ''}`;

  return (
    message.includes('E404') ||
    message.includes('No match found for version') ||
    message.includes('not in this registry')
  );
}

async function writeGitHubSummary({
  packageName,
  baselinePack,
  currentPack,
  comparisons,
  thresholdPercent,
}) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryPath) {
    return;
  }

  const rows = comparisons
    .map((comparison) => {
      const percent = Number.isFinite(comparison.increasePercent)
        ? `${comparison.increasePercent.toFixed(1)}%`
        : 'inf';

      return `| ${comparison.label} | ${formatBytes(
        baselinePack[metricKeyFor(comparison.label)],
      )} | ${formatBytes(currentPack[metricKeyFor(comparison.label)])} | ${formatBytes(
        Math.abs(comparison.delta),
      )} | ${percent} |`;
    })
    .join('\n');

  const summary = [
    `### Package size check: ${packageName}`,
    '',
    `Baseline: \`${baselinePack.name}@${baselinePack.version}\` from \`${baselineSpec}\``,
    `Threshold: \`${thresholdPercent}%\``,
    '',
    '| Metric | Baseline | Candidate | Delta | Increase |',
    '| --- | --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');

  await appendFile(summaryPath, summary, 'utf8');
}

function metricKeyFor(label) {
  if (label === 'tarball size') {
    return 'size';
  }

  return 'unpackedSize';
}
