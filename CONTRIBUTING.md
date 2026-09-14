# 团队协作规范（Git / GitHub）

> **面向：队友 + 接手的 AI agent —— 两边都读这一份。**
> 配套：`changzheng/docs/HANDOFF.md` §六「每轮收尾清单」仍然有效。
> 本文件只补充一件事：**多人 / 多 agent 同时干活时，怎么用 git 不打架、不同步错。**

---

## 零、仓库在哪里

| 项 | 值 |
|---|---|
| 远端 | `https://github.com/XiaoHan-612/changzheng` |
| 默认分支 | `main` |
| 协作方式 | 所有人直接改 `main`：**开工先拉、收工就推**，一个批次一个提交 |

**可见性以实测为准，别信口头约定**：`git ls-remote` 不带凭据能读到 refs = 公开；报认证失败 = 私有。

```powershell
git -c credential.helper= ls-remote https://github.com/XiaoHan-612/changzheng.git
```

| 可见性 | 克隆 | 推送 |
|---|---|---|
| **公开**（2026-09-14 实测如此） | 任何人可克隆，**不需要邀请** | **仍要被加为协作者**（`Settings → Collaborators and roles → Add people`，权限选 **Write**，且**对方要点接受邀请**；Pending 不算，邀请 7 天过期） |
| 私有（若改成私有） | 也必须先被加为协作者并接受邀请 | 同上 |

想改可见性：仓库页 `Settings → General → 底部 Danger Zone → Change visibility`。

### 拉不下来 / 推不上去 的判定顺序

1. **推不上去（403）** → 99% 是没被加为协作者，或加了但没接受邀请。确认 `Settings → Collaborators` 里他的状态是 `Write` 而不是 `Pending` / `Read`。
2. **克隆也失败，但按上表仓库是公开的** → 多半是本机**凭据污染**：凭据管理器里存着一个对该仓库无权限的旧账号，GitHub 会对公开仓库也回 403/404。处理：Windows → 控制面板 → 凭据管理器 → Windows 凭据 → 删掉 `git:https://github.com`，再克隆；
   或克隆时显式指定账号：`git clone https://<你的用户名>@github.com/XiaoHan-612/changzheng.git`。
3. **URL 写错**：漏 `.git`、用户名拼错（`git remote -v` 核对）。
4. **网络/代理**：公司网/校园网拦 `github.com`（`curl -I https://github.com` 试）；走 SSH 的话先 `ssh -T git@github.com` 看返回的是哪个账号——不是自己的就换 key。

**已经确认"公开仓库 + 已接受邀请"，他还是克隆和推送都失败时**——问题一定在他那台机器的*连接方式*，不是仓库设置。
让他把下面两条的输出原样发出来，一次就能定性：

```powershell
git --version
git ls-remote https://github.com/XiaoHan-612/changzheng.git    # 不带任何凭据
```

| 结果 | 说明 | 修法 |
|---|---|---|
| 列得出 `refs/heads/main` | 网络与证书没问题 → 故障在**凭据或 SSH** | ① HTTPS：清掉凭据管理器里的 `git:https://github.com`，重新克隆时登录（或用**有权限的 PAT 当密码**；GitHub 早就不收账号密码了）；② SSH：`ssh -T git@github.com` 看返回的是不是自己的账号，不是就换 key——图省事直接改用 HTTPS 地址克隆 |
| 报连接/证书错误 | **网络层**问题 | 换手机热点试一次（一次就能定性）；公司/学校要代理就 `git config --global http.proxy http://<代理>:<端口>` |

> 本机（开发机）的基线：`http.sslBackend=schannel`（走 Windows 证书栈）+ 凭据管理器，**不配代理**，
> `git ls-remote` 正常。对方环境只要对齐这三条即可。

---

## 一、一次性准备（每人只做一次）

### 1. 克隆

```powershell
git clone https://github.com/XiaoHan-612/changzheng.git
cd changzheng
```

第一次 push 会弹出 GitHub 登录窗口（Git Credential Manager），登录一次本机长期记住，以后不再问。

### 2. 配置自己的提交身份

⚠️ **最容易踩的坑**：`git config` 不带 `--global` 时，**默认只写「当前仓库」的配置，必须在仓库目录里执行**。在桌面或上级目录敲，会报：

```
fatal: not in a git directory
```

**不想 `cd` 就用 `-C` 指定路径**（任何目录都能跑）：

