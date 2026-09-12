import io
p = r'qa-screens.mjs'
s = io.open(p, encoding='utf-8').read()
s = s.replace(
    "const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));",
)
s = s.replace(
    "const ART = path.join(ROOT, 'tests/e2e/artifacts');",
    "const ART = path.join(ROOT, 'tests', 'e2e', 'artifacts');",
)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched')
