# luci-app-drcom

给 **ImmortalWrt 25.12 及以后（apk 包管理）** 用的 Dr.COM（城市热点）校园网网页认证插件，带 LuCI 图形界面。

路由器代替电脑完成 Portal 认证，接在路由器后面的设备共享同一条已认证的校园网连接，不用每台设备各自登录。

本项目基于 **重庆财经职业学院** 校园网实测开发，认证系统为 Dr.COM ePortal 4.x。本校同学直接用默认配置即可，其他学校需要修改认证门户地址。

> **适配范围：只适配 ImmortalWrt 25.12+（apk-tools 3）。**
> 不再支持 OpenWrt 上游、opkg/ipk 包管理（含 ImmortalWrt 24.10 及更早）。
>
> **签名策略：从 v1.0.15 起，每个 Release 的 apk 都用本项目密钥签名，公钥 `drcom.pem` 随 Release 发布。**
> **第一次安装**需要把公钥加到路由器一次（见下方「签名与公钥」）；**以后升级**不需要再加，直接安装即可。

## 签名与公钥（第一次安装必读）

### 为什么需要

apk 会强制校验包签名：没有签名、或公钥不被路由器认识的包，会被拒绝并报 `UNTRUSTED signature`——命令行 `apk add` 和 LuCI「软件包 → 上传包」都一样。  
给包签名、并让路由器认识对应公钥之后，安装就变成普通的软件包安装：

- 命令行：`apk add ./luci-app-drcom-x.y.z-r1.apk`，**不需要** `--allow-untrusted`
- LuCI：**系统 → 软件 → 上传包**，选 apk 直接装（以前这里会报 UNTRUSTED）

### 公钥和私钥是什么

- **公钥**（`drcom.pem`）：公开的「验章样本」，随 Release 发布。放一份在路由器的 `/etc/apk/keys/` 里，路由器就能验证本项目签的包。
- **私钥**：只在发布者手里（存放在 GitHub Actions Secret），不会发布、也不会随包分发。
- 所有后续版本都用**同一把密钥签名**，所以公钥**只需加一次**；只有换密钥时才需要重新加。

### 第一次安装：加一次公钥

下面两种方式任选一种，只需做一次。

**方法 A：路由器能访问 GitHub（推荐）**

SSH 登录路由器执行：

```sh
mkdir -p /etc/apk/keys
wget -O /etc/apk/keys/drcom.pem \
  https://github.com/ht65/luci-app-drcom/releases/latest/download/drcom.pem
chmod 644 /etc/apk/keys/drcom.pem

# 固件升级后仍保留这把公钥
echo '/etc/apk/keys/drcom.pem' >> /etc/sysupgrade.conf
```

**方法 B：电脑上下载，再传到路由器**

若路由器访问 GitHub 不方便（校园网常见），在电脑上操作：

```powershell
# 1) 电脑上下载公钥（走系统代理也可以加：-x http://127.0.0.1:7890）
curl.exe -L -o drcom.pem `
  https://github.com/ht65/luci-app-drcom/releases/latest/download/drcom.pem

