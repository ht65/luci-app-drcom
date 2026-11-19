#
# luci-app-drcom —— Dr.COM 校园网 Portal 认证
#
# 不依赖 luci feed，可直接在 OpenWrt / ImmortalWrt SDK 中编译：
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
PKG_VERSION:=1.0.1
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
  DEPENDS:=+rpcd
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
/etc/init.d/drcom enable
/etc/init.d/drcom restart
/etc/init.d/rpcd restart
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
exit 0
endef

# 停止服务必须放在 prerm：postrm 执行时文件已经删掉了，/etc/init.d/drcom 不存在
define Package/luci-app-drcom/prerm
#!/bin/sh
/etc/init.d/drcom stop
/etc/init.d/drcom disable
exit 0
endef

define Package/luci-app-drcom/postrm
#!/bin/sh
/etc/init.d/rpcd restart
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
exit 0
endef

$(eval $(call BuildPackage,luci-app-drcom))
