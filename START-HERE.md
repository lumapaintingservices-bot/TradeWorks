# TradeWorks → React: cómo usar este paquete

## 1. Dónde ponerlo
Descomprime este zip **dentro** de tu carpeta del proyecto:
`C:\Users\Miguel\Documents\tradeworks\`
Te debe quedar así:
```
tradeworks/
  CLAUDE.md          ← instrucciones permanentes para Claude Code
  START-HERE.md      ← este archivo
  docs/              ← diseño, componentes, pantallas, datos, lógica, reglas
  design/            ← tokens.css, tokens.ts, icons.ts, logo.svg
  components/        ← LineChart.tsx y KpiCard.tsx ya hechos en React
  prototype/         ← la app actual (index.html + lead.html) y capturas
```

## 2. Qué le dices a Claude Code (cópialo tal cual)
> Lee CLAUDE.md y todos los archivos de /docs. El prototipo está en /prototype/index.html y /prototype/lead.html, con capturas en /prototype/screenshots. Estúdialo antes de escribir código. Vamos a reconstruir la app en React con el diseño exacto del prototipo, siguiendo las fases de CLAUDE.md. Haz solo la **Fase 1** y avísame cuando esté lista para revisarla.

## 3. Cómo trabajar
- Una fase a la vez. Cuando termine, ábrela, compárala con las capturas y dile qué corregir.
- Si algo no se ve igual al prototipo, dile: *"Compara esta pantalla con /prototype/screenshots/NOMBRE.png y haz que se vea igual."*
- La app HTML actual (LUMA) sigue funcionando mientras tanto — no la toques hasta que TradeWorks esté completo.

## 4. Qué NO se copia tal cual
- Los datos de LUMA (textos, precios, tu ID de Firebase) → en TradeWorks cada contratista pone los suyos en la configuración inicial.
- El proyecto de Firebase: para TradeWorks conviene uno **nuevo** (ej. `tradeworks-app`), separado del de LUMA.
