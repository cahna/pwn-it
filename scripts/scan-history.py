#!/usr/bin/env python3
"""Scan every file version a branch adds for known private values, without printing them.

Usage: scan-history.py <worktree> <base-ref> <values-file>

Checks every blob reachable from HEAD but not from <base-ref> (all commits of the branch, not
just HEAD), so a fixture sanitized in a later commit is still caught in the earlier one, and
every path any branch commit adds, changes, or renames to (so renaming an existing file to a
private name is caught too). Binary blobs are searched as raw bytes. Zip-based files (zip, jar,
docx, xlsx, ...) and gzip, found by content or extension, are unpacked recursively (depth and
size limited). <values-file> holds one UTF-8 value per line; keep it outside the repo. Each
value is matched in all its case forms (as given, lower, upper, title, capitalized, casefolded;
so Groß also matches GROSS and gross), case-insensitively, and the same forms are used for file
contents, file names, and redaction.

Output, one line each. Paths are shown with any value replaced by [value#n]; values never print.
  HIT=<blob> <path> value#<n>     a value (line n of <values-file>) is in that file version
  HIT=<commit> <path> value#<n> in-path   a file or directory name contains a value (also a leak)
  UNSCANNED=<blob> <path>         all or part of it can't be searched (images, video, PDFs, other
                                  compression, encrypted or over-limit archive members): look at
                                  it yourself
  SCANNED=<n> HITS=<n> UNSCANNED=<n>
Exit status: 0 no hits, 1 hits, 2 usage or git error.
"""
import gzip
import io
import re
import subprocess
import sys
import zipfile
import zlib

ZIP_EXT = ('.zip', '.jar', '.war', '.aar', '.apk', '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.epub')
GZ_EXT = ('.gz', '.tgz')
OPAQUE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.ico', '.tif', '.tiff', '.mp4', '.mov',
              '.webm', '.mkv', '.mp3', '.wav', '.pdf', '.7z', '.rar', '.bz2', '.xz', '.zst', '.lz4', '.br')
OPAQUE_MAGIC = (b'\x89PNG', b'\xff\xd8\xff', b'GIF8', b'%PDF', b'7z\xbc\xaf', b'Rar!', b'BZh', b'\xfd7zXZ',
                b'\x28\xb5\x2f\xfd', b'RIFF', b'\x00\x00\x00\x18ftyp', b'\x00\x00\x00\x20ftyp', b'\x1aE\xdf\xa3')
MAX_DEPTH = 4
MAX_BYTES = 256 * 1024 * 1024  # unpacked bytes per top-level blob


def git(wt, *args, data=None):
    return subprocess.run(['git', '-C', wt, *args], input=data, capture_output=True, check=True).stdout


def unpack(name, blob, depth, budget):
    """Returns (searchable byte chunks, whether some part could not be searched)."""
    low = name.lower()
    if blob.startswith(OPAQUE_MAGIC) or blob[4:8] == b'ftyp' or low.endswith(OPAQUE_EXT):
        return [], True
    is_zip, is_gz = blob.startswith(b'PK\x03\x04') or low.endswith(ZIP_EXT), blob.startswith(b'\x1f\x8b') or low.endswith(GZ_EXT)
    if not (is_zip or is_gz):
        return [blob], False
    if depth >= MAX_DEPTH:
        return [blob], True
    chunks, partial = [], False
    try:
        if is_zip:
            with zipfile.ZipFile(io.BytesIO(blob)) as z:
                for info in z.infolist():
                    if info.is_dir():
                        continue
                    if info.file_size > budget[0] or info.flag_bits & 0x1:  # over budget or encrypted
                        partial = True
                        continue
                    data = z.read(info)
                    budget[0] -= len(data)
                    c, p = unpack(info.filename, data, depth + 1, budget)
                    chunks += c
                    partial |= p
        else:
            data, rest = b'', blob
            while rest:  # a gzip file may be several members back to back
                if not rest.startswith(b'\x1f\x8b'):
                    partial = True  # trailing data that isn't another member
                    break
                if budget[0] <= 0:  # decompress(max_length=0) would mean no limit
                    return [blob, data], True
                d = zlib.decompressobj(zlib.MAX_WBITS | 16)
                part = d.decompress(rest, budget[0])
                if d.unconsumed_tail or not d.eof:  # over budget or truncated
                    return [blob, data], True
                budget[0] -= len(part)
                data += part
                rest = d.unused_data
            c, p = unpack(name[:-3] if low.endswith('.gz') else '', data, depth + 1, budget)
            chunks, partial = c, partial or p
    except (zipfile.BadZipFile, zlib.error, gzip.BadGzipFile, EOFError, NotImplementedError, RuntimeError):
        return [blob], True  # broken or unsupported: search the raw bytes, but flag it
    return chunks, partial


