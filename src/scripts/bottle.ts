import * as THREE from 'three';
import type { SauceForShelf } from '../lib/sauces';

/**
 * A procedural standard 5 oz "woozy" hot sauce bottle: tall glass body, sloped shoulder,
 * long narrow neck, sauce inside, a ribbed cap, and the label wrapped around the body.
 */

// Outer glass profile (radius, height), bottom to top. Proportions follow a classic
// 5 oz woozy: straight body, short rounded shoulder, thick neck under a wide cap.
const GLASS_PROFILE: [number, number][] = [
  [0, 0],
  [0.54, 0],
  [0.585, 0.03],
  [0.6, 0.12],
  [0.6, 2.45], // top of the straight body
  [0.592, 2.56],
  [0.565, 2.67],
  [0.515, 2.78],
  [0.45, 2.88],
  [0.39, 2.97],
  [0.358, 3.06],
  [0.348, 3.18],
  [0.335, 3.92], // thick neck, tapering slightly
  [0.355, 3.95], // pour bead under the cap
  [0.355, 4.02],
  [0.0, 4.02],
];

export const BOTTLE_HEIGHT = 4.5;
const BODY_RADIUS = 0.6;
// Label band sits inside the straight body with a clear margin of glass above and below.
const LABEL_BOTTOM = 0.38;
const LABEL_TOP = 2.26;
const LABEL_MAX_THETA = Math.PI * 2 * 0.93; // leave a seam gap at the back
const SAUCE_FILL = 3.5; // sauce sits partway up the neck, leaving clear glass above
const GLASS_WALL = 0.03;
const GLASS_BASE = 0.1; // thick glass bottom

function lathe(points: [number, number][], segments = 64) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function sauceProfile(): [number, number][] {
  // Inset the glass profile and cut it at the fill line.
  const pts: [number, number][] = [[0, GLASS_BASE]];
  for (const [r, y] of GLASS_PROFILE.slice(1, -1)) {
    if (y < GLASS_BASE) continue;
    if (y > SAUCE_FILL) break;
    pts.push([Math.max(r - GLASS_WALL, 0.02), y]);
  }
  const lastR = pts[pts.length - 1][0];
  pts.push([lastR, SAUCE_FILL], [0, SAUCE_FILL]);
  return pts;
}

// Shared across all bottles.
const glassGeometry = lathe(GLASS_PROFILE);
const sauceGeometry = lathe(sauceProfile());
// Clear glass drawn as reflections only: a black base added on top of what's behind it,
// so the bottle never brightens the inside, it only picks up highlights and rim light.
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x000000,
  metalness: 0,
  roughness: 0.04,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.6,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function makeCap(color: THREE.ColorRepresentation) {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.37, 0.5, 48, 1), material);
  body.position.y = 4.21;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.04, 48, 1), material);
  top.position.y = 4.48;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.39, 0.06, 48, 1), material);
  ring.position.y = 3.96;
  // Grip ridges around the cap
  const RIDGES = 40;
  const ridges = new THREE.InstancedMesh(new THREE.BoxGeometry(0.024, 0.4, 0.024), material, RIDGES);
  const m = new THREE.Matrix4();
  for (let i = 0; i < RIDGES; i++) {
    const a = (i / RIDGES) * Math.PI * 2;
    m.makeRotationY(-a).setPosition(Math.sin(a) * 0.367, 4.23, Math.cos(a) * 0.367);
    ridges.setMatrixAt(i, m);
  }
  group.add(body, top, ring, ridges);
  return group;
}

function makeLabel(texture: THREE.Texture, sauce: SauceForShelf) {
  // Height comes from the CMS (fraction of the label area); width follows the PNG's
  // own aspect ratio, so different-sized labels wrap different amounts of the bottle.
  const areaHeight = LABEL_TOP - LABEL_BOTTOM;
  const radius = BODY_RADIUS + 0.006;
  let height = areaHeight * sauce.labelHeight;
  let theta = (height * sauce.labelAspect) / radius;
  if (theta > LABEL_MAX_THETA) {
    // Very wide label: shrink to fit around the bottle instead of overlapping itself.
    height *= LABEL_MAX_THETA / theta;
    theta = LABEL_MAX_THETA;
  }
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true, -theta / 2, theta);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    roughness: 0.55,
    metalness: 0,
    side: THREE.FrontSide,
    // Keep the printed colours true to the artwork instead of running them through ACES.
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = LABEL_BOTTOM + areaHeight / 2;
  mesh.renderOrder = 2;
  return mesh;
}

export function createBottle(sauce: SauceForShelf, texture: THREE.Texture) {
  const bottle = new THREE.Group();
  bottle.name = sauce.id;

  const sauceMesh = new THREE.Mesh(
    sauceGeometry,
    // See-through sauce: light passing through it picks up the sauce colour.
    new THREE.MeshPhysicalMaterial({
      color: sauce.sauceColor,
      roughness: 0.18,
      metalness: 0,
      transmission: 0.55,
      thickness: 1.0,
      ior: 1.36,
      attenuationColor: new THREE.Color(sauce.sauceColor),
      attenuationDistance: 0.9,
    }),
  );
  const glass = new THREE.Mesh(glassGeometry, glassMaterial);
  glass.renderOrder = 1; // after the sauce, before the label

  bottle.add(sauceMesh, glass, makeCap(sauce.capColor), makeLabel(texture, sauce));
  // Centre vertically around the origin so camera framing is simple.
  bottle.position.y = -BOTTLE_HEIGHT / 2;
  const pivot = new THREE.Group();
  pivot.add(bottle);
  return pivot;
}
