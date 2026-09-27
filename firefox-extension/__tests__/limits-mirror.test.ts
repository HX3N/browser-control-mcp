import * as common from "@browser-control-mcp/common/limits";
import * as server from "../../mcp-server/limits";

describe("limits both sides enforce", () => {
  it("are the same in the server's copy as in common", () => {
    expect({ ...server }).toEqual({ ...common });
  });
});
