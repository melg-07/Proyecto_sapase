// Metadata de los logos vigentes, disponible globalmente (p.ej. para el PDF)
let currentLogosMeta = null;

// Aplica los logos (login, topbar y vista previa de configuracion)
function applyLogos(meta) {
  if (!meta) return;
  currentLogosMeta = meta;
  const v = meta.version || 0;
  const escudoUrl = `assets/${meta.escudo}?v=${v}`;
  const logoUrl   = `assets/${meta.logo_sapase}?v=${v}`;

  ['login-escudo', 'topbar-escudo', 'config-preview-escudo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.src = escudoUrl;
  });
  ['login-logo-sapase', 'topbar-logo-sapase', 'config-preview-logo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.src = logoUrl;
  });
}

// Carga los logos vigentes desde el servidor
async function loadLogos() {
  try {
    const meta = await apiGetLogos();
    applyLogos(meta);
  } catch (err) {
    // Si falla, se conservan los logos por defecto ya presentes en el HTML
  }
}

function renderConfiguracion() {
  loadLogos();
}

async function handleLogoFileSelect(key, file) {
  if (!file) return;

  const isImageType = file.type.startsWith('image/');
  const isImageExt  = /\.(jpg|jpeg|png|gif|webp|svg|tif|tiff)$/i.test(file.name);
  if (!isImageType && !isImageExt) {
    showToast('Selecciona un archivo de imagen valido', 'error');
    return;
  }
  try {
    const meta = await apiSubirLogo(key, file);
    applyLogos(meta);
    showToast('Logo actualizado correctamente', 'success');
  } catch (err) {
    showToast(err.message || 'Error al subir el logo', 'error');
  }
}
