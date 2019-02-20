// @flow
import * as THREE from "three";
import _ from "lodash";

import { DataBucket, bucketDebuggingFlags } from "oxalis/model/bucket_data_handling/bucket";
import { createUpdatableTexture } from "oxalis/geometries/materials/plane_material_factory_helpers";
import { getMaxZoomStepDiff } from "oxalis/model/bucket_data_handling/loading_strategy_logic";
import { getRenderer } from "oxalis/controller/renderer";
import { waitForCondition } from "libs/utils";
import Store from "oxalis/store";
import UpdatableTexture from "libs/UpdatableTexture";
import constants, { type Vector4, addressSpaceDimensions } from "oxalis/constants";
import window from "libs/window";

// A TextureBucketManager instance is responsible for making buckets available
// to the GPU.
// setActiveBuckets can be called with an array of buckets, which will be
// written into the dataTexture and lookUpTexture of this class instance.
// Buckets which are already in this texture won't be written again.
// Buckets which are not needed anymore will be replaced by other buckets.

// A bucket is considered "active" if it is supposed to be in the data texture.
// A bucket is considered "committed" if it is indeed in the data texture.
// Active buckets will be pushed into a writerQueue which is processed by
// writing buckets to the data texture (i.e., "committing the buckets").

const lookUpBufferWidth = constants.LOOK_UP_TEXTURE_WIDTH;

// At the moment, we only store one float f per bucket.
// If f >= 0, f denotes the index in the data texture where the bucket is stored.
// If f == -1, the bucket is not yet committed
// If f == -2, the bucket is not supposed to be rendered. Out of bounds.
const channelCountForLookupBuffer = 2;

export default class TextureBucketManager {
  dataTextures: Array<UpdatableTexture>;
  lookUpBuffer: Float32Array;
  lookUpTexture: THREE.DataTexture;
  // Holds the index for each active bucket, to which it should (or already
  // has been was) written in the data texture.
  activeBucketToIndexMap: Map<DataBucket, number> = new Map();
  // Maintains the set of committed buckets
  committedBucketSet: WeakSet<DataBucket> = new WeakSet();
  // Maintains a set of free indices within the data texture.
  freeIndexSet: Set<number>;
  isRefreshBufferOutOfDate: boolean = false;

  currentAnchorPoint: Vector4 = [0, 0, 0, 0];
  writerQueue: Array<{ bucket: DataBucket, _index: number }> = [];
  textureWidth: number;
  dataTextureCount: number;
  maximumCapacity: number;
  packingDegree: number;

  constructor(textureWidth: number, dataTextureCount: number, bytes: number) {
    // If there is one byte per voxel, we pack 4 bytes into one texel (packingDegree = 4)
    // Otherwise, we don't pack bytes together (packingDegree = 1)
    this.packingDegree = bytes === 1 ? 4 : 1;

    this.maximumCapacity =
      (this.packingDegree * dataTextureCount * textureWidth ** 2) / constants.BUCKET_SIZE;
    // the look up buffer is addressSpaceDimensions**3 so that arbitrary look ups can be made
    const lookUpBufferSize = Math.pow(lookUpBufferWidth, 2) * channelCountForLookupBuffer;
    this.textureWidth = textureWidth;
    this.dataTextureCount = dataTextureCount;

    this.lookUpBuffer = new Float32Array(lookUpBufferSize);
    this.freeIndexSet = new Set(_.range(this.maximumCapacity));

    this.dataTextures = [];
  }

  async startRAFLoops() {
    await waitForCondition(
      () => this.lookUpTexture.isInitialized() && this.dataTextures[0].isInitialized(),
    );

    this.keepLookUpBufferUpToDate();
    this.processWriterQueue();
  }

  clear() {
    this.setActiveBuckets([], [0, 0, 0, 0]);
  }

  freeBucket(bucket: DataBucket): void {
    const unusedIndex = this.activeBucketToIndexMap.get(bucket);
    if (unusedIndex == null) {
      return;
    }
    if (bucketDebuggingFlags.visualizeBucketsOnGPU) {
      bucket.unvisualize();
    }
    this.activeBucketToIndexMap.delete(bucket);
    this.committedBucketSet.delete(bucket);
    this.freeIndexSet.add(unusedIndex);
  }

