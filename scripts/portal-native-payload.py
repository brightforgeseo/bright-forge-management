"""Bounded Portal file staging/export, not a native runtime implementation."""
import base64
import os
import stat

FORMATS = {'txt', 'md', 'csv', 'json', 'pdf', 'docx', 'xlsx'}

def stage_files(root, files):
    if len(files) > 100:
        raise ValueError('FILE_COUNT_LIMIT')
    paths = []
    total = 0
    for index, file in enumerate(files):
        name = file['name']
        if not isinstance(name, str) or not name or len(name)>180 or any(c in name for c in '/\\') or any(ord(c)<32 for c in name) or file['format'] not in FORMATS:
            raise ValueError('INVALID_FILE')
        data = base64.b64decode(file['base64'], validate=True)
        total += len(data)
        if len(data)>2097152 or total>6291456:
            raise ValueError('FILE_SIZE_LIMIT')
        target = root/'inputs'/str(index)/name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(data)
        paths.append(str(target))
    return paths

def export_files(root):
    result = []
    total = 0
    for file in sorted(root.iterdir()):
        if file.name == 'inputs' and file.is_dir() and not file.is_symlink():
            continue
        if file.is_symlink() or not file.is_file():
            raise ValueError('UNSAFE_OUTPUT_FILE')
        fmt = file.suffix[1:]
        if fmt not in FORMATS:
            raise ValueError('UNSUPPORTED_OUTPUT_FORMAT')
        fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ValueError('UNSAFE_OUTPUT_FILE')
            data = stream.read(2097153)
        total += len(data)
        if len(data)>2097152 or total>6291456 or len(result)>=6:
            raise ValueError('OUTPUT_SIZE_LIMIT')
        result.append({'name':file.name,'format':fmt,'base64':base64.b64encode(data).decode()})
    return result

