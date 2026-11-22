# luci-app-drcom

给 OpenWrt / ImmortalWrt 用的 Dr.COM（城市热点）校园网网页认证插件，带 LuCI 图形界面。

本项目基于 **重庆财经职业学院** 校园网实测开发，认证系统为 Dr.COM ePortal 4.x。本校同学直接用默认配置即可，其他学校需要修改认证门户地址。

路由器代替电脑完成 Portal 认证，接在路由器后面的设备共享同一条已认证的校园网连接，不用每台设备各自登录。

## 功能

- 界面顶部有「插件总开关」：一键停用整个插件（不再探测/认证/动上行），改用 USB CPE 等其它上行时可避免冲突
- 开机自动认证，断线自动重连（守护循环只看「现在能不能上网」，不看上次结果）
- LuCI 页面：状态卡片、上线/下线/立即重新认证、实时日志、账号与参数配置
- 界面可查看「当前连接设备」（只列在线与已阻断的设备，断开的会自动消失）：设备名称、IP、MAC、有线 / WiFi，并支持一键断开某台设备（立即切断 + 持续阻断，直到手动解除）
- 实时日志分「自动认证」和「手动操作」两类，可切换查看
- 认证失败按指数退避重试；连续失败过多会暂停自动重试并提示原因，避免把账号撞到风控
- 最近一次失败原因直接显示在界面上，不用去翻日志
- 「下线路由器」只断开本机上行，不影响同账号的手机等其他设备，且暂停状态跨重启保留
- 账号密码只存在路由器本地 `/etc/config/drcom`（权限 600）
- 上行重新拨起时只唤醒守护进程，不再整体重启服务

## 适合什么环境

### 开发环境

- 校园网：重庆财经职业学院，Dr.COM（城市热点）ePortal 4.x，认证页 `http://login.cqcfe.com/a79.htm`，认证服务器 `172.22.44.46:801`
- 固件：ImmortalWrt 25.12.2（aarch64），以无线中继方式接入校园网

### 通用判断标准

认证页形如 `http://<门户>/a79.htm`、接口属于 ePortal 4.x 的部署。本项目实测过的接口：

- 登录：`GET http://<服务器>:801/eportal/portal/login?callback=dr1003&login_method=1&user_account=,0,<账号>&user_password=<密码>&...`
- 在线列表：`GET http://<服务器>:801/eportal/portal/online_list?callback=dr1003&user_account=<账号>`
- 判定成功：返回 `"result":1`，同时用真实连通性探测复核（见下）

成功与否不看接口返回值本身，而是抓 `http://www.msftconnecttest.com/connecttest.txt` 是否等于 `Microsoft Connect Test`。未认证时这个请求会被劫持到认证页，所以区分得很干净。

## 安装

> **注意：发布包是 `.tar.gz`，不是 `.apk`。**
> 它不能扔进 LuCI 的「软件包」页面安装——那样会报 `UNTRUSTED signature` 或 `unexpected end of file`。
> 正确的用法是解压后执行 `install.sh`（方式一）。

### 方式一：直接安装（推荐，不需要编译）

在路由器上执行：

```sh
cd /tmp
wget -O drcom.tar.gz https://github.com/ht65/luci-app-drcom/releases/download/v1.0.2/luci-app-drcom-1.0.2.tar.gz
tar -xzf drcom.tar.gz
cd luci-app-drcom
sh install.sh
```

