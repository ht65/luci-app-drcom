#
# luci-app-drcom —— Dr.COM 校园网 Portal 认证
#
# 仅适配 ImmortalWrt 25.12+（apk），可在 ImmortalWrt SDK 中直接编译：
#
#   cp -r luci-app-drcom <sdk>/package/
#   cd <sdk>
#   make defconfig
#   make package/luci-app-drcom/compile V=s
#
# 产物位于 <sdk>/bin/packages/*/base/luci-app-drcom-*.apk
#
include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-drcom
PKG_VERSION:=1.0.15
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=ht65

include $(INCLUDE_DIR)/package.mk

# 纯文件包，没有任何编译动作；不覆盖默认实现的话
# 构建系统会在空的 build 目录里执行 make 并报 "No targets specified"
define Build/Compile
endef

define Package/luci-app-drcom
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Dr.COM 校园网 Portal 认证
  DEPENDS:=+rpcd +nftables +kmod-nft-bridge +iw +jsonfilter +conntrack
  PKGARCH:=all
endef

define Package/luci-app-drcom/description
  路由器自动完成 Dr.COM（城市热点）校园网 Portal 认证，供接入本机的设备
  共享上网。带 LuCI 图形界面，支持断线自动重连与手动上下线。
endef

define Package/luci-app-drcom/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DIR) $(1)/usr/share/drcom
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/drcom

	$(INSTALL_BIN)  ./root/etc/init.d/drcom                        $(1)/etc/init.d/drcom
	$(INSTALL_BIN)  ./root/etc/hotplug.d/iface/95-drcom            $(1)/etc/hotplug.d/iface/95-drcom
	$(INSTALL_BIN)  ./root/usr/sbin/drcom-portal                   $(1)/usr/sbin/drcom-portal
	$(INSTALL_BIN)  ./root/usr/libexec/rpcd/drcom                  $(1)/usr/libexec/rpcd/drcom
	$(INSTALL_DATA) ./root/usr/share/drcom/config.default          $(1)/usr/share/drcom/config.default
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-drcom.json     $(1)/usr/share/luci/menu.d/luci-app-drcom.json
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-drcom.json      $(1)/usr/share/rpcd/acl.d/luci-app-drcom.json
	$(INSTALL_DATA) ./root/www/luci-static/resources/view/drcom/overview.js $(1)/www/luci-static/resources/view/drcom/overview.js
endef

# 只首次生成配置，升级时保留用户已填的账号密码
define Package/luci-app-drcom/postinst
#!/bin/sh
[ -f /etc/config/drcom ] || {
	cp /usr/share/drcom/config.default /etc/config/drcom
	chmod 600 /etc/config/drcom
}
# 升级时不要重新启用管理员手动 disable 过的服务；新装默认启用。
# 注：维护脚本会被 make 展开，shell 变量必须写成 $$VAR；
# 升级判定用 OpenWrt 通用的 PKG_UPGRADE（opkg / apk 都会在升级时设置）。
[ "$${PKG_UPGRADE:-0}" = "1" ] || /etc/init.d/drcom enable
/etc/init.d/drcom restart
/etc/init.d/rpcd restart
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
exit 0
endef

# 停止服务必须放在 prerm：postrm 执行时文件已经删掉了，/etc/init.d/drcom 不存在。
# 设备阻断是内核状态，不是包内文件，卸载/升级都必须自己清掉，否则被断的设备会一直黑洞。
define Package/luci-app-drcom/prerm
#!/bin/sh
/etc/init.d/drcom stop
/etc/init.d/drcom disable
command -v nft >/dev/null 2>&1 && nft list table bridge drcom_block >/dev/null 2>&1 && nft delete table bridge drcom_block 2>/dev/null
# 仅真正卸载时清理运行时状态；升级要保留用户的阻断名单与「已下线」标记
if [ "$${PKG_UPGRADE:-0}" != "1" ]; then
	rm -f /etc/drcom.blocked /etc/drcom.paused
fi
exit 0
endef

define Package/luci-app-drcom/postrm
#!/bin/sh
/etc/init.d/rpcd restart
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
exit 0
endef

$(eval $(call BuildPackage,luci-app-drcom))
