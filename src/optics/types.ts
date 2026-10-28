/** A rectangular image area on the sensor or film, in millimetres. */
export interface Area {
  width: number;
  height: number;
}

/** Field of view in degrees along each axis. */
export interface FieldOfView {
  horizontal: number;
  vertical: number;
  diagonal: number;
}
