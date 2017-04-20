/*
 * api_v1.js
 * @flow strict
 */

// only relative imports are followed by documentationjs
import _ from "lodash";
import { InputKeyboardNoLoop } from "libs/input";
import OxalisModel from "oxalis/model";
import Store from "oxalis/store";
import Binary from "oxalis/model/binary";
import { updateUserSettingAction, updateDatasetSettingAction } from "oxalis/model/actions/settings_actions";
import { setActiveNodeAction, createCommentAction, deleteNodeAction } from "oxalis/model/actions/skeletontracing_actions";
import { findTreeByNodeId } from "oxalis/model/accessors/skeletontracing_accessor";
import type { Vector3 } from "oxalis/constants";
import type { MappingArray } from "oxalis/model/binary/mappings";
import type { NodeType, UserConfigurationType, DatasetConfigurationType } from "oxalis/store";
import { overwriteAction } from "oxalis/model/helpers/overwrite_action_middleware.js";

/**
 * All tracing related API methods.
 * @class
 */
class TracingApi {

  model: OxalisModel;
 /**
  * @private
  */
  constructor(model: OxalisModel) {
    this.model = model;
  }

 /**
  * Returns the id of the current active node.
  */
  getActiveNodeId(): ?number {
    return Store.getState().skeletonTracing.activeNodeId;
  }

 /**
  * Returns the id of the current active tree.
  */
  getActiveTreeId(): ?number {
    return Store.getState().skeletonTracing.activeTreeId;
  }

 /**
  * Sets the active node given a node id.
  */
  setActiveNode(id: number) {
    if (id == null) {
      throw new Error("Node id is missing.");
    }
    Store.dispatch(setActiveNodeAction(id));
  }

 /**
  * Returns all nodes belonging to a tracing.
  */
  getAllNodes(): Array<NodeType> {
    const { trees } = Store.getState().skeletonTracing;
    return _.flatMap(trees, tree => _.values(tree.nodes));
  }

  /**
   * Deletes the node with nodeId in the tree with treeId
   */
  deleteNode(nodeId: number, treeId: number) {
    Store.dispatch(deleteNodeAction(nodeId, treeId));
  }

 /**
  * Sets the comment for a node.
  *
  * @example
  * const activeNodeId = api.tracing.getActiveNodeId();
  * api.tracing.setCommentForNode("This is a branch point", activeNodeId);
  */
  setCommentForNode(commentText: string, nodeId: number, treeId?: number): void {
    if (commentText == null) {
      throw new Error("Comment text is missing.");
    }
    // Convert nodeId to node
    if (_.isNumber(nodeId)) {
      const tree = treeId != null ?
        Store.getState().skeletonTracing.trees[treeId] :
        findTreeByNodeId(Store.getState().skeletonTracing.trees, nodeId).get();
      if (tree == null) {
        throw Error(`Couldn't find node ${nodeId}.`);
      }
      Store.dispatch(createCommentAction(commentText, nodeId, tree.treeId));
    } else {
      throw Error("Node id is missing.");
    }
  }

 /**
  * Returns the comment for a given node and tree (optional).
  * @param tree - Supplying the tree will provide a performance boost for looking up a comment.
  *
  * @example
  * const comment = api.tracing.getCommentForNode(23);
  *
  * @example // Provide a tree for lookup speed boost
  * const comment = api.tracing.getCommentForNode(23, api.getActiveTreeid());
  */
  getCommentForNode(nodeId: number, treeId?: number): ?string {
    if (nodeId == null) {
      throw new Error("Node id is missing.");
    }
    // Convert treeId to tree
    let tree = null;
    if (treeId != null) {
      tree = Store.getState().skeletonTracing.trees[treeId];
      if (tree == null) {
        throw Error(`Couldn't find tree ${treeId}.`);
      }
      if (tree.nodes[nodeId] == null) {
        throw Error(`Couldn't find node ${nodeId} in tree ${treeId}.`);
      }
    } else {
      tree = _.values(Store.getState().skeletonTracing.trees).find(__ => __.nodes[nodeId] != null);
      if (tree == null) {
        throw Error(`Couldn't find node ${nodeId}.`);
      }
    }
    const comment = tree.comments.find(__ => __.node === nodeId);
    return comment != null ? comment.content : null;
  }

}

/**
 * All binary data / layer related API methods.
 */
class DataApi {

  model: OxalisModel;

  constructor(model: OxalisModel) {
    this.model = model;
  }


  __getLayer(layerName: string): Binary {
    const layer = this.model.getBinaryByName(layerName);
    if (layer === undefined) throw Error(`Layer with name ${layerName} was not found.`);
    return layer;
  }

 /**
  * Returns the names of all available layers of the current tracing.
  */
  getLayerNames(): Array<string> {
    return _.map(this.model.binary, "name");
  }

 /**
  * Sets a mapping for a given layer.
  *
  * @example
  * const position = [123, 123, 123];
  * const segmentId = await api.data.getDataValue("segmentation", position);
  * const treeId = api.tracing.getActiveTreeId();
  * const mapping = {[segmentId]: treeId}
  *
  * api.setMapping("segmentation", mapping);
  */
  setMapping(layerName: string, mapping: MappingArray) {
    const layer = this.__getLayer(layerName);

    layer.cube.setMapping(mapping);
  }

 /**
  * Returns the bounding box for a given layer name.
  */
  getBoundingBox(layerName: string): [Vector3, Vector3] {
    const layer = this.__getLayer(layerName);

    return [layer.lowerBoundary, layer.upperBoundary];
  }

