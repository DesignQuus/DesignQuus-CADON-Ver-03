# -*- coding: utf-8 -*-
import sys

def main():
    path = 'src/app/cases/page.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    modified = False
    for i, l in enumerate(lines):
        if 'href={`/cases/${c.id}?tab=bom`}' in l:
            indent = l[:l.index('href')]
            lines[i] = indent + 'href={`/quotes/${c.id}/review`}\n' + indent + 'onClick={(e) => e.stopPropagation()}\n'
            modified = True
        elif 'href={`/cases/${c.id}?tab=quote`}' in l:
            indent = l[:l.index('href')]
            lines[i] = indent + 'href={`/quotes/${c.id}/publish`}\n' + indent + 'onClick={(e) => e.stopPropagation()}\n'
            modified = True
        elif 'href={`/cases/${c.id}`}' in l and i + 4 < len(lines) and 'UploadCloud' in lines[i+4]:
            indent = l[:l.index('href')]
            lines[i] = indent + 'href={`/cases/${c.id}`}\n' + indent + 'onClick={(e) => e.stopPropagation()}\n'
            modified = True

    if modified:
        with open(path, 'w', encoding='utf-8', newline='\r\n') as f:
            f.writelines(lines)
        print('Successfully updated src/app/cases/page.tsx')
    else:
        print('Warning: No target lines found in src/app/cases/page.tsx')

if __name__ == '__main__':
    main()
