#!/bin/sh
# luci-app-drcom 安装脚本（在路由器上执行）
#
#   sh install.sh
#
# 已存在的 /etc/config/drcom 不会被覆盖，升级不会丢账号密码。

set -e

BASE_DIR=$(cd "$(dirname "$0")" && pwd)
SRC="$BASE_DIR/root"

[ -d "$SRC" ] || { echo "错误：找不到 root/ 目录，请在解压后的目录里执行"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "错误：需要 root 权限"; exit 1; }

echo "==> 安装文件"
cp -rf "$SRC"/. / || { echo "错误：复制文件失败"; exit 1; }

chmod 755 /etc/init.d/drcom \
          /etc/hotplug.d/iface/95-drcom \
          /usr/sbin/drcom-portal \
          /usr/libexec/rpcd/drcom \
  || { echo "错误：设置可执行权限失败"; exit 1; }

chmod 644 /usr/share/drcom/config.default \
          /usr/share/luci/menu.d/luci-app-drcom.json \
          /usr/share/rpcd/acl.d/luci-app-drcom.json \
          /www/luci-static/resources/view/drcom/overview.js \
  || { echo "错误：设置文件权限失败"; exit 1; }

echo "==> 初始化配置"
if [ -f /etc/config/drcom ]; then
	echo "    /etc/config/drcom 已存在，保留原有设置"
else
	cp /usr/share/drcom/config.default /etc/config/drcom
	chmod 600 /etc/config/drcom
	echo "    已生成默认配置"
fi

echo "==> 检查可选依赖"
for c in nft conntrack iw; do
	command -v "$c" >/dev/null 2>&1 || \
		echo "    提示：未找到 $c，相关功能（设备阻断 / 无线识别）可能不可用，可执行 apk add $c"
done

echo "==> 注册服务"
/etc/init.d/drcom enable >/dev/null 2>&1 || echo "    警告：服务自启注册失败"
/etc/init.d/drcom restart >/dev/null 2>&1 || echo "    警告：服务启动失败，请检查 /etc/config/drcom"

echo "==> 刷新 LuCI 与 rpcd"
/etc/init.d/rpcd restart >/dev/null 2>&1 || echo "    警告：rpcd 重启失败，界面可能暂时不可用，重启路由器即可"
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null

echo ""
echo "安装完成。"
echo "请打开 LuCI：服务 -> Dr.COM 认证，填写账号密码后保存。"
echo "命令行：/usr/sbin/drcom-portal status"
