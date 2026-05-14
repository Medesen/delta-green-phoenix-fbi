#!/usr/bin/env python3
"""Build search_index.json from all content in the repo."""
import csv
import json
import os
import re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def parse_frontmatter(text):
    match = re.match(r'^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?', text)
    if not match:
        return {}, text
    meta = {}
    for line in match.group(1).splitlines():
        i = line.find(':')
        if i > 0:
            meta[line[:i].strip()] = line[i + 1:].strip()
    return meta, text[match.end():].strip()


def parse_tags(tag_str):
    if not tag_str:
        return []
    tags = []
    for t in tag_str.split(','):
        t = t.strip()
        if not t:
            continue
        if not t.startswith('#'):
            t = '#' + t
        tags.append(t.lower())
    return tags


def parse_session_filename(name):
    m = re.match(r'^(\d+)_session_log_(\d{4})-(\d{2})-(\d{2})\.md$', name)
    if not m:
        return name.replace('.md', '')
    return (
        f"Session {int(m.group(1))} — "
        f"{int(m.group(4))} {MONTHS[int(m.group(3)) - 1]} {m.group(2)}"
    )


def read_text(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def read_ignore(folder):
    path = os.path.join(folder, '.mediaignore')
    ignored = {'.gitkeep', '.mediaignore'}
    if os.path.exists(path):
        for line in read_text(path).splitlines():
            line = line.strip()
            if line and not line.startswith('#'):
                ignored.add(line)
    return ignored


items = []
all_tags = set()


# ── Session logs ────────────────────────────────────────────────────────────
session_dir = os.path.join(REPO_ROOT, 'assets', 'session_logs')
if os.path.isdir(session_dir):
    for fname in sorted(os.listdir(session_dir)):
        if not fname.endswith('.md'):
            continue
        meta, body = parse_frontmatter(read_text(os.path.join(session_dir, fname)))
        tags = parse_tags(meta.get('tags', ''))
        all_tags.update(tags)
        items.append({
            'type': 'session',
            'title': parse_session_filename(fname),
            'url': 'session-logs.html',
            'body': body,
            'tags': tags,
        })


# ── Dramatis personae ────────────────────────────────────────────────────────
csv_path = os.path.join(REPO_ROOT, 'assets', 'dramatis_personae', 'dramatis_personae.csv')
if os.path.exists(csv_path):
    with open(csv_path, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            tags = parse_tags(row.get('tag', ''))
            all_tags.update(tags)
            age = row.get('age', '').strip()
            title_part = row.get('title', '').strip()
            heading = row.get('name', '').strip()
            if age:
                heading += f' ({age})'
            if title_part:
                heading += f', {title_part}'
            items.append({
                'type': 'character',
                'title': heading,
                'url': 'dramatis-personae.html',
                'body': row.get('description', '').strip(),
                'tags': tags,
            })


# ── Media folders ────────────────────────────────────────────────────────────
def scan_folder(folder, page_url):
    if not os.path.isdir(folder):
        return
    ignored = read_ignore(folder)

    all_names = [n for n in os.listdir(folder) if n not in ignored and not n.startswith('.')]
    md_names = {n for n in all_names if n.endswith('.md')}
    non_md = [n for n in all_names if not n.endswith('.md') and os.path.isfile(os.path.join(folder, n))]
    subdirs = [n for n in all_names if os.path.isdir(os.path.join(folder, n))]

    # Standalone .md files (no matching media companion in this folder)
    for fname in sorted(md_names):
        base = fname[:-3]
        has_companion = any(
            not n.endswith('.md') and n[:n.rfind('.')] == base
            for n in non_md
        )
        if has_companion:
            continue
        meta, body = parse_frontmatter(read_text(os.path.join(folder, fname)))
        tags = parse_tags(meta.get('tags', ''))
        all_tags.update(tags)
        items.append({
            'type': 'media',
            'title': meta.get('caption', base),
            'url': page_url,
            'body': body,
            'tags': tags,
        })

    # Media files (non-.md)
    for fname in sorted(non_md):
        base = fname[:fname.rfind('.')]
        companion = base + '.md'
        meta = {}
        if companion in md_names:
            meta, _ = parse_frontmatter(read_text(os.path.join(folder, companion)))
        tags = parse_tags(meta.get('tags', ''))
        all_tags.update(tags)
        items.append({
            'type': 'media',
            'title': meta.get('caption', fname),
            'url': page_url,
            'body': meta.get('notes', ''),
            'tags': tags,
        })

    # Recurse into subdirectories
    for d in sorted(subdirs):
        scan_folder(os.path.join(folder, d), page_url)


scan_folder(os.path.join(REPO_ROOT, 'assets', 'handouts'), 'handouts.html')
scan_folder(os.path.join(REPO_ROOT, 'assets', 'maps'), 'maps.html')
scan_folder(os.path.join(REPO_ROOT, 'assets', 'miscellaneous'), 'miscellaneous.html')


# ── Write output ─────────────────────────────────────────────────────────────
index = {
    'items': items,
    'tags': sorted(all_tags),
}

out_path = os.path.join(REPO_ROOT, 'search_index.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(index, f, ensure_ascii=False, separators=(',', ':'))

print(f'Built index: {len(items)} items, {len(all_tags)} unique tags -> {out_path}')