 /**
  * Returns raw binary data for a given layer, position and zoom level.
  *
  * @example // Return the greyscale value for a bucket
  * const position = [123, 123, 123];
  * api.data.getDataValue("binary", position).then((greyscaleColor) => ...);
  *
  * @example // Using the await keyword instead of the promise syntax
  * const greyscaleColor = await api.data.getDataValue("binary", position);
  *
  * @example // Get the segmentation id for a segementation layer
  * const segmentId = await api.data.getDataValue("segmentation", position);
  */
  getDataValue(layerName: string, position: Vector3, zoomStep: number = 0): Promise<number> {
    const layer = this.__getLayer(layerName);
    const bucket = layer.cube.positionToZoomedAddress(position, zoomStep);

    layer.pullQueue.add({ bucket, priority: -1 });
    return Promise.all(layer.pullQueue.pull()).then(() => layer.cube.getDataValue(position));
  }

  /**
   * Returns the dataset's setting for the tracing view.
   * @param key - One of the following keys:
     - segmentationOpacity
     - datasetName
     - fourBit
     - interpolation
     - keyboardDelay
     - layers
     - quality
     - segmentationOpacity
   *
   * @example
   * const segmentationOpacity = api.data.getConfiguration("segmentationOpacity");
   */
  getConfiguration(key: $Keys<DatasetConfigurationType>) {
    return Store.getState().datasetConfiguration[key];
  }

  /**
   * Set the dataset's setting for the tracing view.
   * @param key - Same keys as for getConfiguration()
   *
   * @example
   * api.user.setConfiguration("segmentationOpacity", 20);
   */
  setConfiguration(key: $Keys<DatasetConfigurationType>, value) {
    Store.dispatch(updateDatasetSettingAction(key, value));
  }
}

/**
 * All user configuration related API methods.
 */
class UserApi {

  model: OxalisModel;

  constructor(model: OxalisModel) {
    this.model = model;
  }

 /**
  * Returns the user's setting for the tracing view.
  * @param key - One of the following keys:
    - moveValue
    - moveValue3d
    - rotateValue
    - crosshairSize
    - scaleValue
    - mouseRotateValue
    - clippingDistance
    - clippingDistanceArbitrary
    - dynamicSpaceDirection
    - displayCrosshair
    - scale
    - tdViewDisplayPlanes
    - isosurfaceDisplay
    - isosurfaceBBsize
    - isosurfaceResolution
    - newNodeNewTree
    - inverseX
    - inverseY
    - keyboardDelay
    - firstVisToggle
    - particleSize
    - overrideNodeRadius
    - sortTreesByName
    - sortCommentsAsc
    - sphericalCapRadius
  *
  * @example
  * const keyboardDelay = api.user.getConfiguration("keyboardDelay");
  */
  getConfiguration(key: $Keys<UserConfigurationType>) {
    return Store.getState().userConfiguration[key];
  }

 /**
  * Set the user's setting for the tracing view.
  * @param key - Same keys as for getConfiguration()
  *
  * @example
  * api.user.setConfiguration("keyboardDelay", 20);
  */
  setConfiguration(key: $Keys<UserConfigurationType>, value) {
    Store.dispatch(updateUserSettingAction(key, value));
  }
}


type Handler = {
    unregister(): void,
};

/**
 * Utility API methods to control wK.
 */
class UtilsApi {

  model: OxalisModel;

  constructor(model: OxalisModel) {
    this.model = model;
  }

 /**
  * Wait for some milliseconds before continuing the control flow.
  *
  * @example // Wait for 5 seconds
  * await api.utils.sleep(5000);
  */
  sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

 /**
  * Overwrite existing wK methods.
  * @param {string}  funcName - The method name you wish to override. Must be a skeletonTracing method.
  * @param {function} newFunc - Your new implementation for the method in question. Receives the original function as the first argument
  * and the original parameters in an array as the second argument
  *
  * @example
  * api.registerOverwrite("mergeTree", (oldMergeTreeFunc, args) => {
  *   // ... do stuff before the original function...
  *   oldMergeTreeFunc(...args);
  *   // ... do something after the original function ...
  * });
  */
  // TEST: b = function overwrite(oldFunc, args) {console.log(...args); oldFunc(...args)}
  // webknossos.registerOverwrite("addNode", b)
  // TODO: this should only work for specific methods, that also could not reside in skeletontracing.js
  registerOverwrite(
    functionName: string,
    newFunction: Function,
  ) {
    if (functionName === "addNode") {
      overwriteAction("CREATE_NODE", (store, call, action) => {
        // unpack the arguments for the old style overwrite
        const args = [action.position, action.rotation, null, action.viewport, action.resolution, null];

        newFunction(() => {
          // just dispatch the normal action and ignore the arguments
          call(action);
        }, args);
      });
    } else if (functionName === "deleteActiveNode") {
      overwriteAction("DELETE_NODE", (store, call, action) => {
        newFunction(() => {
          call(action);
        }, []);
      });
    } else {
      throw new Error("You used registerOverwrite in version 1 which is deprecated. This version only supports overwrites for addNode and deleteActiveNode.");
    }
  }

 /**
  * Sets a custom handler function for a keyboard shortcut.
  */
  registerKeyHandler(key: string, handler: () => void): Handler {
    const keyboard = new InputKeyboardNoLoop({ [key]: handler });
    return { unregister: keyboard.destroy.bind(keyboard) };
  }
}


type ApiInterface = {
  tracing: TracingApi,
  data: DataApi,
  user: UserApi,
  utils: UtilsApi,
};

export default function createApiInterface(model: OxalisModel): ApiInterface {
  return {
    tracing: new TracingApi(model),
    data: new DataApi(model),
    user: new UserApi(model),
    utils: new UtilsApi(model),
  };
}