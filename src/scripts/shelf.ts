import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import type { SauceForShelf } from '../lib/sauces';
import { createBottle, BOTTLE_HEIGHT } from './bottle';

gsap.registerPlugin(Observer);

const SPACING = 2.0; // world units between bottles
const THROW_SECONDS = 0.35; // how far a flick carries: release velocity × this
const MAX_THROW = 10; // bottles
const WHEEL_SETTLE_MS = 160; // snap to a bottle this long after the wheel stops
// How quickly the shelf catches up to its target each frame.
const FOLLOW = { drag: 0.4, glide: 0.075, settle: 0.12 };

/** Wrap x into [-n/2, n/2). */
const wrapCentered = (x: number, n: number) => ((((x + n / 2) % n) + n) % n) - n / 2;
const mod = (x: number, n: number) => ((x % n) + n) % n;

/**
 * The shelf is a fixed, full-screen canvas. The page itself never scrolls; swipes, drags,
 * the wheel and arrow keys move a position measured in "bottles". It's unbounded and the
 * bottles are placed modulo n, so the shelf loops forever.
 */
export function initShelf() {
  const section = document.querySelector<HTMLElement>('[data-shelf]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-shelf-canvas]');
  const dataEl = document.getElementById('sauce-data');
  if (!section || !canvas || !dataEl) return;

  const sauces: SauceForShelf[] = JSON.parse(dataEl.textContent || '[]');
  const n = sauces.length;
  if (!n) return;

  const captions = [...section.querySelectorAll<HTMLElement>('[data-caption]')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Renderer / scene -----------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  // Solid black inside the scene, so the see-through sauce has something dark to show.
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
  /** Screen pixels between neighbouring bottles; makes a drag track the finger 1:1. */
  let pxPerBottle = 300;

  function resizeCanvas() {
    const w = canvas!.clientWidth;
    const h = canvas!.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fill most of the height with the bottle; on phones keep ~1.3 bottles across.
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeight = (BOTTLE_HEIGHT * 1.2) / 2 / Math.tan(vFov / 2);
    const fitWidth = (SPACING * 1.3) / 2 / Math.tan(vFov / 2) / camera.aspect;
    const distance = Math.max(fitHeight, fitWidth);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const visibleWidth = 2 * distance * Math.tan(vFov / 2) * camera.aspect;
    pxPerBottle = (SPACING / visibleWidth) * w;
  }
  // Observe the canvas itself: it can be 0×0 at startup if CSS arrives late.
  new ResizeObserver(resizeCanvas).observe(canvas);

  // --- Input: swipe / drag / wheel / keys -----------------------------------
  const state = { index: -1, target: 0, current: 0, follow: FOLLOW.settle };

  function setActive(i: number) {
    if (i === state.index) return;
    state.index = i;
    captions.forEach((c, j) => c.toggleAttribute('aria-current', j === i));
  }
  setActive(0);

  const goTo = (target: number, follow = FOLLOW.settle) => {
    state.target = target;
    state.follow = follow;
    setActive(mod(Math.round(target), n));
  };
  const step = (dir: number) => goTo(Math.round(state.target) + dir);
  /** Use whichever axis is moving more, so horizontal and vertical swipes both work. */
  const dominant = (x: number, y: number) => (Math.abs(x) >= Math.abs(y) ? x : y);

  // Drag follows the finger 1:1. On release the shelf is thrown with the finger's
  // velocity, glides, and settles on the nearest bottle to where it would stop.
  Observer.create({
    target: section,
    type: 'touch,pointer',
    dragMinimum: 3,
    preventDefault: true,
    onPress() {
      // Grab: stop any glide where it currently is.
      goTo(state.current, FOLLOW.drag);
    },
    onDrag(self) {
      goTo(state.target - dominant(self.deltaX, self.deltaY) / pxPerBottle, FOLLOW.drag);
    },
    onDragEnd(self) {
      const v = dominant(self.velocityX, self.velocityY); // px per second
      const thrown = gsap.utils.clamp(-MAX_THROW, MAX_THROW, (-v * THROW_SECONDS) / pxPerBottle);
      goTo(Math.round(state.target + thrown), Math.abs(thrown) > 0.6 ? FOLLOW.glide : FOLLOW.settle);
    },
  });

  // Wheel / trackpad: moves freely with the gesture, then settles on a bottle.
  let wheelTimer = 0;
  Observer.create({
    target: window,
    type: 'wheel',
    preventDefault: true,
    onChange(self) {
      goTo(state.target + dominant(self.deltaX, self.deltaY) / pxPerBottle, FOLLOW.drag);
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => goTo(Math.round(state.target), FOLLOW.glide), WHEEL_SETTLE_MS);
    },
  });

  addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) step(1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) step(-1);
    else return;
    e.preventDefault();
  });

  // --- Render loop ----------------------------------------------------------
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    // Ease toward the target: tight while dragging, long and soft after a flick.
    state.current += (state.target - state.current) * (reduceMotion ? 1 : state.follow);

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
