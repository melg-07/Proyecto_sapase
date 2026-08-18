# Agente de Escaneo SAPASE

Este programa es lo que permite que el botón **"Escanear documentos"** de la
página de SAPASE use el escáner **Kodak S2070** conectado a tu computadora.

No usa NAPS2 ni ningún otro programa de escaneo: habla directo con el mismo
driver (WIA) que instaló el software de Kodak (`InstallSoftware_s2000`) que
ya tienes. Tú sigues usando Smart Touch normalmente para lo que ya haces con
él; este agente solo escanea automáticamente cuando el sistema SAPASE lo pide.

## ¿Por qué se necesita un programa aparte?

Una página web, por seguridad, no puede hablarle directamente al hardware de
tu computadora (como un escáner). Este "agente" es un programita chiquito que
corre en tu propia computadora (nunca en internet) y hace de puente: la
página le pide "escanea", el agente le habla al driver del escáner, y le
regresa el documento (ya armado en PDF) para que se guarde en la petición.

**Solo se necesita instalar esto en las computadoras donde esté conectado el
escáner.** Si alguien más entra a SAPASE desde una computadora sin escáner,
el botón "Subir documentos" le sigue funcionando normal; solo "Escanear
documentos" requiere el agente.

## Requisitos

1. El driver del Kodak S2070 ya instalado (esto ya lo hiciste con
   `InstallSoftware_s2000_v8.2.3`).
2. **Node.js** instalado en esa computadora. Descárgalo de
   https://nodejs.org (versión LTS) e instálalo con las opciones por
   defecto.

## Paso 1: Confirmar que Windows ve el escáner (WIA)

1. Abre la carpeta `scanner-agent/scripts`.
2. Da clic derecho sobre `list-devices.ps1` → **"Ejecutar con PowerShell"**.
3. Debe aparecer una lista con el nombre del escáner, algo como
   `Kodak S2070 ...`. Anota ese nombre.

**Si no aparece nada / da error:** el driver de Kodak podría no tener
habilitado el modo WIA (algunos escáneres departamentales solo exponen
TWAIN/ISIS). En ese caso avísame para armar la alternativa (usar NAPS2 o el
propio Smart Touch como motor, en vez de WIA) — igual está preparado el
código para ese caso, pero primero hay que confirmar si hace falta.

## Paso 2: Configurar el agente

Abre `config.json` con el Bloc de notas:

```json
{
  "puerto": 5175,
  "nombreDispositivo": "Kodak",
  "origenesPermitidos": [
    "http://localhost:3001",
    "http://127.0.0.1:3001"
  ]
}
```

- `nombreDispositivo`: una palabra que esté contenida en el nombre que viste
  en el Paso 1 (por ejemplo `"Kodak"` o `"S2070"`), para que el agente elija
  ese escáner automáticamente sin preguntar. Si en esa computadora solo hay
  un escáner conectado, puedes dejarlo así o vaciarlo (`""`).
- `origenesPermitidos`: agrega aquí la dirección con la que abres SAPASE en
  el navegador (por ejemplo `http://192.168.1.50:3001` si la usas en red
  local). Puedes poner varias. Si quieres permitir cualquiera, usa `["*"]`.

## Paso 3: Instalar y ejecutar el agente

1. Haz doble clic en **`iniciar-agente.bat`**.
   - La primera vez instalará automáticamente lo que necesita (puede tardar
     uno o dos minutos, requiere internet solo esa vez).
   - Después dejará una ventana negra abierta que dice
     `Agente de Escaneo SAPASE ... Escuchando en http://127.0.0.1:5175`.
2. **Deja esa ventana abierta** mientras uses el escaneo desde SAPASE.
   Ciérrala cuando termines.
3. En la página de SAPASE, ve a "Nueva Petición" y da clic en
   **"📷 Escanear documentos"**. El escáner se activará solo (si tiene
   varias hojas en el alimentador automático, las escaneará todas) y, al
   terminar, aparecerá un solo PDF en "Documentos adjuntos para esta
   petición", igual que si lo hubieras subido a mano.

### Para que se inicie solo al prender la computadora (opcional)

1. Presiona `Windows + R`, escribe `shell:startup` y da Enter.
2. Copia un acceso directo de `iniciar-agente.bat` dentro de esa carpeta.

## Solución de problemas

- **"No se detectó el Agente de Escaneo en esta computadora"** (mensaje en
  la página): la ventana del agente no está abierta. Ábrela con
  `iniciar-agente.bat`.
- **"No se detectó ningún escáner por WIA"**: repite el Paso 1
  (`list-devices.ps1`) para confirmar que Windows detecta el escáner.
  Revisa que esté encendido y conectado.
- **Solo escanea una hoja aunque pusiste varias en el alimentador**: el
  driver de tu escáner podría reportar el estado del feeder de forma
  distinta a la esperada. Avísame para ajustar `scripts/scan-wia.ps1` según
  lo que reporte tu driver específico.
- **La ventana de PowerShell pide permisos / bloquea el script**: el
  agente ya llama a PowerShell con `-ExecutionPolicy Bypass`, así que no
  debería pedir nada. Si tu computadora tiene una política de ejecución más
  estricta (impuesta por el departamento de sistemas), pide que te
  autoricen ejecutar scripts locales.
- **Todo esto parece complicado de configurar por hoja/PC**: solo se hace
  una vez por computadora que tenga escáner. Después de configurado, para
  escanear solo es "abrir la ventana negra" y dar clic en el botón de la
  página.
