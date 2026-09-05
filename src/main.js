import './style.css';
import './motion.css';
import * as THREE from 'three';
import { initMotion } from './motion.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
const motionButton = document.querySelector('#motion-toggle');
function updateMotion() {
  document.body.classList.toggle('motion-paused', paused);
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.setAttribute('aria-label', paused ? 'Resume landscape animation' : 'Pause landscape animation');
  document.querySelector('#motion-icon').textContent = paused ? '▷' : 'Ⅱ';
  document.querySelector('#motion-label').textContent = paused ? 'LANDSCAPE PAUSED' : 'LIVE LANDSCAPE';
}
motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); });
reducedMotion.addEventListener('change', event => { paused = event.matches; updateMotion(); });
updateMotion();
initMotion(() => paused || reducedMotion.matches);
document.querySelector('#year').textContent = new Date().getFullYear();

function makeLandscape() {
  const canvas = document.querySelector('#world');
  const container = document.querySelector('#landscape');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setClearColor('#e8eddb');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#dce5cb', 0.0105);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 280);
  camera.position.set(0, 12, 31);
  camera.lookAt(0, 5, -37);
  scene.add(new THREE.HemisphereLight('#f2f1d7', '#263b26', 2.7));
  const sun = new THREE.DirectionalLight('#f9f2d3', 3.4);
  sun.position.set(-25, 40, -25);
  scene.add(sun);

  const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), fx), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
  }
  function fbm(x, y) {
    let n = 0, amp = .5;
    for (let i = 0; i < 5; i++) { n += amp * noise(x, y); x *= 2.12; y *= 2.12; amp *= .49; }
    return n;
  }
  const riverCenter = z => Math.sin(z * .063) * 7 + Math.sin(z * .115 + 1) * 2.5;
  const riverWidth = z => 3.3 + 1.6 * Math.sin(z * .045 + 1.5) + Math.max(0, z + 10) * .046;
  function heightAt(x, z) {
    const distance = Math.abs(x - riverCenter(z));
    const bank = Math.max(0, distance - riverWidth(z));
    const slope = 1 - Math.exp(-bank * .065);
    const peaks = 11 + fbm(x * .043 + 10, z * .035) * 27 + Math.sin(z * .045) * 5;
    const rough = fbm(x * .19, z * .19) * 5;
    return -.6 + slope * (peaks + rough) + Math.min(bank, 3) * .21;
  }
  const terrainGeometry = new THREE.PlaneGeometry(200, 210, 350, 360);
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.translate(0, 0, -62);
  const position = terrainGeometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  const low = new THREE.Color('#254f35'), high = new THREE.Color('#8d9670'), rock = new THREE.Color('#5e6d51');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i), height = heightAt(x, z);
    position.setY(i, height);
    const detail = fbm(x * .8, z * .8);
    color.copy(low).lerp(high, Math.max(0, Math.min(1, height / 44 + detail * .27)));
    const steepness = Math.abs(heightAt(x + .5, z) - height) + Math.abs(heightAt(x, z + .5) - height);
    if (steepness > 1.05) color.lerp(rock, Math.min(.75, steepness * .2));
    color.multiplyScalar(.7 + detail * .6);
    color.toArray(colors, i * 3);
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0 }));
  scene.add(terrain);

  const waterGeo = new THREE.PlaneGeometry(1, 210, 30, 250);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, 0, -62);
  const waterPositions = waterGeo.attributes.position;
  for (let i = 0; i < waterPositions.count; i++) {
    const z = waterPositions.getZ(i);
    waterPositions.setX(i, riverCenter(z) + waterPositions.getX(i) * (riverWidth(z) + 1.3) * 2);
  }
  const uniforms = { uTime: { value: 0 }, uFlow: { value: 1 }, uTravel: { value: 0 }, uCamera: { value: camera.position } };
  const water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: `uniform float uTime; uniform float uTravel; varying vec3 vWorld; varying vec2 vUv;
      void main(){vUv=uv; vec3 p=position; p.y+=sin(p.z*1.6+uTravel)*.09+sin(p.x*2.7+p.z*.8-uTime*.8)*.065;vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader: `uniform float uTime; uniform float uTravel; uniform vec3 uCamera; varying vec3 vWorld; varying vec2 vUv;
      void main(){float t=uTravel; float a=sin(vWorld.z*2.4+vWorld.x*.7+t*1.4);float b=sin(vWorld.x*4.1-vWorld.z*1.3+t*.7);float r=a*b;
      vec3 normal=normalize(vec3(.14*cos(vWorld.x*4.1+t*.7),1.,.22*cos(vWorld.z*2.4+t*1.4)));
      vec3 eye=normalize(uCamera-vWorld);float fresnel=pow(1.-max(dot(normal,eye),0.),2.);
      vec3 deep=vec3(.16,.32,.26);vec3 sky=vec3(.76,.84,.69);vec3 col=mix(deep,sky,.3+fresnel*.6);col+=r*.05;
      float lanes=pow(.5+.5*sin(vUv.x*75.+sin(vWorld.z*.16+t*.15)*1.6),12.);
      float current=pow(.5+.5*sin(vWorld.z*.8+t*2.2+sin(vUv.x*29.)*2.),7.);
      col+=vec3(.43,.51,.34)*lanes*current*.45;
      float glint=pow(max(dot(reflect(-normalize(vec3(-.6,1.,-.8)),normal),eye),0.),55.);col+=vec3(.85,.88,.67)*glint*.9;
      float bank=smoothstep(.43,.5,abs(vUv.x-.5));col=mix(col,vec3(.15,.28,.19),bank*.6);
      float fog=1.-exp(-length(uCamera-vWorld)*.0105);col=mix(col,vec3(.72,.8,.63),fog*.65);gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  }));
  water.position.y = .04;
  scene.add(water);

  const particlesGeo = new THREE.BufferGeometry();
  const points = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) { const z = hash(i, 7) * 105 - 80; points[i * 3] = riverCenter(z) + (hash(i, 8) - .5) * 20; points[i * 3 + 1] = 1 + hash(i, 9) * 9; points[i * 3 + 2] = z; }
  particlesGeo.setAttribute('position', new THREE.BufferAttribute(points, 3));
  const particles = new THREE.Points(particlesGeo, new THREE.PointsMaterial({ color: '#eef1cc', size: .065, transparent: true, opacity: .48, depthWrite: false }));
  scene.add(particles);

  const mistTextureCanvas = document.createElement('canvas');
  mistTextureCanvas.width = mistTextureCanvas.height = 128;
  const mistContext = mistTextureCanvas.getContext('2d');
  const gradient = mistContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(230,239,211,0.28)');
  gradient.addColorStop(.45, 'rgba(230,239,211,0.12)');
  gradient.addColorStop(1, 'rgba(230,239,211,0)');
  mistContext.fillStyle = gradient;
  mistContext.fillRect(0, 0, 128, 128);
  const mistTexture = new THREE.CanvasTexture(mistTextureCanvas);
  const mist = Array.from({ length: 12 }, (_, index) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture, transparent: true, depthWrite: false, opacity: .65 }));
    sprite.scale.set(24 + hash(index, 4) * 18, 4 + hash(index, 3) * 3, 1);
    scene.add(sprite);
    return sprite;
  });
  const currentGeometry = new THREE.BufferGeometry();
  const currentPositions = new Float32Array(180 * 6);
  currentGeometry.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3));
  const currents = new THREE.LineSegments(currentGeometry, new THREE.LineBasicMaterial({ color: '#e1e8c2', transparent: true, opacity: .38, depthWrite: false }));
  currents.frustumCulled = false;
  scene.add(currents);
  // Reuse one WebGL context for the chapter views rather than allocating four scenes.
  const chapterViews = [...document.querySelectorAll('.flow-art')].map(element => {
    const preview = document.createElement('canvas');
    preview.className = 'chapter-landscape';
    element.prepend(preview);
    return { element, preview, context: preview.getContext('2d') };
  });
  let visible = true, activeChapter = -1, scroll = 0, last = 0, time = 0;
  let renderWidth = 0, renderHeight = 0;
  let smoothScroll = 0, smoothProgress = .5, travel = 0, previousView = null;
  let sceneInitialized = false;
  const cameraTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const smoothLook = new THREE.Vector3(0, 5, -37);
  const intersections = new Map();
  const visibilityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => intersections.set(entry.target, entry.isIntersecting));
    visible = intersections.get(container) || false;
    activeChapter = visible ? -1 : chapterViews.findIndex(view => intersections.get(view.element));
  });
  visibilityObserver.observe(container);
  chapterViews.forEach(view => visibilityObserver.observe(view.element));
  window.addEventListener('scroll', () => { scroll = Math.min(window.scrollY / innerHeight, 1); }, { passive: true });
  function render(now) {
    requestAnimationFrame(render);
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if ((!visible && activeChapter < 0) || document.hidden) return;
    if (!visible) {
      let nearest = Infinity;
      chapterViews.forEach((candidate, index) => {
        const rect = candidate.element.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - innerHeight / 2);
        if (rect.bottom > 0 && rect.top < innerHeight && distance < nearest) { nearest = distance; activeChapter = index; }
      });
    }
    const view = activeChapter >= 0 ? chapterViews[activeChapter] : null;
    const bounds = (view?.element || container).getBoundingClientRect();
    const width = Math.round(bounds.width), height = Math.round(bounds.height);
    if (width !== renderWidth || height !== renderHeight) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderWidth = width; renderHeight = height;
    }
    const moving = !paused && !reducedMotion.matches;
    const changedView = previousView !== view;
    const blend = 1 - Math.exp(-dt * 3.5);
    if (moving) {
      time += dt;
      smoothScroll = THREE.MathUtils.lerp(smoothScroll, scroll, blend);
      smoothProgress = THREE.MathUtils.lerp(smoothProgress, THREE.MathUtils.clamp(1 - bounds.top / innerHeight, 0, 1), blend);
    }
    if (moving || changedView || !sceneInitialized) {
      const progress = moving ? smoothProgress : .5;
      const heroProgress = moving ? smoothScroll : 0;
      if (view) {
        const z = 20 - activeChapter * 19 - progress * 19 + Math.sin(time * .16) * 2;
        cameraTarget.set(riverCenter(z) + 3 + Math.sin(time * .2) * 1.8, 23 + activeChapter * 3 + progress * 6, z);
        lookTarget.set(riverCenter(z - 29), 1, z - 29);
        uniforms.uFlow.value = [1.2, 2.1, -2.6][activeChapter];
        terrain.scale.y = .8 + progress * .23;
      } else {
        uniforms.uFlow.value = 1.4 + heroProgress * 2;
        cameraTarget.set(Math.sin(time * .19) * 2.2 + heroProgress * 3, 12 + Math.sin(time * .14) * .8 + heroProgress * 4, 29 + Math.cos(time * .16) * 3 - heroProgress * 22);
        lookTarget.set(riverCenter(-35) * .25 + Math.sin(time * .12), 5 + heroProgress, -37 - heroProgress * 20);
        terrain.scale.y = 1 + heroProgress * .12;
      }
      // Do not interpolate across unrelated chapter viewpoints or when motion is disabled.
      const cameraBlend = changedView || !sceneInitialized || !moving ? 1 : blend;
      camera.position.lerp(cameraTarget, cameraBlend);
      smoothLook.lerp(lookTarget, cameraBlend);
      camera.lookAt(smoothLook);
      sceneInitialized = true;
    }
    previousView = view;
    if (moving) travel += dt * uniforms.uFlow.value;
    uniforms.uTime.value = time;
    uniforms.uTravel.value = travel;
    mist.forEach((sprite, index) => {
      const z = -index * 12 + 18;
      sprite.position.set(riverCenter(z) + Math.sin(time * .12 + index * 1.7) * 9, 2.5 + Math.sin(time * .2 + index) * .65, z);
      sprite.material.opacity = .5 + Math.sin(time * .22 + index) * .12;
    });
    for (let i = 0; i < 180; i++) {
      const z = THREE.MathUtils.euclideanModulo(hash(i, 15) * 155 - travel * 2.5, 155) - 125;
      const lane = (hash(i, 16) - .5) * 1.45;
      for (let end = 0; end < 2; end++) {
        const segmentZ = z + end * (.3 + hash(i, 17) * .9);
        const offset = i * 6 + end * 3;
        currentPositions[offset] = riverCenter(segmentZ) + lane * riverWidth(segmentZ);
        currentPositions[offset + 1] = .24 + Math.sin(segmentZ * 1.6 + travel) * .025;
        currentPositions[offset + 2] = segmentZ;
      }
    }
    currentGeometry.attributes.position.needsUpdate = true;
    particles.position.x = Math.sin(time * .22) * 1.5;
    particles.position.y = Math.sin(time * .3) * .65;
    renderer.render(scene, camera);
    if (view?.context) {
      if (view.preview.width !== width || view.preview.height !== height) { view.preview.width = width; view.preview.height = height; }
      view.context.drawImage(canvas, 0, 0, width, height);
      view.element.classList.add('scene-ready');
    }
  }
  requestAnimationFrame(render);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); canvas.style.opacity = '0'; });
  canvas.addEventListener('webglcontextrestored', () => { canvas.style.opacity = '1'; });
}
try { makeLandscape(); } catch (error) { document.querySelector('#world').style.display = 'none'; motionButton.hidden = true; console.warn('3D landscape unavailable; displaying a static landscape.', error); }