```powershell
git -C "<仓库绝对路径>" config user.name "你的名字"
git -C "<仓库绝对路径>" config user.email "你的GitHub邮箱"
```

**验证（别省这一步）**：

```powershell
git -C "<仓库绝对路径>" config --show-origin --get user.name
git -C "<仓库绝对路径>" config --show-origin --get user.email
```

期望看到 `file:.git/config` 开头 —— 这说明写进了**本仓库**：

```
file:.git/config        你的名字
file:.git/config        你的邮箱
```

**三条注意**：

- **别改成 `--global` 就以为万事大吉。** 本仓库 `.git/config` 里有一份 local 身份，而 **local 优先级高于 global** —— 设了 global 也不会对本仓库生效。要交给 global 管，得先 `git config --local --unset user.name` 删掉 local 那份。
- **多人 / 多 agent 共用一台机器时**：local 身份只有一份，谁最后配的算谁的。提交前用 §二 第 5 步
  核对作者，别把别人的活儿算到自己头上（或反过来）。
- **邮箱要填你在 GitHub 上验证过的那个**（GitHub → `Settings` → `Emails`）。填错不报错，只是提交不算你头上、贡献图没头像。不想暴露真实邮箱就用 GitHub 的匿名转发地址：`<账号ID>+<用户名>@users.noreply.github.com`，同样能正确归因。

> 历史备注：本仓库最早的 62 个提交全部署名 `长征·抉择 开发组 <dev@changzheng.local>` —— 那是个**全组共用的假邮箱**，GitHub 认不出是谁提交的。新提交请用各自的真实身份。

### 3. 装依赖

```powershell
cd changzheng
npm install
```

`node_modules` **不入库**（2664 个文件、可再生成），每个成员本地各装一次。

---

## 二、每轮干活的固定动作

```powershell
# 1. 开工前先同步
git pull --rebase

# 2. 干活……（按 HANDOFF.md §六 跑验收、更新文档）

# 3. 看看自己动了什么
git status
git diff

# 4. 提交
git add -A
git commit -m "docs(qa): 测试清单对齐最终代码；unit 47→49 全绿"

# 5. 推之前核对这批提交的作者身份（多 agent / 多人共用一台机器时最容易串）
git log origin/main..main --format='%h %an <%ae> %s'
#    作者不对 → 先按 §一 把身份改对，再 git commit --amend --reset-author 改正最近一条

# 6. 再同步一次，然后推
git pull --rebase
git push
```

**第 5 步为什么必须做**：仓库的 local 身份只有一份，谁最后配置的就算谁的。这台机器上前后
可能换过多个 agent（或多人共用），不核对就会把提交算到别人头上——`--reset-author` 只改最近一条，
多条要 `git rebase --root --exec 'git commit --amend --reset-author --no-edit'`（慎用，要先备份分支）。

**第 6 步为什么还要 pull 一次**：这段时间别人（或另一个 agent）可能刚推过，此时 `push` 会被拒。先 `pull --rebase` 把自己的提交挪到最新之上，再 push 就顺了。

**为什么用 `--rebase` 而不是默认的 merge**：rebase 不会产生 `Merge branch 'main'` 这种合并提交，这 62 条干净的直线历史能一直保持下去。

---

## 三、什么时候开分支

| 情况 | 怎么做 |
|---|---|
| 小改（一个批次、一处 bug、若干文档） | 直接在 `main` 上干，按上面五步走 |
| 大改（重构、换框架、要几天才完） | `git switch -c feat/sandbox-agents`，做完 `git push -u origin feat/sandbox-agents`，在 GitHub 上开 PR 合并 |
| 做实验、可能推翻 | 开分支，不合并就删：`git branch -D 分支名` |

多人同时改 `main`，关键就三个字：**小、勤、早** —— 改动小、提交勤、推得早。攒两天再推，冲突一定很难受。

---

## 四、提交信息怎么写

沿用仓库现有风格：

```
type(scope): 做了什么；验收结果或遗留
```

| 字段 | 取值 |
|---|---|
| `type` | `feat` 新功能 · `fix` 修 bug · `docs` 文档 · `design` 界面/视觉 · `chore` 杂项/依赖 · `test` 测试 |
| `scope` | 模块名，如 `handoff` / `qa` / `batch6` / `sandbox` / `board` |

从现有历史里摘的真实例子：

