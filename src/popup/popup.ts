import { SCAN_PROGRESS_STORAGE_KEY, type ScanProgressState } from '../shared/types';

function el<T extends HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error(`Missing #${id}`);
  return n as T;
}

function setStatus(text: string) {
  el<HTMLParagraphElement>('status').textContent = text;
}

function setLog(text: string) {
  el<HTMLPreElement>('log').textContent = text;
}

function setProgressDetail(text: string) {
  const box = el<HTMLDivElement>('progressDetail');
  box.textContent = text;
}

function formatProgress(s: ScanProgressState): string {
  switch (s.phase) {
    case 'collecting':
      return [
        `【拉取关注列表】已发现 ${s.collectedCount ?? 0} 人${s.listPage ? ` · 第 ${s.listPage} 页` : ''}`,
        s.message ?? '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'profiling': {
      const total = s.totalToProfile ?? 0;
      const done = s.profiledCount ?? 0;
      const pending = s.pendingCount ?? Math.max(0, total - done);
      return [
        `【分析资料】已完成 ${done} / 共 ${total} 人 · 待分析 ${pending} 人`,
        s.currentNickname ? `当前：${s.currentNickname}` : '',
        s.message ?? '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'unfollowing':
      return [
        `【执行取关】${s.unfollowIndex ?? 0} / ${s.unfollowTotal ?? 0}`,
        s.currentNickname ? `当前：${s.currentNickname}` : '',
        s.message ?? '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'done':
      return s.message ?? '扫描完成';
    case 'aborted':
      return s.message ?? '已中止';
    case 'error':
      return s.message ?? '出错';
    default:
      return s.message ?? '';
  }
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

document.addEventListener('DOMContentLoaded', () => {
  const btnScan = el<HTMLButtonElement>('btnScan');
  const btnAbort = el<HTMLButtonElement>('btnAbort');
  const btnExport = el<HTMLButtonElement>('btnExport');

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SCAN_PROGRESS_STORAGE_KEY]) return;
    const nv = changes[SCAN_PROGRESS_STORAGE_KEY].newValue as ScanProgressState | undefined;
    if (nv) setProgressDetail(formatProgress(nv));
  });

  void chrome.storage.local.get(SCAN_PROGRESS_STORAGE_KEY, (data) => {
    const s = data[SCAN_PROGRESS_STORAGE_KEY] as ScanProgressState | undefined;
    if (s && s.phase !== 'idle') setProgressDetail(formatProgress(s));
  });

  btnScan.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('无法获取当前标签页');
      return;
    }
    const u = tab.url ?? '';
    if (!u.includes('douyin.com')) {
      setStatus('请先在浏览器中打开 www.douyin.com 并进入个人主页');
      return;
    }

    const ownerSec = el<HTMLInputElement>('ownerSec').value.trim();
    const maxFollowingToScan = Number(el<HTMLInputElement>('maxFollowing').value) || 500;
    const delayRaw = Number(el<HTMLInputElement>('delayProfiles').value);
    const delayMsBetweenProfiles = Number.isFinite(delayRaw) ? delayRaw : 250;
    const concRaw = Number(el<HTMLInputElement>('profileConcurrency').value);
    const profileConcurrency =
      Number.isFinite(concRaw) && concRaw >= 1 ? Math.min(8, Math.floor(concRaw)) : 3;
    const delayMsBetweenUnfollows = Number(el<HTMLInputElement>('delayUnfollow').value) || 2000;
    const executeUnfollow = el<HTMLInputElement>('executeUnfollow').checked;

    btnScan.disabled = true;
    setStatus('扫描中…');
    setLog('');
    setProgressDetail('准备开始…');

    try {
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: 'START_SCAN',
        ownerSecUserId: ownerSec || undefined,
        maxFollowingToScan,
        delayMsBetweenProfiles,
        profileConcurrency,
        delayMsBetweenUnfollows,
        executeUnfollow,
      });

      if (!res?.ok) {
        setStatus(`失败：${res?.error ?? 'unknown'}`);
        const errData = await chrome.storage.local.get(SCAN_PROGRESS_STORAGE_KEY);
        const st = errData[SCAN_PROGRESS_STORAGE_KEY] as ScanProgressState | undefined;
        if (st) setProgressDetail(formatProgress(st));
        return;
      }

      const rows = (res.rows ?? []) as Array<{
        nickname: string;
        secUserId: string;
        reasons: string[];
        shouldUnfollow: boolean;
      }>;

      const lines = rows.map((r) => {
        const flag = r.shouldUnfollow ? '[取关]' : '[保留]';
        return `${flag} ${r.nickname || r.secUserId} — ${r.reasons.join(', ')}`;
      });
      setLog(lines.join('\n') || '无结果');
      setStatus(`完成：共 ${rows.length} 人；将取关 ${rows.filter((x) => x.shouldUnfollow).length} 人（若已勾选执行取关则已请求）`);
      setProgressDetail(
        `【完成】共分析 ${rows.length} 人；建议取关 ${rows.filter((x) => x.shouldUnfollow).length} 人`,
      );

      await chrome.storage.local.set({ last_scan_results: rows });
    } catch (e) {
      setStatus(`错误：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      btnScan.disabled = false;
    }
  });

  btnAbort.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'ABORT_SCAN' }).catch(() => undefined);
    }
    setStatus('已请求中止');
  });

  btnExport.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('last_scan_results');
    const rows = data.last_scan_results as Array<{
      nickname: string;
      secUserId: string;
      userId?: string;
      reasons: string[];
      shouldUnfollow: boolean;
    }>;
    if (!rows?.length) {
      setStatus('没有可导出的数据，请先扫描');
      return;
    }
    const flat = rows.map((r) => ({
      nickname: r.nickname,
      secUserId: r.secUserId,
      userId: r.userId ?? '',
      shouldUnfollow: r.shouldUnfollow,
      reasons: r.reasons.join('|'),
    }));
    const csv = rowsToCsv(flat);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `douyin-follow-scan-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('已导出 CSV');
  });
});
