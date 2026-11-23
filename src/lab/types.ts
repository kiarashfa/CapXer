// Data shapes for the lab (v2). A "set" is one place (a studio now; outdoor
// places later), with the subjects that fit it and its lighting scenarios.
//
// Coordinates: metres, right-handed, y up. The subject's spot is the origin
// of each set's layout by convention; +z points from the subject towards the
// default camera, +x to the camera's right. The 3D scene and the top-view plan
// both read these numbers, so they always agree.
import type { Component } from 'svelte';

export type SetKind = 'indoor' | 'outdoor';

/** A point in the set, metres. */
export interface Point {
  x: number;
  y: number;
  z: number;
}

/** A simple shape standing in the set (shown in 3D and on the plan). */
export interface Prop {
  id: string;
  name: string;
  shape: 'box' | 'cylinder';
  /** Centre of the footprint on the floor (y = 0 is the floor). */
  at: { x: number; z: number };
  /** Box: width (x), depth (z), height. Cylinder: width = depth = diameter. */
  size: { w: number; d: number; h: number };
  /** sRGB hex colour. */
  colour: string;
  roughness?: number;
  metalness?: number;
  /**
   * A fan: blades `size.w` across turning in the x-y plane (facing the camera),
   * turns per second; shows shutter motion blur. Drawn as a stand + blades
   * instead of the plain shape.
   */
  spin?: number;
  /** Height of the spinning part's centre above the floor, metres (with spin). */
  spinAt?: number;
}

export interface Light {
  id: string;
  /** Short role name shown on the plan ("Key", "Fill", "Back"). */
  name: string;
  kind: 'spot' | 'point';
  at: Point;
  /** Where a spot points. */
  aim: Point;
  /** Luminous intensity in candela (three.js physical units). */
  candela: number;
  /** Size of the light's face, metres: 0 = hard (sharp shadows), larger = softer. */
  size: number;
  /** Spot cone half-angle, degrees. */
  angle?: number;
  /** Soft edge of the spot cone, 0 to 1. */
  penumbra?: number;
  /** Colour temperature, kelvin (used once white balance arrives in L4). */
  kelvin: number;
  castShadow: boolean;
}

export interface Lighting {
  id: string;
  name: string;
  lights: Light[];
  /** Soft light from the whole room (bounce), in lux at the subject. */
  ambient: number;
  /** Colour temperature of that bounce light, kelvin (default 5600). */
  ambientKelvin?: number;
}

export interface Room {
  /** Floor size, metres (x by z), centred on the subject. */
  width: number;
  depth: number;
  /** z of the background wall (behind the subject, negative). */
  wallZ: number;
  wallHeight: number;
  wallColour: string;
  floorColour: string;
}

export interface SetDef {
  id: string;
  name: string;
  kind: SetKind;
  room: Room;
  /** Where the camera stands by default (lens height and floor position). */
  camera: Point;
  props: Prop[];
  /** Subject ids from the subjects registry that fit this set; the first is the default. */
  subjects: string[];
  /** The first is the default. */
  lighting: Lighting[];
  /** The set's own 3D component, loaded only when the set is chosen. */
  load: () => Promise<{ default: Component<{ set: SetDef }> }>;
}

export interface SubjectDef {
  id: string;
  name: string;
  /** Standing height, metres. */
  height: number;
  /** Height the camera focuses on (eyes), metres. */
  focusHeight: number;
  /** Footprint radius on the plan, metres. */
  radius: number;
  load: () => Promise<{ default: Component<{ height: number }> }>;
}
