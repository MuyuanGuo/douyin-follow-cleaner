# 抖音关注清理（Chrome 扩展）

独立仓库：用于在 **PC 浏览器** 打开 [抖音网页版](https://www.douyin.com/) 并登录后，扫描你的**关注列表**，按规则标记「错误用户」，并可选择**批量取消关注**。

```bash
git clone https://github.com/MuyuanGuo/douyin-follow-cleaner.git
cd douyin-follow-cleaner
```

## 规则（满足任一即标记为可取消关注）

1. **封禁**：资料接口或用户对象中出现封禁相关字段/文案。  
2. **已注销**：接口非 0 状态或注销类提示（启发式）。  
3. **未发布作品**：公开作品数为 0；**私密账号且可见数为 0** 时仅标记「需人工确认」，**不会**自动按「未发作品」取关。  
4. **非个人账户**：企业/店铺/机构认证等（启发式，依赖接口字段）。

## 风险说明

- 批量请求与取关可能触发平台风控，存在**限制功能或封号**风险。  
- 自动化行为可能不符合《抖音用户服务协议》，请自行评估。  
- **默认仅扫描列出**；勾选「执行取关」后才会发起取关请求。  
- 建议先**小批量**试用，并适当**加大间隔**（毫秒设置）。

## 安装

1. 在本目录执行：`npm install && npm run build`（生成 `dist/` 与打包脚本）。  
2. Chrome / Edge → **扩展程序** → **开发者模式** → **加载已解压的扩展程序** → 选择本仓库根目录（根目录含 `manifest.json`）。  
3. **安装或更新扩展后**，请在抖音标签页 **刷新页面**，确保内容脚本已注入。

## 使用步骤

1. 用同一浏览器登录 [抖音网页版](https://www.douyin.com/)。  
2. 打开**个人主页**。网页版常为 `https://www.douyin.com/user/self?...`，地址栏**不会**显示长串 `sec_user_id`——扩展会通过站内 **`/aweme/v1/web/user/profile/self/`** 请求解析你的真实 ID（若失败，可在弹窗手动填写，或按下文「抓包校准」更新 `userProfileSelf.path`）。  
3. 点击扩展图标 → **开始扫描**。  
4. 查看结果列表；需要时勾选 **扫描后执行取关** 再扫一遍（或先导出 CSV 备份）。  
5. **中止** 可随时请求停止（已发出的网络请求可能仍在进行）。

## 抓包校准（接口变更时必做）

抖音站内接口路径、query、JSON 字段会改版。若出现「关注列表解析失败」或结果明显不对：

1. 打开 **开发者工具 (F12) → Network**，筛选 **Fetch/XHR**。  
2. 在页面上操作：进入「关注」列表翻页、点开某个用户资料。  
3. 记录以下请求的 **完整 URL** 与 **响应 JSON** 结构：  
   - 当前登录用户资料（`/user/self` 页面对应的 `profile/self` 或同类接口，用于解析 `sec_user_id`）  
   - 关注列表分页  
   - 用户资料 `profile/other`（或当前实际路径）  
   - 取关（取消关注）的 **POST** URL 与 **表单/JSON 字段**  
4. 编辑 [`src/shared/douyinApiMapping.ts`](src/shared/douyinApiMapping.ts)，修改 `userProfileSelf.path`、`followingList.path`、`defaultWebQuery`、`responsePaths` 等，与 Network 中一致。  
5. 重新执行 `npm run build`，在 `chrome://extensions` 里点扩展的 **重新加载**。

## 开发

```bash
npm install
npm run build    # 输出 dist/*.js
npm test         # 规则单元测试
```

### Playwright（可选）

用于打开抖音页并暂停，方便对照 Network：

```bash
npm run playwright:scan
```

## 项目结构（摘要）

| 文件 | 说明 |
|------|------|
| `manifest.json` | MV3 配置 |
| `src/background.ts` | 在页面主世界执行 `fetch` |
| `src/content/content.ts` | 扫描与取关流水线 |
| `src/shared/rules.ts` | 四条规则 |
| `src/shared/douyinApiMapping.ts` | 接口路径与字段映射（优先维护此处） |
| `src/shared/normalize.ts` | 资料 JSON → 归一化用户 |
| `popup.html` | 弹窗 UI |

## 许可证

仅供个人学习与交流；使用本工具产生的一切后果由使用者自行承担。
