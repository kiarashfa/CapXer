// The viewfinder "setup": the user's choices only. Everything else is derived
// (src/setup/derive.ts). This shape is also the future save/share format (P6),
// so it carries a version number.

export type Mode = 'cinema' | 'stills';
export type FocalEntry = 'actual' | 'equivalent';
export type FrameColor = 'accent' | 'amber' | 'white' | 'red';
export type PanelId = 'camera' | 'frame' | 'lens' | 'guides' | 'info';

export interface Guides {
  thirds: boolean;
  golden: boolean;
  centre: boolean;
  safe: boolean;
}

export interface Setup {
  v: 1;
  mode: Mode;
  /** "<maker>/<model>" from the database, or "custom/<n>" for a custom sensor. */
  sensorId: string;
  formatId: string;
  /** Aspect preset id (see presets.ts); "full" means the format's own shape. */
  aspect: string;
  /** Anamorphic squeeze; 1 = spherical. */
  squeeze: number;
  /** Actual focal length in mm (always stored as actual, whatever the entry mode). */
  focal: number;
  focalEntry: FocalEntry;
  guides: Guides;
  frameColor: FrameColor;
  /** Mask strength outside the frame, 0 to 0.9. */
  mask: number;
  /** Subject distance in metres, for the frame-size readout. */
  distance: number;
}

/** A sensor the user typed in. Lives for the session only in P3 (saving comes in P6). */
export interface CustomSensor {
  id: string;
  name: string;
  width: number;
  height: number;
  squeeze: number;
}
