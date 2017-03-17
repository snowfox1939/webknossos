// @flow
import type { Vector2, Vector3, Vector4, OrthoViewType, OrthoViewMapType } from "oxalis/constants";
import type { BoundingBoxType } from "oxalis/model";
import type { Flycam3DType, OxalisState } from "oxalis/store";
import constants, { OrthoViews, OrthoViewValues } from "oxalis/constants";
import Maybe from "data.maybe";
import Dimensions from "oxalis/model/dimensions";
import { getPosition } from "oxalis/model/accessors/flycam3d_accessor";
import * as scaleInfo from "oxalis/model/scaleinfo";
import _ from "lodash";
import Utils from "libs/utils";

const MAX_TEXTURE_OFFSET = 31;
const MAX_ZOOM_THRESHOLD = 2;
const PIXEL_RAY_THRESHOLD = 10;

function log2(a: number): number {
  return Math.log(a) / Math.LN2;
}

// maximum difference between requested coordinate and actual texture position
export const MAX_ZOOM_STEP_DIFF = Math.min(
  MAX_ZOOM_THRESHOLD,
  (constants.TEXTURE_WIDTH - MAX_TEXTURE_OFFSET) / constants.VIEWPORT_WIDTH,
);

export function getMaxZoomStep(state: OxalisState): number {
  return 1 + Maybe.fromNullable(state.dataset)
    .map(dataset =>
      dataset.dataLayers.reduce((maxZoomStep, layer) =>
        Math.max(maxZoomStep, ...layer.resolutions), 0))
    .getOrElse(1);
}

export function getIntegerZoomStep(state: OxalisState): number {
  return Math.floor(state.flycam3d.zoomStep);
}

export function getRequestLogZoomStep(state: OxalisState): number {
  return Utils.clamp(
    0,
    Math.ceil(log2(state.flycam3d.zoomStep / MAX_ZOOM_STEP_DIFF)) + state.datasetConfiguration.quality,
    log2(getMaxZoomStep(state)),
  );
}

export function calculateTextureBuffer(state: OxalisState): OrthoViewMapType<Vector2> {
  // buffer: how many pixels is the texture larger than the canvas on each dimension?
  // --> two dimensional array with buffer[planeId][dimension], dimension: x->0, y->1
  const pixelNeeded = constants.VIEWPORT_WIDTH * getTextureScalingFactor(state);
  const baseVoxelFactors = scaleInfo.getBaseVoxelFactors(state.dataset.scale);
  const buffer = {};
  for (const planeId of OrthoViewValues) {
    const scaleArray = Dimensions.transDim(baseVoxelFactors, planeId);
    buffer[planeId] = [
      constants.TEXTURE_WIDTH - (pixelNeeded * scaleArray[0]),
      constants.TEXTURE_WIDTH - (pixelNeeded * scaleArray[1]),
    ];
  }
  return buffer;
}

export function getTextureScalingFactor(state: OxalisState): number {
  return state.flycam3d.zoomStep / Math.pow(2, getRequestLogZoomStep(state));
}

export function getPlaneScalingFactor(flycam3d: Flycam3DType): number {
  return flycam3d.zoomStep;
}

export function getRotationOrtho(planeId: OrthoViewType): Vector3 {
  switch (planeId) {
    case OrthoViews.PLANE_YZ: return [0, 270, 0];
    case OrthoViews.PLANE_XZ: return [90, 0, 0];
    default:
    case OrthoViews.PLANE_XY: return [0, 0, 0];
  }
}

export function getViewportBoundingBox(state: OxalisState): BoundingBoxType {
  const position = getPosition(state.flycam3d);
  const offset = (getPlaneScalingFactor(state.flycam3d) * constants.VIEWPORT_WIDTH) / 2;
  const baseVoxelFactors = scaleInfo.getBaseVoxelFactors(state.dataset.scale);
  const min = [0, 0, 0];
  const max = [0, 0, 0];

  for (let i = 0; i <= 2; i++) {
    min[i] = position[i] - (offset * baseVoxelFactors[i]);
    max[i] = position[i] + (offset * baseVoxelFactors[i]);
  }

  return { min, max };
}

export function getTexturePosition(state: OxalisState, planeId: OrthoViewType): Vector3 {
  const texturePosition = _.clone(getPosition(state.flycam3d));
  // As the Model does not render textures for exact positions, the last 5 bits of
  // the X and Y coordinates for each texture have to be set to 0
  for (let i = 0; i <= 2; i++) {
    if (i !== Dimensions.getIndices(planeId)[2]) {
      texturePosition[i] &= -1 << (5 + getRequestLogZoomStep(state));
    }
  }
  return texturePosition;
}

export function getOffsets(state: OxalisState, planeId: OrthoViewType): Vector2 {
  // return the coordinate of the upper left corner of the viewport as texture-relative coordinate
  const buffer = calculateTextureBuffer(state);
  const position = getPosition(state.flycam3d);
  const requestZoomStep = Math.pow(2, getRequestLogZoomStep(state));
  const texturePosition = getTexturePosition(state, planeId);
  const ind = Dimensions.getIndices(planeId);
  return [
    (buffer[planeId][0] / 2) + ((position[ind[0]] - texturePosition[ind[0]]) / requestZoomStep),
    (buffer[planeId][1] / 2) + ((position[ind[1]] - texturePosition[ind[1]]) / requestZoomStep),
  ];
}

export function getArea(state: OxalisState, planeId: OrthoViewType): Vector4 {
  // returns [left, top, right, bottom] array

  // convert scale vector to array in order to be able to use getIndices()
  const scaleArray = Dimensions.transDim(scaleInfo.getBaseVoxelFactors(state.dataset.scale), planeId);
  const offsets = getOffsets(state, planeId);
  const size = getTextureScalingFactor(state) * constants.VIEWPORT_WIDTH;
  // two pixels larger, just to fight rounding mistakes (important for mouse click conversion)
  // [offsets[0] - 1, offsets[1] - 1, offsets[0] + size * scaleArray[ind[0]] + 1, offsets[1] + size * scaleArray[ind[1]] + 1]
  return [
    offsets[0],
    offsets[1],
    offsets[0] + (size * scaleArray[0]),
    offsets[1] + (size * scaleArray[1]),
  ];
}

export function getAreas(state: OxalisState): OrthoViewMapType<Vector4> {
  return {
    [OrthoViews.PLANE_XY]: getArea(state, OrthoViews.PLANE_XY),
    [OrthoViews.PLANE_XZ]: getArea(state, OrthoViews.PLANE_XZ),
    [OrthoViews.PLANE_YZ]: getArea(state, OrthoViews.PLANE_YZ),
  };
}

export function getRayThreshold(flycam3d: Flycam3DType): number {
  return PIXEL_RAY_THRESHOLD * flycam3d.zoomStep;
}
