#!/usr/bin/env python3
"""把仓库打成可直接分发的安装包（tar.gz）。

解压后进目录执行 sh install.sh 即可安装，不需要编译。

    python3 tools/build-package.py
"""

import os
import sys
import tarfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG_NAME = 'luci-app-drcom'
DIST = os.path.join(ROOT, 'dist')


def read_version():
    """版本号统一取自 Makefile 的 PKG_VERSION，避免两处写死导致不一致"""
    mk = os.path.join(ROOT, 'Makefile')
    try:
        with open(mk, encoding='utf-8') as f:
            for line in f:
                if line.startswith('PKG_VERSION:='):
                    return line.split(':=', 1)[1].strip()
    except OSError:
        pass
    return '0.0.0'


VERSION = read_version()

INCLUDE = ['install.sh', 'uninstall.sh', 'Makefile', 'README.md', 'LICENSE', 'root']
EXECUTABLES = {
    'install.sh', 'uninstall.sh',
    'root/etc/init.d/drcom',
    'root/etc/hotplug.d/iface/95-drcom',
    'root/usr/sbin/drcom-portal',
    'root/usr/libexec/rpcd/drcom',
}


def main():
    out = os.path.join(DIST, '%s-%s.tar.gz' % (PKG_NAME, VERSION))
    os.makedirs(DIST, exist_ok=True)
    mtime = int(os.environ.get('SOURCE_DATE_EPOCH') or time.time())
    count = 0

    def add(path_in_repo):
        nonlocal count
        full = os.path.join(ROOT, path_in_repo)
        arc = '%s/%s' % (PKG_NAME, path_in_repo.replace(os.sep, '/'))
        if os.path.isdir(full):
            for dirpath, dirnames, filenames in os.walk(full):
                dirnames.sort()
                for fn in sorted(filenames):
                    f = os.path.join(dirpath, fn)
                    rel = os.path.relpath(f, ROOT)
                    add(rel)
            return
        info = tarfile.TarInfo(arc)
        info.size = os.path.getsize(full)
        info.mtime = mtime
        info.mode = 0o755 if path_in_repo.replace(os.sep, '/') in EXECUTABLES else 0o644
        info.uid = info.gid = 0
        info.uname = info.gname = 'root'
        with open(full, 'rb') as f:
            tar.addfile(info, f)
        count += 1

    with tarfile.open(out, 'w:gz', format=tarfile.USTAR_FORMAT) as tar:
        for item in INCLUDE:
            if os.path.exists(os.path.join(ROOT, item)):
                add(item)
            else:
                print('警告：缺少 %s，已跳过' % item, file=sys.stderr)

    print('已生成: %s' % out)
    print('  大小: %.1f KB  文件数: %d' % (os.path.getsize(out) / 1024.0, count))


if __name__ == '__main__':
    main()
