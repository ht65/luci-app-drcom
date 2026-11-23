#!/bin/sh
# luci-app-drcom 卸载脚本（在路由器上执行）
#
#   sh uninstall.sh
#
# 默认保留 /etc/config/drcom；要一并删除请加 --purge

set -e

[ "$(id -u)" = "0" ] || { echo "错误：需要 root 权限"; exit 1; }

echo "==> 停止服务"
/etc/init.d/drcom stop >/dev/null 2>&1 || true
/etc/init.d/drcom disable >/dev/null 2>&1 || true

# procd 的 stop 是异步的：实例可能在 TERM 之后还阻塞在当前子进程里（devprobe / wget），
# 所以这里等一个有限的时间，确保文件删掉之后不会还留着一个 devwatch 在后台跑。
i=0
while [ "$i" -lt 15 ] && pgrep -f 'drcom-portal (watch|devwatch)' >/dev/null 2>&1; do
	sleep 1
	i=$((i + 1))
done
if pgrep -f 'drcom-portal (watch|devwatch)' >/dev/null 2>&1; then
	echo "    警告：仍有 drcom-portal 进程未退出，可稍后手动 kill"
fi

echo "==> 删除文件"
rm -f /etc/init.d/drcom \
      /etc/hotplug.d/iface/95-drcom \
      /usr/sbin/drcom-portal \
      /usr/libexec/rpcd/drcom \
      /usr/share/luci/menu.d/luci-app-drcom.json \
      /usr/share/rpcd/acl.d/luci-app-drcom.json \
      /www/luci-static/resources/view/drcom/overview.js
rm -rf /www/luci-static/resources/view/drcom /usr/share/drcom

echo "==> 清理运行时状态"
# 暂停标记在 /etc 下，不清掉的话下次装回来会仍然处于「已下线」状态
rm -rf /var/run/drcom
rm -f /etc/drcom.paused
rm -f /etc/drcom.blocked
# 设备阻断用的 nft 表（内核状态，不属于任何文件，必须主动删）
if command -v nft >/dev/null 2>&1; then
	nft list table bridge drcom_block >/dev/null 2>&1 && nft delete table bridge drcom_block 2>/dev/null
fi

if [ "$1" = "--purge" ]; then
	echo "==> 删除配置"
	rm -f /etc/config/drcom
fi

echo "==> 刷新 rpcd 与 LuCI 缓存"
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null

echo ""
echo "卸载完成。"