  // Takes an array of buckets (relative to an anchorPoint) and ensures that these
  // are written to the dataTexture. The lookUpTexture will be updated to reflect the
  // new buckets.
  setActiveBuckets(buckets: Array<DataBucket>, anchorPoint: Vector4): void {
    this.currentAnchorPoint = anchorPoint;
    window.currentAnchorPoint = anchorPoint;
    // Find out which buckets are not needed anymore
    const freeBucketSet = new Set(this.activeBucketToIndexMap.keys());
    for (const bucket of buckets) {
      freeBucketSet.delete(bucket);
    }

    // Remove unused buckets
    const freeBuckets = Array.from(freeBucketSet.values());
    for (const freeBucket of freeBuckets) {
      this.freeBucket(freeBucket);
    }

    const freeIndexArray = Array.from(this.freeIndexSet);
    for (const nextBucket of buckets) {
      if (!this.activeBucketToIndexMap.has(nextBucket)) {
        if (freeIndexArray.length === 0) {
          throw new Error("A new bucket should be stored but there is no space for it?");
        }
        const freeBucketIdx = freeIndexArray.shift();
        this.reserveIndexForBucket(nextBucket, freeBucketIdx);
      }
    }

    this._refreshLookUpBuffer();
  }

  getPackedBucketSize() {
    return constants.BUCKET_SIZE / this.packingDegree;
  }

  keepLookUpBufferUpToDate() {
    if (this.isRefreshBufferOutOfDate) {
      this._refreshLookUpBuffer();
    }
    window.requestAnimationFrame(() => {
      this.keepLookUpBufferUpToDate();
    });
  }

  // Commit "active" buckets by writing these to the dataTexture.
  processWriterQueue() {
    // uniqBy removes multiple write-buckets-requests for the same index.
    // It preserves the first occurence of each duplicate, which is why
    // this queue has to be filled from the front (via unshift) und read from the
    // back (via pop). This ensures that the newest bucket "wins" if there are
    // multiple buckets for the same index.
    this.writerQueue = _.uniqBy(this.writerQueue, el => el._index);
    const maxTimePerFrame = 16;
    const startingTime = performance.now();

    const packedBucketSize = this.getPackedBucketSize();
    const bucketHeightInTexture = packedBucketSize / this.textureWidth;
    const bucketsPerTexture = (this.textureWidth * this.textureWidth) / packedBucketSize;

    while (performance.now() - startingTime < maxTimePerFrame && this.writerQueue.length > 0) {
      const { bucket, _index } = this.writerQueue.pop();
      if (!this.activeBucketToIndexMap.has(bucket)) {
        // This bucket is not needed anymore
        continue;
      }

      const dataTextureIndex = Math.floor(_index / bucketsPerTexture);
      const indexInDataTexture = _index % bucketsPerTexture;

      if (bucketDebuggingFlags.visualizeBucketsOnGPU) {
        bucket.visualize();
      }

      this.dataTextures[dataTextureIndex].update(
        bucket.getData(),
        0,
        bucketHeightInTexture * indexInDataTexture,
        this.textureWidth,
        bucketHeightInTexture,
      );
      this.committedBucketSet.add(bucket);
      // bucket.setVisualizationColor("#00ff00");
      // bucket.visualize();

      window.needsRerender = true;
      this.isRefreshBufferOutOfDate = true;
    }

    window.requestAnimationFrame(() => {
      this.processWriterQueue();
    });
  }

  getTextures(): Array<THREE.DataTexture | UpdatableTexture> {
    return [this.lookUpTexture].concat(this.dataTextures);
  }

  setupDataTextures(bytes: number): void {
    for (let i = 0; i < this.dataTextureCount; i++) {
      const dataTexture = createUpdatableTexture(
        this.textureWidth,
        bytes * this.packingDegree,
        THREE.UnsignedByteType,
        getRenderer(),
      );

      this.dataTextures.push(dataTexture);
    }

    const lookUpTexture = createUpdatableTexture(
      lookUpBufferWidth,
      channelCountForLookupBuffer,
      THREE.FloatType,
      getRenderer(),
    );
    this.lookUpTexture = lookUpTexture;

    this.startRAFLoops();
  }

  getLookUpBuffer() {
    return this.lookUpBuffer;
  }

