#!/usr/bin/env python3
"""Genera los iconos de la PWA a partir de un único dibujo vectorial.

Se dibuja en grande y se reduce con antialias, para que el icono se vea nítido
también a 48 px, que es el tamaño real en el cajón de aplicaciones de Android.

El motivo del diseño: el encabezado de la aplicación usa un cuadrado con
degradado verde y el emoji 📊. Un emoji queda borroso y cambia de forma en cada
sistema, así que aquí se dibuja el mismo concepto —barras y una línea base— con
figuras propias: se reconoce a cualquier tamaño y se ve igual en todas partes.

Uso:  python3 _iconos.py
"""
from PIL import Image, ImageDraw
import os

# Colores de la marca, los mismos de --logo1/--logo2 en css/styles.css
VERDE_CLARO = (86, 211, 100)
VERDE       = (46, 160, 67)
BLANCO      = (255, 255, 255)

SUPER = 8          # se dibuja a 8x y se reduce: bordes limpios sin librerías extra
DEST  = 'icons'


def degradado(size):
    """Fondo con degradado diagonal de VERDE_CLARO a VERDE."""
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            # Diagonal 135°: la mezcla avanza con x+y
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(
                round(VERDE_CLARO[i] + (VERDE[i] - VERDE_CLARO[i]) * t) for i in range(3)
            )
    return img


def marca(size, margen_rel=0.0, redondeado=True):
    """Dibuja el icono completo a `size` px.

    margen_rel  aire alrededor del dibujo, en proporción del lado. Los iconos
                enmascarables lo necesitan porque Android recorta un círculo.
    redondeado  esquinas redondeadas (icono normal) o cuadrado lleno
                (enmascarable: la máscara del sistema define la forma).
    """
    S = size * SUPER
    fondo = degradado(S)

    lienzo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if redondeado:
        mascara = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mascara).rounded_rectangle(
            [0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    else:
        mascara = Image.new('L', (S, S), 255)
    lienzo.paste(fondo, (0, 0), mascara)

    d = ImageDraw.Draw(lienzo)

    # Zona de dibujo: el margen deja el contenido dentro de la zona segura
    m = S * (0.22 + margen_rel)
    ancho = S - 2 * m
    base_y = S - m                      # línea de base de las barras

    # Tres barras de altura creciente, como en un balance que crece
    n = 3
    hueco = ancho * 0.14
    bw = (ancho - hueco * (n - 1)) / n
    alturas = [0.42, 0.68, 1.0]
    radio = bw * 0.22
    for i, h in enumerate(alturas):
        x0 = m + i * (bw + hueco)
        y0 = base_y - ancho * h
        d.rounded_rectangle([x0, y0, x0 + bw, base_y - ancho * 0.10],
                            radius=radio, fill=BLANCO)

    # Línea base: el "suelo" del gráfico, que ancla la figura
    gr = ancho * 0.055
    d.rounded_rectangle([m, base_y - ancho * 0.055, m + ancho, base_y],
                        radius=gr / 2, fill=BLANCO)

    return lienzo.resize((size, size), Image.LANCZOS)


def guardar(img, nombre):
    ruta = os.path.join(DEST, nombre)
    img.save(ruta)
    print(f'  {ruta}  {img.size[0]}×{img.size[1]}  {os.path.getsize(ruta)//1024 or 1} KB')


def main():
    os.makedirs(DEST, exist_ok=True)
    print('Iconos generados:')

    # Iconos de la PWA
    for s in (192, 512):
        guardar(marca(s), f'icon-{s}.png')

    # Enmascarables: Android recorta un círculo, así que el dibujo va más chico
    for s in (192, 512):
        guardar(marca(s, margen_rel=0.06, redondeado=False), f'icon-maskable-{s}.png')

    # iOS no redondea por sí solo el apple-touch-icon: se entrega ya redondeado
    guardar(marca(180), 'apple-touch-icon.png')

    # Favicons
    for s in (16, 32, 48):
        guardar(marca(s), f'favicon-{s}.png')
    ico = os.path.join(DEST, 'favicon.ico')
    marca(48).save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    print(f'  {ico}  multi-tamaño')


if __name__ == '__main__':
    main()
