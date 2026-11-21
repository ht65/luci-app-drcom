#!/bin/sh
# luci-app-drcom 卸载脚本（在路由器上执行）
#
#   sh uninstall.sh
#
# 默认保留 /etc/config/drcom；要一并删除请加 --purge

set -e

echo "==> 停止服务"
/etc/init.d/drcom stop >/dev/null 2>&1 || true
/etc/init.d/drcom disable >/dev/null 2>&1 || true

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
# 设备阻断用的 nft 表
nft list table bridge drcom_block >/dev/null 2>&1 && nft delete table bridge drcom_block 2>/dev/null

if [ "$1" = "--purge" ]; then
	echo "==> 删除配置"
	rm -f /etc/config/drcom
fi

echo "==> 刷新 rpcd 与 LuCI 缓存"
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null

echo ""
echo "卸载完成。"
