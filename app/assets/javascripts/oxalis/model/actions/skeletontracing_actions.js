/* eslint-disable import/prefer-default-export */

/**
 * skeletontracing_actions.js
 * @flow
 */
import type { Vector3 } from "oxalis/constants";
import type { Tracing } from "oxalis/model";
import type { SkeletonContentDataType } from "oxalis/store";

type InitializeSkeletonTracingActionType = {type: "INITIALIZE_SKELETONTRACING", tracing: Tracing<SkeletonContentDataType> };
type CreateNodeActionType = {type: "CREATE_NODE", position: Vector3, rotation: Vector3, viewport: number, resolution: number, treeId?: number};
type DeleteNodeActionType = {type: "DELETE_NODE", nodeId?: number, treeId?: number};
type SetActiveNodeActionType = {type: "SET_ACTIVE_NODE", nodeId: number};
type SetActiveNodeRadiusActionType = {type: "SET_ACTIVE_NODE_RADIUS", radius: number};
type CreateBranchPointActionType = {type: "CREATE_BRANCHPOINT", nodeId?: number, treeId?: number};
type DeleteBranchPointActionType = {type: "DELETE_BRANCHPOINT"};
type CreateTreeActionType = {type: "CREATE_TREE"};
type DeleteTreeActionType = {type: "DELETE_TREE", treeId?: number};
type SetActiveTreeActionType = {type: "SET_ACTIVE_TREE", treeId: number};
type MergeTreesActionType = {type: "MERGE_TREES", sourceNodeId: number, targetNodeId: number};
type SetTreeNameActionType = {type: "SET_TREE_NAME", treeId?: number, name: ?string};
type SelectNextTreeActionType = {type: "SELECT_NEXT_TREE", forward: ?boolean};
type ShuffleTreeColorActionType = {type: "SHUFFLE_TREE_COLOR", treeId?: number};
type CreateCommentActionType = {type: "CREATE_COMMENT", commentText: string, nodeId: ?number};
type DeleteCommentActionType = {type: "DELETE_COMMENT", nodeId: ?number, treeId?: number};
type SetVersionNumberActionType = {type: "SET_VERSION_NUMBER", version: number};

export type SkeletonTracingActionTypes = (InitializeSkeletonTracingActionType | CreateNodeActionType | DeleteNodeActionType | SetActiveNodeActionType | SetActiveNodeRadiusActionType | CreateBranchPointActionType | DeleteBranchPointActionType | CreateTreeActionType | DeleteTreeActionType | SetActiveTreeActionType | MergeTreesActionType | SetTreeNameActionType | SetTreeNameActionType | SelectNextTreeActionType | ShuffleTreeColorActionType | CreateCommentActionType | DeleteCommentActionType | SetVersionNumberActionType);
export const SkeletonTracingActions = [
  "INITIALIZE_SKELETONTRACING",
  "CREATE_NODE",
  "DELETE_NODE",
  "SET_ACTIVE_NODE",
  "SET_ACTIVE_NODE_RADIUS",
  "CREATE_BRANCHPOINT",
  "DELETE_BRANCHPOINT",
  "CREATE_TREE",
  "DELETE_TREE",
  "SET_ACTIVE_TREE",
  "SET_TREE_NAME",
  "MERGE_TREES",
  "SELECT_NEXT_TREE",
  "SHUFFLE_TREE_COLOR",
  "CREATE_COMMENT",
  "DELETE_COMMENT",
];

export const initializeSkeletonTracingAction = (tracing: Tracing<SkeletonContentDataType>): InitializeSkeletonTracingActionType => ({
  type: "INITIALIZE_SKELETONTRACING",
  tracing,
});

export const createNodeAction = (position: Vector3, rotation: Vector3, viewport: number, resolution: number, treeId?: number): CreateNodeActionType => ({
  type: "CREATE_NODE",
  position,
  rotation,
  viewport,
  resolution,
  treeId,
});

export const deleteNodeAction = (nodeId?: number, treeId?: number): DeleteNodeActionType => ({
  type: "DELETE_NODE",
  nodeId,
  treeId,
});

export const setActiveNodeAction = (nodeId: number): SetActiveNodeActionType => ({
  type: "SET_ACTIVE_NODE",
  nodeId,
});

export const setActiveNodeRadiusAction = (radius: number): SetActiveNodeRadiusActionType => ({
  type: "SET_ACTIVE_NODE_RADIUS",
  radius,
});

export const createBranchPointAction = (nodeId?: number, treeId?: number): CreateBranchPointActionType => ({
  type: "CREATE_BRANCHPOINT",
  nodeId,
  treeId,
});

export const deleteBranchPointAction = (): DeleteBranchPointActionType => ({
  type: "DELETE_BRANCHPOINT",
});

export const createTreeAction = (): CreateTreeActionType => ({
  type: "CREATE_TREE",
});

export const deleteTreeAction = (treeId?: number): DeleteTreeActionType => ({
  type: "DELETE_TREE",
  treeId,
});

export const setActiveTreeAction = (treeId: number): SetActiveTreeActionType => ({
  type: "SET_ACTIVE_TREE",
  treeId,
});

export const mergeTreesAction = (sourceNodeId: number, targetNodeId: number): MergeTreesActionType => ({
  type: "MERGE_TREES",
  sourceNodeId,
  targetNodeId,
});

export const setTreeNameAction = (name: ?string = null, treeId?: number): SetTreeNameActionType => ({
  type: "SET_TREE_NAME",
  name,
  treeId,
});

export const selectNextTreeAction = (forward: ?boolean = true): SelectNextTreeActionType => ({
  type: "SELECT_NEXT_TREE",
  forward,
});

export const shuffleTreeColorAction = (treeId: number): ShuffleTreeColorActionType => ({
  type: "SHUFFLE_TREE_COLOR",
  treeId,
});

export const createCommentAction = (commentText: string, nodeId?: number, treeId?: number): CreateCommentActionType => ({
  type: "CREATE_COMMENT",
  commentText,
  nodeId,
  treeId,
});

export const deleteCommentAction = (nodeId?: number, treeId?: number): DeleteCommentActionType => ({
  type: "DELETE_COMMENT",
  nodeId,
  treeId,
});

export const setVersionNumber = (version: number): SetVersionNumberActionType => ({
  type: "SET_VERSION_NUMBER",
  version,
});
