#!/usr/bin/env python3
"""Agrega el botón FSC (fscauth) antes de </body> en las páginas indicadas.

Uso: python3 fsc_patch_button.py pagina1.html [pagina2.html ...]
Idempotente: si la página ya tiene fsc-button.js no la toca.
"""
import sys
import pathlib

TAG = '<script src="https://vps-4455523-x.dattaweb.com/fscauth/js/fsc-button.js"></script>'

def main():
    targets = sys.argv[1:]
    if not targets:
        print('nada que hacer: pasá rutas de HTML')
        return 1
    changed = 0
    for t in targets:
        p = pathlib.Path(t)
        if not p.is_file():
            print('no existe:', t)
            continue
        s = p.read_text(encoding='utf-8', errors='replace')
        if 'fsc-button.js' in s:
            print('ya estaba:', t)
            continue
        if '</body>' not in s:
            print('sin </body>:', t)
            continue
        s = s.replace('</body>', '  ' + TAG + '\n</body>', 1)
        p.write_text(s, encoding='utf-8')
        changed += 1
        print('parcheado:', t)
    print('total parcheados:', changed)
    return 0

if __name__ == '__main__':
    sys.exit(main())
