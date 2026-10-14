# Cloudflare Workers 云端部署与配置

已核实当前 `psmenu.jerrystack.org` 属于 Cloudflare 的 **personmenu Worker + Static Assets**，不是 Pages 项目。本项目继续用 React / Vite，静态文件由同一个 Worker 的 Assets 服务托管，`server/worker.ts` 把 `/api/*` 交给 `server/api.ts`。Supabase 承担 Auth 和 PostgreSQL，R2 承担资源，Resend 承担邮件。不需要购买 VPS 或启动常驻 Node 服务。函数、数据库、存储、邮件分别受各自免费额度约束，R2 超额仍可能收费。

线上域名按当前站点 `https://psmenu.jerrystack.org` 举例。更换域名时，需要同时更新本文提到的 `APP_ORIGIN`、Supabase 回调和 Turnstile 域名。

## 配置值去哪里拿、填在哪里

公开值写入根目录 `wrangler.jsonc` 的 `vars`；敏感值写入 **Worker 的 Secrets**，本地则写入 `.dev.vars`。代码没有使用 `VITE_*` 注入秘密，切勿自行把服务端密钥改成 Vite 公开变量。

| 名称 | 获取入口 | 生产填写位置 |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase 项目 → Connect / API 配置中的 Project URL | `wrangler.jsonc` → `vars` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase 项目 → Settings → API Keys → Publishable key，通常为 `sb_publishable_...` | `wrangler.jsonc` → `vars` |
| `SUPABASE_SERVICE_ROLE_KEY` | 同一 API Keys 页面 → Secret key（`sb_secret_...`，推荐）；也兼容 Legacy API Keys → `service_role`。**不是 anon key，也不是 Publishable key** | Worker Secret |
| `APP_ORIGIN` | 你自己的站点来源，例如 `https://psmenu.jerrystack.org`，不带末尾 `/`、路径或 Hash | `wrangler.jsonc` → `vars` |
| `ALLOW_WRITES` | 配置全部完成后主动设为字符串 `"true"`；仓库默认为 `"false"` | `wrangler.jsonc` → `vars` |
| `TURNSTILE_SITE_KEY` | Cloudflare → Turnstile → Add widget，创建 Managed 类型并添加站点域名 | `wrangler.jsonc` → `vars` |
| `TURNSTILE_SECRET_KEY` | 上面同一个 Turnstile widget 的 Secret key | Worker Secret；还需填写到 Supabase CAPTCHA 配置 |
| `RESEND_API_KEY` | Resend → API Keys → Create API Key，选择 Sending access，限制到所用发件域名 | Worker Secret；同时作为 Supabase SMTP 密码使用 |
| `MAIL_FROM` | 使用 Resend 已验证域名，例如 `灶台笔记 <notify@auth.jerrystack.org>` | `wrangler.jsonc` → `vars` |
| `ADMIN_EMAIL` | 实际接收点菜、投稿提醒的邮箱 | Worker Secret |
| `MEDIA` | R2 桶绑定，不是文本变量，不需要 S3 访问密钥 | `wrangler.jsonc` → `r2_buckets` |
| `R2_BUCKET_NAME` | 当前使用的现有桶 `jerry` | **仅本地导入/导出** `.dev.vars`，线上 Worker 使用 `MEDIA` 绑定 |

