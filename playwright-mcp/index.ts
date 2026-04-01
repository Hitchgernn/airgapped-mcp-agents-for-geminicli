// 1. MUST BE AT THE VERY TOP: Force Playwright to use local binaries
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, type Browser, type Page } from "playwright";

// Global Playwright state
let browser: Browser | null = null;
let page: Page | null = null;

function getRequiredUrl(args: unknown): string {
  if (!args || typeof args !== "object") {
    throw new Error('Missing arguments object for "url"');
  }

  const url = (args as Record<string, unknown>).url;
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error('"url" must be a non-empty string');
  }

  return url;
}

const server = new Server(
  {
    name: "playwright-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "Maps_and_capture",
        description: "Navigates to a URL, returning the DOM structure and a screenshot.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The target URL (e.g., https://example.com)" },
          },
          required: ["url"],
        },
      }
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "Maps_and_capture") {
    const url = getRequiredUrl(args);

    try {
      // Initialize browser lazily
      if (!browser) {
        // 2. CRITICAL SANDBOX FLAGS
        browser = await chromium.launch({ 
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        const context = await browser.newContext();
        page = await context.newPage();
      }

      await page!.goto(url, { waitUntil: "networkidle" });

      // Extract DOM
      const domContent = await page!.evaluate(() => document.body.innerText);
      
      // Capture base64 screenshot
      const screenshotBuffer = await page!.screenshot({ type: "jpeg", quality: 60 });
      const screenshotBase64 = screenshotBuffer.toString("base64");

      // Return data securely to the CLI
      return {
        content: [
          {
            type: "text",
            text: `Mapped to ${url}. Extracted Text Content:\n${domContent.substring(0, 5000)}...`,
          },
          {
            type: "image",
            data: screenshotBase64,
            mimeType: "image/jpeg",
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error navigating to ${url}: ${String(error)}` }],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  if (browser) await browser.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (browser) await browser.close();
  process.exit(0);
});

// Start the server over Stdio
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Playwright MCP Server running securely on stdio");
}

run().catch(console.error);