def main():
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    wt, base, values_file = sys.argv[1:]
    values = [(i, v.strip()) for i, v in enumerate(open(values_file, encoding='utf-8'), 1) if v.strip()]
    if not values:
        print(f'no values in {values_file}', file=sys.stderr)
        return 2
    # One set of case forms per value drives content detection, name detection, and redaction,
    # so they can't disagree (ß uppercases to SS, which re.IGNORECASE alone doesn't match).
    forms = [(n, sorted({f(v) for f in (str, str.lower, str.upper, str.title, str.capitalize, str.casefold)},
                        key=len, reverse=True)) for n, v in values]
    # bytes.lower() folds ASCII only, so fold every needle the same way.
    needles = [(n, {f.encode().lower() for f in fs}) for n, fs in forms]
    redactors = [(n, re.compile('|'.join(map(re.escape, fs)), re.IGNORECASE)) for n, fs in forms]

    def show(path):
        # Blank the union of every value's matches at once, so overlapping or nested values can't
        # leave a fragment of one another visible.
        spans = sorted((m.start(), m.end(), n) for n, rx in redactors for m in rx.finditer(path))
        merged = []
        for s, e, n in spans:
            if merged and s <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], e)
                merged[-1][2].add(n)
            else:
                merged.append([s, e, {n}])
        for s, e, ns in reversed(merged):
            path = path[:s] + '[value#' + ','.join(map(str, sorted(ns))) + ']' + path[e:]
        return path

    objs = [l.split(' ', 1) for l in git(wt, 'rev-list', '--objects', f'{base}..HEAD').decode('utf-8', 'replace').splitlines()]
    objs = [(o[0], o[1]) for o in objs if len(o) == 2]  # commits have no path
    types = git(wt, 'cat-file', '--batch-check=%(objecttype)', data=''.join(o + '\n' for o, _ in objs).encode()).decode().split()
    scanned = hits = unscanned = 0
    # Names: every path a branch commit adds, changes, or renames to, including unchanged content
    # under a new name (no new blob for that). Reported once, at the first component holding the value.
    named = set()
    for commit in git(wt, 'rev-list', f'{base}..HEAD').decode().split():
        out = git(wt, 'diff-tree', '-r', '-m', '--root', '--no-commit-id', '--name-only', '-z',
                  '--no-renames', '--diff-filter=d', commit).decode('utf-8', 'replace')
        for path in filter(None, out.split('\0')):
            for n, rx in redactors:
                parts = path.split('/')
                i = next((i for i, part in enumerate(parts) if rx.search(part)), None)
                key = (n, '/'.join(parts[:i + 1]) if i is not None else path)
                if (i is not None or rx.search(path)) and key not in named:
                    named.add(key)
                    hits += 1
                    print(f'HIT={commit} {show(key[1])} value#{n} in-path')
    for (oid, path), kind in zip(objs, types):
        if kind != 'blob':
            continue
        chunks, partial = unpack(path, git(wt, 'cat-file', 'blob', oid), 0, [MAX_BYTES])
        if partial:
            unscanned += 1
            print(f'UNSCANNED={oid} {show(path)}')
        if chunks:
            scanned += 1
        folded = [c.lower() for c in chunks]
        found = {n for c in folded for n, forms in needles if any(f in c for f in forms)}
        for n in sorted(found):
            hits += 1
            print(f'HIT={oid} {show(path)} value#{n}')
    print(f'SCANNED={scanned} HITS={hits} UNSCANNED={unscanned}')
    return 1 if hits else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as e:  # bad ref, not a repo, ...: never mistake for hits
        print(f'git failed: {e.stderr.decode("utf-8", "replace").strip()}', file=sys.stderr)
        sys.exit(2)
    except OSError as e:
        print(f'cannot read input: {e}', file=sys.stderr)
        sys.exit(2)
