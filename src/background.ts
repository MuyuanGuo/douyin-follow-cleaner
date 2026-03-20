/** Service worker: 在页面主世界执行 fetch，复用登录态与站内签名逻辑 */

export interface PageFetchResult {
  ok: boolean;
  status: number;
  text: string;
  error?: string;
}

async function fetchInMainWorld(
  tabId: number,
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<PageFetchResult> {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (
        fetchUrl: string,
        initArg: { method?: string; headers?: Record<string, string>; body?: string } | undefined,
      ) => {
        const opt: RequestInit = { credentials: 'include' };
        if (initArg?.method) opt.method = initArg.method;
        if (initArg?.headers) opt.headers = initArg.headers;
        if (initArg?.body !== undefined) opt.body = initArg.body;
        const r = await fetch(fetchUrl, opt);
        const text = await r.text();
        return { ok: r.ok, status: r.status, text };
      },
      args: [url, init],
    });
    const result = res?.result as PageFetchResult | undefined;
    if (!result) {
      return { ok: false, status: 0, text: '' };
    }
    return result;
  } catch (e) {
    return { ok: false, status: 0, text: '', error: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PAGE_FETCH' && typeof message.url === 'string') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false, status: 0, text: '', error: 'no_tab' });
      return;
    }
    fetchInMainWorld(tabId, message.url, message.init).then(sendResponse);
    return true;
  }
  return undefined;
});
