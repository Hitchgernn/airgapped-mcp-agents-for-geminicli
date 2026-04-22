import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE_DIR = process.cwd(); 

const server = new Server(
  { name: "filesystem-mcp-secure", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

function getSafePath(requestedPath: string): string {
  const resolvedPath = path.resolve(WORKSPACE_DIR, requestedPath);
  const relativePath = path.relative(WORKSPACE_DIR, resolvedPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Security Violation: Agent attempted to break out of workspace -> ${requestedPath}`);
  }
  return resolvedPath;
}

function getRequiredString(args: unknown, key: string): string {
  if (!args || typeof args !== "object") {
    throw new Error(`Missing arguments object for "${key}"`);
  }

  const value = (args as Record<string, unknown>)[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`"${key}" must be a non-empty string`);
  }

  return value;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_directory",
        description: "Lists all files and folders in a given directory path within the workspace.",
        inputSchema: {
          type: "object",
          properties: { dirPath: { type: "string", description: "Path relative to workspace root (e.g., '.', './src')" } },
          required: ["dirPath"],
        },
      },
      {
        name: "read_file",
        description: "Reads the text content of a file.",
        inputSchema: {
          type: "object",
          properties: { filePath: { type: "string", description: "Path to the file to read." } },
          required: ["filePath"],
        },
      },
      {
        name: "write_file",
        description: "Creates or overwrites a file with new text content.",
        inputSchema: {
          type: "object",
          properties: { 
            filePath: { type: "string", description: "Path to the file." },
            content: { type: "string", description: "The text content to write." }
          },
          required: ["filePath", "content"],
        },
      },
      {
        name: "delete_file",
        description: "Deletes a file from the workspace.",
        inputSchema: {
          type: "object",
          properties: { filePath: { type: "string", description: "Path to the file to delete." } },
          required: ["filePath"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "list_directory") {
      const dirPath =
        args && typeof args === "object" && typeof (args as Record<string, unknown>).dirPath === "string"
          ? (args as Record<string, string>).dirPath
          : ".";
      const safePath = getSafePath(dirPath);
      const files = await fs.readdir(safePath);
      return { content: [{ type: "text", text: `Contents of ${safePath}:\n${files.join("\n")}` }] };
    }

    if (name === "read_file") {
      const safePath = getSafePath(getRequiredString(args, "filePath"));
      const content = await fs.readFile(safePath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    }

    if (name === "write_file") {
      const safePath = getSafePath(getRequiredString(args, "filePath"));
      const content = getRequiredString(args, "content");
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, "utf-8");
      return { content: [{ type: "text", text: `Successfully wrote to ${safePath}` }] };
    }

    if (name === "delete_file") {
      const safePath = getSafePath(getRequiredString(args, "filePath"));
      await fs.unlink(safePath);
      return { content: [{ type: "text", text: `Successfully deleted ${safePath}` }] };
    }

    throw new Error(`Unknown tool: ${name}`);

  } catch (error) {
    return {
      content: [{ type: "text", text: `Filesystem Error: ${String(error)}` }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure Filesystem MCP Server running on stdio");
}

run().catch(console.error);
