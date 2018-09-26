// @flow

import update from "immutability-helper";

import type { OxalisState } from "oxalis/store";
import type { Action } from "oxalis/model/actions/actions";

function UserReducer(state: OxalisState, action: Action): OxalisState {
  switch (action.type) {
    case "SET_ACTIVE_USER": {
      return update(state, {
        activeUser: { $set: action.user },
      });
    }
    case "LOGOUT_USER": {
      return update(state, {
        activeUser: { $set: null },
      });
    }

    default:
      return state;
  }
}

export default UserReducer;
