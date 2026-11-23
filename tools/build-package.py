#!/usr/bin/env python3
"""把仓库打成可直接分发的安装包（tar.gz）。

解压后进目录执行 sh install.sh 即可安装，不需要编译。

    python3 tools/build-package.py
"""

import gzip
import io
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

    # 缺文件直接失败：CI 里安静地打出一个残缺的发布包比报错危险得多
    missing = [item for item in INCLUDE if not os.path.exists(os.path.join(ROOT, item))]
    if missing:
        sys.exit('错误：缺少必需文件/目录：%s' % ', '.join(missing))

    if VERSION == '0.0.0':
        sys.exit('错误：没能从 Makefile 读到 PKG_VERSION')

    # 先写未压缩 tar 到内存，再用固定 mtime 的 gzip 压缩。
    # 直接用 tarfile 的 'w:gz' 会让 gzip 头用当前时间，产物不可复现
    # （SOURCE_DATE_EPOCH 只作用于 TarInfo.mtime，管不到 gzip 头）。
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for item in INCLUDE:
            add(item)

    with open(out, 'wb') as f:
        with gzip.GzipFile(filename='', mode='wb', fileobj=f, mtime=mtime) as gz:
            gz.write(buf.getvalue())

    print('已生成: %s' % out)
    print('  大小: %.1f KB  文件数: %d' % (os.path.getsize(out) / 1024.0, count))


if __name__ == '__main__':
    main()
