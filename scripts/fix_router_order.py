# -*- coding: utf-8 -*-

path = 'src/app/cases/[id]/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace line 102
target_remove = '  const router = useRouter();\n'
target_add_after = '  const { id } = use(params);\n'
replacement_add = '  const { id } = use(params);\n  const router = useRouter();\n'

# Normalize CRLF
content_norm = content.replace('\r\n', '\n')
if target_remove in content_norm and target_add_after in content_norm:
    content_norm = content_norm.replace(target_remove, '', 1)
    content_norm = content_norm.replace(target_add_after, replacement_add, 1)
    content = content_norm.replace('\n', '\r\n')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print('SUCCESS: Moved router initialization to the top of CaseWorkbenchPage')
else:
    print('ERROR: targets not found')
