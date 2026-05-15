#!/usr/bin/env python3
"""
Pedantic metadata checker.

For each media folder (and subfolders), verifies:
  1. Every file has a corresponding row in metadata.csv
  2. Every row in metadata.csv refers to an existing file (no orphans)

Exits with code 1 and prints all issues if anything is wrong.
"""
import csv
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MEDIA_FOLDERS = [
    'assets/handouts',
    'assets/maps',
    'assets/locations',
    'assets/objects',
    'assets/miscellaneous',
]

ALWAYS_SKIP = {'.mediaignore', '.gitkeep', 'metadata.csv'}


def read_ignore(folder_path):
    ignored = set(ALWAYS_SKIP)
    path = os.path.join(folder_path, '.mediaignore')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    ignored.add(line)
    return ignored


def check_folder(folder_rel):
    folder = os.path.join(REPO_ROOT, folder_rel)
    if not os.path.isdir(folder):
        return []

    ignored = read_ignore(folder)
    errors = []

    # Collect files and subdirs in this folder
    try:
        entries = os.listdir(folder)
    except OSError as e:
        return [f'  Cannot read directory {folder_rel}: {e}']

    files_here = set()
    subdirs = []
    for name in entries:
        if name in ignored or name.startswith('.'):
            continue
        full = os.path.join(folder, name)
        if os.path.isdir(full):
            subdirs.append(name)
        else:
            files_here.add(name)

    # Read metadata.csv
    csv_path = os.path.join(folder, 'metadata.csv')
    csv_entries = {}
    if os.path.exists(csv_path):
        with open(csv_path, encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader, start=2):
                fname = row.get('filename', '').strip()
                if not fname:
                    errors.append(f'  {folder_rel}/metadata.csv: row {i} has no filename')
                    continue
                if fname in csv_entries:
                    errors.append(f'  {folder_rel}/metadata.csv: duplicate entry for "{fname}"')
                csv_entries[fname] = i
    else:
        if files_here:
            errors.append(
                f'  {folder_rel}/: metadata.csv is missing '
                f'({len(files_here)} file(s) have no metadata)'
            )
        # Recurse anyway
        for d in sorted(subdirs):
            errors.extend(check_folder(folder_rel + '/' + d))
        return errors

    # Check 1: every file has a CSV row
    for fname in sorted(files_here):
        if fname not in csv_entries:
            errors.append(f'  {folder_rel}/{fname}  ← not in metadata.csv')

    # Check 2: every CSV row refers to an existing file
    for fname in sorted(csv_entries):
        if fname not in files_here:
            errors.append(
                f'  {folder_rel}/metadata.csv row {csv_entries[fname]}: '
                f'"{fname}" does not exist in folder'
            )

    # Recurse into subdirectories
    for d in sorted(subdirs):
        errors.extend(check_folder(folder_rel + '/' + d))

    return errors


def main():
    all_errors = []
    for folder in MEDIA_FOLDERS:
        all_errors.extend(check_folder(folder))

    if all_errors:
        print('METADATA CHECK FAILED\n')
        for e in all_errors:
            print(e)
        print(f'\n{len(all_errors)} issue(s) found.')
        print('Add or remove rows in the relevant metadata.csv to fix this.')
        sys.exit(1)
    else:
        print('Metadata check passed — all files accounted for.')
        sys.exit(0)


if __name__ == '__main__':
    main()
