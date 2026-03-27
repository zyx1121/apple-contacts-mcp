import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerContactTools } from "./tools/contacts.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "apple-contacts",
    version: "0.1.0",
  });

  registerContactTools(server);

  return server;
}