const chapterLinks = [...document.querySelectorAll('.chapter-nav a')];
const chapterObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) chapterLinks.forEach(link => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
}, { rootMargin: '-20% 0px -45% 0px', threshold: 0 });
document.querySelectorAll('.chapter').forEach(chapter => chapterObserver.observe(chapter));

const dialog = document.querySelector('#app-dialog');
const form = document.querySelector('#demo-form');
const amount = document.querySelector('#amount');
const asset = document.querySelector('#asset');
const tabs = [...document.querySelectorAll('[data-tab]')];
const result = document.querySelector('#demo-result');
let mode = 'Supply';
const explanations = {
  Supply: 'Explore supplying assets to the unified pool. Real-world rates vary and capital is at risk.',
  Borrow: 'Illustrative collateral requirement at 150%. Real borrowing requires collateral and carries liquidation risk.',
  Swap: 'Illustrative rate: 1 ETH = 2,500 USDC. This is not a live market quote. Fees and slippage are not included.',
};
function updateQuote() {
  const value = Math.max(0, Number(amount.value) || 0);
  const denomination = mode === 'Swap' ? (asset.value === 'USDC' ? 'ETH' : 'USDC') : asset.value;
  const total = mode === 'Borrow' ? value * 1.5 : mode === 'Swap' ? (asset.value === 'USDC' ? value / 2500 : value * 2500) : value;
  document.querySelector('#quote-value').textContent = `${total.toLocaleString('en-US', { maximumFractionDigits: denomination === 'ETH' ? 6 : 2, minimumFractionDigits: 2 })} ${denomination}`;
  result.textContent = '';
}
function setMode(next) {
  mode = next;
  tabs.forEach(tab => { const active = tab.dataset.tab === mode; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  document.querySelector('#amount-label').textContent = `You ${mode.toLowerCase()}`;
  document.querySelector('#quote-label').textContent = mode === 'Borrow' ? 'Demo collateral required' : mode === 'Swap' ? 'Estimated receive' : 'Your position';
  document.querySelector('#risk-note').textContent = explanations[mode];
  document.querySelector('.submit-demo').innerHTML = `Preview ${mode.toLowerCase()} <span>↗</span>`;
  updateQuote();
}
document.querySelectorAll('[data-launch]').forEach(button => button.addEventListener('click', () => {
  setMode(button.dataset.launch || 'Supply'); dialog.showModal(); document.body.classList.add('modal-open');
}));
document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => setMode(tab.dataset.tab));
  tab.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; setMode(tabs[next].dataset.tab); tabs[next].focus(); } });
});
amount.addEventListener('input', updateQuote);
asset.addEventListener('change', updateQuote);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  result.textContent = `✓ ${mode} preview ready for ${Number(amount.value).toLocaleString()} ${asset.value}. This is a simulation; no funds have moved.`;
});
