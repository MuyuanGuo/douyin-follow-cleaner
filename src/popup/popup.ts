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
    const delayMsBetweenProfiles = Number(el<HTMLInputElement>('delayProfiles').value) || 1200;
    const delayMsBetweenUnfollows = Number(el<HTMLInputElement>('delayUnfollow').value) || 2000;
    const executeUnfollow = el<HTMLInputElement>('executeUnfollow').checked;

    btnScan.disabled = true;
    setStatus('扫描中…');
    setLog('');

    try {
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: 'START_SCAN',
        ownerSecUserId: ownerSec || undefined,
        maxFollowingToScan,
        delayMsBetweenProfiles,
        delayMsBetweenUnfollows,
        executeUnfollow,
      });

      if (!res?.ok) {
        setStatus(`失败：${res?.error ?? 'unknown'}`);
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
