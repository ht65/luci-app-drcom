#!/usr/bin/env python3
"""从 CHANGELOG.md 里取出指定版本的段落，供 GitHub Release 说明使用。

用法：
    python3 tools/changelog-section.py v1.0.2 > notes.md
    python3 tools/changelog-section.py 1.0.2

找不到对应段落时以退出码 1 结束（CI 里会因此失败，逼着发版前补说明）。
"""

import pathlib
import re
import sys


def main():
    # 统一按 UTF-8 输出，免得在非 UTF-8 终端（例如 Windows 控制台）上编码出错
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

    if len(sys.argv) < 2:
        sys.exit('用法: changelog-section.py <版本或标签，如 v1.0.2>')

    tag = sys.argv[1].strip()
    version = tag[1:] if tag.startswith('v') else tag

    root = pathlib.Path(__file__).resolve().parent.parent
    changelog = root / 'CHANGELOG.md'
    if not changelog.is_file():
        sys.exit('找不到 CHANGELOG.md')

    text = changelog.read_text(encoding='utf-8')

    # 每个版本以 "## vX.Y.Z — 日期" 开头
    for block in re.split(r'^##\s+', text, flags=re.M)[1:]:
        header, _, body = block.partition('\n')
        # 容忍 "v1.0.2" / "[v1.0.2]" / "1.0.2" 等标题写法
        m = re.match(r'\[?v?(\d[\w.\-]*)\]?', header.strip())
        if m and m.group(1) == version:
            # 去掉段落末尾用于分隔下一版的那条 ---（Release 正文里不需要）
            body = re.sub(r'\s*\n-{3,}\s*$', '', body.strip()).strip()
            if not body:
                sys.exit('CHANGELOG.md 里 v%s 的段落是空的' % version)
            print(body)
            return

    sys.exit('CHANGELOG.md 里缺少 v%s 的段落，发版前必须补上' % version)


if __name__ == '__main__':
    main()