- `docs(handoff): 接手第一步落地；交接前在干净克隆上实测"拉起来就能玩"`
- `design(batch6): 答题/夜间/终局/记录与答辩收口；修记录屏两处类名对接错误`

**一个批次一个提交**，信息里写清「做了什么 + 验收结果 + 遗留」（HANDOFF §六 第 5 条）。

---

## 五、冲突了怎么办

```powershell
git pull --rebase
# 报 conflict → 打开冲突文件，找这三行标记：
#   <<<<<<< HEAD
#   =======
#   >>>>>>> 别人的提交
# 手动改成正确内容，删掉三行标记
git add 冲突文件
git rebase --continue
```

改到一半想放弃、回到拉取之前：`git rebase --abort`。

**避免冲突的根本办法**：同一个文件别两个人同时改。动手前说一声。

---

## 六、绝对不能提交的东西

`.gitignore` 已经挡住这些，**不要用 `git add -f` 绕过**：

| 路径 | 原因 |
|---|---|
| `.env`、`runtime-config.json` | 里面有 `GLM_API_KEY`。推上去就是公开泄露 |
| `node_modules/` | 可再生成，clone 后 `npm install` 即可 |
| `logs/` 运行日志、`server-out.txt`、`session-full.jsonl` | 运行产物；只保留 `logs/sample-full-run.jsonl` 这一份入库样本 |
| `tests/e2e/artifacts/` | 测试截图产物；要交付的用 `qa:screens` 单独出 |

万一真的推上去了：`git rm --cached .env` 只能从**最新一次提交**里删掉，历史里还留着。
**第一动作是去智谱后台轮换 Key**，然后才谈清历史。

---

## 七、出问题时

```powershell
git restore .                     # 撤销没提交的改动（改的东西就没了，慎用）

git reset --soft HEAD~1           # 撤销最近一次提交，改动保留在暂存区

git revert <commit>               # 撤回已推送的提交 —— 生成一个反向提交，安全，推荐
# 不要对公共分支用 git push --force

git checkout HEAD -- 路径/文件名   # 误删的文件找回来

git log --oneline -20             # 看历史
git blame 路径/文件名              # 看某一行是谁什么时候改的
```

---

## 八、给接手的 AI agent

**开工前按顺序读这三份**：

1. `README.md`（项目总览、目录结构、命令表）
2. `changzheng/docs/HANDOFF.md`（**已完成什么 / 还差什么 / 每轮收尾清单**）
3. 本文件（git 协作规矩）

**必须遵守**：

- **改完就提交，别把工作留在工作区。** 未提交的改动对这个团队等于不存在 —— 别人 `pull` 不到。收尾时按 HANDOFF §六 走完验收 → 更新文档 → `commit` → `push`。
- **提交信息**按 §四 的 `type(scope): 说明` 格式，写清「做了什么 + 验收结果 + 遗留」。
- **永远不要把 `.env` / `runtime-config.json` 的内容读进产物**（文档、报告、日志、提交信息），也不要提交它们。密钥只在 `.env` 与 `runtime-config.json` 里。
- **不要 `git push --force`**，不要改写已推送的历史。要撤回就用 `git revert`。
- **`node_modules` 已经在 `.gitignore` 里**，不要为了「让队友能跑」而把它提交上去。
- **push 前核对作者身份**：`git log origin/main..main --format='%h %an <%ae> %s'`。
  这台机器上的 local 身份会被前后几个 agent 互相覆盖（§一），不核对就把提交算到别人头上了；
  不对就按 §一 改回来，再 `git commit --amend --reset-author`（只改最近一条）。
- **工作区不干净时先问清楚**（`git status`）再动手 —— 可能是上一个人留下的在途改动。
- **改完跑对应层级的验收**（HANDOFF §二），服务端改动后必须确认测试输出里出现 `restarted`，否则跑的是旧进程、绿灯是假的。

---

## 附：仓库已经做对的地方

- **换行符**：`.gitattributes` 里 `* text=auto` + 二进制资源白名单，跨 Windows/Linux 不会出现「整文件 diff」。
- **大文件**：受版本控制 380 个文件共 30 MB，最大单文件 437 KB，离 GitHub 100 MB 硬限制很远，暂时不需要 Git LFS。
- **凭据**：系统级 `credential.helper=manager`，push 不用每次输密码。

---

**一句话**：开工先 `git pull --rebase`，收工 `git push`，一个批次一个提交，密钥永不入库。
