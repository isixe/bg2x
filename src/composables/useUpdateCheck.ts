import { ref } from 'vue';
import { APP_VERSION, GITHUB_LATEST_RELEASE_API } from '../config/app';
import { IS_DESKTOP } from '../lib/desktop';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'failed';

const MIN_CHECK_DURATION_MS = 2500;

const status = ref<UpdateStatus>('idle');
const latestVersion = ref('');
let inflight: Promise<boolean> | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function versionParts(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = versionParts(candidate);
  const installed = versionParts(current);
  for (let i = 0; i < 3; i++) {
    const diff = (next[i] ?? 0) - (installed[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(GITHUB_LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(String(response.status));
  const data = (await response.json()) as { tag_name?: string };
  return (data.tag_name ?? '').trim();
}

export function useUpdateCheck() {
  async function checkForUpdate(): Promise<boolean> {
    if (!IS_DESKTOP) return false;
    if (inflight) return inflight;

    status.value = 'checking';
    inflight = (async () => {
      try {
        const [result] = await Promise.all([
          fetchLatestVersion()
            .then((tag) => ({ ok: true as const, tag }))
            .catch(() => ({ ok: false as const, tag: '' })),
          wait(MIN_CHECK_DURATION_MS),
        ]);

        if (!result.ok) {
          status.value = 'failed';
          return false;
        }

        latestVersion.value = result.tag.replace(/^v/i, '');
        const available = result.tag !== '' && isNewerVersion(result.tag, APP_VERSION);
        status.value = available ? 'available' : 'latest';
        return available;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return { status, latestVersion, checkForUpdate };
}