# 2) 传到路由器（ImmortalWrt 的 SSH 没有 sftp-server，scp 必须加 -O）
scp -O .\drcom.pem root@192.168.1.1:/tmp/
```

然后 SSH 登录路由器：

```sh
mkdir -p /etc/apk/keys
cp /tmp/drcom.pem /etc/apk/keys/drcom.pem
chmod 644 /etc/apk/keys/drcom.pem
rm -f /tmp/drcom.pem
echo '/etc/apk/keys/drcom.pem' >> /etc/sysupgrade.conf
```

**验证公钥是否生效**

下载任意一个已签名的 apk（例如当前最新版），执行：

```sh
apk verify /tmp/luci-app-drcom-1.0.15-r1.apk
# 期望输出：/tmp/luci-app-drcom-1.0.15-r1.apk: OK
```

输出 `OK` 说明公钥已就位；输出 `UNTRUSTED signature` 说明公钥没放对，检查 `/etc/apk/keys/`。

> 公钥是公开的「验章样本」，不是密码，可以随便转发；私钥才是要保密的东西。

### 以后升级

公钥加过一次之后，**以后每个版本都不用再操作**：

```sh
apk add /tmp/luci-app-drcom-<新版本>-r1.apk
```

或者直接在 LuCI：**系统 → 软件 → 上传包**，选新版本 apk 安装。  
已存在的 `/etc/config/drcom` 不会被覆盖。

### 如果暂时不想加公钥

仍可以用 `--allow-untrusted` 兜底安装：

```sh
apk add --allow-untrusted /tmp/luci-app-drcom-<版本>-r1.apk
```

但这种方式下 **LuCI 网页上传仍然装不了**（它内部执行 `apk add`，不带这个参数）。所以建议还是加上公钥。

## 适配范围与测试环境

- 固件：**ImmortalWrt 25.12.2**（aarch64），Cudy TR3000 v1（mediatek/filogic）
- 包管理：**apk-tools 3**（`.apk` v3 格式，带签名）
- 接入方式：无线中继 `wwan` 作为上行
- 校园网：Dr.COM ePortal 4.x，认证页 `http://login.cqcfe.com/a79.htm`，认证服务器 `172.22.44.46:801`

已在上述设备上完成实机验证：安装/升级、签名校验、在线状态、设备列表、断开/解除、总开关、上下线、卸载脚本等全部通过。

### 通用判断标准

认证页形如 `http://<门户>/a79.htm`、接口属于 ePortal 4.x 的部署。本项目实测过的接口：

- 登录：`GET http://<服务器>:801/eportal/portal/login?callback=dr1003&login_method=1&user_account=,0,<账号>&user_password=<密码>&...`
- 在线列表：`GET http://<服务器>:801/eportal/portal/online_list?callback=dr1003&user_account=<账号>`
- 判定成功：返回 `"result":1`，同时用真实连通性探测复核

成功与否不只看接口返回值，还要抓 `http://www.msftconnecttest.com/connecttest.txt` 是否等于 `Microsoft Connect Test`（这两个地址都可以在界面里改）。未认证时这个请求会被劫持到认证页，所以区分得很干净。

## 功能

### 认证与重连

- 开机自动认证，断线自动重连（守护循环只看「现在能不能上网」，不看上次结果）
- 认证失败按指数退避重试；连续失败达到上限会自动暂停并显示原因，避免账号被风控
- 「立即重新认证」只重新认证一次，不重拨接口，已在线时不会重复登录
- 「下线路由器」只断开本机上行，不影响同账号的手机等其他设备；暂停状态写在 `/etc/drcom.paused`，跨重启保留
- 上行重新拨起（`ifup`）时只唤醒守护进程，不整体重启服务
- 双上行（`wwan` + `wan` 都有 IP）时，按当前默认路由的源地址填 `wlan_user_ip`，避免 ePortal 报「IP 不一致」
- 连通性检测的 URL 和期望内容可在界面配置，换学校/门户劫持方式不同也能适配

### 设备管理

- 「当前连接设备」列表：设备名称、IP、MAC、有线 / WiFi；只列在线与已阻断的设备，断开的会自动消失
- 后台每几秒探测一次并写缓存，界面直接读缓存，插拔网线几秒内可见，打开页面不用等探测
- 「断开」某台设备：清掉 conntrack（已建立连接立即失效，硬件转发开着也有效）+ 用 nft 阻断它的单播帧
- 阻断**一直持续到点「解除」或关闭插件总开关**；名单存在 `/etc/drcom.blocked`，重启后仍生效
- 阻断/解除会校验 nft 是否真的下发成功，失败会明确报错，不谎报

### 安全与稳定性

