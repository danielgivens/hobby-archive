import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { SauceForShelf } from '../lib/sauces';
import { createBottle, BOTTLE_HEIGHT } from './bottle';

gsap.registerPlugin(ScrollTrigger);

const SPACING = 2.0; // world units between bottles
const SCROLL_PER_BOTTLE = 0.9; // viewport heights of scrolling per bottle
const COPIES = 3; // the scroll track holds 3 laps; we keep the reader in the middle one

/** Wrap x into [-n/2, n/2). */
const wrapCentered = (x: number, n: number) => ((((x + n / 2) % n) + n) % n) - n / 2;
const mod = (x: number, n: number) => ((x % n) + n) % n;

export function initShelf() {
  const track = document.querySelector<HTMLElement>('[data-shelf-track]');
  const section = document.querySelector<HTMLElement>('[data-shelf]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-shelf-canvas]');
  const dataEl = document.getElementById('sauce-data');
  if (!track || !section || !canvas || !dataEl) return;

  const sauces: SauceForShelf[] = JSON.parse(dataEl.textContent || '[]');
  const n = sauces.length;
  if (!n) return;

  const captions = [...section.querySelectorAll<HTMLElement>('[data-caption]')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // --- Renderer / scene -----------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  // Solid black inside the scene too. With a transparent canvas, the see-through
  // sauce has nothing to refract and reads as white inside.
  scene.background = new THREE.Color(0x000000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 6);
  const rim = new THREE.DirectionalLight(0xffd2a8, 1.2);
  rim.position.set(-5, 3, -4);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // --- Bottles --------------------------------------------------------------
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const bottles = sauces.map((sauce) => {
    const texture = loader.load(sauce.labelUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAniso;
    const bottle = createBottle(sauce, texture);
    scene.add(bottle);
    return bottle;
  });

  // --- Sizing ---------------------------------------------------------------
  function resizeCanvas() {
    const w = canvas!.clientWidth;
    const h = canvas!.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fill most of the height with the bottle; on phones keep ~1.3 bottles across.
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeight = (BOTTLE_HEIGHT * 1.12) / 2 / Math.tan(vFov / 2);
    const fitWidth = (SPACING * 1.3) / 2 / Math.tan(vFov / 2) / camera.aspect;
    camera.position.set(0, 0, Math.max(fitHeight, fitWidth));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  // Observe the canvas itself: it can be 0×0 at startup if CSS arrives late.
  new ResizeObserver(resizeCanvas).observe(canvas);

  // --- Infinite scroll ------------------------------------------------------
  // Scroll position is measured in "bottles". The track is COPIES laps long; whenever the
  // reader drifts out of the middle lap we silently jump the scroll by one lap. Bottles are
  // placed modulo n, so the jump is invisible.
  const state = { index: -1, target: n, current: n };
  const perBottle = () => innerHeight * SCROLL_PER_BOTTLE;
  const lapPx = () => n * perBottle();

  function sizeTrack() {
    track!.style.height = `${COPIES * lapPx() + innerHeight}px`;
  }
  sizeTrack();

  function setActive(i: number) {
    if (i === state.index) return;
    state.index = i;
    captions.forEach((c, j) => c.toggleAttribute('aria-current', j === i));
  }
  setActive(0);

  function jump(bottlesDelta: number) {
    state.current += bottlesDelta;
    state.target += bottlesDelta;
    window.scrollTo(0, scrollY + bottlesDelta * perBottle());
  }

  const trigger = ScrollTrigger.create({
    trigger: track,
    start: 'top top',
    end: 'bottom bottom',
    snap: { snapTo: 1 / (COPIES * n), duration: { min: 0.2, max: 0.6 }, ease: 'power2.inOut' },
    onRefresh: sizeTrack,
    onUpdate(self) {
      const pos = self.scroll() / perBottle();
      // Keep the reader in the middle lap: jump before reaching either end of the track.
      if (pos < n * 0.5) return jump(n);
      if (pos > n * 2.5) return jump(-n);
      state.target = pos;
      setActive(mod(Math.round(pos), n));
    },
  });

  // Start on the first sauce in the middle lap.
  window.scrollTo(0, n * perBottle());
  addEventListener('resize', () => {
    // Keep the same bottle in view when the viewport (and so the track) changes size.
    const keep = state.index;
    sizeTrack();
    ScrollTrigger.refresh();
    window.scrollTo(0, (n + keep) * perBottle());
    state.current = state.target = n + keep;
  });
  void trigger;

  // --- Render loop ----------------------------------------------------------
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    // Ease toward the scroll target so the shelf glides rather than steps.
    state.current += (state.target - state.current) * (reduceMotion ? 1 : 0.12);

    bottles.forEach((bottle, i) => {
      const offset = wrapCentered(i - state.current, n); // 0 = centred
      bottle.position.x = offset * SPACING;
      // Turn the label toward the camera as each bottle passes through centre.
      bottle.rotation.y = -offset * 0.6 + (reduceMotion ? 0 : Math.sin(t * 0.6 + i) * 0.06);
      bottle.position.y = reduceMotion ? 0 : Math.sin(t * 0.9 + i * 1.3) * 0.05;
      bottle.scale.setScalar(1 - Math.min(Math.abs(offset), 1.5) * 0.12);
      // Hide the bottles that are wrapping around behind the edges of the frame.
      bottle.visible = Math.abs(offset) < n / 2 - 0.5;
    });
    renderer.render(scene, camera);
  });
}