  // Assign an index to an active bucket and enqueue the bucket-index-tuple
  // to the writerQueue. Also, make sure that the bucket data is updated if
  // it changes.
  reserveIndexForBucket(bucket: DataBucket, index: number): void {
    this.freeIndexSet.delete(index);
    this.activeBucketToIndexMap.set(bucket, index);

    const enqueueBucket = _index => {
      if (!bucket.hasData()) {
        return;
      }
      this.writerQueue.unshift({ bucket, _index });
    };
    enqueueBucket(index);

    let debouncedUpdateBucketData;
    const updateBucketData = () => {
      // Check that the bucket is still in the data texture.
      // Also the index could have changed, so retrieve the index again.
      const bucketIndex = this.activeBucketToIndexMap.get(bucket);
      if (bucketIndex != null) {
        enqueueBucket(bucketIndex);
      } else {
        bucket.off("bucketLabeled", debouncedUpdateBucketData);
      }
    };

    if (!bucket.hasData()) {
      bucket.on("bucketLoaded", updateBucketData);
    }
    bucket.on("bucketLabeled", updateBucketData);
    bucket.once("bucketCollected", () => {
      bucket.off("bucketLabeled", updateBucketData);
      bucket.off("bucketLoaded", updateBucketData);
      this.freeBucket(bucket);
    });
  }

  _refreshLookUpBuffer() {
    /* This method completely completely re-writes the lookup buffer. This could be smarter, but it's
     * probably not worth it.
     * It works as follows:
     * - write -2 into the entire buffer as a fallback
     * - iterate over all buckets which should be available to the GPU
     * - only consider the buckets in the native zoomStep (=> zoomStep === 0)
     * - if the current bucket was committed, write the address for that bucket into the look up buffer
     * - otherwise, check whether the bucket's fallback bucket is committed so that this can be written into
     *   the look up buffer (repeat for the next fallback if the bucket wasn't committed).
     */

    this.lookUpBuffer.fill(-2);
    const maxZoomStepDiff = getMaxZoomStepDiff(
      Store.getState().datasetConfiguration.loadingStrategy,
    );

    const currentZoomStep = this.currentAnchorPoint[3];
    for (const [bucket, reservedAddress] of this.activeBucketToIndexMap.entries()) {
      if (bucket.zoomedAddress[3] > currentZoomStep) {
        // only write high-res buckets (if a bucket is missing, the fallback bucket will then be written
        // into the look up buffer)
        continue;
      }
      const lookUpIdx = this._getBucketIndex(bucket);
      const posInBuffer = channelCountForLookupBuffer * lookUpIdx;

      let address = -1;
      let bucketZoomStep = bucket.zoomedAddress[3];
      if (!bucketDebuggingFlags.enforcedZoomDiff && this.committedBucketSet.has(bucket)) {
        address = reservedAddress;
      } else {
        let fallbackBucket = bucket.getFallbackBucket();
        let abortFallbackLoop = false;
        const maxAllowedZoomStep =
          currentZoomStep + (bucketDebuggingFlags.enforcedZoomDiff || maxZoomStepDiff);

        while (!abortFallbackLoop) {
          if (fallbackBucket.type !== "null") {
            if (
              fallbackBucket.zoomedAddress[3] <= maxAllowedZoomStep &&
              this.committedBucketSet.has(fallbackBucket)
            ) {
              address = this.activeBucketToIndexMap.get(fallbackBucket) || -1;
              bucketZoomStep = fallbackBucket.zoomedAddress[3];
              abortFallbackLoop = true;
            } else {
              // Try next fallback bucket
              fallbackBucket = fallbackBucket.getFallbackBucket();
            }
          } else {
            abortFallbackLoop = true;
          }
        }
      }

      this.lookUpBuffer[posInBuffer] = address;
      this.lookUpBuffer[posInBuffer + 1] = bucketZoomStep;
    }

    this.lookUpTexture.update(this.lookUpBuffer, 0, 0, lookUpBufferWidth, lookUpBufferWidth);
    this.isRefreshBufferOutOfDate = false;
    window.needsRerender = true;
  }

  _getBucketIndex(bucket: DataBucket): number {
    const bucketPosition = bucket.zoomedAddress;
    const anchorPoint = this.currentAnchorPoint;

    const x = bucketPosition[0] - anchorPoint[0];
    const y = bucketPosition[1] - anchorPoint[1];
    const z = bucketPosition[2] - anchorPoint[2];

    // if (x < 0) console.warn("x should be greater than 0. is currently:", x);
    // if (y < 0) console.warn("y should be greater than 0. is currently:", y);
    // if (z < 0) console.warn("z should be greater than 0. is currently:", z);

    const [sx, sy] = addressSpaceDimensions;

    // prettier-ignore
    return (
      sx * sy * z +
      sx * y +
      x
    );
  }
}