`SUPABASE_SERVICE_ROLE_KEY` 拥有绕过 RLS 的权限，因此仅供服务端已验证身份、角色和归属后的操作使用。变量名表示其服务端用途，值同时支持新的 Secret key 与 legacy `service_role` JWT；不要把数据库连接密码或个人 access token 填进这个变量。新的公开与私有 API key 只通过 `apikey` 请求头发送，用户身份才通过 Bearer JWT 发送，符合 [Supabase 的 API key 说明](https://supabase.com/docs/guides/getting-started/api-keys)。

### 本地填写

```bash
npm ci
cp .dev.vars.example .dev.vars
```

用编辑器填写 `.dev.vars`，不要把真实密钥粘贴进命令历史、聊天、截图或 Git。`.dev.vars`、`.cloud/`、`.wrangler/` 已忽略。`.dev.vars` **不会自动上传为生产 Secrets**。

本地 `APP_ORIGIN` 使用 `http://localhost:8788`。本地试用写入会写到 `.dev.vars` 指向的真实 Supabase 项目；自动化测试使用内存 PostgreSQL 和模拟网络，不会接触你的项目。

### 生产 Secrets

在 Cloudflare → Workers & Pages → **personmenu** → Settings → Variables and Secrets 中，以 **Secret** 类型增加上述敏感值。不要向其他测试 Worker 或预览环境共享生产高权限密钥。

也可以登录 Wrangler 后逐条执行，按隐藏提示输入：

```bash
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name personmenu
npx wrangler secret put RESEND_API_KEY --name personmenu
npx wrangler secret put TURNSTILE_SECRET_KEY --name personmenu
npx wrangler secret put ADMIN_EMAIL --name personmenu
```

根目录 `wrangler.jsonc` 是公开变量和 R2 绑定的配置来源，修改后重新部署。当前已配置 `name: personmenu`、正确的 Cloudflare 账号和 `MEDIA → jerry` 桶绑定。迁移到其他账号时需同时更改这些值。

## 1. 建表与授予管理员

选择你已有的 Supabase `PersonMenu` 项目。新的空项目在 SQL Editor 中依次执行：

1. `supabase/migrations/20261014072716_kitchen_cloud.sql`
2. `supabase/migrations/20261014074246_kitchen_access_and_publication.sql`

当前 PersonMenu 项目已通过 Supabase 工具执行两份迁移，**不要再次运行已执行的 SQL**。远端迁移记录时间由工具生成，与本地文件名前缀可能不同，应按迁移名称核对；不要直接用 `db push` 重放已有迁移。新建空项目才从第 1 份开始。两份迁移均包含显式 Data API 权限和 RLS；如果你调整过 Data API 暴露 schema，请确保 `public` 可用，`app_private` 不对外暴露。

这些 SQL 建立菜谱、版本记录、投稿/点菜、照片归属、通知队列、限频和账号收藏。普通用户没有写正式菜谱、指定管理员、读取别人的申请或调用通知发送函数的权限。

管理员步骤：

管理员授权在第 7 节首次部署、SMTP 配置完成后执行；现在先完成两份建表迁移即可，不必在旧版静态网站寻找注册入口。

1. 在网站注册你的邮箱，完成邮箱验证。
2. 打开 Supabase SQL Editor，把下面的示例邮箱替换为自己的邮箱后运行。

```sql
insert into app_private.admins(user_id)
select id from auth.users
where lower(email) = lower('你的管理员邮箱')
  and email_confirmed_at is not null
  and is_anonymous is false
on conflict do nothing;
```

SQL Editor 应确认匹配到 **1 个用户**。返回 0 行通常是邮箱未注册、未验证或拼写不匹配。然后刷新网站或重新登录，即可看到管理员工作台。不能通过编辑个人资料、昵称或浏览器 localStorage 获得管理员身份。

## 2. Supabase 登录与 CAPTCHA

在 Supabase → Authentication 中：

- 启用 Email + Password，保留邮箱确认；设置密码最小长度至少 8。
- 启用 Anonymous Sign-ins，供游客提交时按需建立匿名会话。
- 在 CAPTCHA / Attack Protection 中选择 Cloudflare Turnstile，填入同一 widget 的 Secret key。
- Turnstile widget 添加 `psmenu.jerrystack.org`。需要本地联调时再添加 `localhost`；也可以为本地建立独立 widget，并把本地值放进 `.dev.vars`。

Authentication → URL Configuration：

- Site URL：`https://psmenu.jerrystack.org`
- Additional Redirect URLs：
  - `https://psmenu.jerrystack.org/`
  - `https://psmenu.jerrystack.org/?auth=recovery`
  - 本地需要时增加 `http://localhost:8788/` 与 `http://localhost:8788/?auth=recovery`

应用用 PKCE 处理查询参数中的 `code`，随后转到 Hash 账号页。验证或重置邮件应使用 Supabase 默认的 `{{ .ConfirmationURL }}` 链接。请在发起注册/重置的同一浏览器中打开邮件；PKCE 的浏览器状态不能直接跨设备找回。

验证码会分别用于游客身份创建和具体提交，可能出现两次验证，这是两个独立操作。管理员和正式成员仍受身份校验与提交限频保护。不要关闭游客验证后直接开放公开写入。

## 3. Resend 域名和 SMTP

Resend → Domains → `auth.jerrystack.org`（或你自己的域名）：按照页面要求在域名 DNS 服务商填写 SPF / DKIM 记录，等待显示 **Verified**。建议按其说明补充 DMARC。仅有域名或 API key，并不代表已经具备正式发信条件。

Supabase → Authentication → Email / SMTP Settings 启用 Custom SMTP：

| 字段 | 填写内容 |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465`（TLS；以 Resend 当前 SMTP 页面为准） |
| Username | `resend` |
| Password | 对应的 Resend API key |
| Sender email | 已验证域名内的地址，例如 `notify@auth.jerrystack.org` |
| Sender name | `灶台笔记` |

注册验证、密码找回由 Supabase Auth 通过 SMTP 发出；点菜和投稿提醒由 Worker API 调用 Resend API 发出。两者共用相应 Resend 额度。邮件只发到服务端配置的 `ADMIN_EMAIL`，游客不能指定任意收件人。

先保存业务申请和队列，再发送邮件。通知失败时申请仍可在后台处理；后台“邮件通知”支持重试，重试复用同一个 Resend 幂等编号。正在发送的记录有 2 分钟租约；首次申请超过 23 小时且曾尝试发送的记录停止自动重发，需先在 Resend 核对，避免超过幂等窗口后重复发送。没有新增收费队列或定时服务器。

游客填写的联系邮箱仅供管理员联系，第一版不自动向任意游客邮箱发处理结果邮件。

## 4. R2 创建和绑定

当前使用账号内已有、部署前为空的 `jerry` 桶，选择 Standard 存储。创建其他环境时才需要新建桶。保持桶私有，无需开启 `r2.dev` 或公开桶域名。

修改 `wrangler.jsonc`：

```json
"r2_buckets": [{ "binding": "MEDIA", "bucket_name": "jerry" }]
```

函数通过受控 `/api/media/<资源ID>` 读取图片，先检查公开状态或登录者归属。投稿和草稿图片保持私有；发布时随菜谱开放访问，下架时收回不再被其他已发布菜谱引用的照片权限。客户端缓存最多 60 秒，因此已经打开或缓存的公开照片不会被远程擦除。

图片上传前在浏览器中压缩为最长边 1600 像素，接口限制 3 MB，校验 JPEG / PNG / WebP 类型与文件签名，拒绝 SVG 和 HTML。批量导入时使用本地 Sharp 处理，避免把整库图片转换放进免费函数的请求路径。

## 5. 首次导入全部菜谱

先在本地配置 `.dev.vars`，完成两份 SQL，并登录 Wrangler。命令行需能访问 Supabase；本机部署时使用了系统已配置的 `127.0.0.1:7892` 代理，其他机器按自己的网络配置，不要照搬该端口：

```bash
npx wrangler login
npm run cloud:prepare
```

这一步不访问云端，仅在 `.cloud/import.json` 生成待导入数据。可以先检查文件中的菜谱名称、状态和数量，确认要公开哪些内容。仍含 `REPLACE-WITH-UNIQUE-ID` 的个人模板会跳过。请不要直接公开占位模板或私人照片。

确认后显式执行：

```bash
npm run cloud:import -- --apply
```

导入先上传约几十 MB 的资源，每个资源成功后写入元数据，全部资源就绪后才分批写入菜谱。首次有数百个图片文件，资源默认以 4 个并发上传（可用 `--concurrency=1` 降低并发），需要时间；失败后可用同一命令继续。每个对象使用包含内容摘要的路径，已有资源与菜谱默认跳过，不会覆盖你在线修改过的内容。需要补回手动删除的 R2 对象时可增加 `--repair-media`。

原有菜谱 ID 不变；数据库中保留上游 commit、来源链接和原始正文副本。上游新版本差异会记入 `.cloud/import-report.json`，需要人工审核采用，导入不会自动覆盖线上修改。导入后内容以数据库为准，继续编辑本地 Markdown 不会自动同步到线上。

导出菜谱和资源清单：

```bash
npm run cloud:export
npm run cloud:export -- --media
```

第二条还会通过 Wrangler 下载 R2 文件并改写 Markdown 内图片路径，适合留存可携带的正文与图片。导出目录包含草稿等私有内容，位于 `.cloud/`，不要发布到网站。此命令导出菜谱和附件，不是账号、申请和通知的完整数据库备份。

## 6. 本地联调

```bash
npm run build
npm run dev:cloud
```

打开 `http://localhost:8788`。Wrangler 加载 `.dev.vars`，函数访问其中指定的 Supabase；R2 默认使用本地模拟桶，不是生产 R2。如果已导入数据库的图片只在生产 R2，本地会显示缺图，这是本地桶未导入对应对象，并不表示生产图片丢失。

需要验证本地上传时可直接在本地桶上传自己的测试照片；不建议为此把整个生产桶设为远程可写。普通前端界面开发仍可运行 `npm run dev`；该模式没有 Worker API，会继续使用本地文件菜库。

## 7. 发布到现有 personmenu Worker

```bash
npm run build:cloud
npx wrangler deploy --dry-run --outdir .cloud/worker-check
npx wrangler deploy
```

也可运行 `npm run deploy:cloud`，它会先构建再发布。`wrangler.jsonc` 使用 `main: server/worker.ts` 和 `assets.directory: ./dist`，只有 `/api`、`/api/*` 优先进入 Worker；其余请求由 Static Assets 服务处理。Hash 路由和站点域名保持原样。

云端构建会从部署产物移除本地 `data/`、`media/`，保留许可证，线上菜谱统一来自 Supabase。源 Markdown 和本地生成目录不会删除。`public/_routes.json` 和 `functions/` 是可选 Pages 适配，当前生产使用 Worker 入口；不要运行 `wrangler pages deploy` 创建另一个站点。

敏感配置用 `wrangler secret put`，或准备仅含四个敏感字段的被忽略 JSON 文件后运行 `wrangler secret bulk .cloud/worker-secrets.json`。不要把整个 `.dev.vars` 当作 Secrets 上传，以免把公开变量也创建成同名 Secrets。Wrangler 部署默认保留已有 Secrets，公开变量以配置文件为准。

现有 Worker 已连接 GitHub 的 `LJLisgood/PersonMenu`，生产分支为 `main`。Workers Builds 中设置构建命令 **`npm run build:cloud`**、部署命令 **`npx wrangler deploy`**，Node 使用 **22.12+**（推荐 22 LTS），构建时安装 devDependencies。根目录、`server/`、`shared/`、Wrangler 配置需一起提交。手动部署能发布本机代码，但后续 Git 自动构建依赖仓库里的相同源代码，不能只保留本地更改。

首次配置阶段保持 `ALLOW_WRITES: "false"`。完成 SMTP 和验证码后在网站注册管理员邮箱、完成验证，再由 Supabase SQL 授权管理员，最后设为 `"true"` 并重新部署。预览环境应使用独立配置。

## 8. 上线检查与故障定位

1. 打开 `/api/config`，应显示 `enabled: true`，只包含项目 URL、公开 key 和 Turnstile site key，不能出现 service role、Resend key、管理员邮箱。
2. 检查首页、中文搜索、拼音搜索、食材筛选、原文与烹饪模式。
3. 用普通账号注册、邮箱验证、登录、密码重置；授权管理员后，后台能管理菜谱。
4. 游客点一餐或投稿，检查“我的申请”和管理员工作台；同一操作网络重试不应生成两份申请。
5. 检查待审照片无法被未登录浏览器读取；发布后可读；下架后该照片不再被其他已发布菜谱使用时，公开权限应收回。
6. 测试邮件失败时，申请仍存在且后台显示待发送/失败；配置正确后重试。
7. 验证两个浏览器同时编辑同一道菜时，后保存者收到版本冲突提示。
8. Worker → Observability 日志、Supabase Advisors / 数据库、Resend → Logs 分别检查函数、权限和邮件。不要把包含凭证或完整用户内容的日志粘贴到公共渠道。

常见情况：

- `线上写入暂未启用`：检查 `ALLOW_WRITES`、Production service role Secret，并重新部署。
- `公开配置无效`：检查是否把数据库连接字符串误填进 Project URL，或把 Secret / service_role / Resend key 误填进 Publishable key。接口会拒绝公开返回这些错误配置的原值。
- `请求来源不正确`：`APP_ORIGIN` 必须与浏览器当前来源一致；本地和生产值不同。
- `游客入口尚未配置完成`：检查 Turnstile 两个值和 Supabase Anonymous Sign-ins。
- 邮件失败 `missing_mail_config`：检查 Resend key、MAIL_FROM、ADMIN_EMAIL、APP_ORIGIN。
- `resend_403`：检查发件域名 Verified 状态及 API key 是否允许该域名。
- 数据服务失败：检查两份 SQL、Data API 暴露 schema / GRANT、项目是否因闲置暂停。
- 429：命中了提交或上传限频，请稍后再试。
- 免费 Worker 配额耗尽时，API 应关闭受保护操作，不能使用跳过鉴权的 fallback。静态资源通过独立的 Static Assets 托管路径提供。

本地验证命令：

```bash
npm test
npm run check
npm run build:cloud
npx wrangler deploy --dry-run --outdir .cloud/worker-check
```

数据库回归在内存 PostgreSQL 中执行真实迁移、RLS、事务和触发器；邮件与 Auth API 测试使用模拟网络。这些测试不代表你的真实域名、SMTP、浏览器邮箱回调和生产免费额度已经联调完成。

### 超过通知安全窗口后的处理

如果通知被标为待人工核对，先在 Resend Logs 按申请对应的邮件事件检查是否已经发送。已发送的记录应由管理员在 SQL Editor 修正为 `sent`，不要再触发发信。只有在确认从未发送后，才在 SQL Editor 以目标通知的 UUID 执行以下语句，然后回到工作台重试：

```sql
update app_private.notifications
set state='pending', attempts=0, locked_until=null, last_error=null, created_at=now()
where id='确认未发送的通知UUID' and state <> 'sent';
```

这一步会重新开启该通知的重试窗口；申请本身的创建时间不变。请保留核对记录，避免把未知结果当作未发送。第一版没有后台常驻邮件进程，待发送任务由首次提交和管理员重试触发。
