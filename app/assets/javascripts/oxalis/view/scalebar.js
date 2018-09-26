// @flow

import * as React from "react";
import { connect } from "react-redux";
import constants, { OUTER_BORDER_ORTHO } from "oxalis/constants";
import type { OxalisState, Flycam } from "oxalis/store";
import { calculateZoomLevel, formatZoomLevel } from "oxalis/view/right-menu/dataset_info_tab_view";
import type { APIDataset } from "admin/api_flow_types";

type Props = {|
  dataset: APIDataset,
  flycam: Flycam,
|};

const scalebarWidthPercentage = 0.25;

function Scalebar({ flycam, dataset }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "1%",
        right: "1%",
        // The scalebar should have a width of 25% from the actual viewport (without the borders)
        width: `calc(25% - ${Math.round(
          ((2 * OUTER_BORDER_ORTHO) / constants.VIEWPORT_WIDTH) * 100,
        )}%)`,
        height: 14,
        background: "rgba(0, 0, 0, .3)",
        color: "white",
        textAlign: "center",
        fontSize: 12,
        lineHeight: "14px",
        boxSizing: "content-box",
        padding: 4,
      }}
    >
      <div
        style={{
          borderBottom: "1px solid",
          borderLeft: "1px solid",
          borderRight: "1px solid",
        }}
      >
        {formatZoomLevel(calculateZoomLevel(flycam, dataset) * scalebarWidthPercentage)}
      </div>
    </div>
  );
}

const mapStateToProps = (state: OxalisState): Props => ({
  flycam: state.flycam,
  dataset: state.dataset,
});

export default connect(mapStateToProps)(Scalebar);