- 登录密码尽量不进入进程命令行：优先用 GNU wget 的 `-i` 或 `curl -K <0600 配置文件>`；两者都不可用时退回 BusyBox wget 并写一次性日志提示
- 账号密码只存在路由器本地 `/etc/config/drcom`（权限 600）；状态目录 700；日志临时文件也放在该目录
- 状态文件、登录响应、日志临时文件均按 PID 命名，避免并发互相覆盖
- procd 停机超时放宽到 20 秒，停止/重启时守护能正常退出并刷新状态，不残留 `watch.pid`
- 卸载（`apk del` 或 `uninstall.sh`）会清理内核里的 nft 阻断表与 `/etc` 下的运行时状态，不留「被断设备一直黑洞」的残留
- 设备存活判定优先读 pidfile 并核对 `/proc/<pid>/cmdline`，避免 PID 复用误唤醒无关进程
- 界面轮询会注销旧回调、设备列表内容不变时不重建 DOM，避免 LuCI 页面越用越卡
- **包签名**：Release 的 apk 均由 CI 用固定密钥签名，构建阶段会用 `apk verify` 兜底校验，签名缺失/校验失败不会发版

### 界面

- 插件总开关：一键停用整个插件（不再探测、认证、动上行），改用 USB CPE 等其它上行时可避免冲突
- 状态卡片：运行状态、上行接口、本机 IP、认证账号、终端类型、认证服务器、状态更新时间、最近错误
- 手动操作：上线、立即重新认证、下线路由器、重启服务
- 实时日志分「自动认证」和「手动操作」两类，可切换查看
- 最近一次失败原因与连续失败次数直接显示在界面上
- 状态读取失败时会禁用总开关按钮，避免误操作

## 安装

> 下面默认你已经按「签名与公钥」加过公钥；没加的请先加，或者在命令里保留 `--allow-untrusted`。

### 方式一：安装 apk（推荐，能用 `apk del` 卸载）

