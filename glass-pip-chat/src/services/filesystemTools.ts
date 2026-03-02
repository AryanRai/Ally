/**
 * Filesystem Tools Service
 * Provides MCP-compatible filesystem operations through Electron
 */

interface FileSystemTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (parameters: Record<string, any>) => Promise<any>;
}

export class FilesystemToolsService {
  private tools: Map<string, FileSystemTool> = new Map();

  constructor() {
    this.initializeTools();
  }

  private initializeTools() {
    // List directory contents
    this.tools.set('list_directory', {
      name: 'list_directory',
      description: 'List the contents of a directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory to list'
          }
        },
        required: ['path']
      },
      handler: this.listDirectory.bind(this)
    });

    // Read file contents
    this.tools.set('read_file', {
      name: 'read_file',
      description: 'Read the contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to read'
          }
        },
        required: ['path']
      },
      handler: this.readFile.bind(this)
    });

    // Check if path exists
    this.tools.set('path_exists', {
      name: 'path_exists',
      description: 'Check if a file or directory exists',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to check'
          }
        },
        required: ['path']
      },
      handler: this.pathExists.bind(this)
    });

    // Get file/directory info
    this.tools.set('get_file_info', {
      name: 'get_file_info',
      description: 'Get information about a file or directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to get info for'
          }
        },
        required: ['path']
      },
      handler: this.getFileInfo.bind(this)
    });

    // Execute system command (for rm, mkdir, etc.)
    this.tools.set('execute_command', {
      name: 'execute_command',
      description: 'Execute a system command (use with caution)',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Command to execute'
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments'
          }
        },
        required: ['command']
      },
      handler: this.executeCommand.bind(this)
    });

    // Fetch a URL via Electron's net module (bypasses curl/wget issues)
    this.tools.set('fetch_url', {
      name: 'fetch_url',
      description: 'Fetch a URL and return the response body. Use this instead of curl for HTTP requests.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to fetch'
          },
          method: {
            type: 'string',
            description: 'HTTP method (GET, POST, etc.)',
            default: 'GET'
          },
          headers: {
            type: 'object',
            description: 'Optional request headers'
          },
          body: {
            type: 'string',
            description: 'Optional request body for POST/PUT'
          }
        },
        required: ['url']
      },
      handler: this.fetchUrl.bind(this)
    });

    // Browser tools — require Ally Chrome extension connected
    const browserTools = [
      { name: 'browser_navigate', desc: 'Navigate the browser to a URL', params: { url: 'string' } },
      { name: 'browser_click', desc: 'Click an element by CSS selector or visible text', params: { selector: 'string (optional)', text: 'string (optional)' } },
      { name: 'browser_type', desc: 'Type text into an input field by CSS selector', params: { selector: 'string', text: 'string', append: 'boolean (optional)' } },
      { name: 'browser_read_page', desc: 'Read the current page title, URL, and visible text content', params: { includeLinks: 'boolean (optional)', includeHtml: 'boolean (optional)' } },
      { name: 'browser_screenshot', desc: 'Take a screenshot of the current browser tab', params: {} },
      { name: 'browser_eval', desc: 'Execute JavaScript in the current page context', params: { code: 'string' } },
      { name: 'browser_find_element', desc: 'Find an element on the page by selector or text', params: { selector: 'string (optional)', text: 'string (optional)' } },
      { name: 'browser_scroll', desc: 'Scroll the page or scroll an element into view', params: { x: 'number (optional)', y: 'number (optional)', selector: 'string (optional)' } },
      { name: 'browser_get_tabs', desc: 'List all open browser tabs', params: {} },
      { name: 'browser_switch_tab', desc: 'Switch to a browser tab by URL or title', params: { url: 'string (optional)', title: 'string (optional)', tabId: 'number (optional)' } },
      { name: 'browser_go_back', desc: 'Navigate back in browser history', params: {} },
      { name: 'browser_go_forward', desc: 'Navigate forward in browser history', params: {} },
      { name: 'browser_wait_for', desc: 'Wait for a CSS selector to appear on the page', params: { selector: 'string', timeout: 'number (optional, ms)' } },
      { name: 'browser_get_url', desc: 'Get the current page URL and title', params: {} },
      { name: 'browser_press_key', desc: 'Press a keyboard key (e.g. Enter, Tab, Escape) on the focused or specified element', params: { key: 'string', selector: 'string (optional)' } },
      { name: 'browser_new_tab', desc: 'Open a new browser tab, optionally navigating to a URL', params: { url: 'string (optional)' } },
      { name: 'browser_close_tab', desc: 'Close the current or specified browser tab', params: { tabId: 'number (optional)' } },
    ];

    for (const bt of browserTools) {
      this.tools.set(bt.name, {
        name: bt.name,
        description: bt.desc + '. Requires Ally Browser Extension in Chrome.',
        inputSchema: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(bt.params).map(([k, v]) => [k, { type: 'string', description: v }])
          ),
        },
        handler: async (parameters: Record<string, any>) => this.callBrowserTool(bt.name, parameters),
      });
    }
  }

  private async callBrowserTool(tool: string, parameters: Record<string, unknown>): Promise<any> {
    if (typeof window !== 'undefined' && (window.pip as any)?.browser?.callTool) {
      return await (window.pip as any).browser.callTool(tool, parameters);
    }
    return { success: false, error: 'Browser bridge not available (desktop only)' };
  }

  private async listDirectory(parameters: { path: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const isWin = navigator.platform.toLowerCase().includes('win') || navigator.userAgent.includes('Windows');
        const command = isWin ? 'dir' : 'ls -la';
        const result = await window.pip.system.executeCommand(`${command} "${parameters.path}"`);
        
        return {
          success: true,
          path: parameters.path,
          contents: result.stdout || result.output || 'Directory listing completed',
          error: result.stderr || null
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        path: parameters.path,
        contents: `Demo listing for ${parameters.path}:\n- file1.txt\n- file2.js\n- subfolder/`,
        isEmpty: false
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list directory',
        path: parameters.path
      };
    }
  }

  private async readFile(parameters: { path: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const isWin = navigator.platform.toLowerCase().includes('win') || navigator.userAgent.includes('Windows');
        const command = isWin ? 'type' : 'cat';
        const result = await window.pip.system.executeCommand(`${command} "${parameters.path}"`);
        
        return {
          success: true,
          path: parameters.path,
          content: result.stdout || result.output || '',
          error: result.stderr || null
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        path: parameters.path,
        content: `Demo content of ${parameters.path}`,
        size: 1024
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
        path: parameters.path
      };
    }
  }

  private async pathExists(parameters: { path: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const isWin = navigator.platform.toLowerCase().includes('win') || navigator.userAgent.includes('Windows');
        const command = isWin
          ? `if exist "${parameters.path}" echo EXISTS`
          : `test -e "${parameters.path}" && echo EXISTS || echo NOT_EXISTS`;
        
        const result = await window.pip.system.executeCommand(command);
        const exists = (result.stdout || result.output || '').includes('EXISTS');
        
        return {
          success: true,
          path: parameters.path,
          exists,
          message: exists ? 'Path exists' : 'Path does not exist'
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        path: parameters.path,
        exists: true,
        message: `Demo: ${parameters.path} exists`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check path',
        path: parameters.path
      };
    }
  }

  private async getFileInfo(parameters: { path: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const isWin = navigator.platform.toLowerCase().includes('win') || navigator.userAgent.includes('Windows');
        const command = isWin
          ? `dir "${parameters.path}"`
          : `ls -la "${parameters.path}"`;
        
        const result = await window.pip.system.executeCommand(command);
        
        return {
          success: true,
          path: parameters.path,
          info: result.stdout || result.output || 'File info retrieved',
          error: result.stderr || null
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        path: parameters.path,
        type: 'file',
        size: 1024,
        modified: new Date().toISOString(),
        permissions: 'rw-r--r--'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get file info',
        path: parameters.path
      };
    }
  }

  private async executeCommand(parameters: { command: string; args?: string[] }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.pip?.system) {
        const fullCommand = parameters.args 
          ? `${parameters.command} ${parameters.args.join(' ')}`
          : parameters.command;
        
        console.log(`Executing command: ${fullCommand}`);
        const result = await window.pip.system.executeCommand(fullCommand);
        
        return {
          success: true,
          command: fullCommand,
          stdout: result.stdout || result.output || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode || 0
        };
      }
      
      // Fallback for demo
      return {
        success: true,
        command: parameters.command,
        stdout: `Demo execution of: ${parameters.command}`,
        stderr: '',
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Command execution failed',
        command: parameters.command
      };
    }
  }

  private async fetchUrl(parameters: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<any> {
    try {
      if (typeof window !== 'undefined' && (window.pip?.system as any)?.fetchUrl) {
        const result = await (window.pip.system as any).fetchUrl(parameters.url, {
          method: parameters.method,
          headers: parameters.headers,
          body: parameters.body,
        });
        return result;
      }
      // Fallback: try native fetch (works in web mode)
      const response = await fetch(parameters.url, {
        method: parameters.method || 'GET',
        headers: parameters.headers,
        body: parameters.body,
      });
      const body = await response.text();
      return { success: true, status: response.status, body };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Fetch failed',
        url: parameters.url,
      };
    }
  }

  /**
   * Get all available filesystem tools
   */
  getAvailableTools(): Array<{
    name: string;
    description: string;
    inputSchema: any;
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  /**
   * Execute a filesystem tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Filesystem tool '${toolName}' not found`);
    }

    try {
      console.log(`Executing filesystem tool: ${toolName}`, parameters);
      const result = await tool.handler(parameters);
      console.log(`Filesystem tool result:`, result);
      return result;
    } catch (error) {
      console.error(`Filesystem tool execution failed:`, error);
      throw error;
    }
  }

  /**
   * Check if a tool is available
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }
}

// Singleton instance
let filesystemToolsService: FilesystemToolsService | null = null;

export function getFilesystemToolsService(): FilesystemToolsService {
  if (!filesystemToolsService) {
    filesystemToolsService = new FilesystemToolsService();
  }
  return filesystemToolsService;
}