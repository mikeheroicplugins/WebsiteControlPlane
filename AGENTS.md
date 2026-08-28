# GeekHeros control-plane instructions

- Preserve MCP feature parity as a standing requirement. Every new dashboard tool, API capability, or control-plane operation must be exposed through `agent/mcp.mjs` in the same change.
- Update `controlPlaneMcpToolCount` whenever MCP tools are added or removed.
- Before handing off a feature, verify MCP authentication, tool discovery, and at least one representative call for every new capability family.