> 每个 Release 挂两个文件，文件名带版本号：`luci-app-drcom-<版本>.tar.gz` 和 `luci-app-drcom-<版本>-r1.apk`。
> 上面链接里的版本号是本文档更新时的最新版，下载前请到 [Releases](https://github.com/ht65/luci-app-drcom/releases)
> 确认实际版本（apk 同理）。

装完打开 LuCI：**服务 → Dr.COM 认证**，填账号密码，保存。

已存在的 `/etc/config/drcom` 不会被覆盖，升级不会丢账号。

### 方式二：安装 apk（推荐给想用包管理器的）

ImmortalWrt 25.12 起包管理器换成了 apk-tools 3，安装包是带签名的 v3 格式（二进制 ADB 容器），只能在 Linux 环境用 SDK 编译产出，手工打包不可行。

本仓库配置了 GitHub Actions，每次推送 `v*` 标签会自动用 ImmortalWrt 25.12.2 SDK 编译出 apk 并附加到 Release。到 [Releases](https://github.com/ht65/luci-app-drcom/releases) 下载 `luci-app-drcom-<版本>-r1.apk`（当前为 `luci-app-drcom-1.0.2-r1.apk`），然后在路由器上：

```sh
apk add --allow-untrusted ./luci-app-drcom-1.0.2-r1.apk
```

用 apk 安装的好处是：它会正常出现在 LuCI 的「软件包」列表里，也能用 `apk del luci-app-drcom` 卸载。

注意两点：

- 自行构建的包没有官方密钥签名，**必须**加 `--allow-untrusted`。
- LuCI「软件包」页面上传安装时执行的是 `apk add /tmp/upload.apk`，**不带**这个参数，所以在那里会报 `UNTRUSTED signature`。请用命令行安装，或先把签名公钥放进 `/etc/apk/keys/`。

### 方式三：自己用 SDK 编译

需要一台 Linux 机器（或 WSL / Docker）：

```sh
# 下载与固件同版本的 SDK，解压后把本仓库放进 package/
cp -r luci-app-drcom <sdk>/package/
cd <sdk>
make defconfig
make package/luci-app-drcom/compile V=s
# 产物：bin/packages/*/base/luci-app-drcom-*.apk
```

`Makefile` 不依赖 luci feed，只依赖 `rpcd`，包架构为 `all`。

## 配置项

LuCI 页面里都能改，也可以直接改 `/etc/config/drcom`：

| 选项 | 说明 |
| --- | --- |
| `username` / `password` | 校园网账号密码 |
| `carrier` | 运营商后缀：校园移动/校园用户留空，电信 `@dx`，联通 `@lt` |
| `terminal_type` | 上报的终端类型：`1`PC（默认） `2`手机 |
| `uplink` | 上行接口，`auto` 自动在无线中继 `wwan` 和有线 `wan` 之间选已获取 IP 的那个 |
| `portal_host` / `portal_ip` / `portal_port` | 认证门户，默认值为重庆财经职业学院的 `login.cqcfe.com` / `172.22.44.46:801`，**换学校必须改** |
| `check_interval` | 在线检测间隔（秒），越大越省流量，越小掉线恢复越快 |
| `retry_interval` | 首次重试间隔（秒）；连续失败时按指数退避逐次拉长 |
| `retry_max_interval` | 退避上限（秒），默认 `300` |
| `fail_max` | 连续失败达到该次数后暂停自动重试，默认 `5`，避免账号被风控 |

改完点「保存并应用」，最多 60 秒自动生效；要立刻生效点「重启服务」。

## 发版流程

```sh
# 1) 先在 CHANGELOG.md 里加一段：## vX.Y.Z — YYYY-MM-DD（写清楚「新增」与「修复」）
# 2) 同步改 Makefile 的 PKG_VERSION（构建产物名取自这里）
# 3) 提交并推 main
git tag -a vX.Y.Z -m "vX.Y.Z: 一句话概括"
git push origin vX.Y.Z
```

CI 会把 `CHANGELOG.md` 里对应版本的段落**作为 Release 说明**发出去；找不到该段落会让构建直接失败，
所以不存在「发了版却没有改动说明」的情况。Release 只挂两个带版本号的文件。

## 已知限制

这些是实测出来的行为，不是 bug：

1. **一个账号通常只允许 1 台 PC + 1 台移动终端。** 路由器会占掉一个槽位（`terminal_type` 默认 `1`，即 PC 槽）。接在路由器后面的电脑走 NAT，不额外占槽；手机若直连校园网则占移动终端槽，两者可以共存。
2. **注销接口在这个部署里是空转的。** 返回「注销成功」但在线会话并不会消失，所以要真正下线只能断开上行——这就是「下线路由器」按钮做的事。
3. **部分校园网有无感知认证。** 上行重新连上后会由 AC 自动完成认证，不经过本插件的登录请求。这意味着下线期间不要重新连上上行，否则可能自动回到在线状态。
4. **「下线路由器」会连带断开路由器后面的设备上网**，这是「下线」的应有之义；WiFi 本身不断，随时可以回页面点上线。暂停标记存在 `/etc/drcom.paused`，重启路由器后仍保持暂停，需要点「上线」才会恢复。
5. **连续失败会自动暂停重试。** 达到 `fail_max`（默认 5）次后守护不再自动登录，界面会显示最近一次失败原因。改好账号 / 密码 / 运营商后缀后点「立即重新认证」即可恢复；如果网络自己恢复了（例如无感知认证重新生效），守护也会自动解除暂停。
6. **「断开」某台设备靠两个动作**：清掉它的 conntrack（已建立的连接立刻失效，硬件转发开着也一样）+ 用 nft 阻断它的单播帧。阻断**一直持续到你点「解除」或关闭插件总开关**（关插件会解除全部阻断）；名单存在 `/etc/drcom.blocked`，重启路由器后仍生效。依赖 `conntrack` 小工具（apk 安装会自动带上；用 `install.sh` 手动装需要自己 `apk add conntrack`，否则旧连接不会立刻断）。
7. **设备列表约 6 秒刷新一次**（后台定时探测并写缓存，界面读缓存），所以插拔网线后几秒内就能看到变化，打开页面也不用等探测。
8. **依赖几个系统组件**：`conntrack`（切断旧连接，apk 安装会自动带上）、`iw`（识别无线设备）、以及内核的 nft **bridge 家族支持**（设备阻断）。若固件缺 bridge 支持，界面会明确提示「阻断不可用」并写日志，不会静默失败；缺 `iw` 时所有设备会按「有线」显示。

## 命令行

```sh
/usr/sbin/drcom-portal status    # 查看状态、最近一次失败原因与连通性
/usr/sbin/drcom-portal login     # 立即重新认证（已在线时不会重复登录）
/usr/sbin/drcom-portal online    # 拉起上行并解除暂停
/usr/sbin/drcom-portal offline   # 断开上行并暂停自动认证
logread | grep drcom             # 看日志
```

## 卸载

```sh
cd /tmp/luci-app-drcom
sh uninstall.sh           # 保留 /etc/config/drcom
sh uninstall.sh --purge   # 连配置一起删
```

## 文件说明

```
root/etc/init.d/drcom                         procd 服务，开机自启
root/etc/hotplug.d/iface/95-drcom             上行 ifup 时重新认证
root/usr/sbin/drcom-portal                    认证客户端
root/usr/libexec/rpcd/drcom                   LuCI 后端（ubus 接口）
root/usr/share/luci/menu.d/                   菜单注册
root/usr/share/rpcd/acl.d/                    权限声明
root/www/luci-static/resources/view/drcom/    前端页面
root/usr/share/drcom/config.default           默认配置模板
```

## 免责声明

仅供学习与个人使用。使用前请确认你的学校允许通过路由器共享网络，并自行承担账号相关的风险。本项目不修改也不规避校园网的计费与认证机制，只是把网页登录这一步自动化。

## License

MIT