到 [Releases](https://github.com/ht65/luci-app-drcom/releases) 下载 `luci-app-drcom-<版本>-r1.apk`（当前为 `luci-app-drcom-1.0.15-r1.apk`）。

在电脑上下载后传到路由器（ImmortalWrt 的 SSH 没有 sftp-server，`scp` 要加 `-O`）：

```powershell
scp -O .\luci-app-drcom-1.0.15-r1.apk root@192.168.1.1:/tmp/
```

在路由器上安装：

```sh
apk add /tmp/luci-app-drcom-1.0.15-r1.apk

# 想先验一下签名也可以：
apk verify /tmp/luci-app-drcom-1.0.15-r1.apk

apk list -I | grep -i drcom
ubus call drcom status

rm -f /tmp/luci-app-drcom-1.0.15-r1.apk
```

**或者用 LuCI 安装**（加过公钥后可用）：系统 → 软件 → 上传包 → 选择 `.apk` → 安装。

升级时重复执行 `apk add ...` 或再上传一次即可；已存在的 `/etc/config/drcom` 不会被覆盖。

### 方式二：解压 tar.gz 执行 install.sh

```sh
cd /tmp
wget -O drcom.tar.gz https://github.com/ht65/luci-app-drcom/releases/download/v1.0.15/luci-app-drcom-1.0.15.tar.gz
tar -xzf drcom.tar.gz
cd luci-app-drcom
sh install.sh
```

也可以从电脑下载后 `scp -O` 传上去再解压。两种安装方式都保留 `/etc/config/drcom`。

### 方式三：自己用 ImmortalWrt SDK 编译

需要一台 Linux 机器（或 WSL / Docker），使用与固件同版本的 **ImmortalWrt 25.12.x SDK**：

```sh
cp -r luci-app-drcom <sdk>/package/
cd <sdk>
make defconfig
make package/luci-app-drcom/compile V=s
# 产物：bin/packages/*/base/luci-app-drcom-*.apk
```

`Makefile` 不依赖 luci feed，只依赖 `rpcd` 等基础包，包架构为 `all`（noarch）。

### 装完

打开 LuCI：**服务 → Dr.COM 认证**，填账号密码，保存。改完点「保存并应用」，在下一轮在线检测时生效；要立刻生效点「重启服务」。

## 配置项

LuCI 页面里都能改，也可以直接改 `/etc/config/drcom`：

| 选项 | 说明 |
| --- | --- |
| `enabled` | 插件总开关：`1` 启用 / `0` 停用（停用后不探测、不认证、不动上行） |
| `username` / `password` | 校园网账号密码 |
| `carrier` | 运营商后缀：校园移动/校园用户留空，电信 `@dx`，联通 `@lt` |
| `terminal_type` | 上报的终端类型：`1` PC（默认） `2` 手机 |
| `uplink` | 上行接口，`auto` 自动在无线中继 `wwan` 和有线 `wan` 之间选已获取 IP 的那个 |
| `portal_host` / `portal_ip` / `portal_port` | 认证门户，默认值为重庆财经职业学院的 `login.cqcfe.com` / `172.22.44.46:801`，**换学校必须改** |
| `probe_url` / `probe_expect` | 连通性检测地址与期望内容，默认 `http://www.msftconnecttest.com/connecttest.txt` / `Microsoft Connect Test` |
| `check_interval` | 在线检测间隔（秒），越大越省流量，越小掉线恢复越快 |
| `retry_interval` | 首次重试间隔（秒）；连续失败时按指数退避逐次拉长 |
| `retry_max_interval` | 退避上限（秒），默认 `300` |
| `fail_max` | 连续失败达到该次数后暂停自动重试，默认 `5`，避免账号被风控 |

## 发版流程

```sh
# 1) 先在 CHANGELOG.md 里加一段：## vX.Y.Z — YYYY-MM-DD（写清楚「新增」与「修复」）
# 2) 同步改 Makefile 的 PKG_VERSION（构建产物名取自这里）
# 3) 提交并推 main
git tag -a vX.Y.Z -m "vX.Y.Z: 一句话概括"
git push origin vX.Y.Z
```

CI 使用 ImmortalWrt 25.12.2 SDK 编译 apk，并用 `APK_SIGNING_KEY`（GitHub Actions Secret）给 apk 签名、用 `apk verify` 校验；签名缺失或校验失败会让构建直接失败。

**从 v1.0.15 起，每个 Release 都会签名，公钥固定不变**，所以用户加过一次公钥后不需要再重复操作。Release 说明取自 `CHANGELOG.md` 对应段落；Release 挂带版本号的 `.apk`、`.tar.gz` 和公钥 `drcom.pem` 三个文件。

## 已知限制

这些是实测出来的行为，不是 bug：

1. **一个账号通常只允许 1 台 PC + 1 台移动终端。** 路由器会占掉一个槽位（`terminal_type` 默认 `1`，即 PC 槽）。接在路由器后面的电脑走 NAT，不额外占槽；手机若直连校园网则占移动终端槽，两者可以共存。
2. **注销接口在这个部署里是空转的。** 返回「注销成功」但在线会话并不会消失，所以要真正下线只能断开上行——这就是「下线路由器」按钮做的事。
3. **部分校园网有无感知认证。** 上行重新连上后会由 AC 自动完成认证，不经过本插件的登录请求。这意味着下线期间不要重新连上上行，否则可能自动回到在线状态。
4. **「下线路由器」会连带断开路由器后面的设备上网**，这是「下线」的应有之义；WiFi 本身不断，随时可以回页面点上线。暂停标记存在 `/etc/drcom.paused`，重启路由器后仍保持暂停，需要点「上线」才会恢复。
5. **连续失败会自动暂停重试。** 达到 `fail_max`（默认 5）次后守护不再自动登录，界面会显示最近一次失败原因。改好账号 / 密码 / 运营商后缀后点「立即重新认证」即可恢复；如果网络自己恢复了（例如无感知认证重新生效），守护也会自动解除暂停。
6. **「断开」某台设备靠两个动作**：清掉它的 conntrack（已建立的连接立刻失效，硬件转发开着也一样）+ 用 nft 阻断它的单播帧。阻断**一直持续到你点「解除」或关闭插件总开关**（关插件会解除全部阻断）；名单存在 `/etc/drcom.blocked`，重启路由器后仍生效。依赖 `conntrack` 小工具（apk 安装会自动带上；用 `install.sh` 手动装需要自己 `apk add conntrack`，否则旧连接不会立刻断）。
7. **设备列表约几秒刷新一次**（后台定时探测并写缓存，界面读缓存），所以插拔网线后几秒内就能看到变化，打开页面也不用等探测。
8. **依赖几个系统组件**：`conntrack`（切断旧连接）、`iw`（识别无线设备）、`nftables`（设备阻断）、内核 nft **bridge 家族支持**、`jsonfilter`。缺 bridge 支持时界面会明确提示「阻断不可用」并写日志；缺 `iw` 时所有设备按「有线」显示。
9. **登录密码在进程命令行里的可见性**：认证 URL 本身带明文密码。插件会优先用「从文件读 URL」的客户端避开这一点——GNU wget 的 `-i`，或 `curl -K` 配置文件；两者都没有时（默认的 BusyBox wget / uclient-fetch 就没有 `-i`）只能退回把 URL 直接交给 wget，此时密码会出现在 `ps` / `/proc/<pid>/cmdline` 里，插件会写一次性日志提示。介意的话执行 `apk add curl` 即可。
10. **apk 需要先加公钥**：Release 的 apk 已用本项目密钥签名，公钥 `drcom.pem` 随 Release 发布。第一次安装要把公钥放进 `/etc/apk/keys/`（一次），之后 `apk add` 与 LuCI 上传都能直接安装；未加公钥时仍可用 `--allow-untrusted` 兜底（但 LuCI 上传不可用）。公钥建议写入 `/etc/sysupgrade.conf`，避免固件升级后丢失。
11. **只适配 ImmortalWrt 25.12+（apk）**：OpenWrt 上游、opkg/ipk（ImmortalWrt 24.10 及更早）不在支持范围内；旧版系统请自行改 Makefile/安装方式，不保证可用。

## 命令行

```sh
/usr/sbin/drcom-portal status    # 查看状态、最近一次失败原因与连通性
/usr/sbin/drcom-portal login     # 立即重新认证（已在线时不会重复登录）
/usr/sbin/drcom-portal online    # 拉起上行并解除暂停
/usr/sbin/drcom-portal offline   # 断开上行并暂停自动认证
logread -e drcom | tail -n 30    # 看日志
```

## 卸载

用 apk 安装的：

```sh
apk del luci-app-drcom        # 删除程序（保留 /etc/config/drcom）
rm -f /etc/config/drcom       # 想连配置一起删再加这句
```

用 `install.sh` 安装的：

```sh
cd /tmp/luci-app-drcom
sh uninstall.sh           # 保留 /etc/config/drcom
sh uninstall.sh --purge   # 连配置一起删
```

两种方式都会清理 `/etc/drcom.paused`、`/etc/drcom.blocked`、`/var/run/drcom` 和内核里的 `nft` 阻断表。

## 文件说明

```
root/etc/init.d/drcom                         procd 服务，开机自启
root/etc/hotplug.d/iface/95-drcom             上行 ifup 时唤醒守护
root/usr/sbin/drcom-portal                    认证客户端（守护 / 手动命令）
root/usr/libexec/rpcd/drcom                   LuCI 后端（ubus 接口）
root/usr/share/luci/menu.d/                   菜单注册
root/usr/share/rpcd/acl.d/                    权限声明
root/www/luci-static/resources/view/drcom/    前端页面
root/usr/share/drcom/config.default           默认配置模板
keys/drcom.pem                                签名公钥（发布用，可公开）
```

## 免责声明

仅供学习与个人使用。使用前请确认你的学校允许通过路由器共享网络，并自行承担账号相关的风险。本项目不修改也不规避校园网的计费与认证机制，只是把网页登录这一步自动化。

## License

MIT