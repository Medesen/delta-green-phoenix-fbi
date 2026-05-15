#!/usr/bin/env python3
"""Build search_index.json from all content in the repo."""
import csv
import json
import os
import re
from urllib.parse import quote

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


def name_to_id(name):
    slug = re.sub(r'[^a-z0-9\s]', '', name.lower())
    slug = re.sub(r'\s+', '-', slug.strip())
    return slug


def read_text(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def read_ignore(folder):
    path = os.path.join(folder, '.mediaignore')
    ignored = {'.gitkeep', '.mediaignore', 'metadata.csv'}
    if os.path.exists(path):
        for line in read_text(path).splitlines():
            line = line.strip()
            if line and not line.startswith('#'):
                ignored.add(line)
    return ignored


def read_meta_csv(folder):
    path = os.path.join(folder, 'metadata.csv')
    if not os.path.exists(path):
        return {}
    meta_map = {}
    with open(path, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            fname = row.get('filename', '').strip()
            if fname:
                meta_map[fname] = row
    return meta_map


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
            'url': 'session-log.html?log=' + quote(fname),
            'new_tab': True,
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
            slug = name_to_id(row.get('name', ''))
            items.append({
                'type': 'character',
                'title': heading,
                'url': 'dramatis-personae.html#' + slug,
                'new_tab': True,
                'body': row.get('description', '').strip(),
                'tags': tags,
            })


# ── Media folders ────────────────────────────────────────────────────────────
def scan_folder(folder, page_url):
    if not os.path.isdir(folder):
        return
    ignored = read_ignore(folder)
    meta_map = read_meta_csv(folder)

    all_names = [n for n in os.listdir(folder) if n not in ignored and not n.startswith('.')]
    subdirs = [n for n in all_names if os.path.isdir(os.path.join(folder, n))]
    files = [n for n in all_names if os.path.isfile(os.path.join(folder, n))]

    standalone_md = [n for n in files if n.endswith('.md')]
    media_files = [n for n in files if not n.endswith('.md')]

    # Standalone .md files — link to the containing page (rendered inline there)
    for fname in sorted(standalone_md):
        row = meta_map.get(fname, {})
        tags = parse_tags(row.get('tags', ''))
        all_tags.update(tags)
        _, body = parse_frontmatter(read_text(os.path.join(folder, fname)))
        items.append({
            'type': 'media',
            'title': row.get('caption', fname[:-3]),
            'url': page_url,
            'new_tab': False,
            'body': body,
            'tags': tags,
        })

    # Media files — link directly to the file so it opens like clicking on it
    for fname in sorted(media_files):
        row = meta_map.get(fname, {})
        tags = parse_tags(row.get('tags', ''))
        all_tags.update(tags)
        rel = os.path.relpath(os.path.join(folder, fname), REPO_ROOT)
        direct_url = quote(rel.replace(os.sep, '/'), safe='/')
        items.append({
            'type': 'media',
            'title': row.get('caption', fname),
            'url': direct_url,
            'new_tab': True,
            'body': row.get('notes', ''),
            'tags': tags,
        })

    for d in sorted(subdirs):
        scan_folder(os.path.join(folder, d), page_url)


scan_folder(os.path.join(REPO_ROOT, 'assets', 'handouts'), 'handouts.html')
scan_folder(os.path.join(REPO_ROOT, 'assets', 'maps'), 'maps.html')
scan_folder(os.path.join(REPO_ROOT, 'assets', 'locations'), 'locations.html')
scan_folder(os.path.join(REPO_ROOT, 'assets', 'objects'), 'objects.html')
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
