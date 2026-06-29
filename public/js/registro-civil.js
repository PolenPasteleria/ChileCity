    // REGISTRO CIVIL
    // ══════════════════════════════════════════════════════════════════════════

    // Validación en tiempo real
    (function initRCValidacion() {
      const campos = ['f-nombre1','f-nombre2','f-apellido1','f-apellido2'];
      const soloLetras = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]*$/;
      campos.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
          const val = el.value.trim();
          if (val && !soloLetras.test(val)) {
            el.classList.add('input-error');
            el.classList.remove('input-ok');
          } else if (val.length >= 2) {
            el.classList.remove('input-error');
            el.classList.add('input-ok');
          } else {
            el.classList.remove('input-error','input-ok');
          }
        });
      });
      const fechaEl = document.getElementById('f-fecha');
      if (fechaEl) {
        fechaEl.addEventListener('change', () => {
          if (fechaEl.value) { fechaEl.classList.add('input-ok'); fechaEl.classList.remove('input-error'); }
          else { fechaEl.classList.remove('input-ok'); }
        });
      }
    })();

    async function cargarDNI() {
      if (!currentUser?.id) return;
      document.getElementById('rc-loading').style.display = 'flex';
      document.getElementById('rc-carnet-wrap').style.display = 'none';
      document.getElementById('rc-form').style.display = 'none';

      try {
        const res = await fetch(`/api/dni?discord_id=${currentUser.id}`);
        const data = await res.json();
        document.getElementById('rc-loading').style.display = 'none';

        if (data.existe && data.dni) {
          currentDNI = data.dni;
          mostrarCarnet(data.dni);
        } else {
          document.getElementById('rc-form').style.display = 'flex';
        }
      } catch (err) {
        document.getElementById('rc-loading').style.display = 'none';
        document.getElementById('rc-form').style.display = 'flex';
      }
    }

    function mostrarCarnet(dni) {
      document.getElementById('carnet-apellidos').textContent = `${dni.apellido1} ${dni.apellido2}`;
      document.getElementById('carnet-nombres').textContent   = `${dni.nombre1} ${dni.nombre2}`;
      document.getElementById('carnet-nac').textContent       = dni.nacionalidad || 'Chilena';
      document.getElementById('carnet-fnac').textContent      = formatearFecha(dni.fecha_nac);
      document.getElementById('carnet-rut').textContent       = dni.rut;

      if (currentUser?.avatar) {
        const img   = document.getElementById('carnet-avatar');
        const icono = document.getElementById('carnet-foto-icon');
        img.src = currentUser.avatar;
        img.style.display = 'block';
        icono.style.display = 'none';
      }
      document.getElementById('rc-carnet-wrap').style.display = 'block';
    }

    function formatearFecha(f) {
      if (!f) return '—';
      const p = f.split('-');
      return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f;
    }

    async function crearDNI() {
      const nombre1   = document.getElementById('f-nombre1').value.trim();
      const nombre2   = document.getElementById('f-nombre2').value.trim();
      const apellido1 = document.getElementById('f-apellido1').value.trim();
      const apellido2 = document.getElementById('f-apellido2').value.trim();
      const fecha_nac = document.getElementById('f-fecha').value;

      if (!nombre1 || !nombre2 || !apellido1 || !apellido2 || !fecha_nac) {
        return mostrarErrorRC('Debes completar todos los campos.');
      }
      if (!/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]+$/.test(nombre1+nombre2+apellido1+apellido2)) {
        return mostrarErrorRC('Los nombres solo pueden contener letras.');
      }

      const btn = document.getElementById('btn-crear');
      btn.disabled = true;
      btn.textContent = 'Generando...';
      ocultarErrorRC();

      try {
        const res = await fetch('/api/dni', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ discord_id: currentUser.id, nombre1, nombre2, apellido1, apellido2, fecha_nac }),
        });
        const data = await res.json();
        if (!res.ok) {
          mostrarErrorRC(data.error || 'Error al crear la cédula.');
          btn.disabled = false; btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Generar Cédula`;
          return;
        }
        currentDNI = data.dni;
        document.getElementById('rc-form').style.display = 'none';
        mostrarCarnet(data.dni);
      } catch (err) {
        mostrarErrorRC('Error de conexión.');
        btn.disabled = false;
      }
    }

    function mostrarErrorRC(msg) {
      const el = document.getElementById('rc-error');
      el.textContent = msg; el.classList.add('visible');
    }
    function ocultarErrorRC() { document.getElementById('rc-error').classList.remove('visible'); }

    // ══════════════════════════════════════════════════════════════════════════
