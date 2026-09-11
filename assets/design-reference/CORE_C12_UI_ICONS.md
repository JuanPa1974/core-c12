# CORE C12 — UI ICON SYSTEM

## Formato

Todos los iconos funcionales finales deben ser:

- SVG
- `viewBox="0 0 24 24"`
- fondo transparente
- `fill="none"` salvo necesidad justificada
- `stroke="currentColor"`
- `stroke-linecap="round"`
- `stroke-linejoin="round"`

## Tamaños visuales

Referencia:

- 16 px → indicador secundario
- 20 px → acción normal
- 22–24 px → acción táctil principal

El tamaño del dibujo NO define el área táctil.

Las acciones principales deben disponer de una zona táctil aproximada mínima de 44 × 44 px mediante CSS.

## Familia visual

Mantener:

- grosor consistente
- esquinas redondeadas
- proporciones similares
- lenguaje visual común
- legibilidad a tamaños pequeños

## Iconos previstos

### Configuración / personalización

Nombre objetivo:

`sliders.svg`

Concepto:

sliders / adjustments.

NO utilizar engranaje.

### Editar

`edit.svg`

Concepto:

pencil line.

### Confirmar

`check.svg`

### Cerrar

`close.svg`

### Restablecer

`reset.svg`

Concepto:

rotate counter-clockwise / reset.

NO utilizar papelera.

### Información

`info.svg`

### Volver

`back.svg`

Concepto:

chevron-left.

## Estados

Cada icono deberá funcionar mediante CSS en:

- normal
- hover
- pressed
- active
- disabled

NO crear archivos SVG separados por estado.

Utilizar `currentColor`.

## Fuente visual recomendada

Puede utilizarse una familia coherente como Lucide como referencia/base.

NO instalar toda una librería JavaScript únicamente para iconos.

Si se utilizan SVG de una librería:

- guardar únicamente los SVG necesarios
- revisar licencia
- normalizar geometría y grosor
- almacenarlos localmente

## Ubicación final

Fuentes editables:

    assets/ui-icons/source/

SVG runtime:

    assets/ui-icons/svg/
