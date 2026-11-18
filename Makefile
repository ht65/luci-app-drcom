#
# luci-app-drcom —— Dr.COM 校园网 Portal 认证
#
# 该 Makefile 用于在 OpenWrt / ImmortalWrt SDK 中编译出正式安装包（.apk）。
# 使用步骤见 README 的「用 SDK 编译安装包」一节。
#
include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-drcom
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT

LUCI_TITLE:=Dr.COM 校园网 Portal 认证
LUCI_DEPENDS:=+rpcd
LUCI_PKGARCH:=all

define Package/luci-app-drcom/postinst
#!/bin/sh
[ -f /etc/config/drcom ] || {
	cp /usr/share/drcom/config.default /etc/config/drcom
	chmod 600 /etc/config/drcom
}
/etc/init.d/drcom enable
/etc/init.d/drcom restart
/etc/init.d/rpcd restart
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
exit 0
endef

define Package/luci-app-drcom/postrm
#!/bin/sh
/etc/init.d/drcom stop
/etc/init.d/drcom disable
/etc/init.d/rpcd restart
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
