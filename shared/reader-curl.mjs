/* Kitobkhona-grade WebGL page-curl + swipe gesture controller + 3D CSS flip fallback. */

export function createCurlRenderer(canvas, texture, width, height, direction) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL unavailable');
  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec3 a;attribute vec2 uv;attribute float light;varying vec2 v;varying float l;void main(){gl_Position=vec4(a,1.);v=uv;l=light;}'));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision mediump float;uniform sampler2D tex;varying vec2 v;varying float l;void main(){vec4 c=texture2D(tex,v);float shade=abs(l);if(l<0.){c.rgb=mix(c.rgb,vec3(.91,.89,.83),.84);}c.rgb*=.66+.34*shade;gl_FragColor=vec4(c.rgb,1.);}'));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link');
  gl.useProgram(program);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [name, size, offset] of [['a', 3, 0], ['uv', 2, 12], ['light', 1, 20]]) {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 24, offset);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  const cols = 100;
  const rows = 14;

  function draw(p) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const vertices = [];
    const radius = width * (0.085 + 0.07 * Math.sin(Math.PI * p));
    const fold = width * (1 - 1.7 * p);
    function point(ix, iy) {
      const u = ix / cols;
      const v = iy / rows;
      const x = u * width;
      const y = v * height;
      const slant = (v - 0.5) * width * 0.075 * Math.sin(p * Math.PI);
      const f = fold + slant;
      const d = x - f;
      let xx = x;
      let z = 0;
      let normal = 1;
      if (d > 0) {
        const theta = Math.min(Math.PI, d / radius);
        xx = f + radius * Math.sin(theta);
        z = radius * (1 - Math.cos(theta));
        normal = Math.cos(theta);
        if (d > Math.PI * radius) xx = f - (d - Math.PI * radius);
      }
      if (direction < 0) xx = width - xx;
      const perspective = 1400 / (1400 - z);
      const px = (xx - width / 2) * perspective + width / 2;
      const py = (y - height / 2) * perspective + height / 2;
      return [px / width * 2 - 1, 1 - py / height * 2, -z / 600, direction > 0 ? u : 1 - u, 1 - v, normal];
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const a = point(x, y);
        const b = point(x + 1, y);
        const c = point(x, y + 1);
        const d = point(x + 1, y + 1);
        vertices.push(...a, ...c, ...b, ...b, ...c, ...d);
      }
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
  }

  return {
    draw,
    destroy() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buffer);
      for (const s of gl.getAttachedShaders(program) || []) gl.deleteShader(s);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

export function attachReaderGestures(api) {
  const stage = api.stage;
  const container = api.container;
  const pointers = new Set();
  let gesture = null;
  let session = null;
  let serial = 0;
  let suppressUntil = 0;
  let settling = false;

  const reduced = () => {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  };

  function snapshot(cv) {
    const box = container.getBoundingClientRect();
    const d = Math.min(devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(box.width * d));
    c.height = Math.max(1, Math.round(box.height * d));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    const w = parseFloat(cv.style.width) || box.width;
    const h = parseFloat(cv.style.height) || box.height;
    ctx.drawImage(cv, (box.width - w) * d / 2, (box.height - h) * d / 2, w * d, h * d);
    return c;
  }

  function cleanup() {
    if (session) {
      session.renderer?.destroy();
      session.layer.remove();
      session = null;
    }
    container.classList.remove('curl-active');
    api.busy(false);
  }

  function draw(progress) {
    if (!session) return;
    session.progress = Math.max(0, Math.min(1, progress));
    if (session.renderer) {
      session.renderer.draw(session.direction > 0 ? session.progress : 1 - session.progress);
    } else {
      session.front.style.transform = `translateX(${session.direction > 0 ? -session.progress * 100 : (1 - session.progress) * -100}%)`;
      session.front.style.opacity = String(1 - session.progress * 0.15);
    }
  }

  async function prepare(g) {
    const id = ++serial;
    api.busy(true);
    try {
      const target = await api.preview(g.target);
      if (!gesture || gesture !== g || id !== serial) return;
      const current = api.current();
      if (!current) { api.busy(false); return; }
      const front = snapshot(g.direction > 0 ? current : target);
      const back = snapshot(g.direction > 0 ? target : current);
      const box = container.getBoundingClientRect();
      const layer = document.createElement('div');
      layer.className = 'reader-curl-layer';
      back.className = 'reader-curl-base';
      layer.appendChild(back);

      const surface = document.createElement('canvas');
      surface.width = front.width;
      surface.height = front.height;
      surface.className = 'reader-curl-surface';
      layer.appendChild(surface);

      let renderer = null;
      try {
        if (!reduced()) renderer = createCurlRenderer(surface, front, box.width, box.height, g.direction);
      } catch {
        renderer = null;
      }
      if (!renderer) {
        surface.replaceWith(front);
        front.className = 'reader-curl-surface';
      }
      layer.dataset.backend = renderer ? 'webgl' : 'slide';
      container.appendChild(layer);
      container.classList.add('curl-active');
      session = { layer, renderer, front, direction: g.direction, progress: 0 };
      draw(g.progress);
    } catch {
      api.busy(false);
      g.previewFailed = true;
    }
  }

  async function finish(commit) {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    serial++;
    settling = true;
    suppressUntil = performance.now() + 650;
    if (session) {
      const from = session.progress;
      const to = commit ? 1 : 0;
      const duration = reduced() ? 0 : 220;
      const start = performance.now();
      await new Promise(resolve => {
        function frame(now) {
          const t = duration ? Math.min(1, (now - start) / duration) : 1;
          draw(from + (to - from) * (1 - Math.pow(1 - t, 3)));
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });
    }
    try {
      if (commit) await api.commit(g.target);
    } finally {
      cleanup();
      settling = false;
      api.activity?.();
    }
  }

  stage.addEventListener('pointerdown', e => {
    pointers.add(e.pointerId);
    api.activity?.();
    if (pointers.size > 1) {
      if (gesture) void finish(false);
      return;
    }
    const state = api.state();
    if (settling || !state.ready || state.zoom > 1.01 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, startPage: state.page, target: 0, direction: 0, progress: 0, dragged: false };
  });

  stage.addEventListener('pointermove', e => {
    const g = gesture;
    if (!g || e.pointerId !== g.id || pointers.size !== 1 || settling) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const w = Math.max(1, container.clientWidth);
    if (!g.dragged) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      g.direction = dx < 0 ? 1 : -1;
      g.target = g.startPage + g.direction;
      const s = api.state();
      if (g.target < 1 || g.target > s.pages) { gesture = null; return; }
      g.dragged = true;
      try { stage.setPointerCapture(e.pointerId); } catch {}
      void prepare(g);
    }
    g.progress = Math.max(0, Math.min(1, -dx * g.direction / (w * 0.9)));
    draw(g.progress);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  stage.addEventListener('pointerup', e => {
    pointers.delete(e.pointerId);
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    if (!g.dragged) { gesture = null; return; }
    void finish(g.progress >= 0.24);
  });

  function cancel(e) {
    pointers.delete(e.pointerId);
    if (gesture && gesture.id === e.pointerId) void finish(false);
  }
  stage.addEventListener('pointercancel', cancel);
  stage.addEventListener('lostpointercapture', e => {
    if (e.target === stage && pointers.has(e.pointerId)) cancel(e);
  });

  stage.addEventListener('click', e => {
    if (performance.now() < suppressUntil) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('resize', () => {
    if (gesture) void finish(false);
  });

  return {
    cancel: () => { if (gesture) void finish(false); },
    active: () => !!gesture || settling,
  };
}
