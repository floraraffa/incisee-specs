import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {DC1_ScanFrameAndCamera} from "./DC1_ScanFrameAndCamera"
import {DC2_CaptureAndSend} from "./DC2_CaptureAndSend"
import {DC3_ResultCardScoreTags} from "./DC3_ResultCardScoreTags"
import {DC4_SensitiveAltSource} from "./DC4_SensitiveAltSource"
import {DC5_CloseNextAndUnreadable} from "./DC5_CloseNextAndUnreadable"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "dc1-scan-frame-and-camera", typename: DC1_ScanFrameAndCamera.getTypeName()},
    {id: "dc2-capture-and-send", typename: DC2_CaptureAndSend.getTypeName()},
    {id: "dc3-result-card-score-tags", typename: DC3_ResultCardScoreTags.getTypeName()},
    {id: "dc4-sensitive-alt-source", typename: DC4_SensitiveAltSource.getTypeName()},
    {id: "dc5-close-next-and-unreadable", typename: DC5_CloseNextAndUnreadable.getTypeName()},
  ]
}
