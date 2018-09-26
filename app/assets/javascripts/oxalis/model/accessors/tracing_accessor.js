// @flow

import type { Tracing, VolumeTracing, SkeletonTracing, ReadOnlyTracing } from "oxalis/store";
import type {
  HybridServerTracing,
  ServerSkeletonTracing,
  ServerVolumeTracing,
} from "admin/api_flow_types";

export function getSomeTracing(
  tracing: Tracing,
): SkeletonTracing | VolumeTracing | ReadOnlyTracing {
  if (tracing.skeleton != null) {
    return tracing.skeleton;
  } else if (tracing.volume != null) {
    return tracing.volume;
  } else if (tracing.readOnly != null) {
    return tracing.readOnly;
  }
  throw new Error("The active tracing does not contain skeletons nor volume data");
}

export function getSomeServerTracing(
  tracing: HybridServerTracing,
): ServerSkeletonTracing | ServerVolumeTracing {
  if (tracing.skeleton != null) {
    return tracing.skeleton;
  } else if (tracing.volume != null) {
    return tracing.volume;
  }
  throw new Error("The active tracing does not contain skeletons nor volume data");
}

export default {};
